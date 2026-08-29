/**
 * Scenario verification for the Pokedex module.
 *
 * Serves the production build with `vite preview`, drives it with Playwright over
 * the installed Chrome, and asserts each lettered scenario from the spec against
 * the real DOM and the real network log.
 *
 * Caching is measured with a CDP Network session rather than Playwright's request
 * events. Two things matter: how many times a URL is actually requested
 * (Network.requestWillBeSent, counted against the exact URL rather than a
 * substring), and whether the response came via the service worker or the disk
 * cache (Network.responseReceived). The Cache Storage contents are then read
 * directly from the page, so "cached after" is proven rather than inferred.
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

  // ---- CDP network capture with cache attribution ------------------------
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const responses = []
  const requested = []
  cdp.on('Network.requestWillBeSent', (e) => {
    requested.push(e.request.url)
  })
  cdp.on('Network.responseReceived', (e) => {
    responses.push({
      url: e.response.url,
      status: e.response.status,
      fromDiskCache: e.response.fromDiskCache === true,
      fromServiceWorker: e.response.fromServiceWorker === true,
      encodedDataLength: e.response.encodedDataLength ?? 0,
    })
  })

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
  const openSpecies = async (id) => {
    await page.click(`[data-testid="species-row-${id}"]`)
    await page.waitForSelector(`[data-testid="species-detail"][data-species-id="${id}"]`, {
      timeout: 30000,
    })
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="learnset-loading"]'),
      undefined,
      { timeout: 60000 },
    )
  }
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

  await selectVersionGroup('heartgold-soulsilver')
  await openSpecies(80) // Slowbro
  const hgssHeadbutt = await page.$$eval(
    '[data-testid="learn-level-up"] [data-move-id="29"]',
    (els) => els.map((e) => e.getAttribute('data-level')),
  )
  log(`  Slowbro/Headbutt level-up levels in heartgold-soulsilver: [${hgssHeadbutt.join(', ')}]`)

  // Switch the game WITHOUT re-navigating or re-clicking the species.
  await selectVersionGroup('gold-silver')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="learnset-loading"]'),
    undefined,
    { timeout: 60000 },
  )
  const gsHeadbutt = await page.$$eval(
    '[data-testid="learn-level-up"] [data-move-id="29"]',
    (els) => els.map((e) => e.getAttribute('data-level')),
  )
  const stillOpen = await page.getAttribute('[data-testid="species-detail"]', 'data-species-id')
  log(`  Slowbro/Headbutt level-up levels in gold-silver           : [${gsHeadbutt.join(', ')}]`)
  log(`  detail view still open on species: ${stillOpen} (no re-navigation)`)
  check('open detail followed the version-group switch', gsHeadbutt.join() !== hgssHeadbutt.join())
  check('same detail view stayed open', stillOpen === '80')
  await page.screenshot({ path: `${SHOTS}/scenario1-vg-switch.png`, fullPage: false })

  // ------------------------------------------------------------ SCENARIO E
  hr('SCENARIO E — Slowbro learnset is the selected generation, not another')
  await selectVersionGroup('heartgold-soulsilver')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="learnset-loading"]'),
    undefined,
    { timeout: 60000 },
  )
  const hgssLevels = await page.$$eval('[data-testid="learn-level-up"] [data-level]', (els) =>
    [...new Set(els.map((e) => e.getAttribute('data-level')))].map(Number).sort((a, b) => a - b),
  )
  const methodSections = await page.$$eval('[data-testid="learnset"] .learn-group', (els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )
  log(`  Headbutt level in HGSS      : [${hgssHeadbutt.join(', ')}]  (Gen 2 value is 34)`)
  log(`  method sections present     : ${methodSections.join(', ')}`)
  log(`  level-up levels (first 12)  : ${hgssLevels.slice(0, 12).join(', ')}`)
  check('Headbutt is level 25 under heartgold-soulsilver', hgssHeadbutt.includes('25'))
  check('Headbutt is NOT level 34 under heartgold-soulsilver', !hgssHeadbutt.includes('34'))
  check('Headbutt was level 34 under gold-silver', gsHeadbutt.includes('34'))
  check('learnset is grouped by method', methodSections.length >= 2, methodSections.join('/'))
  await page.screenshot({ path: `${SHOTS}/scenarioE-learnset.png` })

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
  const abilityItems = await page.$$('[data-testid="abilities"] li')
  const detailText = await page.textContent('[data-testid="species-detail"]')
  log(`  abilities message : ${JSON.stringify(abilityNone)}`)
  log(`  ability entries   : ${abilityItems.length}`)
  log(`  "undefined" in detail text: ${detailText.includes('undefined')}`)
  log(`  "NaN" in detail text      : ${detailText.includes('NaN')}`)
  check('no ability entries rendered under red-blue', abilityItems.length === 0)
  check('an explanatory message is shown instead', (abilityNone ?? '').includes('did not exist'))
  check('detail contains no "undefined"', !detailText.includes('undefined'))
  check('detail contains no "NaN"', !detailText.includes('NaN'))

  // And the same species DOES show its Gen 3-4 ability when that era is selected.
  await selectVersionGroup('firered-leafgreen')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="learnset-loading"]'),
    undefined,
    { timeout: 60000 },
  )
  const gen3Abilities = await page.$$eval('[data-testid="abilities"] li strong', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  log(`  Gengar abilities under firered-leafgreen: ${JSON.stringify(gen3Abilities)}`)
  check('Gengar shows exactly one Gen 3 ability', gen3Abilities.length === 1, gen3Abilities.join())
  check('that ability is Levitate (not the Gen 5 Cursed Body)', gen3Abilities[0] === 'Levitate')
  await page.screenshot({ path: `${SHOTS}/scenarioF-gengar-abilities.png` })

  // ------------------------------------------- type chart, gen 1 has no dark/steel
  hr('TYPE EFFECTIVENESS — Gen 1 selection excludes Dark and Steel')
  await selectVersionGroup('red-blue')
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="learnset-loading"]'),
    undefined,
    { timeout: 60000 },
  )
  const gen1Chart = await page.$eval('[data-testid="type-effectiveness"]', (el) => ({
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
          .querySelector('[data-testid="type-effectiveness"]')
          ?.getAttribute('data-attacking-types'),
      ) === 17,
    undefined,
    { timeout: 30000 },
  )
  const gen4Attacking = await page.getAttribute(
    '[data-testid="type-effectiveness"]',
    'data-attacking-types',
  )
  log(`  attacking types under heartgold-soulsilver: ${gen4Attacking}`)
  check('17 attacking types in Gen 4', gen4Attacking === '17')

  // ------------------------------------------------------------ SCENARIO H
  hr('SCENARIO H — no gender toggle for a species without a gender difference')
  await withControls(() => page.fill('[data-testid="species-search"]', 'bulbasaur'))
  await page.waitForSelector('[data-testid="species-row-1"]', { timeout: 15000 })
  await openSpecies(1)
  // The switch is now always rendered and DISABLED when unavailable, which is
  // the batch-2 behaviour: a greyed control with a stated reason beats a control
  // that silently disappears.
  const bulbaSwitches = await page.$$eval('[data-testid^="toggle-"][role="switch"]', (els) =>
    els.map((e) => ({
      id: e.getAttribute('data-testid'),
      disabled: e.getAttribute('data-disabled') === 'true',
      value: e.getAttribute('data-value'),
    })),
  )
  log(`  Bulbasaur switches: ${JSON.stringify(bulbaSwitches)}`)
  const findSwitch = (id) => bulbaSwitches.find((s) => s.id === `toggle-${id}`)
  check('all four switches render', bulbaSwitches.length === 4, `(${bulbaSwitches.length})`)
  check('gender switch disabled for Bulbasaur', findSwitch('gender')?.disabled === true)
  check('shiny switch present and enabled', findSwitch('shiny')?.disabled === false)
  check(
    'motion switch present and enabled (artwork source)',
    findSwitch('motion')?.disabled === false,
  )

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
  const exact = (url) => requested.filter((u) => u === url).length
  const firstRequests = exact(shinySrc)
  log(`  after 1st toggle: ${firstRequests} request(s) for the exact shiny URL`)

  // Toggle away and back twice; the same URL must not be re-fetched.
  for (let i = 0; i < 2; i++) {
    await page.click('[data-testid="toggle-shiny"]')
    await page.waitForTimeout(250)
    await page.click('[data-testid="toggle-shiny"]')
    await page.waitForTimeout(400)
  }
  const shinyState = await page.getAttribute('[data-testid="artwork-img"]', 'data-shiny')
  const afterRequests = exact(shinySrc)
  log(`  after 3 total shiny views: ${afterRequests} request(s) for the exact shiny URL`)
  log(`  artwork img data-shiny=${shinyState}`)
  log(`  response events for that URL:`)
  responses
    .filter((r) => r.url === shinySrc)
    .forEach((r) =>
      log(
        `    status=${r.status} disk=${r.fromDiskCache} sw=${r.fromServiceWorker} bytes=${r.encodedDataLength}`,
      ),
    )
  check(
    'shiny artwork requested exactly once across three views',
    afterRequests === 1,
    `(${afterRequests})`,
  )
  check('no extra request on repeat toggles', afterRequests === firstRequests)
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
  await withControls(() => page.fill('[data-testid="species-search"]', 'murkrow'))
  await page.waitForSelector('[data-testid="species-row-198"]', { timeout: 15000 })
  await openSpecies(198)
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
  await withControls(() => page.fill('[data-testid="species-search"]', 'eevee'))
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  const sections = {
    'base stats': '[data-testid="base-stats"]',
    'stat total': '[data-testid="stat-total"]',
    types: '[data-testid="detail-types"]',
    'growth rate': '[data-testid="growth-rate"]',
    'catch rate': '[data-testid="catch-rate"]',
    'base XP': '[data-testid="base-xp"]',
    'gender ratio': '[data-testid="gender-ratio"]',
    'type effectiveness': '[data-testid="type-effectiveness"]',
    'evolution tree': '[data-testid="evolution-tree"]',
    'egg groups': '[data-testid="egg-groups"]',
    'breeding partners': '[data-testid="breeding-partners"]',
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
  const encounterTable = await page.$(
    '[data-testid="encounters"], [data-testid="encounters-empty"]',
  )
  check('encounters section resolved', encounterTable != null)
  await page.screenshot({ path: `${SHOTS}/detail-eevee.png`, fullPage: true })

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
