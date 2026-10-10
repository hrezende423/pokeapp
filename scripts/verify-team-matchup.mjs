/**
 * Verification for Team Matchup (Tools -> Team Matchup) and the engine under it
 * (src/modules/battle).
 *
 * CHECKED AGAINST REFERENCES, NOT AGAINST ITSELF:
 *   1. The damage numbers, through the MATCHUP'S OWN PIPELINE (BattlerSpec ->
 *      corners -> engine -> distribution, and the turn engine's battle state),
 *      diffed roll for roll against the Showdown reference fixture the Damage
 *      Calculator is verified with -- per generation one critical hit, one
 *      multi-hit move and one weather case (Gen 1 has no weather) -- plus a KO
 *      chance re-derived by hand from the rolls.
 *   2. The chance constants against the disassemblies they were transcribed
 *      from (the asm is quoted beside each check), and one speed tie per
 *      generation.
 *   3. The AI per generation against behaviour the disassembly's routines
 *      document, the send-out logic, item use, and the low-confidence flags.
 *   4. The battle-data bundle's move table against the app's own records.
 *   5. A real fight per generation driven through the screen: Lance (Red/Blue),
 *      Champion Lance (Crystal), Wallace (Emerald), Cynthia (Platinum).
 *   6. Spreads (S7a-f), scenarios, format, custom teams, facility pools, the
 *      Damage Calculator hand-off, the what-if level, the sandbox.
 *   7. The background analyses: Monte Carlo per generation, search, gauntlet,
 *      batch scan, suggestions.
 *   8. Design rules: no shadow, no fill on verdicts, both themes photographed,
 *      the matchup's game independent of the app's, no console errors.
 *
 * Usage: node scripts/verify-team-matchup.mjs
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { appGeneration } from './lib/controls.mjs'
import { seedTeams } from './lib/matchupFixtures.mjs'

const PORT = 4202
const SHOTS = new URL('./.verify-shots/', import.meta.url)
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/damage-calc-reference.json', import.meta.url), 'utf8'),
)

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const shot = (name) => fileURLToPath(new URL(name, SHOTS))

/** Per generation: the reference cases each kind of check runs on. */
const REF = {
  1: {
    crit: 'G1 Persian Slash crit vs Starmie',
    multi: 'G1 Nidoking Double Kick vs Snorlax',
    weather: null,
    plain: 'G1 Tauros Body Slam vs Chansey',
  },
  2: {
    crit: 'G2 Heracross Megahorn crit vs Umbreon',
    multi: 'G2 Triple Kick',
    weather: 'G2 Zapdos Thunder vs Gyarados in Rain',
    plain: 'G2 Marowak Thick Club Earthquake vs Tyranitar',
  },
  3: {
    crit: 'G3 Crit through Reflect',
    multi: 'G3 Icicle Spear 4 hits',
    weather: 'G3 Kyogre Water Spout rain 50% vs Groudon',
    plain: null,
  },
  4: {
    crit: 'G4 Sniper crit',
    multi: 'G4 Rock Blast default hits',
    weather: 'G4 Starmie Surf vs Tyranitar in Sand',
    plain: null,
  },
}
const GAME = { 1: 'red-blue', 2: 'crystal', 3: 'emerald', 4: 'platinum' }

mkdirSync(SHOTS, { recursive: true })
const dev = await startDevServer({ port: PORT })
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const consoleErrors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(240000)
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]')

  // ------------------------------------------------------------------ 1
  hr('1. DAMAGE THROUGH THE MATCHUP PIPELINE vs THE SHOWDOWN REFERENCE')
  const cases = Object.values(REF)
    .flatMap((r) => Object.values(r).filter(Boolean))
    .map((label) => fixture.cases.find((c) => c.label === label))
  check(
    'every chosen reference case exists in the fixture',
    cases.every(Boolean),
    cases.filter((c) => !c).length ? 'missing' : `${cases.length} cases`,
  )
  const ref = await page.evaluate(async (cases) => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const G = await import('/pokeapp/src/modules/battle/game.ts')
    const BD = await import('/pokeapp/src/modules/battle/battleData.ts')
    const DMG = await import('/pokeapp/src/modules/battle/damage.ts')
    const SES = await import('/pokeapp/src/modules/battle/session.ts')
    const TURN = await import('/pokeapp/src/modules/battle/engine/turn.ts')
    const B = await import('/pokeapp/src/modules/battle/battler.ts')
    const R = await import('/pokeapp/src/modules/battle/range.ts')
    const games = { 1: 'red-blue', 2: 'crystal', 3: 'emerald', 4: 'platinum' }
    const stat = {
      hp: 'hp',
      atk: 'attack',
      def: 'defense',
      spa: 'special-attack',
      spd: 'special-defense',
      spe: 'speed',
    }
    const byName = (list, n) => (n ? (list.find((x) => x.name === n) ?? null) : null)
    // The reference's defaults: level 100; Gen 1-2 max DVs and Stat Exp; Gen 3-4 31 IVs, 0 EVs, a neutral nature, the first ability.
    const spec = (c, p, side) => {
      const s =
        D.listSpecies().find((x) => x.name === p.species) ??
        D.listSpecies().find((x) => x.varieties.some((v) => v.name === p.species))
      const v =
        s.varieties.find((x) => x.name === p.species) ?? s.varieties.find((x) => x.is_default)
      const individual = {}
      const effort = {}
      if (c.gen >= 3) {
        for (const k of Object.values(stat)) individual[k] = R.point(31)
        for (const [k, val] of Object.entries(p.ivs ?? {})) individual[stat[k]] = R.point(val)
        for (const k of Object.values(stat)) effort[k] = R.point(0)
        for (const [k, val] of Object.entries(p.evs ?? {})) effort[stat[k]] = R.point(val)
      } else {
        for (const k of ['attack', 'defense', 'speed', 'special']) individual[k] = R.point(15)
        for (const k of ['hp', 'attack', 'defense', 'speed', 'special'])
          effort[k] = R.point(p.statexp0 ? 0 : 65535)
      }
      const nature = byName(D.listNatures(), p.nature) ?? byName(D.listNatures(), 'serious')
      const ability = p.ability
        ? byName(D.listAbilities(), p.ability)?.id
        : (D.resolveAbilitiesForGeneration(v, c.gen)[0]?.ability.id ?? null)
      return {
        key: `${side}:0`,
        side,
        source: 'custom',
        label: s.display_name,
        speciesId: s.id,
        varietyName: v.name,
        level: p.level ?? 100,
        spreadMode: 'current',
        scenarioId: null,
        spread: { individual, effort, natureIds: c.gen >= 3 ? [nature.id] : [], ceiling: false },
        moves: [byName(D.listMoves(), c.move).id],
        itemId: byName(D.listItems(), p.item)?.id ?? null,
        abilityId: c.gen >= 3 ? ability : null,
        gender: p.gender ?? 'N',
      }
    }
    const out = []
    for (const c of cases) {
      const ctx = G.gameContext(games[c.gen])
      const data = await BD.loadBattleData(ctx.versionGroup)
      const a = spec(c, c.attacker, 'mine')
      const d = spec(c, c.defender, 'theirs')
      const field = DMG.emptyMatchField()
      field.weather = c.field?.weather ?? null
      field.sides.theirs.reflect = !!c.field?.reflect
      const fresh = { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false }
      // Current HP from a percentage the reference's way: floor(maxHp * pct / 100).
      const atkMax = B.statAt(a, c.gen, 'hp', 'high')
      const atk =
        c.attacker.curHPpct != null
          ? { ...fresh, currentHp: Math.floor((atkMax * c.attacker.curHPpct) / 100) }
          : fresh
      const md = DMG.analyzeMove({
        ctx,
        data,
        attacker: a,
        defender: d,
        moveId: a.moves[0],
        attackerSide: 'mine',
        field,
        atk,
        def: fresh,
        badges: new Set(),
        uses: 3,
      })
      // The turn engine's own path: a battle state, then the hit with the reference's crit and hit count.
      const { state } = SES.newBattle(ctx, data, [a], [d], null, { badges: [], field })
      state.sides.mine.mons[0].hp = atk.currentHp ?? state.sides.mine.mons[0].hp
      const eng = TURN.engineDamage(ctx, state, 'mine', a.moves[0], !!c.crit, c.hits ?? null)
      out.push({
        label: c.label,
        gen: c.gen,
        crit: !!c.crit,
        hits: c.hits ?? null,
        expect: c.expect.damage,
        analyze: {
          rolls: md.low?.rolls,
          highRolls: md.high?.rolls,
          critRolls: md.low?.critRolls,
          maxHp: md.low?.maxHp,
          ko: md.koChance,
          critChance: md.critChance,
          accuracy: md.accuracy,
          hitCounts: md.hitCounts,
          status: md.status,
        },
        engine: eng?.damage ?? null,
      })
    }
    return out
  }, cases)
  for (const r of ref) {
    const kind = Object.entries(REF[r.gen]).find(([, l]) => l === r.label)?.[0]
    check(
      `[G${r.gen} ${kind}] turn engine == reference, every roll: ${r.label}`,
      JSON.stringify(r.engine) === JSON.stringify(r.expect),
      JSON.stringify(r.engine)?.slice(0, 80),
    )
    if (!Array.isArray(r.expect[0])) {
      const mine = r.crit ? r.analyze.critRolls : r.analyze.rolls
      check(
        `[G${r.gen} ${kind}] analyzeMove ${r.crit ? 'crit ' : ''}rolls == reference`,
        JSON.stringify(mine) === JSON.stringify(r.expect),
        `${mine?.length} rolls`,
      )
      check(
        `[G${r.gen} ${kind}] a single-value spread has one corner (low == high)`,
        JSON.stringify(r.analyze.rolls) === JSON.stringify(r.analyze.highRolls),
      )
      check(
        `[G${r.gen} ${kind}] ${r.gen <= 2 ? 39 : 16} rolls`,
        r.expect.length === (r.gen <= 2 ? 39 : 16),
      )
    }
  }
  /*
    KO CHANCE BY HAND (D1/D2). Marowak Thick Club Earthquake vs Tyranitar, Gen 2:
    the reference prints "20.5% chance to OHKO" -- 8 of the 39 rolls reach
    Tyranitar's 403 HP. Our one-use KO chance folds in crits (17/256 in Gen 2,
    critical_hit_chances.asm "1 out_of 15") and accuracy (Earthquake's 255 byte:
    Gen 2 skips the roll, BattleCommand_CheckHit), so it must equal
        (1 - 17/256) * 8/39  +  17/256 * (crit rolls reaching 403) / 39
    computed here from the rolls alone.
  */
  const maro = ref.find((r) => r.label.startsWith('G2 Marowak'))
  const fracN = maro.analyze.rolls.filter((x) => x >= maro.analyze.maxHp).length / 39
  const fracC = maro.analyze.critRolls.filter((x) => x >= maro.analyze.maxHp).length / 39
  const cc = 17 / 256
  const byHand = (1 - cc) * fracN + cc * fracC
  check(
    "Gen 2 Marowak: 8 of 39 rolls KO (the reference's 20.5%)",
    Math.abs(fracN - 8 / 39) < 1e-9,
    `${(fracN * 100).toFixed(1)}%`,
  )
  check(
    'Gen 2 crit chance of Earthquake is 17/256',
    Math.abs(maro.analyze.critChance - cc) < 1e-12,
    String(maro.analyze.critChance),
  )
  check('Gen 2 Earthquake (255 accuracy byte) never misses', maro.analyze.accuracy === 1)
  check(
    'one-use KO chance == (1-c)*normal + c*crit, by hand',
    Math.abs(maro.analyze.ko[0].min - byHand) < 1e-9,
    `${(maro.analyze.ko[0].min * 100).toFixed(2)}% vs ${(byHand * 100).toFixed(2)}%`,
  )
  const nido = ref.find((r) => r.label.startsWith('G1 Nidoking'))
  check(
    'Gen 1 Double Kick hits exactly twice',
    nido.analyze.hitCounts.length === 1 && nido.analyze.hitCounts[0].hits === 2,
  )
  check(
    "Gen 1 Double Kick total = the reference's 108-128",
    Math.min(...nido.analyze.rolls) === 108 && Math.max(...nido.analyze.rolls) === 128,
  )
  const rb = ref.find((r) => r.label.startsWith('G4 Rock Blast'))
  check(
    '2-5 hit moves: 3/8, 3/8, 1/8, 1/8 (pokeemerald Cmd_setmultihitcounter / pokeplatinum)',
    JSON.stringify(rb.analyze.hitCounts) ===
      JSON.stringify([
        { hits: 2, p: 0.375 },
        { hits: 3, p: 0.375 },
        { hits: 4, p: 0.125 },
        { hits: 5, p: 0.125 },
      ]),
  )
  const tk = ref.find((r) => r.label === 'G2 Triple Kick')
  check(
    'Gen 2 Triple Kick: 1, 2 or 3 hits, a third each (pokecrystal BattleCommand_TripleKick)',
    tk.analyze.hitCounts.length === 3 &&
      tk.analyze.hitCounts.every((h) => Math.abs(h.p - 1 / 3) < 1e-12),
  )
  log('  (Gen 1 has no weather: there is no weather case to run.)')

  // ------------------------------------------------------------------ 2
  hr('2. CHANCE CONSTANTS vs THE DISASSEMBLIES, and a speed tie per generation')
  const consts = await page.evaluate(async () => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const G = await import('/pokeapp/src/modules/battle/game.ts')
    const BD = await import('/pokeapp/src/modules/battle/battleData.ts')
    const C = await import('/pokeapp/src/modules/battle/chance.ts')
    const SP = await import('/pokeapp/src/modules/battle/speed.ts')
    const R = await import('/pokeapp/src/modules/battle/range.ts')
    const mv = (n) => D.listMoves().find((m) => m.name === n).id
    const item = (n) => D.listItems().find((i) => i.name === n)?.id ?? null
    const crit = async (vg, move, baseSpeed, species, itemName, focus = false, ability = '') => {
      const ctx = G.gameContext(vg)
      const data = await BD.loadBattleData(vg)
      return C.critChance(
        ctx,
        data,
        {
          moveId: mv(move),
          baseSpeed,
          speciesSlug: species,
          itemId: itemName ? item(itemName) : null,
          abilitySlug: ability,
          focusEnergy: focus,
          targetBlocks: false,
        },
        move,
      )
    }
    const acc = async (vg, move) => {
      const ctx = G.gameContext(vg)
      const data = await BD.loadBattleData(vg)
      return C.hitChance(ctx, data, {
        moveId: mv(move),
        accStage: 0,
        evaStage: 0,
        weather: null,
        attackerAbility: '',
        targetAbility: '',
        targetItemId: null,
        physical: true,
        sureHit: false,
      })
    }
    const qc = async (vg) => {
      const ctx = G.gameContext(vg)
      const data = await BD.loadBattleData(vg)
      return C.quickClawChance(ctx, data, item('quick-claw'))
    }
    // A speed tie: two identical Pokemon, then the same with a Quick Claw on one.
    const tie = async (vg, gen) => {
      const ctx = G.gameContext(vg)
      const data = await BD.loadBattleData(vg)
      const s = D.listSpecies().find((x) => x.name === 'jolteon')
      const keys =
        gen <= 2
          ? {
              individual: ['attack', 'defense', 'speed', 'special'],
              effort: ['hp', 'attack', 'defense', 'speed', 'special'],
            }
          : {
              individual: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'],
              effort: ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'],
            }
      const mk = (side, itemId) => ({
        key: `${side}:jolt`,
        side,
        source: 'custom',
        label: 'Jolteon',
        speciesId: s.id,
        varietyName: 'jolteon',
        level: 50,
        spreadMode: 'current',
        scenarioId: null,
        spread: {
          individual: Object.fromEntries(
            keys.individual.map((k) => [k, R.point(gen <= 2 ? 15 : 31)]),
          ),
          effort: Object.fromEntries(keys.effort.map((k) => [k, R.point(0)])),
          natureIds: gen >= 3 ? [D.listNatures().find((n) => n.name === 'serious').id] : [],
          ceiling: false,
        },
        moves: [mv('thunderbolt')],
        itemId,
        abilityId: null,
        gender: 'N',
      })
      const a = mk('mine', null)
      const b = mk('theirs', null)
      const ladder = SP.speedLadder(
        ctx,
        data,
        [
          { spec: a, mods: SP.noMods() },
          { spec: b, mods: SP.noMods() },
        ],
        new Set(),
        false,
      )
      const p = SP.firstProbability(
        ctx,
        data,
        a,
        SP.noMods(),
        0,
        b,
        SP.noMods(),
        0,
        new Set(),
        false,
      )
      const withClaw =
        gen >= 2
          ? SP.firstProbability(
              ctx,
              data,
              { ...a, itemId: item('quick-claw') },
              SP.noMods(),
              0,
              b,
              SP.noMods(),
              0,
              new Set(),
              false,
            )
          : null
      return {
        ties: ladder.map((r) => r.ties.length),
        speeds: ladder.map((r) => R.fmtRange(r.speed)),
        p,
        withClaw,
        qc: gen >= 2 ? C.quickClawChance(ctx, data, item('quick-claw')) : 0,
      }
    }
    return {
      g1Normal: await crit('red-blue', 'scratch', 115, 'persian', null),
      g1Slash: await crit('red-blue', 'slash', 115, 'persian', null),
      g1Focus: await crit('red-blue', 'scratch', 115, 'persian', null, true),
      g2Normal: await crit('crystal', 'megahorn', 85, 'heracross', null),
      g2Slash: await crit('crystal', 'slash', 85, 'persian', null),
      g2Scope: await crit('crystal', 'slash', 85, 'persian', 'scope-lens'),
      g2LuckyPunch: await crit('crystal', 'slash', 50, 'chansey', 'lucky-punch', true),
      g3Normal: await crit('emerald', 'tackle', 50, 'zigzagoon', null),
      g3Slash: await crit('emerald', 'slash', 50, 'sneasel', null),
      g4SuperLuckScope: await crit(
        'platinum',
        'night-slash',
        50,
        'absol',
        'scope-lens',
        false,
        'super-luck',
      ),
      g1Acc: await acc('red-blue', 'body-slam'),
      g1Tackle: await acc('red-blue', 'tackle'),
      g2Acc: await acc('crystal', 'body-slam'),
      g3Acc: await acc('emerald', 'thunder'),
      qc2: await qc('crystal'),
      qc3: await qc('emerald'),
      qc4: await qc('platinum'),
      tie1: await tie('red-blue', 1),
      tie2: await tie('crystal', 2),
      tie3: await tie('emerald', 3),
      tie4: await tie('platinum', 4),
    }
  })
  /*
    pokered CriticalHitTest: b = base Speed / 2; "sla b" (x2, capped); a normal move
    "srl b" (/2); a high-crit move "sla b" twice (x4, capped at $ff); Focus Energy
    "srl b" instead of "sla b" -- the bug. Crit when BattleRandom (rotated) < b.
      Persian (115): normal 57/256; Slash 57*2*2*2 = 456 -> capped $ff = 255/256;
      Focus Energy 57/2/2 = 14/256.
  */
  check(
    'Gen 1 Persian normal crit = 57/256 (pokered CriticalHitTest)',
    consts.g1Normal === 57 / 256,
    `${consts.g1Normal * 256}/256`,
  )
  check(
    'Gen 1 Persian Slash crit = 255/256 (capped at $ff)',
    consts.g1Slash === 255 / 256,
    `${consts.g1Slash * 256}/256`,
  )
  check(
    'Gen 1 Focus Energy QUARTERS the rate (the bug): 14/256',
    consts.g1Focus === 14 / 256,
    `${consts.g1Focus * 256}/256`,
  )
  // pokecrystal data/battle/critical_hit_chances.asm: 1 out_of 15 / 8 / 4 / 3 / 2 ("out_of" = "* $100 /").
  check('Gen 2 base crit 17/256 (1 out_of 15)', consts.g2Normal === 17 / 256)
  check('Gen 2 Slash (+2) 64/256 (1 out_of 4)', consts.g2Slash === 64 / 256)
  check('Gen 2 Slash + Scope Lens (+3) 85/256 (1 out_of 3)', consts.g2Scope === 85 / 256)
  check(
    'Gen 2 Lucky Punch Chansey: +2 and skips Focus Energy / the move (64/256)',
    consts.g2LuckyPunch === 64 / 256,
  )
  // pokeemerald Cmd_critcalc sCriticalHitChance {16, 8, 4, 3, 2}.
  check('Gen 3 base crit 1/16', consts.g3Normal === 1 / 16)
  check('Gen 3 Slash (+1) 1/8', consts.g3Slash === 1 / 8)
  check(
    'Gen 4 Night Slash + Scope Lens + Super Luck (+3) 1/3',
    Math.abs(consts.g4SuperLuckScope - 1 / 3) < 1e-12,
  )
  // pokered MoveHitTest: hit when a random byte < accuracy; 100% is $ff -> 255/256. pokecrystal: 255 skips the roll.
  check(
    'Gen 1 a 100% move hits 255/256 (the 1/256 miss)',
    consts.g1Acc === 255 / 256,
    String(consts.g1Acc),
  )
  check(
    'Gen 1 Tackle (95%, byte 242) hits 242/256',
    consts.g1Tackle === 242 / 256,
    String(consts.g1Tackle * 256),
  )
  check('Gen 2 a 100% move always hits', consts.g2Acc === 1)
  check('Gen 3 Thunder 70% (no weather)', consts.g3Acc === 0.7)
  // Quick Claw: pokecrystal DetermineMoveOrder (param 60, byte < 60); pokeemerald GetWhoStrikesFirst (0xFFFF*20/100); pokeplatinum (1 in 100/20).
  check('Gen 2 Quick Claw 60/256', consts.qc2 === 60 / 256, String(consts.qc2))
  check('Gen 3 Quick Claw 20% (13107/65536)', consts.qc3 === 13107 / 65536, String(consts.qc3))
  check('Gen 4 Quick Claw 1 in 5', consts.qc4 === 0.2)
  for (const g of [1, 2, 3, 4]) {
    const t = consts[`tie${g}`]
    check(
      `Gen ${g} speed tie: the ladder flags both as an exact 50/50`,
      t.ties.every((n) => n === 1) && t.speeds[0] === t.speeds[1],
      t.speeds.join(' = '),
    )
    check(`Gen ${g} speed tie: P(first) = 1/2`, t.p.min === 0.5 && t.p.max === 0.5)
    if (g >= 2) {
      // Gen 2 checks the enemy's claw first; Gen 3 one roll for everyone (holder wins it); Gen 4 compares speeds when both fire.
      const exp = g === 3 ? t.qc + (1 - t.qc) * 0.5 : t.qc + (1 - t.qc) * 0.5
      check(
        `Gen ${g} tie + Quick Claw on one: P(first) = qc + (1-qc)/2`,
        Math.abs(t.withClaw.min - exp) < 1e-12,
        `${t.withClaw.min.toFixed(4)}`,
      )
    }
  }

  // ------------------------------------------------------------------ 3
  hr("3. THE AI vs THE DISASSEMBLY'S ROUTINES")
  await seedTeams(page)
  const ai = await page.evaluate(async () => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const T = await import('/pokeapp/src/data/trainers.ts')
    const G = await import('/pokeapp/src/modules/battle/game.ts')
    const BD = await import('/pokeapp/src/modules/battle/battleData.ts')
    const S = await import('/pokeapp/src/modules/battle/sources.ts')
    const SES = await import('/pokeapp/src/modules/battle/session.ts')
    const AI = await import('/pokeapp/src/modules/battle/ai/index.ts')
    const mv = (n) => D.listMoves().find((m) => m.name === n).id
    const sp = (n) => D.listSpecies().find((s) => s.name === n)
    const setup = async (vg, trainerId, mineSpecies, mineMoves) => {
      const ctx = G.gameContext(vg)
      const data = await BD.loadBattleData(vg)
      const p = await T.loadTrainers(vg)
      const t =
        p.trainers.find((x) => x.id === trainerId) ??
        p.trainers.find((x) => x.id.startsWith(trainerId))
      const theirs = S.trainerToSpecs(t, ctx)
      const tb = JSON.parse(localStorage.getItem('pokeapp:team-builder:v1'))
      const base = S.buildToSpec(
        tb.builds.find((b) => b.generation === ctx.generation),
        ctx,
        0,
      )
      const s = sp(mineSpecies)
      const mine = [
        {
          ...base,
          label: s.display_name,
          speciesId: s.id,
          varietyName: s.varieties[0].name,
          moves: mineMoves.map(mv),
          itemId: null,
          abilityId: ctx.hasAbilities
            ? D.resolveAbilitiesForGeneration(s.varieties[0], ctx.generation)[0].ability.id
            : null,
        },
      ]
      const { state } = SES.newBattle(ctx, data, mine, theirs, S.trainerInfo(t, vg), { badges: [] })
      return { ctx, data, state, theirs, t }
    }
    const out = {}
    // Gen 1: Lance's Gyarados against a Fire type -- move choice modifier 3 favours the super-effective Hydro Pump.
    {
      const { ctx, data, state } = await setup('red-blue', 'LANCE', 'charizard', ['flamethrower'])
      const p = AI.predictAi(ctx, data, state, 300)
      out.g1 = {
        top: p.odds[0]?.label,
        p: p.odds[0]?.p,
        moves: p.moves.map((m) => [m.name, m.scoreMin, m.contributions.map((c) => c.label)]),
      }
    }
    // Gen 2: Champion Lance's Gyarados against Typhlosion -- AI_Smart_RainDance encourages Rain Dance against a Fire type.
    {
      const { ctx, data, state } = await setup('crystal', 'CHAMPION_LANCE', 'typhlosion', [
        'flamethrower',
      ])
      const p = AI.predictAi(ctx, data, state, 300)
      out.g2 = {
        top: p.odds[0]?.label,
        p: p.odds[0]?.p,
        labels: p.moves.flatMap((m) => m.contributions.map((c) => c.label)),
      }
    }
    // Gen 3 and 4: a move the target is immune to -- CHECK_BAD_MOVE / Basic: -10, never chosen.
    {
      const { ctx, data, state, theirs } = await setup('emerald', 'TRAINER_WALLACE', 'swampert', [
        'surf',
      ])
      // Wallace's Wailord has Double-Edge; a Ghost target is immune to it.
      const gh = sp('dusclops')
      state.sides.mine.mons[0].spec = {
        ...state.sides.mine.mons[0].spec,
        speciesId: gh.id,
        varietyName: gh.varieties[0].name,
      }
      const p = AI.predictAi(ctx, data, state, 300)
      const de = p.moves.find((m) => m.name === 'Double-Edge')
      out.g3 = {
        lead: theirs[0].label,
        de: de
          ? {
              p: de.pChosen,
              max: de.scoreMax,
              labels: de.contributions.map((c) => `${c.label} ${c.meanDelta}`),
            }
          : null,
        low: p.lowConfidence,
      }
    }
    {
      const { ctx, data, state } = await setup(
        'platinum',
        'TRAINER_CHAMPION_CYNTHIA',
        'tyranitar',
        ['crunch'],
      )
      const p = AI.predictAi(ctx, data, state, 300)
      const ps = p.moves.find((m) => m.name === 'Psychic')
      out.g4 = {
        ps: ps
          ? { p: ps.pChosen, labels: ps.contributions.map((c) => `${c.label} ${c.meanDelta}`) }
          : null,
        low: p.lowConfidence,
      }
    }
    // Low confidence: Diamond/Pearl and HGSS have no decompiled AI routine of their own for this; Platinum does.
    for (const [vg, id] of [
      ['diamond-pearl', 'TRAINER_CHAMPION_CYNTHIA'],
      ['heartgold-soulsilver', 'TRAINER_CHAMPION_LANCE'],
    ]) {
      const { ctx, data, state } = await setup(vg, id, 'tyranitar', ['crunch'])
      out[vg] = AI.predictAi(ctx, data, state, 60).lowConfidence
    }
    // P4 send-out: Gen 1 takes the next in party order.
    {
      const { ctx, data, state } = await setup('red-blue', 'LANCE', 'charizard', ['flamethrower'])
      state.sides.theirs.mons[0].hp = 0
      state.sides.theirs.mons[0].fainted = true
      out.sendOut1 = AI.aiSendOut({
        ctx,
        data,
        st: state,
        rng: new (await import('/pokeapp/src/modules/battle/engine/rng.ts')).Rng(1),
      })
    }
    // P5 item use: Cynthia (4 Full Restores) at low HP.
    {
      const { ctx, data, state } = await setup(
        'platinum',
        'TRAINER_CHAMPION_CYNTHIA',
        'tyranitar',
        ['crunch'],
      )
      const m = state.sides.theirs.mons[0]
      m.hp = Math.max(1, Math.floor(m.maxHp / 10))
      const p = AI.predictAi(ctx, data, state, 200)
      out.item4 = p.odds.map((o) => `${o.label} ${(o.p * 100).toFixed(0)}%`)
    }
    {
      const { ctx, data, state, t } = await setup('emerald', 'TRAINER_WALLACE', 'swampert', [
        'surf',
      ])
      const m = state.sides.theirs.mons[0]
      m.hp = Math.max(1, Math.floor(m.maxHp / 10))
      const p = AI.predictAi(ctx, data, state, 200)
      out.item3 = {
        bag: t.items.length,
        odds: p.odds.map((o) => `${o.label} ${(o.p * 100).toFixed(0)}%`),
      }
    }
    return out
  })
  check(
    'Gen 1 Lance Gyarados vs Charizard: Hydro Pump chosen (modifier 3, super effective)',
    ai.g1.top === 'Hydro Pump' && ai.g1.p === 1,
    `${ai.g1.top} ${ai.g1.p}`,
  )
  check(
    'Gen 2 Lance Gyarados vs Typhlosion: Rain Dance chosen (AI_Smart_RainDance)',
    ai.g2.top === 'Rain Dance',
    `${ai.g2.top} ${ai.g2.p}`,
  )
  check(
    'Gen 2 the deciding routine is named',
    ai.g2.labels.some((l) => /RainDance/.test(l)),
    ai.g2.labels.slice(0, 3).join('; '),
  )
  check(
    'Gen 3 Double-Edge into a Ghost: never chosen, -10 from the script',
    ai.g3.de && ai.g3.de.p === 0 && ai.g3.de.labels.some((l) => / -10$/.test(l)),
    JSON.stringify(ai.g3.de),
  )
  check('Gen 3 prediction carries no low-confidence flag', ai.g3.low.length === 0)
  check(
    'Gen 4 Spiritomb Psychic into Tyranitar: never chosen, Basic_CheckForImmunity -10',
    ai.g4.ps && ai.g4.ps.p === 0 && ai.g4.ps.labels.some((l) => /Immunity -10/.test(l)),
    JSON.stringify(ai.g4.ps),
  )
  check('Gen 4 Platinum prediction is not low confidence', ai.g4.low.length === 0)
  check(
    'Diamond/Pearl prediction flags low confidence',
    ai['diamond-pearl'].length > 0,
    ai['diamond-pearl'].join('; '),
  )
  check(
    'HeartGold/SoulSilver prediction flags low confidence',
    ai['heartgold-soulsilver'].length > 0,
    ai['heartgold-soulsilver'].join('; '),
  )
  check(
    'Gen 1 send-out after a faint: the next in party order (index 1)',
    ai.sendOut1 === 1,
    String(ai.sendOut1),
  )
  check(
    'Gen 4 Cynthia at 10% HP may use a Full Restore (ShouldUseItem)',
    ai.item4.some((o) => /Full Restore/.test(o)),
    ai.item4.join(', '),
  )
  check(
    'Gen 3 Wallace at 10% HP may use an item from his bag',
    ai.item3.bag === 0 || ai.item3.odds.some((o) => /^Use /.test(o)),
    JSON.stringify(ai.item3),
  )

  // ------------------------------------------------------------------ 4
  hr("4. THE BATTLE-DATA BUNDLE vs THE APP'S MOVE RECORDS")
  const bundle = await page.evaluate(async () => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const era = await import('/pokeapp/src/data/moveEra.ts')
    const BD = await import('/pokeapp/src/modules/battle/battleData.ts')
    const out = {}
    for (const [vg, gen] of [
      ['red-blue', 1],
      ['yellow', 1],
      ['gold-silver', 2],
      ['crystal', 2],
      ['ruby-sapphire', 3],
      ['emerald', 3],
      ['firered-leafgreen', 3],
      ['diamond-pearl', 4],
      ['platinum', 4],
      ['heartgold-soulsilver', 4],
    ]) {
      const data = await BD.loadBattleData(vg)
      const ids = Object.keys(data.moves).map(Number)
      const power = []
      const ppMis = []
      for (const id of ids) {
        const m = D.getMove(id)
        if (!m) continue
        const ours = era.resolveMovePowerForGeneration(m, gen)
        const gm = data.moves[id]
        if (gm.p > 1 && ours != null && ours !== gm.p) power.push(`${m.name} ${ours}/${gm.p}`)
        const pp = era.resolveMovePpForGeneration ? era.resolveMovePpForGeneration(m, gen) : m.pp
        if (pp != null && pp !== gm.pp) ppMis.push(`${m.name} ${pp}/${gm.pp}`)
      }
      out[vg] = {
        moves: ids.length,
        power,
        ppMis,
        source: data.source.repo + '@' + data.source.sha.slice(0, 7),
      }
    }
    return out
  })
  const expectMoves = { 1: 165, 2: 251, 3: 354, 4: 467 }
  for (const [vg, b] of Object.entries(bundle)) {
    const gen = {
      'red-blue': 1,
      yellow: 1,
      'gold-silver': 2,
      crystal: 2,
      'ruby-sapphire': 3,
      emerald: 3,
      'firered-leafgreen': 3,
      'diamond-pearl': 4,
      platinum: 4,
      'heartgold-soulsilver': 4,
    }[vg]
    check(
      `${vg}: ${expectMoves[gen]} moves from ${b.source}`,
      b.moves === expectMoves[gen],
      String(b.moves),
    )
    check(
      `${vg}: every damaging move's power agrees with the app's era resolver`,
      b.power.length === 0,
      b.power.slice(0, 6).join(', '),
    )
    log(
      `        PP differences (informational, disassembly/resolver): ${b.ppMis.length}${b.ppMis.length ? ` e.g. ${b.ppMis.slice(0, 4).join(', ')}` : ''}`,
    )
  }

  // ------------------------------------------------------------------ 5
  hr('5. A REAL FIGHT PER GENERATION, THROUGH THE SCREEN')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]')
  const appSelection = await appGeneration(page).catch(() => null)
  await page.evaluate(() => document.querySelector('[data-testid="nav-team-matchup"]').click())
  await page.waitForSelector('[data-testid="team-matchup"]')
  const tab = async (name) => {
    await page.click(`.tm-tabs .ds-tab:has-text("${name}")`)
    await page.waitForSelector(`[data-testid="tm-panel-${name.toLowerCase()}"]`)
  }
  // A roster row's editor keeps its open state in the row, so a tab switch or a game
  // change closes it; open it only when it is closed (the button toggles).
  const openRow = async (id) => {
    const btn = `[data-testid="${id}-edit"]`
    if ((await page.getAttribute(btn, 'aria-expanded')) !== 'true') await page.click(btn)
  }
  const pickTrainer = async (text) => {
    await page.click('[data-testid="tm-trainer-input"]')
    await page.fill('[data-testid="tm-trainer-input"]', text)
    await page.waitForSelector('[data-testid="tm-trainer-list"] [role="option"]')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() =>
      /Opponent:/.test(document.querySelector('[data-testid="tm-provenance"]')?.textContent ?? ''),
    )
  }
  const FIGHT = {
    1: ['Elite Four Lance', 5],
    2: ['Champion Lance', 6],
    3: ['Champion Wallace', 6],
    4: ['Champion Cynthia', 6],
  }
  for (const g of [1, 2, 3, 4]) {
    const vg = GAME[g]
    await tab('Setup')
    await page.selectOption('[data-testid="tm-game"]', vg)
    await page.waitForSelector('[data-testid="tm-team"]')
    await page.selectOption('[data-testid="tm-team"]', `fx-team-${vg}`)
    await pickTrainer(FIGHT[g][0])
    const prov = await page.textContent('[data-testid="tm-provenance"]')
    check(`G${g} ${vg}: opponent is ${FIGHT[g][0]}`, prov.includes(FIGHT[g][0]), prov.slice(0, 120))
    await tab('Matrix')
    const cells = await page.$$eval('[data-testid^="tm-cell-"]', (els) =>
      els.map((e) => e.getAttribute('data-verdict')),
    )
    check(
      `G${g} matrix is 6 x ${FIGHT[g][1]}, every cell with a verdict`,
      cells.length === 6 * FIGHT[g][1] &&
        cells.every((v) => ['wins', 'trades', 'roll', 'loses'].includes(v)),
      `${cells.length} cells`,
    )
    const words = await page.$$eval('[data-testid^="tm-cell-"] .tm-verdict', (els) =>
      els.every((e) => /(Win|Trade|Roll|Lose)/.test(e.textContent) && /[▲◆◐▼]/.test(e.textContent)),
    )
    check(`G${g} every verdict carries a symbol and a word, not colour alone (M2)`, words)
    await page.screenshot({ path: shot(`team-matchup-g${g}-matrix.png`) })
    await tab('Switching')
    await page.waitForSelector('[data-testid="tm-prediction-odds"] li')
    const odds = await page.$$eval('[data-testid="tm-prediction-odds"] li', (els) =>
      els.map((e) => e.textContent),
    )
    check(`G${g} the AI prediction lists its odds`, odds.length >= 1, odds.slice(0, 3).join(' | '))
    await tab('Outcome')
    await page.selectOption('[data-testid="tm-mc-runs"]', '100')
    await page.click('[data-testid="tm-mc-run"]')
    await page.waitForSelector('[data-testid="tm-mc-result-win"], [data-testid="tm-job-error"]')
    const win = await page.textContent('[data-testid="tm-mc-result-win"]').catch(() => 'error')
    check(`G${g} 100 battles against ${FIGHT[g][0]}'s AI complete`, /%/.test(win), win)
    await page.screenshot({ path: shot(`team-matchup-g${g}-outcome.png`) })
  }
  check(
    "changing the matchup's game never moved the app's (fourth exception, one-way)",
    appSelection == null ||
      (await appGeneration(page).catch(() => appSelection)) ===
        appSelection,
    String(appSelection),
  )

  // ------------------------------------------------------------------ 6
  hr('6. SPREADS, SCENARIOS, FORMAT, CUSTOM TEAMS, FACILITIES, HAND-OFF')
  await tab('Setup')
  await page.selectOption('[data-testid="tm-game"]', 'platinum')
  await page.waitForSelector('[data-testid="tm-mine-roster"]')
  const tbBefore = await page.evaluate(() => localStorage.getItem('pokeapp:team-builder:v1'))
  await openRow('tm-mine-0')
  check(
    'S7a: "Use current" shows the saved values read-only',
    (await page.getAttribute('[data-testid="tm-mine-0-spread-iv-attack"]', 'readonly')) !== null,
  )
  await page.click('[data-testid="tm-mine-0-spread-mode"] [data-value="custom"]')
  check(
    'S7b: "Customize" makes them editable',
    (await page.getAttribute('[data-testid="tm-mine-0-spread-iv-attack"]', 'readonly')) === null,
  )
  await page.fill('[data-testid="tm-mine-0-spread-iv-attack"]', '0-31')
  await page.press('[data-testid="tm-mine-0-spread-iv-attack"]', 'Enter')
  await page.waitForFunction(() =>
    /customised/.test(document.querySelector('[data-testid="tm-provenance"]').textContent),
  )
  check(
    'S7b: the saved build in Team Building is untouched',
    (await page.evaluate(() => localStorage.getItem('pokeapp:team-builder:v1'))) === tbBefore,
  )
  const atkCell = await page.$eval(
    '[data-testid="tm-mine-0-spread"] .tm-spread-stats td:nth-child(3)',
    (e) => e.textContent,
  )
  check('S7c: a ranged IV gives a ranged stat', /\d+–\d+/.test(atkCell), atkCell)
  await tab('Damage')
  // Infernape leads into Spiritomb, a Ghost: Close Combat is immune, so take Flare Blitz.
  await page.selectOption('[data-testid="tm-dmg-move"]', { label: 'Flare Blitz' })
  const rollsLo = await page.textContent('[data-testid="tm-rolls-low"]')
  const rollsHi = await page.textContent('[data-testid="tm-rolls-high"]')
  check('S7c: the range widens the output (two corners differ)', rollsLo !== rollsHi)
  await tab('Matrix')
  check(
    'S7f: the customised Pokemon is labelled in the matrix',
    (await page.textContent('[data-testid="tm-matrix-table"] tbody tr:first-child th')).includes(
      'custom spread',
    ),
  )
  await tab('Setup')
  await openRow('tm-mine-0')
  await page.click('[data-testid="tm-mine-0-spread-maximize"]')
  await page.waitForSelector('[data-testid="tm-ceiling"]')
  check(
    'S7d: Gen 4 "Maximize all EVs" is labelled a best-case ceiling on every output',
    (await page.textContent('[data-testid="tm-ceiling"]')).includes('ceiling'),
  )
  await tab('Matrix')
  check(
    'S7d: the ceiling mark reaches the matrix',
    (await page.$$('[data-testid="tm-matrix-table"] .tm-ceiling')).length > 0,
  )
  // Gen 1: the same preset is a legal spread, so no ceiling.
  await tab('Setup')
  await page.selectOption('[data-testid="tm-game"]', 'red-blue')
  await page.waitForSelector('[data-testid="tm-mine-roster"]')
  await openRow('tm-mine-0')
  await page.click('[data-testid="tm-mine-0-spread-mode"] [data-value="custom"]')
  await page.click('[data-testid="tm-mine-0-spread-maximize"]')
  await page.waitForTimeout(200)
  check(
    'S7d: Gen 1 maximised Stat Exp is legal -- no ceiling label',
    (await page.$('[data-testid="tm-ceiling"]')) === null,
  )
  // Back to Platinum: scenarios.
  await page.selectOption('[data-testid="tm-game"]', 'platinum')
  await page.waitForSelector('[data-testid="tm-mine-roster"]')
  await page.fill('[data-testid="tm-scenario-name"]', 'Plan A')
  await page.click('[data-testid="tm-scenario-save"]')
  await page.waitForFunction(
    () => document.querySelector('[data-testid="tm-provenance-scenario"]').textContent === 'Plan A',
  )
  check('S7e/S7f: the saved scenario names every output', true)
  await page.click('[data-testid="tm-my-mode"] [data-value="current"]')
  await openRow('tm-mine-0')
  await page.click('[data-testid="tm-mine-0-spread-mode"] [data-value="team"]')
  await page.fill('[data-testid="tm-scenario-name"]', 'Plan B (current spreads)')
  await page.click('[data-testid="tm-scenario-save"]')
  await tab('Compare')
  check(
    'S7e: both scenarios are listed',
    (await page.$$('[data-testid^="tm-scenario-sc-"]')).length === 2,
  )
  const ids = await page.$$eval('[data-testid="tm-compare-A"] option', (o) =>
    o.map((x) => [x.value, x.textContent]),
  )
  await page.selectOption('[data-testid="tm-compare-A"]', ids.find((x) => x[1] === 'Plan A')[0])
  await page.selectOption(
    '[data-testid="tm-compare-B"]',
    ids.find((x) => x[1].startsWith('Plan B'))[0],
  )
  const colA = await page.textContent('[data-testid="tm-compare-col-a"]')
  const colB = await page.textContent('[data-testid="tm-compare-col-b"]')
  check(
    'S7e/R3: side by side, each column computed from its own scenario',
    /ceiling/.test(colA) && !/ceiling/.test(colB),
    `${colA.slice(0, 60)} | ${colB.slice(0, 60)}`,
  )
  await page.click('[data-testid="tm-compare-col-b-run"]')
  await page.waitForSelector('[data-testid="tm-compare-col-b-mc-win"]')
  check(
    'R3: a scenario column runs its own battles',
    /%/.test(await page.textContent('[data-testid="tm-compare-col-b-mc-win"]')),
  )
  await page.screenshot({ path: shot('team-matchup-compare.png') })
  // S6 format.
  await tab('Setup')
  await page.check('[data-testid="tm-item-clause"]')
  await page.waitForTimeout(200)
  check(
    'S6: Item Clause removes the duplicate Leftovers and says so',
    /Item Clause: .*Leftovers removed/.test(await page.textContent('[data-testid="tm-format"]')),
  )
  await page.click('[data-testid="tm-format-level"] [data-value="level-50"]')
  await page.waitForTimeout(200)
  check(
    'S6: the Level 50 rule names how many it brings down',
    /Level 50 rule: \d+ Pokemon/.test(await page.textContent('[data-testid="tm-format"]')),
  )
  await page.click('[data-testid="tm-format-level"] [data-value="as-is"]')
  await page.uncheck('[data-testid="tm-item-clause"]')
  await page.click('[data-testid="tm-format-battle"] [data-value="double"]')
  await page.waitForTimeout(200)
  check(
    'S6: the Double format says battles run two-on-two',
    /Double battle: battles run two-on-two/.test(await page.textContent('[data-testid="tm-format"]')),
  )
  await page.click('[data-testid="tm-format-battle"] [data-value="single"]')
  // S5 custom team.
  await page.click('[data-testid="tm-copy-to-custom"]')
  await page.waitForSelector('[data-testid="tm-custom"]')
  check(
    'S5: the trainer copied into a custom team',
    (await page.textContent('[data-testid="tm-provenance"]')).includes('Custom team') &&
      (await page.$$('[data-testid="tm-theirs-roster"] > li')).length === 6,
  )
  await openRow('tm-theirs-0')
  await page.click('[data-testid="tm-theirs-0-edits-move-0-input"]')
  await page.fill('[data-testid="tm-theirs-0-edits-move-0-input"]', 'Earthquake')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() =>
    /\(edited\)/.test(document.querySelector('[data-testid="tm-theirs-roster"]').textContent),
  )
  check('S5: an edited opponent Pokemon is marked "(edited)"', true)
  // R6 facility (Emerald).
  await page.selectOption('[data-testid="tm-game"]', 'emerald')
  await page.click('[data-testid="tm-opp-kind"] [data-value="facility"]')
  await page.waitForSelector('[data-testid="tm-pool"]')
  const poolText = await page.textContent('[data-testid="tm-pool"]')
  check(
    'R6: a facility trainer is a pool, each set with its chance',
    /Pool of \d+; the trainer draws 3/.test(poolText) && /\d+\.\d%/.test(poolText),
    poolText.slice(0, 80),
  )
  await tab('Outcome')
  await page.selectOption('[data-testid="tm-mc-runs"]', '100')
  await page.click('[data-testid="tm-mc-run"]')
  await page.waitForSelector('[data-testid="tm-mc-result-win"]')
  check(
    'R6: battles against the pool draw a team each time',
    /%/.test(await page.textContent('[data-testid="tm-mc-result-win"]')) &&
      /draws the facility trainer/.test(await page.textContent('[data-testid="tm-mc"]')),
  )
  // Tate & Liza: an in-game double battle.
  await tab('Setup')
  await page.click('[data-testid="tm-opp-kind"] [data-value="trainer"]')
  await pickTrainer('Tate')
  check(
    'S6: an in-game double battle (Tate & Liza) is fought two-on-two, and says so',
    /Double battle: battles run two-on-two/.test(await page.textContent('[data-testid="tm-format"]')) &&
      (await page.$('[data-testid="tm-lead2"]')) !== null,
  )
  // M3 hand-off and R4.
  await page.selectOption('[data-testid="tm-game"]', 'platinum')
  await page.click('[data-testid="tm-opp-kind"] [data-value="trainer"]')
  await pickTrainer('Champion Cynthia')
  await tab('Matrix')
  await page.fill('[data-testid="tm-level-shift"]', '5')
  await page.waitForFunction(() =>
    /what-if Lv/.test(document.querySelector('[data-testid="tm-matrix-table"]').textContent),
  )
  check('R4: the what-if level is applied and labelled', true)
  await page.fill('[data-testid="tm-level-shift"]', '0')
  const pair = await page.$eval('[data-testid="tm-matrix-table"]', (t) => [
    t.querySelector('tbody tr th .tm-mon-name').textContent,
    t.querySelector('thead th:nth-child(2) .tm-mon-name').textContent,
  ])
  await page.click('[data-testid="tm-cell-0-0"]')
  await page.waitForSelector('[data-testid="calc-damage"]')
  const calc = await page.evaluate(() => ({
    game: document.querySelector('[data-testid="calc-damage"]').getAttribute('data-game'),
    p1: document.querySelector('[data-testid="dcalc-p1-species-input"]').value,
    p2: document.querySelector('[data-testid="dcalc-p2-species-input"]').value,
  }))
  check(
    'M3: a matrix cell opens the Damage Calculator on that pair, in that game',
    calc.game === 'platinum' && calc.p1.startsWith(pair[0]) && calc.p2.startsWith(pair[1]),
    JSON.stringify(calc),
  )
  await page.screenshot({ path: shot('team-matchup-handoff.png') })
  await page.evaluate(() => document.querySelector('[data-testid="nav-team-matchup"]').click())
  await page.waitForSelector('[data-testid="team-matchup"]')
  check(
    'M3: back from the hand-off, the matchup is still on its own game',
    (await page.$eval('[data-testid="tm-game"]', (e) => e.value)) === 'platinum',
  )
  // P2 sandbox.
  await tab('Sandbox')
  await page.click('[data-testid="tm-sb-move-0"]')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="tm-sb-turn"] h2').textContent.includes('Turn 2') ||
      /won|lost/.test(document.querySelector('[data-testid="tm-sb-turn"] h2').textContent),
  )
  const logLen = await page.$$eval('[data-testid="tm-sb-log"] li', (l) => l.length)
  check('P2: a turn resolves and logs', logLen > 2, `${logLen} lines`)
  await page.click('[data-testid="tm-sb-undo"]')
  check(
    'P2: undo goes back a turn',
    (await page.textContent('[data-testid="tm-sb-turn"] h2')).includes('Turn 1'),
  )
  await page.click('[data-testid="tm-sb-move-1"]')
  check(
    'P2: a different choice branches; the old line stays',
    (await page.$('[data-testid="tm-sb-alt"]')) !== null,
  )
  await page.screenshot({ path: shot('team-matchup-sandbox.png') })

  // ------------------------------------------------------------------ 7
  hr('7. BACKGROUND ANALYSES: search, gauntlet, scan, suggestions')
  await tab('Outcome')
  await page.click('[data-testid="tm-search-run"]')
  await page.waitForSelector('[data-testid="tm-line"], [data-testid="tm-job-error"]', {
    timeout: 600000,
  })
  const line = await page.$$eval('[data-testid="tm-line"] li', (l) => l.map((x) => x.textContent))
  check(
    'O1: a lead is recommended and a line turn by turn',
    line.length >= 1 && (await page.$$('[data-testid="tm-leads"] tbody tr')).length === 6,
    line[0]?.slice(0, 90),
  )
  await tab('Gauntlet')
  check(
    'R1: the default gauntlet is the Elite Four and the Champion',
    (await page.$$eval('[data-testid="tm-gauntlet-list"] li', (l) => l.map((x) => x.textContent)))
      .join(' ')
      .includes('Champion Cynthia'),
  )
  await page.click('[data-testid="tm-gauntlet-run"]')
  await page.waitForSelector('[data-testid="tm-gauntlet-clear"], [data-testid="tm-job-error"]', {
    timeout: 600000,
  })
  const clear = await page.textContent('[data-testid="tm-gauntlet-clear"]').catch(() => 'error')
  check(
    'R1: the gauntlet carries HP/PP/status and reports a clear rate',
    /Clears all 5: \d/.test(clear),
    clear,
  )
  check(
    'R1: every fight has a reached / won row',
    (await page.$$('[data-testid="tm-gauntlet-table"] tbody tr')).length === 5,
  )
  await tab('Scan')
  await page.selectOption('[data-testid="tm-scan"] select', '0')
  await page.click('[data-testid="tm-scan-run"]')
  await page.waitForSelector('[data-testid="tm-job-done"], [data-testid="tm-job-error"]', {
    timeout: 600000,
  })
  const scanRows = await page.$$('[data-testid^="tm-scan-row-"]')
  check('R2: every boss in Platinum scanned', scanRows.length >= 30, `${scanRows.length} bosses`)
  const banded = await page.$$eval('[data-testid="tm-scan-table"] td[data-band]', (tds) =>
    tds.every((t) => /\d/.test(t.textContent)),
  )
  check('R2: every coloured cell prints its number', banded)
  await page.screenshot({ path: shot('team-matchup-scan.png') })
  await tab('Matrix')
  await page.click('[data-testid="tm-suggest-run"]')
  await page.waitForSelector('[data-testid="tm-suggestion-list"], [data-testid="tm-job-error"]', {
    timeout: 600000,
  })
  check(
    'R5: suggestions computed',
    (await page.$('[data-testid="tm-suggestion-list"]')) !== null,
    (await page.textContent('[data-testid="tm-suggestions"]')).slice(0, 120),
  )

  // ------------------------------------------------------------------ 8
  hr("8. DOUBLE BATTLES (S6): the games' doubles rules, their AI, the screen")
  const dbl = await page.evaluate(async () => {
    const D = await import('/pokeapp/src/data/index.ts')
    await D.initDataLayer()
    const G = await import('/pokeapp/src/modules/battle/game.ts')
    const BD = await import('/pokeapp/src/modules/battle/battleData.ts')
    const R = await import('/pokeapp/src/modules/battle/range.ts')
    const SES = await import('/pokeapp/src/modules/battle/session.ts')
    const TURN = await import('/pokeapp/src/modules/battle/engine/turn.ts')
    const RNG = await import('/pokeapp/src/modules/battle/engine/rng.ts')
    const AI = await import('/pokeapp/src/modules/battle/ai/index.ts')
    const mv = (n) => D.listMoves().find((m) => m.name === n).id
    const abil = (n) => D.listAbilities().find((a) => a.name === n)?.id ?? null
    const serious = D.listNatures().find((n) => n.name === 'serious').id
    const KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']
    // A Pokemon at Lv 50, IV 31, EV 0, a neutral nature: every stat the engine's own.
    const mk = (side, i, species, moves, ability, level = 50) => {
      const s = D.listSpecies().find((x) => x.name === species)
      return {
        key: `${side}:${i}`,
        side,
        source: 'custom',
        label: s.display_name,
        speciesId: s.id,
        varietyName: species,
        level,
        spreadMode: 'current',
        scenarioId: null,
        spread: {
          individual: Object.fromEntries(KEYS.map((k) => [k, R.point(31)])),
          effort: Object.fromEntries(KEYS.map((k) => [k, R.point(0)])),
          natureIds: [serious],
          ceiling: false,
        },
        moves: moves.map(mv),
        itemId: null,
        abilityId: ability ? abil(ability) : null,
        gender: 'N',
      }
    }
    const env = async (vg) => ({ ctx: G.gameContext(vg), data: await BD.loadBattleData(vg) })
    const battle = (e, mine, theirs, flags = []) =>
      SES.newBattle(
        e.ctx,
        e.data,
        mine,
        theirs,
        { classId: '', aiFlags: flags, versionGroup: e.ctx.versionGroup, bag: [] },
        { badges: [], doubles: true },
      ).state
    const rollsOf = (r) => (typeof r.damage === 'number' ? [r.damage] : r.damage)
    const out = {}

    // ---- 1. The doubles damage formula against the games' code, re-implemented here.
    // Machamp (no STAB) on Kangaskhan (neutral): Rock Slide / Earthquake, no item, no ability effect.
    const formula = async (vg) => {
      const e = await env(vg)
      const A = mk('mine', 0, 'machamp', ['rock-slide', 'earthquake'], 'guts')
      const K = mk('theirs', 0, 'kangaskhan', ['tackle'], 'early-bird')
      const st = battle(
        e,
        [A, mk('mine', 1, 'kangaskhan', ['tackle'], 'early-bird')],
        [K, mk('theirs', 1, 'kangaskhan', ['tackle'], 'early-bird')],
      )
      const a = st.sides.mine.mons[0]
      const d = st.sides.theirs.mons[0]
      const calc = (move, doubles, reflect = false) => {
        const s = structuredClone(st)
        s.sides.theirs.reflect = reflect ? 5 : 0
        return rollsOf(
          TURN.engineDamage(e.ctx, s, 'mine', mv(move), false, null, false, {
            attacker: s.sides.mine.mons[0],
            defender: s.sides.theirs.mons[0],
            defenderSide: 'theirs',
            doubles,
          }),
        )
      }
      // pokeemerald CalculateBaseDamage / pokeplatinum BattleSystem_CalcBaseDamage, physical, no crit:
      // damage = atk * power * (2*L/5 + 2) / def / 50, [screen], [spread], + 2; then the 85..100 roll.
      const base = (power, mod) => {
        let x = Math.floor(
          Math.floor((a.stats.atk * power * Math.floor((2 * 50) / 5 + 2)) / d.stats.def) / 50,
        )
        x = mod(x)
        if (vg === 'emerald' && x === 0) x = 1
        return x + 2
      }
      const rolls = (b) => Array.from({ length: 16 }, (_, k) => Math.floor((b * (85 + k)) / 100))
      const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y)
      const D2 = (spread, others = 3) => ({ defenderSideAlive: 2, othersAlive: others, spread })
      if (vg === 'emerald') {
        return {
          bothFoesHalved: eq(
            calc('rock-slide', D2('both-foes')),
            rolls(base(75, (x) => Math.floor(x / 2))),
          ),
          singlesUntouched: eq(calc('rock-slide', undefined), rolls(base(75, (x) => x))),
          earthquakeFull: eq(calc('earthquake', D2('all-adjacent')), rolls(base(100, (x) => x))),
          reflectTwoThirds: eq(
            calc('rock-slide', D2('both-foes'), true),
            rolls(base(75, (x) => Math.floor((2 * Math.floor(x / 3)) / 2))),
          ),
          oneDefenderNotHalved: eq(
            calc('rock-slide', { defenderSideAlive: 1, othersAlive: 2, spread: 'both-foes' }),
            rolls(base(75, (x) => x)),
          ),
        }
      }
      return {
        bothFoes34: eq(
          calc('rock-slide', D2('both-foes')),
          rolls(base(75, (x) => Math.floor((x * 3) / 4))),
        ),
        allAdjacent34: eq(
          calc('earthquake', D2('all-adjacent')),
          rolls(base(100, (x) => Math.floor((x * 3) / 4))),
        ),
        allAdjacentAlone: eq(calc('earthquake', D2('all-adjacent', 1)), rolls(base(100, (x) => x))),
        reflectTwoThirds: eq(
          calc('rock-slide', D2('both-foes'), true),
          rolls(base(75, (x) => Math.floor((Math.floor((x * 2) / 3) * 3) / 4))),
        ),
      }
    }
    out.g3 = await formula('emerald')
    out.g4 = await formula('platinum')

    // ---- 2. The engine: targets, redirection, partners, order, refills.
    const turn = async (vg, mine, theirs, acts) => {
      const e = await env(vg)
      const st = battle(e, mine, theirs)
      const m = new Map(Object.entries(acts))
      const r = TURN.resolveTurnDoubles(e.ctx, e.data, st, m, {
        rng: new RNG.Rng(1),
        policies: RNG.DEFAULT_SANDBOX_POLICIES,
        events: [],
        turn: 0,
      })
      return { before: st, after: r.state, log: r.log.map((l) => l.text) }
    }
    const hpLost = (t, side, i) => t.before.sides[side].mons[i].hp - t.after.sides[side].mons[i].hp
    const none = { kind: 'none' }
    // Gen 3 Earthquake (MOVE_TARGET_FOES_AND_ALLY): both foes AND the ally, each at full damage.
    const eq3 = await turn(
      'emerald',
      [mk('mine', 0, 'machamp', ['earthquake']), mk('mine', 1, 'kangaskhan', ['tackle'])],
      [mk('theirs', 0, 'kangaskhan', ['tackle']), mk('theirs', 1, 'kangaskhan', ['tackle'])],
      { mine0: { kind: 'move', slot: 0 }, mine1: none, theirs0: none, theirs1: none },
    )
    out.eq3 = {
      ally: hpLost(eq3, 'mine', 1),
      foe0: hpLost(eq3, 'theirs', 0),
      foe1: hpLost(eq3, 'theirs', 1),
    }
    const eq4 = await turn(
      'platinum',
      [mk('mine', 0, 'machamp', ['earthquake']), mk('mine', 1, 'kangaskhan', ['tackle'])],
      [mk('theirs', 0, 'kangaskhan', ['tackle']), mk('theirs', 1, 'kangaskhan', ['tackle'])],
      { mine0: { kind: 'move', slot: 0 }, mine1: none, theirs0: none, theirs1: none },
    )
    out.eq4 = {
      ally: hpLost(eq4, 'mine', 1),
      foe0: hpLost(eq4, 'theirs', 0),
      foe1: hpLost(eq4, 'theirs', 1),
    }
    // The same Earthquake one-on-one, at the same (mean) roll: Gen 3 equal, Gen 4 x3/4.
    const single = async (vg) => {
      const e = await env(vg)
      const st = SES.newBattle(
        e.ctx,
        e.data,
        [mk('mine', 0, 'machamp', ['earthquake'])],
        [mk('theirs', 0, 'kangaskhan', ['tackle'])],
        null,
        { badges: [] },
      ).state
      const r = TURN.resolveTurn(
        e.ctx,
        e.data,
        st,
        { mine: { kind: 'move', slot: 0 }, theirs: none },
        { rng: new RNG.Rng(1), policies: RNG.DEFAULT_SANDBOX_POLICIES, events: [], turn: 0 },
      )
      return st.sides.theirs.mons[0].hp - r.state.sides.theirs.mons[0].hp
    }
    out.eqSingle3 = await single('emerald')
    out.eqSingle4 = await single('platinum')
    // Follow Me draws a single-target move aimed at the other foe.
    const fm = await turn(
      'emerald',
      [mk('mine', 0, 'machamp', ['cross-chop']), mk('mine', 1, 'kangaskhan', ['tackle'])],
      [mk('theirs', 0, 'togepi', ['follow-me']), mk('theirs', 1, 'kangaskhan', ['tackle'])],
      {
        mine0: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 1 } },
        mine1: none,
        theirs0: { kind: 'move', slot: 0 },
        theirs1: none,
      },
    )
    out.followMe = { togepi: hpLost(fm, 'theirs', 0), kangaskhan: hpLost(fm, 'theirs', 1) }
    // Gen 3 Lightning Rod: an opposing holder draws an Electric move aimed at its partner.
    const lr = await turn(
      'emerald',
      [mk('mine', 0, 'raichu', ['thunderbolt']), mk('mine', 1, 'kangaskhan', ['tackle'])],
      [
        mk('theirs', 0, 'manectric', ['tackle'], 'lightning-rod'),
        mk('theirs', 1, 'kangaskhan', ['tackle']),
      ],
      {
        mine0: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 1 } },
        mine1: none,
        theirs0: none,
        theirs1: none,
      },
    )
    out.lightningRod = { manectric: hpLost(lr, 'theirs', 0), kangaskhan: hpLost(lr, 'theirs', 1) }
    // Helping Hand: x1.5 on the partner's move this turn.
    const hh = async (help) =>
      hpLost(
        await turn(
          'emerald',
          [
            mk('mine', 0, 'machamp', ['karate-chop']),
            mk('mine', 1, 'kangaskhan', ['helping-hand']),
          ],
          [mk('theirs', 0, 'snorlax', ['tackle']), mk('theirs', 1, 'kangaskhan', ['tackle'])],
          {
            mine0: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 0 } },
            mine1: help ? { kind: 'move', slot: 0 } : none,
            theirs0: none,
            theirs1: none,
          },
        ),
        'theirs',
        0,
      )
    out.helpingHand = { with: await hh(true), without: await hh(false) }
    // Intimidate on entry: both foes.
    {
      const e = await env('emerald')
      const st = battle(
        e,
        [
          mk('mine', 0, 'gyarados', ['tackle'], 'intimidate'),
          mk('mine', 1, 'kangaskhan', ['tackle']),
        ],
        [
          mk('theirs', 0, 'machamp', ['tackle'], 'guts'),
          mk('theirs', 1, 'snorlax', ['tackle'], 'immunity'),
        ],
      )
      out.intimidate = st.sides.theirs.mons.map((m) => m.boosts.atk)
    }
    // Four battlers in speed order (no priority).
    const order = await turn(
      'emerald',
      [mk('mine', 0, 'snorlax', ['tackle']), mk('mine', 1, 'jolteon', ['tackle'])],
      [mk('theirs', 0, 'kangaskhan', ['tackle']), mk('theirs', 1, 'alakazam', ['tackle'])],
      {
        mine0: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 0 } },
        mine1: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 0 } },
        theirs0: { kind: 'move', slot: 0, target: { side: 'mine', slot: 0 } },
        theirs1: { kind: 'move', slot: 0, target: { side: 'mine', slot: 0 } },
      },
    )
    out.order = order.log.filter((l) => / used /.test(l)).map((l) => l.split(' used')[0])
    // When an emptied slot is refilled: Gen 3 at once, Gen 4 at the end of the turn.
    const refill = async (vg) => {
      const e = await env(vg)
      const st = battle(
        e,
        [
          mk('mine', 0, 'alakazam', ['psychic'], null, 70),
          mk('mine', 1, 'snorlax', ['tackle'], null, 50),
        ],
        [
          mk('theirs', 0, 'machop', ['tackle'], null, 5),
          mk('theirs', 1, 'slowpoke', ['tackle'], null, 50),
          mk('theirs', 2, 'rattata', ['tackle'], null, 5),
        ],
      )
      const r = SES.stepTurnDoubles(
        e.ctx,
        e.data,
        st,
        {
          0: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 0 } },
          1: { kind: 'move', slot: 0, target: { side: 'theirs', slot: 1 } },
        },
        RNG.DEFAULT_SANDBOX_POLICIES,
        new RNG.Rng(1),
        new RNG.Rng(2),
        { 0: none, 1: none },
      )
      const log = r.log.map((l) => l.text)
      const sent = log.findIndex((l) => /Foe sent out Rattata/.test(l))
      const lastUsed = log
        .map((l, i) => (/ used /.test(l) ? i : -1))
        .filter((i) => i >= 0)
        .pop()
      return { sent, lastUsed, log }
    }
    out.refill3 = await refill('emerald')
    out.refill4 = await refill('platinum')

    // ---- 3. The AI's doubles routines.
    const predict = async (vg, mineSpecs, theirSpecs, flags) => {
      const e = await env(vg)
      const st = battle(e, mineSpecs, theirSpecs, flags)
      return AI.predictAiDoubles(e.ctx, e.data, st, 0, 200)
    }
    const immune = (vg, flags) =>
      predict(
        vg,
        [
          mk('mine', 0, 'golem', ['tackle'], 'sturdy'),
          mk('mine', 1, 'gyarados', ['tackle'], 'intimidate'),
        ],
        [
          mk('theirs', 0, 'raichu', ['thunderbolt'], 'static'),
          mk('theirs', 1, 'kangaskhan', ['tackle'], 'early-bird'),
        ],
        flags,
      )
    const odds = (p) => p.odds.map((o) => `${o.label} ${(o.p * 100).toFixed(0)}%`)
    out.aiEmerald = odds(await immune('emerald', ['check_bad_move']))
    out.aiRuby = odds(await immune('ruby-sapphire', ['check_bad_move']))
    out.aiPlatinum = odds(await immune('platinum', ['basic']))
    const eqAi = await predict(
      'emerald',
      [mk('mine', 0, 'kangaskhan', ['tackle']), mk('mine', 1, 'snorlax', ['tackle'])],
      [
        mk('theirs', 0, 'golem', ['earthquake', 'tackle'], 'sturdy'),
        mk('theirs', 1, 'skarmory', ['peck'], 'keen-eye'),
      ],
      ['check_bad_move'],
    )
    out.aiEq = {
      odds: odds(eqAi),
      routines: eqAi.moves[0].contributions.map((c) => `${c.label} ${c.meanDelta}`),
    }
    return out
  })
  check(
    'S6 Gen 3: MOVE_TARGET_BOTH halves with two defenders (pokeemerald CalculateBaseDamage)',
    dbl.g3.bothFoesHalved,
  )
  check(
    'S6 Gen 3: the single-battle formula is untouched without the doubles field',
    dbl.g3.singlesUntouched,
  )
  check('S6 Gen 3: Earthquake (FOES_AND_ALLY) is not reduced', dbl.g3.earthquakeFull)
  check('S6 Gen 3: Reflect is 2 * (damage / 3) with two defenders', dbl.g3.reflectTwoThirds)
  check('S6 Gen 3: one defender standing: no halving', dbl.g3.oneDefenderNotHalved)
  check(
    'S6 Gen 4: RANGE_ADJACENT_OPPONENTS x3/4 with two defenders (BattleSystem_CalcBaseDamage)',
    dbl.g4.bothFoes34,
  )
  check('S6 Gen 4: RANGE_ALL_ADJACENT x3/4 with two or more others standing', dbl.g4.allAdjacent34)
  check(
    'S6 Gen 4: RANGE_ALL_ADJACENT unreduced when only one other stands',
    dbl.g4.allAdjacentAlone,
  )
  check('S6 Gen 4: Reflect is damage * 2 / 3 with two defenders', dbl.g4.reflectTwoThirds)
  check(
    'S6 Gen 3: Earthquake hits both foes and the ally, each at the single-battle damage',
    dbl.eq3.ally > 0 && dbl.eq3.foe0 === dbl.eqSingle3 && dbl.eq3.foe1 === dbl.eqSingle3,
    JSON.stringify({ ...dbl.eq3, single: dbl.eqSingle3 }),
  )
  check(
    'S6 Gen 4: Earthquake hits all three at x3/4 of the single-battle damage',
    dbl.eq4.ally > 0 &&
      dbl.eq4.foe0 < dbl.eqSingle4 &&
      Math.abs(dbl.eq4.foe0 - dbl.eqSingle4 * 0.75) <= 2,
    JSON.stringify({ ...dbl.eq4, single: dbl.eqSingle4 }),
  )
  check(
    'S6: Follow Me draws a move aimed at the other foe',
    dbl.followMe.togepi > 0 && dbl.followMe.kangaskhan === 0,
    JSON.stringify(dbl.followMe),
  )
  check(
    'S6 Gen 3: an opposing Lightning Rod draws an Electric move aimed at its partner',
    dbl.lightningRod.kangaskhan === 0,
    JSON.stringify(dbl.lightningRod),
  )
  check(
    "S6: Helping Hand raises the partner's damage by half",
    Math.abs(dbl.helpingHand.with / dbl.helpingHand.without - 1.5) < 0.06,
    JSON.stringify(dbl.helpingHand),
  )
  check(
    'S6: Intimidate lowers both foes',
    dbl.intimidate.every((x) => x === -1),
    JSON.stringify(dbl.intimidate),
  )
  check(
    'S6: four battlers act in speed order',
    dbl.order.join(',') === 'Jolteon,Alakazam,Kangaskhan,Snorlax',
    dbl.order.join(','),
  )
  check(
    'S6 Gen 3: an emptied slot is refilled at once, before the turn goes on (HandleAction_TryFinish)',
    dbl.refill3.sent >= 0 && dbl.refill3.sent < dbl.refill3.lastUsed,
    `${dbl.refill3.sent} < ${dbl.refill3.lastUsed}`,
  )
  check(
    'S6 Gen 4: an emptied slot is refilled at the end of the turn (BattleControllerPlayer_TurnEnd)',
    dbl.refill4.sent > dbl.refill4.lastUsed,
    `${dbl.refill4.sent} > ${dbl.refill4.lastUsed}`,
  )
  check(
    'S6 AI Emerald: per-target scoring aims Thunderbolt away from the immune Golem',
    dbl.aiEmerald.length === 1 && /Gyarados 100%/.test(dbl.aiEmerald[0]),
    dbl.aiEmerald.join(' | '),
  )
  check(
    'S6 AI Ruby: no doubles routine -- a random foe first, so the immune one is aimed at too',
    dbl.aiRuby.some((x) => /Golem/.test(x)) && dbl.aiRuby.some((x) => /Gyarados/.test(x)),
    dbl.aiRuby.join(' | '),
  )
  check(
    'S6 AI Platinum: TrainerAI_MainDoubles aims away from the immune target',
    dbl.aiPlatinum.length === 1 && /Gyarados 100%/.test(dbl.aiPlatinum[0]),
    dbl.aiPlatinum.join(' | '),
  )
  check(
    'S6 AI Emerald: AI_DoubleBattle runs in doubles (Earthquake beside a Flying partner)',
    dbl.aiEq.routines.some((r) => /DoubleBattle/.test(r)),
    dbl.aiEq.routines.join(' | '),
  )
  check(
    'S6 AI: never aims a damaging move at its ally below 100 points',
    ![...dbl.aiEmerald, ...dbl.aiPlatinum, ...dbl.aiEq.odds].some((x) => /\(ally\)/.test(x)),
  )
  // ---- 4. The screen.
  await tab('Setup')
  await page.selectOption('[data-testid="tm-game"]', 'emerald')
  await page.waitForSelector('[data-testid="tm-team"]')
  await page.selectOption('[data-testid="tm-team"]', 'fx-team-emerald')
  await page.click('[data-testid="tm-opp-kind"] [data-value="trainer"]')
  await pickTrainer('Tate')
  await page.waitForSelector('[data-testid="tm-lead2"]')
  check('S6: a double battle asks for a second lead', true)
  await tab('Sandbox')
  await page.waitForSelector('[data-testid="tm-sb-theirs1"]')
  const panels = await page.$$('[data-testid="tm-panel-sandbox"] .tm-sb-mon')
  check('S6: the sandbox shows all four battlers', panels.length === 4, String(panels.length))
  check(
    "S6: both of the opponent's battlers get a prediction",
    (await page.$('[data-testid="tm-sb-prediction-0"]')) !== null &&
      (await page.$('[data-testid="tm-sb-prediction-1"]')) !== null,
  )
  const choices = await page.$$eval('[data-testid="tm-sb-act-0"] option', (o) =>
    o.map((x) => x.textContent),
  )
  check(
    'S6: a single-target move offers each target, the ally included',
    choices.some((c) => /→/.test(c)) && choices.some((c) => /\(ally\)/.test(c)),
    choices.slice(0, 4).join(' | '),
  )
  await page.click('[data-testid="tm-sb-go"]')
  await page.waitForFunction(() =>
    /Turn 2|won|lost/.test(document.querySelector('[data-testid="tm-sb-turn"] h2').textContent),
  )
  const dlog = await page.$$eval('[data-testid="tm-sb-log"] li', (l) => l.map((x) => x.textContent))
  check('S6: a doubles turn resolves through the screen', dlog.length > 6, `${dlog.length} lines`)
  await page.screenshot({ path: shot('team-matchup-doubles-sandbox.png') })
  await tab('Outcome')
  await page.selectOption('[data-testid="tm-mc-runs"]', '100')
  await page.click('[data-testid="tm-mc-run"]')
  await page.waitForSelector('[data-testid="tm-mc-result-win"]')
  check(
    'S6: battles against Tate & Liza run two-on-two',
    /%/.test(await page.textContent('[data-testid="tm-mc-result-win"]')),
  )
  await tab('Setup')
  await page.selectOption('[data-testid="tm-game"]', 'red-blue')
  await page.waitForSelector('[data-testid="tm-format-battle"]')
  check(
    'S6: Generation 1 offers no double battle',
    (await page.getAttribute(
      '[data-testid="tm-format-battle"] [data-value="double"]',
      'disabled',
    )) !== null ||
      (await page.getAttribute(
        '[data-testid="tm-format-battle"] [data-value="double"]',
        'aria-disabled',
      )) === 'true',
  )
  await page.selectOption('[data-testid="tm-game"]', 'platinum')
  await page.waitForSelector('[data-testid="tm-format-battle"]')
  await page.click('[data-testid="tm-format-battle"] [data-value="double"]')
  await tab('Sandbox')
  await page.waitForSelector('[data-testid="tm-sb-theirs1"]')
  check('S6: the Double format turns a single trainer into a two-on-two battle (Platinum)', true)
  await tab('Setup')
  await page.click('[data-testid="tm-format-battle"] [data-value="single"]')

  // ------------------------------------------------------------------ 9
  hr('9. DESIGN RULES, THEMES, CONSOLE')
  const design = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="team-matchup"]')
    const all = [root, ...root.querySelectorAll('*')]
    const shadows = all.filter((e) => getComputedStyle(e).boxShadow !== 'none').length
    const filledVerdicts = [...root.querySelectorAll('.tm-verdict, [data-band], .tm-cell')].filter(
      (e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)',
    ).length
    const sections = [...root.querySelectorAll('.tm-section')].filter(
      (e) => getComputedStyle(e).borderTopWidth !== '0px',
    ).length
    return { shadows, filledVerdicts, sections }
  })
  check('no box-shadow anywhere in Team Matchup', design.shadows === 0, String(design.shadows))
  check(
    'no fill behind a verdict, a heat cell or a matrix cell (coloured text only)',
    design.filledVerdicts === 0,
    String(design.filledVerdicts),
  )
  check(
    "App.css's .panel section rule does not reach the module's sections",
    design.sections === 0,
    String(design.sections),
  )
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await tab('Matrix')
    await page.waitForTimeout(150)
    await page.screenshot({ path: shot(`team-matchup-matrix-${theme}.png`) })
    await tab('Setup')
    await page.screenshot({ path: shot(`team-matchup-setup-${theme}.png`) })
  }
  check('both themes photographed', true, 'scripts/.verify-shots/team-matchup-*')
  const real = consoleErrors.filter(
    (e) =>
      !/raw\.githubusercontent|objects\.githubusercontent|github\.com\/.*releases|Failed to load resource/.test(
        e,
      ),
  )
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '))
} catch (e) {
  console.error(e)
  failures.push(`crashed: ${e.message}`)
} finally {
  await browser.close()
  await dev.stop()
}

hr(`${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log('FAILED:')
  failures.forEach((f) => log(`  - ${f}`))
  process.exit(1)
}
