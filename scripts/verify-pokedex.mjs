/**
 * Scenario verification for the Pokedex module.
 *
 * Serves the production build with `vite preview`, drives it with Playwright over
 * the installed Chrome, and asserts each lettered scenario from the spec against
 * the real DOM and the real network log.
 *
 * Caching is measured with a CDP Network session rather than Playwright's request
 * events. requestWillBeSent and responseReceived are joined by requestId so each
 * fetch attempt for a URL can be classified as a real network fetch or a cache
 * hit -- a request EVENT is not a fetch, since Chrome fires one for cache hits
 * too, and counting events as fetches is what made the artwork-caching assertion
 * flaky. See the comment on attemptsFor. The Cache Storage contents are then read
 * directly from the page, so "cached after" is proven rather than inferred.
 *
 * THE DETAIL VIEW IS THE REBUILT TABBED PAGE. The old rail-plus-cards view and
 * the ?detail flag that gated its replacement are both gone, so every assertion
 * that used to read the old page's testids has been re-pointed at the tab that
 * owns that fact now -- Info for the era-resolved fields, Learnset for the moves,
 * Description for the encounters, Sprites for the four-axis artwork control. Two
 * claims changed rather than moved, and both are commented where they appear: the
 * learnset follows the page's own generation control rather than the app-wide
 * selector, and the artwork control has a fifth switch.
 *
 * Usage: node scripts/verify-pokedex.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'

const PORT = 4179
const APP_URL = `http://localhost:${PORT}/pokeapp/`
const SHOTS = 'scripts/.verify-shots'

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

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server never became ready at ${url}`)
}

mkdirSync(SHOTS, { recursive: true })

/**
 * Classify one fetch attempt from its CDP response event.
 *
 * Pure, and outside the browser block on purpose: the shapes that matter are
 * asserted below against recorded events from a real failing run, so the fix is
 * proven against the input that actually broke rather than only against whichever
 * shape this machine happens to produce today.
 *
 * `fromServiceWorker` is NOT the discriminator. With the CacheFirst runtime
 * handler it is true both for the first fetch (the SW goes to the network and
 * caches the result) and for later ones (the SW answers from Cache Storage). Bytes
 * on the wire is the discriminator; fromDiskCache is a second, independent signal
 * of the same thing.
 */
function classifyAttempt(res) {
  if (!res) return { kind: 'pending', bytes: 0, disk: null, sw: null }
  const cached = res.fromDiskCache || res.encodedDataLength === 0
  return {
    kind: cached ? 'cache' : 'network',
    bytes: res.encodedDataLength,
    disk: res.fromDiskCache,
    sw: res.fromServiceWorker,
  }
}

hr('CACHE ATTRIBUTION — the classifier, against recorded events')
/*
  These are the two response events verbatim from the run where the old assertion
  failed: one real fetch, then a disk-cache hit. The old code counted both as
  requests and reported "2", which is the flake. Both shapes are pinned here so a
  future edit cannot quietly reintroduce it.
*/
const RECORDED = {
  'real network fetch': [
    { fromDiskCache: false, fromServiceWorker: true, encodedDataLength: 214708 },
    'network',
  ],
  'disk-cache hit (the flake)': [
    { fromDiskCache: true, fromServiceWorker: true, encodedDataLength: 0 },
    'cache',
  ],
  'service-worker cache hit, no disk flag': [
    { fromDiskCache: false, fromServiceWorker: true, encodedDataLength: 0 },
    'cache',
  ],
  'response not yet received': [undefined, 'pending'],
}
for (const [label, [event, expected]] of Object.entries(RECORDED)) {
  const got = classifyAttempt(event).kind
  check(`${label} classifies as "${expected}"`, got === expected, `got "${got}"`)
}
const recordedRun = [RECORDED['real network fetch'][0], RECORDED['disk-cache hit (the flake)'][0]]
  .map(classifyAttempt)
  .filter((a) => a.kind === 'network').length
check(
  'the recorded failing run now counts as exactly 1 network fetch',
  recordedRun === 1,
  `(${recordedRun})`,
)

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
)

let browser
try {
  await waitForServer(APP_URL)
  log(`preview ready at ${APP_URL}`)

  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext()
  const page = await context.newPage()

  // ---- console / page error capture -------------------------------------
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  /*
    ---- CDP network capture with cache attribution ------------------------

    A REQUEST EVENT IS NOT A NETWORK FETCH. Chrome fires requestWillBeSent for
    every fetch the page initiates, including ones answered from the HTTP disk
    cache or by the service worker without touching the network. Counting those
    events to prove "fetched once" therefore counts cache hits as fetches, which
    is what made the shiny-artwork assertion flaky: whether the second view was
    reported as a disk-cache hit or never reached the network at all depended on
    timing, so the count came out 1 or 2 run to run.

    Requests and responses are joined by requestId so each attempt can be
    classified. fromServiceWorker alone cannot separate them -- with the CacheFirst
    runtime handler it is true for BOTH the first fetch (SW goes to the network and
    caches) and later ones (SW answers from Cache Storage). What does separate them
    is bytes on the wire: the real fetch reports encodedDataLength in the hundreds
    of KB, a cache hit reports 0, and a disk-cache hit additionally sets
    fromDiskCache.
  */
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const responses = []
  const requested = []
  cdp.on('Network.requestWillBeSent', (e) => {
    requested.push({ requestId: e.requestId, url: e.request.url })
  })
  cdp.on('Network.responseReceived', (e) => {
    responses.push({
      requestId: e.requestId,
      url: e.response.url,
      status: e.response.status,
      fromDiskCache: e.response.fromDiskCache === true,
      fromServiceWorker: e.response.fromServiceWorker === true,
      encodedDataLength: e.response.encodedDataLength ?? 0,
    })
  })

  /**
   * Every fetch attempt for one exact URL, classified as network or cache.
   *
   * An attempt with no response event yet is counted as pending rather than
   * silently dropped -- a fetch in flight is not evidence of a cache hit.
   */
  const attemptsFor = (url) =>
    requested
      .filter((r) => r.url === url)
      .map((r) => classifyAttempt(responses.find((x) => x.requestId === r.requestId)))
  /** Fetches that actually put bytes on the wire. */
  const networkFetches = (url) => attemptsFor(url).filter((a) => a.kind === 'network').length

  const selectVersionGroup = async (name) => {
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
  /*
    THE DETAIL VIEW IS NOW THE REBUILT TABBED PAGE. `?detail` and the old
    rail-plus-cards view are gone, so opening a species lands on the Info tab and
    anything per-game lives one tab click away. No learnset wait here: the Info
    tab loads no partition, which is the point of mounting one tab at a time.
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
  }

  const backToGrid = async () => {
    if ((await page.$('[data-testid="species-page-back"]')) == null) return
    await page.click('[data-testid="species-page-back"]')
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
  }

  /** Wait for the Learnset tab to finish loading whichever partition it wants. */
  const learnsetReady = () =>
    page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
      timeout: 60000,
    })

  /** Levels a move is learned at, from the level-up section of the Learnset tab. */
  const levelsFor = (moveId) =>
    page.$$eval(`[data-testid="species-learn-level-up"] [data-move-id="${moveId}"]`, (els) =>
      els.map((e) => e.getAttribute('data-level')),
    )
  const rowIds = () =>
    page.$$eval('[data-testid="species-rows"] [data-species-id]', (els) =>
      els.map((e) => Number(e.getAttribute('data-species-id'))),
    )
  const rowNames = () =>
    page.$$eval('[data-testid="species-rows"] .species-name', (els) =>
      els.map((e) => e.textContent.trim()),
    )

  await page.goto(APP_URL, { waitUntil: 'load' })

  const { withControls } = controls(page)
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // ------------------------------------------------------------ SCENARIO 1
  hr('SCENARIO 1 — version-group selection drives the app, updates open detail in place')
  const optionCount = await page.$$eval('[data-testid="vg-select"] option', (o) => o.length)
  const optgroups = await page.$$eval('[data-testid="vg-select"] optgroup', (g) =>
    g.map((x) => x.getAttribute('label')),
  )
  log(`  selector options : ${optionCount}`)
  log(`  option groups    : ${optgroups.join(', ')}`)
  const groupedOptions = await page.$$eval(
    '[data-testid="vg-select"] optgroup option',
    (o) => o.length,
  )
  log(`  options inside optgroups: ${groupedOptions} (+1 ungrouped "All")`)
  check('selector offers all 14 version groups', groupedOptions === 14, `(${groupedOptions})`)
  check('plus one ungrouped "All" option', optionCount === 15, `(${optionCount} total)`)
  check('grouped by generation (4 optgroups)', optgroups.length === 4, `(${optgroups.length})`)

  /*
    WHAT THE APP SELECTOR DRIVES ON THE NEW PAGE, and what it no longer does.

    It still re-resolves every era-sensitive field of an OPEN page in place --
    types, abilities, base stats, the matchup chart. It no longer drives the
    learnset, because the Learnset tab has its own species-local generation
    control by design; that axis is proved in SCENARIO E through the control that
    actually owns it.

    Abilities are the sharpest probe available here: they did not exist before Gen
    3, so a HGSS -> Gold/Silver switch has to empty the row on a page that never
    reloaded.
  */
  await selectVersionGroup('heartgold-soulsilver')
  await openSpecies(80) // Slowbro
  const gen4Abilities = await page.$$eval('[data-testid^="species-ability-"]', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  await selectVersionGroup('gold-silver')
  await page.waitForSelector('[data-testid="abilities-none"]', { timeout: 30000 })
  const gen2Abilities = await page.$$eval('[data-testid^="species-ability-"]', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  const gen2Note = await page.textContent('[data-testid="abilities-none"]')
  const stillOpen = await page.getAttribute('[data-testid="species-page"]', 'data-species-id')
  log(`  Slowbro abilities in heartgold-soulsilver: ${JSON.stringify(gen4Abilities)}`)
  log(`  Slowbro abilities in gold-silver         : ${JSON.stringify(gen2Abilities)}`)
  log(`  Gen 2 note: ${JSON.stringify(gen2Note)}`)
  log(`  detail page still open on species: ${stillOpen} (no re-navigation)`)
  check('an open detail page follows the version-group switch', gen4Abilities.length > 0)
  check('and Gen 2 correctly has none', gen2Abilities.length === 0)
  check('with a reason rather than an empty row', /None in Gen 2/.test(gen2Note))
  check('same detail page stayed open', stillOpen === '80')
  await page.screenshot({ path: `${SHOTS}/scenario1-vg-switch.png`, fullPage: false })

  // ------------------------------------------------------------ SCENARIO E
  hr('SCENARIO E — the learnset is the generation the PAGE asks for')
  /*
    Driven through the Learnset tab's own control, which is what owns this axis
    now. Headbutt on Slowbro separates the eras cleanly: level 25 in
    HeartGold/SoulSilver, level 34 in Gold/Silver.
  */
  await selectVersionGroup('heartgold-soulsilver')
  await openTab('Learnset')
  await learnsetReady()
  const hgssHeadbutt = await levelsFor(29)
  const hgssLevels = await page.$$eval(
    '[data-testid="species-learn-level-up"] [data-level]',
    (els) =>
      [...new Set(els.map((e) => e.getAttribute('data-level')))].map(Number).sort((a, b) => a - b),
  )
  const methodSections = await page.$$eval('.species-learn-group', (els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )
  const seeded = await page.getAttribute('[data-testid="species-learnset"]', 'data-version-group')

  // Same page, same species: only the page-local scope moves.
  await page.click('[data-testid="learnset-scope-generation-2"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="species-learnset"]')
        ?.getAttribute('data-version-group') === 'crystal',
    { timeout: 30000 },
  )
  await page.click('[data-testid="learnset-scope-game-gold-silver"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="species-learnset"]')
        ?.getAttribute('data-version-group') === 'gold-silver',
    { timeout: 30000 },
  )
  await learnsetReady()
  const gsHeadbutt = await levelsFor(29)
  const appStillHgss = await page.$eval('[data-testid="vg-select"]', (el) => el.value)

  log(`  scope seeded from the app selection : ${seeded}`)
  log(`  Headbutt level in HGSS       : [${hgssHeadbutt.join(', ')}]`)
  log(`  Headbutt level in Gold/Silver: [${gsHeadbutt.join(', ')}]`)
  log(`  method sections present      : ${methodSections.join(', ')}`)
  log(`  level-up levels (first 12)   : ${hgssLevels.slice(0, 12).join(', ')}`)
  check('the tab seeds from the app selection', seeded === 'heartgold-soulsilver')
  check('Headbutt is level 25 under heartgold-soulsilver', hgssHeadbutt.includes('25'))
  check('Headbutt is NOT level 34 under heartgold-soulsilver', !hgssHeadbutt.includes('34'))
  check('Headbutt is level 34 under gold-silver', gsHeadbutt.includes('34'))
  check('learnset is grouped by method', methodSections.length >= 2, methodSections.join('/'))
  check('and the app-wide selector was not moved by it', appStillHgss === 'heartgold-soulsilver')
  await page.screenshot({ path: `${SHOTS}/scenarioE-learnset.png` })
  await backToGrid()

  // ------------------------------------------------------------ SCENARIO A
  hr('SCENARIO A — red-blue lists only ids 1-151')
  await selectVersionGroup('red-blue')
  const rbIds = await rowIds()
  log(
    `  rows            : ${rbIds.length}  min id ${Math.min(...rbIds)}  max id ${Math.max(...rbIds)}`,
  )
  log(`  ids >= 152      : ${rbIds.filter((i) => i >= 152).length}`)
  check('exactly 151 species listed', rbIds.length === 151, `(${rbIds.length})`)
  check('no species with id >= 152', rbIds.filter((i) => i >= 152).length === 0)
  check('max id is 151', Math.max(...rbIds) === 151)
  await page.screenshot({ path: `${SHOTS}/scenarioA-gen1-list.png` })

  // ------------------------------------------------------------ SCENARIO B
  hr('SCENARIO B — search "char" narrows to the Charmander line')
  await withControls(() => page.fill('[data-testid="species-search"]', 'char'))
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length < 151,
    undefined,
    { timeout: 15000 },
  )
  const charNames = await rowNames()
  const charIds = await rowIds()
  log(`  results: ${charNames.join(', ')}  (ids ${charIds.join(', ')})`)
  check(
    'search returns exactly Charmander/Charmeleon/Charizard',
    charNames.join(',') === 'Charmander,Charmeleon,Charizard',
    charNames.join(','),
  )
  // Case-insensitivity and partial matching
  await withControls(() => page.fill('[data-testid="species-search"]', 'CHAR'))
  const upperNames = await rowNames()
  check('search is case-insensitive', upperNames.join(',') === charNames.join(','))
  await page.screenshot({ path: `${SHOTS}/scenarioB-search.png` })

  // ------------------------------------------------------------ SCENARIO C
  hr('SCENARIO C — type filter is OR across selected types')
  await withControls(() => page.fill('[data-testid="species-search"]', ''))
  await withControls(() => page.click('[data-testid="type-filter-fire"]'))
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length < 151,
    undefined,
    { timeout: 15000 },
  )
  const fireRows = await page.$$eval('[data-testid="species-rows"] li', (els) =>
    els
      .filter((e) => e.querySelector('[data-species-id]'))
      .map((e) => ({
        name: e.querySelector('.species-name').textContent.trim(),
        types: [...e.querySelectorAll('[data-type]')].map((t) => t.getAttribute('data-type')),
      })),
  )
  log(`  fire-only: ${fireRows.length} species`)
  log(`    ${fireRows.map((r) => `${r.name}[${r.types.join('/')}]`).join(', ')}`)
  check(
    'every fire-filtered row has the fire type',
    fireRows.every((r) => r.types.includes('fire')),
  )

  await withControls(() => page.click('[data-testid="type-filter-water"]'))
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length > n,
    fireRows.length,
    { timeout: 15000 },
  )
  const fireWaterRows = await page.$$eval('[data-testid="species-rows"] li', (els) =>
    els
      .filter((e) => e.querySelector('[data-species-id]'))
      .map((e) => ({
        name: e.querySelector('.species-name').textContent.trim(),
        types: [...e.querySelectorAll('[data-type]')].map((t) => t.getAttribute('data-type')),
      })),
  )
  const bothTypes = fireWaterRows.filter(
    (r) => r.types.includes('fire') && r.types.includes('water'),
  )
  log(`  fire OR water: ${fireWaterRows.length} species (was ${fireRows.length} fire-only)`)
  log(`  rows having BOTH fire and water: ${bothTypes.length} (would be the AND result)`)
  check(
    'fire+water is larger than fire alone (OR, not AND)',
    fireWaterRows.length > fireRows.length,
  )
  check(
    'every row has fire OR water',
    fireWaterRows.every((r) => r.types.includes('fire') || r.types.includes('water')),
  )
  check(
    'result is not the AND intersection',
    fireWaterRows.length !== bothTypes.length,
    `(${fireWaterRows.length} vs ${bothTypes.length})`,
  )
  await page.screenshot({ path: `${SHOTS}/scenarioC-type-filter.png` })

  // ------------------------------------------------------------ SCENARIO D
  hr('SCENARIO D — search and type filter apply simultaneously')
  await withControls(() => page.click('[data-testid="type-filter-water"]')) // back to fire only
  await withControls(() => page.fill('[data-testid="species-search"]', 'e'))
  await page.waitForTimeout(300)
  const comboRows = await page.$$eval('[data-testid="species-rows"] li', (els) =>
    els
      .filter((e) => e.querySelector('[data-species-id]'))
      .map((e) => ({
        name: e.querySelector('.species-name').textContent.trim(),
        types: [...e.querySelectorAll('[data-type]')].map((t) => t.getAttribute('data-type')),
      })),
  )
  log(`  search "e" + fire filter: ${comboRows.length} species (fire-only was ${fireRows.length})`)
  log(`    ${comboRows.map((r) => r.name).join(', ')}`)
  check(
    'all results are fire type',
    comboRows.every((r) => r.types.includes('fire')),
  )
  check(
    'all results contain "e"',
    comboRows.every((r) => r.name.toLowerCase().includes('e')),
  )
  check('combined result is narrower than type filter alone', comboRows.length < fireRows.length)
  await page.screenshot({ path: `${SHOTS}/scenarioD-combined.png` })

  // ------------------------------------------------------------ SCENARIO F
  hr('SCENARIO F — Gengar under red-blue shows no abilities and no "undefined"')
  await withControls(() => page.fill('[data-testid="species-search"]', 'gengar'))
  await withControls(() => page.click('[data-testid="type-filter-fire"]')) // clear fire filter
  await page.waitForSelector('[data-testid="species-row-94"]', { timeout: 15000 })
  await openSpecies(94)
  const abilityNone = await page.textContent('[data-testid="abilities-none"]').catch(() => null)
  const abilityItems = await page.$$('[data-testid^="species-ability-"]')
  const detailText = await page.textContent('[data-testid="species-page"]')
  log(`  abilities message : ${JSON.stringify(abilityNone)}`)
  log(`  ability entries   : ${abilityItems.length}`)
  log(`  "undefined" in detail text: ${detailText.includes('undefined')}`)
  log(`  "NaN" in detail text      : ${detailText.includes('NaN')}`)
  check('no ability entries rendered under red-blue', abilityItems.length === 0)
  check('an explanatory message is shown instead', /None in Gen 1/.test(abilityNone ?? ''))
  check('detail contains no "undefined"', !detailText.includes('undefined'))
  check('detail contains no "NaN"', !detailText.includes('NaN'))

  // And the same species DOES show its Gen 3-4 ability when that era is selected.
  await selectVersionGroup('firered-leafgreen')
  await page.waitForSelector('[data-testid^="species-ability-"]', { timeout: 30000 })
  const gen3Abilities = await page.$$eval('[data-testid^="species-ability-"]', (els) =>
    els.map((e) => ({
      name: e.textContent.trim(),
      hidden: e.getAttribute('data-hidden-ability') === 'true',
    })),
  )
  log(`  Gengar abilities under firered-leafgreen: ${JSON.stringify(gen3Abilities)}`)
  check(
    'Gengar shows exactly one Gen 3 ability',
    gen3Abilities.length === 1,
    JSON.stringify(gen3Abilities),
  )
  check(
    'that ability is Levitate (not the Gen 5 Cursed Body)',
    gen3Abilities[0].name === 'Levitate',
  )
  /*
    THE HIDDEN SLOT DID NOT EXIST BEFORE GEN 5, so nothing on a Gen 1-4 page may
    report itself hidden. This used to leak for 17 species -- PokeAPI has no
    past_abilities entry emptying their third slot, so Koffing advertised Stench in
    HeartGold/SoulSilver. The rule now lives in era.ts and this is the whole-dex
    check on it, run at the era where the leak was worst.
  */
  await selectVersionGroup('heartgold-soulsilver')
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'koffing'))
  await page.waitForSelector('[data-testid="species-row-109"]', { timeout: 15000 })
  await openSpecies(109)
  const koffing = await page.$$eval('[data-testid^="species-ability-"]', (els) =>
    els.map((e) => ({
      name: e.textContent.trim(),
      hidden: e.getAttribute('data-hidden-ability') === 'true',
    })),
  )
  log(`  Koffing abilities under heartgold-soulsilver: ${JSON.stringify(koffing)}`)
  check(
    'Koffing shows only Levitate in Gen 4',
    koffing.length === 1 && koffing[0].name === 'Levitate',
    JSON.stringify(koffing),
  )
  check(
    'no ability is reported hidden in Gen 4',
    koffing.every((a) => !a.hidden),
  )
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'gengar'))
  await page.waitForSelector('[data-testid="species-row-94"]', { timeout: 15000 })
  await openSpecies(94)
  await selectVersionGroup('red-blue')
  await page.screenshot({ path: `${SHOTS}/scenarioF-gengar-abilities.png` })

  // ------------------------------------------- type chart, gen 1 has no dark/steel
  hr('TYPE EFFECTIVENESS — Gen 1 selection excludes Dark and Steel')
  await selectVersionGroup('red-blue')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="learnset-loading"]'),
    undefined,
    { timeout: 60000 },
  )
  const gen1Chart = await page.$eval('[data-testid="type-matchup-chart"]', (el) => ({
    attacking: Number(el.getAttribute('data-attacking-types')),
    types: [...el.querySelectorAll('[data-type]')].map((t) => t.getAttribute('data-type')),
  }))
  log(`  attacking types considered : ${gen1Chart.attacking}`)
  log(`  types named in the chart   : ${gen1Chart.types.join(', ')}`)
  check('15 attacking types in Gen 1', gen1Chart.attacking === 15, `(${gen1Chart.attacking})`)
  check('no dark in the Gen 1 chart', !gen1Chart.types.includes('dark'))
  check('no steel in the Gen 1 chart', !gen1Chart.types.includes('steel'))
  await selectVersionGroup('heartgold-soulsilver')
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="type-matchup-chart"]')
          ?.getAttribute('data-attacking-types'),
      ) === 17,
    undefined,
    { timeout: 30000 },
  )
  const gen4Attacking = await page.getAttribute(
    '[data-testid="type-matchup-chart"]',
    'data-attacking-types',
  )
  log(`  attacking types under heartgold-soulsilver: ${gen4Attacking}`)
  check('17 attacking types in Gen 4', gen4Attacking === '17')

  // ------------------------------------------------------------ SCENARIO H
  hr('SCENARIO H — no gender toggle for a species without a gender difference')
  /*
    THE FOUR-AXIS CONTROL LIVES ON THE SPRITES TAB NOW, folded in from the old
    detail page rather than dropped. Same component, same testids, same
    availability rules -- so what changed here is one openTab call, not the claim.
    A fifth switch sits beside the four: it turns the same axes into a filter over
    the sprite catalogue, and is why the count below is 5.
  */
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'bulbasaur'))
  await page.waitForSelector('[data-testid="species-row-1"]', { timeout: 15000 })
  await openSpecies(1)
  await openTab('Sprites')
  await page.waitForSelector('[data-testid="artwork-img"]', { timeout: 30000 })
  // The switch is always rendered and DISABLED when unavailable: a greyed control
  // with a stated reason beats a control that silently disappears.
  const bulbaSwitches = await page.$$eval('[data-testid^="toggle-"][role="switch"]', (els) =>
    els.map((e) => ({
      id: e.getAttribute('data-testid'),
      disabled: e.getAttribute('data-disabled') === 'true',
      value: e.getAttribute('data-value'),
    })),
  )
  log(`  Bulbasaur switches: ${JSON.stringify(bulbaSwitches)}`)
  const findSwitch = (id) => bulbaSwitches.find((s) => s.id === `toggle-${id}`)
  check(
    'the four axes render, plus the grid filter',
    bulbaSwitches.length === 5,
    `(${bulbaSwitches.length})`,
  )
  check(
    'all four axes are present by name',
    ['source', 'shiny', 'motion', 'gender'].every((id) => findSwitch(id) != null),
  )
  check('gender switch disabled for Bulbasaur', findSwitch('gender')?.disabled === true)
  check('shiny switch present and enabled', findSwitch('shiny')?.disabled === false)
  check(
    'motion switch present and enabled (artwork source)',
    findSwitch('motion')?.disabled === false,
  )
  check('the grid filter defaults to off', findSwitch('grid-filter')?.value === 'All sprites')

  // ------------------------------------------------------------ SCENARIO G
  hr('SCENARIO G — shiny artwork fetched once, cached thereafter')
  const regularSrc = await page.getAttribute('[data-testid="artwork-img"]', 'src')
  await page.click('[data-testid="toggle-shiny"]')
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid="artwork-img"]')?.getAttribute('src') !== prev,
    regularSrc,
    { timeout: 15000 },
  )
  const shinySrc = await page.getAttribute('[data-testid="artwork-img"]', 'src')
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-testid="artwork-img"]')
      return img && img.complete && img.naturalWidth > 0
    },
    undefined,
    { timeout: 30000 },
  )
  log(`  regular src : ${regularSrc}`)
  log(`  shiny src   : ${shinySrc}`)
  check('artwork src changed on shiny toggle', shinySrc !== regularSrc)
  const firstFetches = networkFetches(shinySrc)
  const firstAttempts = attemptsFor(shinySrc).length
  log(
    `  after 1st toggle: ${firstAttempts} attempt(s), ${firstFetches} of them a real network fetch`,
  )

  // Toggle away and back twice; the same URL must not be re-fetched.
  for (let i = 0; i < 2; i++) {
    await page.click('[data-testid="toggle-shiny"]')
    await page.waitForTimeout(250)
    await page.click('[data-testid="toggle-shiny"]')
    await page.waitForTimeout(400)
  }
  /*
    Settle before measuring. Without this the third view's response event can
    still be in flight, which is the other half of why this block flaked: an
    attempt with no response yet classifies as 'pending', and a run that measured
    early saw a different mix than one that did not.
  */
  await page
    .waitForFunction(
      () => {
        const img = document.querySelector('[data-testid="artwork-img"]')
        return img != null && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 15000 },
    )
    .catch(() => {})
  const shinyState = await page.getAttribute('[data-testid="artwork-img"]', 'data-shiny')
  const attempts = attemptsFor(shinySrc)
  const afterFetches = networkFetches(shinySrc)
  const cacheHits = attempts.filter((a) => a.kind === 'cache').length
  const pending = attempts.filter((a) => a.kind === 'pending').length
  log(
    `  after 3 total shiny views: ${attempts.length} attempt(s) = ${afterFetches} network + ${cacheHits} cache + ${pending} pending`,
  )
  log(`  artwork img data-shiny=${shinyState}`)
  log(`  per-attempt classification:`)
  attempts.forEach((a, i) =>
    log(`    #${i + 1} ${a.kind.padEnd(7)} bytes=${a.bytes} disk=${a.disk} sw=${a.sw}`),
  )

  /*
    THE CLAIM IS ABOUT NETWORK FETCHES, NOT REQUEST EVENTS. It used to count
    requestWillBeSent events, which include cache hits, so a second view served
    from the disk cache read as a second fetch. What the spec actually promises is
    that the bytes cross the wire once and every later view is served locally --
    which is now three separate claims instead of one ambiguous count.
  */
  check(
    'shiny artwork crossed the network exactly once across three views',
    afterFetches === 1,
    `(${afterFetches} network fetch(es) of ${attempts.length} attempts)`,
  )
  check('no additional network fetch on repeat toggles', afterFetches === firstFetches)
  check(
    'and every later attempt was served from a cache, not left pending',
    attempts.length >= 1 && pending === 0 && cacheHits === attempts.length - afterFetches,
    `${cacheHits} cache, ${pending} pending`,
  )
  check('shiny is the state being displayed', shinyState === 'true')

  // "cached after" is only meaningful if it is actually in the cache.
  const artworkCache = await page.evaluate(async (url) => {
    const names = await caches.keys()
    const out = { names, hit: false, cacheName: null, entries: 0 }
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (name.includes('artwork')) out.entries = keys.length
      if (keys.some((k) => k.url === url)) {
        out.hit = true
        out.cacheName = name
      }
    }
    return out
  }, shinySrc)
  log(`  cache names: ${artworkCache.names.join(', ')}`)
  log(
    `  shiny URL present in cache "${artworkCache.cacheName}": ${artworkCache.hit} (artwork cache holds ${artworkCache.entries} entries)`,
  )
  check('shiny artwork is stored in the runtime artwork cache', artworkCache.hit === true)
  await page.screenshot({ path: `${SHOTS}/scenarioG-shiny.png` })

  // ------------------------------------------------------------ SCENARIO I
  hr('SCENARIO I — Murkrow (#198) animated sprite uses the unsuffixed file')
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'murkrow'))
  await page.waitForSelector('[data-testid="species-row-198"]', { timeout: 15000 })
  await openSpecies(198)
  await openTab('Sprites')
  await page.waitForSelector('[data-testid="artwork-img"]', { timeout: 30000 })
  // Murkrow opens on artwork+static, where no gendered image exists, so the
  // gender switch is disabled until motion is switched to animated.
  const murkrowGenderBefore = await page.getAttribute(
    '[data-testid="toggle-gender"]',
    'data-disabled',
  )
  check(
    'gender disabled while viewing static official artwork',
    murkrowGenderBefore === 'true',
    `(data-disabled=${murkrowGenderBefore})`,
  )

  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-src-kind') ===
      'animated',
    undefined,
    { timeout: 15000 },
  )
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-testid="artwork-img"]')
      return img && img.complete
    },
    undefined,
    { timeout: 30000 },
  )
  const male = await page.$eval('[data-testid="artwork-img"]', (el) => ({
    src: el.getAttribute('src'),
    naturalWidth: el.naturalWidth,
    complete: el.complete,
  }))
  log(`  male/default animated src : ${male.src}`)
  log(`  loaded: complete=${male.complete} naturalWidth=${male.naturalWidth}`)
  check('male sprite uses the unsuffixed file', male.src.endsWith('/198-front-n.webp'), male.src)
  check('male sprite URL contains no "-m" suffix', !/-[ns]-m\.webp$/.test(male.src))
  check('male sprite actually rendered (naturalWidth > 0)', male.naturalWidth > 0)
  const noError = await page.$$('[data-testid="artwork-error"]')
  check('no broken-image error shown', noError.length === 0)
  const murkrowGenderAfter = await page.getAttribute(
    '[data-testid="toggle-gender"]',
    'data-disabled',
  )
  check(
    'gender enabled once motion is animated',
    murkrowGenderAfter === 'false',
    `(data-disabled=${murkrowGenderAfter})`,
  )

  await page.click('[data-testid="toggle-gender"]')
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid="artwork-img"]')?.getAttribute('src') !== prev,
    male.src,
    { timeout: 15000 },
  )
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-testid="artwork-img"]')
      return img && img.complete
    },
    undefined,
    { timeout: 30000 },
  )
  const female = await page.$eval('[data-testid="artwork-img"]', (el) => ({
    src: el.getAttribute('src'),
    naturalWidth: el.naturalWidth,
  }))
  log(`  female animated src : ${female.src}`)
  log(`  loaded: naturalWidth=${female.naturalWidth}`)
  check('female sprite uses the -f file', female.src.endsWith('/198-front-n-f.webp'), female.src)
  check('female sprite actually rendered', female.naturalWidth > 0)
  await page.screenshot({ path: `${SHOTS}/scenarioI-murkrow.png` })

  // -------------------------------------------------- detail completeness
  hr('DETAIL COMPLETENESS — every required section renders')
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'eevee'))
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  /*
    Re-pointed at the Info tab's equivalents, one for one. Two entries from the old
    list are deliberately absent rather than renamed:

      breeding-partners  the old page's "N species share an egg group" count. Not
                         in the DetailPage spec, so it did not come across. Logged
                         in SPECIES-PAGE-PUNCH-LIST.md as a dropped fact.
      the per-ability effect paragraph  now the ability's title attribute rather
                         than body text, so there is no element to assert.
  */
  const sections = {
    'base stats': '[data-testid="species-base-stats"]',
    'stat total': '[data-testid="stat-total"]',
    types: '[data-testid="species-info-types"]',
    'growth rate': '[data-testid="growth-rate"]',
    'catch rate': '[data-testid="catch-rate"]',
    'base XP': '[data-testid="base-xp"]',
    'gender ratio': '[data-testid="gender-ratio"]',
    'hatch time': '[data-testid="hatch-time"]',
    'base friendship': '[data-testid="base-friendship"]',
    shape: '[data-testid="shape"]',
    'body colour': '[data-testid="body-colour"]',
    'type matchup chart': '[data-testid="type-matchup-chart"]',
    'evolution tree': '[data-testid="evolution-tree"]',
    'egg groups': '[data-testid="egg-groups"]',
  }
  for (const [label, selector] of Object.entries(sections)) {
    const el = await page.$(selector)
    check(`${label} rendered`, el != null)
  }
  const branches = await page.getAttribute('[data-testid="evolution-tree"]', 'data-root-branches')
  // The tree is now a visual layout, so trigger clauses live on .evo-trigger
  // rather than the old .evo-methods list.
  const methods = await page.$$eval('[data-testid="evolution-tree"] .evo-trigger', (els) =>
    els.map((e) => e.getAttribute('title') ?? e.textContent.trim()),
  )
  log(`  Eevee evolution branches : ${branches}`)
  methods.forEach((m) => log(`    ${m}`))
  check('Eevee shows branching evolution', Number(branches) >= 5, `(${branches})`)
  check(
    'each branch carries a trigger condition',
    methods.every((m) => m.length > 0),
  )
  /* Encounters moved to the Description tab, beside the flavour text they vary
     with. Either a table or an explicit "not in the wild" line counts as
     resolved; what must not happen is neither. */
  await openTab('Description')
  await page.waitForFunction(() => !document.querySelector('[data-testid="locations-loading"]'), {
    timeout: 60000,
  })
  const encounterTable = await page.$(
    '[data-testid="species-locations-rows"], [data-testid="locations-empty"]',
  )
  check('encounters section resolved', encounterTable != null)
  await openTab('Info')
  await page.screenshot({ path: `${SHOTS}/detail-eevee.png`, fullPage: true })

  // --------------------------------------------- painted condition icons
  /*
    THE CUSTOM EVOLUTION-CONDITION ICONS, on the chart rather than on disk --
    verify-evo-icons.mjs owns the asset checks (canvas size, fill, transparency),
    this owns "the right one shows up on the right branch".

    Every icon is forced eager and scrolled into view before measuring: they are
    loading="lazy", so an off-screen icon reports naturalWidth 0 and reads as
    broken when it is merely deferred. That false positive cost time once already.
  */
  /*
    RESET THE LIST FIRST. The scenario above left "eevee" in the search box, so
    every row but one is filtered out and the cases below would look like missing
    species rather than a stale filter. Scope also has to be "All": the cases span
    Gen 1 to Gen 4 (Machoke to Mantyke) and no single game holds them all.
  */
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', ''))
  await selectVersionGroup('all')
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length > 400,
    undefined,
    { timeout: 30000 },
  )

  const paintedOn = async (id) => {
    // The detail replaces the grid rather than sitting beside it, so every case
    // after the first has to come back to the list before it can click a row.
    await backToGrid()
    // 'attached', not the default 'visible': the list scrolls inside a ScrollArea
    // and a row 349 deep is below the fold. page.click scrolls it in.
    await page.waitForSelector(`[data-testid="species-row-${id}"]`, {
      state: 'attached',
      timeout: 30000,
    })
    await openSpecies(id)
    await page.evaluate(() => {
      for (const i of document.querySelectorAll('.evo-painted-icon')) {
        i.loading = 'eager'
        i.scrollIntoView({ block: 'center' })
      }
    })
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.evo-painted-icon')].every(
            (i) => i.complete && i.naturalWidth > 0,
          ),
        undefined,
        { timeout: 20000 },
      )
      .catch(() => {})
    return page.evaluate(() => ({
      keys: [...document.querySelectorAll('.evo-painted-icon')].map((i) => i.dataset.evoIcon),
      natural: [...document.querySelectorAll('.evo-painted-icon')].map(
        (i) => `${i.naturalWidth}x${i.naturalHeight}`,
      ),
      boxes: [...document.querySelectorAll('.evo-painted-icon')].map((i) =>
        Math.round(i.getBoundingClientRect().width),
      ),
      labels: [
        ...document.querySelectorAll(
          '.evo-arrow .visually-hidden, .evo-fork-random .visually-hidden',
        ),
      ].map((e) => e.textContent),
      fork: document.querySelector('[data-random-fork="true"]') != null,
    }))
  }

  // One species per painted condition, chosen because each is the only Gen 1-4
  // user of its field (or one of two, for the locations).
  const PAINTED_CASES = [
    { id: 349, name: 'Feebas', expect: 'beauty' },
    { id: 458, name: 'Mantyke', expect: 'party-species-remoraid' },
    { id: 82, name: 'Magneton', expect: 'location-mount-coronet' },
    { id: 67, name: 'Machoke', expect: 'trade' },
    { id: 281, name: 'Kirlia', expect: 'gender-male' },
    { id: 361, name: 'Snorunt', expect: 'gender-female' },
  ]
  for (const c of PAINTED_CASES) {
    const got = await paintedOn(c.id)
    log(`  ${c.name}: ${got.keys.join(', ')}  natural=${got.natural.join(',')}`)
    check(
      `${c.name} renders the painted "${c.expect}" icon`,
      got.keys.includes(c.expect),
      got.keys.join(', ') || '(none)',
    )
    check(
      `  and it is the normalised 128px asset drawn at 20px`,
      got.natural.every((n) => n === '128x128') && got.boxes.every((b) => b === 20),
      `${got.natural.join(',')} @ ${got.boxes.join(',')}px`,
    )
    check(
      `  with a screen-reader label`,
      got.labels.some((l) => l && l.length > 0),
      got.labels.join(' | '),
    )
  }

  // Eevee: four painted conditions on one chart, and NO random fork -- its seven
  // branches all distinguish themselves, so the dice must not appear.
  const eeveeIcons = await paintedOn(133)
  log(`  Eevee painted: ${eeveeIcons.keys.join(', ')}`)
  check(
    'Eevee shows day, night and both rock locations as painted icons',
    ['day', 'night', 'location-moss-rock', 'location-ice-rock'].every((k) =>
      eeveeIcons.keys.includes(k),
    ),
    eeveeIcons.keys.join(', '),
  )
  check('and Eevee is NOT marked a random fork', eeveeIcons.fork === false)

  /*
    Wurmple is the ONLY fork in the whole bundle whose branches are byte-identical,
    measured across all 11 multi-branch forks. The dice marks the branch point for
    display; it resolves nothing, because nothing in this app tracks individual
    caught Pokemon to resolve against.
  */
  const wurmple = await paintedOn(265)
  log(`  Wurmple painted: ${wurmple.keys.join(', ')}  fork=${wurmple.fork}`)
  check('Wurmple is marked a random fork', wurmple.fork === true)
  check('with the dice icon at the branch point', wurmple.keys.includes('random-split'))
  check(
    'and the hidden label names both outcomes',
    wurmple.labels.some((l) => l?.includes('Silcoon') && l.includes('Cascoon')),
    wurmple.labels.join(' | '),
  )
  await page.screenshot({ path: `${SHOTS}/evo-wurmple-random.png`, fullPage: true })

  // ------------------------------------------------------- console errors
  hr('CONSOLE / PAGE ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 12).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 12).forEach((e) => log(`    ${e}`))
  const failedResponses = responses.filter((r) => r.status >= 400)
  log(`  HTTP >=400 responses : ${failedResponses.length}`)
  failedResponses.slice(0, 12).forEach((r) => log(`    ${r.status} ${r.url}`))
  check('no console errors', consoleErrors.length === 0)
  check('no uncaught page errors', pageErrors.length === 0)
  check('no failed HTTP responses', failedResponses.length === 0)

  hr('SUMMARY')
  if (failures.length === 0) log('  ALL SCENARIOS PASSED')
  else {
    log(`  ${failures.length} FAILED:`)
    failures.forEach((f) => log(`    - ${f}`))
  }
  log(`  screenshots written to ${SHOTS}/`)
} finally {
  if (browser) await browser.close()
  preview.kill()
}

process.exit(failures.length ? 1 : 0)
