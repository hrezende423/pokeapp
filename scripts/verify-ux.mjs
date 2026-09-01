/**
 * Verification for the UX/layout batch (items 1-8).
 *
 * Same harness as verify-pokedex.mjs: production build served by `vite preview`,
 * driven with Playwright over the installed Chrome, asserted against the real DOM
 * and the real network log.
 *
 * Two things are checked outside the browser as well, because the browser can
 * only show what a species happens to have:
 *
 *   - item 3 walks the whole bundle to report gender-toggle availability per mode
 *     across all 493 species, so "check before offering" is proven for the set and
 *     not just for the two species that happen to be clicked;
 *   - item 7 walks every evolution chain through the real classifier so the icon
 *     mapping is reported for every trigger the data actually contains.
 *
 * Usage: node scripts/verify-ux.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'

const PORT = 4181
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

const bundle = (name) => JSON.parse(readFileSync(`public/data/${name}.json`, 'utf8'))

mkdirSync(SHOTS, { recursive: true })

// =====================================================================
// Offline census: item 3 (gender availability) and item 7 (trigger kinds)
// =====================================================================

const species = bundle('species')
const items = bundle('items')
const chains = bundle('evolution-chains')
const speciesIds = Object.keys(species)
  .map(Number)
  .sort((a, b) => a - b)
const defaultVariety = (id) =>
  species[id].varieties.find((v) => v.is_default) ?? species[id].varieties[0]

hr('ITEM 3 (data) — gender-toggle availability per mode, all 493 species')

const modes = {
  'in-game static (regular)': (id) => defaultVariety(id).sprites.front_female != null,
  'in-game static (shiny)': (id) => defaultVariety(id).sprites.front_shiny_female != null,
  // Official artwork exposes only front_default / front_shiny -- there is no
  // female field to read, for any species. Asserted, not assumed.
  'artwork static (regular)': () => false,
  'artwork static (shiny)': () => false,
  'artwork animated': (id) => species[id].has_gender_differences === true,
}

const availability = {}
for (const [mode, fn] of Object.entries(modes)) {
  availability[mode] = speciesIds.filter((id) => fn(id))
  log(`  ${mode.padEnd(26)} ${String(availability[mode].length).padStart(3)} / 493 species`)
}

const flagged = speciesIds.filter((id) => species[id].has_gender_differences)
check(
  'in-game gendered set == has_gender_differences set (94)',
  availability['in-game static (regular)'].length === 94 &&
    availability['in-game static (regular)'].every((id) => species[id].has_gender_differences),
  `(${availability['in-game static (regular)'].length})`,
)
check(
  'in-game shiny gendered set matches too (94)',
  availability['in-game static (shiny)'].length === 94,
  `(${availability['in-game static (shiny)'].length})`,
)
check(
  'no species has a gendered official artwork field',
  speciesIds.every((id) =>
    species[id].varieties.every(
      (v) => !Object.keys(v.sprites).some((k) => k.includes('official') && k.includes('female')),
    ),
  ),
)
check('animated gendered set is the same 94 species', flagged.length === 94, `(${flagged.length})`)

// A handful of named species, so the table is legible rather than just counts.
const SAMPLES = [1, 3, 25, 41, 133, 198, 493]
log('')
log('  per-species sample (o = gender toggle offered, - = disabled):')
log(`    ${'species'.padEnd(22)} in-game  artwork-static  artwork-animated`)
for (const id of SAMPLES) {
  const name = `#${String(id).padStart(3, '0')} ${species[id].display_name}`
  const ig = defaultVariety(id).sprites.front_female != null ? 'o' : '-'
  const as = '-'
  const aa = species[id].has_gender_differences ? 'o' : '-'
  log(`    ${name.padEnd(22)} ${ig.padEnd(8)} ${as.padEnd(15)} ${aa}`)
}
check(
  'Bulbasaur (#1) offers no gender in any mode',
  defaultVariety(1).sprites.front_female == null && !species[1].has_gender_differences,
)
check(
  'Venusaur (#3) offers gender in in-game and animated, not artwork-static',
  defaultVariety(3).sprites.front_female != null && species[3].has_gender_differences,
)
check('Murkrow (#198) is in the gendered set', species[198].has_gender_differences === true)

hr('ITEM 1 (data) — official-artwork fields present for the whole dex')
const oa = speciesIds.filter((id) => defaultVariety(id).sprites.official_artwork != null)
const oas = speciesIds.filter((id) => defaultVariety(id).sprites.official_artwork_shiny != null)
log(`  official_artwork       non-null: ${oa.length} / 493`)
log(`  official_artwork_shiny non-null: ${oas.length} / 493`)
log(`  bulbasaur regular: ${defaultVariety(1).sprites.official_artwork}`)
log(`  bulbasaur shiny  : ${defaultVariety(1).sprites.official_artwork_shiny}`)
check('every species has official artwork', oa.length === 493)
check('every species has shiny official artwork', oas.length === 493)
check(
  'official artwork path differs from the in-game sprite path',
  defaultVariety(1).sprites.official_artwork.includes('other/official-artwork') &&
    !defaultVariety(1).sprites.front_default.includes('other/official-artwork'),
)

hr('ITEM 7 (data) — trigger kind + icon for every evolution requirement in scope')

// Mirror of src/modules/pokedex/evolutionTriggers.ts. Kept as a copy on purpose:
// if the two ever disagree, the DOM assertions below fail and say so.
const TRIGGER_ICON_NAMES = {
  level: 'IconTrendingUp',
  stone: 'IconDiamond',
  move: 'IconSwords',
  trade: 'IconArrowsExchange',
  'trade-item': 'IconGift',
  location: 'IconMapPin',
  friendship: 'IconHeart',
  'held-item': 'IconHandGrab',
  shed: 'IconGhost',
  other: 'IconHelpCircle',
}
/*
  Mirror of src/modules/pokedex/evoConditionIcons.ts, same reason as the table
  above: an independent copy, so a disagreement shows up as a failure rather than
  as two files quietly agreeing on the wrong thing. Gender is resolved separately
  in the app (its own scoped module); here it is just two more branches.
*/
const PAINTED_ICON_KEYS = [
  'day',
  'night',
  'trade',
  'random-split',
  'location-moss-rock',
  'location-ice-rock',
  'location-mount-coronet',
  'beauty',
  'party-species-remoraid',
  'gender-male',
  'gender-female',
]
function paintedIconKey(d) {
  if (d.gender === 2) return 'gender-male'
  if (d.gender === 1) return 'gender-female'
  if (d.location_id === 8) return 'location-moss-rock'
  if (d.location_id === 48) return 'location-ice-rock'
  if (d.location_id === 10) return 'location-mount-coronet'
  if (d.min_beauty != null) return 'beauty'
  if (d.party_species_id === 223) return 'party-species-remoraid'
  if (d.time_of_day === 'day') return 'day'
  if (d.time_of_day === 'night') return 'night'
  if (d.trigger === 'trade') return 'trade'
  return null
}
function triggerKind(d) {
  if (d.trigger === 'trade') return d.held_item_id != null ? 'trade-item' : 'trade'
  if (d.trigger === 'use-item') return 'stone'
  if (d.trigger === 'shed') return 'shed'
  if (d.known_move_id != null || d.known_move_type_id != null) return 'move'
  if (d.location_id != null) return 'location'
  if (d.held_item_id != null) return 'held-item'
  if (d.min_happiness != null || d.min_affection != null) return 'friendship'
  if (d.trigger === 'level-up') return 'level'
  return 'other'
}

const kindCounts = {}
const kindExamples = {}
/*
  PARENT species id -> every requirement on its outgoing branches, in branch
  order. Keyed by the parent because that is the species whose page shows the
  arrows: Eevee's page renders Espeon's and Umbreon's requirements, not its own.
  Branch order is preserved so "the first arrow of kind K" means the same thing
  here as it does in the DOM.
*/
const childDetailsByParent = new Map()
function walk(node) {
  for (const child of node.evolves_to) {
    if (!childDetailsByParent.has(node.species_id)) {
      childDetailsByParent.set(node.species_id, [])
    }
    childDetailsByParent.get(node.species_id).push(...child.evolution_details)
    for (const d of child.evolution_details) {
      const kind = triggerKind(d)
      kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
      if (!kindExamples[kind]) {
        kindExamples[kind] = `${species[child.species_id]?.display_name ?? child.species_id} (${
          d.trigger
        }${d.item_id ? ' ' + items[d.item_id]?.name : ''}${
          d.held_item_id ? ' holding ' + items[d.held_item_id]?.name : ''
        })`
      }
    }
    walk(child)
  }
}
Object.values(chains).forEach((c) => walk(c.chain))

log(`  ${'kind'.padEnd(12)} ${'icon'.padEnd(20)} count  first example`)
for (const [kind, count] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
  log(
    `  ${kind.padEnd(12)} ${TRIGGER_ICON_NAMES[kind].padEnd(20)} ${String(count).padStart(5)}  ${
      kindExamples[kind]
    }`,
  )
}
check(
  'every trigger kind in the data has a mapped icon',
  Object.keys(kindCounts).every((k) => TRIGGER_ICON_NAMES[k]),
)
check('no requirement falls through to the "other" fallback', (kindCounts.other ?? 0) === 0)
check(
  'all five brief-named kinds occur in the data',
  ['level', 'stone', 'move', 'trade', 'trade-item', 'location'].every((k) => kindCounts[k] > 0),
)
const iconNames = Object.values(TRIGGER_ICON_NAMES)
check('no icon is reused for two kinds', new Set(iconNames).size === iconNames.length)
check(
  'no Poke Ball motif in the icon set',
  !iconNames.some((n) => /Ball|CircleDot|Pokeball/i.test(n)),
)

// Every mapped icon must be a real export of the installed package.
const pkgDir = 'node_modules/@tabler/icons-react/dist/esm/icons'
const { readdirSync } = await import('node:fs')
const shipped = new Set(readdirSync(pkgDir).filter((f) => f.endsWith('.mjs')))
const tablerVersion = JSON.parse(
  readFileSync('node_modules/@tabler/icons-react/package.json', 'utf8'),
).version
log(`  @tabler/icons-react ${tablerVersion}`)
for (const name of [...iconNames, 'IconEgg']) {
  check(`${name} is a real Tabler export`, shipped.has(`${name}.mjs`))
}

// =====================================================================
// Browser
// =====================================================================

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
)

let browser
try {
  await waitForServer(APP_URL)
  log('')
  log(`preview ready at ${APP_URL}`)

  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const responses = []
  cdp.on('Network.responseReceived', (e) => {
    responses.push({ url: e.response.url, status: e.response.status })
  })

  /*
    THE DETAIL VIEW IS THE REBUILT TABBED PAGE. The old rail-plus-cards view and
    the ?detail flag are gone, so a species opens on the Info tab and the rest is
    one tab click away. The four-axis artwork control moved to the Sprites tab; the
    evolution chart is on Info. Where a claim spans both -- "the tree follows the
    colour toggle" -- the helpers below are what make that two-tab trip explicit
    instead of hidden in a selector.
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

  /** Open the species and land on the Sprites tab, where the artwork control is. */
  const openSprites = async (id) => {
    await openSpecies(id)
    await openTab('Sprites')
    await page.waitForSelector('[data-testid="artwork-img"]', { timeout: 30000 })
  }

  const backToGrid = async () => {
    if ((await page.$('[data-testid="species-page-back"]')) == null) return
    await page.click('[data-testid="species-page-back"]')
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
  }
  const search = async (term, expectId) => {
    // The detail page replaces the grid, so the search box only exists once the
    // list is back on screen.
    await backToGrid()
    await withControls(() => page.fill('[data-testid="species-search"]', term))
    await page.waitForSelector(`[data-testid="species-row-${expectId}"]`, { timeout: 15000 })
  }
  const imgState = () =>
    page.$eval('[data-testid="artwork-img"]', (el) => ({
      src: el.getAttribute('src'),
      mode: el.getAttribute('data-mode'),
      shiny: el.getAttribute('data-shiny'),
      gender: el.getAttribute('data-gender'),
      kind: el.getAttribute('data-src-kind'),
      naturalWidth: el.naturalWidth,
      complete: el.complete,
    }))
  const switchState = (id) =>
    page.$eval(`[data-testid="toggle-${id}"]`, (el) => ({
      state: el.getAttribute('data-state'),
      value: el.getAttribute('data-value'),
      disabled: el.getAttribute('data-disabled') === 'true',
      ariaChecked: el.getAttribute('aria-checked'),
      reason: el.getAttribute('title'),
    }))
  const waitLoaded = () =>
    page.waitForFunction(
      () => {
        const img = document.querySelector('[data-testid="artwork-img"]')
        return img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 30000 },
    )
  const waitSrcChange = async (prev) =>
    page.waitForFunction(
      (p) => document.querySelector('[data-testid="artwork-img"]')?.getAttribute('src') !== p,
      prev,
      { timeout: 15000 },
    )

  await page.goto(APP_URL, { waitUntil: 'load' })

  const { withControls } = controls(page)
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // -------------------------------------------------------------- ITEM 1
  hr('ITEM 1 (DOM) — static artwork resolves to official artwork, not the in-game sprite')
  await search('bulbasaur', 1)
  await openSprites(1)
  await waitLoaded()
  const defaultImg = await imgState()
  log(`  default src : ${defaultImg.src}`)
  log(`  mode=${defaultImg.mode} shiny=${defaultImg.shiny} naturalWidth=${defaultImg.naturalWidth}`)
  check(
    'default artwork is the official-artwork asset',
    defaultImg.src.includes('other/official-artwork/1.png'),
    defaultImg.src,
  )
  check('default mode is artwork-static', defaultImg.mode === 'artwork-static')
  check(
    'official artwork actually loaded at full size (475px source)',
    defaultImg.naturalWidth === 475,
    `(naturalWidth=${defaultImg.naturalWidth})`,
  )

  await page.click('[data-testid="toggle-shiny"]')
  await waitSrcChange(defaultImg.src)
  await waitLoaded()
  const shinyArt = await imgState()
  log(`  shiny src   : ${shinyArt.src}`)
  check(
    'shiny uses the official-artwork shiny field',
    shinyArt.src.includes('other/official-artwork/shiny/1.png'),
    shinyArt.src,
  )
  check('shiny official artwork loaded', shinyArt.naturalWidth > 0)
  await page.click('[data-testid="toggle-shiny"]')
  await waitSrcChange(shinyArt.src)
  await waitLoaded()

  // -------------------------------------------------------------- ITEM 2
  hr('ITEM 2 (DOM) — the four artwork axes, with the specified defaults')
  const switches = await page.$$eval('[data-testid^="toggle-"][role="switch"]', (els) =>
    els.map((e) => ({
      id: e.getAttribute('data-testid'),
      role: e.getAttribute('role'),
      value: e.getAttribute('data-value'),
      state: e.getAttribute('data-state'),
      disabled: e.getAttribute('data-disabled') === 'true',
    })),
  )
  log(`  switches (in DOM order):`)
  switches.forEach((s) => log(`    ${s.id.padEnd(16)} value=${s.value.padEnd(9)} state=${s.state}`))
  /*
    FIVE, not four: the four axes came across from the old page unchanged, and the
    fifth is new here -- it turns the same four axes into a filter over the sprite
    catalogue below. The order assertion is therefore about the four axes leading,
    with the grid filter last, rather than about the total.
  */
  check(
    'five switches: the four axes plus the grid filter',
    switches.length === 5,
    `(${switches.length})`,
  )
  check(
    'all of them use role="switch" (not plain buttons)',
    switches.every((s) => s.role === 'switch'),
  )
  const ids = switches.map((s) => s.id)
  check(
    'the four axes come first, in order source, shiny, motion, gender',
    JSON.stringify(ids.slice(0, 4)) ===
      JSON.stringify(['toggle-source', 'toggle-shiny', 'toggle-motion', 'toggle-gender']),
    ids.join(','),
  )
  check('and the grid filter is last', ids[4] === 'toggle-grid-filter', ids.join(','))
  const defaults = Object.fromEntries(switches.map((s) => [s.id, s.value]))
  log(`  defaults: ${JSON.stringify(defaults)}`)
  check('Source defaults to Artwork', defaults['toggle-source'] === 'Artwork')
  check('Color defaults to Regular', defaults['toggle-shiny'] === 'Regular')
  check('Motion defaults to Static', defaults['toggle-motion'] === 'Static')
  check('Gender defaults to Male', defaults['toggle-gender'] === 'Male')
  check('the grid filter defaults to off', defaults['toggle-grid-filter'] === 'All sprites')

  /*
    THE FILTER IS OPT-IN, and this is the assertion that pins why. With it off the
    grid is the whole catalogue; with it on the default axes (artwork, regular,
    static, male) narrow it to the one official artwork. Applying it
    unconditionally would have made that the tab's opening state.
  */
  const gridBefore = await page.$eval('[data-testid="species-sprites"]', (el) => ({
    shown: Number(el.getAttribute('data-tiles')),
    all: Number(el.getAttribute('data-all-tiles')),
    filtered: el.getAttribute('data-filtered'),
  }))
  await page.click('[data-testid="toggle-grid-filter"]')
  await page.waitForSelector('[data-testid="sprites-filter-count"]', { timeout: 15000 })
  const gridAfter = await page.$eval('[data-testid="species-sprites"]', (el) => ({
    shown: Number(el.getAttribute('data-tiles')),
    all: Number(el.getAttribute('data-all-tiles')),
    filtered: el.getAttribute('data-filtered'),
  }))
  const artworkCards = await page.$$eval('[data-testid^="sprite-artwork-"]', (e) => e.length)
  log(
    `  grid off: ${gridBefore.shown}/${gridBefore.all} tiles; on: ${gridAfter.shown}/${gridAfter.all}`,
  )
  check('the grid shows every tile while the filter is off', gridBefore.shown === gridBefore.all)
  check('the filter is off by default', gridBefore.filtered === 'false')
  check(
    'turning it on narrows the grid',
    gridAfter.shown < gridBefore.all && gridAfter.filtered === 'true',
  )
  check(
    'and the default axes leave exactly the one regular official artwork',
    gridAfter.shown === 0 && artworkCards === 1,
    `${gridAfter.shown} tiles, ${artworkCards} artwork card(s)`,
  )
  await page.click('[data-testid="toggle-grid-filter"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="species-sprites"]')?.getAttribute('data-filtered') ===
      'false',
    undefined,
    { timeout: 15000 },
  )

  // Source = In-game must disable Motion and force it to Static.
  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="toggle-motion"]')?.getAttribute('data-state') === 'on',
    undefined,
    { timeout: 10000 },
  )
  const animatedOn = await switchState('motion')
  log(`  motion after enabling animation: ${JSON.stringify(animatedOn)}`)
  check('motion can be switched to Animated on the artwork source', animatedOn.value === 'Animated')

  await page.click('[data-testid="toggle-source"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="toggle-source"]')?.getAttribute('data-value') ===
      'In-game',
    undefined,
    { timeout: 10000 },
  )
  const motionUnderInGame = await switchState('motion')
  const inGameImg = await imgState()
  log(`  motion under in-game source: ${JSON.stringify(motionUnderInGame)}`)
  log(`  in-game src: ${inGameImg.src} (data-src-kind=${inGameImg.kind})`)
  check('motion switch disabled under In-game', motionUnderInGame.disabled === true)
  check(
    'motion forced back to Static under In-game',
    motionUnderInGame.value === 'Static' && motionUnderInGame.state === 'off',
  )
  check('a reason is given, not a silent drop', (motionUnderInGame.reason ?? '').length > 10)
  check('the displayed image is the in-game sprite', inGameImg.mode === 'in-game-static')
  check(
    'in-game sprite path is the plain sprite dir',
    /\/sprites\/pokemon\/1\.png$/.test(inGameImg.src),
    inGameImg.src,
  )
  await page.screenshot({ path: `${SHOTS}/ux-item2-toggles.png` })

  // -------------------------------------------------------------- ITEM 3
  hr('ITEM 3 (DOM) — gender availability differs per mode, per species')
  // Bulbasaur: no gendered image anywhere -> disabled in all three modes.
  const bulbaInGame = await switchState('gender')
  check('Bulbasaur / in-game static: gender disabled', bulbaInGame.disabled === true)
  await page.click('[data-testid="toggle-source"]') // back to artwork
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="toggle-source"]')?.getAttribute('data-value') ===
      'Artwork',
    undefined,
    { timeout: 10000 },
  )
  const bulbaArtStatic = await switchState('gender')
  check('Bulbasaur / artwork static: gender disabled', bulbaArtStatic.disabled === true)

  // Venusaur (#3) DOES have gendered in-game and animated images.
  await search('venusaur', 3)
  await openSprites(3)
  await waitLoaded()
  const venusaurModes = {}
  venusaurModes['artwork-static'] = await switchState('gender')
  await page.click('[data-testid="toggle-source"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'in-game-static',
    undefined,
    { timeout: 10000 },
  )
  venusaurModes['in-game-static'] = await switchState('gender')
  await page.click('[data-testid="toggle-source"]')
  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'artwork-animated',
    undefined,
    { timeout: 10000 },
  )
  venusaurModes['artwork-animated'] = await switchState('gender')
  log('  Venusaur (#3) gender switch per mode:')
  for (const [mode, s] of Object.entries(venusaurModes)) {
    log(`    ${mode.padEnd(18)} disabled=${s.disabled}`)
  }
  check(
    'Venusaur / in-game static: gender ENABLED',
    venusaurModes['in-game-static'].disabled === false,
  )
  check(
    'Venusaur / artwork static: gender DISABLED (no gendered official artwork)',
    venusaurModes['artwork-static'].disabled === true,
  )
  check(
    'Venusaur / artwork animated: gender ENABLED',
    venusaurModes['artwork-animated'].disabled === false,
  )

  // The female image must actually differ and actually load, in both modes that
  // offer it -- that is what "don't mislabel the male image" means in practice.
  const maleAnimated = await imgState()
  await page.click('[data-testid="toggle-gender"]')
  await waitSrcChange(maleAnimated.src)
  await waitLoaded()
  const femaleAnimated = await imgState()
  log(`  animated male   : ${maleAnimated.src}`)
  log(`  animated female : ${femaleAnimated.src}`)
  check('animated female URL is the -f asset', femaleAnimated.src.endsWith('-f.webp'))
  check('animated male URL is the -m asset', maleAnimated.src.endsWith('-m.webp'))
  check('animated female image rendered', femaleAnimated.naturalWidth > 0)

  await page.click('[data-testid="toggle-source"]') // -> in-game, gender stays female
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'in-game-static',
    undefined,
    { timeout: 10000 },
  )
  await waitLoaded()
  const femaleInGame = await imgState()
  log(`  in-game female  : ${femaleInGame.src}`)
  check(
    'in-game female uses the /female/ sprite path',
    femaleInGame.src.includes('/pokemon/female/3.png'),
    femaleInGame.src,
  )
  check('in-game female sprite rendered', femaleInGame.naturalWidth > 0)
  check('img reports gender=female', femaleInGame.gender === 'female')

  // Back to artwork, then back to Static. Note the app REMEMBERS the Animated
  // choice across the in-game round trip -- Motion is only forced to Static
  // while the in-game source is selected, not permanently reset -- so Static has
  // to be re-selected explicitly here.
  await page.click('[data-testid="toggle-source"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'artwork-animated',
    undefined,
    { timeout: 10000 },
  )
  const remembered = await switchState('motion')
  log(`  motion after returning to the artwork source: ${JSON.stringify(remembered)}`)
  check('Animated is remembered across an in-game round trip', remembered.value === 'Animated')
  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'artwork-static',
    undefined,
    { timeout: 10000 },
  )
  const artStaticImg = await imgState()
  log(`  artwork-static after having chosen female: gender=${artStaticImg.gender}`)
  check(
    'artwork-static reports gender n/a instead of mislabelling',
    artStaticImg.gender === 'n/a',
    `(${artStaticImg.gender})`,
  )
  check(
    'artwork-static shows the ungendered official artwork',
    artStaticImg.src.includes('other/official-artwork/3.png'),
    artStaticImg.src,
  )
  await page.screenshot({ path: `${SHOTS}/ux-item3-gender-modes.png` })

  // -------------------------------------------------------------- ITEM 4
  hr('ITEM 4 (DOM) — type filter buttons carry the real type colour; "Any" clears')
  /*
    THE COMMUNITY PALETTE, which is now the only type palette in the app.

    This table used to hold the Bulbapedia template transcription that lived in
    typeColors.ts. Both that and the muted custom set are retired: the community
    hexes are what type text resolves to (per theme, contrast-adjusted -- see
    design-tokens.json) and what these filled filter buttons paint directly,
    which is what the palette was originally drawn for.

    Left as literals rather than imported from src/: a test that reads its
    expectations out of the code under test cannot detect the code changing.
  */
  const EXPECTED = {
    normal: '#A8A878',
    fire: '#F08030',
    water: '#6890F0',
    electric: '#F8D030',
    grass: '#78C850',
    ice: '#98D8D8',
    fighting: '#C03028',
    poison: '#A040A0',
    ground: '#E0C068',
    flying: '#A890F0',
    psychic: '#F85888',
    bug: '#A8B820',
    rock: '#B8A038',
    ghost: '#705898',
    dragon: '#7038F8',
    dark: '#705848',
    steel: '#B8B8D0',
    fairy: '#EE99AC',
  }
  const hexToRgb = (h) =>
    `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`

  // Back to the grid first. The rebuilt detail page REPLACES the list rather than
  // sitting beside it, so the row counts this block compares do not exist while a
  // species is open -- the old rail-plus-detail layout always had both on screen.
  await backToGrid()
  // Clear the name search too: a leftover term would make both counts equal and
  // the "Any restores the list" assertion vacuous.
  await withControls(() => page.fill('[data-testid="species-search"]', ''))
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length > 100,
    undefined,
    { timeout: 15000 },
  )
  const anyBtn = await page.$('[data-testid="type-filter-any"]')
  check('an "Any" button exists', anyBtn != null)

  // Unselected buttons must NOT be coloured, otherwise "selected" carries no signal.
  const fireUnselected = await page.$eval('[data-testid="type-filter-fire"]', (el) => ({
    bg: getComputedStyle(el).backgroundColor,
    pressed: el.getAttribute('aria-pressed'),
  }))
  await withControls(() => page.click('[data-testid="type-filter-fire"]'))
  await withControls(() => page.click('[data-testid="type-filter-water"]'))
  await withControls(() => page.click('[data-testid="type-filter-grass"]'))
  const selectedColors = await page.$$eval('.type-filter [aria-pressed="true"][data-type]', (els) =>
    els.map((e) => ({
      type: e.getAttribute('data-type'),
      declared: e.getAttribute('data-color'),
      computed: getComputedStyle(e).backgroundColor,
      text: getComputedStyle(e).color,
    })),
  )
  log(`  fire unselected background: ${fireUnselected.bg} (pressed=${fireUnselected.pressed})`)
  selectedColors.forEach((c) =>
    log(`  ${c.type.padEnd(9)} declared=${c.declared} computed=${c.computed} text=${c.text}`),
  )
  check(
    'unselected buttons are not colour-filled',
    fireUnselected.bg === 'rgba(0, 0, 0, 0)' || fireUnselected.bg === 'transparent',
    fireUnselected.bg,
  )
  check('three types are selected', selectedColors.length === 3, `(${selectedColors.length})`)
  for (const c of selectedColors) {
    check(
      `${c.type} renders its community-palette colour ${EXPECTED[c.type]}`,
      c.declared === EXPECTED[c.type] && c.computed === hexToRgb(EXPECTED[c.type]),
      `${c.computed} vs ${hexToRgb(EXPECTED[c.type])}`,
    )
  }
  // Every type button must declare the palette value, not just the three clicked.
  const declaredAll = await page.$$eval('.type-filter [data-type]', (els) =>
    els.map((e) => [e.getAttribute('data-type'), e.getAttribute('data-color')]),
  )
  const mismatches = declaredAll.filter(([t, c]) => EXPECTED[t] && c !== EXPECTED[t])
  log(`  type buttons rendered: ${declaredAll.length}, palette mismatches: ${mismatches.length}`)
  check('all type buttons declare the cited palette', mismatches.length === 0)

  const filteredRows = await page.$$eval(
    '[data-testid="species-rows"] [data-species-id]',
    (e) => e.length,
  )
  await withControls(() => page.click('[data-testid="type-filter-any"]'))
  await page.waitForFunction(
    () => document.querySelectorAll('.type-filter [aria-pressed="true"][data-type]').length === 0,
    undefined,
    { timeout: 10000 },
  )
  const clearedRows = await page.$$eval(
    '[data-testid="species-rows"] [data-species-id]',
    (e) => e.length,
  )
  const anyPressed = await page.getAttribute('[data-testid="type-filter-any"]', 'aria-pressed')
  log(`  rows with fire+water+grass selected: ${filteredRows}`)
  log(`  rows after clicking "Any"           : ${clearedRows}`)
  check('"Any" clears every type selection', anyPressed === 'true')
  check(
    'the three types did filter the list down',
    filteredRows > 0 && filteredRows < 493,
    `(${filteredRows})`,
  )
  check(
    '"Any" restores the full unfiltered list',
    clearedRows === 493 && clearedRows > filteredRows,
    `(${filteredRows} -> ${clearedRows})`,
  )
  await page.screenshot({ path: `${SHOTS}/ux-item4-type-colors.png` })

  // -------------------------------------------------------------- ITEM 5
  hr('ITEM 5 (DOM) — "All" option shows the whole dex')
  const allOption = await page.$eval('[data-testid="vg-select"] > option', (el) => ({
    value: el.value,
    text: el.textContent,
    grouped: el.parentElement.tagName === 'OPTGROUP',
  }))
  log(`  first ungrouped option: value=${allOption.value} text=${JSON.stringify(allOption.text)}`)
  check('an ungrouped "All" option exists', allOption.value === 'all' && !allOption.grouped)
  check('its label names the dex ceiling from the constant', allOption.text.includes('493'))

  await withControls(() => page.fill('[data-testid="species-search"]', ''))
  await withControls(() => page.selectOption('[data-testid="vg-select"]', 'all'))
  // Same swap as elsewhere: the scope readout is gone, the select holds the state.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vg-select"]')?.value === 'all',
    undefined,
    { timeout: 20000 },
  )
  const allIds = await page.$$eval('[data-testid="species-rows"] [data-species-id]', (els) =>
    els.map((e) => Number(e.getAttribute('data-species-id'))),
  )
  log(
    `  rows under "All": ${allIds.length}, min=${Math.min(...allIds)}, max=${Math.max(...allIds)}`,
  )
  check('all 493 species listed', allIds.length === 493, `(${allIds.length})`)
  check('ids run 1..493', Math.min(...allIds) === 1 && Math.max(...allIds) === 493)

  /*
    WHAT "ALL" MEANS ON THE DETAIL PAGE CHANGED, and this is the assertion that
    records it. The old page asked the reader to pick a game before it would show a
    learnset or an encounter list, because it had no game of its own to fall back
    on. The rebuilt page does: the Learnset and Description tabs carry a
    species-local generation control, so "All" seeds them at the newest era the
    species exists in and they show real rows immediately.

    That is a deliberate improvement, not a silently dropped guard -- the two
    "pick a specific game" notes no longer exist because nothing is ever left
    without a game.
  */
  await search('eevee', 133)
  await openSpecies(133)
  await openTab('Learnset')
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
    timeout: 60000,
  })
  const underAll = await page.evaluate(() => ({
    versionGroup: document
      .querySelector('[data-testid="species-learnset"]')
      ?.getAttribute('data-version-group'),
    rows: [...document.querySelectorAll('.species-learn-group')].reduce(
      (n, e) => n + Number(e.getAttribute('data-rows')),
      0,
    ),
    needsGame: document.querySelectorAll('[data-testid="needs-version-group"]').length,
    activeGeneration: document
      .querySelector('[data-testid^="learnset-scope-generation-"][data-active="true"]')
      ?.getAttribute('data-testid'),
  }))
  log(`  under All: scope=${underAll.versionGroup}, ${underAll.rows} learnset rows`)
  log(`  active generation segment: ${underAll.activeGeneration}`)
  check(
    'under All the page falls back to its own newest era',
    underAll.versionGroup === 'heartgold-soulsilver',
    underAll.versionGroup,
  )
  check(
    'and shows real rows rather than asking for a game',
    underAll.rows > 0,
    `(${underAll.rows})`,
  )
  check('so no "pick a specific game" note is needed', underAll.needsGame === 0)

  // Switching the app selector back must not disturb a page that already has a
  // game of its own.
  await withControls(() => page.selectOption('[data-testid="vg-select"]', 'heartgold-soulsilver'))
  await page.waitForFunction(
    () => document.querySelector('[data-testid="vg-select"]')?.value === 'heartgold-soulsilver',
    undefined,
    { timeout: 30000 },
  )
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
    timeout: 60000,
  })
  const restoredRows = await page.evaluate(() =>
    [...document.querySelectorAll('.species-learn-group')].reduce(
      (n, e) => n + Number(e.getAttribute('data-rows')),
      0,
    ),
  )
  log(`  after switching back to heartgold-soulsilver: learnset rows=${restoredRows}`)
  check('per-game learnset still resolves after leaving All', restoredRows > 0)
  await openTab('Info')
  await page.screenshot({ path: `${SHOTS}/ux-item5-all.png` })

  // -------------------------------------------------------------- ITEM 6
  hr('ITEM 6 (DOM) — pinned left track, scrolling right column, nothing overflows')
  /*
    THE LAYOUT CLAIM CHANGED SHAPE, not standard. It used to be "a 240px species
    rail that never flex-grows, beside a detail column of bordered cards". The
    rebuilt page has no rail and no cards: it is a 420px pinned track holding the
    hero, beside the one region on the page that scrolls. So the assertions are
    re-derived from the new geometry rather than renamed onto it.

    420px is not a magic number here either -- it is .ds-hero's own max-width, so
    the track is exactly the card it holds.
  */
  const layout = await page.evaluate(() => {
    const page_ = document.querySelector('.species-page')
    const pinned = document.querySelector('[data-testid="species-page-pinned"]')
    const scroll = document.querySelector('[data-testid="species-page-scroll"]')
    return {
      gridColumns: getComputedStyle(page_).gridTemplateColumns,
      pageWidth: Math.round(page_.getBoundingClientRect().width),
      pinnedWidth: Math.round(pinned.getBoundingClientRect().width),
      scrollWidth: Math.round(scroll.getBoundingClientRect().width),
      pinnedOverflow: getComputedStyle(pinned).overflow,
    }
  })
  log(`  grid-template-columns: ${layout.gridColumns}`)
  log(
    `  page=${layout.pageWidth}px  pinned=${layout.pinnedWidth}px  scrolling=${layout.scrollWidth}px`,
  )
  check(
    'the pinned track is exactly 420px',
    layout.pinnedWidth === 420,
    `(${layout.pinnedWidth}px)`,
  )
  check('and cannot scroll itself', layout.pinnedOverflow === 'hidden', layout.pinnedOverflow)
  check(
    'the right column takes the rest',
    layout.scrollWidth > layout.pageWidth - 420 - 40 && layout.scrollWidth < layout.pageWidth,
    `(${layout.scrollWidth} of ${layout.pageWidth})`,
  )

  // The pinned track must stay 420px when the window grows: "not flex-growing".
  await page.setViewportSize({ width: 1900, height: 1000 })
  await page.waitForTimeout(200)
  const wideLayout = await page.evaluate(() => ({
    pinnedWidth: Math.round(
      document.querySelector('[data-testid="species-page-pinned"]').getBoundingClientRect().width,
    ),
    scrollWidth: Math.round(
      document.querySelector('[data-testid="species-page-scroll"]').getBoundingClientRect().width,
    ),
  }))
  log(
    `  at 1900px viewport: pinned=${wideLayout.pinnedWidth}px scrolling=${wideLayout.scrollWidth}px`,
  )
  check('pinned track stays 420px at a wider viewport', wideLayout.pinnedWidth === 420)
  check('the right column absorbed the extra width', wideLayout.scrollWidth > layout.scrollWidth)
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.waitForTimeout(200)

  /*
    EXACTLY ONE SCROLLING REGION, which is the whole app's scroll model: the page
    is viewport-locked and only an inner region ever moves. Measured at this
    viewport rather than trusting the species-page suite's measurement at another.
  */
  const scrollables = await page.$$eval('*', (els) =>
    els
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'inline') return false
        const scrolls = ['auto', 'scroll']
        return (
          (scrolls.includes(cs.overflowY) && el.scrollHeight - el.clientHeight > 8) ||
          (scrolls.includes(cs.overflowX) && el.scrollWidth - el.clientWidth > 8)
        )
      })
      .map((el) => `${el.tagName}.${el.className?.toString().split(' ').join('.')}`),
  )
  log(`  scrollable elements: ${scrollables.join(' | ') || 'none'}`)
  check(
    'the right column is the only scrolling region',
    scrollables.length === 1 && scrollables[0].includes('species-page-scroll'),
    `(${scrollables.length})`,
  )

  const pinnedTopBefore = await page.$eval('[data-testid="species-page-pinned"]', (el) =>
    Math.round(el.getBoundingClientRect().top),
  )
  await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTo({ top: 1200 }))
  await page.waitForTimeout(150)
  const pinnedTopAfter = await page.$eval('[data-testid="species-page-pinned"]', (el) =>
    Math.round(el.getBoundingClientRect().top),
  )
  const scrolledBy = await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTop)
  log(
    `  scrolled the right column by ${scrolledBy}px; pinned top ${pinnedTopBefore} -> ${pinnedTopAfter}`,
  )
  check('the pinned track does not move with it', pinnedTopBefore === pinnedTopAfter)
  check('and the right column really moved', scrolledBy > 100, `(${scrolledBy}px)`)
  await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTo({ top: 0 }))

  /*
    THE SUB-NAV IS PAGE-LOCAL AND SCROLLS WITH ITS PANEL -- it belongs to the
    content, not to the app bar, and that is what stops it reading as a second
    level of app navigation.
  */
  const subnav = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="species-page-subnav"]')
    const scroll = document.querySelector('[data-testid="species-page-scroll"]')
    return {
      insideScroller: scroll.contains(nav),
      tabs: [...nav.querySelectorAll('.ds-tab')].map((e) => e.textContent.trim()),
      activeUnderline: getComputedStyle(nav.querySelector('.ds-tab[aria-selected="true"]'))
        .borderBottomWidth,
    }
  })
  log(`  sub-nav tabs: ${subnav.tabs.join(' | ')}  activeUnderline=${subnav.activeUnderline}`)
  check('the sub-nav lives inside the scrolling column', subnav.insideScroller)
  check(
    'and carries the four page tabs',
    subnav.tabs.join(',') === 'Info,Learnset,Description,Sprites',
    subnav.tabs.join(','),
  )
  check('the active tab has the 2px accent underline', subnav.activeUnderline === '2px')

  /* The stat bars must fit the column they are in, not spill past it. */
  const chart = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="species-base-stats"]')
    const bars = block.querySelector('.species-stat-bars')
    const scroll = document.querySelector('[data-testid="species-page-scroll"]')
    return {
      blockRight: Math.round(block.getBoundingClientRect().right),
      barsRight: Math.round(bars.getBoundingClientRect().right),
      barsWidth: Math.round(bars.getBoundingClientRect().width),
      columnWidth: Math.round(scroll.getBoundingClientRect().width),
    }
  })
  log(
    `  stat bars ${chart.barsWidth}px inside a ${chart.columnWidth}px column (right edges ${chart.barsRight} <= ${chart.blockRight})`,
  )
  check('stat bars fit inside their block', chart.barsRight <= chart.blockRight)
  check(
    'and are sized to the block, not the column',
    chart.barsWidth < chart.columnWidth,
    `(${chart.barsWidth} vs ${chart.columnWidth})`,
  )
  const hOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  check('no horizontal page overflow', hOverflow <= 0, `(${hOverflow}px)`)
  await page.screenshot({ path: `${SHOTS}/ux-item6-layout.png`, fullPage: true })

  // -------------------------------------------------------------- ITEM 7
  hr('ITEM 7 (DOM) — evolution tree renders artwork nodes, nested layout, labelled arrows')
  // Evolution thumbnails are loading="lazy": a node below the fold legitimately
  // has not loaded yet. Scroll the card into view and wait, so the assertion
  // tests "the thumbnail loads" and not "it loads while off-screen".
  const settleEvolutionThumbs = async () => {
    await page.$eval('[data-testid="species-evolution"]', (el) =>
      el.scrollIntoView({ block: 'center' }),
    )
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('[data-testid="evolution-tree"] img')]
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)
      },
      undefined,
      { timeout: 30000 },
    )
  }

  await settleEvolutionThumbs()

  const eeveeTree = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="evolution-tree"]')
    const nodes = [...root.querySelectorAll('[data-testid^="evo-node-"]')].map((e) => ({
      id: Number(e.getAttribute('data-species-id')),
      current: e.getAttribute('data-current') === 'true',
      name: e.querySelector('.evo-name')?.textContent,
      img: e.querySelector('img')?.getAttribute('src') ?? null,
      imgLoaded: (e.querySelector('img')?.naturalWidth ?? 0) > 0,
      left: Math.round(e.getBoundingClientRect().left),
      top: Math.round(e.getBoundingClientRect().top),
    }))
    const triggers = [...root.querySelectorAll('.evo-trigger')].map((e) => ({
      kind: e.getAttribute('data-kind'),
      icon: e.querySelector('svg')?.getAttribute('data-icon') ?? null,
      // The second register: a painted PNG instead of a Tabler svg. Exactly one
      // of the two is present per arrow.
      painted: e.querySelector('.evo-painted-icon')?.getAttribute('data-evo-icon') ?? null,
      caption: e.querySelector('.evo-trigger-text')?.textContent ?? '',
      title: e.getAttribute('title'),
    }))
    const children = root.querySelector('[data-testid="evo-children-133"]')
    return {
      nodes,
      triggers,
      branches: root.getAttribute('data-root-branches'),
      childCount: children ? Number(children.getAttribute('data-branches')) : 0,
      childrenColumn: children ? getComputedStyle(children).flexDirection : null,
      subtreeRow: getComputedStyle(root.querySelector('.evo-subtree')).flexDirection,
    }
  })
  log(`  root branches: ${eeveeTree.branches}, children container: ${eeveeTree.childCount} items`)
  log(`  .evo-subtree flex-direction=${eeveeTree.subtreeRow} (parent left, children right)`)
  log(`  .evo-children flex-direction=${eeveeTree.childrenColumn} (children stacked vertically)`)
  eeveeTree.nodes.forEach((n) =>
    log(
      `    #${String(n.id).padStart(3, '0')} ${String(n.name).padEnd(10)} left=${String(n.left).padStart(5)} top=${String(n.top).padStart(5)} img=${n.imgLoaded ? 'loaded' : 'MISSING'}`,
    ),
  )
  check(
    'every node renders artwork',
    eeveeTree.nodes.every((n) => n.img != null),
  )
  check(
    'every node artwork actually loaded',
    eeveeTree.nodes.every((n) => n.imgLoaded),
  )
  check(
    'node artwork is official artwork, not text-only',
    eeveeTree.nodes.every((n) => n.img.includes('official-artwork')),
  )
  check('parent sits left of its children', eeveeTree.nodes[0].left < eeveeTree.nodes[1].left)
  const childTops = eeveeTree.nodes.slice(1).map((n) => n.top)
  check(
    'children are stacked vertically (distinct tops)',
    new Set(childTops).size === childTops.length,
    `${childTops.length} children, ${new Set(childTops).size} distinct tops`,
  )
  check('children container is a vertical stack', eeveeTree.childrenColumn === 'column')
  check('subtree lays out horizontally', eeveeTree.subtreeRow === 'row')
  check('Eevee shows all its branches', Number(eeveeTree.branches) >= 7, eeveeTree.branches)

  log('  arrow labels:')
  eeveeTree.triggers.forEach((t) =>
    log(
      `    kind=${(t.kind ?? '?').padEnd(11)} ${t.painted ? `painted=${t.painted.padEnd(24)}` : `tabler=${(t.icon ?? 'NONE').padEnd(25)}`} "${t.caption}"`,
    ),
  )
  /*
    TWO REGISTERS NOW, and this block used to assume one.

    It asserted that every arrow carries a Tabler svg matching TRIGGER_ICON_NAMES
    for its kind. That is still the rule for the generic conditions, but the
    painted set in public/evo-icons/ now takes precedence for the specific ones --
    Eevee's Espeon shows a sun rather than IconHeart, because the time of day is
    what separates it from Umbreon. So the claim splits in two rather than being
    weakened: exactly one register per arrow, and the Tabler mapping still exact
    wherever no painted icon applies.
  */
  check(
    'every arrow carries an icon in one register or the other',
    eeveeTree.triggers.every((t) => t.icon != null || t.painted != null),
    eeveeTree.triggers.filter((t) => !t.icon && !t.painted).length + ' bare',
  )
  check(
    'and never both at once',
    eeveeTree.triggers.every((t) => !(t.icon != null && t.painted != null)),
  )
  check(
    'every Tabler icon still matches the declared mapping for its kind',
    eeveeTree.triggers
      .filter((t) => t.painted == null)
      .every((t) => TRIGGER_ICON_NAMES[t.kind] === t.icon),
    eeveeTree.triggers
      .filter((t) => t.painted == null && TRIGGER_ICON_NAMES[t.kind] !== t.icon)
      .map((t) => `${t.kind}:${t.icon}`)
      .join(', ') || 'all match',
  )
  check(
    'every painted icon is one of the eleven in the manifest',
    eeveeTree.triggers
      .filter((t) => t.painted != null)
      .every((t) => PAINTED_ICON_KEYS.includes(t.painted)),
    eeveeTree.triggers
      .filter((t) => t.painted && !PAINTED_ICON_KEYS.includes(t.painted))
      .map((t) => t.painted)
      .join(', ') || 'all known',
  )
  check(
    'no arrow icon is a Poke Ball',
    eeveeTree.triggers.every((t) => !/Ball|CircleDot/i.test(t.icon ?? '')),
  )
  check(
    'non-trade arrows carry a caption',
    eeveeTree.triggers.filter((t) => t.kind !== 'trade').every((t) => t.caption.length > 0),
  )

  // Walk species that exercise the other trigger kinds, so all six brief-named
  // kinds are seen in the real DOM rather than only in the data census.
  const TRIGGER_TOUR = [
    { id: 133, name: 'Eevee', kinds: ['stone', 'friendship', 'location'] },
    { id: 190, name: 'Aipom', kinds: ['move'] },
    { id: 95, name: 'Onix', kinds: ['trade-item'] },
    { id: 64, name: 'Kadabra', kinds: ['trade'] },
    { id: 4, name: 'Charmander', kinds: ['level'] },
    { id: 440, name: 'Happiny', kinds: ['held-item'] },
  ]
  const seenKinds = new Map()
  for (const stop of TRIGGER_TOUR) {
    // The detail page replaces the grid, so each stop has to return to the list
    // before it can search for the next one.
    await backToGrid()
    await withControls(() => page.fill('[data-testid="species-search"]', stop.name.toLowerCase()))
    await page.waitForSelector(`[data-testid="species-row-${stop.id}"]`, { timeout: 15000 })
    await openSpecies(stop.id)
    const found = await page.$$eval('[data-testid="evolution-tree"] .evo-trigger', (els) =>
      els.map((e) => [
        e.getAttribute('data-kind'),
        e.querySelector('svg')?.getAttribute('data-icon'),
        e.querySelector('.evo-trigger-text')?.textContent ?? '',
        e.querySelector('.evo-painted-icon')?.getAttribute('data-evo-icon') ?? null,
      ]),
    )
    log(`  ${stop.name} (#${stop.id}):`)
    found.forEach(([k, i, c, p]) => {
      log(`    ${String(k).padEnd(11)} ${String(p ?? i).padEnd(24)} "${c}"`)
      if (!seenKinds.has(k)) seenKinds.set(k, [p ?? i, c])
    })
    /*
      THE EXPECTED REGISTER IS DERIVED, NOT RESTATED. For each kind on the tour,
      the first matching detail is pulled from the bundle and run through
      paintedIconKey; if that yields a key the arrow must carry the painted icon,
      otherwise it must carry exactly the Tabler glyph the kind maps to.

      This is why Onix and Kadabra both land on the painted trade icon, and why
      Happiny -- which evolves in the DAY while holding an Oval Stone -- shows a
      sun rather than IconHandGrab. Nothing about those cases is hardcoded here.
    */
    for (const kind of stop.kinds) {
      const hit = found.find(([k]) => k === kind)
      const detail = (childDetailsByParent.get(stop.id) ?? []).find((d) => triggerKind(d) === kind)
      const expectPainted = detail ? paintedIconKey(detail) : null
      if (expectPainted) {
        check(
          `${stop.name} shows a ${kind} arrow with the painted "${expectPainted}"`,
          hit != null && hit[3] === expectPainted,
          hit ? `painted=${hit[3]} caption="${hit[2]}"` : 'not found',
        )
      } else {
        check(
          `${stop.name} shows a ${kind} arrow with ${TRIGGER_ICON_NAMES[kind]}`,
          hit != null && hit[1] === TRIGGER_ICON_NAMES[kind] && hit[3] == null,
          hit ? `icon=${hit[1]} painted=${hit[3]} caption="${hit[2]}"` : 'not found',
        )
      }
    }
  }
  log('')
  log('  icon actually observed in the DOM per kind:')
  for (const [kind, [icon, caption]] of [...seenKinds].sort()) {
    log(`    ${String(kind).padEnd(11)} ${String(icon).padEnd(20)} e.g. "${caption}"`)
  }
  check(
    'plain trade renders icon-only (no caption)',
    (seenKinds.get('trade') ?? [null, 'x'])[1] === '',
    JSON.stringify(seenKinds.get('trade')),
  )

  // Shiny follows the detail toggle; the node stays static and default-gender.
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'eevee'))
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  /*
    .evo-thumb img, not every img in the tree. The tree now also contains painted
    condition icons, which are <img> elements and are correctly NOT affected by the
    shiny toggle -- a bare `img` selector swept them in and read as "a node failed
    to switch". Narrowed to the species thumbnails, which is what the claim below
    has always been about.
  */
  const THUMB_SELECTOR = '[data-testid="evolution-tree"] .evo-thumb img'
  const regularNodes = await page.$$eval(THUMB_SELECTOR, (els) =>
    els.map((e) => e.getAttribute('src')),
  )
  /*
    TWO TABS FOR ONE CLAIM. The colour toggle is on the Sprites tab and the chart
    is on Info, so this is now a round trip -- which is exactly the behaviour worth
    asserting: the artwork view is owned by the PAGE, not by the tab that shows the
    switch, so a shiny selection survives the tab change and reaches the chart.
    Held in tab-local state it would not.
  */
  await openTab('Sprites')
  await page.waitForSelector('[data-testid="toggle-shiny"]', { timeout: 30000 })
  await page.click('[data-testid="toggle-shiny"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="toggle-shiny"]')?.getAttribute('data-value') ===
      'Shiny',
    undefined,
    { timeout: 10000 },
  )
  await openTab('Info')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="evolution-tree"]')?.getAttribute('data-shiny') ===
      'true',
    undefined,
    { timeout: 10000 },
  )
  check('the colour axis survives the tab change and reaches the chart', true)
  await settleEvolutionThumbs()
  const shinyNodes = await page.$$eval(THUMB_SELECTOR, (els) =>
    els.map((e) => ({ src: e.getAttribute('src'), loaded: e.naturalWidth > 0 })),
  )
  log(`  regular node[0]: ${regularNodes[0]}`)
  log(`  shiny   node[0]: ${shinyNodes[0].src}`)
  log(`  thumbs compared : ${shinyNodes.length} (painted condition icons excluded)`)
  // The painted icons must still be there -- narrowing the selector must not have
  // been achieved by the icons quietly disappearing.
  const paintedInTree = await page.$$eval(
    '[data-testid="evolution-tree"] .evo-painted-icon',
    (els) => els.map((e) => e.getAttribute('data-evo-icon')),
  )
  log(`  painted icons still present: ${paintedInTree.join(', ') || '(none)'}`)
  check(
    'the painted condition icons are unaffected by the shiny toggle',
    paintedInTree.length > 0 && paintedInTree.every((k) => PAINTED_ICON_KEYS.includes(k)),
    paintedInTree.join(', '),
  )
  check(
    'every evolution node switched to shiny artwork',
    shinyNodes.every((n) => n.src.includes('official-artwork/shiny/')),
  )
  check(
    'shiny node artwork loaded',
    shinyNodes.every((n) => n.loaded),
  )
  check(
    'nodes stay on static official artwork (no animated webp)',
    shinyNodes.every((n) => !n.src.endsWith('.webp')),
  )
  // Turning on animation for the featured image must NOT animate the tree. Same
  // round trip: switch it on Sprites, then come back and look at the chart.
  await openTab('Sprites')
  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'artwork-animated',
    undefined,
    { timeout: 10000 },
  )
  await openTab('Info')
  await settleEvolutionThumbs()
  // Same narrowing as above: compare thumbnails against thumbnails, or the
  // painted icons make the two lists different lengths and the claim never holds.
  const afterMotion = await page.$$eval(THUMB_SELECTOR, (els) =>
    els.map((e) => e.getAttribute('src')),
  )
  check(
    'tree ignores the motion toggle',
    afterMotion.every((s) => !s.endsWith('.webp')) &&
      JSON.stringify(afterMotion) === JSON.stringify(shinyNodes.map((n) => n.src)),
    `${afterMotion.length} thumbs vs ${shinyNodes.length}`,
  )
  await openTab('Sprites')
  await page.click('[data-testid="toggle-motion"]')
  await openTab('Info')
  await page.screenshot({ path: `${SHOTS}/ux-item7-evolution.png`, fullPage: true })

  // -------------------------------------------------------------- ITEM 8
  hr('ITEM 8 (DOM) — egg-move rows carry an icon')
  /* The learnset is a tab now, and its sections are prefixed species-learn-. */
  await openTab('Learnset')
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
    timeout: 60000,
  })
  const eggInfo = await page.evaluate(() => {
    const eggSection = document.querySelector('[data-testid="species-learn-egg"]')
    if (!eggSection) return null
    const rows = [...eggSection.querySelectorAll('tbody tr')]
    return {
      rows: rows.length,
      withIcon: rows.filter((r) => r.querySelector('svg[data-icon="IconEgg"]')).length,
      firstIcon: rows[0]?.querySelector('svg')?.getAttribute('data-icon') ?? null,
      sample: rows.slice(0, 3).map((r) => r.children[1]?.textContent.trim()),
    }
  })
  log(`  Eevee egg-move rows: ${JSON.stringify(eggInfo)}`)
  check('egg-move section present for Eevee', eggInfo != null && eggInfo.rows > 0)
  check(
    'every egg-move row has an IconEgg',
    eggInfo != null && eggInfo.withIcon === eggInfo.rows,
    `(${eggInfo?.withIcon}/${eggInfo?.rows})`,
  )
  check('the icon is the real Tabler IconEgg', eggInfo?.firstIcon === 'IconEgg')

  // Non-egg methods must NOT get the marker.
  const otherMethods = await page.evaluate(() =>
    ['species-learn-level-up', 'species-learn-machine', 'species-learn-tutor'].map((id) => {
      const s = document.querySelector(`[data-testid="${id}"]`)
      return {
        id,
        rows: s ? s.querySelectorAll('tbody tr').length : 0,
        icons: s ? s.querySelectorAll('svg[data-icon="IconEgg"]').length : 0,
      }
    }),
  )
  otherMethods.forEach((m) => log(`  ${m.id.padEnd(16)} rows=${m.rows} eggIcons=${m.icons}`))
  check(
    'no egg icon leaks into other learn methods',
    otherMethods.every((m) => m.icons === 0),
  )
  await page.screenshot({ path: `${SHOTS}/ux-item8-egg-moves.png` })

  // ------------------------------------------------------- console errors
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 12).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 12).forEach((e) => log(`    ${e}`))
  const failedResponses = responses.filter((r) => r.status >= 400)
  log(`  HTTP >=400     : ${failedResponses.length}`)
  failedResponses.slice(0, 12).forEach((r) => log(`    ${r.status} ${r.url}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed HTTP responses', failedResponses.length === 0, `(${failedResponses.length})`)
} finally {
  if (browser) await browser.close()
  preview.kill()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
