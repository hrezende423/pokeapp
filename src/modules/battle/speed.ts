/**
 * SPEED: effective Speed per generation with its modifiers (V2), one merged ladder
 * for both teams with exact ties flagged as 50/50 (V1), the exceptions to the
 * ladder -- priority moves, Quick Claw (V3) -- and the threshold solver (V4).
 *
 * Each generation's formula is the game's turn-order routine:
 *   Gen 1 pokered core.asm: stage ratio on the stat, the Soul Badge's +1/8 (cap
 *         999), paralysis quarters it (min 1); Quick Attack first, Counter last.
 *   Gen 2 pokecrystal DetermineMoveOrder: the same stat pipeline with the Plain
 *         Badge, move priority brackets, Quick Claw 60/256, ties a coin flip.
 *   Gen 3 pokeemerald GetWhoStrikesFirst: speed x2 for Swift Swim / Chlorophyll in
 *         their weather, stage ratio, badge x110/100, Macho Brace /2, paralysis /4,
 *         Quick Claw 20% (one roll per turn for everyone).
 *   Gen 4 pokeplatinum BattleSystem_CompareBattlerSpeed: Simple doubles the stage,
 *         weather abilities x2, speed-halving items /2, Choice Scarf x1.5, Quick
 *         Feet x1.5 OR paralysis /4, Slow Start /2, Unburden x2, Tailwind x2, Quick
 *         Claw 1 in 5, Lagging Tail and Stall last, Trick Room reverses the compare.
 */

import { getAbility, getItem, getMove, listNatures } from '../../data'
import type { Weather } from '../calculators/damage'
import type { BattleData } from './battleData'
import { gameMove, heldEffect } from './battleData'
import {
  badgeBoostsFor,
  effectiveLevel,
  speciesOf,
  statAt,
  type BattlerSpec,
  type Corner,
} from './battler'
import { quickClawChance } from './chance'
import { displayName, movePriority } from './damage'
import type { GameContext } from './game'
import type { Range } from './range'

/** Gen 1-2 stat stage multipliers (pokered data/battle/stat_modifiers.asm). */
const CLASSIC: [number, number][] = [
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
/** Gen 3-4 gStatStageRatios / sStatStageBoosts. */
const MODERN: [number, number][] = [
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

export interface SpeedMods {
  stage: number
  paralyzed: boolean
  /** Any non-volatile status (Quick Feet). */
  statused: boolean
  weather: Weather | null
  tailwind: boolean
  /** Unburden active (item consumed). */
  unburden?: boolean
  /** Slow Start still counting. */
  slowStart?: boolean
}

export const noMods = (weather: Weather | null = null): SpeedMods => ({
  stage: 0,
  paralyzed: false,
  statused: false,
  weather,
  tailwind: false,
})

const abilityOf = (b: BattlerSpec, ctx: GameContext) =>
  ctx.hasAbilities && b.abilityId != null ? (getAbility(b.abilityId)?.name ?? '') : ''

/** The Speed the turn-order routine compares, at one corner of the spread. */
export function effectiveSpeed(
  ctx: GameContext,
  data: BattleData,
  b: BattlerSpec,
  corner: Corner,
  mods: SpeedMods,
  badges: Set<string>,
): number {
  const gen = ctx.generation
  let s = statAt(b, gen, 'spe', corner)
  const ability = abilityOf(b, ctx)
  const held = heldEffect(data, ctx.hasItems ? b.itemId : null)?.h ?? ''
  const badge = badgeBoostsFor(b, ctx, badges)?.spe ?? false
  if (gen <= 2) {
    const [n, d] = CLASSIC[Math.max(0, Math.min(12, mods.stage + 6))]
    s = Math.max(1, Math.min(999, Math.floor((s * n) / d)))
    if (badge) s = Math.min(999, s + (s >> 3))
    if (mods.paralyzed) s = Math.max(1, s >> 2)
    return s
  }
  if (gen === 3) {
    const weatherMult =
      (ability === 'swift-swim' && mods.weather === 'rain') ||
      (ability === 'chlorophyll' && mods.weather === 'sun')
        ? 2
        : 1
    const [n, d] = MODERN[Math.max(0, Math.min(12, mods.stage + 6))]
    s = Math.floor((s * weatherMult * n) / d)
    if (badge) s = Math.floor((s * 110) / 100)
    if (held === 'HOLD_EFFECT_MACHO_BRACE') s = Math.floor(s / 2)
    if (mods.paralyzed) s = Math.floor(s / 4)
    return s
  }
  let stage = mods.stage
  if (ability === 'simple') stage = Math.max(-6, Math.min(6, stage * 2))
  const [n, d] = MODERN[stage + 6]
  s = Math.floor((s * n) / d)
  if (
    (ability === 'swift-swim' && mods.weather === 'rain') ||
    (ability === 'chlorophyll' && mods.weather === 'sun')
  )
    s *= 2
  const halving = [
    'HOLD_EFFECT_EVS_UP_SPEED_DOWN',
    'HOLD_EFFECT_SPEED_DOWN_GROUNDED',
    'HOLD_EFFECT_LVLUP_HP_EV_UP',
    'HOLD_EFFECT_LVLUP_ATK_EV_UP',
    'HOLD_EFFECT_LVLUP_DEF_EV_UP',
    'HOLD_EFFECT_LVLUP_SPEED_EV_UP',
    'HOLD_EFFECT_LVLUP_SPATK_EV_UP',
    'HOLD_EFFECT_LVLUP_SPDEF_EV_UP',
  ]
  if (halving.includes(held)) s = Math.floor(s / 2)
  if (held === 'HOLD_EFFECT_CHOICE_SPEED') s = Math.floor((s * 15) / 10)
  if (held === 'HOLD_EFFECT_DITTO_SPEED_UP' && speciesOf(b).name === 'ditto') s *= 2
  if (ability === 'quick-feet' && mods.statused) s = Math.floor((s * 15) / 10)
  else if (mods.paralyzed) s = Math.floor(s / 4)
  if (ability === 'slow-start' && mods.slowStart) s = Math.floor(s / 2)
  if (ability === 'unburden' && mods.unburden) s *= 2
  if (mods.tailwind) s *= 2
  return s
}

export function speedRange(
  ctx: GameContext,
  data: BattleData,
  b: BattlerSpec,
  mods: SpeedMods,
  badges: Set<string>,
): Range {
  const lo = effectiveSpeed(ctx, data, b, 'low', mods, badges)
  const hi = effectiveSpeed(ctx, data, b, 'high', mods, badges)
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) }
}

/** Gen 4 always-last effects (Lagging Tail, Stall) and Quick Claw, as ladder exceptions. */
export interface SpeedException {
  kind: 'priority' | 'quick-claw' | 'always-last'
  label: string
  /** Priority bracket (relative: 0 = normal) or chance (Quick Claw). */
  value: number
}

export interface LadderEntry {
  key: string
  side: 'mine' | 'theirs'
  name: string
  level: number
  speed: Range
  exceptions: SpeedException[]
  ceiling: boolean
  scenarioId: string | null
  spreadMode: string
}

export interface LadderRow extends LadderEntry {
  /** Index in the ladder after sorting. */
  rank: number
  /** Entries this one EXACTLY ties with (single-value Speed, equal): 50/50. */
  ties: string[]
  /** Entries whose ranges overlap this one without an exact tie: roll-dependent on the spread. */
  overlaps: string[]
}

export function speedExceptions(
  ctx: GameContext,
  data: BattleData,
  b: BattlerSpec,
): SpeedException[] {
  const out: SpeedException[] = []
  for (const id of b.moves) {
    const pr = movePriority(ctx, data, id)
    if (pr !== 0)
      out.push({ kind: 'priority', label: getMove(id)?.display_name ?? `#${id}`, value: pr })
  }
  const qc = quickClawChance(ctx, data, ctx.hasItems ? b.itemId : null)
  if (qc > 0)
    out.push({
      kind: 'quick-claw',
      label: getItem(b.itemId!)?.display_name ?? 'Quick Claw',
      value: qc,
    })
  const held = heldEffect(data, ctx.hasItems ? b.itemId : null)?.h
  if (ctx.generation === 4 && held === 'HOLD_EFFECT_PRIORITY_DOWN')
    out.push({
      kind: 'always-last',
      label: getItem(b.itemId!)?.display_name ?? 'Lagging Tail',
      value: 0,
    })
  if (ctx.generation === 4 && abilityOf(b, ctx) === 'stall')
    out.push({ kind: 'always-last', label: 'Stall', value: 0 })
  return out
}

/** V1: one ladder for both teams. Trick Room (Gen 4) reverses the order. */
export function speedLadder(
  ctx: GameContext,
  data: BattleData,
  entries: { spec: BattlerSpec; mods: SpeedMods }[],
  badges: Set<string>,
  trickRoom: boolean,
): LadderRow[] {
  const rows: LadderEntry[] = entries.map(({ spec, mods }) => ({
    key: spec.key,
    side: spec.side,
    name: displayName(spec),
    level: effectiveLevel(spec),
    speed: speedRange(ctx, data, spec, mods, badges),
    exceptions: speedExceptions(ctx, data, spec),
    ceiling: spec.spread.ceiling,
    scenarioId: spec.scenarioId,
    spreadMode: spec.spreadMode,
  }))
  const dir = trickRoom && ctx.trickRoom ? 1 : -1
  rows.sort(
    (a, b) =>
      dir * (a.speed.max - b.speed.max) ||
      dir * (a.speed.min - b.speed.min) ||
      (a.side === 'mine' ? -1 : 1),
  )
  return rows.map((r, rank) => {
    const ties: string[] = []
    const overlaps: string[] = []
    for (const o of rows) {
      if (o === r) continue
      const exact =
        r.speed.min === r.speed.max && o.speed.min === o.speed.max && r.speed.min === o.speed.min
      if (exact) ties.push(o.key)
      else if (r.speed.min <= o.speed.max && o.speed.min <= r.speed.max) overlaps.push(o.key)
    }
    return { ...r, rank, ties, overlaps }
  })
}

/**
 * P(a moves before b) with both choosing a move of the given priorities. Exact
 * for single-value Speeds; for ranges, the two corners bound it.
 */
export function firstProbability(
  ctx: GameContext,
  data: BattleData,
  a: BattlerSpec,
  aMods: SpeedMods,
  aPriority: number,
  b: BattlerSpec,
  bMods: SpeedMods,
  bPriority: number,
  badges: Set<string>,
  trickRoom: boolean,
): Range {
  if (aPriority !== bPriority)
    return aPriority > bPriority ? { min: 1, max: 1 } : { min: 0, max: 0 }
  const qa = quickClawChance(ctx, data, ctx.hasItems ? a.itemId : null)
  const qb = quickClawChance(ctx, data, ctx.hasItems ? b.itemId : null)
  const tr = trickRoom && ctx.trickRoom
  const plain = (sa: number, sb: number) => (sa === sb ? 0.5 : sa > sb !== tr ? 1 : 0)
  const at = (ca: Corner, cb: Corner) => {
    const sa = effectiveSpeed(ctx, data, a, ca, aMods, badges)
    const sb = effectiveSpeed(ctx, data, b, cb, bMods, badges)
    const base = plain(sa, sb)
    if (ctx.generation === 3) {
      // One turn roll decides every Quick Claw at once.
      if (qa && qb) return base
      return qa ? qa + (1 - qa) * base : qb ? (1 - qb) * base : base
    }
    // Gen 2 checks the enemy's claw first; Gen 4 compares speeds when both fire.
    const aWins = qa * (1 - qb)
    const bWins = qb * (1 - qa)
    const both = qa * qb
    const neither = (1 - qa) * (1 - qb)
    return aWins + neither * base + both * base + bWins * 0
  }
  const lo = at('low', 'high')
  const hi = at('high', 'low')
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) }
}

// ------------------------------------------------------------- V4 solver

export interface SpeedThreshold {
  /** The Speed the target can reach (its max). */
  target: number
  /** Ours as it stands (max). */
  current: number
  outspeedsNow: boolean
  /** Minimum level that outspeeds with the current spread, or null if none <= 100. */
  minLevel: number | null
  /** Minimum Speed EV (Gen 3-4) or Stat Exp (Gen 1-2) with the current nature/IV, or null. */
  minEffort: number | null
  /** Same with a +Speed nature (Gen 3-4), or null. */
  minEffortPlusNature: number | null
  /** Whether a tie (not a win) is the best reachable. */
  bestIsTie: boolean
}

export function speedThreshold(
  ctx: GameContext,
  data: BattleData,
  mine: BattlerSpec,
  mineMods: SpeedMods,
  target: BattlerSpec,
  targetMods: SpeedMods,
  badges: Set<string>,
): SpeedThreshold {
  const goal = effectiveSpeed(ctx, data, target, 'high', targetMods, badges)
  const cur = effectiveSpeed(ctx, data, mine, 'high', mineMods, badges)
  const at = (patch: Partial<BattlerSpec>) =>
    effectiveSpeed(ctx, data, { ...mine, ...patch }, 'high', mineMods, badges)
  let minLevel: number | null = null
  for (let lv = 1; lv <= 100; lv++) {
    if (at({ levelOverride: lv }) > goal) {
      minLevel = lv
      break
    }
  }
  const speKey = 'speed' as const
  const solveEffort = (natureIds: number[] | null): number | null => {
    const step = ctx.spreadModel === 'ev' ? 4 : 1
    const max = ctx.maxEffort
    // Binary search: Speed is monotonic in effort.
    const speedAt = (e: number) =>
      at({
        spread: {
          ...mine.spread,
          natureIds: natureIds ?? mine.spread.natureIds,
          effort: { ...mine.spread.effort, [speKey]: { min: e, max: e } },
        },
      })
    if (speedAt(max) <= goal) return null
    let lo = 0
    let hi = max
    while (hi - lo > step) {
      const m = Math.floor((lo + hi) / 2 / step) * step
      if (speedAt(m) > goal) hi = m
      else lo = m
    }
    return speedAt(lo) > goal ? lo : hi
  }
  return {
    target: goal,
    current: cur,
    outspeedsNow: cur > goal,
    minLevel,
    minEffort: solveEffort(null),
    minEffortPlusNature: ctx.hasNatures ? solveEffort(speedNatureIds()) : null,
    bestIsTie:
      at({
        spread: {
          ...mine.spread,
          effort: { ...mine.spread.effort, speed: { min: ctx.maxEffort, max: ctx.maxEffort } },
        },
      }) === goal,
  }
}

/** The four natures that raise Speed (Timid, Hasty, Jolly, Naive), from the bundle's records. */
function speedNatureIds(): number[] {
  return listNatures()
    .filter((n) => n.increased_stat === 'speed' && n.decreased_stat !== 'speed')
    .map((n) => n.id)
}

/** A move's effect constant, for the exception labels. */
export const moveEffectOf = (data: BattleData, moveId: number) => gameMove(data, moveId)?.e ?? ''
