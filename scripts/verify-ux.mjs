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

import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'
import { startPreviewServer } from './lib/devServer.mjs'

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

/*
  THE PREVIEW SERVER IS STARTED THROUGH lib/devServer.mjs, which spawns vite
  directly (no shell, so stop() actually stops it) and REFUSES to run against a
  server it did not start. Polling the URL until it answers was not enough: an
  orphaned vite on this port answers too, with a stale build, and the whole suite
  then silently checks previous code. See that file's header.
*/
const preview = await startPreviewServer({ port: PORT })

let browser
try {
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

  /** Open the species and land on the Sprites tab, which is the whole catalogue. */
  const openSprites = async (id) => {
    await openSpecies(id)
    await openTab('Sprites')
    await page.waitForSelector('[data-testid="species-sprites"]', { timeout: 30000 })
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
  /**
   * One sprite card, by testid: its URL and whether the image really rendered.
   *
   * REPLACES imgState / switchState / waitLoaded / waitSrcChange, which all read
   * the four-axis artwork control. That control is gone -- the Sprites tab is one
   * sequence of every variant now, so "which image does this axis combination
   * resolve to" is answered by which CARD exists and what its src is, with no
   * clicking and no intermediate state to wait for.
   */
  const cardState = (testId) =>
    page.$eval(`[data-testid="${testId}"] img`, (el) => ({
      src: el.getAttribute('src'),
      naturalWidth: el.naturalWidth,
      complete: el.complete,
    }))

  const cardIds = () =>
    page.$$eval('.sprite-card', (els) => els.map((e) => e.getAttribute('data-testid')))

  const waitCards = (testId) =>
    page.waitForFunction(
      (id) => {
        const img = document.querySelector(`[data-testid="${id}"] img`)
        return img != null && img.complete && img.naturalWidth > 0
      },
      testId,
      { timeout: 30000 },
    )

  await page.goto(APP_URL, { waitUntil: 'load' })

  const { withControls } = controls(page)
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // -------------------------------------------------------------- ITEM 1
  hr('ITEM 1 (DOM) — the artwork cards are the official-artwork asset, not the sprite')
  /*
    RE-POINTED FROM THE CONTROL TO THE CATALOGUE. ITEMs 1-3 used to drive the
    four-axis artwork picker (source / colour / motion / gender) through some fifty
    clicks and intermediate states. The picker is gone: the Sprites tab is one
    sequence of every variant, and Artwork.tsx is deleted rather than left
    unreferenced.

    THE CLAIMS SURVIVE, AND GET SHORTER. Every one of them was of the form "axis
    combination X resolves to URL Y", which is now "the card for X has src Y" -- the
    same fact with the clicking removed. Two of them get STRONGER: the gender matrix
    below used to be read one mode at a time from a disabled attribute, and a
    disabled switch can be disabled for the wrong reason and still pass; the cards
    for all three modes are on screen at once and either exist or do not.

    The three data-level ITEMs at the top of this suite are untouched -- they audit
    all 493 species against the bundle and never used the DOM.
  */
  await search('bulbasaur', 1)
  await openSprites(1)
  await waitCards('sprite-artwork-regular')
  const regularArt = await cardState('sprite-artwork-regular')
  log(`  regular artwork src : ${regularArt.src}`)
  check(
    'the regular artwork card is the official-artwork asset',
    regularArt.src.includes('other/official-artwork/1.png'),
    regularArt.src,
  )
  check(
    'official artwork actually loaded at full size (475px source)',
    regularArt.naturalWidth === 475,
    `(naturalWidth=${regularArt.naturalWidth})`,
  )

  await waitCards('sprite-artwork-shiny')
  const shinyArt = await cardState('sprite-artwork-shiny')
  log(`  shiny artwork src   : ${shinyArt.src}`)
  check(
    'the shiny card uses the official-artwork shiny field',
    shinyArt.src.includes('other/official-artwork/shiny/1.png'),
    shinyArt.src,
  )
  check('shiny official artwork loaded', shinyArt.naturalWidth > 0)
  check('and the two are different URLs', shinyArt.src !== regularArt.src)

  // -------------------------------------------------------------- ITEM 2
  hr('ITEM 2 (DOM) — the three image sources, each from its own place')
  /*
    WHAT THE `source` AND `motion` AXES ENCODED. Only three of their eight
    combinations were ever real, and they are the three registers the catalogue now
    shows as labelled sections:

      artwork  static    PokeAPI official (Sugimori) artwork
      artwork  animated  the pokeapp-sprites animated WebP
      in-game  static    the PokeAPI in-game front sprite

    "Motion is disabled under In-game, with a reason given" was the control's way of
    saying there is no fourth combination. The catalogue says it by not having a
    section for one -- and by the in-game cards coming from the bitmask, which only
    ever describes static slots.
  */
  const ids = await cardIds()
  const sections = await page.$$eval('[data-testid^="sprites-"]', (els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )
  log(`  sections: ${sections.join(', ')}`)
  check(
    'no artwork control and no toggles anywhere on the tab',
    (await page.$$('[data-testid^="toggle-"]')).length === 0 &&
      (await page.$('[data-testid="artwork-img"]')) === null,
  )
  check(
    'all three registers have a section',
    sections.includes('sprites-artwork') &&
      sections.includes('sprites-animated') &&
      sections.some((x) => x.startsWith('sprites-game-')),
    sections.join(','),
  )

  await waitCards('sprite-animated-regular-male')
  const animated = await cardState('sprite-animated-regular-male')
  log(`  animated src : ${animated.src}`)
  check(
    'the animated register is the pokeapp-sprites WebP',
    /pokeapp-sprites/.test(animated.src) && animated.src.endsWith('.webp'),
    animated.src,
  )
  check('and it rendered', animated.naturalWidth > 0)

  const inGameId = ids.find((i) => i.startsWith('sprite-tile-') && i.endsWith('front_default'))
  await waitCards(inGameId)
  const inGame = await cardState(inGameId)
  log(`  in-game src  : ${inGame.src} (${inGameId})`)
  check(
    'the in-game register is the plain sprite dir',
    /\/sprites\/pokemon\/(?:versions\/[^?]*\/)?1\.png$/.test(inGame.src),
    inGame.src,
  )
  check('and it rendered', inGame.naturalWidth > 0)
  check(
    'the three registers are three different URLs',
    new Set([regularArt.src, animated.src, inGame.src]).size === 3,
  )
  await page.screenshot({ path: `${SHOTS}/ux-item2-catalogue.png` })

  // -------------------------------------------------------------- ITEM 3
  hr('ITEM 3 (DOM) — gender availability differs per register, per species')
  /*
    THE SAME MATRIX, READ OFF THE CARDS. Bulbasaur has no gendered image in any
    register; Venusaur has one in the in-game and animated registers but not in the
    artwork one, because official-artwork carries only front_default and front_shiny
    for all 508 varieties. Both rows of the matrix are visible at once here, which
    is what makes this stronger than reading a disabled attribute three times.
  */
  const genderMatrix = async (id, term, label) => {
    // The list is still filtered from the search above, so the row has to be
    // brought back before it can be clicked.
    await search(term, id)
    await openSprites(id)
    const cards = await cardIds()
    const row = {
      inGameFemale: cards.filter((c) => c.startsWith('sprite-tile-') && c.includes('_female'))
        .length,
      artworkFemale: cards.filter((c) => c.startsWith('sprite-artwork-') && c.includes('female'))
        .length,
      animatedFemale: cards.filter((c) => c.startsWith('sprite-animated-') && c.endsWith('-female'))
        .length,
      artworkTotal: cards.filter((c) => c.startsWith('sprite-artwork-')).length,
    }
    log(`  ${label}: ${JSON.stringify(row)}`)
    return row
  }

  const bulba = await genderMatrix(1, 'bulbasaur', 'Bulbasaur (no gender difference)')
  check(
    'Bulbasaur has no gendered card in any of the three registers',
    bulba.inGameFemale === 0 && bulba.artworkFemale === 0 && bulba.animatedFemale === 0,
    JSON.stringify(bulba),
  )

  const venusaur = await genderMatrix(3, 'venusaur', 'Venusaur (has gender differences)')
  check(
    'Venusaur has gendered cards in the in-game register',
    venusaur.inGameFemale > 0,
    `(${venusaur.inGameFemale})`,
  )
  check(
    'and in the animated register',
    venusaur.animatedFemale === 2,
    `(${venusaur.animatedFemale})`,
  )
  /*
    0/493, audited across all 508 varieties: sprites.other['official-artwork']
    exposes only front_default and front_shiny, so no species gets a gendered
    artwork card -- not even one that has gender differences everywhere else. This
    is the assertion the old "artwork-static reports gender n/a instead of
    mislabelling" check was really making.
  */
  check(
    'but never in the artwork register, which has no gendered field at all',
    venusaur.artworkFemale === 0 && venusaur.artworkTotal === 2,
    `${venusaur.artworkFemale} female of ${venusaur.artworkTotal}`,
  )
  await page.screenshot({ path: `${SHOTS}/ux-item3-gender.png` })

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
    THE COLUMN SPLIT IS A RATIO NOW, NOT A FIXED TRACK.

    It was 420px -- .ds-hero's own max-width, so the track was exactly the card it
    held. The page no longer holds that card: it is a proportional reproduction of
    the Figma frame, whose two columns are container-sprite at 737 raw units and
    container-info at 1115 of an 1860-wide frame. So the claim is the RATIO, 39.6%
    against 59.9%, which holds at every width instead of at one.

    The other half of the change: the frame stops growing. The page is capped
    (1400px, and by height so the 1031-unit pinned column always fits), because
    stretching the same layout across a 2560px monitor is what made it read "too
    wide relative to height". "The pinned track does not flex-grow" therefore
    becomes "neither column grows past the cap", which is a stronger statement --
    the old one let the right column grow without limit.
  */
  const layout = await page.evaluate(() => {
    const page_ = document.querySelector('.species-page')
    const pinned = document.querySelector('[data-testid="species-page-pinned"]')
    const scroll = document.querySelector('[data-testid="species-page-scroll"]')
    return {
      gridColumns: getComputedStyle(document.querySelector('.species-page-cols'))
        .gridTemplateColumns,
      pageWidth: Math.round(page_.getBoundingClientRect().width),
      pinnedWidth: Math.round(pinned.getBoundingClientRect().width),
      scrollWidth: Math.round(scroll.getBoundingClientRect().width),
      pinnedOverflow: getComputedStyle(pinned).overflow,
    }
  })
  const pinnedShare = layout.pinnedWidth / layout.pageWidth
  log(`  grid-template-columns: ${layout.gridColumns}`)
  log(
    `  page=${layout.pageWidth}px  pinned=${layout.pinnedWidth}px (${(pinnedShare * 100).toFixed(1)}%)  scrolling=${layout.scrollWidth}px`,
  )
  check(
    'the pinned track is the frame’s 737 of 1860 (39.6%)',
    Math.abs(pinnedShare - 737 / 1860) < 0.015,
    `(${(pinnedShare * 100).toFixed(1)}%)`,
  )
  check('and cannot scroll itself', layout.pinnedOverflow === 'hidden', layout.pinnedOverflow)
  check(
    'the right column takes the rest',
    layout.scrollWidth > layout.pageWidth * 0.5 && layout.scrollWidth < layout.pageWidth,
    `(${layout.scrollWidth} of ${layout.pageWidth})`,
  )

  // Neither column may grow past the cap when the window does.
  await page.setViewportSize({ width: 1900, height: 1000 })
  await page.waitForTimeout(200)
  const wideLayout = await page.evaluate(() => ({
    pageWidth: Math.round(document.querySelector('.species-page').getBoundingClientRect().width),
    pinnedWidth: Math.round(
      document.querySelector('[data-testid="species-page-pinned"]').getBoundingClientRect().width,
    ),
    scrollWidth: Math.round(
      document.querySelector('[data-testid="species-page-scroll"]').getBoundingClientRect().width,
    ),
  }))
  log(
    `  at 1900px viewport: page=${wideLayout.pageWidth}px pinned=${wideLayout.pinnedWidth}px scrolling=${wideLayout.scrollWidth}px`,
  )
  check(
    'the frame stops growing rather than stretching to the window',
    wideLayout.pageWidth <= 1400 && wideLayout.pageWidth < 1900,
    `(${wideLayout.pageWidth}px of a 1900px window)`,
  )
  check(
    'and the split is still the frame’s ratio at the cap',
    Math.abs(wideLayout.pinnedWidth / wideLayout.pageWidth - 737 / 1860) < 0.015,
    `(${((wideLayout.pinnedWidth / wideLayout.pageWidth) * 100).toFixed(1)}%)`,
  )
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
    THE SUB-NAV IS PAGE CHROME, NOT PANEL CONTENT -- which is a reversal of the
    earlier claim, and the point of it.

    It used to sit INSIDE the scroll region and scroll away with the panel, on the
    reasoning that belonging to the content is what stops it reading as a second
    app nav. The frame disagrees: Tabs (139:644) is a sibling of the banner in
    container-info at y=182, above the content that starts at y=223, and the
    requirement is that the banner above it stays fixed and visible across all four
    tabs. A sub-nav that scrolled away from a banner that does not would have been
    two different behaviours in one column.

    So it is outside the scroller now, directly under the banner. Page-local is
    still what it reads as -- position and scale, not colour, are what separate it
    from the app bar.
  */
  const subnav = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="species-page-subnav"]')
    const scroll = document.querySelector('[data-testid="species-page-scroll"]')
    const banner = document.querySelector('[data-testid="species-banner"]')
    const nr = nav.getBoundingClientRect()
    return {
      insideScroller: scroll.contains(nav),
      belowBanner: nr.top >= banner.getBoundingClientRect().bottom - 2,
      aboveScroller: nr.bottom <= scroll.getBoundingClientRect().top + 2,
      tabs: [...nav.querySelectorAll('.ds-tab')].map((e) => e.textContent.trim()),
      activeUnderline: getComputedStyle(nav.querySelector('.ds-tab[aria-selected="true"]'))
        .borderBottomWidth,
    }
  })
  log(`  sub-nav tabs: ${subnav.tabs.join(' | ')}  activeUnderline=${subnav.activeUnderline}`)
  check('the sub-nav is chrome, outside the scrolling region', subnav.insideScroller === false)
  check('directly under the banner', subnav.belowBanner)
  check('and above the panel it switches', subnav.aboveScroller)
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
  hr('ITEM 7 (DOM) — the rebuilt evolution chart: artwork, wedges, item sprites')
  /*
    REBUILT, NOT RESTYLED, so this block is re-derived rather than renamed.

    WHAT THE CHART WAS: a nested flex tree of bordered <button> cards, each with a
    thumbnail, a dex number and a name, joined by a Tabler glyph plus a text
    caption. The assertions matched that DOM -- .evo-thumb, .evo-name, .evo-subtree
    flex-direction row, .evo-children flex-direction column, and a Tabler svg per
    arrow whose data-icon had to equal TRIGGER_ICON_NAMES[kind].

    WHAT IT IS: absolutely-positioned artwork inside one aspect-ratio box, joined by
    tapered chevron wedges, with the mechanic's real item sprite and the painted
    condition icons sitting on or under each wedge. No cards, no names, no dex
    numbers, no glyphs, no captions except the level. Layout comes from evoLayout.ts
    rather than from flex, so a flex-direction assertion has nothing to read.

    WHAT SURVIVES UNCHANGED: every node renders loaded official artwork; the painted
    icons are all from the eleven in the manifest; no icon is ever a Poke Ball; and
    the register per requirement is DERIVED from the bundle rather than restated
    here, which is what made Happiny's sun and Onix's trade icon fall out instead of
    being hardcoded.

    WHAT IS GONE WITH THE FEATURE: the shiny and motion round trips. Both drove the
    four-axis artwork control, which is removed -- and the chart no longer takes a
    shiny prop at all, because the frame's evolution chart has no colour control.
    "The tree ignores the motion toggle" has no toggle to ignore; what replaces it
    is the direct claim, that chart artwork is always the static official asset.
  */
  const settleEvolutionThumbs = async () => {
    await page.$eval('[data-testid="species-evolution"]', (el) =>
      el.scrollIntoView({ block: 'center' }),
    )
    await page.waitForFunction(
      () => {
        const imgs = [...document.querySelectorAll('[data-testid="evolution-tree"] .evo-art')]
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)
      },
      undefined,
      { timeout: 30000 },
    )
  }

  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'eevee'))
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  await settleEvolutionThumbs()

  const eeveeTree = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="evolution-tree"]')
    const nodes = [...root.querySelectorAll('[data-testid^="evo-node-"]')].map((e) => {
      const r = e.getBoundingClientRect()
      const cs = getComputedStyle(e)
      return {
        id: Number(e.getAttribute('data-species-id')),
        current: e.getAttribute('data-current') === 'true',
        img: e.querySelector('img')?.getAttribute('src') ?? null,
        imgLoaded: (e.querySelector('img')?.naturalWidth ?? 0) > 0,
        left: Math.round(r.left),
        top: Math.round(r.top),
        /* No card: the reference draws none, and the previous build drew one. */
        border: cs.borderTopWidth,
        background: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        /* No visible name or dex number either -- both stay in the a11y tree. */
        visibleText: [...e.querySelectorAll('span')]
          .filter((x) => !x.classList.contains('visually-hidden'))
          .map((x) => x.textContent.trim())
          .filter(Boolean),
        hiddenText: e.querySelector('.visually-hidden')?.textContent ?? '',
      }
    })
    const triggers = [...root.querySelectorAll('.evo-trigger')].map((e) => ({
      kind: e.getAttribute('data-kind'),
      tabler: e.querySelector('svg.trigger-icon')?.getAttribute('data-icon') ?? null,
      icons: [...e.querySelectorAll('.evo-painted-icon')].map((i) => i.dataset.evoIcon),
      caption: e.querySelector('.evo-trigger-text')?.textContent ?? '',
      title: e.getAttribute('title'),
    }))
    return {
      nodes,
      triggers,
      branches: root.getAttribute('data-root-branches'),
      arrows: root.querySelectorAll('[data-testid^="evo-arrow-"]').length,
      wedges: root.querySelectorAll('.evo-arrow-wedge').length,
      chevrons: root.querySelectorAll('.evo-arrow-chevron').length,
      aspect: getComputedStyle(root).aspectRatio,
    }
  })
  log(`  root branches: ${eeveeTree.branches}, arrows=${eeveeTree.arrows}`)
  log(
    `  wedges=${eeveeTree.wedges} chevrons=${eeveeTree.chevrons} aspect-ratio=${eeveeTree.aspect}`,
  )
  eeveeTree.nodes.forEach((n) =>
    log(
      `    #${String(n.id).padStart(3, '0')} left=${String(n.left).padStart(5)} top=${String(n.top).padStart(5)} img=${n.imgLoaded ? 'loaded' : 'MISSING'} visible=[${n.visibleText.join('|')}]`,
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
  check(
    'no bordered card, fill or radius around any stage',
    eeveeTree.nodes.every(
      (n) =>
        n.border === '0px' &&
        (n.background === 'rgba(0, 0, 0, 0)' || n.background === 'transparent') &&
        n.radius === '0px',
    ),
    eeveeTree.nodes.map((n) => `${n.border}/${n.background}/${n.radius}`).join(' '),
  )
  check(
    'no dex number or name drawn beside a stage',
    eeveeTree.nodes.every((n) => n.visibleText.length === 0),
    eeveeTree.nodes.flatMap((n) => n.visibleText).join(','),
  )
  /* Removing them from the picture must not remove them from the a11y tree. */
  check(
    'but both are still in the accessibility tree',
    eeveeTree.nodes.every((n) => /#\d{3}\s+\S/.test(n.hiddenText)),
    eeveeTree.nodes.map((n) => n.hiddenText).join(' | '),
  )
  check('Eevee shows all its branches', Number(eeveeTree.branches) >= 7, eeveeTree.branches)
  check(
    'one wedge and three chevrons per arrow',
    eeveeTree.wedges === eeveeTree.arrows && eeveeTree.chevrons === eeveeTree.arrows * 3,
    `${eeveeTree.wedges} wedges, ${eeveeTree.chevrons} chevrons, ${eeveeTree.arrows} arrows`,
  )
  /*
    RADIAL FOR SEVEN BRANCHES, per layout-evo-eevee -- so no two children share a
    row OR a column. The old claim was "children are stacked vertically (distinct
    tops)", which a circle also satisfies; distinct LEFTS is what separates the
    circle from the column the old chart drew.
  */
  const kids = eeveeTree.nodes.filter((n) => n.id !== 133)
  /*
    A CIRCLE MIRRORS ITS ROWS, so "distinct tops" is the wrong test and was the
    old chart's: seven children at -90 + k*360/7 pair up by symmetry
    (sin(-141.4) === sin(-38.6)) and give four distinct tops, not seven. Distinct
    LEFTS is what separates a circle from the vertical column the old chart drew --
    that one had all seven at the same x.
  */
  check(
    'the branches are on a circle: every one at its own x, in several rows',
    new Set(kids.map((n) => n.left)).size === kids.length &&
      new Set(kids.map((n) => n.top)).size >= 4,
    `${new Set(kids.map((n) => n.top)).size} tops, ${new Set(kids.map((n) => n.left)).size} lefts of ${kids.length}`,
  )
  check(
    'the chart is one aspect-ratio box, not a flex row',
    /\d/.test(eeveeTree.aspect),
    eeveeTree.aspect,
  )

  log('  arrow conditions:')
  eeveeTree.triggers.forEach((t) =>
    log(`    kind=${(t.kind ?? '?').padEnd(11)} icons=[${t.icons.join(' + ')}] "${t.caption}"`),
  )
  /*
    ONE REGISTER NOW, NOT TWO. The Tabler glyphs are gone from the chart entirely --
    the reference draws none -- so "exactly one of svg/painted per arrow" has become
    "no svg glyphs at all, and at least one image icon per arrow". TriggerIcon.tsx
    was deleted with them.
  */
  check(
    'no Tabler trigger glyphs remain anywhere in the chart',
    eeveeTree.triggers.every((t) => t.tabler == null),
  )
  check(
    'every arrow carries at least one image icon',
    eeveeTree.triggers.every((t) => t.icons.length > 0),
    eeveeTree.triggers.filter((t) => t.icons.length === 0).length + ' bare',
  )
  /*
    THE MECHANIC'S OWN ITEM SPRITE IS ALWAYS FIRST, which is the reference's
    vocabulary: image-rare-candy leads every level-up step, the real stone leads a
    use-item step. The painted condition icon follows it, joined by "+".
  */
  check(
    'the leading icon is the mechanic itself: a rare candy, a stone or the trade icon',
    eeveeTree.triggers.every(
      (t) => /^item-/.test(t.icons[0]) || t.icons[0] === 'trade' || t.icons[0] === 'random-split',
    ),
    eeveeTree.triggers.map((t) => t.icons[0]).join(','),
  )
  check(
    'every painted icon is one of the eleven in the manifest',
    eeveeTree.triggers
      .flatMap((t) => t.icons)
      .filter((k) => !k.startsWith('item-'))
      .every((k) => PAINTED_ICON_KEYS.includes(k)),
    eeveeTree.triggers
      .flatMap((t) => t.icons)
      .filter((k) => !k.startsWith('item-') && !PAINTED_ICON_KEYS.includes(k))
      .join(', ') || 'all known',
  )
  check(
    'no arrow icon is a Poke Ball',
    eeveeTree.triggers.every((t) => !/ball|circle-?dot/i.test(t.icons.join(' '))),
  )
  /* Every requirement still spells itself out in full, in the title and in the
     hidden sentence -- the picture lost the captions, the a11y tree did not. */
  check(
    'every arrow still carries the full requirement as its title',
    eeveeTree.triggers.every((t) => (t.title ?? '').length > 5),
    eeveeTree.triggers.filter((t) => (t.title ?? '').length <= 5).length + ' bare',
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
    await backToGrid()
    await withControls(() => page.fill('[data-testid="species-search"]', stop.name.toLowerCase()))
    await page.waitForSelector(`[data-testid="species-row-${stop.id}"]`, { timeout: 15000 })
    await openSpecies(stop.id)
    const found = await page.$$eval('[data-testid="evolution-tree"] .evo-trigger', (els) =>
      els.map((e) => [
        e.getAttribute('data-kind'),
        [...e.querySelectorAll('.evo-painted-icon')].map((i) => i.dataset.evoIcon),
        e.querySelector('.evo-trigger-text')?.textContent ?? '',
      ]),
    )
    log(`  ${stop.name} (#${stop.id}):`)
    found.forEach(([k, icons, c]) => {
      log(`    ${String(k).padEnd(11)} [${icons.join(' + ')}] "${c}"`)
      if (!seenKinds.has(k)) seenKinds.set(k, [icons.join('+'), c])
    })
    /*
      THE EXPECTED ICON IS STILL DERIVED, NOT RESTATED. For each kind on the tour
      the first matching detail is pulled from the bundle and run through
      paintedIconKey; if that yields a key the arrow must carry it. What changed is
      the fallback: where no painted icon applies, the arrow no longer carries a
      Tabler glyph -- it carries the mechanic's item sprite, which is what the
      reference draws. So the else-branch asserts an item icon rather than a glyph
      name.

      This is why Onix and Kadabra both land on the painted trade icon, and why
      Happiny -- which evolves in the DAY while holding an Oval Stone -- shows a sun.
      Nothing about those cases is hardcoded here.
    */
    for (const kind of stop.kinds) {
      const hit = found.find(([k]) => k === kind)
      const detail = (childDetailsByParent.get(stop.id) ?? []).find((d) => triggerKind(d) === kind)
      const expectPainted = detail ? paintedIconKey(detail) : null
      if (expectPainted) {
        check(
          `${stop.name} shows a ${kind} arrow carrying the painted "${expectPainted}"`,
          hit != null && hit[1].includes(expectPainted),
          hit ? `icons=[${hit[1].join('+')}] caption="${hit[2]}"` : 'not found',
        )
      } else {
        check(
          `${stop.name} shows a ${kind} arrow carrying the mechanic's item sprite`,
          hit != null && hit[1].some((k) => k.startsWith('item-')),
          hit ? `icons=[${hit[1].join('+')}] caption="${hit[2]}"` : 'not found',
        )
      }
    }
  }
  log('')
  log('  icons actually observed in the DOM per kind:')
  for (const [kind, [icons, caption]] of [...seenKinds].sort()) {
    log(`    ${String(kind).padEnd(11)} ${String(icons).padEnd(34)} e.g. "${caption}"`)
  }
  /* Plain trade has no level, so it has no .evo-trigger-text -- the reference
     draws the trade icon alone, and that claim is unchanged. */
  check(
    'plain trade renders icon-only (no caption)',
    (seenKinds.get('trade') ?? [null, 'x'])[1] === '',
    JSON.stringify(seenKinds.get('trade')),
  )

  /*
    THE CHART IS ALWAYS THE STATIC OFFICIAL ASSET. Previously this was two round
    trips through the Sprites tab's colour and motion switches, asserting that the
    chart followed the first and ignored the second. There are no switches: the
    chart takes no shiny prop, because the frame's evolution chart has no colour
    control. So the claim is now direct -- never a shiny path, never a .webp -- and
    it is the same thing the "ignores the motion toggle" check was protecting.
  */
  await backToGrid()
  await withControls(() => page.fill('[data-testid="species-search"]', 'eevee'))
  await page.waitForSelector('[data-testid="species-row-133"]', { timeout: 15000 })
  await openSpecies(133)
  await settleEvolutionThumbs()
  const chartArt = await page.$$eval('[data-testid="evolution-tree"] .evo-art', (els) =>
    els.map((e) => ({ src: e.getAttribute('src'), loaded: e.naturalWidth > 0 })),
  )
  const paintedInTree = await page.$$eval(
    '[data-testid="evolution-tree"] .evo-painted-icon',
    (els) => els.map((e) => e.getAttribute('data-evo-icon')),
  )
  log(`  chart artwork: ${chartArt.length} thumb(s), e.g. ${chartArt[0]?.src}`)
  log(`  icons in tree: ${paintedInTree.join(', ') || '(none)'}`)
  check(
    'chart artwork is the static official asset, never shiny',
    chartArt.length > 0 &&
      chartArt.every((n) => n.src.includes('official-artwork/') && !n.src.includes('/shiny/')),
    chartArt.map((n) => n.src).join(' ') || 'none',
  )
  check(
    'and never the animated webp',
    chartArt.every((n) => !n.src.endsWith('.webp')),
  )
  check(
    'all chart artwork loaded',
    chartArt.every((n) => n.loaded),
  )
  check(
    'the condition icons are present and all known',
    paintedInTree.length > 0 &&
      paintedInTree.every((k) => k.startsWith('item-') || PAINTED_ICON_KEYS.includes(k)),
    paintedInTree.join(', '),
  )
  check(
    'data-shiny is false: the chart has no colour control',
    (await page.getAttribute('[data-testid="evolution-tree"]', 'data-shiny')) === 'false',
  )
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
  preview.stop()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
