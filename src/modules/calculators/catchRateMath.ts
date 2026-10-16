/**
 * Catch probability, Gen 1-4, as each game computes it.
 *
 * PURE, AND UI-FREE. Every branch below is one game's own routine, read in the
 * pinned pret disassemblies (scripts/trainers/sources.mjs) on 2026-10-15, and it
 * keeps that routine's integer order, byte arithmetic and bugs -- a catch
 * calculator that "fixes" Gen 2's Love Ball is not a Gen 2 calculator:
 *
 *   Gen 1   pokered engine/items/item_effects.asm ItemUseBall
 *   Gen 2   pokecrystal engine/items/item_effects.asm PokeBallEffect + the ball
 *           multiplier functions (BallMultiplierFunctionTable)
 *   Gen 3   pokeemerald src/battle_script_commands.c Cmd_handleballthrow
 *   Gen 4   pokeplatinum src/battle/battle_script.c BattleScript_CalcCatchShakes
 *           pokeheartgold src/battle/battle_command.c BattleSystem_CalculateBallShakes
 *           (+ asm/overlay_12_battle_command.s for its tables)
 *
 * THE ANSWER IS AN EXACT PROBABILITY, not a simulation: every random draw the
 * routine makes is enumerated (Gen 1's two bytes, Gen 2's one byte) or has a
 * closed form (Gen 3-4's four 16-bit shake checks).
 *
 * The previous version of this file used Gen 3's formula for every generation and
 * offered four balls; it also claimed no conditional balls existed before Gen 5,
 * which was wrong (Gen 2 has the Apricorn balls, Gen 3 Net/Dive/Nest/Repeat/Timer).
 */

/** Which routine reads the throw. Gen 4 has two: Diamond/Pearl/Platinum and HeartGold/SoulSilver. */
export type CatchEngine = 'gen1' | 'gen2' | 'gen3' | 'gen4' | 'hgss'

export function catchEngineFor(versionGroup: string, generation: number): CatchEngine {
  if (generation <= 1) return 'gen1'
  if (generation === 2) return 'gen2'
  if (generation === 3) return 'gen3'
  return versionGroup === 'heartgold-soulsilver' ? 'hgss' : 'gen4'
}

export type CatchStatus = 'none' | 'sleep' | 'freeze' | 'paralysis' | 'burn' | 'poison'

/** Ball slugs, as the bundle names the items. */
export type Ball =
  | 'poke-ball'
  | 'great-ball'
  | 'ultra-ball'
  | 'master-ball'
  | 'safari-ball'
  | 'level-ball'
  | 'lure-ball'
  | 'moon-ball'
  | 'friend-ball'
  | 'love-ball'
  | 'heavy-ball'
  | 'fast-ball'
  | 'park-ball'
  | 'net-ball'
  | 'dive-ball'
  | 'nest-ball'
  | 'repeat-ball'
  | 'timer-ball'
  | 'luxury-ball'
  | 'premier-ball'
  | 'dusk-ball'
  | 'heal-ball'
  | 'quick-ball'
  | 'cherish-ball'
  | 'sport-ball'

const GEN1_BALLS: Ball[] = ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', 'safari-ball']
const APRICORN: Ball[] = [
  'level-ball',
  'lure-ball',
  'moon-ball',
  'friend-ball',
  'love-ball',
  'heavy-ball',
  'fast-ball',
]
const HOENN: Ball[] = [
  'net-ball',
  'dive-ball',
  'nest-ball',
  'repeat-ball',
  'timer-ball',
  'luxury-ball',
  'premier-ball',
]
const SINNOH: Ball[] = ['dusk-ball', 'heal-ball', 'quick-ball', 'cherish-ball']

/**
 * The balls a game lets you throw. Gen 2 has no Safari Zone; the Park Ball is the
 * Bug-Catching Contest's (Gen 2) and the Sport Ball HeartGold/SoulSilver's.
 */
export function ballsFor(engine: CatchEngine): Ball[] {
  switch (engine) {
    case 'gen1':
      return GEN1_BALLS
    case 'gen2':
      return ['poke-ball', 'great-ball', 'ultra-ball', 'master-ball', ...APRICORN, 'park-ball']
    case 'gen3':
      return [...GEN1_BALLS, ...HOENN]
    case 'gen4':
      return [...GEN1_BALLS, ...HOENN, ...SINNOH]
    case 'hgss':
      return [...GEN1_BALLS, ...HOENN, ...SINNOH, ...APRICORN, 'sport-ball']
  }
}

export interface CatchTarget {
  speciesId: number
  /** The species' base catch rate, 3-255. */
  catchRate: number
  level: number
  maxHp: number
  currentHp: number
  status: CatchStatus
  /** Type names, for the Net Ball. */
  types: string[]
  /** Base Speed, for HeartGold/SoulSilver's Fast Ball. */
  baseSpeed: number
  /** Weight in hectograms (the bundle's unit), for HeartGold/SoulSilver's Heavy Ball. */
  weightHg: number
  /** Gen 2's own Pokédex weight in tenths of a pound, for Gen 2's Heavy Ball. */
  gen2WeightLb10: number | null
  gender: 'male' | 'female' | 'genderless'
}

/** The throw's circumstances; only the ball being thrown reads any of them. */
export interface CatchContext {
  /** Your active Pokemon (Level Ball, Love Ball). */
  yourLevel: number
  yourSpeciesId: number | null
  yourGender: 'male' | 'female' | 'genderless'
  fishing: boolean
  underwater: boolean
  /** Night (Dusk Ball) -- or in a cave. */
  nightOrCave: boolean
  /** Turns already elapsed in the battle: 0 on the first turn (Quick, Timer). */
  turns: number
  caughtBefore: boolean
  /** Gen 4 Safari Zone caution stage, 0-12 (6 = neutral). */
  safariStage: number
}

export const NEUTRAL_CONTEXT: CatchContext = {
  yourLevel: 50,
  yourSpeciesId: null,
  yourGender: 'genderless',
  fishing: false,
  underwater: false,
  nightOrCave: false,
  turns: 0,
  caughtBefore: false,
  safariStage: 6,
}

export interface CatchResult {
  /** 0-1, exact. */
  probability: number
  guaranteed: boolean
  /**
   * The value the routine compares, in its own terms: Gen 1 the HP factor W,
   * Gen 2 the final catch byte, Gen 3-4 the modified catch rate "a".
   */
  value: number
  /** A known quirk of the routine that affected this throw, in a sentence. */
  note: string | null
}

const clamp255 = (n: number) => Math.min(255, n)
const isqrt = (n: number) => Math.floor(Math.sqrt(n))

// ---------------------------------------------------------------- Gen 1

/**
 * ItemUseBall. Rand1 is uniform over [0,255] (Poke), [0,200] (Great) or [0,150]
 * (Ultra, Safari) -- the routine rerolls anything above the ball's cap. A status
 * of 25 (sleep, freeze) or 12 (burn, paralysis, poison) larger than Rand1 catches
 * outright; otherwise Rand1 - Status must not exceed the catch rate, and then
 * W = floor(floor(MaxHP*255 / BallFactor) / max(floor(HP/4), 1)) (BallFactor 8
 * for the Great Ball, 12 for the rest) catches outright from 256, or a second
 * byte Rand2 <= W does.
 */
function gen1(t: CatchTarget, ball: Ball): CatchResult {
  if (ball === 'master-ball') return { probability: 1, guaranteed: true, value: 255, note: null }
  const cap = ball === 'poke-ball' ? 255 : ball === 'great-ball' ? 200 : 150
  const status = t.status === 'sleep' || t.status === 'freeze' ? 25 : t.status === 'none' ? 0 : 12
  const factor = ball === 'great-ball' ? 8 : 12
  const w = Math.floor(
    Math.floor((t.maxHp * 255) / factor) / Math.max(Math.floor(t.currentHp / 4), 1),
  )
  const second = w >= 256 ? 1 : (clamp255(w) + 1) / 256
  let caught = 0
  for (let r1 = 0; r1 <= cap; r1++) {
    if (r1 < status) caught += 1
    else if (r1 - status <= t.catchRate) caught += second
  }
  const probability = caught / (cap + 1)
  return { probability, guaranteed: probability >= 1, value: clamp255(w), note: null }
}

// ---------------------------------------------------------------- Gen 2

/** Fast Ball: the routine walks three BYTES of FleeMons, not three lists. */
const GEN2_FAST_BALL = new Set([81, 88, 114]) // Magnemite, Grimer, Tangela
/** Heavy Ball reads the wrong Pokédex bank for these (missing `dec a`). */
const GEN2_HEAVY_BAD_BANK = new Set([64, 128, 192]) // Kadabra, Tauros, Sunflora

function gen2Ball(
  t: CatchTarget,
  ball: Ball,
  ctx: CatchContext,
): { rate: number; note: string | null } {
  let b = t.catchRate
  switch (ball) {
    case 'ultra-ball':
      return { rate: clamp255(b * 2), note: null }
    case 'great-ball':
    case 'park-ball':
      return { rate: clamp255(b + (b >> 1)), note: null }
    case 'lure-ball':
      return { rate: ctx.fishing ? clamp255(b * 3) : b, note: null }
    case 'level-ball': {
      // Compared against YOUR level, halved and quartered in turn.
      let c = ctx.yourLevel
      if (t.level >= c) return { rate: b, note: null }
      b = clamp255(b * 2)
      c >>= 1
      if (t.level >= c) return { rate: b, note: null }
      b = clamp255(b * 2)
      c >>= 1
      if (t.level >= c) return { rate: b, note: null }
      return { rate: clamp255(b * 2), note: null }
    }
    case 'moon-ball':
      return {
        rate: b,
        note: 'Gen 2 Moon Ball bug: it checks for a Burn Heal evolution instead of the Moon Stone, so it never boosts.',
      }
    case 'love-ball': {
      if (
        ctx.yourSpeciesId !== t.speciesId ||
        t.gender === 'genderless' ||
        ctx.yourGender === 'genderless'
      ) {
        return { rate: b, note: null }
      }
      return t.gender === ctx.yourGender
        ? {
            rate: clamp255(b * 8),
            note: 'Gen 2 Love Ball bug: it boosts the SAME gender, not the opposite one.',
          }
        : { rate: b, note: 'Gen 2 Love Ball bug: the opposite gender gets no boost.' }
    }
    case 'fast-ball':
      return GEN2_FAST_BALL.has(t.speciesId)
        ? { rate: clamp255(b * 4), note: null }
        : { rate: b, note: 'Gen 2 Fast Ball bug: it only boosts Magnemite, Grimer and Tangela.' }
    case 'heavy-ball': {
      if (GEN2_HEAVY_BAD_BANK.has(t.speciesId) || t.gen2WeightLb10 == null) {
        return {
          rate: b,
          note: 'Gen 2 Heavy Ball bug: this Pokémon’s weight is read from the wrong bank, so the result is unpredictable.',
        }
      }
      // pounds*10 -> roughly kg*10, the routine's own way: w/2 - w/32 - w/64.
      const half = t.gen2WeightLb10 >> 1
      const sixteenth = half >> 4
      const v = half - sixteenth - (sixteenth >> 1)
      const h = (v >> 8) & 0xff
      if (h < 4) return { rate: Math.max(1, b - 20), note: null }
      const add = h < 8 ? 0 : h < 12 ? 20 : h < 16 ? 30 : 40
      return { rate: clamp255(b + add), note: null }
    }
    default:
      return { rate: b, note: null }
  }
}

/**
 * PokeBallEffect. The HP step works in BYTES: 3*MaxHP and 2*HP are quartered when
 * 3*MaxHP needs two bytes, then only their low bytes are used (the documented bug
 * for max HP over 341). Sleep and freeze add 10; burn, poison and paralysis add
 * nothing (another documented bug). The Level Ball skips the HP and status steps.
 * One random byte <= the final value catches.
 */
function gen2(t: CatchTarget, ball: Ball, ctx: CatchContext): CatchResult {
  if (ball === 'master-ball') return { probability: 1, guaranteed: true, value: 255, note: null }
  const { rate, note } = gen2Ball(t, ball, ctx)
  let final: number
  let quirk = note
  if (ball === 'level-ball') {
    final = rate
  } else {
    let de = (3 * t.maxHp) & 0xffff
    let bc = (2 * t.currentHp) & 0xffff
    if (de >> 8 !== 0) {
      de >>= 2
      bc >>= 2
      if ((bc & 0xff) === 0) bc = (bc & 0xff00) | 1
    }
    const e = de & 0xff
    const c = bc & 0xff
    if (e === 0) {
      return {
        probability: 0,
        guaranteed: false,
        value: 0,
        note: 'Gen 2 catch rate bug: at this max HP the routine divides by zero.',
      }
    }
    if (t.maxHp > 341)
      quirk ??= 'Gen 2 catch rate bug: max HP over 341 overflows the byte the routine divides by.'
    const multiplier = (e - c) & 0xff
    let a = Math.floor((rate * multiplier) / e) & 0xff
    if (a === 0) a = 1
    const add = t.status === 'sleep' || t.status === 'freeze' ? 10 : 0
    if (add === 0 && (t.status === 'burn' || t.status === 'poison' || t.status === 'paralysis')) {
      quirk ??= 'Gen 2 bug: burn, poison and paralysis add nothing to the catch rate.'
    }
    final = clamp255(a + add)
  }
  const probability = Math.min(1, (final + 1) / 256)
  return { probability, guaranteed: probability >= 1, value: final, note: quirk }
}

// ---------------------------------------------------------------- Gen 3-4

function gen34Multiplier(
  engine: CatchEngine,
  t: CatchTarget,
  ball: Ball,
  ctx: CatchContext,
): number {
  switch (ball) {
    case 'ultra-ball':
      return 20
    case 'great-ball':
    case 'safari-ball':
      return 15
    case 'poke-ball':
      return 10
    case 'net-ball':
      return t.types.includes('water') || t.types.includes('bug') ? 30 : 10
    case 'dive-ball':
      return ctx.underwater ? 35 : 10
    case 'nest-ball':
      return t.level < 40 ? Math.max(10, 40 - t.level) : 10
    case 'repeat-ball':
      return ctx.caughtBefore ? 30 : 10
    case 'timer-ball':
      return Math.min(40, 10 + ctx.turns)
    case 'dusk-ball':
      return engine !== 'gen3' && ctx.nightOrCave ? 35 : 10
    case 'quick-ball':
      return engine !== 'gen3' && ctx.turns < 1 ? 40 : 10
    case 'sport-ball':
      return engine === 'hgss' ? 15 : 10
    default:
      return 10
  }
}

/** HeartGold/SoulSilver's Apricorn balls change the CATCH RATE, clamped to 1-255. */
const HGSS_MOON_BALL = new Set([29, 30, 31, 32, 33, 34, 173, 35, 36, 174, 39, 40, 300, 301])

function hgssApricorn(
  t: CatchTarget,
  ball: Ball,
  ctx: CatchContext,
): { rate: number; note: string | null } {
  let r = t.catchRate
  let note: string | null = null
  switch (ball) {
    case 'fast-ball':
      if (t.baseSpeed >= 100) r *= 4
      break
    case 'level-ball': {
      const you = ctx.yourLevel
      if (you <= t.level) break
      if (Math.floor(you / 2) <= t.level) r *= 2
      else if (Math.floor(you / 4) <= t.level) r *= 4
      else r *= 8
      break
    }
    case 'lure-ball':
      if (ctx.fishing) r *= 3
      break
    case 'heavy-ball':
      if (t.weightHg >= 4096) r += 40
      else if (t.weightHg >= 3072) r += 30
      else if (t.weightHg >= 2048) r += 20
      else if (r < 1024) {
        // The routine tests the catch rate, not the weight, here.
        r -= 20
        note = 'HeartGold/SoulSilver Heavy Ball bug: every Pokémon under 204.8 kg gets −20.'
      }
      break
    case 'love-ball':
      if (
        ctx.yourSpeciesId === t.speciesId &&
        t.gender !== 'genderless' &&
        ctx.yourGender !== 'genderless' &&
        ctx.yourGender !== t.gender
      )
        r *= 8
      break
    case 'moon-ball':
      if (HGSS_MOON_BALL.has(t.speciesId)) r *= 4
      break
  }
  if (r > 255) r = 255
  else if (r < 0) r = 1
  return { rate: r, note }
}

/**
 * Cmd_handleballthrow (Gen 3) and BattleScript_CalcCatchShakes /
 * BattleSystem_CalculateBallShakes (Gen 4), one shape:
 *   a = floor(floor(rate * multiplier / 10) * (3*MaxHP - 2*HP) / (3*MaxHP))
 *   sleep/freeze x2; poison/burn/paralysis x15/10 (floored)
 *   a >= 255 catches; else four 16-bit checks each pass under
 *   floor(1048560 / floor(sqrt(floor(sqrt(floor(16711680 / a)))))).
 */
function gen34(engine: CatchEngine, t: CatchTarget, ball: Ball, ctx: CatchContext): CatchResult {
  if (ball === 'master-ball') return { probability: 1, guaranteed: true, value: 255, note: null }
  let rate = t.catchRate
  let note: string | null = null
  if (ball === 'safari-ball') {
    if (engine === 'gen3') {
      // The Safari factor is stored as rate*100/1275 and multiplied back.
      rate = Math.floor((Math.floor((rate * 100) / 1275) * 1275) / 100)
    } else {
      const stage = Math.max(0, Math.min(12, ctx.safariStage))
      const [n, d] = SAFARI_STAGES[stage]
      rate = Math.floor((n * rate) / d)
    }
  }
  let multiplier = gen34Multiplier(engine, t, ball, ctx)
  if (engine === 'hgss' && APRICORN.includes(ball)) {
    const r = hgssApricorn(t, ball, ctx)
    rate = r.rate
    note = r.note
    multiplier = 10
  }
  const m3 = 3 * t.maxHp
  let a = Math.floor((Math.floor((rate * multiplier) / 10) * (m3 - 2 * t.currentHp)) / m3)
  if (t.status === 'sleep' || t.status === 'freeze') a *= 2
  else if (t.status !== 'none') a = Math.floor((a * 15) / 10)
  if (a >= 255) return { probability: 1, guaranteed: true, value: a, note }
  if (a <= 0) return { probability: 0, guaranteed: false, value: 0, note }
  const shake = Math.floor(1048560 / isqrt(isqrt(Math.floor(16711680 / a))))
  const p = Math.min(shake, 65536) / 65536
  return { probability: p ** 4, guaranteed: false, value: a, note }
}

/** Gen 4 Safari Zone stages, numerator/denominator (pokeheartgold sSafariCatchRateStages). */
const SAFARI_STAGES: [number, number][] = [
  [10, 40],
  [10, 35],
  [10, 30],
  [10, 25],
  [10, 20],
  [10, 15],
  [10, 10],
  [15, 10],
  [20, 10],
  [25, 10],
  [30, 10],
  [35, 10],
  [40, 10],
]

export function catchChance(
  engine: CatchEngine,
  target: CatchTarget,
  ball: Ball,
  ctx: CatchContext = NEUTRAL_CONTEXT,
): CatchResult {
  switch (engine) {
    case 'gen1':
      return gen1(target, ball)
    case 'gen2':
      return gen2(target, ball, ctx)
    default:
      return gen34(engine, target, ball, ctx)
  }
}

/** "1 in N throws", rounded -- the more intuitive readout beside a raw percentage. */
export function oneInN(probability: number): number | null {
  if (probability <= 0) return null
  return Math.round(1 / probability)
}
