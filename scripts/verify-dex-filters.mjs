/**
 * Verification for the dex-wide search / filter / sort pass.
 *
 * Six dexes gained a declared filter config and four of them gained a sort
 * panel. Everything asserted here is either computed from the bundle in this
 * file and compared against the rendered DOM, or read back off what rendered --
 * never compared against a number typed in by hand. A filter that quietly stops
 * narrowing is indistinguishable from a list that happens to be short, so every
 * filter check also asserts that it NARROWED, and every sort check re-derives
 * the expected order rather than trusting the arrow.
 *
 * THE BEHAVIOURAL HALF IS THE POINT. The interaction was locked at a mockup
 * review -- click a trigger to open, click it again or click away to close, only
 * one panel open at a time, "More filters" collapsed by default, one reset per
 * section, one clear-all -- and none of that is visible in a count. Sections 1
 * and 8 drive it on every page that has it.
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

/** Mirrors data/generations.ts: dex-id ranges, not a per-species lookup. */
const genOfSpecies = (id) => (id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 : 4)
const speciesUpTo = (g) => species.filter((s) => genOfSpecies(s.id) <= g)

const defaultVariety = (s) => s.varieties.find((v) => v.is_default) ?? s.varieties[0]

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

/** Berries are scoped through their linked item, exactly as availability.ts does. */
const berriesIn = (g) =>
  berries.filter((b) => b.item_id != null && itemsById[b.item_id]?.generation_ids.includes(g))

/** The Abilitydex lists only abilities with a Gen 1-4 presence. */
const abilitiesInList = abilities.filter((a) => (a.generation_id ?? 99) <= 4)
const abilitiesIn = (g) => abilitiesInList.filter((a) => (a.generation_id ?? 99) <= g)

const itemsIn = (g) => items.filter((i) => i.generation_ids.includes(g))

/** Highest-potency flavours; every flavour at the maximum, ties included. */
function dominantFlavors(berry) {
  const potency = Math.max(0, ...berry.flavors.map((f) => f.potency))
  if (potency === 0) return []
  return berry.flavors.filter((f) => f.potency === potency && f.flavor).map((f) => f.flavor)
}

hr('EXPECTED VALUES — computed from the bundle')
log(`  species ${species.length} · items ${items.length} · abilities ${abilities.length}`)
log(`  abilities the dex lists: ${abilitiesInList.length}`)
log(
  `  gen-4 items ${itemsIn(4).length} · gen-4 berries ${berriesIn(4).length} · natures ${natures.length}`,
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

  /* The nav opens its dropdown on hover and keeps it open while the pointer is
     on the tab, directly over the top-left of the page -- which is where the
     per-dex triggers sit. Park the pointer somewhere harmless first. */
  const park = async () => {
    await page.mouse.move(1100, 750)
    await page.waitForTimeout(60)
  }

  const goTo = async (id) => {
    await goToDex(page, id)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
    await park()
  }

  const toList = async (dex) => {
    if (await page.$('[data-testid="entity-back"]')) {
      await page.click('[data-testid="entity-back"]')
      await page.waitForSelector(`[data-testid="${dex}-count"]`, { timeout: 15000 })
    }
  }

  const countOf = async (dex) => {
    const txt = await page.textContent(`[data-testid="${dex}-count"]`)
    return Number(txt.trim().split(' ')[0])
  }

  const isOpen = (dex, which) =>
    page.$eval(
      `[data-testid="${dex}-controls"]`,
      (el, w) => (w === 'filter' ? el.dataset.open === 'true' : el.dataset.sortOpen === 'true'),
      which,
    )

  /*
    The outside-click target has to be genuinely inert. The obvious choice --
    clicking empty page beside the list -- is not: the Itemdex's rows are full
    width, so a press at any plausible "empty" coordinate opens an item. The boot
    line in the footer is outside every panel, present on every screen, and is
    not a control.
  */
  const clickOutside = async () => {
    await page.click('[data-testid="boot-status"]')
    await page.waitForTimeout(150)
  }

  const openPanel = async (dex, which) => {
    if (await isOpen(dex, which)) return
    await park()
    await page.click(`[data-testid="${dex}-${which === 'filter' ? 'controls' : 'sort'}-toggle"]`)
    await page.waitForTimeout(120)
  }

  const closePanels = async (dex) => {
    for (const which of ['filter', 'sort']) {
      if (await isOpen(dex, which)) {
        await page.click(
          `[data-testid="${dex}-${which === 'filter' ? 'controls' : 'sort'}-toggle"]`,
        )
        await page.waitForTimeout(80)
      }
    }
  }

  const openMore = async (dex) => {
    await openPanel(dex, 'filter')
    const open = await page.$eval(`[data-testid="${dex}-filter-more"]`, (el) => el.dataset.open)
    if (open !== 'true') {
      await page.click(`[data-testid="${dex}-filter-more-toggle"]`)
      await page.waitForTimeout(100)
    }
  }

  /** Click one middot option in a multi filter. The panel must already be open. */
  const clickOption = async (dex, key, value) => {
    await page.click(`[data-testid="${dex}-filter-${key}-${value}"]`)
    await page.waitForTimeout(120)
  }

  const setRange = async (dex, key, part, value) => {
    await page.fill(`[data-testid="${dex}-filter-${key}-${part}"]`, value)
    await page.waitForTimeout(120)
  }

  const pickSort = async (dex, key) => {
    await openPanel(dex, 'sort')
    await page.click(`[data-testid="${dex}-sortfield-${key}"]`)
    await page.waitForTimeout(120)
  }

  /** The rendered order, as entry ids. */
  const orderOf = (dex) =>
    page.$$eval(`[data-testid="${dex}-rows"] [data-entry-id]`, (els) =>
      els.map((e) => Number(e.getAttribute('data-entry-id'))),
    )

  const clearAll = async (dex) => {
    await openPanel(dex, 'filter')
    await page.click(`[data-testid="${dex}-filter-clear"]`)
    await page.waitForTimeout(120)
  }

  const selectGame = async (vg) => {
    // The game selector lives in the app bar's panel, which is its own
    // disclosure and does not dismiss on an outside click.
    const open = await page.$eval(
      '[data-testid="app-controls"]',
      (el) => el.dataset.open === 'true',
    )
    if (!open) await page.click('[data-testid="controls-toggle"]')
    await page.waitForSelector('[data-testid="vg-select"]', { state: 'visible', timeout: 15000 })
    await page.selectOption('[data-testid="vg-select"]', vg)
    await page.waitForTimeout(180)
    await page.click('[data-testid="controls-toggle"]')
    await page.waitForTimeout(100)
  }

  // ==================================================================
  hr('1 — DISCLOSURE BEHAVIOUR, on every dex that has a controls row')
  /*
    The interaction locked at the mockup review, asserted rather than assumed:
    a trigger opens its panel, the same trigger closes it, a press outside the
    row closes whichever is open, opening one closes the other, and the nested
    "More filters" fold starts closed. Four of these are invisible in any count.
  */
  const WITH_SORT = ['itemdex', 'berrydex', 'abilitydex']
  const WITH_CONTROLS = [...WITH_SORT, 'naturedex', 'breedingdex']

  for (const dex of WITH_CONTROLS) {
    await goTo(dex)
    await toList(dex)
    await park()

    const startClosed = await isOpen(dex, 'filter')
    check(`[${dex}] the filter panel starts closed`, startClosed === false)

    await page.click(`[data-testid="${dex}-controls-toggle"]`)
    await page.waitForTimeout(120)
    check(`[${dex}] its trigger opens it`, (await isOpen(dex, 'filter')) === true)
    check(
      `[${dex}] and the name search is really on screen`,
      await page.isVisible(`[data-testid="${dex}-search"]`),
    )

    await page.click(`[data-testid="${dex}-controls-toggle"]`)
    await page.waitForTimeout(120)
    check(`[${dex}] the same trigger closes it`, (await isOpen(dex, 'filter')) === false)

    // Outside click. The list body is a safe target that is not a control.
    await page.click(`[data-testid="${dex}-controls-toggle"]`)
    await page.waitForTimeout(120)
    await clickOutside()
    await page.waitForTimeout(150)
    check(`[${dex}] a press outside the row closes it`, (await isOpen(dex, 'filter')) === false)

    const hasSort = (await page.$(`[data-testid="${dex}-sort-toggle"]`)) != null
    check(
      `[${dex}] a Sort trigger exists exactly when the dex declares sort fields`,
      hasSort === WITH_SORT.includes(dex),
      hasSort ? 'present' : 'absent',
    )

    if (hasSort) {
      await openPanel(dex, 'filter')
      await page.click(`[data-testid="${dex}-sort-toggle"]`)
      await page.waitForTimeout(140)
      const filterStillOpen = await isOpen(dex, 'filter')
      const sortOpen = await isOpen(dex, 'sort')
      check(
        `[${dex}] opening Sort closes the filter panel`,
        sortOpen === true && filterStillOpen === false,
        `filter=${filterStillOpen} sort=${sortOpen}`,
      )
      await clickOutside()
      await page.waitForTimeout(150)
      check(`[${dex}] and an outside press closes Sort too`, (await isOpen(dex, 'sort')) === false)
    }

    const hasMore = (await page.$(`[data-testid="${dex}-filter-more"]`)) != null
    if (hasMore) {
      await openPanel(dex, 'filter')
      const moreOpen = await page.$eval(
        `[data-testid="${dex}-filter-more"]`,
        (el) => el.dataset.open,
      )
      check(`[${dex}] "More filters" is collapsed by default`, moreOpen === 'false')
      const nestedVisible = await page.isVisible(`[data-testid="${dex}-filter-more-panel"]`)
      check(`[${dex}] and nothing inside it is on screen while collapsed`, nestedVisible === false)
      await page.click(`[data-testid="${dex}-filter-more-toggle"]`)
      await page.waitForTimeout(120)
      check(
        `[${dex}] its own trigger opens the fold`,
        await page.isVisible(`[data-testid="${dex}-filter-more-panel"]`),
      )
    }
    await closePanels(dex)
  }

  /*
    THE MOVEDEX IS THE ONE DEX THAT KEEPS ITS ALWAYS-VISIBLE ROW, by standing
    decision -- its table is dense enough that filtering is the primary way
    through it and its sorting is its column headers, so it has nothing to put
    behind a click. Asserted rather than assumed, because the natural outcome of
    a pass that gave every other dex two disclosures is that this one quietly
    gets them too.
  */
  await goTo('movedex')
  check(
    '[movedex] keeps its always-visible control row, with no disclosure triggers',
    (await page.$('[data-testid="movedex-controls-toggle"]')) === null &&
      (await page.$('[data-testid="movedex-sort-toggle"]')) === null &&
      (await page.isVisible('[data-testid="movedex-search"]')),
  )
  check(
    '[movedex] and its type filter is still on screen beside the search',
    await page.isVisible('[data-testid="movedex-type-any"]'),
  )

  // ==================================================================
  hr('2 — ABILITYDEX: generation filter and three sort fields')
  await goTo('abilitydex')
  await selectGame('heartgold-soulsilver')
  await goTo('abilitydex')
  await toList('abilitydex')

  const abilityAll = await countOf('abilitydex')
  check(
    'lists every in-scope ability for Generation 4',
    abilityAll === abilitiesIn(4).length,
    `(${abilityAll} vs ${abilitiesIn(4).length})`,
  )

  await openPanel('abilitydex', 'filter')
  const genOptions = await page.$$eval(
    '[data-testid="abilitydex-filter-generation"] option',
    (els) => els.map((e) => e.value),
  )
  log(`  generation options: ${genOptions.join(', ')}`)
  check(
    'the generation options are read off the list, not hardcoded',
    JSON.stringify(genOptions) === JSON.stringify(['', '3', '4']),
    genOptions.join(','),
  )
  await page.selectOption('[data-testid="abilitydex-filter-generation"]', '3')
  await page.waitForTimeout(150)
  const gen3Abilities = await countOf('abilitydex')
  const expectedGen3 = abilities.filter((a) => a.generation_id === 3).length
  check(
    'Generation 3 narrows to exactly the Gen 3 abilities',
    gen3Abilities === expectedGen3,
    `(${gen3Abilities} vs ${expectedGen3})`,
  )
  check('and that really is a narrowing', gen3Abilities < abilityAll)
  await page.screenshot({ path: `${SHOTS}/dex-filters-abilitydex.png` })
  await clearAll('abilitydex')
  check('clear-all restores the full list', (await countOf('abilitydex')) === abilityAll)
  await closePanels('abilitydex')

  const idOrder = await orderOf('abilitydex')
  check(
    'the default order is ability #, ascending -- the order the rows print',
    JSON.stringify(idOrder) === JSON.stringify([...idOrder].sort((a, b) => a - b)),
  )
  await pickSort('abilitydex', 'name')
  await closePanels('abilitydex')
  const nameOrder = await page.$$eval('[data-testid="abilitydex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'sorting by Name really re-orders the list alphabetically',
    JSON.stringify(nameOrder) === JSON.stringify([...nameOrder].sort((a, b) => a.localeCompare(b))),
    nameOrder.slice(0, 3).join(' | '),
  )
  await pickSort('abilitydex', 'name') // same field again -> descending
  await closePanels('abilitydex')
  const nameDesc = await page.$$eval('[data-testid="abilitydex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'clicking the same field again flips the direction',
    JSON.stringify(nameDesc) === JSON.stringify([...nameOrder].reverse()),
    nameDesc.slice(0, 2).join(' | '),
  )
  await openPanel('abilitydex', 'sort')
  const dirState = await page.getAttribute(
    '[data-testid="toggle-abilitydex-sort-dir"]',
    'data-state',
  )
  check('and the direction switch reports the same thing', dirState === 'on', dirState)
  await page.click('[data-testid="toggle-abilitydex-sort-dir"]')
  await page.waitForTimeout(120)
  await closePanels('abilitydex')
  const backToAsc = await page.$$eval('[data-testid="abilitydex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'flipping the switch flips the list back',
    JSON.stringify(backToAsc) === JSON.stringify(nameOrder),
  )
  await pickSort('abilitydex', 'id')
  await closePanels('abilitydex')

  // ==================================================================
  hr('3 — BERRYDEX: firmness, dominant flavour, Natural Gift type, ranges')
  await goTo('berrydex')
  const berryAll = await countOf('berrydex')
  check(
    'lists every gen-4 berry',
    berryAll === berriesIn(4).length,
    `(${berryAll} vs ${berriesIn(4).length})`,
  )

  await openMore('berrydex')
  await clickOption('berrydex', 'firmness', 'very-hard')
  const veryHard = await countOf('berrydex')
  const expectedVeryHard = berriesIn(4).filter((b) => b.firmness === 'very-hard').length
  check(
    'firmness "Very Hard" matches the bundle',
    veryHard === expectedVeryHard,
    `(${veryHard} vs ${expectedVeryHard})`,
  )
  await clickOption('berrydex', 'firmness', 'soft')
  const hardOrSoft = await countOf('berrydex')
  const expectedOr = berriesIn(4).filter((b) => ['very-hard', 'soft'].includes(b.firmness)).length
  check(
    'a second firmness is OR-ed, not AND-ed',
    hardOrSoft === expectedOr,
    `(${hardOrSoft} vs ${expectedOr})`,
  )
  await page.screenshot({ path: `${SHOTS}/dex-filters-berrydex.png` })
  await page.click('[data-testid="berrydex-filter-reset-taste"]')
  await page.waitForTimeout(140)
  check(
    'the Taste section reset clears just that section',
    (await countOf('berrydex')) === berryAll,
  )

  await clickOption('berrydex', 'flavor', 'spicy')
  const spicy = await countOf('berrydex')
  const expectedSpicy = berriesIn(4).filter((b) => dominantFlavors(b).includes('spicy')).length
  check(
    'dominant flavour is the highest-potency entry, ties included',
    spicy === expectedSpicy,
    `(${spicy} vs ${expectedSpicy})`,
  )
  await page.click('[data-testid="berrydex-filter-reset-taste"]')
  await page.waitForTimeout(140)

  await setRange('berrydex', 'growthTime', 'min', '18')
  const slowGrowers = await countOf('berrydex')
  const expectedSlow = berriesIn(4).filter(
    (b) => b.growth_time != null && b.growth_time >= 18,
  ).length
  check(
    'a range filter is inclusive at its bound',
    slowGrowers === expectedSlow,
    `(${slowGrowers} vs ${expectedSlow})`,
  )
  check('and it narrowed', slowGrowers < berryAll && slowGrowers > 0)
  await clearAll('berrydex')

  // The type filter is the shared component, reused exactly as shipped.
  await openPanel('berrydex', 'filter')
  await page.click('[data-testid="berrydex-ng-type-fire"]')
  await page.waitForTimeout(140)
  const fireGift = await countOf('berrydex')
  const fireTypeId = Object.values(bundle('types')).find((t) => t.name === 'fire').id
  const expectedFire = berriesIn(4).filter((b) => b.natural_gift_type_id === fireTypeId).length
  check(
    'the Natural Gift type filter is the shared .tf control and it filters',
    fireGift === expectedFire,
    `(${fireGift} vs ${expectedFire})`,
  )
  const tfClass = await page.getAttribute('[data-testid="berrydex-ng-type-fire"]', 'class')
  check(
    'the selected type button takes the shared on-state class',
    /\btf-on\b/.test(tfClass),
    tfClass,
  )
  await page.click('[data-testid="berrydex-ng-type-any"]')
  await page.waitForTimeout(140)
  check('and "Any" clears it', (await countOf('berrydex')) === berryAll)
  await closePanels('berrydex')

  await pickSort('berrydex', 'growthTime')
  await closePanels('berrydex')
  const berryOrder = await orderOf('berrydex')
  const berryGrowth = berryOrder.map((id) => berries.find((b) => b.id === id).growth_time)
  check(
    'sorting by growth time really orders by growth time',
    berryGrowth.every((v, i) => i === 0 || v >= berryGrowth[i - 1]),
    berryGrowth.slice(0, 6).join(','),
  )
  await pickSort('berrydex', 'id')
  await closePanels('berrydex')

  // ==================================================================
  hr('4 — ITEMDEX: pocket first, category scoped by it, generation')
  await goTo('itemdex')
  const itemAll = await countOf('itemdex')
  check(
    'lists every gen-4 item',
    itemAll === itemsIn(4).length,
    `(${itemAll} vs ${itemsIn(4).length})`,
  )

  await openPanel('itemdex', 'filter')
  await clickOption('itemdex', 'pocket', 'pokeballs')
  const balls = await countOf('itemdex')
  const expectedBalls = itemsIn(4).filter((i) => i.pocket === 'pokeballs').length
  check(
    'the Pocket filter matches the bundle',
    balls === expectedBalls,
    `(${balls} vs ${expectedBalls})`,
  )

  await openMore('itemdex')
  const categoryOptions = await page.$$eval(
    '[data-testid="itemdex-filter-category"] button',
    (els) => els.map((e) => e.textContent.trim()),
  )
  const expectedCategories = [
    ...new Set(
      itemsIn(4)
        .filter((i) => i.pocket === 'pokeballs')
        .map((i) => i.category),
    ),
  ].length
  log(`  categories offered under Poke Balls: ${categoryOptions.join(', ')}`)
  check(
    'the Category options are scoped to the chosen pocket',
    categoryOptions.length === expectedCategories,
    `(${categoryOptions.length} vs ${expectedCategories})`,
  )
  await page.screenshot({ path: `${SHOTS}/dex-filters-itemdex.png` })

  await clickOption('itemdex', 'category', 'standard-balls')
  const standardBalls = await countOf('itemdex')
  const expectedStandard = itemsIn(4).filter(
    (i) => i.pocket === 'pokeballs' && i.category === 'standard-balls',
  ).length
  check(
    'pocket and category narrow together',
    standardBalls === expectedStandard,
    `(${standardBalls} vs ${expectedStandard})`,
  )

  /*
    THE CLAMP: moving to a DIFFERENT pocket must take the old pocket's category
    with it, because the control no longer offers that category. A filter still
    narrowing by a value its own control has stopped listing is the exact drift
    the derived option list exists to prevent -- and it is silent, because what
    the reader sees is a category row that does not mention the thing removing
    their results.

    Deselecting the pocket ENTIRELY is the other case and behaves differently on
    purpose: with no pocket chosen every category is offered again, so a category
    filter on its own is a perfectly good question and is kept.
  */
  await clickOption('itemdex', 'pocket', 'pokeballs')
  await clickOption('itemdex', 'pocket', 'medicine')
  const afterPocketSwap = await countOf('itemdex')
  const expectedMedicine = itemsIn(4).filter((i) => i.pocket === 'medicine').length
  check(
    'switching to another pocket drops the category the old one governed',
    afterPocketSwap === expectedMedicine,
    `(${afterPocketSwap} vs ${expectedMedicine})`,
  )
  const survivingCategory = await page.$$eval(
    '[data-testid="itemdex-filter-category"] button',
    (els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length,
  )
  check('with nothing left selected in the category row', survivingCategory === 0)
  await clearAll('itemdex')
  await closePanels('itemdex')

  await pickSort('itemdex', 'fling')
  await closePanels('itemdex')
  const flingOrder = await orderOf('itemdex')
  const flingValues = flingOrder.map((id) => itemsById[id].fling_power)
  const firstNull = flingValues.findIndex((v) => v == null)
  check(
    'sorting by fling power puts every item with no fling power last',
    firstNull === -1 || flingValues.slice(firstNull).every((v) => v == null),
    `first null at ${firstNull} of ${flingValues.length}`,
  )
  check(
    'and the ones that have it are in order',
    flingValues.filter((v) => v != null).every((v, i, arr) => i === 0 || v >= arr[i - 1]),
  )
  await pickSort('itemdex', 'id')
  await closePanels('itemdex')

  // ==================================================================
  hr('5 — NATUREDEX: stat axes, the neutral toggle, flavours')
  await goTo('naturedex')
  check('lists all 25 natures', (await countOf('naturedex')) === 25)
  check(
    'and declares no sort panel -- a 5x5 matrix has nothing to re-order',
    (await page.$('[data-testid="naturedex-sort-toggle"]')) === null,
  )

  await openMore('naturedex')
  await page.selectOption('[data-testid="naturedex-filter-increased"]', 'attack')
  await page.waitForTimeout(150)
  const attackNatures = await countOf('naturedex')
  const expectedAttack = natures.filter((n) => n.increased_stat === 'attack').length
  check(
    'raised-stat = Attack matches the bundle',
    attackNatures === expectedAttack,
    `(${attackNatures} vs ${expectedAttack})`,
  )
  const statOptions = await page.$$eval(
    '[data-testid="naturedex-filter-increased"] option',
    (els) => els.map((e) => e.value),
  )
  check(
    'HP is not offered as a stat axis -- no nature has ever affected it',
    !statOptions.includes('hp'),
    statOptions.join(','),
  )
  await page.click('[data-testid="naturedex-filter-reset-stats"]')
  await page.waitForTimeout(140)

  await page.click('[data-testid="naturedex-filter-neutral"] .ds-toggle')
  await page.waitForTimeout(150)
  const neutralCount = await countOf('naturedex')
  const expectedNeutral = natures.filter(
    (n) => n.increased_stat == null || n.decreased_stat == null,
  ).length
  check(
    'the Neutral toggle finds exactly the five no-effect natures',
    neutralCount === expectedNeutral,
    `(${neutralCount} vs ${expectedNeutral})`,
  )
  await page.screenshot({ path: `${SHOTS}/dex-filters-naturedex.png` })
  await clearAll('naturedex')

  await page.selectOption('[data-testid="naturedex-filter-likes"]', 'spicy')
  await page.waitForTimeout(150)
  const spicyNatures = await countOf('naturedex')
  const expectedSpicyNatures = natures.filter((n) => n.likes_flavor === 'spicy').length
  check(
    'liked flavour matches the bundle',
    spicyNatures === expectedSpicyNatures,
    `(${spicyNatures} vs ${expectedSpicyNatures})`,
  )
  await clearAll('naturedex')
  await closePanels('naturedex')

  // ==================================================================
  hr('6 — BREEDINGDEX: name search only, and that is deliberate')
  await goTo('breedingdex')
  check('lists all 15 egg groups', (await countOf('breedingdex')) === 15)
  check(
    'declares no sort panel',
    (await page.$('[data-testid="breedingdex-sort-toggle"]')) === null,
  )
  check(
    'and no "More filters" fold either -- the record has three fields',
    (await page.$('[data-testid="breedingdex-filter-more"]')) === null,
  )
  await openPanel('breedingdex', 'filter')
  await page.fill('[data-testid="breedingdex-search"]', 'water')
  await page.waitForTimeout(150)
  const waterGroups = await countOf('breedingdex')
  check('its name search still works', waterGroups === 3, `(${waterGroups})`)
  await clearAll('breedingdex')
  await closePanels('breedingdex')

  // ==================================================================
  hr('7 — POKEDEX: the app bar disclosures, every filter class, both views')
  await goTo('pokedex')
  await selectGame('heartgold-soulsilver')

  const speciesCount = async () =>
    Number((await page.textContent('[data-testid="species-count"]')).trim().split(' ')[0])
  const openSpeciesFilters = async () => {
    const open = await page.$eval(
      '[data-testid="app-controls"]',
      (el) => el.dataset.open === 'true',
    )
    if (!open) await page.click('[data-testid="controls-toggle"]')
    await page.waitForSelector('[data-testid="species-search"]', {
      state: 'visible',
      timeout: 15000,
    })
  }
  const openSpeciesMore = async () => {
    await openSpeciesFilters()
    const open = await page.$eval('[data-testid="species-filter-more"]', (el) => el.dataset.open)
    if (open !== 'true') {
      await page.click('[data-testid="species-filter-more-toggle"]')
      await page.waitForTimeout(120)
    }
  }
  const setRangeSpecies = async (key, part, value) => {
    await page.fill(`[data-testid="species-filter-${key}-${part}"]`, value)
    await page.waitForTimeout(180)
  }
  const closeSpeciesPanels = async () => {
    for (const id of ['controls-toggle', 'species-sort-toggle']) {
      const box = id === 'controls-toggle' ? 'app-controls' : 'species-sort'
      const open = await page.$eval(`[data-testid="${box}"]`, (el) => el.dataset.open === 'true')
      if (open) {
        await page.click(`[data-testid="${id}"]`)
        await page.waitForTimeout(100)
      }
    }
  }

  await openSpeciesFilters()
  const allSpecies = await speciesCount()
  check(
    'the Pokedex count reports every gen-4 species',
    allSpecies === speciesUpTo(4).length,
    `(${allSpecies} vs ${speciesUpTo(4).length})`,
  )

  check(
    'the two Pokedex disclosures are separate triggers in the bar',
    (await page.$('[data-testid="controls-toggle"]')) != null &&
      (await page.$('[data-testid="species-sort-toggle"]')) != null,
  )
  await page.click('[data-testid="species-sort-toggle"]')
  await page.waitForTimeout(140)
  const barFilterOpen = await page.$eval(
    '[data-testid="app-controls"]',
    (el) => el.dataset.open === 'true',
  )
  const barSortOpen = await page.$eval(
    '[data-testid="species-sort"]',
    (el) => el.dataset.open === 'true',
  )
  check(
    'and opening one closes the other, as on every other dex',
    barSortOpen === true && barFilterOpen === false,
    `filter=${barFilterOpen} sort=${barSortOpen}`,
  )
  await page.click('[data-testid="species-sort-toggle"]')
  await page.waitForTimeout(100)

  await openSpeciesMore()
  await page.screenshot({ path: `${SHOTS}/dex-filters-pokedex.png` })

  // --- egg groups (multi, id-valued)
  const eggGroups = Object.values(bundle('egg-groups'))
  const monster = eggGroups.find((g) => g.name === 'monster')
  await page.click(`[data-testid="species-filter-eggGroup-${monster.id}"]`)
  await page.waitForTimeout(160)
  const monsterCount = await speciesCount()
  const expectedMonster = speciesUpTo(4).filter((s) =>
    (s.egg_group_ids ?? []).includes(monster.id),
  ).length
  check(
    'egg group narrows to exactly that group',
    monsterCount === expectedMonster,
    `(${monsterCount} vs ${expectedMonster})`,
  )
  await page.click('[data-testid="species-filter-reset-breeding"]')
  await page.waitForTimeout(160)
  check('the Breeding reset clears it', (await speciesCount()) === allSpecies)

  // --- gender ratio (discrete buckets, not a slider)
  await page.click('[data-testid="species-filter-gender--1"]')
  await page.waitForTimeout(160)
  const genderless = await speciesCount()
  const expectedGenderless = speciesUpTo(4).filter((s) => (s.gender_rate ?? -1) < 0).length
  check(
    'gender ratio is a bucket: Genderless matches the bundle',
    genderless === expectedGenderless,
    `(${genderless} vs ${expectedGenderless})`,
  )
  await page.click('[data-testid="species-filter-reset-breeding"]')
  await page.waitForTimeout(160)

  // --- colour
  await page.click('[data-testid="species-filter-color-purple"]')
  await page.waitForTimeout(160)
  const purple = await speciesCount()
  const expectedPurple = speciesUpTo(4).filter((s) => s.color === 'purple').length
  check('colour matches the bundle', purple === expectedPurple, `(${purple} vs ${expectedPurple})`)
  await page.click('[data-testid="species-filter-reset-appearance"]')
  await page.waitForTimeout(160)

  // --- growth rate (select)
  await page.selectOption('[data-testid="species-filter-growthRate"]', 'slow')
  await page.waitForTimeout(160)
  const slow = await speciesCount()
  const expectedSlowGrowth = speciesUpTo(4).filter((s) => s.growth_rate === 'slow').length
  check(
    'growth rate matches the bundle',
    slow === expectedSlowGrowth,
    `(${slow} vs ${expectedSlowGrowth})`,
  )
  await page.click('[data-testid="species-filter-reset-growth"]')
  await page.waitForTimeout(160)

  // --- base friendship (range)
  await setRangeSpecies('friendship', 'max', '35')
  const lowFriendship = await speciesCount()
  const expectedLowFriendship = speciesUpTo(4).filter(
    (s) => s.base_happiness != null && s.base_happiness <= 35,
  ).length
  check(
    'base friendship is a real range filter',
    lowFriendship === expectedLowFriendship,
    `(${lowFriendship} vs ${expectedLowFriendship})`,
  )
  await page.click('[data-testid="species-filter-reset-growth"]')
  await page.waitForTimeout(160)

  // --- rarity
  await page.selectOption('[data-testid="species-filter-rarity"]', 'legendary')
  await page.waitForTimeout(160)
  const legendaries = await speciesCount()
  const expectedLegendaries = speciesUpTo(4).filter((s) => s.is_legendary).length
  check(
    'Legendary matches the bundle',
    legendaries === expectedLegendaries,
    `(${legendaries} vs ${expectedLegendaries})`,
  )

  /*
    THE STUB. "Has evolutions" is built and deliberately inert pending a
    definition, so it must not narrow the list AND must not read as an active
    filter -- the reset icon beside it stays disabled with only the stub set,
    and the note under it says why.
  */
  await page.click('[data-testid="species-filter-reset-rarity"]')
  await page.waitForTimeout(160)
  await page.selectOption('[data-testid="species-filter-hasEvolutions"]', 'yes')
  await page.waitForTimeout(160)
  check(
    'the stubbed "Has evolutions" filter does not narrow the list',
    (await speciesCount()) === allSpecies,
    `(${await speciesCount()} vs ${allSpecies})`,
  )
  const stubResetDisabled = await page.$eval(
    '[data-testid="species-filter-reset-rarity"]',
    (el) => el.disabled,
  )
  check('nor does it read as an active filter', stubResetDisabled === true)
  const stubNote = (
    await page.textContent('[data-testid="species-filter-note-hasEvolutions"]')
  ).trim()
  check(
    'and it says so on screen rather than pretending to work',
    /not applied yet/i.test(stubNote),
    stubNote.slice(0, 60) + '…',
  )
  await page.selectOption('[data-testid="species-filter-hasEvolutions"]', '')
  await page.waitForTimeout(120)

  // --- base stats (range, era-resolved)
  await setRangeSpecies('stat-hp', 'min', '150')
  const bigHp = await speciesCount()
  const expectedBigHp = speciesUpTo(4).filter(
    (s) => (resolveStats(defaultVariety(s), 4).stats.hp ?? 0) >= 150,
  ).length
  check(
    'a base-stat range reads the ERA-RESOLVED stat',
    bigHp === expectedBigHp,
    `(${bigHp} vs ${expectedBigHp})`,
  )
  await page.click('[data-testid="species-filter-reset-stats"]')
  await page.waitForTimeout(160)

  // --- height / weight, in the units the page prints
  await setRangeSpecies('weight', 'min', '400')
  const heavy = await speciesCount()
  const expectedHeavy = speciesUpTo(4).filter((s) => {
    const w = defaultVariety(s).weight
    return w != null && w / 10 >= 400
  }).length
  check(
    'weight filters in kilogrammes, which is what the app prints',
    heavy === expectedHeavy,
    `(${heavy} vs ${expectedHeavy})`,
  )
  await page.click('[data-testid="species-filter-clear"]')
  await page.waitForTimeout(180)
  check('clear-all restores everything', (await speciesCount()) === allSpecies)

  // --- the name search and type filter still live here and still work
  await page.fill('[data-testid="species-search"]', 'char')
  await page.waitForTimeout(160)
  const charCount = await speciesCount()
  const expectedChar = speciesUpTo(4).filter((s) =>
    s.display_name.toLowerCase().includes('char'),
  ).length
  check(
    'the name search is the first control in the panel and still filters',
    charCount === expectedChar,
    `(${charCount} vs ${expectedChar})`,
  )
  await page.click('[data-testid="species-filter-clear"]')
  await page.waitForTimeout(180)
  await closeSpeciesPanels()

  // ------------------------------------------------------- era gating
  hr('7b — POKEDEX era gating: a filter for a mechanic the era lacks is absent')
  await selectGame('red-blue')
  await goTo('pokedex')
  await openSpeciesMore()
  check(
    'Gen 1 offers no Habitat filter',
    (await page.$('[data-testid="species-filter-habitat"]')) === null,
  )
  check(
    'nor an Egg group filter -- breeding arrives in Generation 2',
    (await page.$('[data-testid="species-filter-eggGroup"]')) === null,
  )
  check(
    'Gen 1 offers the combined Special stat',
    (await page.$('[data-testid="species-filter-stat-special"]')) != null,
  )
  check(
    'and not the split pair, which does not exist yet',
    (await page.$('[data-testid="species-filter-stat-special-attack"]')) === null,
  )
  await page.screenshot({ path: `${SHOTS}/dex-filters-pokedex-gen1.png` })
  await closeSpeciesPanels()

  await selectGame('gold-silver')
  await goTo('pokedex')
  await openSpeciesMore()
  check('Gen 2 has egg groups', (await page.$('[data-testid="species-filter-eggGroup"]')) != null)
  check(
    'but still no habitat, which is a Generation 3 concept',
    (await page.$('[data-testid="species-filter-habitat"]')) === null,
  )
  check(
    'and the split Special pair has arrived',
    (await page.$('[data-testid="species-filter-stat-special-attack"]')) != null,
  )
  await closeSpeciesPanels()

  await selectGame('heartgold-soulsilver')
  await goTo('pokedex')
  await openSpeciesMore()
  check('Gen 4 has habitat', (await page.$('[data-testid="species-filter-habitat"]')) != null)
  await closeSpeciesPanels()

  // ------------------------------------------------------- views and sort
  hr('7c — POKEDEX grid / list views, and one sort state behind both')

  /*
    The Sort panel's open state is driven EXPLICITLY from here rather than by
    counting clicks. Half the controls under test live inside it and half (the
    table's own column headers) live outside it, so a sequence that assumed
    "click the trigger = open" silently ended up reading a closed panel.
  */
  const sortPanelOpen = () =>
    page.$eval('[data-testid="species-sort"]', (el) => el.dataset.open === 'true')
  const openSpeciesSort = async () => {
    if (await sortPanelOpen()) return
    await page.click('[data-testid="species-sort-toggle"]')
    await page.waitForTimeout(140)
  }
  const closeSpeciesSort = async () => {
    if (!(await sortPanelOpen())) return
    await page.click('[data-testid="species-sort-toggle"]')
    await page.waitForTimeout(140)
  }
  const sortFieldLabels = () =>
    page.$$eval('[data-testid="species-sort-fields"] button', (els) =>
      els.map((e) => e.textContent.trim()),
    )
  const activeSortField = () =>
    page.$$eval('[data-testid="species-sort-fields"] button', (els) =>
      els.filter((e) => e.getAttribute('aria-pressed') === 'true').map((e) => e.textContent.trim()),
    )
  /* The active header carries its direction arrow in the same text node, so the
     glyph is stripped before the two lists are compared as names. */
  const headerLabels = () =>
    page.$$eval('[data-testid="species-rows"] thead th', (els) =>
      els.map((e) => e.textContent.replace(/[▲▼]/g, '').trim()).filter(Boolean),
    )
  const gridCardOrder = () =>
    page.$$eval('[data-testid="species-rows"] [data-species-id]', (els) =>
      els.map((e) => Number(e.getAttribute('data-species-id'))),
    )

  await openSpeciesSort()
  const gridFields = await sortFieldLabels()
  log(`  grid sort fields: ${gridFields.join(' · ')}`)
  check(
    'the grid offers three orderings, all of them readable off a card',
    JSON.stringify(gridFields) === JSON.stringify(['Dex #', 'Name', 'Base stat total']),
    gridFields.join(','),
  )

  await page.click('[data-testid="species-sortfield-bst"]')
  await page.waitForTimeout(220)
  const bstValues = (await gridCardOrder()).map(
    (id) => resolveStats(defaultVariety(speciesById[id]), 4).bst,
  )
  check(
    'sorting the GRID by base stat total really orders the cards by it',
    bstValues.every((v, i) => i === 0 || v >= bstValues[i - 1]),
    bstValues.slice(0, 6).join(','),
  )

  // The view switch lives in this panel, so it is reachable with it open.
  await page.click('[data-testid="toggle-species-view"]')
  await page.waitForTimeout(300)
  const tableRows = await page.$$eval(
    '[data-testid="species-rows"] tbody tr[data-entry-id]',
    (els) => els.length,
  )
  check(
    'the List view renders a row per species in a real table',
    tableRows === allSpecies,
    `(${tableRows} vs ${allSpecies})`,
  )
  const listFields = await sortFieldLabels()
  log(`  list sort fields: ${listFields.join(' · ')}`)
  check(
    'and the List view offers every column as an ordering',
    listFields.length === 12 && listFields.includes('Sp. Atk') && listFields.includes('Friendship'),
    `(${listFields.length}) ${listFields.join(',')}`,
  )
  const headers = await headerLabels()
  check(
    'the table headers ARE the sort fields, one for one',
    JSON.stringify(headers) === JSON.stringify(listFields),
    headers.join(','),
  )

  /*
    THE PANEL AND THE HEADER ROW ARE ONE STATE. Clicking a column header must
    move the panel's selection and vice versa -- two copies would disagree the
    first time either was used, and the reader would have no way to tell which
    was in force.
  */
  await closeSpeciesSort()
  await page.click('[data-testid="species-sort-stat-speed"]')
  await page.waitForTimeout(220)
  await openSpeciesSort()
  const panelAfterHeader = await activeSortField()
  check(
    'clicking a column header moves the Sort panel with it',
    JSON.stringify(panelAfterHeader) === JSON.stringify(['Speed']),
    panelAfterHeader.join(','),
  )

  await page.click('[data-testid="species-sortfield-name"]')
  await page.waitForTimeout(220)
  await closeSpeciesSort()
  const headerAfterPanel = await page.$$eval('[data-testid="species-rows"] thead th', (els) =>
    els
      .filter((e) => {
        const sorted = e.getAttribute('aria-sort')
        return sorted != null && sorted !== 'none'
      })
      .map((e) => e.textContent.replace(/[▲▼]/g, '').trim()),
  )
  check(
    'and picking in the panel moves the column header with it',
    JSON.stringify(headerAfterPanel) === JSON.stringify(['Name']),
    headerAfterPanel.join(','),
  )
  await page.screenshot({ path: `${SHOTS}/dex-filters-pokedex-list.png` })

  /*
    Switching back to the grid drops a field the grid does not offer, and must
    fall back rather than leaving the list ordered by a control that is gone.
  */
  await page.click('[data-testid="species-sort-stat-speed"]')
  await page.waitForTimeout(220)
  await openSpeciesSort()
  await page.click('[data-testid="toggle-species-view"]')
  await page.waitForTimeout(300)
  const afterViewSwitch = await activeSortField()
  check(
    'returning to the grid falls back to Dex # rather than keeping a field it has no control for',
    JSON.stringify(afterViewSwitch) === JSON.stringify(['Dex #']),
    afterViewSwitch.join(','),
  )
  await closeSpeciesSort()
  const gridBack = await gridCardOrder()
  check(
    'and the cards really are back in dex order',
    JSON.stringify(gridBack) === JSON.stringify([...gridBack].sort((a, b) => a - b)),
  )

  // ==================================================================
  hr('8 — RESET SEMANTICS: per section, and one clear-all')
  await openSpeciesMore()
  await page.click('[data-testid="species-filter-color-red"]')
  await page.selectOption('[data-testid="species-filter-growthRate"]', 'fast')
  await page.waitForTimeout(200)
  const twoFilters = await speciesCount()
  check('two filters from two sections narrow together', twoFilters < allSpecies && twoFilters > 0)

  const resetStates = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-testid^="species-filter-reset-"]')].map((el) => [
        el.getAttribute('data-testid').replace('species-filter-reset-', ''),
        el.disabled,
      ]),
    ),
  )
  log(`  reset icons disabled: ${JSON.stringify(resetStates)}`)
  check(
    'only the two touched sections have an enabled reset',
    resetStates.appearance === false &&
      resetStates.growth === false &&
      resetStates.breeding === true &&
      resetStates.stats === true,
    JSON.stringify(resetStates),
  )
  await page.click('[data-testid="species-filter-reset-appearance"]')
  await page.waitForTimeout(200)
  const afterOneReset = await speciesCount()
  const expectedFast = speciesUpTo(4).filter((s) => s.growth_rate === 'fast').length
  check(
    'a section reset clears ONLY its own section',
    afterOneReset === expectedFast,
    `(${afterOneReset} vs ${expectedFast})`,
  )
  await page.click('[data-testid="species-filter-clear"]')
  await page.waitForTimeout(200)
  check('and clear-all clears the rest', (await speciesCount()) === allSpecies)
  const clearDisabled = await page.$eval(
    '[data-testid="species-filter-clear"]',
    (el) => el.disabled,
  )
  check('with the clear-all action disabled once there is nothing to clear', clearDisabled === true)
  await closeSpeciesPanels()

  // ==================================================================
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  const ourBad = badResponses.filter((r) => r.includes(`localhost:${PORT}`))
  log(`  HTTP >=400 (our origin) : ${ourBad.length}`)
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
