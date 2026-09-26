/**
 * Verification for the Gen 1-4 damage calculator (Calculators -> Damage).
 *
 * THE ENGINE IS CHECKED AGAINST THE REFERENCE IT PORTS, not against itself.
 * scripts/fixtures/damage-calc-reference.json holds 155 matchups -- every one of
 * the quirks the port has to get right (Gen 1 crits doubling the level, the >255
 * stat quartering, 39 rolls in Gen 1-2, Gen 2's Dragon Fang/Scale bug, Gen 3's
 * type-based category, Gen 4's per-move split, abilities, items, weather, screens,
 * hazards, multi-hit, forms) -- with the rolls and the full description line the
 * Showdown calculator (@smogon/calc, commit recorded in the file) produced for
 * each. The suite runs the REAL engine against the REAL bundle in a browser, the
 * verify-legal-moveset way, and diffs every roll and every character.
 *
 * Five of those were also run on the LIVE calc at calc.pokemonshowdown.com (its own
 * `window.calc`, 2026-09-26) and are cited below with the exact line it printed.
 *
 * Then the screen: every generation's field gates, the move picker's learnset
 * default and Any switch, swap, the EV cap, the calculator's own generation not
 * moving the app's, no box-shadow, no console errors, both themes photographed.
 *
 * Usage: node scripts/verify-damage-calc.mjs
 */

import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'

const PORT = 4186
const SHOTS = new URL('./.verify-shots/', import.meta.url)
const fixture = JSON.parse(readFileSync(new URL('./fixtures/damage-calc-reference.json', import.meta.url), 'utf8'))

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/**
 * Cited live checks: run on calc.pokemonshowdown.com, 2026-09-26, through the
 * page's own `window.calc` with the inputs shown (unlisted spreads are the calc's
 * defaults: level 100; Gen 1-2 max DVs and Stat Exp; Gen 3-4 31 IVs, 0 EVs,
 * Serious nature, first ability).
 */
const LIVE = [
  {
    case: { gen: 1, attacker: { species: 'tauros' }, defender: { species: 'chansey' }, move: 'body-slam' },
    text: 'Tauros Body Slam vs. Chansey: 251-295 (35.7 - 41.9%) -- guaranteed 3HKO',
  },
  {
    case: { gen: 2, attacker: { species: 'marowak', item: 'thick-club' }, defender: { species: 'tyranitar' }, move: 'earthquake' },
    text: 'Thick Club Marowak Earthquake vs. Tyranitar: 354-416 (87.8 - 103.2%) -- 20.5% chance to OHKO',
  },
  {
    case: {
      gen: 3,
      attacker: { species: 'salamence', item: 'choice-band', nature: 'adamant', evs: { atk: 252 } },
      defender: { species: 'skarmory', nature: 'impish', evs: { hp: 252, def: 252 } },
      move: 'double-edge',
    },
    text: '252+ Atk Choice Band Salamence Double-Edge vs. 252 HP / 252+ Def Skarmory: 62-74 (18.5 - 22.1%) -- possible 5HKO',
  },
  {
    case: {
      gen: 4,
      attacker: { species: 'garchomp', item: 'choice-band', nature: 'adamant', evs: { atk: 252 } },
      defender: { species: 'heatran', evs: { hp: 252 } },
      move: 'earthquake',
    },
    text: '252+ Atk Choice Band Garchomp Earthquake vs. 252 HP / 0 Def Heatran: 1024-1212 (265.2 - 313.9%) -- guaranteed OHKO',
  },
  {
    case: {
      gen: 4,
      attacker: { species: 'starmie', evs: { spa: 252 } },
      defender: { species: 'tyranitar', evs: { hp: 252, spd: 252 } },
      move: 'surf',
      field: { weather: 'sand' },
    },
    text: '252 SpA Starmie Surf vs. 252 HP / 252 SpD Tyranitar in Sand: 138-164 (34.1 - 40.5%) -- guaranteed 3HKO',
  },
]

/** Runs a list of fixture-shaped cases through the real engine, in the page. */
async function runCases(page, cases) {
  return page.evaluate(async (cases) => {
    const data = await import('/pokeapp/src/data/index.ts')
    await data.initDataLayer()
    const eng = await import('/pokeapp/src/modules/calculators/damage/index.ts')
    const sp = (slug) =>
      data.listSpecies().find((s) => s.name === slug) ??
      data.listSpecies().find((s) => s.varieties.some((v) => v.name === slug))
    const bySlug = (list, slug) => (slug ? (list.find((x) => x.name === slug) ?? null) : null)
    const stat = { hp: 'hp', atk: 'attack', def: 'defense', spa: 'special-attack', spd: 'special-defense', spe: 'speed' }
    const mk = (c, p) => {
      const species = sp(p.species)
      const variety =
        species.varieties.find((v) => v.name === p.species) ?? species.varieties.find((v) => v.is_default)
      const effort = {}
      const individual = {}
      if (c.gen >= 3) {
        for (const [k, v] of Object.entries(p.evs ?? {})) effort[stat[k]] = v
        for (const k of Object.values(stat)) individual[k] = 31
        for (const [k, v] of Object.entries(p.ivs ?? {})) individual[stat[k]] = v
      } else {
        for (const k of ['hp', 'attack', 'defense', 'special', 'speed']) effort[k] = p.statexp0 ? 0 : 65535
        for (const k of ['attack', 'defense', 'special', 'speed']) individual[k] = 15
        const m = { atk: 'attack', def: 'defense', spa: 'special', spe: 'speed' }
        for (const [k, v] of Object.entries(p.dvs ?? {})) if (m[k]) individual[m[k]] = v
      }
      return {
        species,
        variety,
        level: p.level ?? 100,
        individual,
        effort,
        nature: bySlug(data.listNatures(), p.nature),
        // The reference gives an unset ability the species' first; so does the calculator's form.
        ability: p.ability
          ? bySlug(data.listAbilities(), p.ability)
          : (data.resolveAbilitiesForGeneration(variety, c.gen)[0]?.ability ?? null),
        abilityOn: !!p.abilityOn,
        item: bySlug(data.listItems(), p.item),
        status: p.status ?? 'healthy',
        boosts: { ...(p.boosts ?? {}) },
        currentHp: null,
        gender: p.gender ?? 'N',
        pct: p.curHPpct,
      }
    }
    return cases.map((c) => {
      try {
        const a = mk(c, c.attacker)
        const d = mk(c, c.defender)
        for (const p of [a, d]) {
          if (p.pct != null) p.currentHp = Math.floor((eng.computeRawStats(p, c.gen).hp * p.pct) / 100)
        }
        const f = c.field ?? {}
        const field = eng.emptyField()
        field.weather = f.weather ?? null
        field.gravity = !!f.gravity
        Object.assign(field.defenderSide, {
          reflect: !!f.reflect,
          lightScreen: !!f.lightScreen,
          spikes: f.spikes ?? 0,
          stealthRock: !!f.stealthRock,
          foresight: !!f.foresight,
          switchingOut: !!f.switchingOut,
        })
        field.attackerSide.charge = !!f.charge
        const move = data.listMoves().find((m) => m.name === c.move)
        const r = eng.calculateDamage(c.gen, a, d, { move, isCrit: !!c.crit, hits: c.hits ?? null, powerOverride: null }, field)
        return { damage: r.damage, text: r.fullText, range: r.range, reason: r.noDamageReason }
      } catch (e) {
        return { error: String(e?.stack ?? e) }
      }
    })
  }, cases)
}

const shot = (name) => fileURLToPath(new URL(name, SHOTS))
mkdirSync(SHOTS, { recursive: true })
const dev = await startDevServer({ port: PORT })
let browser
const consoleErrors = []
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 2400 } })
  context.setDefaultNavigationTimeout(180000)
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })

  // ------------------------------------------------------------------ 1
  hr('1. ENGINE vs THE REFERENCE -- every roll and every character, 155 matchups')
  const ours = await runCases(page, fixture.cases)
  let identical = 0
  fixture.cases.forEach((c, i) => {
    const got = ours[i]
    if (got.error) return check(`[G${c.gen}] ${c.label}`, false, got.error.split('\n')[0])
    if (c.deviation) return // section 2
    const sameDamage = JSON.stringify(got.damage) === JSON.stringify(c.expect.damage)
    const sameText = c.expect.text == null || got.text === c.expect.text
    if (sameDamage && sameText) identical++
    else {
      check(`[G${c.gen}] ${c.label}`, false)
      log(`        ref : ${c.expect.text}\n        ours: ${got.text}`)
      if (!sameDamage) log(`        refD ${JSON.stringify(c.expect.damage).slice(0, 160)}\n        ourD ${JSON.stringify(got.damage).slice(0, 160)}`)
    }
  })
  const compared = fixture.cases.filter((c) => !c.deviation).length
  check(`all ${compared} reference matchups identical (rolls + description + KO text)`, identical === compared, `${identical}/${compared}`)
  for (const g of [1, 2, 3, 4]) {
    const n = fixture.cases.filter((c) => c.gen === g && !c.deviation).length
    check(`Gen ${g} is covered by the fixture`, n >= 20, `${n} matchups`)
  }
  const zeroText = fixture.cases.filter((c) => c.expect && c.expect.text == null)
  zeroText.forEach((c) => {
    const got = ours[fixture.cases.indexOf(c)]
    check(`[G${c.gen}] ${c.label}: prints a 0-0 line where the reference throws`, got.range?.[1] === 0 && / 0-0 \(0 - 0%\)$/.test(got.text), got.text)
  })

  // ------------------------------------------------------------------ 2
  hr('2. HAND-CHECKED -- the arithmetic written out, not taken on trust')
  /*
    Gen 1, Tauros Body Slam vs Chansey, both L100, max DVs and Stat Exp.
      Tauros Atk  = ((100 + 15) * 2 + 63) + 5 = 298     (63 = floor(min(255, ceil(sqrt(65535))) / 4))
      Chansey Def = ((  5 + 15) * 2 + 63) + 5 = 108
      298 > 255, so BOTH are quartered: at = 74, df = 27      <- the Game Boy's one-byte division
      base = floor(floor(42 * 74 * 85 / 27) / 50) = floor(9784 / 50) = 195;  +2 = 197
      STAB: floor(197 * 1.5) = 295
      rolls: floor(295 * r / 255), r = 217..255  ->  251 .. 295, thirty-nine of them
    Without the quartering it would be 253-298, which is the bug a "Gen 2 formula"
    port produces here.
  */
  const tauros = ours[fixture.cases.findIndex((c) => c.label === 'G1 Tauros Body Slam vs Chansey')]
  check('Gen 1 Tauros/Chansey: 251-295 by hand, the >255 quartering applied', tauros.range[0] === 251 && tauros.range[1] === 295, `${tauros.range}`)
  check('Gen 1-2 roll 39 values (217..255)', Array.isArray(tauros.damage) && tauros.damage.length === 39)
  const g4 = ours[fixture.cases.findIndex((c) => c.label === 'G4 Garchomp CB EQ vs Heatran')]
  check('Gen 3-4 roll 16 values (85..100)', Array.isArray(g4.damage) && g4.damage.length === 16)

  /*
    The one deliberate deviation: Gen 4 Triple Kick. The reference's gen4.ts calls
    calculateBasePowerDPP without the hit index, so all three hits come out at 10 BP;
    its own gen3.ts passes it. The games (and Gen 3 in the reference) hit 10/20/30.
    Hit 1 below equals the reference's 10 BP rolls exactly; hits 2 and 3 are the
    20 and 30 BP rolls.
  */
  const tkIndex = fixture.cases.findIndex((c) => c.deviation)
  const tk = ours[tkIndex]
  check(
    'Gen 4 Triple Kick hits 10/20/30, not 10/10/10 (reference bug, documented)',
    Array.isArray(tk.damage?.[0]) &&
      JSON.stringify(tk.damage[0]) === JSON.stringify([40, 40, 40, 40, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 52]) &&
      tk.damage[1][0] > tk.damage[0][0] &&
      tk.damage[2][0] > tk.damage[1][0] &&
      tk.range[0] === 236 && tk.range[1] === 292,
    `${tk.range}`,
  )

  // ------------------------------------------------------------------ 3
  hr('3. LIVE CALC -- calc.pokemonshowdown.com, 2026-09-26, lines quoted verbatim')
  const live = await runCases(page, LIVE.map((l) => l.case))
  LIVE.forEach((l, i) => check(`[G${l.case.gen}] ${l.text.slice(0, 60)}...`, live[i].text === l.text, live[i].text === l.text ? '' : `ours: ${live[i].text}`))

  // ------------------------------------------------------------------ 4
  hr('4. DATA THE ENGINE LEANS ON')
  const facts = await page.evaluate(async () => {
    const data = await import('/pokeapp/src/data/index.ts')
    const era = await import('/pokeapp/src/data/moveEra.ts')
    const stat = await import('/pokeapp/src/modules/team-builder/statMath.ts')
    const eng = await import('/pokeapp/src/modules/calculators/damage/index.ts')
    const itemNames = new Set(data.listItems().map((i) => i.name))
    const move = (n) => data.listMoves().find((m) => m.name === n)
    return {
      missingItems: eng.ITEM_SLUGS_REFERENCED.filter((s) => !itemNames.has(s)),
      referenced: eng.ITEM_SLUGS_REFERENCED.length,
      mewtwoSpecial: stat.computeStat({ generation: 1, level: 100, base: 154, key: 'special', effort: { special: 65535 }, individual: { special: 15 }, nature: { increased: null, decreased: null } }),
      bonusMax: stat.statExpBonus(65535),
      shedinja: stat.computeStat({ generation: 3, level: 100, base: 1, key: 'hp', effort: { hp: 252 }, individual: { hp: 31 }, nature: { increased: null, decreased: null } }),
      dig: [1, 2, 3, 4].map((g) => era.resolveMovePowerForGeneration(move('dig'), g)),
      lowKick: [1, 2, 3].map((g) => era.resolveMovePowerForGeneration(move('low-kick'), g)),
      tackle: era.resolveMovePowerForGeneration(move('tackle'), 4),
    }
  })
  check('every item slug the engine names exists in the bundle', facts.missingItems.length === 0, `${facts.referenced} slugs; missing: ${facts.missingItems.join(',') || 'none'}`)
  check('Stat Exp bonus caps at 63 (pret CalcStat: sqrt counted to $ff)', facts.bonusMax === 63, String(facts.bonusMax))
  check('Gen 1 Mewtwo max Special is 406, not 407', facts.mewtwoSpecial === 406, String(facts.mewtwoSpecial))
  check('Shedinja HP is 1 at any spread', facts.shedinja === 1, String(facts.shedinja))
  check('Dig power by era: 100 / 60 / 60 / 80', JSON.stringify(facts.dig) === '[100,60,60,80]', JSON.stringify(facts.dig))
  check('Low Kick is 50 in Gen 1-2, weight-based (null) from Gen 3', JSON.stringify(facts.lowKick) === '[50,50,null]', JSON.stringify(facts.lowKick))
  check('Tackle is 35 in Gen 4', facts.tackle === 35, String(facts.tackle))

  // ------------------------------------------------------------------ 5
  hr('5. THE SCREEN')
  await page.selectOption('[data-testid="vg-select"]', { index: 1 }).catch(() => {})
  const appSelection = await page.inputValue('[data-testid="vg-select"]').catch(() => null)
  await page.evaluate(() => document.querySelector('[data-testid="nav-calculators"]').click())
  await page.waitForSelector('[data-testid="calc-damage"]', { timeout: 60000 })
  const settle = () =>
    page.waitForFunction(() => !document.querySelector('[data-testid$="learnset-loading"]'), null, { timeout: 60000 })
  await settle()

  const gate = async () =>
    page.evaluate(() => {
      const q = (s) => document.querySelector(s)
      const has = (s) => q(s) != null
      const weather = [...(q('[data-testid="dcalc-weather"]')?.options ?? [])].map((o) => o.value)
      return {
        item: has('[data-testid="dcalc-attacker-item"]'),
        ability: has('[data-testid="dcalc-attacker-ability"]'),
        nature: has('[data-testid="dcalc-attacker-nature"]'),
        rows: document.querySelectorAll('[data-testid="dcalc-attacker-spread"] [data-ds="ev-stat-row"]').length,
        sliders: document.querySelectorAll('[data-testid="dcalc-attacker-spread"] .ds-range').length,
        hpDvEditable: q('[data-testid="dcalc-attacker-iv-hp"]')?.tagName === 'INPUT',
        weather,
        spikes: [...(q('[data-testid="dcalc-spikes"]')?.options ?? [])].length,
        toggles: [...document.querySelectorAll('[data-testid="dcalc-field-toggles"] [data-ds="toggle"]')].map((t) => t.textContent.trim()),
        stages: document.querySelectorAll('[data-testid^="dcalc-attacker-stage-"]').length,
        desc: q('[data-testid="calc-damage-desc"]')?.textContent ?? '',
      }
    })

  const expectGate = {
    1: { item: false, ability: false, nature: false, rows: 5, sliders: 0, weather: [], spikes: 0, toggles: ['Reflect', 'Light Screen'], stages: 4 },
    2: { item: true, ability: false, nature: false, rows: 6, sliders: 0, weather: ['', 'sun', 'rain', 'sand'], spikes: 2, toggles: ['Reflect', 'Light Screen', 'Foresight', 'Defender switching out'], stages: 5 },
    3: { item: true, ability: true, nature: true, rows: 6, sliders: 6, weather: ['', 'sun', 'rain', 'sand', 'hail'], spikes: 4, toggles: ['Reflect', 'Light Screen', 'Foresight', 'Defender switching out', 'Attacker charged'], stages: 5 },
    4: { item: true, ability: true, nature: true, rows: 6, sliders: 6, weather: ['', 'sun', 'rain', 'sand', 'hail'], spikes: 4, toggles: ['Reflect', 'Light Screen', 'Stealth Rock', 'Foresight', 'Defender switching out', 'Attacker charged', 'Gravity'], stages: 5 },
  }
  for (const g of [1, 2, 3, 4]) {
    await page.selectOption('[data-testid="dcalc-generation"]', String(g))
    await settle()
    const got = await gate()
    const exp = expectGate[g]
    for (const k of Object.keys(exp)) {
      check(`Gen ${g}: ${k}`, JSON.stringify(got[k]) === JSON.stringify(exp[k]), JSON.stringify(got[k]))
    }
    check(`Gen ${g}: HP DV/IV ${g <= 2 ? 'derived, read-only' : 'editable'}`, got.hpDvEditable === g >= 3)
    check(`Gen ${g}: a result renders`, /Charizard .* vs\. .*Blastoise/.test(got.desc), got.desc)
    await page.screenshot({ path: shot(`damage-gen${g}-light.png`), fullPage: false })
  }

  check(
    "the calculator's generation does not move the app's",
    appSelection == null || (await page.inputValue('[data-testid="vg-select"]')) === appSelection,
    String(appSelection),
  )

  // The screen's result must be the engine's result for the same inputs.
  const screenDesc = await page.textContent('[data-testid="calc-damage-desc"]')
  const moveName = await page.evaluate(() => {
    const sel = document.querySelector('[data-testid="dcalc-attacker-move-0"]')
    return sel.options[sel.selectedIndex].value
  })
  const engineDesc = await page.evaluate(async (moveId) => {
    const data = await import('/pokeapp/src/data/index.ts')
    const eng = await import('/pokeapp/src/modules/calculators/damage/index.ts')
    const st = await import('/pokeapp/src/modules/calculators/damageCalcState.ts')
    const r = eng.calculateDamage(4, st.toCalcPokemon(st.newSide(6, 4)), st.toCalcPokemon(st.newSide(9, 4)), { move: data.getMove(Number(moveId)), isCrit: false, hits: null, powerOverride: null }, eng.emptyField())
    return r.fullText
  }, moveName)
  check('the screen prints exactly what the engine returns', screenDesc === engineDesc, screenDesc)

  // Learnable by default; Any widens the list.
  const count = () => page.evaluate(() => document.querySelector('[data-testid="dcalc-attacker-move-1"]').options.length)
  const learnable = await count()
  await page.click('[data-testid="toggle-dcalc-attacker-any-move"]')
  const any = await count()
  check('moves default to the learnset; Any offers more', learnable > 10 && any > learnable, `${learnable} -> ${any}`)
  await page.click('[data-testid="toggle-dcalc-attacker-any-move"]')

  // Selecting a slot changes the result shown.
  const before = await page.textContent('[data-testid="calc-damage-desc"]')
  await page.click('[data-testid="dcalc-attacker-slot-2"] .ds-move-slot-label')
  const after = await page.textContent('[data-testid="calc-damage-desc"]')
  check('selecting a move tile opens that move in full', before !== after && (await page.getAttribute('[data-testid="dcalc-attacker-slot-2"]', 'data-selected')) === 'true')

  // Species search.
  await page.click('[data-testid="dcalc-defender-species-input"]')
  await page.fill('[data-testid="dcalc-defender-species-input"]', 'blissey')
  await page.keyboard.press('Enter')
  await settle()
  check('the species picker searches and commits', /vs\. .*Blissey/.test(await page.textContent('[data-testid="calc-damage-desc"]')))

  // Found by hand-testing the deployed preview, 2026-09-26 -- each was a real bug.
  // (a) An exact name wins over earlier substring matches: "Mew" once picked Mewtwo.
  await page.click('[data-testid="dcalc-defender-species-input"]')
  await page.fill('[data-testid="dcalc-defender-species-input"]', 'Mew')
  await page.keyboard.press('Enter')
  check('"Mew" + Enter picks Mew, not Mewtwo', (await page.inputValue('[data-testid="dcalc-defender-species-input"]')) === 'Mew')
  // (b) A number field can be emptied mid-edit: clearing Level used to snap it to 1,
  //     so typing "50" gave "150" -> 100; clearing an EV left "0252".
  const typeInto = async (sel, keys) => {
    await page.click(sel)
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(keys)
    return page.inputValue(sel)
  }
  check('clear Level, type 50 -> 50', (await typeInto('[data-testid="dcalc-attacker-level"]', '50')) === '50')
  check('clear an EV, type 252 -> "252" (no leading zero)', (await typeInto('[data-testid="dcalc-attacker-ev-atk"]', '252')) === '252')
  await typeInto('[data-testid="dcalc-attacker-level"]', '100')
  await typeInto('[data-testid="dcalc-attacker-ev-atk"]', '0')
  // (c) A round trip through an older era gives back what it took away.
  await page.click('[data-testid="dcalc-attacker-item-input"]')
  await page.fill('[data-testid="dcalc-attacker-item-input"]', 'Choice Band')
  await page.keyboard.press('Enter')
  await typeInto('[data-testid="dcalc-attacker-ev-atk"]', '252')
  const roundTrip = await page.textContent('[data-testid="calc-damage-desc"]')
  for (const g of ['2', '1', '4']) {
    await page.selectOption('[data-testid="dcalc-generation"]', g)
    await settle()
  }
  check(
    'Gen 4 -> 2 -> 1 -> 4 restores the EVs and the Choice Band',
    (await page.textContent('[data-testid="calc-damage-desc"]')) === roundTrip && /252 Atk Choice Band/.test(roundTrip),
    roundTrip,
  )
  await page.click('[data-testid="dcalc-defender-species-input"]')
  await page.fill('[data-testid="dcalc-defender-species-input"]', 'Blissey')
  await page.keyboard.press('Enter')
  await settle()

  // Swap sides.
  await page.click('[data-testid="dcalc-swap"]')
  await settle()
  check('Swap sides puts Blissey on the attacking side', /Blissey .* vs\. .*Charizard/.test(await page.textContent('[data-testid="calc-damage-desc"]')))

  // EV budget: four stats at 252 cannot exceed 510.
  for (const s of ['hp', 'atk', 'def', 'spa']) await page.fill(`[data-testid="dcalc-attacker-ev-${s}"]`, '252')
  const evTotal = await page.textContent('[data-testid="dcalc-attacker-ev-total"]')
  check('the EV total is capped at 510, clamping the field being edited', evTotal.trim().startsWith('510'), evTotal)

  // Design-system rules on this screen.
  const ds = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="calc-damage"]')
    const all = [root, ...root.querySelectorAll('*')]
    return {
      shadows: all.filter((el) => getComputedStyle(el).boxShadow !== 'none').length,
      titleCase: getComputedStyle(root.querySelector('.dcalc-panel-title')).textTransform,
      selectedBg: getComputedStyle(root.querySelector('.ds-move-slot[data-selected="true"]')).backgroundColor,
      raised: getComputedStyle(document.body).getPropertyValue('--surface-raised').trim(),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  check('no box-shadow anywhere in the calculator', ds.shadows === 0, `${ds.shadows} elements`)
  check('panel titles are not uppercased by `.panel h2`', ds.titleCase === 'none', ds.titleCase)
  check('the selected tile is a tone-step, not a colour', ds.selectedBg !== 'rgba(0, 0, 0, 0)')

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: shot('damage-dark.png') })
  await page.setViewportSize({ width: 390, height: 3000 })
  await page.waitForTimeout(300)
  const narrow = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="calc-damage"]')
    return { scroll: el.scrollWidth, client: el.clientWidth }
  })
  check('no sideways overflow at phone width', narrow.scroll <= narrow.client + 1, JSON.stringify(narrow))
  await page.screenshot({ path: shot('damage-phone-dark.png') })

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
