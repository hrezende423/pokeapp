/**
 * Verification for the Tools project (docs/tools/PLAN.md): the Tools index, the
 * shared tool page frame, and every tool built from the brief.
 *
 * DEV SERVER, not preview: the math sections import the tools' pure modules into
 * the page (`/pokeapp/src/...`) and check them against cited reference values,
 * the way verify-damage-calc checks its engine. The UI sections then drive the
 * real screens.
 *
 * Each tool adds its own section on the branch that builds it. What every tool
 * must satisfy (the brief's "Done when"):
 *   1. it opens from the Tools index and answers a valid input, no console errors;
 *   2. mechanics tools carry fixtures against published values, one per supported
 *      generation, Gen 1 included where the tool exists there;
 *   3. switching the generation (or the tool's game row) changes the answer;
 *   4. `npm run check` passes.
 *
 * Usage: node scripts/verify-tools.mjs
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { selectGeneration } from './lib/controls.mjs'
import { goToPage } from './lib/nav.mjs'

const PORT = 4203
const SHOTS = new URL('./.verify-shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => fileURLToPath(new URL(name, SHOTS))

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Where each registry target lands: the selector its page renders. */
const LANDING = {
  calculator: (tab) => `[data-testid="calc-panel-${tab.toLowerCase().replace(/\s+/g, '-')}"]`,
  'damage-calculator': '[data-testid="calc-damage"]',
  'type-coverage': '[data-testid^="tc-panel-"]',
  'team-matchup': '[data-testid="team-matchup"]',
}
const landingFor = (tool) =>
  tool.target.kind === 'calculator'
    ? LANDING.calculator(tool.target.tab)
    : LANDING[tool.target.id] ?? `[data-testid="tool-page-${tool.key}"]`

const openIndex = async (page) => {
  await page.click('[data-testid="nav-tab-tools"]')
  await page.waitForSelector('[data-testid="tools-index"]', { timeout: 30000 })
  // Off the tab, or its hover dropdown stays open over the page.
  await page.mouse.move(1200, 700)
  await page.waitForSelector('[data-testid="nav-dropdown-tools"]', { state: 'hidden', timeout: 5000 }).catch(() => {})
}

const dev = await startDevServer({ port: PORT })
let browser
const consoleErrors = []
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
  context.setDefaultNavigationTimeout(180000)
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })
  await selectGeneration(page, 4)

  const registry = await page.evaluate(async () => {
    const r = await import('/pokeapp/src/modules/tools/registry.ts')
    return { tools: r.TOOLS, groups: r.TOOL_GROUPS }
  })

  // ------------------------------------------------------------------ 1
  hr('1. THE INDEX -- the Tools tab opens it; every registered tool is listed and opens')
  await openIndex(page)
  const index = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="tools-index"]')
    const cs = getComputedStyle(root)
    return {
      layout: root.dataset.layout,
      areas: cs.gridTemplateAreas,
      items: [...document.querySelectorAll('[data-testid^="tools-item-"]')].map((el) =>
        el.dataset.testid.replace('tools-item-', ''),
      ),
      groups: [...document.querySelectorAll('[data-testid^="tools-group-"]')].map((el) =>
        el.dataset.testid.replace('tools-group-', ''),
      ),
    }
  })
  check('clicking the Tools tab opens the index', index.layout === 'tools-index')
  check(
    'the index is laid out by named areas: title, groups',
    index.areas.includes('title') && index.areas.includes('groups'),
    index.areas,
  )
  check(
    'every registry entry is listed, in registry order',
    JSON.stringify(index.items) === JSON.stringify(registry.tools.map((t) => t.key)),
    `${index.items.length} listed / ${registry.tools.length} registered`,
  )
  const usedGroups = registry.groups.map((g) => g.id).filter((id) => registry.tools.some((t) => t.group === id))
  check('only groups with tools are drawn, in group order', JSON.stringify(index.groups) === JSON.stringify(usedGroups), index.groups.join(','))

  // The dropdown is unchanged: Calculators still leads it.
  await page.hover('[data-testid="nav-tab-tools"]')
  await page.waitForSelector('[data-testid="nav-dropdown-tools"]', { state: 'visible', timeout: 15000 })
  const dropdownFirst = await page.$eval('[data-testid="nav-dropdown-tools"] .nav-item', (el) => el.textContent.trim())
  check('the Tools dropdown still opens, Calculators first', dropdownFirst.startsWith('Calculators'), dropdownFirst)
  await page.mouse.move(700, 900)

  for (const tool of registry.tools) {
    await openIndex(page)
    await page.click(`[data-testid="tool-link-${tool.key}"]`)
    const landing = landingFor(tool)
    const landed = await page
      .waitForSelector(landing, { timeout: 60000 })
      .then(() => true)
      .catch(() => false)
    check(`"${tool.label}" opens where it lives`, landed, landing)
  }

  // ------------------------------------------------------------------ 2
  hr('2. GATES -- a tool that cannot answer stays listed, disabled, with the reason')
  await selectGeneration(page, 5)
  await openIndex(page)
  const gen5 = await page.evaluate((tools) =>
    tools.map((t) => ({
      key: t.key,
      gated: Boolean(t.gate),
      disabled: document.querySelector(`[data-testid="tool-link-${t.key}"]`)?.disabled,
      reason: document.querySelector(`[data-testid="tool-reason-${t.key}"]`)?.textContent ?? null,
    })),
  registry.tools)
  check(
    'on Gen 5 every gated tool is disabled and says "Gen 1–4 only"',
    gen5.filter((t) => t.gated).every((t) => t.disabled && t.reason?.startsWith('Gen 1–4 only')),
    gen5.filter((t) => t.gated).map((t) => `${t.key}:${t.disabled}`).join(' '),
  )
  check(
    'tools that own their scope stay open on Gen 5 (Damage, Type Coverage, Team Matchup)',
    gen5.filter((t) => !t.gated).every((t) => t.disabled === false && t.reason == null),
    gen5.filter((t) => !t.gated).map((t) => t.key).join(' '),
  )
  await selectGeneration(page, 'all')
  await openIndex(page)
  const allReason = await page.$eval('[data-testid="tool-reason-1"]', (el) => el.textContent)
  check('under "All" a gated tool asks for a generation', allReason.startsWith('Pick a generation'), allReason)
  await selectGeneration(page, 1)
  await openIndex(page)
  // Named, not counted: the list grows as Gen 2+ tools land.
  const gen1Disabled = await page.$$eval('[data-testid^="tool-link-"]:disabled', (els) => els.map((e) => e.dataset.testid.slice('tool-link-'.length)).sort().join(','))
  check('on Gen 1 only Hidden Power, the doubles guide, breeding, Pokérus, Pokéblocks and contests are disabled', gen1Disabled === '12,16,17,18,19,2', gen1Disabled)

  // ------------------------------------------------------------------ #1
  hr('#1 STAT CALCULATOR -- Bulbapedia "Stat" worked examples, every generation')
  /*
    Read in a real browser 2026-10-15 (Bulbapedia 403s scripts), "Stat" →
    Formula → Example:
      Gen I/II: level 81 Pikachu, DVs Atk 8 Def 13 Spe 5 Spc 9 (HP DV 7), Stat Exp
        HP 22850 Atk 23140 Def 17280 Spc 19625 Spe 24795 -> 189 / 137 / 101 /
        Sp.Atk 128 / Sp.Def 112 / 190; Gen I's Special (base 50) is the 128.
      Gen III on: level 78 Adamant Garchomp, IVs 24/12/30/16/23/5, EVs
        74/190/91/48/84/23 -> 289 / 278 / 193 / 135 / 171 / 171. The formula is
        "Generation III onward", so Gen 3 is checked with the same numbers.
  */
  const statFixtures = await page.evaluate(async () => {
    const s = await import('/pokeapp/src/modules/team-builder/statMath.ts')
    const neutral = { increased: null, decreased: null }
    const adamant = { increased: 'attack', decreased: 'special-attack' }
    const pikaDv = { attack: 8, defense: 13, speed: 5, special: 9 }
    const pikaExp = { hp: 22850, attack: 23140, defense: 17280, special: 19625, speed: 24795 }
    const pika = (generation, key, base, effortKey = key) =>
      s.computeStat({
        generation, level: 81, base, key: effortKey, nature: neutral,
        effort: pikaExp, individual: pikaDv,
      })
    const chompIv = { hp: 24, attack: 12, defense: 30, 'special-attack': 16, 'special-defense': 23, speed: 5 }
    const chompEv = { hp: 74, attack: 190, defense: 91, 'special-attack': 48, 'special-defense': 84, speed: 23 }
    const chompBase = { hp: 108, attack: 130, defense: 95, 'special-attack': 80, 'special-defense': 85, speed: 102 }
    const chomp = (generation) =>
      Object.keys(chompBase).map((key) =>
        s.computeStat({ generation, level: 78, base: chompBase[key], key, effort: chompEv, individual: chompIv, nature: adamant }),
      )
    return {
      gen1: [pika(1, 'hp', 35), pika(1, 'attack', 55), pika(1, 'defense', 30), pika(1, 'special', 50), pika(1, 'speed', 90)],
      // Gen 2 split Special into two BASE stats; the DV and Stat Exp stay the Special ones.
      gen2: [pika(2, 'hp', 35), pika(2, 'attack', 55), pika(2, 'defense', 30), pika(2, 'special', 50), pika(2, 'special', 40), pika(2, 'speed', 90)],
      hpDv: s.hpDvFrom(pikaDv),
      gen3: chomp(3),
      gen4: chomp(4),
    }
  })
  check('Gen 1: level 81 Pikachu is 189 / 137 / 101 / Special 128 / 190', JSON.stringify(statFixtures.gen1) === '[189,137,101,128,190]', JSON.stringify(statFixtures.gen1))
  check('Gen 2: the same Pikachu is 189 / 137 / 101 / 128 / 112 / 190', JSON.stringify(statFixtures.gen2) === '[189,137,101,128,112,190]', JSON.stringify(statFixtures.gen2))
  check('its HP DV is 7, packed from the other four', statFixtures.hpDv === 7, String(statFixtures.hpDv))
  check('Gen 3: level 78 Adamant Garchomp is 289 / 278 / 193 / 135 / 171 / 171', JSON.stringify(statFixtures.gen3) === '[289,278,193,135,171,171]', JSON.stringify(statFixtures.gen3))
  check('Gen 4: the same Garchomp, same numbers', JSON.stringify(statFixtures.gen4) === '[289,278,193,135,171,171]', JSON.stringify(statFixtures.gen4))

  // The screen: the generation switches the formula and the stat list; Gen 5 says why it cannot answer.
  const statLabels = async (gen) => {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-1"]')
    await page.waitForSelector('[data-testid="calc-panel-stat"]', { timeout: 30000 })
    return page.$$eval('[data-testid="calc-stat-result"] .ds-stat-label', (els) => els.map((e) => e.textContent.trim()))
  }
  const g1 = await statLabels(1)
  const g3 = await statLabels(3)
  check('Gen 1 lists the unsplit Special', g1.includes('Special') && !g1.includes('Sp. Atk'), g1.join(','))
  check('Gen 3 lists Sp. Atk and Sp. Def instead', g3.includes('Sp. Atk') && g3.includes('Sp. Def') && !g3.includes('Special'), g3.join(','))
  await selectGeneration(page, 5)
  // The index link is disabled on Gen 5, so through the dropdown.
  await goToPage(page, 'tools', 'calculators')
  await page.waitForSelector('[data-testid="calc-scroll-area"]', { timeout: 30000 })
  await page.click('.calc-subnav [role="tab"]:text-is("Stat")')
  const gen5Stat = await page.$eval('[data-testid="calc-panel-stat"]', (el) => ({
    reason: el.querySelector('[data-testid="tool-reason"]')?.textContent ?? null,
    form: Boolean(el.querySelector('[data-testid="calc-stat"]')),
  }))
  check('on Gen 5 the Stat tab says "Gen 1–4 only" instead of a form', gen5Stat.reason?.startsWith('Gen 1–4 only') && !gen5Stat.form, JSON.stringify(gen5Stat))
  await page.mouse.move(1200, 700)

  // ------------------------------------------------------------------ #2
  hr('#2 HIDDEN POWER -- against the games\' own routines')
  /*
    Bulbapedia did not load in the browser on 2026-10-15, so per the plan's
    fallback the expectations are worked by hand from the pinned routines:
      Gen 2: pokecrystal engine/battle/hidden_power.asm (HiddenPowerDamage) --
        power = ((top bits Atk,Def,Spe,Spc as 8,4,2,1) * 5 + (Spc & 3)) / 2 + 31;
        type = ((Atk & 3) << 2 | (Def & 3)), from Fighting, skipping Bird/unused.
      Gen 3: pokeemerald src/battle_script_commands.c (Cmd_hiddenpowercalc) --
        bits HP,Atk,Def,Spe,SpA,SpD; power = 40 * secondBits / 63 + 30;
        type = 15 * lowBits / 63, from Fighting, skipping Mystery.
  */
  const hpMath = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/tools/hidden-power/hiddenPowerMath.ts')
    const r = (gen, raw) => {
      const o = m.readHiddenPower(gen, raw)
      return o.ok ? `${o.type} ${o.power}` : `reason: ${o.reason}`
    }
    const all = (keys, v) => Object.fromEntries(keys.map((k) => [k, String(v)]))
    return {
      g2max: r(2, all(m.HP_KEYS_GEN2, 15)),
      g2min: r(2, all(m.HP_KEYS_GEN2, 0)),
      g2rock: r(2, { attack: '13', defense: '12', speed: '15', special: '14' }),
      g3max: r(3, all(m.HP_KEYS_GEN34, 31)),
      g4min: r(4, all(m.HP_KEYS_GEN34, 0)),
      g4fire: r(4, { hp: '31', attack: '30', defense: '31', speed: '30', 'special-attack': '30', 'special-defense': '31' }),
      g1: r(1, {}),
      empty: r(3, { ...all(m.HP_KEYS_GEN34, 31), hp: '' }),
      high: r(2, { ...all(m.HP_KEYS_GEN2, 15), attack: '16' }),
      half: r(3, { ...all(m.HP_KEYS_GEN34, 31), speed: '7.5' }),
    }
  })
  check('Gen 2: all DVs 15 is Dark 70', hpMath.g2max === 'dark 70', hpMath.g2max)
  check('Gen 2: all DVs 0 is Fighting 31', hpMath.g2min === 'fighting 31', hpMath.g2min)
  check('Gen 2: Atk 13 / Def 12 / Spe 15 / Spc 14 is Rock 69', hpMath.g2rock === 'rock 69', hpMath.g2rock)
  check('Gen 3: all IVs 31 is Dark 70', hpMath.g3max === 'dark 70', hpMath.g3max)
  check('Gen 4: all IVs 0 is Fighting 30', hpMath.g4min === 'fighting 30', hpMath.g4min)
  check('Gen 4: 31/30/31, Spe 30, SpA 30, SpD 31 is Fire 70', hpMath.g4fire === 'fire 70', hpMath.g4fire)
  check('Gen 1 has no Hidden Power, and says so', hpMath.g1.includes('does not exist in Gen 1'), hpMath.g1)
  check('an empty field is a reason naming it, not a number', hpMath.empty === 'reason: Enter the IVs for HP.', hpMath.empty)
  check('a DV over 15 is a reason, not a number', hpMath.high.startsWith('reason: Attack DV must be'), hpMath.high)
  check('a fractional IV is a reason, not a number', hpMath.half.startsWith('reason: Enter the IVs for Speed'), hpMath.half)

  const openHp = async (gen) => {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-2"]')
    await page.waitForSelector('[data-testid="tool-page-2"]', { timeout: 60000 })
  }
  await openHp(2)
  const hpG2 = await page.evaluate(() => ({
    fields: [...document.querySelectorAll('[data-testid^="hp-input-"]')].map((el) => el.dataset.testid.replace('hp-input-', '')),
    result: document.querySelector('[data-testid="hp-result"]')?.innerText.trim(),
    areas: getComputedStyle(document.querySelector('[data-layout="tool-body"]')).gridTemplateAreas,
  }))
  const toolsActive = await page.$eval('[data-testid="nav-tab-tools"]', (el) => el.getAttribute('aria-current'))
  check('on a tool page the Tools tab reads as "you are here"', toolsActive === 'page', String(toolsActive))
  check('Gen 2 asks for four DVs, no HP field', JSON.stringify(hpG2.fields) === '["attack","defense","speed","special"]', hpG2.fields.join(','))
  check('and opens on the maxed spread: Dark 70', hpG2.result?.toLowerCase() === 'dark 70', hpG2.result)
  check('the body is laid out by named areas: inputs, result', hpG2.areas.includes('inputs') && hpG2.areas.includes('result'), hpG2.areas)
  await openHp(4)
  for (const [k, v] of Object.entries({ hp: '31', attack: '30', defense: '31', speed: '30', 'special-attack': '30', 'special-defense': '31' })) {
    await page.fill(`[data-testid="hp-input-${k}"]`, v)
  }
  const hpG4 = await page.$eval('[data-testid="hp-result"]', (el) => el.innerText.trim())
  await page.screenshot({ path: shot('tool-2-hidden-power.png') })
  check('Gen 4 asks for six IVs, and the Fire spread reads Fire 70 on screen', hpG4.toLowerCase() === 'fire 70', hpG4)
  await page.fill('[data-testid="hp-input-hp"]', '')
  const hpReason = await page.$eval('[data-testid="tool-result"]', (el) => ({
    state: el.dataset.state,
    text: el.textContent.trim(),
  }))
  check('clearing a field prints the reason where the result was', hpReason.state === 'reason' && hpReason.text === 'Enter the IVs for HP.', JSON.stringify(hpReason))
  await selectGeneration(page, 1)
  await openIndex(page)
  const hpGen1 = await page.evaluate(() => ({
    disabled: document.querySelector('[data-testid="tool-link-2"]').disabled,
    reason: document.querySelector('[data-testid="tool-reason-2"]')?.textContent,
  }))
  check('on Gen 1 the index lists it disabled: "this exists in Gen 2–4"', hpGen1.disabled && hpGen1.reason?.includes('Gen 2–4'), JSON.stringify(hpGen1))

  // ------------------------------------------------------------------ #3
  hr('#3 DAMAGE -- doubles on the page (the engine\'s live-calc doubles fixtures are in verify-damage-calc §3b)')
  const openDamage = async (gen) => {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-3"]')
    await page.waitForSelector('[data-testid="calc-damage"]', { timeout: 60000 })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="calc-damage"] .dcalc-move-result, [data-testid^="dcalc-result-"]').length > 0, null, { timeout: 60000 }).catch(() => {})
  }
  await openDamage(2)
  check('Gen 2 offers no doubles: they start in Gen 3', (await page.$('[data-toggle="dcalc-battle"]')) === null)
  await openDamage(4)
  const resultText = () => page.$eval('[data-testid="calc-damage"] [data-layout="dcalc-results"]', (el) => el.innerText)
  const singlesText = await resultText()
  await page.click('[data-toggle="dcalc-battle"] [role="switch"]')
  await page.waitForFunction(
    () => !document.querySelector('[data-layout="dcalc-results"]')?.innerText.includes('Loading this game’s move targets'),
    null,
    { timeout: 60000 },
  )
  const dbl = await page.evaluate(() => ({
    partners: [...document.querySelectorAll('[data-testid="dcalc-field"] .ds-toggle')].filter((b) => b.textContent.includes('Partner standing')).length,
    helping: [...document.querySelectorAll('[data-testid="dcalc-field"] .ds-toggle')].filter((b) => b.textContent.includes('Helping Hand')).length,
  }))
  check('Gen 4 doubles adds "Partner standing" and "Helping Hand" to each side', dbl.partners === 2 && dbl.helping === 2, JSON.stringify(dbl))
  const doublesText = await resultText()
  check('the move targets load and every result reads as a number again', !doublesText.includes('did not load') && !doublesText.includes('Loading'), doublesText.slice(0, 80))
  // Helping Hand on Pokemon 1's side changes Pokemon 1's damaging moves.
  const hh = await page.$$('[data-testid="dcalc-field-toggles-1"] .ds-toggle')
  for (const b of hh) if ((await b.textContent()).includes('Helping Hand')) await b.click()
  const hhText = await resultText()
  check('Helping Hand changes the numbers', hhText !== doublesText, '')
  check('and singles numbers were different from doubles-with-Helping-Hand ones', singlesText !== hhText)
  await page.$eval('[data-testid="dcalc-field"]', (el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: shot('tool-3-damage-doubles.png') })
  await page.click('[data-toggle="dcalc-battle"] [role="switch"]')

  // ------------------------------------------------------------------ #4
  hr('#4 MULTI-MOVE COMPARISON -- the Damage page\'s top row, every move of both Pokemon')
  for (const gen of [1, 4]) {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-4"]')
    await page.waitForSelector('[data-testid="calc-damage"]', { timeout: 60000 })
    await page.waitForSelector('[data-testid="dcalc-p2-result-3"]', { timeout: 60000 })
    const rows = await page.evaluate(() =>
      [1, 2].map((p) =>
        [0, 1, 2, 3].map((slot) => document.querySelector(`[data-testid="dcalc-p${p}-result-${slot}"]`)?.innerText.replace(/\s+/g, ' ').trim() ?? null),
      ),
    )
    const filled = rows.flat().filter((t) => t && /\d|no effect|not calculated/i.test(t)).length
    check(`Gen ${gen}: both Pokemon's four moves each carry a result (${filled}/8)`, filled === 8, JSON.stringify(rows).slice(0, 160))
    // Picking another move in the row puts ITS full line underneath.
    const before = await page.$eval('[data-testid="calc-damage-result"]', (el) => el.innerText)
    await page.click('[data-testid="dcalc-p2-result-1"]')
    const after = await page.$eval('[data-testid="calc-damage-result"]', (el) => el.innerText)
    check(`Gen ${gen}: choosing a move in the row shows its own line below`, before !== after, after.slice(0, 70))
  }

  // ------------------------------------------------------------------ #5
  hr('#5 SPEED TIERS -- the engine\'s ladder from typed-in rows')
  /*
    Expectations worked from the Stat formula (Bulbapedia "Stat", read 2026-10-15)
    and the turn-order routines battle/speed.ts cites:
      Gen 4 Jolteon L100, 31 IV, 252 EV, +Spe: floor((260+31+63)*100/100)+5 = 359,
        x1.1 = 394; Choice Scarf x15/10 = 591; paralysis /4 = 98.
      Gen 1 Electrode L100, DV 15, Stat Exp 65535: (140+15)*2+63 = 373, +5 = 378;
        paralysis >>2 = 94; +2 stage x2/1 = 756.
  */
  const tiers = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/tools/speed-tiers/speedTiersMath.ts')
    const g = await import('/pokeapp/src/modules/battle/game.ts')
    const bd = await import('/pokeapp/src/modules/battle/battleData.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (name) => d.listSpecies().find((s) => s.name === name).id
    const item = (name) => d.listItems().find((i) => i.name === name).id
    const row = (key, side, name, extra = {}) => ({
      key, side, speciesId: sp(name), level: '100', speedIndividual: '31', speedEffort: '252', nature: 'up',
      itemId: null, abilityId: null, moves: [], stage: 0, paralyzed: false, statused: false, unburden: false, slowStart: false, ...extra,
    })
    const field = { weather: null, tailwind: { mine: false, theirs: false }, trickRoom: false }
    const pt = g.gameContext('platinum')
    const ptData = await bd.loadBattleData('platinum')
    const speeds = (o) => (o.ok ? o.rows.map((r) => `${r.key}:${r.speed.min}`) : [`reason: ${o.reason}`])
    const rb = g.gameContext('red-blue')
    const rbData = await bd.loadBattleData('red-blue')
    const g1 = (key, extra) => ({ ...row(key, 'mine', 'electrode', extra), speedIndividual: '15', speedEffort: '65535', nature: 'neutral' })
    return {
      g4: speeds(m.readTiers(pt, ptData, [
        row('plain', 'mine', 'jolteon'),
        row('scarf', 'theirs', 'jolteon', { itemId: item('choice-scarf') }),
        row('para', 'theirs', 'jolteon', { paralyzed: true }),
      ], field)),
      g4tr: speeds(m.readTiers(pt, ptData, [row('plain', 'mine', 'jolteon'), row('para', 'theirs', 'jolteon', { paralyzed: true })], { ...field, trickRoom: true })),
      tie: (() => {
        const o = m.readTiers(pt, ptData, [row('a', 'mine', 'jolteon'), row('b', 'theirs', 'jolteon')], field)
        return o.ok ? o.rows[0].ties : null
      })(),
      g1: speeds(m.readTiers(rb, rbData, [g1('plain'), g1('para', { paralyzed: true }), g1('up2', { stage: 2 })], field)),
      one: speeds(m.readTiers(pt, ptData, [row('a', 'mine', 'jolteon')], field)),
      badLevel: speeds(m.readTiers(pt, ptData, [row('a', 'mine', 'jolteon', { level: '101' }), row('b', 'mine', 'jolteon')], field)),
    }
  })
  check('Gen 4: +Spe Jolteon 394; Choice Scarf 591; paralysed 98, in that order', JSON.stringify(tiers.g4) === '["scarf:591","plain:394","para:98"]', JSON.stringify(tiers.g4))
  check('Gen 4 Trick Room: the slower one moves first', JSON.stringify(tiers.g4tr) === '["para:98","plain:394"]', JSON.stringify(tiers.g4tr))
  check('two identical Jolteon are an exact tie (50/50)', JSON.stringify(tiers.tie) === '["b"]', JSON.stringify(tiers.tie))
  check('Gen 1: Electrode 378; +2 stage 756; paralysed 94', JSON.stringify(tiers.g1) === '["up2:756","plain:378","para:94"]', JSON.stringify(tiers.g1))
  check('one Pokemon is a reason, not a ladder', tiers.one[0] === 'reason: Add at least two Pokémon to compare.', tiers.one[0])
  check('level 101 is a reason naming the row', tiers.badLevel[0].startsWith('reason: Row 1: level must be'), tiers.badLevel[0])

  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-5"]')
  await page.waitForSelector('[data-testid="tiers-ladder"]', { timeout: 60000 })
  const ladderBefore = await page.$$eval('[data-testid^="tiers-rank-"]', (els) => els.map((e) => e.dataset.key))
  check('the page opens on a two-row ladder', ladderBefore.length === 2, ladderBefore.join(','))
  await page.click('.ds-toggle:has-text("Trick Room")')
  const ladderTr = await page.$$eval('[data-testid^="tiers-rank-"]', (els) => els.map((e) => e.dataset.key))
  check('Trick Room reverses it on screen', JSON.stringify(ladderTr) === JSON.stringify([...ladderBefore].reverse()), ladderTr.join(','))
  await page.fill('[data-testid="tiers-level-1"]', '')
  const tiersReason = await page.$eval('[data-testid="tool-result"]', (el) => el.innerText.trim())
  check('an empty level is a reason where the ladder was', tiersReason.startsWith('Row 1: level must be'), tiersReason)
  await page.screenshot({ path: shot('tool-5-speed-tiers.png') })

  // ------------------------------------------------------------------ #6
  hr('#6 SPEED EV MINIMIZER -- the solver against brute force over every value')
  const minimizer = await page.evaluate(async () => {
    const mm = await import('/pokeapp/src/modules/tools/speed-minimizer/speedMinimizerMath.ts')
    const tm = await import('/pokeapp/src/modules/tools/speed-tiers/speedTiersMath.ts')
    const sp = await import('/pokeapp/src/modules/battle/speed.ts')
    const g = await import('/pokeapp/src/modules/battle/game.ts')
    const bd = await import('/pokeapp/src/modules/battle/battleData.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const id = (name) => d.listSpecies().find((s) => s.name === name).id
    const field = { weather: null, tailwind: { mine: false, theirs: false }, trickRoom: false }
    const out = []
    const cases = [
      { game: 'platinum', mine: 'garchomp', target: 'jolteon', tIv: '31', tEv: '0', tNature: 'neutral', mNature: 'neutral', mLevel: '100', expect: 228 },
      { game: 'emerald', mine: 'salamence', target: 'gengar', tIv: '31', tEv: '0', tNature: 'neutral', mNature: 'neutral', mLevel: '100', expect: 84 },
      { game: 'crystal', mine: 'alakazam', target: 'starmie', tIv: '15', tEv: '65535', tNature: 'neutral', mNature: 'neutral', mLevel: '100', expect: 46226 },
      { game: 'red-blue', mine: 'alakazam', target: 'starmie', tIv: '15', tEv: '65535', tNature: 'neutral', mNature: 'neutral', mLevel: '100', expect: 46226 },
    ]
    for (const c of cases) {
      const ctx = g.gameContext(c.game)
      const data = await bd.loadBattleData(c.game)
      const iv = String(ctx.maxIndividual)
      const mine = { ...tm.newRow('mine', id(c.mine), ctx), speedIndividual: iv, speedEffort: '0', nature: c.mNature, level: c.mLevel }
      const target = { ...tm.newRow('theirs', id(c.target), ctx), speedIndividual: c.tIv, speedEffort: c.tEv, nature: c.tNature }
      const o = mm.readMinimizer(ctx, data, mine, target, field)
      if (!o.ok) { out.push({ game: c.game, error: o.reason }); continue }
      // Brute force: every effort value through the same Speed routine.
      const goal = (() => { const t = tm.rowToSpec(ctx, target, 2, field); return sp.effectiveSpeed(ctx, data, t.spec, 'high', t.mods, new Set()) })()
      const speedWith = (effort) => { const r = tm.rowToSpec(ctx, { ...mine, speedEffort: String(effort) }, 1, field); return sp.effectiveSpeed(ctx, data, r.spec, 'high', r.mods, new Set()) }
      let brute = null
      for (let e = 0; e <= ctx.maxEffort; e++) if (speedWith(e) > goal) { brute = e; break }
      let bruteLevel = null
      for (let lv = 1; lv <= 100; lv++) { const r = tm.rowToSpec(ctx, { ...mine, level: String(lv) }, 1, field); if (sp.effectiveSpeed(ctx, data, r.spec, 'high', r.mods, new Set()) > goal) { bruteLevel = lv; break } }
      out.push({ game: c.game, mine: c.mine, target: c.target, goal, solver: o.threshold.minEffort, brute, expect: c.expect, solverLevel: o.threshold.minLevel, bruteLevel })
    }
    const ctx = g.gameContext('platinum')
    const data = await bd.loadBattleData('platinum')
    const bad = mm.readMinimizer(ctx, data, { ...tm.newRow('mine', id('garchomp'), ctx), level: '' }, tm.newRow('theirs', id('jolteon'), ctx), field)
    return { out, bad: bad.ok ? 'ok' : bad.reason }
  })
  for (const r of minimizer.out) {
    if (r.error) { check(`${r.game}: solver answers`, false, r.error); continue }
    check(`${r.game}: ${r.mine} needs exactly the brute-force minimum to pass ${r.target} (${r.goal})`, r.solver === r.brute, `solver ${r.solver} / brute ${r.brute}`)
    check(`${r.game}: which is the hand-worked ${r.expect}`, r.solver === r.expect, String(r.solver))
    check(`${r.game}: and the lowest level matches brute force`, r.solverLevel === r.bruteLevel, `solver ${r.solverLevel} / brute ${r.bruteLevel}`)
  }
  check('an empty level names "Your Pokémon"', minimizer.bad.startsWith('Your Pokémon: level must be'), minimizer.bad)

  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-6"]')
  await page.waitForSelector('[data-testid="min-detail"]', { timeout: 60000 })
  const minScreen = await page.evaluate(() => ({
    headline: document.querySelector('[data-testid="min-headline"]')?.innerText.trim(),
    detail: document.querySelector('[data-testid="min-detail"]')?.innerText.trim(),
    effortField: Boolean(document.querySelector('[data-testid="tiers-ev-1"]')),
  }))
  check('the page answers on open, and does not ask for the Speed effort it solves for', Boolean(minScreen.headline) && !minScreen.effortField, JSON.stringify(minScreen).slice(0, 140))
  await page.screenshot({ path: shot('tool-6-speed-minimizer.png') })

  // ------------------------------------------------------------------ #7
  hr('#7 DEFENSIVE BULK -- the solver against an exhaustive search of the whole grid')
  const bulk = await page.evaluate(async () => {
    const bm = await import('/pokeapp/src/modules/tools/bulk/bulkMath.ts')
    const st = await import('/pokeapp/src/modules/calculators/damageCalcState.ts')
    const eng = await import('/pokeapp/src/modules/calculators/damage/index.ts')
    const stat = await import('/pokeapp/src/modules/team-builder/statMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (n) => d.listSpecies().find((s) => s.name === n).id
    const mv = (n) => d.listMoves().find((m) => m.name === n)
    const res = []
    const cases = [
      { gen: 4, atk: 'garchomp', def: 'metagross', move: 'earthquake' },
      { gen: 4, atk: 'gengar', def: 'blissey', move: 'thunderbolt' },
      { gen: 1, atk: 'tauros', def: 'snorlax', move: 'body-slam' },
      { gen: 2, atk: 'zapdos', def: 'skarmory', move: 'thunderbolt' },
      { gen: 2, atk: 'machamp', def: 'snorlax', move: 'cross-chop' },
      { gen: 2, atk: 'heracross', def: 'espeon', move: 'megahorn' },
    ]
    const KEEPS = [0, 30, 60, 85]
    for (const c of cases) {
      const attacker = st.toCalcPokemon(st.newSide(sp(c.atk), c.gen))
      const defBase = st.toCalcPokemon(st.newSide(sp(c.def), c.gen))
      // Start the defender with no HP / defence effort, so every answer is a real search.
      const defender = { ...defBase, effort: { ...defBase.effort, hp: 0, defense: 0, special: 0, 'special-defense': 0 } }
      const field = st.fieldFor(st.emptyDualField(), 0)
      const first = bm.readBulk({ gen: c.gen, attacker, defender, move: mv(c.move), isCrit: false, field, keepPct: 0 })
      if (!first.ok) { res.push({ c, error: first.reason }); continue }
      // Exhaustive: every step pair, once, then every keep level read off the same grid.
      const steps = bm.effortSteps(c.gen, c.gen <= 2 ? 65535 : 252)
      const budget = c.gen >= 3 ? 510 - Object.entries(defender.effort).filter(([k]) => k !== 'hp' && k !== first.defKey).reduce((x, [, v]) => x + (v ?? 0), 0) : Infinity
      const grid = []
      for (const hp of steps) for (const df of steps) {
        if (hp + df > budget) continue
        const p = { ...defender, effort: { ...defender.effort, hp, [first.defKey]: df } }
        const r = eng.calculateDamage(c.gen, attacker, p, { move: mv(c.move), isCrit: false, hits: null, powerOverride: null }, field, { koText: false })
        const maxHp = eng.computeRawStats(p, c.gen).hp
        grid.push({ hp, def: df, total: hp + df, maxHp, left: maxHp - r.range[1] })
      }
      for (const keep of KEEPS) {
        let best = null
        for (const g of grid) {
          if (g.left < bm.hpToKeep(g.maxHp, keep)) continue
          if (!best || g.total < best.total || (g.total === best.total && g.left > best.left)) best = { hp: g.hp, def: g.def, total: g.total, left: g.left }
        }
        const o = bm.readBulk({ gen: c.gen, attacker, defender, move: mv(c.move), isCrit: false, field, keepPct: keep })
        res.push({ c: { ...c, keep }, solver: o.ok && o.best ? { hp: o.best.hp, def: o.best.def, total: o.best.total, left: o.best.left } : null, brute: best, defLabel: first.defLabel })
      }
    }
    // The Stat Exp steps are exactly where the bonus rises.
    const stepsOk = bm.effortSteps(1, 65535).every((e, b) => stat.statExpBonus(e) === b && (b === 0 || stat.statExpBonus(e - 1) === b - 1))
    const status = (() => {
      const a = st.toCalcPokemon(st.newSide(sp('garchomp'), 4))
      const o = bm.readBulk({ gen: 4, attacker: a, defender: a, move: mv('swords-dance'), isCrit: false, field: st.fieldFor(st.emptyDualField(), 0), keepPct: 0 })
      return o.ok ? 'ok' : o.reason
    })()
    return { res, stepsOk, status }
  })
  for (const r of bulk.res) {
    const label = `Gen ${r.c.gen}: ${r.c.def} vs ${r.c.atk} ${r.c.move}, keep ${r.c.keep}%`
    if (r.error) { check(label, false, r.error); continue }
    check(`${label}: the least total equals the exhaustive search`, JSON.stringify(r.solver) === JSON.stringify(r.brute), `solver ${JSON.stringify(r.solver)} / exhaustive ${JSON.stringify(r.brute)} (${r.defLabel})`)
  }
  for (const gen of [1, 2, 4]) {
    const real = bulk.res.filter((r) => r.c.gen === gen && r.solver && r.solver.total > 0)
    check(`Gen ${gen}: at least one answer is a real investment, not 0 or impossible`, real.length > 0, real.map((r) => `${r.c.keep}%: ${r.solver.hp}/${r.solver.def}`).join(' '))
  }
  check('Gen 1-2 Stat Exp steps are exactly where the bonus rises', bulk.stepsOk)
  check('a status move is a reason, not a spread', bulk.status.startsWith('Pick a damaging move'), bulk.status)

  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-7"]')
  await page.waitForSelector('[data-testid="bulk-current"]', { timeout: 60000 })
  const bulkScreen = await page.evaluate(() => ({
    best: document.querySelector('[data-testid="bulk-best"]')?.innerText.trim(),
    current: document.querySelector('[data-testid="bulk-current"]')?.innerText.trim(),
  }))
  check('the page answers on open with the Damage Calculator’s own panels', Boolean(bulkScreen.best) && bulkScreen.current.startsWith('As set:'), JSON.stringify(bulkScreen).slice(0, 160))
  await page.fill('[data-testid="bulk-keep"]', '120')
  const bulkReason = await page.$eval('[data-testid="tool-result"]', (el) => el.innerText.trim())
  check('a share of 120% is a reason, not a number', bulkReason.startsWith('The HP to keep must be'), bulkReason)
  await page.fill('[data-testid="bulk-keep"]', '0')
  await page.screenshot({ path: shot('tool-7-bulk.png') })

  // ------------------------------------------------------------------ #8
  hr('#8 CATCH RATE -- each game\'s own routine, worked by hand and emulated roll by roll')
  /*
    Worked by hand from the routines catchRateMath.ts cites:
      Gen 1 Mewtwo L70 (HP DV 15 -> 249 HP), full HP, rate 3, Poke Ball:
        W = floor(floor(249*255/12)/floor(249/4)) = floor(5291/62) = 85;
        Rand1 0..255 must be <= 3 (4 values), Rand2 <= 85 (86 values):
        4*86 / (256*256) = 344/65536.  Great Ball: W = floor(7936/62) = 128,
        Rand1 0..200: 4*129 / (201*256).  Asleep, Poke: (25 + 4*86/256)/256.
      Gen 2 Snorlax L5 (HP DV 15 -> 32 HP), full HP, Heavy Ball, rate 25:
        weight 1014.0 lb -> 10140: half 5070, -316, -158 = 4596, high byte 17
        -> +40 = 65; 3*32 = 96, 2*32 = 64: floor(65*32/96) = 21 -> 22/256.
      Gen 3 Rayquaza (rate 3), Ultra Ball, 1 HP, asleep:
        floor(floor(3*20/10)*(3M-2)/3M) = 5, x2 = 10; 16711680/10 = 1671168,
        isqrt 1292, isqrt 35, 1048560/35 = 29958 -> (29958/65536)^4.
      Gen 4 Platinum Gible (rate 45), Dusk Ball at night, full HP:
        floor(45*35/10) = 157, floor(157*M/3M) = 52; 16711680/52 = 321378,
        isqrt 566, isqrt 23, 1048560/23 = 45589 -> (45589/65536)^4.
      HGSS Snorlax (460.0 kg, rate 25), Heavy Ball, full HP: 25+40 = 65,
        floor(65/3) = 21; 16711680/21 = 795794, isqrt 892, isqrt 29,
        1048560/29 = 36157 -> (36157/65536)^4.  Pikachu (6.0 kg, rate 190):
        the bug's -20 -> 170.
  */
  const catchCases = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/calculators/catchRateMath.ts')
    const t = (o) => ({ speciesId: 1, catchRate: 45, level: 50, maxHp: 100, currentHp: 100, status: 'none', types: ['normal'], baseSpeed: 50, weightHg: 100, gen2WeightLb10: 100, gender: 'male', ...o })
    const p = (engine, target, ball, ctx = {}) => m.catchChance(engine, t(target), ball, { ...m.NEUTRAL_CONTEXT, ...ctx })
    const mew = { speciesId: 150, catchRate: 3, level: 70, maxHp: 249, currentHp: 249, gender: 'genderless' }
    // Literal emulation: every random value the routine can draw.
    const emu1 = (tg, ball) => {
      const cap = ball === 'poke-ball' ? 255 : ball === 'great-ball' ? 200 : 150
      const S = tg.status === 'sleep' || tg.status === 'freeze' ? 25 : tg.status === 'none' ? 0 : 12
      let hits = 0
      for (let r1 = 0; r1 <= cap; r1++) for (let r2 = 0; r2 <= 255; r2++) {
        if (r1 < S) { hits++; continue }
        if (r1 - S > tg.catchRate) continue
        const W = Math.floor(Math.floor((tg.maxHp * 255) / (ball === 'great-ball' ? 8 : 12)) / Math.max(Math.floor(tg.currentHp / 4), 1))
        if (W > 255 || r2 <= W) hits++
      }
      return hits / ((cap + 1) * 256)
    }
    const emu2final = (final) => { let h = 0; for (let r = 0; r <= 255; r++) if (r <= final) h++; return h / 256 }
    let worst1 = 0
    let worst2 = 0
    for (let i = 0; i < 60; i++) {
      const maxHp = 20 + ((i * 37) % 600)
      const tg = t({ catchRate: [3, 45, 120, 190, 255][i % 5], maxHp, currentHp: 1 + ((i * 53) % maxHp), status: ['none', 'sleep', 'paralysis'][i % 3] })
      for (const ball of ['poke-ball', 'great-ball', 'ultra-ball']) worst1 = Math.max(worst1, Math.abs(m.catchChance('gen1', tg, ball).probability - emu1(tg, ball)))
      const r2 = m.catchChance('gen2', tg, 'poke-ball')
      worst2 = Math.max(worst2, Math.abs(r2.probability - emu2final(r2.value)))
    }
    return {
      g1poke: p('gen1', mew, 'poke-ball').probability,
      g1great: p('gen1', mew, 'great-ball').probability,
      g1sleep: p('gen1', { ...mew, status: 'sleep' }, 'poke-ball').probability,
      g2heavy: p('gen2', { speciesId: 143, catchRate: 25, level: 5, maxHp: 32, currentHp: 32, gen2WeightLb10: 10140 }, 'heavy-ball'),
      g2love: p('gen2', { speciesId: 25, catchRate: 190, maxHp: 50, currentHp: 50, gender: 'male' }, 'love-ball', { yourSpeciesId: 25, yourGender: 'male' }),
      g2loveOpposite: p('gen2', { speciesId: 25, catchRate: 190, maxHp: 50, currentHp: 50, gender: 'male' }, 'love-ball', { yourSpeciesId: 25, yourGender: 'female' }).value,
      g2para: p('gen2', { maxHp: 50, currentHp: 50, status: 'paralysis' }, 'poke-ball'),
      g2fast: [81, 25].map((id) => p('gen2', { speciesId: id, catchRate: 100, maxHp: 50, currentHp: 50 }, 'fast-ball').value),
      g2moon: p('gen2', { speciesId: 35, catchRate: 150, maxHp: 50, currentHp: 50 }, 'moon-ball').note,
      g3ray: p('gen3', { speciesId: 384, catchRate: 3, maxHp: 300, currentHp: 1, status: 'sleep' }, 'ultra-ball').probability,
      g4dusk: p('gen4', { speciesId: 443, catchRate: 45, maxHp: 60, currentHp: 60 }, 'dusk-ball', { nightOrCave: true }).probability,
      g4duskDay: p('gen4', { speciesId: 443, catchRate: 45, maxHp: 60, currentHp: 60 }, 'dusk-ball').value,
      hgHeavy: p('hgss', { speciesId: 143, catchRate: 25, maxHp: 300, currentHp: 300, weightHg: 4600 }, 'heavy-ball').probability,
      hgHeavyBug: p('hgss', { speciesId: 25, catchRate: 190, maxHp: 90, currentHp: 90, weightHg: 60 }, 'heavy-ball'),
      hgMoon: [35, 25].map((id) => p('hgss', { speciesId: id, catchRate: 150, maxHp: 90, currentHp: 90 }, 'moon-ball').value),
      master: ['gen1', 'gen2', 'gen3', 'gen4', 'hgss'].map((e) => p(e, mew, 'master-ball').guaranteed),
      apricornsOnlyHgss: { gen4: m.ballsFor('gen4').includes('fast-ball'), hgss: m.ballsFor('hgss').includes('fast-ball'), gen2Safari: m.ballsFor('gen2').includes('safari-ball') },
      worst1,
      worst2,
    }
  })
  const near = (a, b) => Math.abs(a - b) < 1e-12
  check('Gen 1 Mewtwo, Poké Ball: 344/65536', near(catchCases.g1poke, 344 / 65536), catchCases.g1poke)
  check('Gen 1 Mewtwo, Great Ball: 4*129/(201*256)', near(catchCases.g1great, (4 * 129) / (201 * 256)), catchCases.g1great)
  check('Gen 1 Mewtwo asleep, Poké Ball: (25 + 4*86/256)/256', near(catchCases.g1sleep, (25 + (4 * 86) / 256) / 256), catchCases.g1sleep)
  check('Gen 2 Snorlax, Heavy Ball: final byte 21, 22/256', catchCases.g2heavy.value === 21 && near(catchCases.g2heavy.probability, 22 / 256), JSON.stringify(catchCases.g2heavy))
  // 190 x8 caps at 255, then the full-HP step: floor(255/3) = 85; unboosted floor(190/3) = 63.
  check('Gen 2 Love Ball boosts the SAME gender (the game\'s bug): 85 against 63, and says so', catchCases.g2love.note?.includes('SAME gender') && catchCases.g2love.value === 85 && catchCases.g2loveOpposite === 63, `${catchCases.g2love.value} / ${catchCases.g2loveOpposite}`)
  check('Gen 2 paralysis adds nothing (the game\'s bug), and says so', catchCases.g2para.note?.includes('add nothing'), catchCases.g2para.note)
  check('Gen 2 Fast Ball boosts Magnemite x4 and not Pikachu', catchCases.g2fast[0] > catchCases.g2fast[1] && catchCases.g2fast[1] > 0, JSON.stringify(catchCases.g2fast))
  check('Gen 2 Moon Ball never boosts, and says why', catchCases.g2moon?.includes('never boosts'), catchCases.g2moon)
  check('Gen 3 Rayquaza, Ultra Ball, 1 HP, asleep: (29958/65536)^4', near(catchCases.g3ray, (29958 / 65536) ** 4), catchCases.g3ray)
  check('Gen 4 Gible, Dusk Ball at night: (45589/65536)^4', near(catchCases.g4dusk, (45589 / 65536) ** 4), catchCases.g4dusk)
  check('and by day the Dusk Ball is a Poké Ball (a = 15)', catchCases.g4duskDay === 15, String(catchCases.g4duskDay))
  check('HGSS Snorlax, Heavy Ball: (36157/65536)^4', near(catchCases.hgHeavy, (36157 / 65536) ** 4), catchCases.hgHeavy)
  check('HGSS Heavy Ball bug: Pikachu loses 20 (a = floor(170/3) = 56) and it says so', catchCases.hgHeavyBug.value === 56 && catchCases.hgHeavyBug.note?.includes('−20'), JSON.stringify(catchCases.hgHeavyBug).slice(0, 140))
  check('HGSS Moon Ball: Clefairy x4, Pikachu not', catchCases.hgMoon[0] > catchCases.hgMoon[1], JSON.stringify(catchCases.hgMoon))
  check('the Master Ball always catches, in every game', catchCases.master.every(Boolean), JSON.stringify(catchCases.master))
  check('Apricorn balls only in Gen 2 and HGSS; no Safari Ball in Gen 2', !catchCases.apricornsOnlyHgss.gen4 && catchCases.apricornsOnlyHgss.hgss && !catchCases.apricornsOnlyHgss.gen2Safari, JSON.stringify(catchCases.apricornsOnlyHgss))
  check('Gen 1 closed form equals the roll-by-roll emulation (60 inputs x 3 balls)', catchCases.worst1 < 1e-12, String(catchCases.worst1))
  check('Gen 2 equals one random byte <= the final value (60 inputs)', catchCases.worst2 < 1e-12, String(catchCases.worst2))

  // The screen: Gen 4 has a game row; only HeartGold/SoulSilver offers the Apricorn balls.
  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-8"]')
  await page.waitForSelector('[data-testid="calc-catch-rate"]', { timeout: 60000 })
  const ballsShown = () => page.$$eval('[data-testid="catch-ball"] option', (els) => els.map((e) => e.value))
  const engineOf = () => page.$eval('[data-testid="calc-catch-rate"]', (el) => el.dataset.engine)
  await page.click('[data-testid="catch-game-row-platinum"]')
  const ptBalls = await ballsShown()
  const ptEngine = await engineOf()
  await page.click('[data-testid="catch-game-row-heartgold-soulsilver"]')
  const hgBalls = await ballsShown()
  const hgEngine = await engineOf()
  check('Platinum reads with its routine and offers no Fast Ball', ptEngine === 'gen4' && !ptBalls.includes('fast-ball'), `${ptEngine} ${ptBalls.length} balls`)
  check('HeartGold/SoulSilver reads with its own and offers the Apricorn balls', hgEngine === 'hgss' && hgBalls.includes('fast-ball') && hgBalls.includes('sport-ball'), `${hgEngine} ${hgBalls.length} balls`)
  await page.fill('[data-testid="catch-hp"]', '0')
  const catchReason = await page.$eval('[data-testid="tool-result"]', (el) => el.innerText.trim())
  check('0 HP is a reason, not a percentage', catchReason.startsWith('Current HP must be'), catchReason)
  await page.fill('[data-testid="catch-hp"]', '')
  const catchPct = await page.$eval('[data-testid="catch-percent"]', (el) => el.innerText.trim())
  check('cleared, it reads the full-HP chance', /%|Guaranteed/.test(catchPct), catchPct)
  await selectGeneration(page, 1)
  await openIndex(page)
  await page.click('[data-testid="tool-link-8"]')
  await page.waitForSelector('[data-testid="calc-catch-rate"]', { timeout: 60000 })
  check('Gen 1 reads with its own routine', (await engineOf()) === 'gen1')
  await page.screenshot({ path: shot('tool-8-catch.png') })

  // ------------------------------------------------------------------ #9 + Collection
  hr('#9 EV / STAT EXP REMAINING and the COLLECTION it reads')
  const col = await page.evaluate(async () => {
    const rm = await import('/pokeapp/src/modules/tools/ev-remaining/remainingMath.ts')
    const cm = await import('/pokeapp/src/modules/collection/collectionMath.ts')
    const sync = await import('/pokeapp/src/sync/teamSync.ts')
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const g4 = rm.remaining(4, { hp: 100, speed: 252 }, { hp: 252, speed: 200, attack: 4 })
    const g2 = rm.remaining(2, { hp: 1000, special: 65535 }, { hp: 65535, special: 65535 })
    const draft = (effort) => ({ speciesId: 1, nickname: '', level: '50', natureId: null, effort, buildId: null })
    const merged = sync.mergeDocs(
      { builds: [{ id: 'b1' }], teams: [], nextBuildSeq: 2, nextTeamSeq: 1, collection: [{ id: 'c1', seq: 1, buildId: 'b1' }], nextEntrySeq: 2 },
      { builds: [{ id: 'b1' }], teams: [], nextBuildSeq: 2, nextTeamSeq: 1, collection: [{ id: 'c1', seq: 1, buildId: 'b1' }, { id: 'c2', seq: 2, buildId: null }], nextEntrySeq: 3 },
    )
    const old = store.normalise({ builds: [], teams: [], nextBuildSeq: 1, nextTeamSeq: 1 })
    return {
      g4: g4.rows.map((r) => `${r.key}:${r.left}/${r.over}`),
      g4total: g4.totalLeft,
      g2: [g2.totalLeft, g2.rows.find((r) => r.key === 'special').left],
      over510: cm.checkEntry(4, draft({ hp: '252', attack: '252', speed: '8' })),
      g2cap: cm.checkEntry(2, draft({ hp: '65536' })),
      g2ok: cm.checkEntry(2, draft({ hp: '65535' })).ok,
      merged: merged.collection.map((c) => `${c.id}->${c.buildId}`),
      nextEntry: merged.nextEntrySeq,
      old: [old.collection.length, old.nextEntrySeq],
    }
  })
  check('Gen 4: 152 HP and 4 Atk to go, Speed 52 over (reported as over, not negative)', JSON.stringify(col.g4) === '["hp:152/0","attack:4/0","defense:0/0","special-attack:0/0","special-defense:0/0","speed:0/52"]' && col.g4total === 156, JSON.stringify(col.g4))
  check('Gen 2 reads Stat Exp on the five Gen 1-2 keys', col.g2[0] === 64535 && col.g2[1] === 0, JSON.stringify(col.g2))
  check('an entry over 510 EVs is a reason', !col.over510.ok && col.over510.reason.includes('510'), col.over510.reason)
  check('Gen 2 Stat Exp tops out at 65535', !col.g2cap.ok && col.g2ok, col.g2cap.reason)
  check('a first sync renumbers device entries after the cloud\'s and re-points their build', JSON.stringify(col.merged) === '["c1->b1","c2->b2","c3->null"]' && col.nextEntry === 4, JSON.stringify(col.merged))
  check('a document from before the Collection reads as an empty one', JSON.stringify(col.old) === '[0,1]', JSON.stringify(col.old))

  // The screen, end to end: a build, an entry trained toward it, what is left.
  await selectGeneration(page, 4)
  await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const garchomp = d.listSpecies().find((s) => s.name === 'garchomp')
    store.createBuild({
      generation: 4, speciesId: garchomp.id, pokemonId: garchomp.varieties[0].pokemon_id, nickname: 'Target', gender: null, shiny: false,
      level: 100, friendship: 70, itemId: null, abilityId: null, natureId: null, moveIds: [null, null, null, null],
      effort: { hp: 4, attack: 252, speed: 252 }, individual: {}, tags: [], notes: '',
    })
  })
  await goToPage(page, 'team-building', 'collection')
  await page.waitForSelector('[data-testid="col-species"]', { timeout: 60000 })
  const gid = await page.evaluate(async () => (await import('/pokeapp/src/data/index.ts')).listSpecies().find((s) => s.name === 'garchomp').id)
  await page.selectOption('[data-testid="col-species"]', String(gid))
  await page.fill('[data-testid="col-nickname"]', 'Chompy')
  await page.fill('[data-testid="col-effort-attack"]', '100')
  await page.fill('[data-testid="col-effort-speed"]', '252')
  const buildValue = await page.$eval('[data-testid="col-build"]', (el) => [...el.options].find((o) => o.textContent.startsWith('Target'))?.value)
  await page.selectOption('[data-testid="col-build"]', buildValue)
  await page.click('[data-testid="col-save"]')
  const listed = await page.$eval('[data-testid="col-list"]', (el) => el.innerText)
  check('the entry is listed with its EVs and its target', listed.includes('Chompy') && listed.includes('100 Atk / 252 Spe') && listed.includes('Target'), listed.slice(0, 120))
  const tbActive = await page.$eval('[data-testid="nav-tab-team-building"]', (el) => el.getAttribute('aria-current'))
  check('the Collection lives in the Team Building tab', tbActive === 'page', String(tbActive))
  await page.click('[data-testid^="col-remaining-"]')
  await page.waitForSelector('[data-testid="rem-total"]', { timeout: 60000 })
  const rem = await page.evaluate(() => ({
    total: document.querySelector('[data-testid="rem-total"]').innerText.trim(),
    atk: document.querySelector('[data-testid="rem-left-attack"]')?.innerText,
    hp: document.querySelector('[data-testid="rem-left-hp"]')?.innerText,
    speed: document.querySelector('[data-testid="rem-left-speed"]')?.innerText ?? null,
  }))
  check('"What’s left to train" opens #9 on that entry: 152 Atk + 4 HP = 156 EVs to go', rem.total === '156 EVs to go' && rem.atk === '152' && rem.hp === '4' && rem.speed === null, JSON.stringify(rem))
  await page.screenshot({ path: shot('tool-9-remaining.png') })

  // ------------------------------------------------------------------ #10
  hr('#10 MOVESET SEARCHER -- against a direct scan of each game\'s learnset file')
  const MAXDEX = { 1: 151, 2: 251, 3: 386, 4: 493 }
  const GROUP = (m) => (m === 'light-ball-egg' ? 'egg' : ['level-up', 'machine', 'tutor', 'egg'].includes(m) ? m : 'special')
  const scan = (game, gen, moveNames, methods) => {
    const rows = JSON.parse(readFileSync(`public/data/learnsets/${game}.json`, 'utf8'))
    const list = Array.isArray(rows) ? rows : (rows.rows ?? Object.values(rows).find(Array.isArray))
    const ids = moveNames.map((n) => MOVE_ID[n])
    const per = new Map()
    for (const r of list) {
      if (!ids.includes(r.move_id) || r.species_id > MAXDEX[gen] || !methods.includes(GROUP(r.method))) continue
      if (!per.has(r.pokemon_id)) per.set(r.pokemon_id, new Set())
      per.get(r.pokemon_id).add(r.move_id)
    }
    return [...per].filter(([, s]) => ids.every((i) => s.has(i))).map(([p]) => p).sort((a, b) => a - b)
  }
  const MOVE_ID = Object.fromEntries(
    Object.values(JSON.parse(readFileSync('public/data/moves.json', 'utf8'))).map((m) => [m.name, m.id]),
  )
  const ALL = ['level-up', 'machine', 'tutor', 'egg', 'special']
  const queries = [
    { game: 'red-blue', gen: 1, moves: ['thunderbolt', 'surf'], methods: ['machine'] },
    { game: 'crystal', gen: 2, moves: ['spore'], methods: ALL },
    { game: 'crystal', gen: 2, moves: ['thunderbolt'], methods: ['tutor'] },
    { game: 'gold-silver', gen: 2, moves: ['thunderbolt'], methods: ['tutor'] },
    { game: 'emerald', gen: 3, moves: ['baton-pass', 'swords-dance'], methods: ALL },
    { game: 'platinum', gen: 4, moves: ['earthquake', 'ice-beam'], methods: ['level-up', 'machine'] },
    { game: 'heartgold-soulsilver', gen: 4, moves: ['volt-tackle'], methods: ['egg'] },
  ]
  const tool = await page.evaluate(async (qs) => {
    const m = await import('/pokeapp/src/modules/tools/moveset/movesetMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const out = []
    for (const q of qs) {
      const p = await d.loadLearnsets(q.game)
      const ids = q.moves.map((n) => d.listMoves().find((x) => x.name === n).id)
      const o = m.searchMovesets(p.rows, ids, new Set(q.methods), (id) => d.isSpeciesInGeneration(id, q.gen))
      out.push(o.ok ? o.hits.map((h) => h.pokemonId).sort((a, b) => a - b) : o.reason)
    }
    return out
  }, queries)
  queries.forEach((q, i) => {
    const want = scan(q.game, q.gen, q.moves, q.methods)
    check(`${q.game}: ${q.moves.join(' + ')} by ${q.methods.length === 5 ? 'any method' : q.methods.join('/')} -- ${want.length} Pokémon, same as the file`, JSON.stringify(tool[i]) === JSON.stringify(want), `tool ${JSON.stringify(tool[i]).slice(0, 60)} / scan ${JSON.stringify(want).slice(0, 60)}`)
  })
  check('Crystal\'s tutor teaches Thunderbolt and Gold/Silver has no tutor at all', tool[2].length > 0 && tool[3].length === 0, `${tool[2].length} / ${tool[3].length}`)
  check('HGSS Volt Tackle comes from the Light Ball egg, filed under Egg', tool[6].length > 0, JSON.stringify(tool[6]))

  await selectGeneration(page, 2)
  await openIndex(page)
  await page.click('[data-testid="tool-link-10"]')
  await page.waitForSelector('[data-testid="ms-move-1"]', { timeout: 60000 })
  const noMove = await page.$eval('[data-testid="tool-result"]', (el) => el.innerText.trim())
  check('no move picked is a reason, not an empty list', noMove === 'Pick at least one move.', noMove)
  await page.selectOption('[data-testid="ms-move-1"]', String(MOVE_ID.thunderbolt))
  await page.click('.ds-toggle:has-text("Level-up")')
  await page.click('.ds-toggle:has-text("TM/HM")')
  await page.click('.ds-toggle:has-text("Egg")')
  await page.click('.ds-toggle:has-text("Special")')
  const countIn = async (game) => {
    await page.click(`[data-testid="tool-game-row-${game}"]`)
    await page.waitForSelector('[data-testid="ms-count"]', { timeout: 60000 })
    return page.$eval('[data-testid="ms-count"]', (el) => Number(el.innerText.split(' ')[0]))
  }
  const crys = await countIn('crystal')
  const gs = await countIn('gold-silver')
  check('on screen, the game row changes the answer: Thunderbolt by tutor in Crystal, none in Gold/Silver', crys > 0 && gs === 0, `${crys} / ${gs}`)
  await page.click('[data-testid="tool-game-row-crystal"]')
  await page.screenshot({ path: shot('tool-10-moveset.png') })

  // ------------------------------------------------------------------ #11
  hr('#11 STATUS MOVE FINDER -- every game\'s own effect table, complete and per era')
  const st = await page.evaluate(async () => {
    const sm = await import('/pokeapp/src/modules/tools/status/statusMath.ts')
    const bd = await import('/pokeapp/src/modules/battle/battleData.ts')
    const GAMES = { 'red-blue': 1, yellow: 1, 'gold-silver': 2, crystal: 2, 'ruby-sapphire': 3, emerald: 3, 'firered-leafgreen': 3, 'diamond-pearl': 4, platinum: 4, 'heartgold-soulsilver': 4 }
    const STATUSY = /SLEEP|POISON|TOXIC|PARALY|BURN|FREEZE|CONFUS|FLINCH|ATTRACT|INFATU|TRI_ATTACK|SWAGGER|FLATTER|TEETER|YAWN|WILL_O|THUNDER|TWISTER|STOMP|SNORE|FAKE_OUT|BLAZE_KICK|SKY_ATTACK|SECRET_POWER|BOUNCE|CHATTER|TWINEEDLE/
    const gaps = []
    for (const [game, gen] of Object.entries(GAMES)) {
      const data = await bd.loadBattleData(game)
      const table = sm.tableFor(gen)
      for (const e of new Set(Object.values(data.moves).map((m) => m.e))) {
        if (STATUSY.test(e) && !table[e] && !sm.NOT_INFLICTING.has(e)) gaps.push(`${game}:${e}`)
      }
    }
    const f = async (game, gen, id) => {
      const data = await bd.loadBattleData(game)
      return sm.inflictsOf(gen, bd.gameMove(data, id), id).map((x) => `${x.ailment}:${x.chance ?? 'status'}`)
    }
    return {
      gaps,
      triAttack1: await f('red-blue', 1, 161),
      triAttack2: await f('crystal', 2, 161),
      skyAttack2: await f('crystal', 2, 143),
      skyAttack3: await f('emerald', 3, 143),
      toxic1: await f('red-blue', 1, 92),
      blizzard1: await f('red-blue', 1, 59),
      bodySlam: await f('platinum', 4, 34),
      fireFang: await f('platinum', 4, 424),
      thunderWave: await f('emerald', 3, 86),
      yawn: await f('platinum', 4, 281),
    }
  })
  check('every status-looking effect in all ten games is mapped or listed as not inflicting', st.gaps.length === 0, st.gaps.slice(0, 6).join(', '))
  check('Gen 1 Tri Attack adds nothing; Gen 2\'s is 20% burn / freeze / paralysis', st.triAttack1.length === 0 && JSON.stringify(st.triAttack2) === '["burn:20","freeze:20","paralysis:20"]', `${JSON.stringify(st.triAttack1)} / ${JSON.stringify(st.triAttack2)}`)
  check('Sky Attack: no flinch in Gen 2, 30% from Gen 3', st.skyAttack2.length === 0 && JSON.stringify(st.skyAttack3) === '["flinch:30"]', `${JSON.stringify(st.skyAttack2)} / ${JSON.stringify(st.skyAttack3)}`)
  check('Gen 1 Toxic badly poisons; Gen 1 Blizzard freezes 10%', JSON.stringify(st.toxic1) === '["badly-poison:status"]' && JSON.stringify(st.blizzard1) === '["freeze:10"]', `${st.toxic1} / ${st.blizzard1}`)
  check('Body Slam paralyses 30%; Thunder Wave is a status move; Yawn makes drowsy', JSON.stringify(st.bodySlam) === '["paralysis:30"]' && JSON.stringify(st.thunderWave) === '["paralysis:status"]' && JSON.stringify(st.yawn) === '["drowsy:status"]', `${st.bodySlam} / ${st.thunderWave} / ${st.yawn}`)
  check('Fire Fang (Gen 4): burn 10% and flinch 10%, separately', JSON.stringify(st.fireFang) === '["burn:10","flinch:10"]', JSON.stringify(st.fireFang))

  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-11"]')
  await page.waitForSelector('[data-testid="status-rows"]', { timeout: 60000 })
  const paraRows = await page.$$eval('[data-testid^="status-move-"]', (els) => els.map((e) => [Number(e.dataset.testid.replace('status-move-', '')), e.dataset.chance]))
  const has = (id, chance) => paraRows.some(([m, c]) => m === id && String(c) === String(chance))
  check('by status (paralysis): Thunder Wave as the move\'s effect, Thunderbolt at 10%', has(86, 'status') && has(85, 10), `${paraRows.length} rows`)
  await page.selectOption('[data-testid="status-kind"]', 'guaranteed')
  const guaranteedOnly = await page.$$eval('[data-testid^="status-move-"]', (els) => els.every((e) => e.dataset.chance === 'status'))
  check('"Status moves" keeps only moves whose effect IS the status', guaranteedOnly)
  await page.screenshot({ path: shot('tool-11-status.png') })

  // ------------------------------------------------------------------ #12
  hr('#12 DOUBLES TARGETING -- every target constant known; the Gen 3 -> 4 changes')
  const tg = await page.evaluate(async () => {
    const tm = await import('/pokeapp/src/modules/tools/targeting/targetingMath.ts')
    const bd = await import('/pokeapp/src/modules/battle/battleData.ts')
    const unknown = []
    for (const g of ['ruby-sapphire', 'emerald', 'firered-leafgreen', 'diamond-pearl', 'platinum', 'heartgold-soulsilver']) {
      const data = await bd.loadBattleData(g)
      for (const [id, m] of Object.entries(data.moves)) if (!tm.isKnownTarget(m.tg)) unknown.push(`${g}:${id}:${m.tg}`)
    }
    const em = await bd.loadBattleData('emerald')
    const pt = await bd.loadBattleData('platinum')
    const t = (data, id) => tm.targetOf(bd.gameMove(data, id)?.tg)
    return {
      unknown,
      surf: [t(em, 57), t(pt, 57)],
      eq: [t(em, 89), t(pt, 89)],
      reflect: [t(em, 115), t(pt, 115), tm.hitClass(t(em, 115)) === tm.hitClass(t(pt, 115))],
      helpingHand: t(pt, 270),
      acupressure: t(pt, 367),
      outrage: t(pt, 200),
      spikes: t(em, 191),
    }
  })
  check('every target constant in the six Gen 3-4 games is mapped', tg.unknown.length === 0, tg.unknown.slice(0, 4).join(', '))
  check('Surf: both foes in Gen 3, both foes AND the ally from Gen 4', JSON.stringify(tg.surf) === '["both-foes","all-adjacent"]', JSON.stringify(tg.surf))
  check('Earthquake hits everyone adjacent in both', JSON.stringify(tg.eq) === '["all-adjacent","all-adjacent"]', JSON.stringify(tg.eq))
  check('Reflect moves from "itself" to "its side" without counting as a change', tg.reflect[0] === 'self' && tg.reflect[1] === 'user-side' && tg.reflect[2] === true, JSON.stringify(tg.reflect))
  check('Helping Hand targets the ally; Acupressure itself or the ally; Outrage a random foe; Spikes the foes\' side', tg.helpingHand === 'ally' && tg.acupressure === 'user-or-ally' && tg.outrage === 'random' && tg.spikes === 'foe-side', JSON.stringify(tg))

  await selectGeneration(page, 2)
  await openIndex(page)
  const tgGen2 = await page.$eval('[data-testid="tool-reason-12"]', (el) => el.textContent)
  check('on Gen 2 it is listed, disabled: doubles start in Gen 3', tgGen2.includes('Gen 3–4'), tgGen2)
  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-12"]')
  await page.click('[data-testid="tool-game-row-platinum"]').catch(() => {})
  await page.waitForSelector('[data-testid="tg-rows"]', { timeout: 60000 })
  await page.selectOption('[data-testid="tg-kind"]', 'changed')
  await page.waitForFunction(() => document.querySelector('[data-testid="tg-move-57"]'), null, { timeout: 30000 }).catch(() => {})
  const changed = await page.$$eval('[data-testid^="tg-move-"]', (els) => els.map((e) => Number(e.dataset.testid.replace('tg-move-', ''))))
  check('"Changed since Gen 3" lists Surf and not Reflect', changed.includes(57) && !changed.includes(115), `${changed.length} moves`)
  await page.screenshot({ path: shot('tool-12-targeting.png') })

  // ------------------------------------------------------------------ #13
  hr('#13 COMPARE POKEMON -- every field as of the generation; the stub graduated')
  const cmp = await page.evaluate(async () => {
    const cm = await import('/pokeapp/src/modules/tools/compare/compareMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (n) => d.listSpecies().find((s) => s.name === n)
    const row = (fields, key) => fields.find((f) => f.key === key)
    const g1 = cm.compareSpecies(1, [sp('magnemite'), sp('gengar')])
    const g2 = cm.compareSpecies(2, [sp('magnemite'), sp('gengar')])
    const g3 = cm.compareSpecies(3, [sp('magnemite'), sp('gengar')])
    return {
      g1types: row(g1, 'types').values,
      g2types: row(g2, 'types').values,
      g1special: Boolean(row(g1, 'stat-special')) && !row(g1, 'stat-special-attack'),
      g2split: Boolean(row(g2, 'stat-special-attack')) && !row(g2, 'stat-special'),
      abilities: [Boolean(row(g2, 'abilities')), Boolean(row(g3, 'abilities'))],
      eggs: [Boolean(row(g1, 'eggs')), Boolean(row(g2, 'eggs'))],
      best: [[...cm.bestOf([1, 3, 3])], [...cm.bestOf([2, 2])], [...cm.bestOf([5, null])]],
    }
  })
  check('Gen 1 Magnemite is Electric; from Gen 2 Electric / Steel', JSON.stringify(cmp.g1types) === '["Electric","Ghost / Poison"]' && cmp.g2types[0] === 'Electric / Steel', `${cmp.g1types} | ${cmp.g2types}`)
  check('Gen 1 shows one Special; Gen 2 splits it', cmp.g1special && cmp.g2split)
  check('abilities only from Gen 3; egg groups only from Gen 2', JSON.stringify(cmp.abilities) === '[false,true]' && JSON.stringify(cmp.eggs) === '[false,true]', JSON.stringify(cmp))
  check('the best number is marked, ties all marked, an all-equal row not at all', JSON.stringify(cmp.best) === '[[1,2],[],[]]', JSON.stringify(cmp.best))

  await selectGeneration(page, 4)
  await goToPage(page, 'tools', 'compare-pokemon')
  await page.waitForSelector('[data-testid="cmp-table"]', { timeout: 60000 })
  const cmpCols = await page.$$eval('[data-testid="cmp-table"] thead th[scope="col"]', (els) => els.length)
  check('the Tools dropdown\'s "Compare Pokemon" opens the tool (no placeholder)', cmpCols === 2 && (await page.$('[data-stub-id]')) === null, `${cmpCols} columns`)
  // Continue from the index: the dropdown keeps focus (and so stays open) after a click.
  await openIndex(page)
  await page.click('[data-testid="tool-link-13"]')
  await page.waitForSelector('[data-testid="cmp-table"]', { timeout: 60000 })
  await page.click('[data-testid="cmp-add"]')
  await page.selectOption('[data-testid="cmp-species-3"]', { index: 6 })
  const cmp3 = await page.$$eval('[data-testid="cmp-table"] thead th[scope="col"]', (els) => els.length)
  check('a third Pokémon adds a third column', cmp3 === 3, String(cmp3))
  const bestCells = await page.$$eval('[data-testid="cmp-table"] td[data-best]', (els) => els.map((e) => getComputedStyle(e).fontWeight))
  check('best values are set heavier, not coloured', bestCells.length > 0 && bestCells.every((w) => Number(w) >= 600), bestCells.slice(0, 3).join(','))
  await page.screenshot({ path: shot('tool-13-compare.png') })

  // ------------------------------------------------------------------ #14
  hr('#14 SIMILARITY FINDER -- a stated formula, as of the generation')
  const sim = await page.evaluate(async () => {
    const sm = await import('/pokeapp/src/modules/tools/similarity/similarityMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (n) => d.listSpecies().find((s) => s.name === n)
    const gen1 = d.listSpecies().filter((s) => s.id <= 151)
    const a = sm.profileOf(4, sp('garchomp'))
    const b = sm.profileOf(4, sp('salamence'))
    const ab = sm.similarity(a, b).parts
    const ba = sm.similarity(b, a).parts
    return {
      self: sm.similarity(a, a).score,
      symmetric: ['shape', 'defences', 'size'].every((k) => Math.abs(ab[k] - ba[k]) < 1e-12),
      nidoking: sm.mostSimilar(1, sp('nidoking'), gen1, 5).map((h) => h.speciesId),
      nidoqueen: sp('nidoqueen').id,
      gen1Stats: sm.profileOf(1, sp('mewtwo')).stats.length,
      gen2Stats: sm.profileOf(2, sp('mewtwo')).stats.length,
      magnemite: [1, 2].map((g) => sm.profileOf(g, sp('magnemite')).defence.join('')),
      excludesSelf: !sm.mostSimilar(1, sp('pikachu'), gen1).some((h) => h.speciesId === sp('pikachu').id),
    }
  })
  check('a Pokémon scores 100 against itself', Math.abs(sim.self - 100) < 1e-9, String(sim.self))
  check('stat shape, defences and size are symmetric', sim.symmetric)
  check('Gen 1 Nidoqueen is in Nidoking\'s top five', sim.nidoking.includes(sim.nidoqueen), sim.nidoking.join(','))
  check('Gen 1 compares five stats (one Special), Gen 2 six', sim.gen1Stats === 5 && sim.gen2Stats === 6, `${sim.gen1Stats}/${sim.gen2Stats}`)
  check('the generation changes the defensive profile (Magnemite gains Steel in Gen 2)', sim.magnemite[0] !== sim.magnemite[1], sim.magnemite.join(' | '))
  check('the target is never in its own list', sim.excludesSelf)

  await selectGeneration(page, 1)
  await openIndex(page)
  await page.click('[data-testid="tool-link-14"]')
  await page.waitForSelector('[data-testid="sim-rank-1"]', { timeout: 60000 })
  const simRows = await page.$$eval('[data-testid="sim-rows"] li', (els) => els.length)
  check('twenty matches, with the formula printed', simRows === 20 && (await page.$('[data-testid="sim-formula"]')) !== null, String(simRows))
  await page.selectOption('[data-testid="sim-species"]', String(34))
  await page.waitForFunction(() => document.querySelector('[data-testid="sim-rank-1"]')?.getAttribute('data-species') !== null)
  const simIds = await page.$$eval('[data-testid="sim-rows"] li', (els) => els.slice(0, 5).map((e) => Number(e.dataset.species)))
  check('picking Nidoking on the page lists Nidoqueen near the top', simIds.includes(sim.nidoqueen), simIds.join(','))
  const g1max = await page.$$eval('[data-testid="sim-rows"] li', (els) => Math.max(...els.map((e) => Number(e.dataset.species))))
  check('Gen 1 lists only Gen 1 species', g1max <= 151, String(g1max))
  await page.screenshot({ path: shot('tool-14-similarity.png') })

  // ------------------------------------------------------------------ #15
  hr('#15 TEAM THREAT FINDER -- members hit SE by a STAB type, on the generation\'s chart')
  const thr = await page.evaluate(async () => {
    const tm = await import('/pokeapp/src/modules/tools/threats/threatMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (n) => d.listSpecies().find((s) => s.name === n)
    const types = (g, n) => tm.typesOf(g, tm.varietyOf(sp(n)))
    const hit = (g, a, b) => tm.stabHit(g, types(g, a), types(g, b))
    const gen1 = d.listSpecies().filter((s) => s.id <= 151)
    const team = [{ speciesId: sp('pidgeot').id }, { speciesId: sp('gyarados').id }]
    const ranked = tm.teamThreats(1, team, gen1, d.getSpecies, 200)
    return {
      ghost: [hit(1, 'gengar', 'alakazam'), hit(2, 'gengar', 'alakazam')?.multiplier],
      bug: [hit(1, 'beedrill', 'venusaur')?.multiplier, hit(2, 'beedrill', 'venusaur')],
      electric: hit(1, 'magnemite', 'gyarados'),
      top: ranked.slice(0, 3).map((t) => `${t.speciesId}:${t.hits.length}:${t.bst}`),
      ordered: ranked.every((t, i) => i === 0 || ranked[i - 1].hits.length > t.hits.length || (ranked[i - 1].hits.length === t.hits.length && ranked[i - 1].bst >= t.bst)),
      allHit: ranked.every((t) => t.hits.length > 0),
      empty: tm.teamThreats(1, [], gen1, d.getSpecies).length,
    }
  })
  check('Gen 1 Ghost does nothing to Psychic; from Gen 2 it is super-effective', thr.ghost[0] === null && thr.ghost[1] === 2, JSON.stringify(thr.ghost))
  check('Gen 1 Bug is ×4 on Grass/Poison (Bug beat Poison); Gen 2 not a threat', thr.bug[0] === 4 && thr.bug[1] === null, JSON.stringify(thr.bug))
  check('Electric is ×4 on Water/Flying', thr.electric?.multiplier === 4, JSON.stringify(thr.electric))
  check('ranked by members hit, then base stat total', thr.ordered && thr.allHit, thr.top.join(' '))
  check('no team, no threats', thr.empty === 0)

  // A saved Gen 1 team loads into the slots.
  await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const facts = await import('/pokeapp/src/modules/team-builder/buildFacts.ts')
    const a = store.createBuild(facts.newBuildInit(1, 18))
    const b = store.createBuild(facts.newBuildInit(1, 130))
    store.createTeam(1, [a.id, b.id], { name: 'Threat test' })
  })
  await selectGeneration(page, 1)
  await openIndex(page)
  await page.click('[data-testid="tool-link-15"]')
  await page.waitForSelector('[data-testid="thr-member-1"]', { timeout: 60000 })
  const thrEmpty = await page.textContent('[data-testid="tool-reason"]').catch(() => null)
  check('with no members the result is a reason', /at least one team member/i.test(thrEmpty ?? ''), String(thrEmpty))
  const teamValue = await page.$eval('[data-testid="thr-team"] option:nth-child(2)', (o) => o.value)
  await page.selectOption('[data-testid="thr-team"]', teamValue)
  await page.waitForSelector('[data-testid="thr-rank-1"]', { timeout: 60000 })
  const loaded = await page.$$eval('[data-testid^="thr-member-"]', (els) => els.map((e) => e.value).filter(Boolean))
  check('a saved team fills the member slots', JSON.stringify(loaded) === '["18","130"]', JSON.stringify(loaded))
  const top = await page.$eval('[data-testid="thr-rank-1"]', (e) => ({ hits: e.dataset.hits, text: e.textContent }))
  check('the top threat hits both members, ×4 on Gyarados shown', top.hits === '2', top.text)
  const thrMax = await page.$$eval('[data-testid="thr-rows"] li', (els) => Math.max(...els.map((e) => Number(e.dataset.species))))
  check('Gen 1 lists only Gen 1 species', thrMax <= 151, String(thrMax))
  await page.screenshot({ path: shot('tool-15-threats.png') })

  // ------------------------------------------------------------------ #16
  hr('#16 BREEDING CHAIN -- father-only egg moves, shortest chains, one fixture per generation')
  const brd = await page.evaluate(async () => {
    const bm = await import('/pokeapp/src/modules/tools/breeding/breedingMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const sp = (n) => d.listSpecies().find((s) => s.name === n)
    const mv = (n) => d.listMoves().find((m) => m.name === n).id
    const pool = (g) => d.listSpecies().filter((s) => d.isSpeciesInGeneration(s.id, g))
    const rows = {}
    for (const g of ['crystal', 'emerald', 'platinum']) rows[g] = (await d.loadLearnsets(g)).rows
    const run = (game, gen, s, m) => bm.breedingChain(rows[game], pool(gen), sp(s).id, mv(m))
    const names = (ids) => ids.map((id) => d.getSpecies(id).name)
    const summary = (r) =>
      r.ok ? { steps: r.steps, via: r.chains.map((c) => names(c.via).join('>')), src: [...new Set(r.chains.flatMap((c) => names(c.sources.map((x) => x.speciesId))))] } : { reason: r.reason }
    const shares = (r, target) => r.chains.filter((c) => c.via.length === 0).every((c) => c.sources.every((x) => d.getSpecies(x.speciesId).egg_group_ids.some((g) => target.egg_group_ids.includes(g))))
    const larv = run('platinum', 4, 'larvitar', 'dragon-dance')
    return {
      g2: summary(run('crystal', 2, 'charmander', 'belly-drum')),
      g3: summary(run('emerald', 3, 'bagon', 'dragon-dance')),
      g4: summary(larv),
      g3share: shares(run('emerald', 3, 'bagon', 'dragon-dance'), sp('bagon')),
      larvViaShares: larv.ok && larv.chains.every((c) => d.getSpecies(c.via[0]).egg_group_ids.some((g) => sp('larvitar').egg_group_ids.includes(g)) || d.getSpecies(c.via[0]).evolution_chain_id != null),
      toto: [bm.eggMovesOf(rows.emerald, sp('totodile').id).has(mv('dragon-dance')), bm.eggMovesOf(rows.platinum, sp('totodile').id).has(mv('dragon-dance'))],
      tyrogue: run('platinum', 4, 'tyrogue', 'mach-punch'),
      pichu: run('platinum', 4, 'pichu', 'volt-tackle'),
      notEgg: run('platinum', 4, 'larvitar', 'tackle'),
    }
  })
  check('Gen 2 Crystal: Charmander gets Belly Drum straight from Snorlax', brd.g2.steps === 1 && brd.g2.src.includes('snorlax'), JSON.stringify(brd.g2))
  check('Gen 3 Emerald: Bagon gets Dragon Dance from Gyarados or Altaria, in one breeding', brd.g3.steps === 1 && brd.g3.src.includes('gyarados') && brd.g3.src.includes('altaria'), JSON.stringify(brd.g3).slice(0, 200))
  check('  every direct father shares an egg group with the mother', brd.g3share)
  check('Gen 4 Platinum: Larvitar needs a chain for Dragon Dance (via a male Charmander)', brd.g4.steps === 2 && brd.g4.via.includes('charmander'), JSON.stringify(brd.g4).slice(0, 200))
  check('the game changes the answer: Dragon Dance is a Totodile egg move in Platinum, not Emerald', JSON.stringify(brd.toto) === '[false,true]', JSON.stringify(brd.toto))
  check('a male-only line is a reason (Ditto passes nothing)', !brd.tyrogue.ok && /Ditto/.test(brd.tyrogue.reason), brd.tyrogue.reason)
  check('Volt Tackle is the Light Ball egg, no father', brd.pichu.ok && brd.pichu.lightBall, JSON.stringify(brd.pichu).slice(0, 120))
  check('a move that is not an egg move is a reason', !brd.notEgg.ok, brd.notEgg.reason)

  await selectGeneration(page, 4)
  await goToPage(page, 'tools', 'breeding-planner')
  await page.waitForSelector('[data-testid="brd-species"]', { timeout: 60000 })
  check('the Tools dropdown\'s "Breeding Planner" opens the tool (no placeholder)', (await page.$('[data-stub-id]')) === null)
  await page.click('[data-testid="tool-game-row-platinum"]').catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="brd-species"] option').length > 50, null, { timeout: 60000 })
  await page.selectOption('[data-testid="brd-species"]', { label: 'Larvitar' })
  await page.selectOption('[data-testid="brd-move"]', { label: 'Dragon Dance' })
  await page.waitForSelector('[data-testid="brd-result"]', { timeout: 60000 })
  const brdSteps = await page.$eval('[data-testid="brd-result"]', (e) => e.dataset.steps)
  check('on the page: Larvitar + Dragon Dance in Platinum is two breedings', brdSteps === '2', String(brdSteps))
  await page.screenshot({ path: shot('tool-16-breeding.png') })
  await selectGeneration(page, 1)
  await goToPage(page, 'tools', 'breeding-planner')
  const brdGen1 = await page.textContent('[data-testid="tool-reason"]').catch(() => null)
  check('Gen 1 has no breeding: the page says so', /Gen 2/.test(brdGen1 ?? ''), String(brdGen1))

  // ------------------------------------------------------------------ #17
  hr('#17 POKERUS -- each game\'s spread routine, solved exactly')
  const pkr = await page.evaluate(async () => {
    const pm = await import('/pokeapp/src/modules/tools/pokerus/pokerusMath.ts')
    const A = 'active', N = 'none', C = 'cured'
    const r = (x) => Math.round(x * 1e6) / 1e6
    return {
      rules: ['gold-silver', 'crystal', 'ruby-sapphire', 'emerald', 'firered-leafgreen', 'platinum', 'heartgold-soulsilver'].map(pm.rulesFor).join(','),
      g3one: r(pm.chancesAfter('gen34', [A, N], 1)[1]),
      g3pair: r(pm.settle('gen34', [A, N]).battles),
      g3six: r(pm.settle('gen34', [A, N, N, N, N, N]).battles),
      g3both: r(pm.settle('gen34', [N, A, N]).battles),
      g3cured: pm.settle('gen34', [A, C, N]),
      g2one: r(pm.chancesAfter('gen2', [A, N], 1)[1]),
      g2pair: r(pm.settle('gen2', [A, N]).battles),
      g2last: r(pm.settle('gen2', [N, A]).battles),
      g2d1: pm.settle('gen2', [A, N, N], 1).reached.join(','),
      g2d4: pm.settle('gen2', [A, N, N], 4).reached.join(','),
      frlg: pm.chancesAfter('none', [A, N], 50)[1],
    }
  })
  check('Gold/Silver/Crystal run the Gen 2 routine, FRLG none, the rest Gen 3-4', pkr.rules === 'gen2,gen2,gen34,gen34,none,gen34,gen34', pkr.rules)
  check('Gen 3-4: a neighbour catches it 1 battle in 3', pkr.g3one === 0.333333 && pkr.g3pair === 3, `${pkr.g3one} / ${pkr.g3pair}`)
  check('Gen 3-4: slot 1 to slot 6 takes five spreads, 15 battles on average', pkr.g3six === 15, String(pkr.g3six))
  check('Gen 3-4: one spread reaches both neighbours', pkr.g3both === 3, String(pkr.g3both))
  check('a cured member is a wall: slot 3 never catches it', JSON.stringify(pkr.g3cured.reached) === '["always","never","never"]' && pkr.g3cured.battles === 0, JSON.stringify(pkr.g3cured))
  check('Gen 2: one side per spread -- from slot 1, 1 battle in 6 (6 on average)', pkr.g2one === 0.166667 && pkr.g2pair === 6, `${pkr.g2one} / ${pkr.g2pair}`)
  check('Gen 2: the last member always spreads backward (3 on average)', pkr.g2last === 3, String(pkr.g2last))
  check('Gen 2: a 4-day strain stalls behind the first member it infects', pkr.g2d1 === 'always,always,always' && pkr.g2d4 === 'always,always,never', `${pkr.g2d1} | ${pkr.g2d4}`)
  check('FireRed/LeafGreen never spread it', pkr.frlg === 0, String(pkr.frlg))

  await selectGeneration(page, 3)
  await openIndex(page)
  await page.click('[data-testid="tool-link-17"]')
  await page.click('[data-testid="tool-game-row-emerald"]').catch(() => {})
  await page.waitForSelector('[data-testid="pkr-table"]', { timeout: 60000 })
  const pkrRow2 = await page.$eval('[data-testid="pkr-row-2"]', (e) => Number(e.dataset.chance))
  check('on the page: Emerald, slot 2 after 10 battles = 1 - (2/3)^10', Math.abs(pkrRow2 - (1 - (2 / 3) ** 10)) < 1e-9, String(pkrRow2))
  await page.screenshot({ path: shot('tool-17-pokerus.png') })
  await page.click('[data-testid="tool-game-row-firered-leafgreen"]')
  const pkrFrlg = await page.textContent('[data-testid="tool-reason"]').catch(() => null)
  check('FireRed/LeafGreen says why there is nothing to simulate', /FireRed and LeafGreen never/.test(pkrFrlg ?? ''), String(pkrFrlg))

  // ------------------------------------------------------------------ #19
  hr('#19 POKEBLOCKS AND POFFINS -- the Blender and the pot, hand-worked from the routines')
  const blk = await page.evaluate(async () => {
    const bm = await import('/pokeapp/src/modules/tools/blocks/blockMath.ts')
    const bf = await import('/pokeapp/src/data/berryFlavors.ts')
    const sm = (name, t) => t.find((r) => r[0] === name)
    return {
      // Cheri + Chesto, 0 RPM: dry 10 - 0 = 10, sour 0 - 10 < 0 (one negative), so dry 9; feel 50/2 - 2.
      pair: bm.blend([1, 2], 0),
      // Same at 100 RPM: factor 10000/333 + 100 = 130, so 9 * 130 / 10 = 117 -> 11.7 -> 12.
      fast: bm.blend([1, 2], 100).flavors,
      twice: bm.blend([1, 1], 50).color,
      // Figy (#11) takes the second table's set 0: Cheri, Pecha, Rawst.
      npcFigy: bm.opponentBerries(11, 4, 'npc'),
      npcCheri: bm.opponentBerries(1, 4, 'npc'),
      masterCheri: bm.opponentBerries(1, 2, 'master'),
      masterSpelon: bm.opponentBerries(31, 2, 'master'),
      // One Cheri, 60 s: spicy 10 - 1 (one negative) = 9; 40 s: 9 * 1.5 = 13.5 -> 14.
      cheri60: bm.cook(['cheri'], { seconds: 60, spills: 0, burns: 0, inStep: 0 }),
      cheri40: bm.cook(['cheri'], { seconds: 40, spills: 0, burns: 0, inStep: 0 }),
      cheriSpill: bm.cook(['cheri'], { seconds: 60, spills: 2, burns: 1, inStep: 0 }).level,
      dupe: bm.cook(['cheri', 'cheri'], { seconds: 60, spills: 0, burns: 0, inStep: 0 }),
      inStep: [0, 10, 25].map((s) => bm.cook(['spelon', 'pamtre'], { seconds: 60, spills: 0, burns: 0, inStep: s }).smoothness),
      spelon: [sm('spelon', bf.GEN3_BERRIES), sm('spelon', bf.GEN4_BERRIES)],
      enigmaOffered: bm.gen3Choices.some((b) => b.name === 'enigma'),
    }
  })
  check('Gen 3: Cheri + Chesto at 0 RPM is a Blue block, dry 9, feel 23', blk.pair.color === 'Blue' && JSON.stringify(blk.pair.flavors) === '[0,9,0,0,0]' && blk.pair.feel === 23 && blk.pair.level === 9, JSON.stringify(blk.pair))
  check('Gen 3: top speed multiplies (100 RPM: dry 9 -> 12)', JSON.stringify(blk.fast) === '[0,12,0,0,0]', JSON.stringify(blk.fast))
  check('Gen 3: the same berry twice is a Black block', blk.twice === 'Black', blk.twice)
  check('Gen 3: the computer players\' berries follow the game\'s table', JSON.stringify(blk.npcFigy) === '[1,3,4]' && JSON.stringify(blk.npcCheri) === '[5,4,3]', `${blk.npcFigy} | ${blk.npcCheri}`)
  check('Emerald: the Blend Master brings Spelon -- Tamato if you brought Spelon', JSON.stringify(blk.masterCheri) === '[31]' && JSON.stringify(blk.masterSpelon) === '[26]', `${blk.masterCheri} | ${blk.masterSpelon}`)
  check('Gen 4: one Cheri for 60 s is a Spicy Poffin, level 9, smoothness 24', blk.cheri60.type.kind === 'flavor' && blk.cheri60.type.main === 0 && blk.cheri60.level === 9 && blk.cheri60.smoothness === 24, JSON.stringify(blk.cheri60))
  check('Gen 4: a 40 s cook is 1.5x (9 -> 14, rounded half up)', blk.cheri40.level === 14, String(blk.cheri40.level))
  check('Gen 4: spills and burns come straight off (9 - 3 = 6)', blk.cheriSpill === 6, String(blk.cheriSpill))
  check('Gen 4: two cooks with the same berry make a Foul Poffin', blk.dupe.type.kind === 'Foul' && /same berry/.test(blk.dupe.foulBecause), JSON.stringify(blk.dupe))
  check('Gen 4: stirring in step takes off up to 10 smoothness', blk.inStep[0] - blk.inStep[1] === 10 && blk.inStep[1] === blk.inStep[2], JSON.stringify(blk.inStep))
  check('each generation reads its own berry table (Spelon smoothness 70 in Gen 3, 35 in Gen 4)', blk.spelon[0][2] === 70 && blk.spelon[1][2] === 35, JSON.stringify(blk.spelon))
  check('the e-Reader Enigma Berry is not offered in Gen 3', !blk.enigmaOffered)

  await selectGeneration(page, 3)
  await openIndex(page)
  await page.click('[data-testid="tool-link-19"]')
  await page.click('[data-testid="tool-game-row-emerald"]').catch(() => {})
  await page.waitForSelector('[data-testid="blk-result"]', { timeout: 60000 })
  const frlgOffered = await page.$('[data-testid="tool-game-row-firered-leafgreen"]')
  check('FireRed/LeafGreen are not offered (no Blender)', frlgOffered === null)
  const masterOpt = await page.$$eval('[data-testid="blk-mode"] option', (os) => os.map((o) => o.value))
  check('Emerald offers the Blend Master', masterOpt.includes('master'), masterOpt.join(','))
  await page.screenshot({ path: shot('tool-19-blender.png') })
  await page.click('[data-testid="tool-game-row-ruby-sapphire"]')
  await page.waitForSelector('[data-testid="blk-mode"]')
  const rsOpt = await page.$$eval('[data-testid="blk-mode"] option', (os) => os.map((o) => o.value))
  check('Ruby/Sapphire have no Blend Master', !rsOpt.includes('master'), rsOpt.join(','))
  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-19"]')
  await page.click('[data-testid="tool-game-row-platinum"]').catch(() => {})
  await page.waitForSelector('[data-testid="pof-result"]', { timeout: 60000 })
  const pofType = await page.$eval('[data-testid="pof-result"]', (e) => e.dataset.type)
  check('on the page: a Cheri Berry for 40 s is a Spicy Poffin', pofType === 'Spicy Poffin', String(pofType))
  const hgss = await page.$('[data-testid="tool-game-row-heartgold-soulsilver"]')
  check('HeartGold/SoulSilver are not offered (no Poffins)', hgss === null)
  await page.screenshot({ path: shot('tool-19-poffin.png') })

  // ------------------------------------------------------------------ #18
  hr('#18 CONTEST STATS PLAN -- Gen 3 nature acts one way per block; Gen 4 x1.1 / x0.9')
  const con = await page.evaluate(async () => {
    const cm = await import('/pokeapp/src/modules/tools/contest/contestMath.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const nat = (n) => { const x = d.listNatures().find((y) => y.name === n); return cm.tasteOf(x.likes_flavor, x.hates_flavor) }
    const ad = nat('adamant')
    const t = (flavors, feel = 0) => ({ flavors, feel })
    // Platinum's sFlavorPreferences (poffin_case/main.c): [liked, disliked] as flavour indexes.
    const PT = { adamant: [0, 1], bold: [4, 0], timid: [2, 0], modest: [1, 0], calm: [3, 0], hasty: [2, 4], lonely: [0, 4], careful: [3, 1] }
    return {
      tastes: Object.entries(PT).every(([n, [l, h]]) => { const x = nat(n); return x.liked === l && x.disliked === h }),
      neutral: ['hardy', 'docile', 'serious', 'bashful', 'quirky'].every((n) => nat(n).liked === null),
      g3liked: cm.gains('gen3', ad, t([20, 0, 0, 0, 0])),
      g3disliked: cm.gains('gen3', ad, t([0, 20, 0, 0, 0])),
      g3even: cm.gains('gen3', ad, t([20, 20, 0, 0, 0])),
      g3mixed: cm.gains('gen3', ad, t([15, 25, 0, 0, 0])),
      g4: cm.gains('gen4', ad, t([25, 25, 0, 0, 0])),
      hardy: cm.gains('gen4', nat('hardy'), t([25, 25, 0, 0, 0])),
      full: cm.feed('gen3', ad, { conditions: [0, 0, 0, 0, 0], sheen: 250 }, [{ treat: t([10, 0, 0, 0, 0], 20), count: 3 }]),
      cap: cm.feed('gen4', ad, { conditions: [250, 0, 0, 0, 0], sheen: 0 }, [{ treat: t([30, 0, 0, 0, 0], 10), count: 1 }]).final.conditions[0],
    }
  })
  check('nature likes and dislikes match Platinum\'s flavour table', con.tastes && con.neutral)
  check('Gen 3: a block it likes adds 10% to the liked flavour (20 -> 22)', JSON.stringify(con.g3liked) === '[22,0,0,0,0]', JSON.stringify(con.g3liked))
  check('Gen 3: a block it dislikes loses 10% of the disliked flavour (20 -> 18)', JSON.stringify(con.g3disliked) === '[0,18,0,0,0]', JSON.stringify(con.g3disliked))
  check('Gen 3: a block that scores even gets no nature effect at all', JSON.stringify(con.g3even) === '[20,20,0,0,0]', JSON.stringify(con.g3even))
  check('Gen 3: only the winning side moves (dry 25 -> 22, spicy 15 untouched)', JSON.stringify(con.g3mixed) === '[15,22,0,0,0]', JSON.stringify(con.g3mixed))
  check('Gen 4: liked x1.1 and disliked x0.9, rounded down, together', JSON.stringify(con.g4) === '[27,22,0,0,0]', JSON.stringify(con.g4))
  check('a neutral nature changes nothing', JSON.stringify(con.hardy) === '[25,25,0,0,0]', JSON.stringify(con.hardy))
  check('at 255 sheen it will not eat (one of three eaten from 250)', con.full.steps.length === 1 && con.full.refused === 2 && con.full.final.sheen === 255, JSON.stringify(con.full.final))
  check('a condition caps at 255', con.cap === 255, String(con.cap))

  // From #19 to #18 in one click: a Platinum Cheri Poffin (spicy 14, smoothness 24).
  await selectGeneration(page, 4)
  await openIndex(page)
  await page.click('[data-testid="tool-link-19"]')
  await page.click('[data-testid="tool-game-row-platinum"]').catch(() => {})
  await page.waitForSelector('[data-testid="blk-plan"]', { timeout: 60000 })
  await page.click('[data-testid="blk-plan"]')
  await page.waitForSelector('[data-testid="con-table"]', { timeout: 60000 })
  const handed = await page.$eval('[data-testid="con-row-1-f0"]', (e) => e.value)
  await page.selectOption('[data-testid="con-nature"]', { label: 'Adamant' })
  const cool = await page.$eval('[data-testid="con-final-cool"]', (e) => Number(e.dataset.value))
  const sheen = await page.$eval('[data-testid="con-final-sheen"]', (e) => Number(e.dataset.value))
  check('#19 hands its Poffin to the plan (spicy 14 arrives)', handed === '14', handed)
  check('on the page: ten of them on an Adamant = Cool 150 (14 x 1.1 = 15 each), sheen 240', cool === 150 && sheen === 240, `cool ${cool}, sheen ${sheen}`)
  await page.screenshot({ path: shot('tool-18-contest.png') })

  // Both themes photographed (MODULE-PATTERNS §9), on Gen 4 so nothing is greyed.
  await selectGeneration(page, 4)
  await openIndex(page)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.screenshot({ path: shot(`tools-index-${theme}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

  // ------------------------------------------------------------------ 3
  hr('3. PHONE WIDTH -- no sideways scroll on the index')
  await page.setViewportSize({ width: 390, height: 844 })
  await openIndex(page)
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  check('no sideways overflow at phone width', narrow.scroll <= narrow.client + 1, JSON.stringify(narrow))
  await page.setViewportSize({ width: 1440, height: 1000 })

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  if (browser) await browser.close()
  await dev.stop()
}

log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
