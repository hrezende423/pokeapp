/**
 * Verification for Pokepedia's shared Search/Filter and Sort menus, and for the
 * per-page work that landed with them.
 *
 * ONE MENU PAIR FOR THE WHOLE MODULE. Every dex used to carry its own control
 * row above its own list; they are all in the app bar now, which is what most of
 * section 1 is about -- that the triggers exist once, that what they contain
 * changes with the page, and that no dex kept a row of its own.
 *
 * Everything asserted here is either computed from the bundle in this file and
 * compared against the rendered DOM, or read back off what rendered -- never
 * against a number typed in by hand. A filter that quietly stops narrowing is
 * indistinguishable from a list that happens to be short, so every filter check
 * also asserts that it NARROWED, and every sort check re-derives the expected
 * order rather than trusting the arrow.
 *
 * Usage: node scripts/verify-dex-filters.mjs
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { goToDex } from './lib/nav.mjs'
import { startPreviewServer } from './lib/devServer.mjs'

const PORT = 4180
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

mkdirSync(SHOTS, { recursive: true })

// =====================================================================
// Expected values, computed from the bundle
// =====================================================================

const bundle = (n) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const speciesById = bundle('species')
const itemsById = bundle('items')
const species = Object.values(speciesById)
const items = Object.values(itemsById)
const abilities = Object.values(bundle('abilities'))
const natures = Object.values(bundle('natures'))
const berries = Object.values(bundle('berries'))
const moves = Object.values(bundle('moves'))
const eggGroups = Object.values(bundle('egg-groups'))
const types = Object.values(bundle('types'))

/** Mirrors data/generations.ts: dex-id ranges, not a per-species lookup. */
const genOfSpecies = (id) => (id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 : 4)
const speciesUpTo = (g) => species.filter((sp) => genOfSpecies(sp.id) <= g)
const defaultVariety = (sp) => sp.varieties.find((v) => v.is_default) ?? sp.varieties[0]

/**
 * Mirror of era.ts resolveStatsForGeneration, because the interesting rows are
 * the ones a naive `variety.stats` read gets wrong: 20 species carry a Gen 1
 * `special` entry AND a later entry on a physical stat, so stats resolve per
 * STAT rather than per entry (Beedrill's Gen 1 Attack is 80, not the modern 90),
 * and Gen 1's combined Special REPLACES the split pair rather than joining it.
 */
function resolveStats(variety, generation) {
  const overrides = new Map()
  for (const past of variety.past_stats ?? []) {
    const gen = past.generation_id
    if (gen == null || gen < generation) continue
    for (const entry of past.stats) {
      if (entry.stat == null) continue
      const existing = overrides.get(entry.stat)
      if (existing && existing.generation_id <= gen) continue
      overrides.set(entry.stat, { generation_id: gen, entry })
    }
  }
  const merged = new Map()
  for (const entry of variety.stats) if (entry.stat != null) merged.set(entry.stat, entry)
  for (const [stat, o] of overrides) merged.set(stat, o.entry)
  if (merged.has('special')) {
    merged.delete('special-attack')
    merged.delete('special-defense')
  }
  const out = {}
  let bst = 0
  for (const [stat, entry] of merged) {
    out[stat] = entry.base_stat
    bst += entry.base_stat
  }
  return { stats: out, bst }
}

const berriesIn = (g) =>
  berries.filter((b) => b.item_id != null && itemsById[b.item_id]?.generation_ids.includes(g))
const abilitiesInList = abilities.filter((a) => (a.generation_id ?? 99) <= 4)
const abilitiesIn = (g) => abilitiesInList.filter((a) => (a.generation_id ?? 99) <= g)
const itemsIn = (g) => items.filter((i) => i.generation_ids.includes(g))
const movesIn = (g) => moves.filter((m) => (m.generation_id ?? 99) <= g)
const typeIdOf = (name) => types.find((t) => t.name === name).id

function dominantFlavors(berry) {
  const potency = Math.max(0, ...berry.flavors.map((f) => f.potency))
  if (potency === 0) return []
  return berry.flavors.filter((f) => f.potency === potency && f.flavor).map((f) => f.flavor)
}

hr('EXPECTED VALUES — computed from the bundle')
log(`  species ${species.length} · moves ${moves.length} · items ${items.length}`)
log(
  `  gen-4: ${speciesUpTo(4).length} species, ${itemsIn(4).length} items, ${abilitiesIn(4).length} abilities, ${berriesIn(4).length} berries`,
)

// =====================================================================

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
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const badResponses = []
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.status >= 400) badResponses.push(`${e.response.status} ${e.response.url}`)
  })

  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // ---------------------------------------------------------------- helpers

  /* The nav opens its dropdown on HOVER and keeps it open while the pointer is
     on the tab, so the pointer is parked away from the bar between steps. */
  const park = async () => {
    await page.mouse.move(1100, 780)
    await page.waitForTimeout(60)
  }

  const goTo = async (id) => {
    await goToDex(page, id)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
    await park()
  }

  const panelOpen = (testId) =>
    page.$eval(`[data-testid="${testId}"]`, (el) => el.dataset.open === 'true')

  const openFilters = async () => {
    if (await panelOpen('app-controls')) return
    await park()
    await page.click('[data-testid="controls-toggle"]')
    await page.waitForSelector('[data-testid="vg-select"]', { state: 'visible', timeout: 15000 })
  }
  const openSort = async () => {
    if (await panelOpen('dex-sort')) return
    await park()
    await page.click('[data-testid="dex-sort-toggle"]')
    await page.waitForTimeout(140)
  }
  const closeMenus = async () => {
    for (const [box, trigger] of [
      ['app-controls', 'controls-toggle'],
      ['dex-sort', 'dex-sort-toggle'],
    ]) {
      if ((await page.$(`[data-testid="${box}"]`)) == null) continue
      /* A disabled trigger cannot close its panel -- and it must never have one
         open, which is what the app guarantees and section 4 asserts. */
      if ((await page.$eval(`[data-testid="${trigger}"]`, (e) => e.disabled)) === true) continue
      if (await panelOpen(box)) {
        await page.click(`[data-testid="${trigger}"]`)
        await page.waitForTimeout(100)
      }
    }
  }
  const openMore = async () => {
    await openFilters()
    const open = await page.$eval('[data-testid="dex-filter-more"]', (el) => el.dataset.open)
    if (open !== 'true') {
      await page.click('[data-testid="dex-filter-more-toggle"]')
      await page.waitForTimeout(120)
    }
  }

  /*
    The outside-click target has to be genuinely inert. The obvious choice --
    clicking empty page beside the list -- is not: the Itemdex's rows are full
    width, so a press at any plausible "empty" coordinate opens an item. The boot
    line in the footer is outside every panel, present on every screen, and is
    not a control.
  */
  const clickOutside = async () => {
    await page.click('[data-testid="boot-status"]')
    await page.waitForTimeout(160)
  }

  const countOf = async (dex) => {
    const txt = await page.textContent(`[data-testid="${dex}-count"]`)
    return Number(txt.trim().split(' ')[0])
  }
  /** The Pokedex has no count on the page, by design; its readout is in the menu. */
  const matchCount = async () =>
    Number((await page.textContent('[data-testid="dex-filter-count"]')).trim().split(' ')[0])

  const clickOption = async (key, value) => {
    await page.click(`[data-testid="dex-filter-${key}-${value}"]`)
    await page.waitForTimeout(140)
  }
  const setRange = async (key, part, value) => {
    await page.fill(`[data-testid="dex-filter-${key}-${part}"]`, value)
    await page.waitForTimeout(180)
  }
  const pickSort = async (key) => {
    await openSort()
    await page.click(`[data-testid="dex-sortfield-${key}"]`)
    await page.waitForTimeout(160)
  }
  const clearAll = async () => {
    await openFilters()
    await page.click('[data-testid="dex-filter-clear"]')
    await page.waitForTimeout(180)
  }
  const selectGame = async (vg) => {
    await openFilters()
    await page.selectOption('[data-testid="vg-select"]', vg)
    await page.waitForTimeout(200)
    await closeMenus()
  }

  // ==================================================================
  hr('1 — ONE CONTROL PAIR, IN THE BAR, ON EVERY POKEPEDIA PAGE')

  const DEXES = [
    'pokedex',
    'movedex',
    'itemdex',
    'berrydex',
    'abilitydex',
    'naturedex',
    'breedingdex',
  ]
  const WITH_SORT = ['pokedex', 'itemdex', 'berrydex', 'abilitydex']

  for (const dex of DEXES) {
    await goTo(dex)
    check(
      `[${dex}] no control row of its own above the list`,
      (await page.$(`[data-testid="${dex}-controls-toggle"]`)) === null &&
        (await page.$(`[data-testid="${dex}-controls-panel"]`)) === null,
    )
    check(
      `[${dex}] the bar's Search/Filter trigger is the one on screen`,
      (await page.$$('[data-testid="controls-toggle"]')).length === 1,
    )
    /* The Pokedex's name filter keeps the id it has had since before these
       menus existed -- `species-search` -- because six suites drive it by that
       name. Every other dex uses `<dex>-search`. */
    const searchId = dex === 'pokedex' ? 'species-search' : `${dex}-search`
    check(
      `[${dex}] its name search is inside that menu`,
      (await page.$(`[data-testid="${searchId}"]`)) != null &&
        (await page.isVisible(`[data-testid="${searchId}"]`)) === false,
    )
    const hasSort = (await page.$('[data-testid="dex-sort-toggle"]')) != null
    check(
      `[${dex}] a Sort trigger exists exactly when the page declares sort fields`,
      hasSort === WITH_SORT.includes(dex),
      hasSort ? 'present' : 'absent',
    )
    await closeMenus()
  }

  await goTo('pokedex')
  check(
    'the trigger reads "Search/Filter", which suits every page it now serves',
    (await page.textContent('[data-testid="controls-toggle"]')).trim() === 'Search/Filter',
  )

  // -------------------------------------------------- open / close behaviour
  check('the filter menu starts closed', (await panelOpen('app-controls')) === false)
  await page.click('[data-testid="controls-toggle"]')
  await page.waitForTimeout(140)
  check('its trigger opens it', (await panelOpen('app-controls')) === true)
  await page.click('[data-testid="controls-toggle"]')
  await page.waitForTimeout(140)
  check('the same trigger closes it', (await panelOpen('app-controls')) === false)

  await openFilters()
  await clickOutside()
  check('a press anywhere outside closes it', (await panelOpen('app-controls')) === false)

  await openFilters()
  await page.click('[data-testid="dex-sort-toggle"]')
  await page.waitForTimeout(160)
  check(
    'opening Sort closes the filter menu',
    (await panelOpen('dex-sort')) === true && (await panelOpen('app-controls')) === false,
  )
  await clickOutside()
  check('and an outside press closes Sort too', (await panelOpen('dex-sort')) === false)

  await openFilters()
  check(
    '"More filters" is collapsed by default',
    (await page.$eval('[data-testid="dex-filter-more"]', (el) => el.dataset.open)) === 'false' &&
      (await page.isVisible('[data-testid="dex-filter-more-panel"]')) === false,
  )

  // -------------------------------------------------- the menu's own furniture
  const menuOrder = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="controls-panel"]')
    const y = (sel) => panel.querySelector(sel)?.getBoundingClientRect().top ?? null
    return {
      reset: y('[data-testid="controls-reset-top"]'),
      search: y('[data-testid="global-search"]'),
      game: y('[data-testid="vg-select"]'),
      filters: y('[data-testid="species-search"]'),
    }
  })
  log(`  menu order (y): ${JSON.stringify(menuOrder)}`)
  check(
    'Reset filters is the first thing in the menu',
    menuOrder.reset != null && menuOrder.reset < menuOrder.search,
  )
  check(
    'and the game selector sits directly below the search input',
    menuOrder.game > menuOrder.search && menuOrder.game < menuOrder.filters,
    `search ${Math.round(menuOrder.search)} · game ${Math.round(menuOrder.game)} · filters ${Math.round(menuOrder.filters)}`,
  )

  const sizes = await page.evaluate(() => {
    const px = (sel) => {
      const el = document.querySelector(sel)
      return el ? parseFloat(getComputedStyle(el).fontSize) : null
    }
    return {
      menuLabel: px('[data-testid="controls-panel"] .ds-section-label'),
      menuFilter: px('[data-testid="controls-panel"] .ds-filter'),
      table: px('[data-testid="species-rows"]'),
    }
  })
  log(`  type sizes: ${JSON.stringify(sizes)}`)
  check(
    'the menus are set smaller than the data they narrow',
    sizes.menuLabel < sizes.table && sizes.menuFilter < sizes.table,
    JSON.stringify(sizes),
  )
  await page.screenshot({ path: `${SHOTS}/dexf-pokedex-filters.png` })

  // -------------------------------------------------- the bar's own geometry
  const bar = await page.evaluate(() => {
    const barBox = document.querySelector('.app-bar').getBoundingClientRect()
    const theme = document.querySelector('.ds-theme-switcher').getBoundingClientRect()
    const seg = document.querySelector('.ds-theme-segment')
    const probe = document.createElement('span')
    probe.style.cssText = `position:absolute;visibility:hidden;font:${getComputedStyle(seg).font}`
    probe.textContent = 'Light'
    document.body.appendChild(probe)
    const wordWidth = probe.getBoundingClientRect().width
    probe.remove()
    return {
      themeRightInset: Math.round(barBox.right - theme.right),
      segWidth: Math.round(seg.getBoundingClientRect().width),
      wordWidth: Math.round(wordWidth),
      padding: getComputedStyle(seg).paddingLeft,
      barHeight: Math.round(barBox.height),
    }
  })
  log(`  bar: ${JSON.stringify(bar)}`)
  check('the theme switcher is flush with the bar edge', Math.abs(bar.themeRightInset) <= 2)
  check(
    'and each segment is the width of its word plus a 2px inset either side',
    bar.segWidth - bar.wordWidth <= 8,
    `seg ${bar.segWidth} vs "Light" ${bar.wordWidth}, padding ${bar.padding}`,
  )
  await closeMenus()

  /*
    LOCKED IN PLACE: the theme switcher's right edge must be the same number on a
    page with the Grid/List switch and Sort beside it and on one with neither.
    That is the whole reason it is the LAST child of the cluster.
  */
  const themeRight = async () =>
    page.$eval('.ds-theme-switcher', (e) => Math.round(e.getBoundingClientRect().right))
  const onPokedex = await themeRight()
  await goTo('naturedex')
  const onNaturedex = await themeRight()
  await goTo('breedingdex')
  const onBreedingdex = await themeRight()
  check(
    'the theme switcher does not move between pages',
    onPokedex === onNaturedex && onNaturedex === onBreedingdex,
    `${onPokedex} / ${onNaturedex} / ${onBreedingdex}`,
  )

  // ==================================================================
  hr('2 — THE GRID/LIST SWITCH: in the bar, on the Pokedex browse page only')
  for (const dex of ['movedex', 'itemdex', 'naturedex']) {
    await goTo(dex)
    check(
      `[${dex}] no view switch, because there is no grid to switch`,
      (await page.$('[data-testid="toggle-species-view"]')) === null,
    )
  }
  await goTo('pokedex')
  await selectGame('heartgold-soulsilver')
  await goTo('pokedex')
  check(
    '[pokedex] the view switch is in the bar',
    await page.isVisible('[data-testid="toggle-species-view"]'),
  )
  const switchPos = await page.evaluate(() => {
    const view = document
      .querySelector('[data-testid="toggle-species-view"]')
      .getBoundingClientRect()
    const sort = document.querySelector('[data-testid="dex-sort-toggle"]').getBoundingClientRect()
    return { leftOfSort: view.right <= sort.left }
  })
  check('to the LEFT of the Sort trigger', switchPos.leftOfSort)
  check(
    'and it is not inside the Sort menu any more',
    (await page.$('[data-testid="dex-sort-panel"] [data-testid="toggle-species-view"]')) === null,
  )

  await page.click('[data-testid="species-open-1"]')
  await page.waitForSelector('[data-testid="species-page"]', { timeout: 20000 })
  check(
    'with a species open there is no list to switch, so the switch is gone',
    (await page.$('[data-testid="toggle-species-view"]')) === null,
  )
  await page.click('[data-testid="species-page-back"]')
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 20000 })
  await park()

  // ==================================================================
  hr('3 — POKEDEX GRID: the new card row, and the Sort menu')
  const bulbaCard = await page.textContent('[data-testid="species-card-stats-1"]')
  const bulbaStats = resolveStats(defaultVariety(speciesById[1]), 4)
  log(`  Bulbasaur card row: "${bulbaCard.trim()}"`)
  check(
    'each card carries a BST / Speed row under its abilities',
    bulbaCard
      .replace(/\s*·\s*/, ' · ')
      .replace(/\s+/g, ' ')
      .trim() === `BST ${bulbaStats.bst} · Spe ${bulbaStats.stats.speed}`,
    bulbaCard.trim(),
  )
  const cardBox = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="species-row-1"]').getBoundingClientRect()
    const stats = document
      .querySelector('[data-testid="species-card-stats-1"]')
      .getBoundingClientRect()
    const ability = document
      .querySelector('[data-testid="species-card-ability-1"]')
      .getBoundingClientRect()
    const grid = getComputedStyle(document.querySelector('.pokedex-grid'))
    return {
      width: Math.round(card.width),
      height: Math.round(card.height),
      statsBelowAbility: stats.top >= ability.bottom - 1,
      clipped: stats.bottom > card.bottom,
      columns: grid.gridTemplateColumns,
      rowGap: grid.rowGap,
      columnGap: grid.columnGap,
    }
  })
  log(`  card geometry: ${JSON.stringify(cardBox)}`)
  check(
    'it is UNDER the ability line and inside the card, which did not grow',
    cardBox.statsBelowAbility && cardBox.clipped === false && cardBox.height === 199,
    JSON.stringify(cardBox),
  )
  check(
    'and the grid it sits in is untouched -- three 212px columns, 9px / 17px gaps',
    cardBox.width === 212 &&
      cardBox.columns === '212px 212px 212px' &&
      cardBox.columnGap === '9px' &&
      cardBox.rowGap === '17px',
    `${cardBox.columns} / ${cardBox.columnGap} / ${cardBox.rowGap}`,
  )

  await openSort()
  const gridFields = await page.$$eval('[data-testid="dex-sort-fields"] button', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  log(`  grid sort fields: ${gridFields.join(' · ')}`)
  check(
    'the Sort menu offers what a card actually prints, Speed included',
    JSON.stringify(gridFields) === JSON.stringify(['Dex #', 'Name', 'Base stat total', 'Speed']),
    gridFields.join(','),
  )
  await page.click('[data-testid="dex-sortfield-speed"]')
  await page.waitForTimeout(220)
  await closeMenus()
  const speedOrder = await page.$$eval('[data-testid="species-rows"] [data-species-id]', (els) =>
    els.map((e) => Number(e.getAttribute('data-species-id'))),
  )
  const speedValues = speedOrder.map(
    (id) => resolveStats(defaultVariety(speciesById[id]), 4).stats.speed,
  )
  check(
    'and sorting by Speed really orders the cards by Speed',
    speedValues.every((v, i) => i === 0 || v >= speedValues[i - 1]),
    speedValues.slice(0, 8).join(','),
  )
  await pickSort('dex')
  await closeMenus()
  await page.screenshot({ path: `${SHOTS}/dexf-pokedex-grid.png` })

  // ==================================================================
  hr('4 — POKEDEX LIST VIEW: 35 columns, the first twelve on screen')
  await page.click('[data-testid="toggle-species-view"]')
  await page.waitForTimeout(400)
  await closeMenus()

  const table = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('[data-testid="species-rows"] thead th')]
    const labelled = ths.filter((t) => t.textContent.trim())
    const twelfth = labelled[11].getBoundingClientRect()
    const wrap = document.querySelector('.species-list-table .data-table-wrap')
    return {
      columns: labelled.length,
      labels: labelled.map((t) => t.textContent.replace(/[▲▼]/g, '').trim()),
      twelfthRight: Math.round(twelfth.right),
      viewport: window.innerWidth,
      wrapWidth: Math.round(wrap.clientWidth),
      scrolls: wrap.scrollWidth > wrap.clientWidth,
      overflowX: getComputedStyle(wrap).overflowX,
      fontSize: parseFloat(
        getComputedStyle(document.querySelector('[data-testid="species-rows"]')).fontSize,
      ),
      nameWeight: getComputedStyle(document.querySelector('[data-testid="species-open-1"]'))
        .fontWeight,
    }
  })
  log(`  table: ${table.columns} columns, first twelve end at ${table.twelfthRight}px`)
  log(`  labels: ${table.labels.join(' | ')}`)
  check('thirty-five columns', table.columns === 35, String(table.columns))
  check(
    'in the order asked for, national and regional dex first',
    JSON.stringify(table.labels.slice(0, 12)) ===
      JSON.stringify([
        'Nat #',
        'Reg #',
        'Name',
        'Types',
        'Abilities',
        'BST',
        'HP',
        'Attack',
        'Defense',
        'Sp. Atk',
        'Sp. Def',
        'Speed',
      ]),
    table.labels.slice(0, 12).join(','),
  )
  check(
    'the first twelve fit the window with no horizontal scrolling',
    table.twelfthRight <= table.wrapWidth,
    `${table.twelfthRight} <= ${table.wrapWidth}`,
  )
  check(
    'and the rest are reachable by scrolling sideways, not clipped away',
    table.scrolls && table.overflowX === 'auto',
    `scrolls=${table.scrolls} overflowX=${table.overflowX}`,
  )
  check(
    'the type is smaller than the body size it was, and the weight is regular',
    table.fontSize <= 11 && table.nameWeight === '400',
    `${table.fontSize}px / ${table.nameWeight}`,
  )

  /* Every new column is checked against the bundle on one row rather than by
     eye: a column that renders a dash everywhere looks fine in a screenshot. */
  const bulbaRow = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-testid="species-row-1"] td')]
    return cells.map((c) => c.textContent.trim())
  })
  const bulba = speciesById[1]
  log(`  Bulbasaur row: ${bulbaRow.slice(0, 20).join(' | ')}`)
  check(
    "the regional dex number is the SELECTED game's, not the national one",
    bulbaRow[1] === String(bulba.pokedex_numbers['updated-johto']).padStart(3, '0'),
    `${bulbaRow[1]} vs ${bulba.pokedex_numbers['updated-johto']}`,
  )
  check('egg groups come from the bundle', bulbaRow[12] === 'Monster · Grass', bulbaRow[12])
  check('EV yield is the effort values', bulbaRow[13] === '1 Sp. Atk', bulbaRow[13])
  check('catch rate', bulbaRow[16] === String(bulba.capture_rate), bulbaRow[16])
  check(
    'base experience',
    bulbaRow[18] === String(defaultVariety(bulba).base_experience),
    bulbaRow[18],
  )
  check('gender ratio', bulbaRow[19] === '87.5% ♂ / 12.5% ♀', bulbaRow[19])
  check('egg cycles', bulbaRow[21] === String(bulba.hatch_counter), bulbaRow[21])
  check('genus', bulbaRow[25] === bulba.genus, bulbaRow[25])
  check('evolution stage', bulbaRow[31] === '1', bulbaRow[31])
  check(
    'evolves to, with the trigger condition spelled out',
    bulbaRow[33]?.startsWith('Ivysaur (Level 16'),
    bulbaRow[33],
  )
  check('and "further evolutions" is answered', bulbaRow[34] === 'Yes', bulbaRow[34])
  await page.screenshot({ path: `${SHOTS}/dexf-pokedex-list.png` })

  check(
    'the Sort trigger is disabled here -- the column headers are the control',
    await page.$eval('[data-testid="dex-sort-toggle"]', (e) => e.disabled),
  )
  check('and no Sort panel is left open under it', (await panelOpen('dex-sort')) === false)
  await page.click('[data-testid="species-sort-stat-speed"]')
  await page.waitForTimeout(250)
  const listSpeed = await page.$$eval(
    '[data-testid="species-rows"] tbody tr[data-entry-id]',
    (els) => els.map((e) => Number(e.getAttribute('data-entry-id'))),
  )
  const listSpeedValues = listSpeed.map(
    (id) => resolveStats(defaultVariety(speciesById[id]), 4).stats.speed,
  )
  check(
    'and a header click really sorts the table',
    listSpeedValues.every((v, i) => i === 0 || v >= listSpeedValues[i - 1]),
    listSpeedValues.slice(0, 8).join(','),
  )
  await page.click('[data-testid="species-sort-natdex"]')
  await page.waitForTimeout(250)

  // Back to the grid for the sections that follow.
  await page.click('[data-testid="toggle-species-view"]')
  await page.waitForTimeout(300)
  await closeMenus()

  // ==================================================================
  hr('5 — POKEDEX FILTERS, from the bar')
  await openFilters()
  const allSpecies = await matchCount()
  check(
    'the menu reports every gen-4 species',
    allSpecies === speciesUpTo(4).length,
    `(${allSpecies} vs ${speciesUpTo(4).length})`,
  )

  /* The type filter is a ghost label now, in the type's own colour. */
  await page.click('[data-testid="type-filter-fire"]')
  await page.waitForTimeout(180)
  const fireCount = await matchCount()
  const fireId = typeIdOf('fire')
  const expectedFire = speciesUpTo(4).filter((sp) =>
    defaultVariety(sp).types.some((t) => t.type_id === fireId),
  ).length
  check(
    'the type filter narrows the list',
    fireCount === expectedFire,
    `(${fireCount} vs ${expectedFire})`,
  )
  const fireStyle = await page.$eval('[data-testid="type-filter-fire"]', (e) => ({
    color: getComputedStyle(e).color,
    background: getComputedStyle(e).backgroundColor,
    border: getComputedStyle(e).borderTopWidth,
    declared: e.getAttribute('data-color'),
  }))
  check(
    'and a selected type is a LABEL in its own colour, with no fill and no border',
    fireStyle.color === 'rgb(240, 128, 48)' &&
      fireStyle.background === 'rgba(0, 0, 0, 0)' &&
      fireStyle.border === '0px',
    JSON.stringify(fireStyle),
  )
  await page.click('[data-testid="type-filter-any"]')
  await page.waitForTimeout(180)

  await openMore()
  const monster = eggGroups.find((g) => g.name === 'monster')
  await clickOption('eggGroup', monster.id)
  const monsterCount = await matchCount()
  const expectedMonster = speciesUpTo(4).filter((sp) =>
    (sp.egg_group_ids ?? []).includes(monster.id),
  ).length
  check('egg group', monsterCount === expectedMonster, `(${monsterCount} vs ${expectedMonster})`)
  await page.click('[data-testid="dex-filter-reset-breeding"]')
  await page.waitForTimeout(180)

  await setRange('stat-hp', 'min', '150')
  const bigHp = await matchCount()
  const expectedBigHp = speciesUpTo(4).filter(
    (sp) => (resolveStats(defaultVariety(sp), 4).stats.hp ?? 0) >= 150,
  ).length
  check(
    'a base-stat range reads the era-resolved stat',
    bigHp === expectedBigHp,
    `(${bigHp} vs ${expectedBigHp})`,
  )
  const resetStates = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-testid^="dex-filter-reset-"]')].map((el) => [
        el.getAttribute('data-testid').replace('dex-filter-reset-', ''),
        el.disabled,
      ]),
    ),
  )
  check(
    'only the touched section has an enabled reset icon',
    resetStates.stats === false && resetStates.breeding === true && resetStates.name === true,
    JSON.stringify(resetStates),
  )
  check(
    'and the Reset filters action at the head of the menu is live',
    (await page.$eval('[data-testid="controls-reset-top"]', (e) => e.disabled)) === false,
  )
  await page.click('[data-testid="controls-reset-top"]')
  await page.waitForTimeout(200)
  check(
    'which clears everything, exactly as the one at the foot does',
    (await matchCount()) === allSpecies,
  )

  /* A tall menu scrolls, and once it scrolls it offers the way back. */
  await openMore()
  const toTop = await page.evaluate(async () => {
    const panel = document.querySelector('[data-testid="controls-panel"]')
    panel.scrollTop = panel.scrollHeight
    return { scrolled: panel.scrollTop > 80, scrollable: panel.scrollHeight > panel.clientHeight }
  })
  await page.waitForTimeout(200)
  check('the menu scrolls itself rather than running off the page', toTop.scrollable)
  check(
    'and a back-to-top control appears once it has been scrolled',
    (await page.$('[data-testid="controls-panel-to-top"]')) != null,
  )
  await page.click('[data-testid="controls-panel-to-top"]')
  await page.waitForTimeout(400)
  check(
    'which returns the menu to the top',
    (await page.$eval('[data-testid="controls-panel"]', (e) => e.scrollTop)) < 20,
  )
  await closeMenus()

  // ==================================================================
  hr('6 — THE OTHER DEXES: their filters, from the same menu')

  await goTo('abilitydex')
  const abilityAll = await countOf('abilitydex')
  check('Abilitydex lists every in-scope gen-4 ability', abilityAll === abilitiesIn(4).length)
  await openFilters()
  await page.selectOption('[data-testid="dex-filter-generation"]', '3')
  await page.waitForTimeout(180)
  const gen3 = await countOf('abilitydex')
  check(
    'its generation filter matches the bundle',
    gen3 === abilities.filter((a) => a.generation_id === 3).length,
    `(${gen3})`,
  )
  await clearAll()
  await closeMenus()
  await pickSort('name')
  await closeMenus()
  const abilityNames = await page.$$eval('[data-testid="abilitydex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'and sorting by Name really re-orders it',
    JSON.stringify(abilityNames) ===
      JSON.stringify([...abilityNames].sort((a, b) => a.localeCompare(b))),
    abilityNames.slice(0, 3).join(' | '),
  )
  await pickSort('id')
  await closeMenus()

  await goTo('itemdex')
  const itemAll = await countOf('itemdex')
  await openFilters()
  await clickOption('pocket', 'pokeballs')
  const balls = await countOf('itemdex')
  check(
    'Itemdex: the Pocket filter matches the bundle',
    balls === itemsIn(4).filter((i) => i.pocket === 'pokeballs').length,
    `(${balls})`,
  )
  await openMore()
  const categories = await page.$$eval(
    '[data-testid="dex-filter-category"] button',
    (els) => els.length,
  )
  check(
    'and its Category options are scoped to the chosen pocket',
    categories ===
      new Set(
        itemsIn(4)
          .filter((i) => i.pocket === 'pokeballs')
          .map((i) => i.category),
      ).size,
    String(categories),
  )
  await clearAll()
  await closeMenus()
  check('clear-all restores the full item list', (await countOf('itemdex')) === itemAll)

  await goTo('berrydex')
  const berryAll = await countOf('berrydex')
  await openMore()
  await clickOption('firmness', 'very-hard')
  const veryHard = await countOf('berrydex')
  check(
    'Berrydex: firmness matches the bundle',
    veryHard === berriesIn(4).filter((b) => b.firmness === 'very-hard').length,
    `(${veryHard})`,
  )
  await page.click('[data-testid="dex-filter-reset-taste"]')
  await page.waitForTimeout(180)
  await clickOption('flavor', 'spicy')
  const spicy = await countOf('berrydex')
  check(
    'and dominant flavour is the highest-potency entry',
    spicy === berriesIn(4).filter((b) => dominantFlavors(b).includes('spicy')).length,
    `(${spicy})`,
  )
  await clearAll()
  await closeMenus()
  check('cleared', (await countOf('berrydex')) === berryAll)

  await goTo('naturedex')
  await openMore()
  await page.selectOption('[data-testid="dex-filter-increased"]', 'attack')
  await page.waitForTimeout(180)
  const attackNatures = await countOf('naturedex')
  check(
    'Naturedex: raised-stat matches the bundle',
    attackNatures === natures.filter((n) => n.increased_stat === 'attack').length,
    `(${attackNatures})`,
  )
  await clearAll()
  await closeMenus()

  await goTo('movedex')
  const moveAll = await countOf('movedex')
  check('Movedex lists every gen-4 move', moveAll === movesIn(4).length, `(${moveAll})`)
  await openFilters()
  await page.click('[data-testid="movedex-type-water"]')
  await page.waitForTimeout(180)
  const waterMoves = await countOf('movedex')
  check(
    'and its type filter still works, from the bar',
    waterMoves === movesIn(4).filter((m) => m.type_id === typeIdOf('water')).length,
    `(${waterMoves})`,
  )
  await clearAll()
  await closeMenus()

  // ==================================================================
  hr('7 — MOVEDEX: the two new columns, and the whole move on its page')
  const moveCols = await page.$$eval('[data-testid="movedex-rows"] thead th', (els) =>
    els.map((e) => e.textContent.replace(/[▲▼]/g, '').trim()).filter(Boolean),
  )
  log(`  move columns: ${moveCols.join(' | ')}`)
  check(
    'the table gained a Range column and a Gen column',
    moveCols.includes('Range') && moveCols.includes('Gen'),
    moveCols.join(','),
  )
  const swordsDance = moves.find((m) => m.name === 'swords-dance')
  await page.click(`[data-testid="movedex-open-${swordsDance.id}"]`)
  await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 15000 })
  const movePage = await page.evaluate(() => {
    const rows = (testId) =>
      [...document.querySelectorAll(`[data-testid="${testId}"] li`)].map((li) => [
        li.querySelector('.fact-label')?.textContent?.trim(),
        li.querySelector('.fact-value')?.textContent?.trim(),
      ])
    return {
      facts: Object.fromEntries(rows('movedex-facts')),
      meta: Object.fromEntries(rows('movedex-meta')),
      contest: Object.fromEntries(rows('movedex-contest')),
    }
  })
  log(`  Swords Dance: ${JSON.stringify(movePage)}`)
  check("the page states the move's range", movePage.facts.Range === 'Self', movePage.facts.Range)
  check(
    'its priority and the generation it was introduced in',
    movePage.facts.Priority === String(swordsDance.priority) &&
      movePage.facts.Introduced === `Generation ${swordsDance.generation_id}`,
    `${movePage.facts.Priority} / ${movePage.facts.Introduced}`,
  )
  check(
    'the stat changes it applies',
    movePage.facts['Stat changes'] === '+2 Attack',
    movePage.facts['Stat changes'],
  )
  check(
    'the meta block, with the rows that say nothing dropped',
    movePage.meta.Category === 'Net Good Stats' && !('Drain' in movePage.meta),
    JSON.stringify(movePage.meta),
  )
  check(
    'and its contest data',
    movePage.contest['Contest type'] === 'Beauty',
    JSON.stringify(movePage.contest),
  )
  await page.screenshot({ path: `${SHOTS}/dexf-movedex-detail.png` })

  const furySwipes = moves.find((m) => m.name === 'fury-swipes')
  await page.click('[data-testid="entity-back"]')
  await page.waitForSelector('[data-testid="movedex-rows"]', { timeout: 15000 })
  await page.click(`[data-testid="movedex-open-${furySwipes.id}"]`)
  await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 15000 })
  const hits = await page.$$eval('[data-testid="movedex-meta"] li', (els) =>
    Object.fromEntries(
      els.map((li) => [
        li.querySelector('.fact-label')?.textContent?.trim(),
        li.querySelector('.fact-value')?.textContent?.trim(),
      ]),
    ),
  )
  check(
    'a multi-hit move finally says how many times it hits',
    hits.Hits === `${furySwipes.meta.min_hits}–${furySwipes.meta.max_hits}`,
    hits.Hits,
  )
  await page.click('[data-testid="entity-back"]')
  await page.waitForSelector('[data-testid="movedex-rows"]', { timeout: 15000 })

  // ==================================================================
  hr('8 — BERRYDEX DETAIL, and the BREEDING dex card row')
  await goTo('berrydex')
  const oran = berries.find((b) => b.name === 'oran')
  await page.click(`[data-testid="berrydex-open-${oran.id}"]`)
  await page.waitForSelector('[data-testid="berrydex-detail"]', { timeout: 15000 })
  const berryPage = await page.evaluate(() => ({
    name: document.querySelector('[data-testid="berrydex-name"]')?.textContent?.trim(),
    dryness: document.querySelector('[data-testid="berrydex-detail-dryness"]')?.textContent?.trim(),
    harvest: document.querySelector('[data-testid="berrydex-detail-harvest"]')?.textContent?.trim(),
    flavours: document
      .querySelector('[data-testid="berrydex-detail-flavours"]')
      ?.textContent?.trim(),
    effect: document.querySelector('[data-testid="berrydex-effect"]')?.textContent?.trim(),
    hero: document.querySelectorAll('[data-testid="berrydex-detail"] .item-hero').length,
    rows: document.querySelectorAll('[data-testid="berrydex-facts"] li').length,
  }))
  log(`  Oran page: ${JSON.stringify(berryPage)}`)
  check(
    'the berry page exists and names its berry',
    berryPage.name === 'Oran Berry',
    berryPage.name,
  )
  check(
    "it is the item page's structure -- a hero and boxless fact rows",
    berryPage.hero === 1 && berryPage.rows >= 8,
    `hero=${berryPage.hero} rows=${berryPage.rows}`,
  )
  check(
    'and it carries the fields the card had no room for',
    berryPage.dryness === String(oran.soil_dryness) &&
      berryPage.harvest === String(oran.max_harvest) &&
      ['Spicy', 'Dry', 'Sweet', 'Bitter', 'Sour'].every((f) => berryPage.flavours.includes(f)),
    `${berryPage.dryness} / ${berryPage.harvest} / ${berryPage.flavours}`,
  )
  await page.screenshot({ path: `${SHOTS}/dexf-berrydex-detail.png` })
  await page.click('[data-testid="entity-back"]')
  await page.waitForSelector('[data-testid="berrydex-rows"]', { timeout: 15000 })

  await goTo('breedingdex')
  await page.click('[data-testid="breedingdex-row-1"]')
  await page.waitForSelector('[data-testid="breedingdex-detail"]', { timeout: 15000 })
  const memberCard = await page.evaluate(() => {
    const gender = document.querySelector('[data-testid^="species-card-gender-"]')
    if (!gender) return null
    const id = Number(gender.getAttribute('data-testid').replace('species-card-gender-', ''))
    const groups = document.querySelector(`[data-testid="species-card-egg-groups-${id}"]`)
    const card = gender.closest('.species-card').getBoundingClientRect()
    return {
      id,
      text: gender.textContent.trim(),
      belowGroups: gender.getBoundingClientRect().top >= groups.getBoundingClientRect().bottom - 1,
      clipped: gender.getBoundingClientRect().bottom > card.bottom,
      height: Math.round(card.height),
      width: Math.round(card.width),
    }
  })
  log(`  breeding card: ${JSON.stringify(memberCard)}`)
  check('every card carries a gender-ratio row', memberCard != null)
  check(
    'below the egg-group row, inside a card that did not grow',
    memberCard?.belowGroups && memberCard?.clipped === false && memberCard?.height === 199,
    JSON.stringify(memberCard),
  )
  const expectedGender = speciesById[memberCard.id].gender_rate
  check(
    'and it says what the bundle says',
    expectedGender < 0
      ? memberCard.text === 'Genderless'
      : memberCard.text.includes(`${100 - (expectedGender / 8) * 100}% ♂`) ||
          memberCard.text === '100% ♀',
    `${memberCard.text} (gender_rate ${expectedGender})`,
  )
  await page.screenshot({ path: `${SHOTS}/dexf-breedingdex-detail.png` })

  // ==================================================================
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  const ourBad = badResponses.filter((r) => r.includes(`localhost:${PORT}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed same-origin responses', ourBad.length === 0, ourBad.slice(0, 3).join(' | '))
} finally {
  await browser?.close()
  preview.stop()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
  log(`  screenshots written to ${SHOTS}/`)
} else {
  log(`  ${failures.length} FAILED:`)
  failures.forEach((f) => log(`    - ${f}`))
  process.exitCode = 1
}
