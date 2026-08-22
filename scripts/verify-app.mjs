/**
 * End-to-end verification of the data layer against a real browser.
 *
 * Serves the production build with `vite preview`, drives it with Playwright over
 * the installed Chrome, and asserts against the actual network log rather than
 * assumptions:
 *
 *   1. the eager bundle is fetched once at boot (bytes + timing)
 *   2. selecting a version group fetches exactly its two partition files
 *   3. re-selecting it fetches nothing (in-memory cache)
 *   4. offline reload still boots and still resolves that group (service worker)
 *
 * Usage: node scripts/verify-app.mjs
 */

import { spawn } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { chromium } from 'playwright'

const PORT = 4178
const ORIGIN = `http://localhost:${PORT}`
const APP_URL = `${ORIGIN}/pokeapp/`

const EAGER = [
  'species.json',
  'moves.json',
  'items.json',
  'abilities.json',
  'natures.json',
  'berries.json',
  'types.json',
  'egg-groups.json',
  'evolution-chains.json',
  'locations.json',
  'meta.json',
  'version-groups.json',
]

const GROUP_A = 'heartgold-soulsilver' // largest partitions
const GROUP_B = 'red-blue'

const failures = []
const log = (...a) => console.log(...a)
const hr = (t) => {
  log('')
  log('='.repeat(78))
  log(t)
  log('='.repeat(78))
}
function check(label, ok, detail = '') {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const kib = (b) => (b == null ? 'n/a' : `${(b / 1024).toFixed(1)} KiB`)

/**
 * Transferred (compressed) byte count for a URL, straight off the socket.
 *
 * Needed because `vite preview` streams these responses chunked with no
 * content-length, and Playwright's request().sizes() reports a sentinel for
 * service-worker-mediated responses.
 */
function wireBytes(url) {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { headers: { 'accept-encoding': 'gzip, deflate, br' } }, (res) => {
      let bytes = 0
      res.on('data', (chunk) => {
        bytes += chunk.length
      })
      res.on('end', () => resolve({ bytes, enc: res.headers['content-encoding'] ?? 'none' }))
    })
    req.on('error', reject)
  })
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) return
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server did not become ready at ${url}`)
}

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
)

let browser
try {
  await waitForServer(APP_URL)
  log(`preview server ready at ${APP_URL}`)

  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext()
  const page = await context.newPage()

  /** Every request the page makes, with transferred body size once complete. */
  const requests = []
  page.on('request', (req) => {
    requests.push({ url: req.url(), method: req.method(), bytes: null, status: null, enc: null })
  })
  page.on('response', async (res) => {
    const entry = requests.find((r) => r.url === res.url() && r.status === null)
    if (!entry) return
    entry.status = res.status()
    const headers = res.headers()
    entry.enc = headers['content-encoding'] ?? null
    // content-length is the transferred (post-compression) size on a static server.
    // request().sizes() returns a sentinel for service-worker-mediated responses,
    // so only trust it when it is positive and no header is available.
    const declared = Number(headers['content-length'])
    if (Number.isFinite(declared) && declared > 0) {
      entry.bytes = declared
    } else {
      try {
        const sizes = await res.request().sizes()
        entry.bytes = sizes.responseBodySize > 0 ? sizes.responseBodySize : null
      } catch {
        entry.bytes = null
      }
    }
  })
  const dataRequests = (needle) =>
    requests.filter((r) => r.url.includes(needle) && r.method === 'GET')
  const mark = () => requests.length

  // ---------------------------------------------------------------- STEP 1
  hr('STEP 1 — first load: eager bundle')
  const navStart = Date.now()
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="boot-ms"]', { timeout: 60000 })
  const wallMs = Date.now() - navStart

  const bootMs = await page.textContent('[data-testid="boot-ms"]')
  const bootBytes = await page.textContent('[data-testid="boot-bytes"]')
  log(`  app-reported boot   : ${bootMs} / ${bootBytes} decoded`)
  log(`  wall clock nav->ready: ${wallMs} ms`)

  let eagerTransferred = 0
  log('')
  log('  eager file requests (transferred body bytes):')
  for (const f of EAGER) {
    const hits = dataRequests(`/data/${f}`)
    const bytes = hits.reduce((n, h) => n + (h.bytes ?? 0), 0)
    eagerTransferred += bytes
    log(
      `    ${f.padEnd(24)} requests=${hits.length}  ${kib(bytes).padStart(11)}  ` +
        `status=${hits.map((h) => h.status).join(',')}  enc=${hits[0]?.enc ?? 'none'}`,
    )
    check(`${f} fetched exactly once`, hits.length === 1)
  }
  log(`    ${'TOTAL'.padEnd(24)} ${kib(eagerTransferred).padStart(24)}`)

  const partitionsAtBoot = requests.filter((r) => /\/data\/(learnsets|encounters)\//.test(r.url))
  check(
    'no partition files fetched at boot',
    partitionsAtBoot.length === 0,
    `(${partitionsAtBoot.length} seen)`,
  )

  const counts = await page.$$eval('.stats li', (els) =>
    Object.fromEntries(
      els.map((el) => [
        el.querySelector('span').textContent,
        el.querySelector('strong').textContent,
      ]),
    ),
  )
  log('')
  log(`  indexed counts: ${JSON.stringify(counts)}`)
  check('species index has 493 entries', counts.species === '493', `(got ${counts.species})`)

  // ---------------------------------------------------------------- STEP 2
  hr('STEP 2 — service worker activation')
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    // `ready` resolves as soon as there is an active worker, which can still be in
    // the 'activating' state; wait for it to finish before reporting.
    const deadline = Date.now() + 20000
    while (reg.active && reg.active.state !== 'activated' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
        setTimeout(resolve, 15000)
      })
    }
    return {
      scope: reg.scope,
      active: reg.active?.state ?? null,
      controlled: !!navigator.serviceWorker.controller,
      caches: await caches.keys(),
    }
  })
  log(`  scope      : ${swState.scope}`)
  log(`  active     : ${swState.active}`)
  log(`  controlling: ${swState.controlled}`)
  log(`  cache names: ${swState.caches.join(', ')}`)
  check('service worker is active', swState.active === 'activated')
  check('service worker controls the page', swState.controlled === true)

  // ---------------------------------------------------------------- STEP 3
  hr(`STEP 3 — select "${GROUP_A}": expect exactly 1 fetch per partition file`)
  let before = mark()
  await page.click(`[data-testid="vg-${GROUP_A}"]`)
  await page.waitForSelector('[data-testid="group-view"]', { timeout: 60000 })
  await page.waitForFunction(
    (g) => document.querySelector('[data-testid="group-name"]')?.textContent === g,
    GROUP_A,
    { timeout: 60000 },
  )
  let newReqs = requests.slice(before)
  const aLearn = newReqs.filter((r) => r.url.includes(`/data/learnsets/${GROUP_A}.json`))
  const aEnc = newReqs.filter((r) => r.url.includes(`/data/encounters/${GROUP_A}.json`))
  const learnWire = await wireBytes(`${ORIGIN}/pokeapp/data/learnsets/${GROUP_A}.json`)
  const encWire = await wireBytes(`${ORIGIN}/pokeapp/data/encounters/${GROUP_A}.json`)
  log(
    `  learnsets/${GROUP_A}.json  requests=${aLearn.length}  ` +
      `wire=${kib(learnWire.bytes)} (${learnWire.enc})`,
  )
  log(
    `  encounters/${GROUP_A}.json requests=${aEnc.length}  ` +
      `wire=${kib(encWire.bytes)} (${encWire.enc})`,
  )
  log(`  combined wire cost for this group: ${kib(learnWire.bytes + encWire.bytes)}`)
  log(`  group stats in UI: ${await page.textContent('[data-testid="group-stats"]')}`)
  log(
    `  rows: learnsets=${await page.textContent('[data-testid="learnset-count"]')} ` +
      `encounters=${await page.textContent('[data-testid="encounter-count"]')}`,
  )
  check(`exactly 1 fetch for learnsets/${GROUP_A}.json`, aLearn.length === 1, `(${aLearn.length})`)
  check(`exactly 1 fetch for encounters/${GROUP_A}.json`, aEnc.length === 1, `(${aEnc.length})`)
  const otherPartitions = newReqs.filter(
    (r) => /\/data\/(learnsets|encounters)\//.test(r.url) && !r.url.includes(`${GROUP_A}.json`),
  )
  check('no other partition files fetched', otherPartitions.length === 0)

  // ---------------------------------------------------------------- STEP 4
  hr(`STEP 4 — select "${GROUP_B}", then back to "${GROUP_A}": expect 0 refetches`)
  before = mark()
  await page.click(`[data-testid="vg-${GROUP_B}"]`)
  await page.waitForFunction(
    (g) => document.querySelector('[data-testid="group-name"]')?.textContent === g,
    GROUP_B,
    { timeout: 60000 },
  )
  newReqs = requests.slice(before)
  const bLearn = newReqs.filter((r) => r.url.includes(`/data/learnsets/${GROUP_B}.json`))
  const bEnc = newReqs.filter((r) => r.url.includes(`/data/encounters/${GROUP_B}.json`))
  log(`  ${GROUP_B}: learnsets=${bLearn.length} fetch(es), encounters=${bEnc.length} fetch(es)`)
  check(`exactly 1 fetch for learnsets/${GROUP_B}.json`, bLearn.length === 1)
  check(`exactly 1 fetch for encounters/${GROUP_B}.json`, bEnc.length === 1)

  before = mark()
  await page.click(`[data-testid="vg-${GROUP_A}"]`)
  await page.waitForFunction(
    (g) => document.querySelector('[data-testid="group-name"]')?.textContent === g,
    GROUP_A,
    { timeout: 60000 },
  )
  newReqs = requests.slice(before)
  const refetch = newReqs.filter((r) => /\/data\//.test(r.url))
  log(
    `  re-selecting ${GROUP_A}: ${refetch.length} data request(s) — ${await page.textContent('[data-testid="group-stats"]')}`,
  )
  if (refetch.length) refetch.forEach((r) => log(`    unexpected: ${r.url}`))
  check(`re-selecting ${GROUP_A} triggers 0 data fetches`, refetch.length === 0)
  log(`  in memory: ${await page.textContent('[data-testid="loaded-groups"]')}`)

  // ---------------------------------------------------------------- STEP 5
  hr('STEP 5 — offline reload')
  const cacheReport = await page.evaluate(async () => {
    const out = {}
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys()
      out[name] = keys.map((k) => new URL(k.url).pathname).sort()
    }
    return out
  })
  for (const [name, keys] of Object.entries(cacheReport)) {
    const partitions = keys.filter((k) => /\/data\/(learnsets|encounters)\//.test(k))
    log(`  cache "${name}": ${keys.length} entries, ${partitions.length} partition file(s)`)
    partitions.forEach((p) => log(`    ${p}`))
  }

  await context.setOffline(true)
  log('  context is now OFFLINE')

  const offlineFailures = []
  page.on('requestfailed', (req) =>
    offlineFailures.push(`${req.url()} :: ${req.failure()?.errorText}`),
  )

  before = mark()
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-testid="boot-ms"]', { timeout: 60000 })
  const offlineBoot = await page.textContent('[data-testid="boot-ms"]')
  const offlineBytes = await page.textContent('[data-testid="boot-bytes"]')
  log(`  booted OFFLINE in ${offlineBoot} / ${offlineBytes} decoded`)
  check('app boots offline', true)

  const offlineCounts = await page.$$eval('.stats li', (els) =>
    Object.fromEntries(
      els.map((el) => [
        el.querySelector('span').textContent,
        el.querySelector('strong').textContent,
      ]),
    ),
  )
  check(
    'eager bundle resolves offline (493 species)',
    offlineCounts.species === '493',
    `(got ${offlineCounts.species})`,
  )

  await page.click(`[data-testid="vg-${GROUP_A}"]`)
  await page.waitForFunction(
    (g) => document.querySelector('[data-testid="group-name"]')?.textContent === g,
    GROUP_A,
    { timeout: 60000 },
  )
  const offLearn = await page.textContent('[data-testid="learnset-count"]')
  const offEnc = await page.textContent('[data-testid="encounter-count"]')
  log(`  offline ${GROUP_A}: learnsets=${offLearn} rows, encounters=${offEnc} rows`)
  check(`${GROUP_A} learnsets resolve offline`, Number(offLearn) > 0, `(${offLearn} rows)`)
  check(`${GROUP_A} encounters resolve offline`, Number(offEnc) > 0, `(${offEnc} rows)`)

  // A group never visited online must NOT be available offline — proves the
  // partitions really are cache-on-first-use rather than precached.
  const NEVER_VISITED = 'emerald'
  await page.click(`[data-testid="vg-${NEVER_VISITED}"]`)
  await page.waitForTimeout(2500)
  const neverState = await page.evaluate(
    (g) => ({
      name: document.querySelector('[data-testid="group-name"]')?.textContent ?? null,
      loading: !!document.querySelector('[data-testid="group-loading"]'),
      target: g,
    }),
    NEVER_VISITED,
  )
  log(
    `  offline "${NEVER_VISITED}" (never visited online): resolved=${neverState.name === NEVER_VISITED}, still loading=${neverState.loading}`,
  )
  check(
    `un-visited group "${NEVER_VISITED}" is NOT available offline (confirms on-demand caching)`,
    neverState.name !== NEVER_VISITED,
  )

  if (offlineFailures.length) {
    log('')
    log(
      `  network failures while offline (${offlineFailures.length}) — expected for un-cached files:`,
    )
    offlineFailures.slice(0, 8).forEach((f) => log(`    ${f}`))
  }

  hr('SUMMARY')
  if (failures.length === 0) {
    log('  ALL CHECKS PASSED')
  } else {
    log(`  ${failures.length} FAILED:`)
    failures.forEach((f) => log(`    - ${f}`))
  }
} finally {
  if (browser) await browser.close()
  preview.kill()
}

process.exit(failures.length ? 1 : 0)
