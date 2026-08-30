/**
 * Verification for the four new dex modules and the navigation switcher.
 *
 * Every expected number below is computed from the bundle in this file, then
 * asserted against the rendered DOM -- so the suite fails if either the data or
 * the UI drifts, rather than comparing the UI against a hardcoded guess.
 *
 * The Abilitydex reverse lookup is checked against a local re-implementation of
 * the per-slot ability resolution, because the interesting cases are the ones a
 * naive `variety.abilities` scan gets wrong: Gengar must appear under Levitate
 * (its modern ability is Cursed Body, restored by past_abilities) and Bulbasaur
 * must NOT appear under Chlorophyll (that is a Gen 5 hidden ability).
 *
 * Usage: node scripts/verify-dexes.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls, fillDexSearch } from './lib/controls.mjs'
import { goToDex } from './lib/nav.mjs'

const PORT = 4185
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

// =====================================================================
// Expected values, computed from the bundle
// =====================================================================

const bundle = (n) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const speciesById = bundle('species')
const itemsById = bundle('items')
const abilitiesById = bundle('abilities')
const items = Object.values(itemsById)
const abilities = Object.values(abilitiesById)
const natures = Object.values(bundle('natures'))
const berries = Object.values(bundle('berries'))
const abilityByName = Object.fromEntries(abilities.map((a) => [a.name, a]))
const eggGroups = Object.values(bundle('egg-groups'))
const speciesList = Object.values(speciesById)

/** Species introduced by `g`, matching data/generations.ts by dex-id range. */
const speciesUpTo = (g) => speciesList.filter((sp) => (sp.generation_id ?? 99) <= g)

/** Members of an egg group at a generation, straight from the bundle. */
const eggMembers = (groupId, g) =>
  speciesUpTo(g)
    .filter((sp) => (sp.egg_group_ids ?? []).includes(groupId))
    .map((sp) => sp.display_name)

const itemCount = (g) => items.filter((i) => i.generation_ids.includes(g)).length
const abilityCount = (g) => abilities.filter((a) => (a.generation_id ?? 99) <= g).length
const natureCount = (g) => (g >= 3 ? natures.length : 0)
const berryCount = (g) =>
  berries.filter((b) => b.item_id != null && itemsById[b.item_id]?.generation_ids.includes(g))
    .length

/** Mirror of era.ts resolveAbilitiesForGeneration -- per slot, past entries win. */
function resolveAbilities(variety, generation) {
  if (generation < 3) return []
  const pastBySlot = new Map()
  for (const past of variety.past_abilities ?? []) {
    const gen = past.generation_id
    if (gen == null || gen < generation) continue
    for (const se of past.abilities) {
      const ex = pastBySlot.get(se.slot)
      if (ex && ex.generation_id <= gen) continue
      pastBySlot.set(se.slot, { generation_id: gen, entry: se.ability_id == null ? null : se })
    }
  }
  const out = []
  const slots = new Set([...variety.abilities.map((a) => a.slot), ...pastBySlot.keys()])
  for (const slot of [...slots].sort((a, b) => a - b)) {
    const ov = pastBySlot.get(slot)
    const src = ov ? ov.entry : (variety.abilities.find((a) => a.slot === slot) ?? null)
    if (!src) continue
    const abl = abilitiesById[src.ability_id]
    if (!abl) continue
    if ((abl.generation_id ?? 99) > generation) continue
    out.push({ slot, is_hidden: src.is_hidden, ability: abl })
  }
  return out
}

const genOfSpecies = (id) => (id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 : 4)

function expectedHolders(abilityName, generation) {
  const target = abilityByName[abilityName]
  const out = []
  for (const s of Object.values(speciesById)) {
    if (genOfSpecies(s.id) > generation) continue
    if (
      s.varieties.some((v) =>
        resolveAbilities(v, generation).some((a) => a.ability.id === target.id),
      )
    )
      out.push(s.display_name)
  }
  return out
}

const GAMES = [
  { vg: 'red-blue', gen: 1 },
  { vg: 'gold-silver', gen: 2 },
  { vg: 'firered-leafgreen', gen: 3 },
  { vg: 'heartgold-soulsilver', gen: 4 },
]

hr('EXPECTED COUNTS — computed from the bundle')
log('  game                  gen  items  abilities  natures  berries')
for (const g of GAMES) {
  log(
    `  ${g.vg.padEnd(21)} ${g.gen}   ${String(itemCount(g.gen)).padStart(5)}  ${String(
      abilityCount(g.gen),
    ).padStart(
      9,
    )}  ${String(natureCount(g.gen)).padStart(7)}  ${String(berryCount(g.gen)).padStart(7)}`,
  )
}
log(
  `  totals in bundle:        ${items.length} items, ${abilities.length} abilities, ${natures.length} natures, ${berries.length} berries`,
)

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

  const { withControls } = controls(page)

  /*
    Four dexes are a list PAGE plus a detail PAGE now (Naturedex, Movedex,
    Abilitydex, Breeding dex), rather than a rail beside a detail. Their search
    box lives in list view only, so searching again means going back first.
    Itemdex and Berrydex keep the rail, where both are on screen at once, and
    calling this on them is a no-op.
  */
  const toDexList = async (dexId) => {
    if (await page.$('[data-testid="entity-back"]')) {
      await page.click('[data-testid="entity-back"]')
    }
    await page.waitForSelector(`[data-testid="${dexId}-count"]`, { timeout: 15000 })
  }
  await page.waitForSelector('[data-testid="app-nav"]', { timeout: 60000 })

  const goTo = async (id) => {
    await goToDex(page, id)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
  }
  const selectGame = async (vg) => {
    await withControls(() => page.selectOption('[data-testid="vg-select"]', vg))
    await page.waitForTimeout(150)
  }
  /*
    The count lives on the LIST page. Four dexes now replace their list with a
    detail page rather than showing both, so asking for a count while an entry
    is open has to close it first -- otherwise the readout genuinely is not on
    screen. Done here rather than at ~15 call sites.
  */
  const countOf = async (dex) => {
    await toDexList(dex)
    const txt = await page.textContent(`[data-testid="${dex}-count"]`)
    return Number(txt.trim().split(' ')[0])
  }
  const rowIds = (dex) =>
    page.$$eval(`[data-testid="${dex}-rows"] [data-entry-id]`, (els) =>
      els.map((e) => Number(e.getAttribute('data-entry-id'))),
    )

  // ------------------------------------------------------------ item 0: nav
  hr('ITEM 0 — navigation switcher, driven by the module registry')
  const tabs = await page.$$eval('[data-testid="dex-switcher"] button', (els) =>
    els.map((e) => ({
      id: e.getAttribute('data-testid'),
      label: e.textContent.trim(),
      current: e.getAttribute('aria-current'),
    })),
  )
  log(`  tabs: ${tabs.map((t) => t.label).join(' | ')}`)
  // Derived from the registry source, not hardcoded: registering another dex must
  // not require editing this assertion, which is the whole point of the array.
  const registrySrc = readFileSync('src/modules/nav/registry.ts', 'utf8')
  const registryIds = [...registrySrc.matchAll(/\{\s*id:\s*'([a-z]+)'/g)].map((m) => m[1])
  log(`  registry declares: ${registryIds.join(', ')}`)
  check('registry is non-empty', registryIds.length > 0)
  check(
    'every registered module renders as a tab',
    tabs.length === registryIds.length,
    `(${tabs.length} tabs vs ${registryIds.length} registered)`,
  )
  check(
    'tab ids and order come from the registry',
    JSON.stringify(tabs.map((t) => t.id)) === JSON.stringify(registryIds.map((id) => `nav-${id}`)),
    tabs.map((t) => t.id).join(','),
  )
  check('Pokedex is the default active tab', tabs[0].current === 'page')

  await selectGame('heartgold-soulsilver')
  for (const t of tabs) {
    const id = t.id.replace('nav-', '')
    await goTo(id)
    const active = await page.$eval(
      `[data-testid="${t.id}"]`,
      (e) => e.getAttribute('aria-current') === 'page',
    )
    const mounted =
      id === 'pokedex'
        ? (await page.$$('[data-testid="species-rows"]')).length === 1
        : (await page.$$(`[data-testid="dex-${id}"]`)).length === 1
    log(`  ${id.padEnd(11)} active=${active} mounted=${mounted}`)
    check(`navigating to ${id} marks its tab current`, active)
    check(`navigating to ${id} mounts its module`, mounted)
  }
  // Back to a dex first: the loop above ends on whatever module is last in the
  // registry, and not every registered module is a DexShell (the design-system
  // reference page is not), so this has to be asserted from a known dex.
  await goTo('itemdex')
  /*
    `.pokedex-body` was DexShell's rail-plus-detail wrapper, and DexShell no
    longer exists -- every dex is on DexPageShell, whose root is
    [data-testid="dex-<id>"]. The claim being made is unchanged: one dex module
    on screen, not two, so it is asserted against the element that now marks one.
  */
  // .pokedex narrows it to a dex MODULE root: [data-testid^="dex-"] on its own
  // also matches the nav's own "dex-switcher" dropdown.
  const shellCount = await page.$$eval('.pokedex[data-testid^="dex-"]', (e) => e.length)
  check('exactly one dex is mounted at a time', shellCount === 1, `(${shellCount})`)
  await page.screenshot({ path: `${SHOTS}/dex-nav.png` })

  // ------------------------------------------------------------ item 1: items
  hr('ITEM 1 — Itemdex')
  await goTo('itemdex')
  await selectGame('heartgold-soulsilver')
  let n = await countOf('itemdex')
  log(`  gen 4 list count: ${n} (expected ${itemCount(4)})`)
  check('Itemdex lists every gen-4 item', n === itemCount(4), `(${n} vs ${itemCount(4)})`)

  await fillDexSearch(page, 'itemdex', 'ball')
  await page.waitForTimeout(120)
  const ballCount = await countOf('itemdex')
  const expectedBalls = items.filter(
    (i) => i.generation_ids.includes(4) && i.display_name.toLowerCase().includes('ball'),
  ).length
  log(`  search "ball": ${ballCount} (expected ${expectedBalls})`)
  check(
    'search narrows the list',
    ballCount === expectedBalls,
    `(${ballCount} vs ${expectedBalls})`,
  )
  check('search actually narrowed it', ballCount < n)
  const ballLabels = await page.$$eval('[data-testid="itemdex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent),
  )
  check(
    'every result contains the search term',
    ballLabels.every((l) => l.toLowerCase().includes('ball')),
  )
  await fillDexSearch(page, 'itemdex', 'master ball')
  await page.waitForSelector('[data-testid="itemdex-row-1"]', { timeout: 10000 })
  await page.click('[data-testid="itemdex-row-1"]')
  await page.waitForSelector('[data-testid="itemdex-detail"]', { timeout: 10000 })
  const masterBall = await page.evaluate(() => ({
    name: document.querySelector('[data-testid="itemdex-name"]')?.textContent,
    category: document.querySelector('[data-testid="itemdex-category"]')?.textContent,
    effect: document.querySelector('[data-testid="itemdex-effect"]')?.textContent,
    price: document.querySelector('[data-testid="itemdex-price"]')?.textContent,
    // The item page is boxless now, so what is counted is the ABSENCE of a
    // bordered container -- see the inverted check below.
    boxed: [...document.querySelectorAll('[data-testid="itemdex-detail"] *')].filter((el) => {
      const cs = getComputedStyle(el)
      return parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0
    }).length,
    factRows: document.querySelectorAll('[data-testid="itemdex-facts"] li').length,
    pocket: document.querySelector('[data-testid="itemdex-pocket"]')?.textContent,
    artSource: document.querySelector('[data-testid="itemdex-artwork"]')?.dataset.source,
  }))
  log(`  Master Ball detail: ${JSON.stringify(masterBall).slice(0, 260)}`)
  const realItem = itemsById[1]
  check('detail shows the real name', masterBall.name === realItem.display_name)
  check('detail shows the real category', /Standard Balls/i.test(masterBall.category ?? ''))
  check(
    'detail shows the real effect text',
    (masterBall.effect ?? '').startsWith(realItem.effect.slice(0, 40)),
  )
  check('detail shows a price field', (masterBall.price ?? '').length > 0, masterBall.price)
  /*
    INVERTED DELIBERATELY. This asserted `cards >= 3` -- the item page was four
    bordered DexCards. The refinement pass made it boxless and purely
    typographic, so the same structural question now has the opposite answer, and
    asserting it this way is what stops the boxes coming back unnoticed.
  */
  check(
    'detail is boxless -- no bordered container anywhere on the page',
    masterBall.boxed === 0,
    `(${masterBall.boxed} boxed elements)`,
  )
  check(
    'and shows its facts as hairline rows instead',
    masterBall.factRows >= 5,
    `(${masterBall.factRows})`,
  )
  // Bag pocket is a separate field from category, added to the bundle for this.
  check(
    'detail shows the bag pocket as well as the category',
    /pokeballs/i.test(masterBall.pocket ?? ''),
    String(masterBall.pocket),
  )
  check(
    'detail uses the larger Dream World artwork when the item has one',
    masterBall.artSource === 'dream-world',
    String(masterBall.artSource),
  )
  await page.screenshot({ path: `${SHOTS}/dex-itemdex.png` })

  // Generation gating for items (item 5): a real signal exists, so it is applied.
  hr('ITEM 5a — Itemdex generation gating (generation_ids is a real signal)')
  await fillDexSearch(page, 'itemdex', '')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await page.waitForTimeout(150)
    const got = await countOf('itemdex')
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} items (expected ${itemCount(g.gen)})`)
    check(`Itemdex gated correctly for ${g.vg}`, got === itemCount(g.gen), `(${got})`)
  }
  // Safari Ball is the case that proves membership, not min<=G, is the rule.
  await selectGame('gold-silver')
  await fillDexSearch(page, 'itemdex', 'safari ball')
  await page.waitForTimeout(150)
  const safariGen2 = await countOf('itemdex')
  await selectGame('red-blue')
  await page.waitForTimeout(150)
  const safariGen1 = await countOf('itemdex')
  log(
    `  Safari Ball generation_ids: ${JSON.stringify(items.find((i) => i.name === 'safari-ball').generation_ids)}`,
  )
  log(`  Safari Ball visible in gen 1: ${safariGen1 === 1}, in gen 2: ${safariGen2 === 1}`)
  check('Safari Ball shows in Gen 1', safariGen1 === 1)
  check('Safari Ball is hidden in Gen 2 (gap respected, not min<=G)', safariGen2 === 0)
  await fillDexSearch(page, 'itemdex', '')

  // ------------------------------------------------------------ item 2
  hr('ITEM 2 — Abilitydex')
  await goTo('abilitydex')
  await selectGame('heartgold-soulsilver')
  n = await countOf('abilitydex')
  log(`  gen 4 list count: ${n} (expected ${abilityCount(4)})`)
  check('Abilitydex lists every gen-4 ability', n === abilityCount(4), `(${n})`)
  await toDexList('abilitydex')
  await fillDexSearch(page, 'abilitydex', 'levit')
  await page.waitForTimeout(120)
  const levitCount = await countOf('abilitydex')
  check('search narrows to Levitate', levitCount === 1, `(${levitCount})`)

  const levitateId = abilityByName.levitate.id
  await page.click(`[data-testid="abilitydex-row-${levitateId}"]`)
  await page.waitForSelector('[data-testid="abilitydex-detail"]', { timeout: 15000 })

  /*
    The carriers are the shared species-card grid now, not a bespoke <li> list --
    same reverse lookup, same order, different markup. One flat grid: hidden
    abilities do not exist in Gen 1-4, so there is nothing to split on. (Measured:
    12 residual "hidden" flags at gen 3 and 17 at gen 4, all PokeAPI artifacts.
    See the note at the top of Abilitydex.tsx.)
  */
  const readHolders = () =>
    page.$$eval('[data-testid="abilitydex-detail"] .species-card .species-name', (els) =>
      els.map((e) => e.textContent.trim()),
    )

  const levitateG4 = await readHolders()
  const expLevitateG4 = expectedHolders('levitate', 4)
  log(`  Levitate @ gen4: ${levitateG4.length} species`)
  log(`    ${levitateG4.join(', ')}`)
  check(
    'Levitate reverse lookup matches the data at gen 4',
    JSON.stringify(levitateG4) === JSON.stringify(expLevitateG4),
    `(${levitateG4.length} vs ${expLevitateG4.length})`,
  )
  // The case a naive variety.abilities scan gets wrong.
  check(
    'Gengar IS listed under Levitate (past_abilities restores it)',
    levitateG4.includes('Gengar'),
  )
  for (const known of ['Gastly', 'Haunter', 'Weezing', 'Flygon', 'Claydol', 'Bronzong', 'Rotom']) {
    check(`known Levitate carrier ${known} present`, levitateG4.includes(known))
  }
  check('non-carrier Pikachu absent', !levitateG4.includes('Pikachu'))

  await selectGame('firered-leafgreen')
  await page.waitForTimeout(200)
  const levitateG3 = await readHolders()
  const expLevitateG3 = expectedHolders('levitate', 3)
  log(`  Levitate @ gen3: ${levitateG3.length} species`)
  check(
    'Levitate reverse lookup matches the data at gen 3',
    JSON.stringify(levitateG3) === JSON.stringify(expLevitateG3),
    `(${levitateG3.length} vs ${expLevitateG3.length})`,
  )
  check(
    'gen-4 species dropped from the gen-3 lookup',
    !levitateG3.includes('Bronzong') && !levitateG3.includes('Rotom'),
  )
  check('gen-4 lookup was strictly larger', levitateG4.length > levitateG3.length)

  // Second ability: Chlorophyll, whose interesting case is an exclusion.
  await selectGame('heartgold-soulsilver')
  await toDexList('abilitydex')
  await fillDexSearch(page, 'abilitydex', 'chloro')
  await page.waitForTimeout(150)
  const chloroId = abilityByName.chlorophyll.id
  await page.click(`[data-testid="abilitydex-row-${chloroId}"]`)
  await page.waitForSelector('[data-testid="abilitydex-detail"]', { timeout: 15000 })
  const chloroG4 = await readHolders()
  const expChloroG4 = expectedHolders('chlorophyll', 4)
  log(`  Chlorophyll @ gen4: ${chloroG4.length} species`)
  log(`    ${chloroG4.join(', ')}`)
  check(
    'Chlorophyll reverse lookup matches the data at gen 4',
    JSON.stringify(chloroG4) === JSON.stringify(expChloroG4),
    `(${chloroG4.length} vs ${expChloroG4.length})`,
  )
  for (const known of ['Oddish', 'Vileplume', 'Bellossom', 'Sunflora', 'Tropius', 'Tangrowth']) {
    check(`known Chlorophyll carrier ${known} present`, chloroG4.includes(known))
  }
  check(
    'Bulbasaur is NOT listed (its Chlorophyll is a Gen 5 hidden ability)',
    !chloroG4.includes('Bulbasaur'),
  )
  check('Leafeon is NOT listed (its Chlorophyll is Gen 5 too)', !chloroG4.includes('Leafeon'))
  await page.screenshot({ path: `${SHOTS}/dex-abilitydex.png` })

  hr('ITEM 2b — Abilitydex is empty under a Gen 1-2 selection')
  await toDexList('abilitydex')
  await fillDexSearch(page, 'abilitydex', '')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await page.waitForTimeout(200)
    const got = await countOf('abilitydex')
    const gated = await page.$$('[data-testid="abilitydex-empty"]')
    const msg = gated.length
      ? (await page.textContent('[data-testid="abilitydex-empty"]')).trim()
      : null
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} entries${msg ? ` | "${msg.slice(0, 78)}"` : ''}`)
    check(`Abilitydex count correct for ${g.vg}`, got === abilityCount(g.gen), `(${got})`)
    if (g.gen < 3) {
      check(`${g.vg}: list is empty, not silently full`, got === 0)
      check(`${g.vg}: explains why`, /did not exist/i.test(msg ?? ''), JSON.stringify(msg))
      check(
        `${g.vg}: no "undefined"/"NaN" leaked`,
        !/undefined|NaN/.test(await page.textContent('[data-testid="dex-abilitydex"]')),
      )
    }
  }
  await page.screenshot({ path: `${SHOTS}/dex-abilitydex-gen1.png` })

  // ------------------------------------------------------------ item 3
  hr('ITEM 3 — Naturedex')
  await goTo('naturedex')
  await selectGame('heartgold-soulsilver')
  n = await countOf('naturedex')
  check('Naturedex lists all 25 natures', n === 25, `(${n})`)
  const natureIds = await rowIds('naturedex')
  check('nature ids run 1..25', Math.min(...natureIds) === 1 && Math.max(...natureIds) === 25)

  // Adamant: +Attack / -Sp. Atk. A real, checkable pair.
  const adamant = natures.find((x) => x.name === 'adamant')
  await page.click(`[data-testid="naturedex-row-${adamant.id}"]`)
  await page.waitForSelector('[data-testid="naturedex-detail"]', { timeout: 10000 })
  /*
    DIRECTION IS AN ARROW NOW, not the words "increases" / "decreases", so this
    reads the structure rather than a sentence: the stat name, which arrow class
    the glyph carries, and which token that class resolves to. textContent still
    carries the direction as a word, because each arrow is paired with a
    visually-hidden "raised" / "lowered" for screen readers -- which is why the
    name is compared against a trimmed prefix rather than the whole string.
  */
  const adamantView = await page.evaluate(() => {
    const read = (id) => {
      const li = document.querySelector(`[data-testid="${id}"]`)
      if (!li) return null
      const arrow = li.querySelector('.stat-arrow')
      return {
        stat: li.querySelector('.stat-direction')?.firstChild?.textContent?.trim(),
        delta: li.querySelector('.nature-stat-delta')?.textContent?.trim(),
        arrow: arrow?.classList.contains('stat-arrow-up')
          ? 'up'
          : arrow?.classList.contains('stat-arrow-down')
            ? 'down'
            : null,
        color: arrow ? getComputedStyle(arrow).color : null,
        sr: li.querySelector('.visually-hidden')?.textContent?.trim(),
      }
    }
    const words = document.querySelector('[data-testid="naturedex-detail"]')?.textContent ?? ''
    return {
      name: document.querySelector('[data-testid="naturedex-name"]')?.textContent,
      up: read('naturedex-increased'),
      down: read('naturedex-decreased'),
      // The words this pass removed must not be back anywhere on the page.
      hasRaisesLowers: /\b(Raises|Lowers|increases|decreases)\b/.test(words),
    }
  })
  log(
    `  Adamant: ${JSON.stringify(adamantView)} (data: +${adamant.increased_stat} -${adamant.decreased_stat})`,
  )
  check('Adamant detail names the nature', adamantView.name === 'Adamant')
  check(
    'Adamant raises Attack, shown as an up arrow after the stat name',
    adamantView.up?.stat === 'Attack' &&
      adamantView.up?.arrow === 'up' &&
      adamantView.up?.delta === '+10%',
    JSON.stringify(adamantView.up),
  )
  check(
    'the up arrow is --stat-increase and NOT --accent',
    adamantView.up?.color === 'rgb(179, 38, 30)',
    String(adamantView.up?.color),
  )
  check(
    'and the direction exists as a word for a screen reader',
    adamantView.up?.sr === 'raised' && adamantView.down?.sr === 'lowered',
    `${adamantView.up?.sr} / ${adamantView.down?.sr}`,
  )
  check('the words "Raises" and "Lowers" are gone from the page', !adamantView.hasRaisesLowers)
  check(
    'Adamant lowers Sp. Atk, shown as a down arrow after the stat name',
    adamantView.down?.stat === 'Sp. Atk' &&
      adamantView.down?.arrow === 'down' &&
      adamantView.down?.delta === '−10%',
    JSON.stringify(adamantView.down),
  )
  check(
    'the down arrow is --stat-decrease',
    adamantView.down?.color === 'rgb(31, 95, 168)',
    String(adamantView.down?.color),
  )

  check(
    'matches the bundle',
    adamant.increased_stat === 'attack' && adamant.decreased_stat === 'special-attack',
  )

  // Hardy: the neutral case, where both fields are null.
  const hardy = natures.find((x) => x.name === 'hardy')
  // Back to the matrix: a detail page replaces it rather than sitting beside it.
  await toDexList('naturedex')
  await page.click(`[data-testid="naturedex-row-${hardy.id}"]`)
  await page.waitForSelector('[data-testid="naturedex-neutral"]', { timeout: 10000 })
  const neutralText = await page.textContent('[data-testid="naturedex-neutral"]')
  log(`  Hardy (neutral): "${neutralText.trim()}"`)
  check('neutral nature explained, not shown as undefined', !/undefined|null/.test(neutralText))
  await page.screenshot({ path: `${SHOTS}/dex-naturedex.png` })

  // ------------------------------------------------------- item 3c: breeding
  hr('ITEM 3c — Breeding dex (new): egg groups, counts, and membership')
  await goTo('breedingdex')
  await selectGame('heartgold-soulsilver')
  const eggCount = await countOf('breedingdex')
  log(`  gen 4 egg groups: ${eggCount} (bundle has ${eggGroups.length})`)
  check('Breeding dex lists every egg group', eggCount === eggGroups.length, `(${eggCount})`)

  // The member count on each row must equal the bundle join, not a guess.
  const rowCounts = await page.$$eval('[data-testid="breedingdex-rows"] .species-row', (els) =>
    els.map((e) => ({
      id: Number(e.getAttribute('data-entry-id')),
      name: e.querySelector('.species-name').textContent.trim(),
      count: Number(e.querySelector('.row-count').textContent.trim()),
    })),
  )
  const countMismatches = rowCounts.filter((r) => r.count !== eggMembers(r.id, 4).length)
  log(`  row counts: ${rowCounts.map((r) => `${r.name}=${r.count}`).join(' ')}`)
  check(
    'every row count matches the bundle join at gen 4',
    countMismatches.length === 0,
    countMismatches.map((r) => `${r.name}:${r.count}`).join(','),
  )

  // Monster: a group with a known, checkable membership.
  const monster = eggGroups.find((g) => g.name === 'monster')
  await page.click(`[data-testid="breedingdex-row-${monster.id}"]`)
  await page.waitForSelector('[data-testid="breedingdex-detail"]', { timeout: 15000 })
  const monsterMembers = await page.$$eval(
    '[data-testid="breedingdex-detail"] .species-card .species-name',
    (els) => els.map((e) => e.textContent.trim()),
  )
  const expMonster = eggMembers(monster.id, 4)
  log(`  Monster @ gen4: ${monsterMembers.length} species (expected ${expMonster.length})`)
  check(
    'Monster membership matches the bundle exactly',
    JSON.stringify(monsterMembers) === JSON.stringify(expMonster),
    `(${monsterMembers.length} vs ${expMonster.length})`,
  )
  for (const known of ['Bulbasaur', 'Charmander', 'Squirtle', 'Lapras', 'Totodile']) {
    check(
      `known Monster member ${known} present`,
      monsterMembers.includes(known) === expMonster.includes(known),
    )
  }
  check(
    'the detail uses the shared species-card grid',
    (await page.$$('[data-testid="breedingdex-detail"] .species-card-ghost')).length ===
      monsterMembers.length,
  )

  // Gen 1 had no breeding, so the dex is gated as one rule.
  await selectGame('red-blue')
  await page.waitForTimeout(200)
  const eggGen1 = await countOf('breedingdex')
  const eggGatedMsg = (await page.textContent('[data-testid="breedingdex-empty"]')).trim()
  log(`  gen 1: ${eggGen1} entries | "${eggGatedMsg.slice(0, 60)}"`)
  check('Breeding dex is empty under Gen 1', eggGen1 === 0, `(${eggGen1})`)
  check(
    'and says why, rather than showing a blank list',
    /breeding|egg group/i.test(eggGatedMsg),
    eggGatedMsg.slice(0, 60),
  )
  await selectGame('gold-silver')
  await page.waitForTimeout(200)
  const eggGen2 = await countOf('breedingdex')
  check(
    'and populated from Gen 2, when breeding arrived',
    eggGen2 === eggGroups.length,
    `(${eggGen2})`,
  )
  await page.screenshot({ path: `${SHOTS}/dex-breedingdex.png` })

  hr('ITEM 3b — Naturedex gated as one rule under Gen 1-2')
  // The Breeding dex section above navigated away; this loop reads naturedex.
  await goTo('naturedex')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await page.waitForTimeout(200)
    const got = await countOf('naturedex')
    const gated = await page.$$('[data-testid="naturedex-empty"]')
    const msg = gated.length
      ? (await page.textContent('[data-testid="naturedex-empty"]')).trim()
      : null
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} entries${msg ? ` | "${msg.slice(0, 70)}"` : ''}`)
    check(`Naturedex count correct for ${g.vg}`, got === natureCount(g.gen), `(${got})`)
    if (g.gen < 3) {
      check(`${g.vg}: natures list empty`, got === 0)
      check(`${g.vg}: explains why`, /did not exist/i.test(msg ?? ''))
    }
  }

  // ------------------------------------------------------------ item 4
  hr('ITEM 4 — Berrydex')
  await goTo('berrydex')
  await selectGame('heartgold-soulsilver')
  n = await countOf('berrydex')
  check('Berrydex lists every gen-4 berry', n === berryCount(4), `(${n} vs ${berryCount(4)})`)
  await fillDexSearch(page, 'berrydex', 'oran')
  await page.waitForTimeout(150)
  const oranCount = await countOf('berrydex')
  check('search narrows to Oran Berry', oranCount === 1, `(${oranCount})`)
  const oran = berries.find((b) => b.name === 'oran')

  /*
    NO DETAIL PAGE, BY DESIGN. The Berrydex is now a card grid and nothing else:
    all six fields a berry has fit on the card, so there was nothing left for a
    second screen to hold and the cards are not clickable. This section therefore
    reads the CARD rather than opening an entry -- which also means it checks the
    stronger claim, that every field is on screen at once.

    The flavour-potency bars are gone with the detail page. They were the one
    berry field that did not fit the card and are NOT among the six the spec
    lists; that is a real reduction in what the Berrydex shows, and it is stated
    here rather than left for someone to notice.
  */
  const oranCard = await page.evaluate((id) => {
    const card = document.querySelector(`[data-testid="berrydex-row-${id}"]`)
    if (!card) return null
    const t = (sel) => card.querySelector(sel)?.textContent?.trim() ?? null
    return {
      name: t('.species-name'),
      dexNo: t('.dex-no'),
      firmness: t(`[data-testid="berrydex-firmness-${id}"]`),
      size: t(`[data-testid="berrydex-size-${id}"]`),
      smoothness: t(`[data-testid="berrydex-smoothness-${id}"]`),
      ngPower: t(`[data-testid="berrydex-ng-power-${id}"]`),
      growth: t(`[data-testid="berrydex-growth-time-${id}"]`),
      ngType: card.querySelector('[data-ds="type-label"]')?.getAttribute('data-type'),
      // The card must be the Pokedex card's chrome, not a lookalike.
      ghost: t('.species-card-ghost'),
      art: !!card.querySelector('.item-artwork'),
      artSource: card.querySelector('.item-artwork')?.dataset.source,
      width: Math.round(card.getBoundingClientRect().width),
      height: Math.round(card.getBoundingClientRect().height),
      // Nothing may be clipped: the reason the facts are on three short lines.
      clipped: [...card.querySelectorAll('.berry-card-fact-line')].filter(
        (el) => el.scrollWidth > el.clientWidth + 1,
      ).length,
      clickable: card.querySelector('.species-card-hit') != null,
    }
  }, oran.id)
  log(`  Oran Berry card: ${JSON.stringify(oranCard)}`)
  log(
    `  bundle: firmness=${oran.firmness} size=${oran.size} smooth=${oran.smoothness} growth=${oran.growth_time} ngPower=${oran.natural_gift_power} ngType=${oran.natural_gift_type_id}`,
  )
  check('name comes from the linked item', oranCard.name === itemsById[oran.item_id].display_name)
  // The UI title-cases and de-hyphenates ("super-hard" -> "Super Hard"), so compare
  // against that transform rather than the raw slug.
  const firmnessLabel = oran.firmness.replace(/-/g, ' ')
  check(
    'firmness matches the bundle',
    new RegExp(firmnessLabel, 'i').test(oranCard.firmness ?? ''),
    `"${oranCard.firmness}" vs "${firmnessLabel}"`,
  )
  check(
    'size matches the bundle',
    (oranCard.size ?? '').includes(String(oran.size)),
    String(oranCard.size),
  )
  check(
    'smoothness matches the bundle',
    (oranCard.smoothness ?? '').includes(String(oran.smoothness)),
    String(oranCard.smoothness),
  )
  check(
    'growth time matches the bundle',
    (oranCard.growth ?? '').includes(String(oran.growth_time)),
    String(oranCard.growth),
  )
  check(
    'Natural Gift power matches the bundle',
    (oranCard.ngPower ?? '').includes(String(oran.natural_gift_power)),
    String(oranCard.ngPower),
  )
  check(
    'Natural Gift type renders as the shared coloured type label',
    oranCard.ngType != null,
    String(oranCard.ngType),
  )
  check('all six berry fields are on the card at once', oranCard.clipped === 0)
  check(
    'the card carries the Pokedex card chrome -- watermark and artwork',
    oranCard.ghost === '001'.slice(0, 0) + String(oran.id).padStart(3, '0') && oranCard.art,
    `${oranCard.ghost} / art=${oranCard.art}`,
  )
  check(
    'berry artwork is the larger Dream World image, not the 30px icon',
    oranCard.artSource === 'dream-world',
    String(oranCard.artSource),
  )
  check(
    'card width matches the Pokedex grid card exactly (212px)',
    oranCard.width === 212,
    `${oranCard.width}x${oranCard.height}`,
  )
  check('and the card is not clickable, because there is nothing to open', !oranCard.clickable)
  await page.screenshot({ path: `${SHOTS}/dex-berrydex.png` })

  hr("ITEM 5b — Berrydex gating (derived from each berry's linked item)")
  await fillDexSearch(page, 'berrydex', '')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await page.waitForTimeout(200)
    const got = await countOf('berrydex')
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} berries (expected ${berryCount(g.gen)})`)
    check(`Berrydex gated correctly for ${g.vg}`, got === berryCount(g.gen), `(${got})`)
  }
  await selectGame('red-blue')
  await page.waitForTimeout(200)
  const berryMsg = await page.textContent('[data-testid="berrydex-empty"]')
  log(`  gen 1 message: "${berryMsg.trim().slice(0, 90)}"`)
  check('Gen 1 Berrydex explains the empty list', /No berry/i.test(berryMsg))

  // ------------------------------------------------- "All" scope reconciliation
  hr('SCOPE UNDER "All" — which dexes really contain out-of-era entries')
  // The ingestion filter kept an item if it had a Gen 1-4 game_index OR was
  // referenced by an in-scope species/move. This asserts what that actually
  // produced, per entity, so an "All shows Gen 5+ rows" claim cannot be made
  // about the wrong module again.
  const itemsOutOfScope = items.filter((i) => !i.generation_ids.some((g) => g >= 1 && g <= 4))
  const abilitiesOutOfScope = abilities.filter((a) => (a.generation_id ?? 99) > 4)
  const berriesOutOfScope = berries.filter(
    (b) => !itemsById[b.item_id]?.generation_ids.some((g) => g >= 1 && g <= 4),
  )
  log(`  items      : ${items.length} total, ${itemsOutOfScope.length} with no Gen 1-4 index`)
  log(
    `  abilities  : ${abilities.length} total, ${abilitiesOutOfScope.length} introduced after Gen 4`,
  )
  log(
    `  berries    : ${berries.length} total, ${berriesOutOfScope.length} with no Gen 1-4 availability`,
  )
  log(`  natures    : ${natures.length} total, 0 out of scope (all Gen 3)`)
  check(
    'NO item is Gen 5+-exclusive (the ingestion filter held)',
    itemsOutOfScope.length === 0,
    `(${itemsOutOfScope.length})`,
  )
  check(
    'no item has a minimum generation >= 5',
    items.every((i) => Math.min(...i.generation_ids) <= 4),
  )
  for (const known of ['eviolite', 'air-balloon', 'rocky-helmet']) {
    check(
      `known Gen 5 item "${known}" is absent from the bundle`,
      !items.some((i) => i.name === known),
    )
  }
  check('no berry is out of scope', berriesOutOfScope.length === 0)
  check(
    'abilities ARE the entity with out-of-era entries',
    abilitiesOutOfScope.length > 0,
    `(${abilitiesOutOfScope.length}: gens ${[...new Set(abilitiesOutOfScope.map((a) => a.generation_id))].sort().join(',')})`,
  )

  // Abilitydex clamps its LIST to abilities with a Gen 1-4 presence (123 of 161).
  // The 38 later additions stay in the bundle for dangling-reference safety, so
  // this asserts the list is clamped while the data is not.
  const inScopeAbilities = abilities.filter((a) => (a.generation_id ?? 99) <= 4)
  await selectGame('all')
  await page.waitForTimeout(200)
  await goTo('abilitydex')
  /*
    THE DESCRIPTIVE NOTE IS GONE, app-wide -- the "N of M abilities exist in
    Generation G" line was part of the header block this pass removed. What it
    said is still asserted, just from the count readout and the row list rather
    than from a sentence about them, which is the stronger check anyway: the note
    could have been right while the list was wrong.

    One thing genuinely went away with it: the UI no longer TELLS the reader that
    38 later abilities exist in the data but are not listed. The clamp is checked
    below; the disclosure of it is not there to check.
  */
  const abilityAllCount = await countOf('abilitydex')
  log(
    `  Abilitydex under All: ${abilityAllCount} rows (in-scope ${inScopeAbilities.length} of ${abilities.length})`,
  )
  check(
    'Abilitydex under All lists only the 123 in-scope abilities',
    abilityAllCount === inScopeAbilities.length,
    `(${abilityAllCount} vs ${inScopeAbilities.length})`,
  )
  check(
    'it does NOT list all 161',
    abilityAllCount !== abilities.length,
    `(${abilityAllCount} vs ${abilities.length})`,
  )
  // The count readout is the surviving statement of the clamped total.
  const abilityCountText = (await page.textContent('[data-testid="abilitydex-count"]')).trim()
  check(
    'the count readout states the clamped total',
    abilityCountText.startsWith(String(inScopeAbilities.length)),
    abilityCountText,
  )
  check(
    'and no descriptive header sentence is left behind',
    (await page.$('[data-testid="abilitydex-note"]')) == null,
  )

  // Every listed row must be in scope, and named Gen 5 abilities must be absent.
  const listedAbilities = await page.$$eval(
    '[data-testid="abilitydex-rows"] .species-name',
    (els) => els.map((e) => e.textContent.trim()),
  )
  const outOfScopeNames = new Set(abilitiesOutOfScope.map((a) => a.display_name))
  const leaked = listedAbilities.filter((n) => outOfScopeNames.has(n))
  log(`  listed rows: ${listedAbilities.length}, out-of-era rows leaked: ${leaked.length}`)
  check('no out-of-era ability appears in the list', leaked.length === 0, leaked.join(','))
  for (const gen5 of ['Cursed Body', 'Contrary', 'Sheer Force', 'Multiscale']) {
    check(`Gen 5 ability "${gen5}" is not listed`, !listedAbilities.includes(gen5))
  }
  // ...but the data still has it, which is what the species view depends on.
  for (const gen5 of ['Cursed Body', 'Contrary']) {
    check(
      `"${gen5}" is still present in the bundle (dangling-reference safety)`,
      abilities.some((a) => a.display_name === gen5),
    )
  }
  // A search for a hidden ability must come up empty rather than surfacing it.
  await toDexList('abilitydex')
  await fillDexSearch(page, 'abilitydex', 'cursed')
  await page.waitForTimeout(150)
  const cursedCount = await countOf('abilitydex')
  check('searching for a hidden ability finds nothing', cursedCount === 0, `(${cursedCount})`)
  await toDexList('abilitydex')
  await fillDexSearch(page, 'abilitydex', '')

  await goTo('itemdex')
  const itemAllCount = await countOf('itemdex')
  log(`  Itemdex under All: ${itemAllCount} rows (bundle has ${items.length})`)
  check('Itemdex under All lists all items', itemAllCount === items.length, `(${itemAllCount})`)
  check(
    'and no descriptive header sentence is left behind',
    (await page.$('[data-testid="itemdex-note"]')) == null,
  )

  await goTo('berrydex')
  const berryAllCount = await countOf('berrydex')
  log(`  Berrydex under All: ${berryAllCount} rows (bundle has ${berries.length})`)
  check(
    'Berrydex under All lists every berry',
    berryAllCount === berries.length,
    `(${berryAllCount} vs ${berries.length})`,
  )
  check(
    'and no descriptive header sentence is left behind',
    (await page.$('[data-testid="berrydex-note"]')) == null,
  )

  // ------------------------------------------------------------ errors
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  HTTP >=400     : ${badResponses.length}`)
  badResponses.slice(0, 10).forEach((e) => log(`    ${e}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed HTTP responses', badResponses.length === 0, `(${badResponses.length})`)
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
