/**
 * End-to-end verification of the data layer against a real browser.
 *
 * Serves the production build with `vite preview`, drives it with Playwright over
 * the installed Chrome, and asserts against the actual network log rather than
 * assumptions:
 *
 *   1. the eager bundle is fetched once at boot (bytes + timing)
 *   2. opening a species fetches exactly that version group's two partitions
 *   3. returning to an already-loaded version group fetches nothing
 *   4. offline reload still boots and still resolves a previously visited group
 *
 * Scenario-level checks for the Pokedex UI itself live in verify-pokedex.mjs;
 * this file stays focused on the data layer and the service worker.
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

const GROUP_A = 'heartgold-soulsilver' // largest partitions, and the app default
const GROUP_B = 'red-blue'
const NEVER_VISITED = 'emerald'
const SPECIES = 80 // Slowbro: present in every generation

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
      if ((await fetch(url, { redirect: 'follow' })).ok) return
    } catch {
      /* server not up yet */
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

  const selectGroup = async (name) => {
    await page.selectOption('[data-testid="vg-select"]', name)
    await page.waitForFunction(
      (n) => document.querySelector('[data-testid="scope-note"]')?.textContent?.includes(n),
      name,
      { timeout: 30000 },
    )
  }
  /** Wait for any in-flight partition load to finish rendering. */
  const settle = () =>
    page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="learnset-loading"]') &&
        !document.querySelector('[data-testid="encounters-loading"]'),
      undefined,
      { timeout: 60000 },
    )

  // ---------------------------------------------------------------- STEP 1
  hr('STEP 1 — first load: eager bundle')
  const navStart = Date.now()
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="boot-ms"]', { timeout: 60000 })
  const wallMs = Date.now() - navStart

  log(`  app-reported boot    : ${await page.textContent('[data-testid="boot-ms"]')}`)
  log(`  decoded bytes        : ${await page.textContent('[data-testid="boot-bytes"]')}`)
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

  await selectGroup(GROUP_A)
  const listCount = (await page.textContent('[data-testid="list-count"]')).trim()
  log('')
  log(`  species listed under ${GROUP_A}: ${listCount}`)
  check('full dex of 493 species is indexed', listCount.startsWith('493'), listCount)

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
  hr(`STEP 3 — open a species under "${GROUP_A}": expect exactly 1 fetch per partition`)
  let before = mark()
  await page.click(`[data-testid="species-row-${SPECIES}"]`)
  await page.waitForSelector('[data-testid="species-detail"]', { timeout: 30000 })
  await settle()
  let newReqs = requests.slice(before)
  const aLearn = newReqs.filter((r) => r.url.includes(`/data/learnsets/${GROUP_A}.json`))
  const aEnc = newReqs.filter((r) => r.url.includes(`/data/encounters/${GROUP_A}.json`))
  const learnWire = await wireBytes(`${ORIGIN}/pokeapp/data/learnsets/${GROUP_A}.json`)
  const encWire = await wireBytes(`${ORIGIN}/pokeapp/data/encounters/${GROUP_A}.json`)
  log(
    `  learnsets/${GROUP_A}.json  requests=${aLearn.length}  wire=${kib(learnWire.bytes)} (${learnWire.enc})`,
  )
  log(
    `  encounters/${GROUP_A}.json requests=${aEnc.length}  wire=${kib(encWire.bytes)} (${encWire.enc})`,
  )
  log(`  combined wire cost for this group: ${kib(learnWire.bytes + encWire.bytes)}`)
  log(
    `  learnset rows rendered: ${await page.getAttribute('[data-testid="learnset"]', 'data-total-rows')}`,
  )
  check(`exactly 1 fetch for learnsets/${GROUP_A}.json`, aLearn.length === 1, `(${aLearn.length})`)
  check(`exactly 1 fetch for encounters/${GROUP_A}.json`, aEnc.length === 1, `(${aEnc.length})`)
  const otherPartitions = newReqs.filter(
    (r) => /\/data\/(learnsets|encounters)\//.test(r.url) && !r.url.includes(`${GROUP_A}.json`),
  )
  check('no other partition files fetched', otherPartitions.length === 0)

  // ---------------------------------------------------------------- STEP 4
  hr(`STEP 4 — switch to "${GROUP_B}" then back: expect 0 refetches for ${GROUP_A}`)
  before = mark()
  await selectGroup(GROUP_B)
  await settle()
  newReqs = requests.slice(before)
  const bLearn = newReqs.filter((r) => r.url.includes(`/data/learnsets/${GROUP_B}.json`))
  const bEnc = newReqs.filter((r) => r.url.includes(`/data/encounters/${GROUP_B}.json`))
  log(`  ${GROUP_B}: learnsets=${bLearn.length} fetch(es), encounters=${bEnc.length} fetch(es)`)
  check(`exactly 1 fetch for learnsets/${GROUP_B}.json`, bLearn.length === 1)
  check(`exactly 1 fetch for encounters/${GROUP_B}.json`, bEnc.length === 1)

  before = mark()
  await selectGroup(GROUP_A)
  await settle()
  newReqs = requests.slice(before)
  const refetch = newReqs.filter((r) => /\/data\//.test(r.url))
  log(`  returning to ${GROUP_A}: ${refetch.length} data request(s)`)
  refetch.forEach((r) => log(`    unexpected: ${r.url}`))
  check(`returning to ${GROUP_A} triggers 0 data fetches`, refetch.length === 0)

  // ---------------------------------------------------------------- STEP 5
  hr('STEP 5 — offline reload')
  const cacheReport = await page.evaluate(async () => {
    const out = {}
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys()
      out[name] = {
        total: keys.length,
        partitions: keys.filter((k) => /\/data\/(learnsets|encounters)\//.test(k.url)).length,
      }
    }
    return out
  })
  for (const [name, info] of Object.entries(cacheReport)) {
    log(`  cache "${name}": ${info.total} entries, ${info.partitions} partition file(s)`)
  }

  await context.setOffline(true)
  log('  context is now OFFLINE')

  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-testid="boot-ms"]', { timeout: 60000 })
  log(`  booted OFFLINE in ${await page.textContent('[data-testid="boot-ms"]')}`)
  check('app boots offline', true)

  await selectGroup(GROUP_A)
  const offlineCount = (await page.textContent('[data-testid="list-count"]')).trim()
  check('eager bundle resolves offline (493 species)', offlineCount.startsWith('493'), offlineCount)

  await page.click(`[data-testid="species-row-${SPECIES}"]`)
  await page.waitForSelector('[data-testid="species-detail"]', { timeout: 30000 })
  await settle()
  const offlineRows = await page.getAttribute('[data-testid="learnset"]', 'data-total-rows')
  log(`  offline ${GROUP_A} learnset rows for #${SPECIES}: ${offlineRows}`)
  check(`${GROUP_A} partitions resolve offline`, Number(offlineRows) > 0, `(${offlineRows} rows)`)

  // A group never visited online must NOT be available offline — proves the
  // partitions really are cache-on-first-use rather than precached.
  await selectGroup(NEVER_VISITED)
  await page.waitForSelector('[data-testid="species-detail"] [role="alert"]', { timeout: 30000 })
  const alert = await page.textContent('[data-testid="species-detail"] [role="alert"]')
  log(`  offline "${NEVER_VISITED}" (never visited online) -> ${JSON.stringify(alert)}`)
  check(
    `un-visited group "${NEVER_VISITED}" is NOT available offline (confirms on-demand caching)`,
    (alert ?? '').length > 0,
  )

  hr('SUMMARY')
  if (failures.length === 0) log('  ALL CHECKS PASSED')
  else {
    log(`  ${failures.length} FAILED:`)
    failures.forEach((f) => log(`    - ${f}`))
  }
} finally {
  if (browser) await browser.close()
  preview.kill()
}

process.exit(failures.length ? 1 : 0)
