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
  await page.waitForSelector('[data-testid="dex-switcher"]', { timeout: 60000 })

  const goTo = async (id) => {
    await page.click(`[data-testid="nav-${id}"]`)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
  }
  const selectGame = async (vg) => {
    await page.selectOption('[data-testid="vg-select"]', vg)
    await page.waitForTimeout(150)
  }
  const countOf = async (dex) => {
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
  const shellCount = await page.$$eval('.pokedex-body', (e) => e.length)
  check('exactly one dex is mounted at a time', shellCount === 1, `(${shellCount})`)
  await page.screenshot({ path: `${SHOTS}/dex-nav.png` })

  // ------------------------------------------------------------ item 1: items
  hr('ITEM 1 — Itemdex')
  await goTo('itemdex')
  await selectGame('heartgold-soulsilver')
  let n = await countOf('itemdex')
  log(`  gen 4 list count: ${n} (expected ${itemCount(4)})`)
  check('Itemdex lists every gen-4 item', n === itemCount(4), `(${n} vs ${itemCount(4)})`)

  await page.fill('[data-testid="itemdex-search"]', 'ball')
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
  await page.fill('[data-testid="itemdex-search"]', 'master ball')
  await page.waitForSelector('[data-testid="itemdex-row-1"]', { timeout: 10000 })
  await page.click('[data-testid="itemdex-row-1"]')
  await page.waitForSelector('[data-testid="itemdex-detail"]', { timeout: 10000 })
  const masterBall = await page.evaluate(() => ({
    name: document.querySelector('[data-testid="itemdex-name"]')?.textContent,
    category: document.querySelector('[data-testid="itemdex-category"]')?.textContent,
    effect: document.querySelector('[data-testid="itemdex-effect"]')?.textContent,
    price: document.querySelector('[data-testid="itemdex-price"]')?.textContent,
    cards: [...document.querySelectorAll('[data-testid="itemdex-detail"] .card')].length,
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
  check('detail is built from cards', masterBall.cards >= 3, `(${masterBall.cards})`)
  await page.screenshot({ path: `${SHOTS}/dex-itemdex.png` })

  // Generation gating for items (item 5): a real signal exists, so it is applied.
  hr('ITEM 5a — Itemdex generation gating (generation_ids is a real signal)')
  await page.fill('[data-testid="itemdex-search"]', '')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await page.waitForTimeout(150)
    const got = await countOf('itemdex')
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} items (expected ${itemCount(g.gen)})`)
    check(`Itemdex gated correctly for ${g.vg}`, got === itemCount(g.gen), `(${got})`)
  }
  // Safari Ball is the case that proves membership, not min<=G, is the rule.
  await selectGame('gold-silver')
  await page.fill('[data-testid="itemdex-search"]', 'safari ball')
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
  await page.fill('[data-testid="itemdex-search"]', '')

  // ------------------------------------------------------------ item 2
  hr('ITEM 2 — Abilitydex')
  await goTo('abilitydex')
  await selectGame('heartgold-soulsilver')
  n = await countOf('abilitydex')
  log(`  gen 4 list count: ${n} (expected ${abilityCount(4)})`)
  check('Abilitydex lists every gen-4 ability', n === abilityCount(4), `(${n})`)
  await page.fill('[data-testid="abilitydex-search"]', 'levit')
  await page.waitForTimeout(120)
  const levitCount = await countOf('abilitydex')
  check('search narrows to Levitate', levitCount === 1, `(${levitCount})`)

  const levitateId = abilityByName.levitate.id
  await page.click(`[data-testid="abilitydex-row-${levitateId}"]`)
  await page.waitForSelector('[data-testid="abilitydex-holders"]', { timeout: 15000 })

  const readHolders = () =>
    page.$$eval('[data-testid="abilitydex-holders"] li', (els) =>
      els.map((e) => e.querySelector('.holder-name').textContent.trim()),
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
  await page.fill('[data-testid="abilitydex-search"]', 'chloro')
  await page.waitForTimeout(150)
  const chloroId = abilityByName.chlorophyll.id
  await page.click(`[data-testid="abilitydex-row-${chloroId}"]`)
  await page.waitForSelector('[data-testid="abilitydex-holders"]', { timeout: 15000 })
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
  await page.fill('[data-testid="abilitydex-search"]', '')
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
  const adamantView = await page.evaluate(() => ({
    name: document.querySelector('[data-testid="naturedex-name"]')?.textContent,
    up: document.querySelector('[data-testid="naturedex-increased"]')?.textContent,
    down: document.querySelector('[data-testid="naturedex-decreased"]')?.textContent,
  }))
  log(
    `  Adamant: ${JSON.stringify(adamantView)} (data: +${adamant.increased_stat} -${adamant.decreased_stat})`,
  )
  check('Adamant detail names the nature', adamantView.name === 'Adamant')
  check('Adamant raises Attack', /Attack \+10%/.test(adamantView.up ?? ''), adamantView.up)
  check('Adamant lowers Sp. Atk', /Sp\. Atk −10%/.test(adamantView.down ?? ''), adamantView.down)
  check(
    'matches the bundle',
    adamant.increased_stat === 'attack' && adamant.decreased_stat === 'special-attack',
  )

  // Hardy: the neutral case, where both fields are null.
  const hardy = natures.find((x) => x.name === 'hardy')
  await page.click(`[data-testid="naturedex-row-${hardy.id}"]`)
  await page.waitForSelector('[data-testid="naturedex-neutral"]', { timeout: 10000 })
  const neutralText = await page.textContent('[data-testid="naturedex-neutral"]')
  log(`  Hardy (neutral): "${neutralText.trim()}"`)
  check('neutral nature explained, not shown as undefined', !/undefined|null/.test(neutralText))
  await page.screenshot({ path: `${SHOTS}/dex-naturedex.png` })

  hr('ITEM 3b — Naturedex gated as one rule under Gen 1-2')
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
  await page.fill('[data-testid="berrydex-search"]', 'oran')
  await page.waitForTimeout(150)
  const oranCount = await countOf('berrydex')
  check('search narrows to Oran Berry', oranCount === 1, `(${oranCount})`)
  const oran = berries.find((b) => b.name === 'oran')
  await page.click(`[data-testid="berrydex-row-${oran.id}"]`)
  await page.waitForSelector('[data-testid="berrydex-detail"]', { timeout: 10000 })
  const oranView = await page.evaluate(() => ({
    name: document.querySelector('[data-testid="berrydex-name"]')?.textContent,
    firmness: document.querySelector('[data-testid="berrydex-firmness"]')?.textContent,
    growth: document.querySelector('[data-testid="berrydex-growth-time"]')?.textContent,
    ngPower: document.querySelector('[data-testid="berrydex-ng-power"]')?.textContent,
    ngType: document
      .querySelector('[data-testid="berrydex-ng-type"] [data-type]')
      ?.getAttribute('data-type'),
    flavors: [...document.querySelectorAll('[data-testid="berrydex-flavors"] li')].map((l) => [
      l.getAttribute('data-flavor'),
      l.querySelector('.stat-value').textContent,
    ]),
  }))
  log(`  Oran Berry: ${JSON.stringify(oranView)}`)
  log(
    `  bundle: firmness=${oran.firmness} growth=${oran.growth_time} ngPower=${oran.natural_gift_power} ngType=${oran.natural_gift_type_id} flavors=${JSON.stringify(oran.flavors.filter((f) => f.potency > 0))}`,
  )
  check('name comes from the linked item', oranView.name === itemsById[oran.item_id].display_name)
  // The UI title-cases and de-hyphenates ("super-hard" -> "Super Hard"), so compare
  // against that transform rather than the raw slug.
  const firmnessLabel = oran.firmness.replace(/-/g, ' ')
  check(
    'firmness matches the bundle',
    new RegExp(firmnessLabel, 'i').test(oranView.firmness ?? ''),
    `"${oranView.firmness}" vs "${firmnessLabel}"`,
  )
  check('growth time matches', oranView.growth.includes(String(oran.growth_time)))
  check('Natural Gift power matches', oranView.ngPower === String(oran.natural_gift_power))
  check('Natural Gift type renders as a type badge', oranView.ngType != null, oranView.ngType)
  const expFlavors = oran.flavors.filter((f) => f.potency > 0)
  check(
    'flavour stats match the bundle',
    JSON.stringify(oranView.flavors) ===
      JSON.stringify(expFlavors.map((f) => [f.flavor, String(f.potency)])),
    JSON.stringify(oranView.flavors),
  )
  await page.screenshot({ path: `${SHOTS}/dex-berrydex.png` })

  hr("ITEM 5b — Berrydex gating (derived from each berry's linked item)")
  await page.fill('[data-testid="berrydex-search"]', '')
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
  const abilityNote = (await page.textContent('[data-testid="abilitydex-note"]')).trim()
  const abilityAllCount = await countOf('abilitydex')
  log(
    `  Abilitydex under All: ${abilityAllCount} rows (in-scope ${inScopeAbilities.length} of ${abilities.length})`,
  )
  log(`  note: "${abilityNote}"`)
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
  check(
    'its note states the clamped total',
    abilityNote.includes(String(inScopeAbilities.length)),
    abilityNote,
  )
  check(
    'its note says how many are hidden',
    abilityNote.includes(String(abilitiesOutOfScope.length)),
    abilityNote,
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
  await page.fill('[data-testid="abilitydex-search"]', 'cursed')
  await page.waitForTimeout(150)
  const cursedCount = await countOf('abilitydex')
  check('searching for a hidden ability finds nothing', cursedCount === 0, `(${cursedCount})`)
  await page.fill('[data-testid="abilitydex-search"]', '')

  await goTo('itemdex')
  const itemNote = (await page.textContent('[data-testid="itemdex-note"]')).trim()
  const itemAllCount = await countOf('itemdex')
  log(`  Itemdex under All: ${itemAllCount} rows | note: "${itemNote}"`)
  check('Itemdex under All lists all items', itemAllCount === items.length, `(${itemAllCount})`)
  check(
    'its note truthfully says every item is indexed in Gen 1-4',
    /Generations 1-4/.test(itemNote),
    itemNote,
  )

  await goTo('berrydex')
  const berryNote = (await page.textContent('[data-testid="berrydex-note"]')).trim()
  log(`  Berrydex under All: note: "${berryNote}"`)
  check('Berrydex note truthfully claims full Gen 1-4 coverage', /Generations 1-4/.test(berryNote))

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
