/**
 * The probabilities a turn rolls, per generation, transcribed from the games:
 * critical hits, accuracy, multi-hit counts, Quick Claw. Each function returns an
 * exact probability, not a sample, so the KO maths can be exact (D1/D2) and the
 * Monte Carlo can draw from the same numbers.
 */

import { getItem } from '../../data'
import type { BattleData } from './battleData'
import { gameMove, heldEffect } from './battleData'
import type { GameContext } from './game'

// ------------------------------------------------------------------ crits

export interface CritInput {
  moveId: number
  /** Species base Speed (Gen 1). */
  baseSpeed: number
  speciesSlug: string
  itemId: number | null
  abilitySlug: string
  focusEnergy: boolean
  /** Target ability blocks crits (Battle Armor / Shell Armor), Gen 3+. */
  targetBlocks: boolean
  /** Gen 4 Lucky Chant on the target's side. */
  luckyChant?: boolean
}

/**
 * Gen 1 -- pokered engine/battle/core.asm CriticalHitTest. b = base Speed / 2;
 * Focus Energy shifts RIGHT (the famous bug: a quarter, not double); a normal move
 * halves b again, a high-crit move multiplies by 4 (each doubling capped at 255);
 * a crit is a random byte below b.
 */
function gen1Crit(data: BattleData, inp: CritInput): number {
  const ai = data.ai.kind === 'gen1' ? data.ai : null
  const high = ai?.highCritMoves.includes(inp.moveId) ?? false
  let b = inp.baseSpeed >> 1
  if (inp.focusEnergy) b >>= 1
  else b = Math.min(255, b << 1)
  if (high) {
    b = Math.min(255, b << 1)
    b = Math.min(255, b << 1)
  } else {
    b >>= 1
  }
  return b / 256
}

/** Gen 2 -- pokecrystal BattleCommand_Critical + data/battle/critical_hit_chances.asm. */
const GEN2_CRIT = [17, 32, 64, 85, 128, 128, 128] // 1 out_of 15, 8, 4, 3, 2 -> *256 /n
const GEN2_HIGH_CRIT = new Set([
  'karate-chop',
  'razor-wind',
  'razor-leaf',
  'crabhammer',
  'slash',
  'aeroblast',
  'cross-chop',
])

/** Gen 3 -- pokeemerald Cmd_critcalc, sCriticalHitChance {16, 8, 4, 3, 2}. Gen 4 -- pokeplatinum sCriticalStageRates, the same. */
const GEN34_RATE = [16, 8, 4, 3, 2]
const GEN3_HIGH_CRIT_EFFECTS = new Set([
  'EFFECT_HIGH_CRITICAL',
  'EFFECT_SKY_ATTACK',
  'EFFECT_BLAZE_KICK',
  'EFFECT_POISON_TAIL',
])

export function critChance(
  ctx: GameContext,
  data: BattleData,
  inp: CritInput,
  moveSlug: string,
): number {
  const gen = ctx.generation
  if (gen === 1) return gen1Crit(data, inp)
  const held = heldEffect(data, inp.itemId)?.h ?? ''
  if (gen === 2) {
    // Lucky Punch Chansey / Stick Farfetch'd set +2 and jump straight to the tally,
    // skipping Focus Energy, the high-crit move and Scope Lens -- they never stack.
    // The game compares the ITEM (cp LUCKY_PUNCH / cp STICK in BattleCommand_Critical);
    // neither has a held effect in Gen 2, so this reads the item, not the effect.
    const item = inp.itemId != null ? getItem(inp.itemId)?.name : undefined
    if (
      (inp.speciesSlug === 'chansey' && item === 'lucky-punch') ||
      (inp.speciesSlug === 'farfetchd' && item === 'stick')
    ) {
      return GEN2_CRIT[2] / 256
    }
    let c = 0
    if (inp.focusEnergy) c += 1
    if (GEN2_HIGH_CRIT.has(moveSlug)) c += 2
    if (held === 'HELD_CRITICAL_UP') c += 1
    return GEN2_CRIT[Math.min(c, GEN2_CRIT.length - 1)] / 256
  }
  if (inp.targetBlocks || inp.luckyChant) return 0
  const effect = gameMove(data, inp.moveId)?.e ?? ''
  let c = 0
  if (inp.focusEnergy) c += 2
  if (gen === 3) {
    if (GEN3_HIGH_CRIT_EFFECTS.has(effect)) c += 1
    if (held === 'HOLD_EFFECT_SCOPE_LENS') c += 1
    if (held === 'HOLD_EFFECT_LUCKY_PUNCH' && inp.speciesSlug === 'chansey') c += 2
    if (held === 'HOLD_EFFECT_STICK' && inp.speciesSlug === 'farfetchd') c += 2
  } else {
    // Gen 4: the move's own crit stage comes from its effect (BattleSystem_CalcCriticalMulti's criticalStage).
    if (/HIGH_CRITICAL/.test(effect) || effect === 'BATTLE_EFFECT_CHARGE_TURN_HIGH_CRIT_FLINCH')
      c += 1
    if (held === 'HOLD_EFFECT_CRITRATE_UP') c += 1
    if (inp.abilitySlug === 'super-luck') c += 1
    if (held === 'HOLD_EFFECT_CHANSEY_CRITRATE_UP' && inp.speciesSlug === 'chansey') c += 2
    if (held === 'HOLD_EFFECT_FARFETCHD_CRITRATE_UP' && inp.speciesSlug === 'farfetchd') c += 2
  }
  return 1 / GEN34_RATE[Math.min(c, 4)]
}

// --------------------------------------------------------------- accuracy

/** Gen 1 StatModifierRatios (pokered data/battle/stat_modifiers.asm), stage -6..+6. */
const GEN1_RATIOS: [number, number][] = [
  [25, 100],
  [28, 100],
  [33, 100],
  [40, 100],
  [50, 100],
  [66, 100],
  [1, 1],
  [15, 10],
  [2, 1],
  [25, 10],
  [3, 1],
  [35, 10],
  [4, 1],
]
/** Gen 2-4 accuracy multipliers (pokecrystal accuracy_multipliers.asm = pokeemerald sAccuracyStageRatios). */
const ACC_RATIOS: [number, number][] = [
  [33, 100],
  [36, 100],
  [43, 100],
  [50, 100],
  [60, 100],
  [75, 100],
  [1, 1],
  [133, 100],
  [166, 100],
  [2, 1],
  [233, 100],
  [133, 50],
  [3, 1],
]

export interface AccuracyInput {
  moveId: number
  accStage: number
  evaStage: number
  weather: string | null
  attackerAbility: string
  targetAbility: string
  targetItemId: number | null
  /** Category for Hustle (Gen 3: by type). */
  physical: boolean
  /** Lock-On / Mind Reader, X Accuracy (Gen 1-2), No Guard. */
  sureHit: boolean
}

/** P(hit) for one use. 1 for moves that cannot miss. */
export function hitChance(ctx: GameContext, data: BattleData, inp: AccuracyInput): number {
  const gm = gameMove(data, inp.moveId)
  if (!gm) return 1
  if (inp.sureHit) return 1
  const gen = ctx.generation
  if (gen <= 2) {
    if (gen === 1 && gm.e === 'SWIFT_EFFECT') return 1
    if (gen === 2 && gm.e === 'EFFECT_ALWAYS_HIT') return 1
    let acc = gm.ab ?? Math.floor((gm.a * 255) / 100)
    // Gen 2 Thunder in rain always hits (BattleCommand_CheckHit .ThunderRain).
    if (gen === 2 && gm.e === 'EFFECT_THUNDER' && inp.weather === 'rain') return 1
    const table = gen === 1 ? GEN1_RATIOS : ACC_RATIOS
    for (const stage of [inp.accStage, -inp.evaStage]) {
      const [n, d] = table[Math.max(0, Math.min(12, stage + 6))]
      acc = Math.floor((acc * n) / d)
      if (acc === 0) acc = 1
    }
    acc = Math.min(255, acc)
    if (gen === 2) {
      // BrightPowder subtracts its parameter from the byte.
      const held = heldEffect(data, inp.targetItemId)
      if (held?.h === 'HELD_BRIGHTPOWDER') acc = Math.max(0, acc - held.v)
      if (acc === 255) return 1 // Gen 2 skips the roll at 255
    }
    // Gen 1: a random byte below the accuracy hits -- 255 is still a 255/256 hit.
    return acc / 256
  }
  if (gm.a === 0) return 1
  if (inp.attackerAbility === 'no-guard' || inp.targetAbility === 'no-guard') return 1
  let moveAcc = gm.a
  if (inp.weather === 'rain' && /THUNDER/.test(gm.e) && gen >= 3) return 1
  if (inp.weather === 'sun' && /THUNDER/.test(gm.e)) moveAcc = 50
  const buff = Math.max(0, Math.min(12, inp.accStage - inp.evaStage + 6))
  let calc = Math.floor((ACC_RATIOS[buff][0] * moveAcc) / ACC_RATIOS[buff][1])
  if (inp.attackerAbility === 'compound-eyes') calc = Math.floor((calc * 130) / 100)
  if (inp.weather === 'sand' && inp.targetAbility === 'sand-veil')
    calc = Math.floor((calc * 80) / 100)
  if (gen >= 4 && inp.weather === 'hail' && inp.targetAbility === 'snow-cloak')
    calc = Math.floor((calc * 80) / 100)
  if (inp.attackerAbility === 'hustle' && inp.physical) calc = Math.floor((calc * 80) / 100)
  const held = heldEffect(data, inp.targetItemId)
  if (held && (held.h === 'HOLD_EFFECT_EVASION_UP' || held.h === 'HOLD_EFFECT_ACC_REDUCE')) {
    calc = Math.floor((calc * (100 - held.v)) / 100)
  }
  // pokeemerald: miss when (Random() % 100 + 1) > calc.
  return Math.max(0, Math.min(100, calc)) / 100
}

// ------------------------------------------------------------- multi-hit

export interface HitCount {
  hits: number
  p: number
}

/**
 * How many times a multi-hit move hits. 2-5 hit moves are 3/8, 3/8, 1/8, 1/8 in
 * every generation in scope (pokered TwoToFiveAttacksEffect; pokeemerald
 * Cmd_setmultihitcounter), with Skill Link (Gen 4) always five. Gen 2 Triple
 * Kick hits 1-3 times uniformly (pokecrystal BattleCommand_EndLoop); from Gen 3 it
 * tries all three.
 */
export function hitCounts(
  ctx: GameContext,
  slug: string,
  minHits: number | null,
  maxHits: number | null,
  ability: string,
): HitCount[] {
  if (slug === 'triple-kick') {
    return ctx.generation === 2
      ? [1, 2, 3].map((h) => ({ hits: h, p: 1 / 3 }))
      : [{ hits: 3, p: 1 }]
  }
  if (minHits == null || maxHits == null || maxHits <= 1) return [{ hits: 1, p: 1 }]
  if (minHits === maxHits) return [{ hits: minHits, p: 1 }]
  if (ability === 'skill-link' && ctx.generation >= 4) return [{ hits: maxHits, p: 1 }]
  return [
    { hits: 2, p: 3 / 8 },
    { hits: 3, p: 3 / 8 },
    { hits: 4, p: 1 / 8 },
    { hits: 5, p: 1 / 8 },
  ]
}

// ------------------------------------------------------------- Quick Claw

/**
 * Chance Quick Claw moves its holder first. Gen 2: a byte below the item's
 * parameter, 60/256 (pokecrystal DetermineMoveOrder). Gen 3: the turn's random
 * number below 0xFFFF * param / 100 -- 20% (GetWhoStrikesFirst). Gen 4:
 * speedRand % (100 / param) == 0 -- 1 in 5 (BattleSystem_CompareBattlerSpeed).
 */
export function quickClawChance(ctx: GameContext, data: BattleData, itemId: number | null): number {
  const held = heldEffect(data, itemId)
  if (!held) return 0
  if (ctx.generation === 2 && held.h === 'HELD_QUICK_CLAW') return held.v / 256
  if (ctx.generation === 3 && held.h === 'HOLD_EFFECT_QUICK_CLAW')
    return Math.floor((0xffff * held.v) / 100) / 0x10000
  if (ctx.generation === 4 && held.h === 'HOLD_EFFECT_SOMETIMES_PRIORITY')
    return 1 / Math.floor(100 / held.v)
  return 0
}
