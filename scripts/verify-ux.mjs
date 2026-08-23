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
function walk(node) {
  for (const child of node.evolves_to) {
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
  const search = async (term, expectId) => {
    await page.fill('[data-testid="species-search"]', term)
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
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // -------------------------------------------------------------- ITEM 1
  hr('ITEM 1 (DOM) — static artwork resolves to official artwork, not the in-game sprite')
  await search('bulbasaur', 1)
  await openSpecies(1)
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
  hr('ITEM 2 (DOM) — four real toggle switches with the specified defaults')
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
  check('exactly four switches', switches.length === 4, `(${switches.length})`)
  check(
    'all four use role="switch" (not plain buttons)',
    switches.every((s) => s.role === 'switch'),
  )
  const ids = switches.map((s) => s.id)
  check(
    'switches are source, shiny, motion, gender in order',
    JSON.stringify(ids) ===
      JSON.stringify(['toggle-source', 'toggle-shiny', 'toggle-motion', 'toggle-gender']),
    ids.join(','),
  )
  const defaults = Object.fromEntries(switches.map((s) => [s.id, s.value]))
  log(`  defaults: ${JSON.stringify(defaults)}`)
  check('Source defaults to Artwork', defaults['toggle-source'] === 'Artwork')
  check('Color defaults to Regular', defaults['toggle-shiny'] === 'Regular')
  check('Motion defaults to Static', defaults['toggle-motion'] === 'Static')
  check('Gender defaults to Male', defaults['toggle-gender'] === 'Male')

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
  await openSpecies(3)
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
  const EXPECTED = {
    normal: '#9FA19F',
    fire: '#E62829',
    water: '#2980EF',
    electric: '#FAC000',
    grass: '#3FA129',
    ice: '#3DCEF3',
    fighting: '#FF8000',
    poison: '#9141CB',
    ground: '#915121',
    flying: '#81B9EF',
    psychic: '#EF4179',
    bug: '#91A119',
    rock: '#AFA981',
    ghost: '#704170',
    dragon: '#5060E1',
    dark: '#624D4E',
    steel: '#60A1B8',
    fairy: '#EF70EF',
  }
  const hexToRgb = (h) =>
    `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`

  // Clear the name search first: a leftover term would make both counts equal
  // and the "Any restores the list" assertion vacuous.
  await page.fill('[data-testid="species-search"]', '')
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
  await page.click('[data-testid="type-filter-fire"]')
  await page.click('[data-testid="type-filter-water"]')
  await page.click('[data-testid="type-filter-grass"]')
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
      `${c.type} renders its Bulbapedia colour ${EXPECTED[c.type]}`,
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
  const filteredCount = await page.textContent('[data-testid="list-count"]')
  await page.click('[data-testid="type-filter-any"]')
  await page.waitForFunction(
    () => document.querySelectorAll('.type-filter [aria-pressed="true"][data-type]').length === 0,
    undefined,
    { timeout: 10000 },
  )
  const clearedRows = await page.$$eval(
    '[data-testid="species-rows"] [data-species-id]',
    (e) => e.length,
  )
  const clearedCount = await page.textContent('[data-testid="list-count"]')
  const anyPressed = await page.getAttribute('[data-testid="type-filter-any"]', 'aria-pressed')
  log(`  rows with fire+water+grass selected: ${filteredRows} (${filteredCount})`)
  log(`  rows after clicking "Any"           : ${clearedRows} (${clearedCount})`)
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

  await page.fill('[data-testid="species-search"]', '')
  await page.selectOption('[data-testid="vg-select"]', 'all')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="scope-note"]')
        ?.textContent?.includes('All generations'),
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

  // Under "All" there is no single version group, so per-game data says so
  // rather than silently showing one game's rows.
  await search('eevee', 133)
  await openSpecies(133)
  const perGameNotes = await page.$$('[data-testid="needs-version-group"]')
  const learnHeading = await page.textContent('[data-testid="card-learnset"] h3')
  log(`  learnset heading under All: ${JSON.stringify(learnHeading)}`)
  log(`  per-game "pick a game" notes: ${perGameNotes.length}`)
  check('learnset and encounters both ask for a specific game', perGameNotes.length === 2)
  check('heading carries no version group under All', learnHeading.trim() === 'Learnset')

  // Switching back must restore real per-game rows.
  await page.selectOption('[data-testid="vg-select"]', 'heartgold-soulsilver')
  await page.waitForFunction(
    () => document.querySelector('[data-testid="learnset"]') != null,
    undefined,
    { timeout: 30000 },
  )
  const restoredRows = await page.getAttribute('[data-testid="learnset"]', 'data-total-rows')
  log(`  after switching back to heartgold-soulsilver: learnset rows=${restoredRows}`)
  check('per-game learnset returns after leaving All', Number(restoredRows) > 0)
  await page.screenshot({ path: `${SHOTS}/ux-item5-all.png` })

  // -------------------------------------------------------------- ITEM 6
  hr('ITEM 6 (DOM) — 240px sidebar, card sections, stats chart inside its card')
  const layout = await page.evaluate(() => {
    const body = document.querySelector('.pokedex-body')
    const list = document.querySelector('.species-list')
    const detail = document.querySelector('.pokedex-detail')
    return {
      bodyWidth: Math.round(body.getBoundingClientRect().width),
      listWidth: Math.round(list.getBoundingClientRect().width),
      detailWidth: Math.round(detail.getBoundingClientRect().width),
      gridColumns: getComputedStyle(body).gridTemplateColumns,
    }
  })
  log(`  grid-template-columns: ${layout.gridColumns}`)
  log(`  body=${layout.bodyWidth}px  list=${layout.listWidth}px  detail=${layout.detailWidth}px`)
  check('species list is exactly 240px wide', layout.listWidth === 240, `(${layout.listWidth}px)`)
  // body = 240 rail + 20px gap + detail, allowing 2px of sub-pixel grid rounding.
  const expectedDetail = layout.bodyWidth - 240 - 20
  check(
    'detail area takes all the remaining width',
    Math.abs(layout.detailWidth - expectedDetail) <= 2,
    `(${layout.detailWidth}, expected ~${expectedDetail} of ${layout.bodyWidth})`,
  )

  // The sidebar must stay 240px when the window grows: "not flex-growing".
  await page.setViewportSize({ width: 1900, height: 1000 })
  await page.waitForTimeout(200)
  const wideLayout = await page.evaluate(() => ({
    listWidth: Math.round(document.querySelector('.species-list').getBoundingClientRect().width),
    detailWidth: Math.round(
      document.querySelector('.pokedex-detail').getBoundingClientRect().width,
    ),
  }))
  log(`  at 1900px viewport: list=${wideLayout.listWidth}px detail=${wideLayout.detailWidth}px`)
  check('sidebar stays 240px at a wider viewport', wideLayout.listWidth === 240)
  check('detail absorbed the extra width', wideLayout.detailWidth > layout.detailWidth)
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.waitForTimeout(200)

  const cards = await page.$$eval('.detail > .card, .detail > .card-grid > .card', (els) =>
    els.map((e) => ({
      id: e.getAttribute('data-testid'),
      width: Math.round(e.getBoundingClientRect().width),
      top: Math.round(e.getBoundingClientRect().top),
      bordered: getComputedStyle(e).borderTopWidth !== '0px',
    })),
  )
  log('  cards:')
  cards.forEach((c) => log(`    ${(c.id ?? '?').padEnd(20)} ${c.width}px wide, top=${c.top}`))
  const cardIds = cards.map((c) => c.id)
  for (const id of [
    'card-head',
    'card-stats',
    'card-traits',
    'card-evolution',
    'card-learnset',
    'card-encounters',
  ]) {
    check(`${id} rendered as its own card`, cardIds.includes(id))
  }
  check(
    'every card has a visible border',
    cards.every((c) => c.bordered),
  )
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]))
  check(
    'stats and traits cards sit side by side',
    byId['card-stats'].top === byId['card-traits'].top &&
      byId['card-stats'].width < layout.detailWidth * 0.75,
    `tops ${byId['card-stats'].top}/${byId['card-traits'].top}`,
  )
  check(
    'learnset and encounters cards sit side by side',
    byId['card-learnset'].top === byId['card-encounters'].top,
    `tops ${byId['card-learnset'].top}/${byId['card-encounters'].top}`,
  )
  check(
    'evolution card is full width',
    byId['card-evolution'].width > byId['card-stats'].width * 1.7,
    `${byId['card-evolution'].width} vs ${byId['card-stats'].width}`,
  )

  const chart = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="card-stats"]')
    const bars = document.querySelector('[data-testid="base-stats"]')
    const cr = card.getBoundingClientRect()
    const br = bars.getBoundingClientRect()
    return {
      cardRight: Math.round(cr.right),
      barsRight: Math.round(br.right),
      barsWidth: Math.round(br.width),
      cardWidth: Math.round(cr.width),
    }
  })
  log(
    `  stats card ${chart.cardWidth}px, chart ${chart.barsWidth}px (right edges ${chart.barsRight} <= ${chart.cardRight})`,
  )
  check('base-stats chart fits inside its card', chart.barsRight <= chart.cardRight)
  check(
    'chart is sized to the card, not the page',
    chart.barsWidth <= chart.cardWidth && chart.barsWidth < layout.detailWidth * 0.6,
    `(${chart.barsWidth} vs detail ${layout.detailWidth})`,
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
    await page.$eval('[data-testid="card-evolution"]', (el) =>
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
      `    kind=${(t.kind ?? '?').padEnd(11)} icon=${(t.icon ?? 'NONE').padEnd(20)} "${t.caption}"`,
    ),
  )
  check(
    'every arrow carries an icon',
    eeveeTree.triggers.every((t) => t.icon != null),
  )
  check(
    'every icon matches the declared mapping for its kind',
    eeveeTree.triggers.every((t) => TRIGGER_ICON_NAMES[t.kind] === t.icon),
  )
  check(
    'no arrow icon is a Poke Ball',
    eeveeTree.triggers.every((t) => !/Ball|CircleDot/i.test(t.icon)),
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
    await page.fill('[data-testid="species-search"]', stop.name.toLowerCase())
    await page.waitForSelector(`[data-testid="species-row-${stop.id}"]`, { timeout: 15000 })
    await openSpecies(stop.id)
    const found = await page.$$eval('[data-testid="evolution-tree"] .evo-trigger', (els) =>
      els.map((e) => [
        e.getAttribute('data-kind'),
        e.querySelector('svg')?.getAttribute('data-icon'),
        e.querySelector('.evo-trigger-text')?.textContent ?? '',
      ]),
    )
    log(`  ${stop.name} (#${stop.id}):`)
    found.forEach(([k, i, c]) => {
      log(`    ${String(k).padEnd(11)} ${String(i).padEnd(20)} "${c}"`)
      if (!seenKinds.has(k)) seenKinds.set(k, [i, c])
    })
    for (const kind of stop.kinds) {
      const hit = found.find(([k]) => k === kind)
      check(
        `${stop.name} shows a ${kind} arrow with ${TRIGGER_ICON_NAMES[kind]}`,
        hit != null && hit[1] === TRIGGER_ICON_NAMES[kind],
        hit ? `icon=${hit[1]} caption="${hit[2]}"` : 'not found',
      )
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
  await page.fill('[data-testid="species-search"]', 'eevee')
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  const regularNodes = await page.$$eval('[data-testid="evolution-tree"] img', (els) =>
    els.map((e) => e.getAttribute('src')),
  )
  await page.click('[data-testid="toggle-shiny"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="evolution-tree"]')?.getAttribute('data-shiny') ===
      'true',
    undefined,
    { timeout: 10000 },
  )
  await settleEvolutionThumbs()
  const shinyNodes = await page.$$eval('[data-testid="evolution-tree"] img', (els) =>
    els.map((e) => ({ src: e.getAttribute('src'), loaded: e.naturalWidth > 0 })),
  )
  log(`  regular node[0]: ${regularNodes[0]}`)
  log(`  shiny   node[0]: ${shinyNodes[0].src}`)
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
  // Turning on animation for the main image must NOT animate the tree.
  await page.click('[data-testid="toggle-motion"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="artwork-img"]')?.getAttribute('data-mode') ===
      'artwork-animated',
    undefined,
    { timeout: 10000 },
  )
  const afterMotion = await page.$$eval('[data-testid="evolution-tree"] img', (els) =>
    els.map((e) => e.getAttribute('src')),
  )
  check(
    'tree ignores the motion toggle',
    afterMotion.every((s) => !s.endsWith('.webp')) &&
      JSON.stringify(afterMotion) === JSON.stringify(shinyNodes.map((n) => n.src)),
  )
  await page.click('[data-testid="toggle-motion"]')
  await page.screenshot({ path: `${SHOTS}/ux-item7-evolution.png`, fullPage: true })

  // -------------------------------------------------------------- ITEM 8
  hr('ITEM 8 (DOM) — egg-move rows carry an icon')
  const eggInfo = await page.evaluate(() => {
    const eggSection = document.querySelector('[data-testid="learn-egg"]')
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
    ['learn-level-up', 'learn-machine', 'learn-tutor'].map((id) => {
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
