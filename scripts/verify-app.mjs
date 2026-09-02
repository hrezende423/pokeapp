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
import { controls } from './lib/controls.mjs'

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
    await withControls(() => page.selectOption('[data-testid="vg-select"]', name))
    // The scope readout was removed from the page with the header block. The
    // select holds the same state the list derives from, and both land in one
    // React commit, so waiting for its value is waiting for the list.
    await page.waitForFunction(
      (n) => document.querySelector('[data-testid="vg-select"]')?.value === n,
      name,
      { timeout: 30000 },
    )
  }
  /** Wait for any in-flight partition load to finish rendering. */
  const settle = () =>
    page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="learnset-loading"]') &&
        !document.querySelector('[data-testid="locations-loading"]'),
      undefined,
      { timeout: 60000 },
    )

  /*
    WHICH TAB TRIGGERS WHICH FETCH is the thing that changed under the rebuilt
    detail page, and it is a real improvement worth stating: opening a species now
    fetches NOTHING. Only one tab is mounted at a time, so the learnset partition
    loads when the Learnset tab opens and the encounter partition when Description
    does. The old page mounted both and fired both on open.
  */
  const openSpecies = async (id) => {
    await page.click(`[data-testid="species-row-${id}"]`)
    await page.waitForSelector(`[data-testid="species-page"][data-species-id="${id}"]`, {
      timeout: 30000,
    })
    await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  }

  const openTab = async (tab) => {
    await page.click(`[data-testid="species-page-subnav"] .ds-tab:text-is("${tab}")`)
    await page.waitForSelector(`[data-testid="species-page-panel-${tab.toLowerCase()}"]`, {
      timeout: 30000,
    })
    await settle()
  }

  /**
   * Open the Info tab and scroll its locations section into view.
   *
   * WHICH TAB PULLS THE ENCOUNTER PARTITION MOVED. It used to be Description;
   * locations now live on the Info tab, under the stat and evolution charts. And
   * because Info is the DEFAULT tab, that section deliberately does not fetch
   * until it is scrolled to -- otherwise every species open would pull ALL FOURTEEN
   * encounter partitions, 9.6 MiB raw, for a visit that only wanted the stat line,
   * which is the exact cost the one-tab-at-a-time rule exists to avoid. The
   * section is game-agnostic now, so that gate went from important to essential.
   *
   * So the trigger for that partition is now a scroll, not a click, and this is
   * what performs it. `data-loaded` is the section's own record of having been
   * reached, so this waits on the app's state rather than on a timeout.
   */
  const revealLocations = async () => {
    await openTab('Info')
    await page.waitForSelector('[data-testid="species-locations"]', { timeout: 30000 })
    await page.$eval('[data-testid="species-locations"]', (el) =>
      el.scrollIntoView({ block: 'center' }),
    )
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="species-locations"]')?.dataset.loaded === 'true' &&
        !document.querySelector('[data-testid="locations-loading"]'),
      { timeout: 120000 },
    )
    await settle()
  }

  /** Point the page's OWN game scope at a version group, by generation then game. */
  const selectPageGroup = async (testId, generation, group) => {
    await page.click(`[data-testid="${testId}-scope-generation-${generation}"]`)
    const gameBtn = `[data-testid="${testId}-scope-game-${group}"]`
    if (await page.$(gameBtn)) await page.click(gameBtn)
    /* .species-description no longer carries data-version-group -- the tab has no
       game scope at all now that it shows every game's entry. The learnset is the
       only page-scoped partition left, so it is the only thing to wait on. */
    await page.waitForFunction(
      (g) =>
        document
          .querySelector('[data-testid="species-learnset"]')
          ?.getAttribute('data-version-group') === g,
      group,
      { timeout: 30000 },
    )
    await settle()
  }

  /** Total learnset rows currently rendered, across the method sections. */
  const learnsetRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.species-learn-group')].reduce(
        (n, e) => n + Number(e.getAttribute('data-rows')),
        0,
      ),
    )

  // ---------------------------------------------------------------- STEP 1
  hr('STEP 1 — first load: eager bundle')
  const navStart = Date.now()
  await page.goto(APP_URL, { waitUntil: 'load' })

  const { withControls } = controls(page)
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
  // Counted from the rows themselves rather than a rendered label: the label is
  // gone, and the rows were always the thing it was describing.
  const listCount = await page.$$eval(
    '[data-testid="species-rows"] [data-species-id]',
    (e) => e.length,
  )
  log('')
  log(`  species listed under ${GROUP_A}: ${listCount}`)
  check('full dex of 493 species is indexed', listCount === 493, String(listCount))

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
  await openSpecies(SPECIES)
  const onOpen = requests
    .slice(before)
    .filter((r) => /\/data\/(learnsets|encounters)\//.test(r.url))
  log(`  partition fetches on opening the species: ${onOpen.length} (the Info tab needs none)`)
  check('opening a species fetches no partition at all', onOpen.length === 0, `(${onOpen.length})`)

  /*
    Each partition is pulled by exactly one trigger: the learnset by opening the
    Learnset tab, the encounters by scrolling the Info tab down to the locations
    section. Both are on-demand; only the trigger differs -- and the encounters
    are ALL FOURTEEN files, because that section shows every game.
  */
  await openTab('Learnset')
  await revealLocations()
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
  await openTab('Learnset')
  log(`  learnset rows rendered: ${await learnsetRows()}`)
  check(`exactly 1 fetch for learnsets/${GROUP_A}.json`, aLearn.length === 1, `(${aLearn.length})`)
  check(`exactly 1 fetch for encounters/${GROUP_A}.json`, aEnc.length === 1, `(${aEnc.length})`)
  /*
    EVERY ENCOUNTER PARTITION, EACH EXACTLY ONCE -- which is a change, and the
    reason for it is that the locations section is game-agnostic by request. What
    still has to hold is the de-duplication: fourteen files pulled in parallel by
    one Promise.allSettled must not become twenty-eight, and the loader's
    `inflight` map is what prevents that. A repeat count here would be a real
    regression hiding behind an unchanged row count.

    THE LEARNSET SIDE IS UNCHANGED and is asserted separately: exactly one
    learnset file, the selected one. If the two datasets' scoping ever got
    conflated, this is the check that would say so.
  */
  const encFetched = newReqs
    .filter((r) => /\/data\/encounters\//.test(r.url))
    .map((r) => r.url.split('/').pop())
  const encCounts = new Map()
  for (const f of encFetched) encCounts.set(f, (encCounts.get(f) ?? 0) + 1)
  const encWireAll = (
    await Promise.all(
      [...encCounts.keys()].map((f) => wireBytes(`${ORIGIN}/pokeapp/data/encounters/${f}`)),
    )
  ).reduce((n, r) => n + r.bytes, 0)
  log(
    `  encounters: ${encCounts.size} distinct files, ${encFetched.length} requests, ${kib(encWireAll)} on the wire`,
  )
  check(
    'the locations section pulls every encounter partition',
    encCounts.size === 14,
    `(${encCounts.size} of 14)`,
  )
  check(
    'and each of them exactly once, not once per component',
    [...encCounts.values()].every((n) => n === 1),
    [...encCounts.entries()]
      .filter(([, n]) => n !== 1)
      .map(([f, n]) => `${f}x${n}`)
      .join(' ') || 'all once',
  )
  const otherLearnsets = newReqs.filter(
    (r) => /\/data\/learnsets\//.test(r.url) && !r.url.includes(`${GROUP_A}.json`),
  )
  check('no learnset partition but the selected one', otherLearnsets.length === 0)

  // ---------------------------------------------------------------- STEP 4
  hr(`STEP 4 — switch to "${GROUP_B}" then back: expect 0 refetches for ${GROUP_A}`)
  /*
    TWO CONTROLS AND ONE DATASET THAT ANSWERS TO NEITHER, which is the point.

    The learnset follows the PAGE's own generation control, by design. The Info
    tab's locations section follows NOTHING: it is game-agnostic by request, so it
    has already loaded all fourteen encounter partitions and no selector on either
    control can make it want another one.

    That is what turns the encounter assertions in this step into ZEROES, and they
    are worth keeping as zeroes rather than deleting: a refetch after a selector
    change would mean the section had quietly become scope-dependent again, which
    is exactly the regression the game-agnostic change could suffer.
  */
  before = mark()
  await selectPageGroup('learnset', 1, GROUP_B)
  await openTab('Learnset')
  newReqs = requests.slice(before)
  const bLearn = newReqs.filter((r) => r.url.includes(`/data/learnsets/${GROUP_B}.json`))
  const bEncFromPage = newReqs.filter((r) => r.url.includes(`/data/encounters/${GROUP_B}.json`))
  log(`  page control -> ${GROUP_B}: learnsets=${bLearn.length}, encounters=${bEncFromPage.length}`)
  check(`exactly 1 fetch for learnsets/${GROUP_B}.json`, bLearn.length === 1)
  check(
    'the page control does NOT move the encounter partition',
    bEncFromPage.length === 0,
    `(${bEncFromPage.length})`,
  )

  before = mark()
  await selectGroup(GROUP_B)
  await revealLocations()
  newReqs = requests.slice(before)
  const bEncAll = newReqs.filter((r) => /\/data\/encounters\//.test(r.url))
  log(`  app selector -> ${GROUP_B}: ${bEncAll.length} encounter fetch(es)`)
  check(
    'moving the app selector fetches no encounter partition at all',
    bEncAll.length === 0,
    bEncAll.map((r) => r.url.split('/').pop()).join(' ') || '(0)',
  )

  before = mark()
  await selectGroup(GROUP_A)
  // The page control lives on the Learnset tab, so that tab has to be the one on
  // screen to reach it -- one tab is mounted at a time.
  await openTab('Learnset')
  await selectPageGroup('learnset', 4, GROUP_A)
  await revealLocations()
  newReqs = requests.slice(before)
  const refetch = newReqs.filter((r) => /\/data\//.test(r.url))
  log(`  returning to ${GROUP_A} on both controls: ${refetch.length} data request(s)`)
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
  const offlineCount = await page.$$eval(
    '[data-testid="species-rows"] [data-species-id]',
    (e) => e.length,
  )
  check('eager bundle resolves offline (493 species)', offlineCount === 493, String(offlineCount))

  await openSpecies(SPECIES)
  await openTab('Learnset')
  const offlineRows = await learnsetRows()
  log(`  offline ${GROUP_A} learnset rows for #${SPECIES}: ${offlineRows}`)
  check(`${GROUP_A} partitions resolve offline`, offlineRows > 0, `(${offlineRows} rows)`)

  // A group never visited online must NOT be available offline — proves the
  // partitions really are cache-on-first-use rather than precached. Asked for
  // through the page's own control, which is what selects a partition now.
  await page.click('[data-testid="learnset-scope-generation-3"]')
  const neverBtn = `[data-testid="learnset-scope-game-${NEVER_VISITED}"]`
  if (await page.$(neverBtn)) await page.click(neverBtn)
  await page.waitForSelector('[data-testid="species-page"] [role="alert"]', { timeout: 30000 })
  const alert = await page.textContent('[data-testid="species-page"] [role="alert"]')
  log(`  offline "${NEVER_VISITED}" (never visited online) -> ${JSON.stringify(alert)}`)
  check(
    `un-visited group "${NEVER_VISITED}" is NOT available offline (confirms on-demand caching)`,
    (alert ?? '').length > 0,
  )

  // ==================================================================
  // THEME — OS default, explicit override, and persistence across reload
  // ==================================================================
  /*
    PERSISTENCE IS ASSERTED THROUGH A REAL RELOAD, not by reading localStorage
    after a click. The version-group selector shipped with exactly that gap --
    it looked right in-session and did not survive a reload -- so "the value is in
    storage" is not the claim worth making here. page.reload() and re-read is.

    Fresh contexts are used for the first-visit cases because a Playwright context
    is the storage boundary: reusing the one above would carry a stored choice into
    a test that is specifically about there being none. colorScheme is set per
    context (and flipped mid-page with emulateMedia) so both OS preferences are
    exercised rather than whichever one this machine happens to have.
  */
  hr('THEME — OS default, explicit override, persistence')

  const themeState = (p) =>
    p.evaluate(() => {
      const sw = document.querySelector('[data-testid="theme-switcher"]')
      let stored = 'UNREADABLE'
      try {
        stored = localStorage.getItem('pokeapp:theme')
      } catch {
        /* storage disabled; the app must still work */
      }
      return {
        attr: document.documentElement.dataset.theme ?? null,
        value: sw?.dataset.themeValue ?? null,
        source: sw?.dataset.themeSource ?? null,
        lightPressed: document.querySelector('[data-testid="theme-light"]')?.ariaPressed ?? null,
        darkPressed: document.querySelector('[data-testid="theme-dark"]')?.ariaPressed ?? null,
        stored,
        /*
          :root, not body. body is transparent here -- index.css paints the page
          background on :root via --bg -- so reading body reported rgba(0,0,0,0)
          for every theme and the assertion could never have failed.

          Both tokens are read because they come from different files and were the
          actual bug: --bg from index.css (once OS-keyed, now data-theme) and
          --surface from design-tokens.css. They must now agree about the theme.
        */
        bg: getComputedStyle(document.documentElement).backgroundColor,
        varBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
        varSurface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
        barBg: (() => {
          const bar = document.querySelector('.app-bar')
          return bar ? getComputedStyle(bar).backgroundColor : null
        })(),
      }
    })

  /** The two palettes' page-background values, for an exact both-ways assertion. */
  const PAGE_BG = { light: '#fff', dark: '#16171d' }
  const SURFACE = { light: '#fafafa', dark: '#141414' }

  const freshThemePage = async (colorScheme) => {
    const ctx = await browser.newContext({ colorScheme })
    const p = await ctx.newPage()
    await p.goto(APP_URL, { waitUntil: 'load' })
    await p.waitForSelector('[data-testid="theme-switcher"]', { timeout: 60000 })
    return { ctx, p }
  }

  // ---- first visit, nothing stored: follow the OS, both directions ----
  for (const os of ['dark', 'light']) {
    const { ctx, p } = await freshThemePage(os)
    const s = await themeState(p)
    log(`  first visit, OS=${os}: ${JSON.stringify(s)}`)
    check(`first visit with OS ${os} follows the OS`, s.attr === os && s.value === os)
    check(
      `  and reports source=system with nothing stored`,
      s.source === 'system' && s.stored === null,
    )
    check(
      `  and the ${os} segment is the pressed one`,
      (os === 'dark' ? s.darkPressed : s.lightPressed) === 'true' &&
        (os === 'dark' ? s.lightPressed : s.darkPressed) === 'false',
      `light=${s.lightPressed} dark=${s.darkPressed}`,
    )
    check(
      `  and both palettes agree on ${os}`,
      s.varBg === PAGE_BG[os] && s.varSurface === SURFACE[os],
      `--bg=${s.varBg} --surface=${s.varSurface}`,
    )
    await ctx.close()
  }

  // ---- explicit choice beats the OS, survives reload, survives a new tab ----
  const { ctx: themeCtx, p: themePage } = await freshThemePage('light')
  const lightBg = (await themeState(themePage)).bg

  await themePage.click('[data-testid="theme-dark"]')
  await themePage.waitForFunction(
    () => document.documentElement.dataset.theme === 'dark',
    undefined,
    { timeout: 5000 },
  )
  let s = await themeState(themePage)
  log(`  after choosing Dark on a light OS: ${JSON.stringify(s)}`)
  check('an explicit choice overrides a light OS', s.attr === 'dark' && s.value === 'dark')
  check('the switcher reports source=user', s.source === 'user')
  check('the choice is persisted', s.stored === 'dark')
  check('the pill state follows the theme', s.darkPressed === 'true' && s.lightPressed === 'false')
  check('and the painted colours actually changed', s.bg !== lightBg, `${lightBg} -> ${s.bg}`)
  check(
    '  including the PAGE background, not just the surfaces',
    s.varBg === PAGE_BG.dark && s.varSurface === SURFACE.dark,
    `--bg=${s.varBg} --surface=${s.varSurface}`,
  )

  await themePage.reload({ waitUntil: 'load' })
  await themePage.waitForSelector('[data-testid="theme-switcher"]', { timeout: 60000 })
  s = await themeState(themePage)
  log(`  after a real reload: ${JSON.stringify(s)}`)
  check('A RELOAD PRESERVES the explicit choice', s.attr === 'dark' && s.value === 'dark')
  check('  still attributed to the user, not the OS', s.source === 'user')

  const secondTab = await themeCtx.newPage()
  await secondTab.goto(APP_URL, { waitUntil: 'load' })
  await secondTab.waitForSelector('[data-testid="theme-switcher"]', { timeout: 60000 })
  const tabState = await themeState(secondTab)
  log(`  a new tab in the same profile: ${JSON.stringify(tabState)}`)
  check(
    'a new tab opens on the stored choice',
    tabState.attr === 'dark' && tabState.source === 'user',
  )
  await secondTab.close()

  // ---- an OS change must not silently undo the user ----
  await themePage.emulateMedia({ colorScheme: 'dark' })
  await themePage.waitForTimeout(200)
  await themePage.click('[data-testid="theme-light"]')
  await themePage.waitForFunction(
    () => document.documentElement.dataset.theme === 'light',
    undefined,
    { timeout: 5000 },
  )
  await themePage.emulateMedia({ colorScheme: 'dark' })
  await themePage.waitForTimeout(200)
  s = await themeState(themePage)
  log(`  explicit light, OS flipped to dark mid-session: ${JSON.stringify(s)}`)
  check('an OS change does NOT override an explicit choice', s.attr === 'light')

  await themePage.reload({ waitUntil: 'load' })
  await themePage.waitForSelector('[data-testid="theme-switcher"]', { timeout: 60000 })
  s = await themeState(themePage)
  log(`  explicit light on a dark OS, after reload: ${JSON.stringify(s)}`)
  check('explicit light beats a dark OS across a reload', s.attr === 'light' && s.value === 'light')
  /*
    index.css still carries a legacy `@media (prefers-color-scheme: dark)` block
    that redefines --bg and friends off the OS, with no data-theme involvement.
    design-tokens.css is imported after it and redeclares the same properties, so
    the override wins -- but that is load-order luck, not design, and this is the
    assertion that would catch it if the import order ever changed.
  */
  check(
    '  and the LIGHT palette is what is painted, page background included',
    s.varBg === PAGE_BG.light && s.varSurface === SURFACE.light,
    `--bg=${s.varBg} --surface=${s.varSurface} html=${s.bg} bar=${s.barBg}`,
  )
  check(
    '  so the page frame and the app bar cannot disagree about the theme',
    s.bg === 'rgb(255, 255, 255)' && s.barBg === 'rgb(250, 250, 250)',
    `html=${s.bg} bar=${s.barBg}`,
  )
  await themeCtx.close()

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
