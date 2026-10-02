/**
 * A Pokemon as the matchup engine sees it: what it IS (species, level, moves,
 * item, ability) and its SPREAD, every number of which may be a range (S7c).
 *
 * THE SPREAD IS NEVER THE SAVED BUILD. "Use current spread" (S7a) copies the
 * saved values in as single-value ranges and is read-only in the UI; "Customize"
 * (S7b) edits a copy held in the matchup's own state. Nothing here writes back to
 * Team Building -- there is no import of the store's writers in this module.
 *
 * RANGES BECOME CORNERS. Damage is monotonic in the attacker's attacking stat and
 * in the defender's HP and defending stat, and a speed comparison is monotonic in
 * each Speed, so the extremes of every output are reached at the extremes of the
 * inputs: `resolve(spec, corner)` builds the concrete CalcPokemon at the low or
 * high end of every ranged value, choosing among candidate natures the one that
 * pushes the stat in question furthest. Two evaluations bound the result exactly;
 * nothing samples the inside of a range.
 */

import {
  getAbility,
  getItem,
  getNature,
  getSpecies,
  listNatures,
  resolveStatsForGeneration,
  type Nature,
  type Species,
  type Variety,
} from '../../data'
import type { BadgeBoosts, Boosts, CalcPokemon, StatusId } from '../calculators/damage'
import { computeStat, dvFor, type StatKey, type StatNumbers } from '../team-builder/statMath'
import type { Badge, GameContext } from './game'
import { glacierBoostsSpDef } from './game'
import { point, type Range } from './range'

/** The engine's short stat ids. */
export type StatId = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'

export const STAT_IDS: StatId[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

/** Engine id -> statMath key, per era (Gen 1 has one Special for both halves). */
export function statKey(stat: StatId, gen: number): StatKey {
  switch (stat) {
    case 'hp':
      return 'hp'
    case 'atk':
      return 'attack'
    case 'def':
      return 'defense'
    case 'spe':
      return 'speed'
    case 'spa':
      return gen === 1 ? 'special' : 'special-attack'
    case 'spd':
      return gen === 1 ? 'special' : 'special-defense'
  }
}

/** The keys a spread is EDITED in: Gen 1-2 four DVs and five Stat Exp; Gen 3-4 six of each. */
export function spreadKeys(gen: number): { individual: StatKey[]; effort: StatKey[] } {
  if (gen <= 2) {
    return {
      individual: ['attack', 'defense', 'speed', 'special'],
      effort: ['hp', 'attack', 'defense', 'speed', 'special'],
    }
  }
  const six: StatKey[] = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed']
  return { individual: six, effort: six }
}

export type SpreadMode = 'current' | 'custom'

export interface SpreadSpec {
  individual: Partial<Record<StatKey, Range>>
  effort: Partial<Record<StatKey, Range>>
  /** Candidate natures (Gen 3-4). One id = known; several = "one of these"; empty = any. */
  natureIds: number[]
  /**
   * Set by the "Maximize all EVs" preset in Gen 3-4, where 252 in every stat is
   * 1512 against the 510 cap. Every output produced from it is a BEST-CASE
   * CEILING, not a real spread (S7d), and carries this flag to the screen.
   */
  ceiling: boolean
}

export interface BattlerSpec {
  /** Stable within a matchup: 'mine:3', 'theirs:TRAINER_CYNTHIA:0'. */
  key: string
  side: 'mine' | 'theirs'
  source: 'build' | 'trainer' | 'facility' | 'custom'
  label: string
  speciesId: number
  /** Variety slug ('rotom-wash'). */
  varietyName: string
  level: number
  /** R4: an override level (what-if slider); null uses `level`. */
  levelOverride?: number | null
  spreadMode: SpreadMode
  /** The scenario this spread came from (S7e/S7f), or null for the saved spread. */
  scenarioId: string | null
  spread: SpreadSpec
  /** PokeAPI move ids, up to four. */
  moves: number[]
  itemId: number | null
  abilityId: number | null
  gender: 'M' | 'F' | 'N'
  /** Gen 4 trainer whose IVs overflow into random (Platinum Volkner's Electivire). */
  ivRandom?: boolean
  /** Where it came from, for linking back (build id, trainer id + slot). */
  origin?: { buildId?: string; trainerId?: string; slot?: number; versionGroup?: string }
}

export const effectiveLevel = (b: BattlerSpec): number => b.levelOverride ?? b.level

export function speciesOf(b: BattlerSpec): Species {
  const s = getSpecies(b.speciesId)
  if (!s) throw new Error(`unknown species ${b.speciesId}`)
  return s
}

export function varietyOfSpec(b: BattlerSpec): Variety {
  const s = speciesOf(b)
  return (
    s.varieties.find((v) => v.name === b.varietyName) ??
    s.varieties.find((v) => v.is_default) ??
    s.varieties[0]
  )
}

export function baseStat(b: BattlerSpec, gen: number, stat: StatId): number {
  const key = statKey(stat, gen)
  return (
    resolveStatsForGeneration(varietyOfSpec(b), gen).find((s) => s.stat === key)?.base_stat ?? 0
  )
}

/** A spread of single values, from saved numbers. */
export function exactSpread(
  gen: number,
  individual: StatNumbers,
  effort: StatNumbers,
  natureId: number | null,
): SpreadSpec {
  const keys = spreadKeys(gen)
  return {
    individual: Object.fromEntries(keys.individual.map((k) => [k, point(individual[k] ?? 0)])),
    effort: Object.fromEntries(keys.effort.map((k) => [k, point(effort[k] ?? 0)])),
    natureIds: gen >= 3 && natureId != null ? [natureId] : [],
    ceiling: false,
  }
}

/**
 * S7d: "Maximize all EVs". Gen 1-2: 65535 Stat Exp in every stat, which IS a
 * legal spread (Stat Exp has no total). Gen 3-4: 252 in every stat -- 1512
 * against the 510 cap -- so the spread is flagged a ceiling.
 */
export function maximizeEffort(spread: SpreadSpec, ctx: GameContext): SpreadSpec {
  const keys = spreadKeys(ctx.generation).effort
  return {
    ...spread,
    effort: Object.fromEntries(keys.map((k) => [k, point(ctx.maxEffort)])),
    ceiling: ctx.effortTotalCap != null,
  }
}

/** Is a spread over the era's EV total? (Only possible in Gen 3-4.) */
export function spreadExceedsCap(spread: SpreadSpec, ctx: GameContext): boolean {
  if (ctx.effortTotalCap == null) return false
  const total = Object.values(spread.effort).reduce((s, r) => s + (r?.min ?? 0), 0)
  return total > ctx.effortTotalCap
}

// ------------------------------------------------------------------- corners

export type Corner = 'low' | 'high'

/** Which way a corner pushes each stat. Unlisted stats take the spread's low end. */
export type CornerPlan = Partial<Record<StatId, Corner>>

const natureMult = (n: Nature | null | undefined, key: StatKey): number => {
  if (!n || key === 'hp') return 1
  if (n.increased_stat === n.decreased_stat) return 1
  if (n.increased_stat === key) return 1.1
  if (n.decreased_stat === key) return 0.9
  return 1
}

function candidateNatures(spec: SpreadSpec): Nature[] {
  const ids = spec.natureIds.length ? spec.natureIds : listNatures().map((n) => n.id)
  return ids.map((id) => getNature(id)).filter((n): n is Nature => n != null)
}

/**
 * The nature among the candidates that best serves the plan: the first planned
 * stat (the one the caller cares most about) decides, ties broken by the next.
 */
function pickNature(
  spec: SpreadSpec,
  gen: number,
  plan: CornerPlan,
  order: StatId[],
): Nature | null {
  if (gen < 3) return null
  const cands = candidateNatures(spec)
  if (cands.length <= 1) return cands[0] ?? null
  const score = (n: Nature) =>
    order.map((s) => {
      const m = natureMult(n, statKey(s, gen))
      return plan[s] === 'high' ? m : plan[s] === 'low' ? -m : 0
    })
  let best = cands[0]
  let bestScore = score(best)
  for (const n of cands.slice(1)) {
    const sc = score(n)
    for (let i = 0; i < sc.length; i++) {
      if (sc[i] > bestScore[i]) {
        best = n
        bestScore = sc
        break
      }
      if (sc[i] < bestScore[i]) break
    }
  }
  return best
}

/** Concrete IV/EV numbers at a corner. Gen 1-2 HP DV follows the other four, so it is not set. */
function cornerNumbers(
  spec: SpreadSpec,
  gen: number,
  plan: CornerPlan,
): { individual: StatNumbers; effort: StatNumbers } {
  const individual: StatNumbers = {}
  const effort: StatNumbers = {}
  const pickFor = (key: StatKey): Corner => {
    // Gen 1-2 Special DV/Stat Exp serve both halves; Gen 1 Special one stat.
    // (Gen 1-2 HP DV parity is steered separately, in statAt / resolveAt.)
    const owners = STAT_IDS.filter(
      (s) =>
        statKey(s, gen) === key || (gen === 2 && key === 'special' && (s === 'spa' || s === 'spd')),
    )
    for (const s of owners) if (plan[s]) return plan[s]!
    return 'low'
  }
  for (const [k, r] of Object.entries(spec.individual) as [StatKey, Range][]) {
    individual[k] = pickFor(k) === 'high' ? r.max : r.min
  }
  for (const [k, r] of Object.entries(spec.effort) as [StatKey, Range][]) {
    effort[k] = pickFor(k) === 'high' ? r.max : r.min
  }
  return { individual, effort }
}

/** Every stat's range across the whole spread (for the speed ladder and stat readouts). */
export function statRanges(b: BattlerSpec, gen: number): Record<StatId, Range> {
  const out = {} as Record<StatId, Range>
  for (const s of STAT_IDS) {
    const lo = statAt(b, gen, s, 'low')
    const hi = statAt(b, gen, s, 'high')
    out[s] = { min: Math.min(lo, hi), max: Math.max(lo, hi) }
  }
  return out
}

/** One stat at one corner, exactly as the game computes it. */
export function statAt(b: BattlerSpec, gen: number, stat: StatId, corner: Corner): number {
  const plan: CornerPlan = { [stat]: corner }
  const key = statKey(stat, gen)
  const nature = pickNature(b.spread, gen, plan, [stat])
  const { individual, effort } = cornerNumbers(b.spread, gen, plan)
  if (gen <= 2 && stat === 'hp') {
    // HP DV = parity bits of the other four: pick each DV's end to push parity.
    for (const k of ['attack', 'defense', 'speed', 'special'] as StatKey[]) {
      const r = b.spread.individual[k]
      if (!r) continue
      const want = corner === 'high' ? 1 : 0
      // the largest (high) or smallest (low) value in range with the wanted parity
      const candidates: number[] = []
      for (let v = r.min; v <= r.max; v++) if ((v & 1) === want) candidates.push(v)
      individual[k] = candidates.length
        ? corner === 'high'
          ? candidates[candidates.length - 1]
          : candidates[0]
        : corner === 'high'
          ? r.max
          : r.min
    }
  }
  if (b.ivRandom && gen >= 3) {
    // The game rolls these; the corner takes the extreme.
    for (const k of Object.keys(individual) as StatKey[]) individual[k] = corner === 'high' ? 31 : 0
  }
  const raw = computeStat({
    generation: gen,
    level: effectiveLevel(b),
    base: baseStat(b, gen, stat),
    key,
    effort: spreadForGen2(effort, gen),
    individual: spreadForGen2(individual, gen),
    nature: {
      increased: (nature?.increased_stat as StatKey) ?? null,
      decreased: (nature?.decreased_stat as StatKey) ?? null,
    },
  })
  return raw
}

/** Gen 2 split the Special stat, not its DV or Stat Exp: one value feeds both. */
function spreadForGen2(spread: StatNumbers, gen: number): StatNumbers {
  if (gen !== 2) return spread
  const special = spread.special ?? 0
  return { ...spread, 'special-attack': special, 'special-defense': special }
}

export interface BattleConditions {
  status: StatusId
  boosts: Boosts
  /** Current HP; null = full. */
  currentHp: number | null
  abilityOn: boolean
}

export const freshConditions = (): BattleConditions => ({
  status: 'healthy',
  boosts: {},
  currentHp: null,
  abilityOn: false,
})

/**
 * The player's badge boosts for one Pokemon, from the owned badges. Only the
 * player's side ever gets them; the opponent's spec never does.
 */
export function badgeBoostsFor(
  b: BattlerSpec,
  ctx: GameContext,
  owned: Set<string>,
): BadgeBoosts | undefined {
  if (b.side !== 'mine' || !ctx.badgeRule || !owned.size) return undefined
  const out: BadgeBoosts = {}
  for (const badge of ctx.badges as Badge[]) {
    if (!owned.has(badge.id)) continue
    for (const s of badge.stats) out[s] = true
    if (badge.type && ctx.generation === 2) (out.types ??= []).push(badge.type)
  }
  // Gen 2's Glacier Badge Special Defense half fires only for some Sp. Atk values.
  if (ctx.generation === 2 && owned.has('glacier')) {
    const spa = statAt(b, 2, 'spa', 'high')
    if (!glacierBoostsSpDef(spa)) delete out.spd
  }
  return out
}

/**
 * The engine's CalcPokemon at a corner. `plan` says which stats to push which way
 * (an attacker's attacking stat high, a defender's HP and defence low, ...).
 */
export function resolveAt(
  b: BattlerSpec,
  ctx: GameContext,
  plan: CornerPlan,
  conditions: BattleConditions,
  badges?: BadgeBoosts,
): CalcPokemon {
  const gen = ctx.generation
  const order = (Object.keys(plan) as StatId[]).filter((s) => plan[s])
  const nature = pickNature(b.spread, gen, plan, order)
  const { individual, effort } = cornerNumbers(b.spread, gen, plan)
  if (gen <= 2 && plan.hp) {
    for (const k of ['attack', 'defense', 'speed', 'special'] as StatKey[]) {
      const r = b.spread.individual[k]
      if (
        !r ||
        plan[k === 'attack' ? 'atk' : k === 'defense' ? 'def' : k === 'speed' ? 'spe' : 'spa']
      )
        continue
      const want = plan.hp === 'high' ? 1 : 0
      const c: number[] = []
      for (let v = r.min; v <= r.max; v++) if ((v & 1) === want) c.push(v)
      if (c.length) individual[k] = plan.hp === 'high' ? c[c.length - 1] : c[0]
    }
  }
  if (b.ivRandom && gen >= 3) {
    for (const k of Object.keys(individual) as StatKey[]) {
      const s = STAT_IDS.find((x) => statKey(x, gen) === k)
      individual[k] = s && plan[s] === 'high' ? 31 : s && plan[s] === 'low' ? 0 : 31
    }
  }
  const species = speciesOf(b)
  return {
    species,
    variety: varietyOfSpec(b),
    level: effectiveLevel(b),
    individual,
    effort,
    nature: gen >= 3 ? nature : null,
    ability: gen >= 3 && b.abilityId != null ? (getAbility(b.abilityId) ?? null) : null,
    abilityOn: conditions.abilityOn,
    item: gen >= 2 && b.itemId != null ? (getItem(b.itemId) ?? null) : null,
    status: conditions.status,
    boosts: conditions.boosts,
    currentHp: conditions.currentHp,
    gender: b.gender,
    badgeBoosts: badges,
  }
}

/** HP DV for display (Gen 1-2), from concrete DVs. */
export const hpDv = (individual: StatNumbers): number => dvFor(individual, 'hp')
