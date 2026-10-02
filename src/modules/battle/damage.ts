/**
 * DAMAGE, AS A DISTRIBUTION (D1-D4).
 *
 * The numbers come from the ported Showdown engine (calculators/damage), which is
 * checked roll for roll against the reference -- this module never re-derives a
 * formula. What it adds is everything a single "min-max" line leaves out:
 *
 *   - THE FULL ROLL SET: 39 rolls in Gen 1-2 (217..255 over 255), 16 in Gen 3-4
 *     (85..100), each equally likely, for a normal hit AND for a critical hit;
 *   - ACCURACY, CRIT CHANCE and MULTI-HIT COUNTS as exact probabilities
 *     (chance.ts), combined into one per-use distribution;
 *   - KO PROBABILITY over 1..N uses, exact (a convolution, not a sample), with
 *     end-of-turn residual damage and Leftovers between uses (D4);
 *   - RANGES: every spread value may be a range, so every quantity is computed at
 *     the two corners that bound it (battler.ts) and reported as min-max.
 *
 * Gen 1 multi-hit moves compute their damage ONCE and repeat it (pokered
 * TwoToFiveAttacksEffect sets a hit count; the damage is reapplied), with one crit
 * check for the whole move. Gen 2-4 loop back to the crit check for every hit
 * (pokecrystal BattleCommand_EndLoop "Loop back to 'critical'"; pokeemerald
 * multi-hit script), so each hit rolls its own crit and damage. Accuracy is
 * checked once per use in every generation.
 */

import {
  calculateDamage,
  emptySide,
  type CalcField,
  type CalcPokemon,
  type DamageResult,
  type SideConditions,
  type StatusId,
  type Weather,
} from '../calculators/damage'
import { getMove, getSpecies, getType, resolveTypesForGeneration } from '../../data'
import type { BattleData } from './battleData'
import { gameMove } from './battleData'
import {
  badgeBoostsFor,
  baseStat,
  resolveAt,
  speciesOf,
  varietyOfSpec,
  type BattleConditions,
  type BattlerSpec,
  type CornerPlan,
} from './battler'
import { critChance, hitChance, hitCounts, type HitCount } from './chance'
import type { GameContext } from './game'
import { getAbility } from '../../data'
import type { Range } from './range'
import { spreadOf } from './engine/doubles'

/** The field as the matchup holds it: per SIDE, not per attacker. */
export interface MatchField {
  weather: Weather | null
  gravity: boolean
  trickRoom: boolean
  /**
   * A double battle (S6, Gen 3-4): one-on-one figures take the doubles formula as
   * when both foes stand -- a spread move reduced, screens at 2/3.
   */
  doubles?: boolean
  sides: {
    mine: SideConditions & { tailwind?: boolean; leechSeed?: boolean; luckyChant?: boolean }
    theirs: SideConditions & { tailwind?: boolean; leechSeed?: boolean; luckyChant?: boolean }
  }
}

export function emptyMatchField(): MatchField {
  return {
    weather: null,
    gravity: false,
    trickRoom: false,
    sides: { mine: emptySide(), theirs: emptySide() },
  }
}

export function calcFieldFor(field: MatchField, attackerSide: 'mine' | 'theirs'): CalcField {
  const other = attackerSide === 'mine' ? 'theirs' : 'mine'
  return {
    weather: field.weather,
    gravity: field.gravity,
    attackerSide: { ...field.sides[attackerSide] },
    defenderSide: { ...field.sides[other] },
  }
}

/** A probability distribution over integer damage. */
export type Dist = Map<number, number>

function add(d: Dist, v: number, p: number) {
  if (p <= 0) return
  d.set(v, (d.get(v) ?? 0) + p)
}

function convolve(a: Dist, b: Dist, cap: number): Dist {
  const out: Dist = new Map()
  for (const [x, px] of a) for (const [y, py] of b) add(out, Math.min(cap, x + y), px * py)
  return out
}

function uniform(values: number[], weight = 1): Dist {
  const d: Dist = new Map()
  for (const v of values) add(d, v, weight / values.length)
  return d
}

function mix(...parts: [Dist, number][]): Dist {
  const out: Dist = new Map()
  for (const [d, w] of parts) for (const [v, p] of d) add(out, v, p * w)
  return out
}

/** The rolls of one use's hit `i` from the engine's damage shape. */
function hitRolls(damage: DamageResult['damage'], i: number): number[] {
  if (typeof damage === 'number') return [damage]
  if (Array.isArray(damage[0])) return (damage as number[][])[Math.min(i, damage.length - 1)]
  return damage as number[]
}

export type DamageStatus = 'ok' | 'status' | 'immune' | 'variable' | 'unknown-move'

export interface CornerDamage {
  maxHp: number
  startHp: number
  /** Rolls of one full use (all hits) for the most likely hit count, normal and crit. */
  rolls: number[]
  critRolls: number[]
  /** One use: misses, crits, rolls and hit counts all folded in. */
  dist: Dist
  /** P(KO by the end of use n), n = 1..uses (index 0 = 1 use). */
  ko: number[]
  /** Uses to KO with every roll minimal / maximal, no misses or crits; Infinity if never. */
  nhkoMinRoll: number
  nhkoMaxRoll: number
  description: string
  result: DamageResult | null
}

export interface MoveDamage {
  moveId: number
  name: string
  type: string
  category: string
  status: DamageStatus
  priority: number
  accuracy: number
  critChance: number
  hitCounts: HitCount[]
  /** low = least damage (weak attacker corner, bulky defender corner); high = most. */
  low: CornerDamage | null
  high: CornerDamage | null
  /** Non-crit damage of one use, min across the low corner to max across the high one. */
  damage: Range
  percent: Range
  critPercent: Range
  /** Uses to KO from rolls alone (no misses/crits): best case .. worst case. */
  hitsToKO: Range
  /** P(KO within n uses), min (low corner) .. max (high corner), n = 1..uses. */
  koChance: Range[]
  /** Expected % of max HP per use, accuracy and crits included (midpoint of the corners). */
  expectedPct: number
  /** From the "Maximize all EVs" preset in Gen 3-4: a best-case ceiling, not a real spread. */
  ceiling: boolean
  notes: string[]
}

export interface ResidualSpec {
  /** Turns of residual already elapsed on the defender's Toxic counter. */
  toxicStart?: number
  leechSeed?: boolean
  weather?: Weather | null
  /** Count hazards on the switch in (P1 uses its own). */
}

export interface DamageQuery {
  ctx: GameContext
  data: BattleData
  attacker: BattlerSpec
  defender: BattlerSpec
  moveId: number
  attackerSide: 'mine' | 'theirs'
  field: MatchField
  atk: BattleConditions & { hpPct?: number | null; focusEnergy?: boolean; accStage?: number }
  def: BattleConditions & {
    hpPct?: number | null
    evaStage?: number
    leechSeeded?: boolean
    toxicCounter?: number
  }
  badges: Set<string>
  uses?: number
  /** D4: fold end-of-turn residual damage on the DEFENDER into hits-to-KO. */
  residual?: boolean
  /** Return early with no KO maths (the matrix's first pass). */
  fast?: boolean
}

const offenseOf = (category: string): 'atk' | 'spa' => (category === 'special' ? 'spa' : 'atk')
const defenseOf = (category: string): 'def' | 'spd' => (category === 'special' ? 'spd' : 'def')

/** Physical or special for the matchup (by type before Gen 4, as the engine decides). */
export function categoryOf(ctx: GameContext, data: BattleData, moveId: number): string {
  const gm = gameMove(data, moveId)
  const move = getMove(moveId)
  if (!move) return 'status'
  if (ctx.generation >= 4) return gm?.cl ?? move.damage_class ?? 'status'
  if ((gm?.p ?? move.power ?? 0) === 0 && move.damage_class === 'status') return 'status'
  const special = ['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark']
  return special.includes(gm?.t ?? '') ? 'special' : 'physical'
}

/** The corner plans that bound damage. */
function plans(category: string): {
  atkLow: CornerPlan
  atkHigh: CornerPlan
  defLow: CornerPlan
  defHigh: CornerPlan
} {
  const o = offenseOf(category)
  const d = defenseOf(category)
  return {
    atkLow: { [o]: 'low', spe: 'low' },
    atkHigh: { [o]: 'high', spe: 'high' },
    // The defender's "low" damage corner is its BULKIEST: HP and defence high.
    defLow: { hp: 'high', [d]: 'high' },
    defHigh: { hp: 'low', [d]: 'low' },
  }
}

function conditionsAtHp(
  c: BattleConditions & { hpPct?: number | null },
  maxHp: number,
): BattleConditions {
  if (c.hpPct == null) return { ...c, currentHp: c.currentHp }
  return { ...c, currentHp: Math.max(1, Math.ceil((maxHp * c.hpPct) / 100)) }
}

/** Run the engine once. Errors become a 'variable' result rather than a throw. */
function run(
  ctx: GameContext,
  a: CalcPokemon,
  d: CalcPokemon,
  moveId: number,
  field: CalcField,
  isCrit: boolean,
  hits: number | null,
): DamageResult | null {
  const move = getMove(moveId)
  if (!move) return null
  try {
    return calculateDamage(
      ctx.generation,
      a,
      d,
      { move, isCrit, hits, powerOverride: null },
      field,
      { koText: false },
    )
  } catch {
    return null
  }
}

function residualPerTurn(q: DamageQuery, defMaxHp: number, turn: number): number {
  const { ctx } = q
  const r = ctx.residual
  const frac = ([n, dnm]: [number, number]) => Math.max(1, Math.floor((defMaxHp * n) / dnm))
  let dmg = 0
  const status: StatusId = q.def.status
  if (status === 'psn') dmg += frac(r.poison)
  if (status === 'brn') dmg += frac(r.burn)
  if (status === 'tox') {
    const counter = Math.min(15, (q.def.toxicCounter ?? 0) + turn)
    dmg += Math.max(1, Math.floor((defMaxHp * counter) / r.toxicDenom))
  }
  if (q.def.leechSeeded) dmg += frac(r.leechSeed)
  const types = resolveTypesForGeneration(varietyOfSpec(q.defender), ctx.generation).map(
    (t) => getType(t.type_id)?.name ?? '',
  )
  const ability =
    q.defender.abilityId != null && ctx.hasAbilities
      ? (getAbility(q.defender.abilityId)?.name ?? '')
      : ''
  const w = q.field.weather
  if (
    w === 'sand' &&
    r.sand &&
    !types.some((t) => ['rock', 'ground', 'steel'].includes(t)) &&
    ability !== 'sand-veil' &&
    ability !== 'magic-guard'
  )
    dmg += frac(r.sand)
  if (
    w === 'hail' &&
    r.hail &&
    !types.includes('ice') &&
    ability !== 'ice-body' &&
    ability !== 'snow-cloak' &&
    ability !== 'magic-guard'
  )
    dmg += frac(r.hail)
  let heal = 0
  const held = q.defender.itemId != null ? q.data.held?.[String(q.defender.itemId)]?.h : undefined
  if (
    r.leftovers &&
    (held === 'HELD_LEFTOVERS' ||
      held === 'HOLD_EFFECT_LEFTOVERS' ||
      held === 'HOLD_EFFECT_HP_RESTORE_GRADUAL')
  )
    heal += frac(r.leftovers)
  return dmg - heal
}

/** P(KO) after each of `uses` uses, from a per-use distribution and residual. */
export function koCurve(
  dist: Dist,
  startHp: number,
  uses: number,
  residual: (turn: number) => number,
): number[] {
  // State: damage taken so far (0..startHp); startHp is the absorbing KO state.
  let state = new Float64Array(startHp + 1)
  state[0] = 1
  const out: number[] = []
  for (let n = 1; n <= uses; n++) {
    const next = new Float64Array(startHp + 1)
    next[startHp] = state[startHp]
    for (let taken = 0; taken < startHp; taken++) {
      const p = state[taken]
      if (p === 0) continue
      for (const [v, pv] of dist) next[Math.min(startHp, taken + v)] += p * pv
    }
    // End of turn: residual damage (or Leftovers) on the survivors.
    const r = residual(n)
    if (r !== 0) {
      const shifted = new Float64Array(startHp + 1)
      shifted[startHp] = next[startHp]
      for (let taken = 0; taken < startHp; taken++) {
        if (next[taken] === 0) continue
        shifted[Math.max(0, Math.min(startHp, taken + r))] += next[taken]
      }
      state = shifted
    } else state = next
    out.push(state[startHp])
  }
  return out
}

function nhko(
  perUse: number,
  startHp: number,
  residual: (turn: number) => number,
  max = 20,
): number {
  if (perUse <= 0 && residual(1) <= 0) return Infinity
  let hp = startHp
  for (let n = 1; n <= max; n++) {
    hp -= perUse
    if (hp <= 0) return n
    hp = Math.min(startHp, hp - residual(n))
    if (hp <= 0) return n
  }
  return Infinity
}

/** The whole analysis of one move, attacker -> defender. */
export function analyzeMove(q: DamageQuery): MoveDamage {
  const { ctx, data } = q
  const gen = ctx.generation
  const move = getMove(q.moveId)
  const gm = gameMove(data, q.moveId)
  const empty: MoveDamage = {
    moveId: q.moveId,
    name: move?.display_name ?? `#${q.moveId}`,
    type: gm?.t ?? '',
    category: 'status',
    status: 'unknown-move',
    priority: 0,
    accuracy: 1,
    critChance: 0,
    hitCounts: [{ hits: 1, p: 1 }],
    low: null,
    high: null,
    damage: { min: 0, max: 0 },
    percent: { min: 0, max: 0 },
    critPercent: { min: 0, max: 0 },
    hitsToKO: { min: Infinity, max: Infinity },
    koChance: [],
    expectedPct: 0,
    ceiling: q.attacker.spread.ceiling || q.defender.spread.ceiling,
    notes: [],
  }
  if (!move || !gm) return empty
  const category = categoryOf(ctx, data, q.moveId)
  const out: MoveDamage = {
    ...empty,
    category,
    priority: movePriority(ctx, data, q.moveId),
    status: 'ok',
  }
  if (
    category === 'status' ||
    (gm.p === 0 &&
      ![
        'seismic-toss',
        'night-shade',
        'dragon-rage',
        'sonic-boom',
        'super-fang',
        'psywave',
      ].includes(move.name) &&
      !isEnginePowerMove(move.name))
  ) {
    out.status = 'status'
    return out
  }
  const p = plans(category)
  const field = calcFieldFor(q.field, q.attackerSide)
  if (q.field.doubles && ctx.generation >= 3)
    field.doubles = { defenderSideAlive: 2, othersAlive: 3, spread: spreadOf(gm) }
  const atkBadges = badgeBoostsFor(q.attacker, ctx, q.badges)
  const defBadges = badgeBoostsFor(q.defender, ctx, q.badges)
  const ability =
    q.attacker.abilityId != null && ctx.hasAbilities
      ? (getAbility(q.attacker.abilityId)?.name ?? '')
      : ''
  const targetAbility =
    q.defender.abilityId != null && ctx.hasAbilities
      ? (getAbility(q.defender.abilityId)?.name ?? '')
      : ''
  out.hitCounts = hitCounts(
    ctx,
    move.name,
    move.meta?.min_hits ?? null,
    move.meta?.max_hits ?? null,
    ability,
  )
  out.accuracy = hitChance(ctx, data, {
    moveId: q.moveId,
    accStage: q.atk.accStage ?? 0,
    evaStage: q.def.evaStage ?? 0,
    weather: q.field.weather,
    attackerAbility: ability,
    targetAbility,
    targetItemId: ctx.hasItems ? q.defender.itemId : null,
    physical: category === 'physical',
    sureHit: false,
  })
  out.critChance = critChance(
    ctx,
    data,
    {
      moveId: q.moveId,
      baseSpeed: baseStat(q.attacker, gen, 'spe'),
      speciesSlug: speciesOf(q.attacker).name,
      itemId: ctx.hasItems ? q.attacker.itemId : null,
      abilitySlug: ability,
      focusEnergy: q.atk.focusEnergy ?? false,
      targetBlocks:
        gen >= 3 && (targetAbility === 'battle-armor' || targetAbility === 'shell-armor'),
      luckyChant: q.field.sides[q.attackerSide === 'mine' ? 'theirs' : 'mine'].luckyChant,
    },
    move.name,
  )
  const corner = (which: 'low' | 'high'): CornerDamage | null => {
    const aPlan = which === 'low' ? p.atkLow : p.atkHigh
    const dPlan = which === 'low' ? p.defLow : p.defHigh
    // Resolve the defender once at full HP to learn its max HP at this corner.
    const defFull = resolveAt(q.defender, ctx, dPlan, { ...q.def, currentHp: null }, defBadges)
    const probe = run(
      ctx,
      resolveAt(q.attacker, ctx, aPlan, q.atk, atkBadges),
      defFull,
      q.moveId,
      field,
      false,
      null,
    )
    if (!probe) return null
    const maxHp = probe.defenderMaxHp
    const aMax = probe.attackerMaxHp
    const attackerPoke = resolveAt(q.attacker, ctx, aPlan, conditionsAtHp(q.atk, aMax), atkBadges)
    const defenderPoke = resolveAt(q.defender, ctx, dPlan, conditionsAtHp(q.def, maxHp), defBadges)
    const startHp = defenderPoke.currentHp ?? maxHp
    const counts = out.hitCounts
    const typical = counts.reduce((b, c) => (c.p > b.p ? c : b), counts[0]).hits
    const normal = new Map<number, DamageResult | null>()
    const crit = new Map<number, DamageResult | null>()
    for (const c of counts) {
      normal.set(c.hits, run(ctx, attackerPoke, defenderPoke, q.moveId, field, false, c.hits))
      crit.set(
        c.hits,
        out.critChance > 0
          ? run(ctx, attackerPoke, defenderPoke, q.moveId, field, true, c.hits)
          : null,
      )
    }
    const base = normal.get(typical) ?? null
    if (!base) return null
    if (base.noDamageReason === 'immune' || base.noDamageReason === 'ability') {
      out.status = 'immune'
    } else if (base.noDamageReason === 'variable') {
      out.status = 'variable'
    } else if (base.noDamageReason === 'status') {
      out.status = 'status'
    }
    // One use's distribution.
    const parts: [Dist, number][] = []
    for (const c of counts) {
      const n = normal.get(c.hits)
      if (!n) continue
      const cr = crit.get(c.hits) ?? null
      let hitDist: Dist
      if (gen === 1 || typeof n.damage === 'number') {
        // Gen 1: one roll, one crit check, repeated hits.
        const nr = hitRolls(n.damage, 0).map((v) => v * c.hits)
        const crr = cr ? hitRolls(cr.damage, 0).map((v) => v * c.hits) : nr
        hitDist = mix([uniform(nr), 1 - out.critChance], [uniform(crr), out.critChance])
      } else {
        hitDist = new Map([[0, 1]])
        for (let i = 0; i < c.hits; i++) {
          const per = mix(
            [uniform(hitRolls(n.damage, i)), 1 - out.critChance],
            [uniform(cr ? hitRolls(cr.damage, i) : hitRolls(n.damage, i)), out.critChance],
          )
          hitDist = convolve(hitDist, per, startHp)
        }
      }
      parts.push([hitDist, c.p])
    }
    const hit = mix(...parts)
    const dist = mix([hit, out.accuracy], [new Map([[0, 1]]), 1 - out.accuracy])
    const totals = (r: DamageResult | null): number[] => {
      if (!r) return []
      if (typeof r.damage === 'number') return [r.damage]
      if (Array.isArray(r.damage[0])) {
        const m = r.damage as number[][]
        if (gen === 1) return m[0].map((v) => v * m.length)
        // Sum of the hits at each roll index: min..max is exact at the ends.
        return m[0].map((_, i) => m.reduce((s, row) => s + row[i], 0))
      }
      return r.damage as number[]
    }
    const rolls = totals(base)
    const critRolls = totals(crit.get(typical) ?? null)
    const residual = q.residual ? (t: number) => residualPerTurn(q, maxHp, t) : () => 0
    const minAll = Math.min(...counts.map((c) => Math.min(...totals(normal.get(c.hits) ?? null))))
    const maxAll = Math.max(...counts.map((c) => Math.max(...totals(normal.get(c.hits) ?? null))))
    return {
      maxHp,
      startHp,
      rolls,
      critRolls,
      dist,
      ko: q.fast ? [] : koCurve(dist, startHp, q.uses ?? 4, residual),
      nhkoMinRoll: nhko(minAll, startHp, residual),
      nhkoMaxRoll: nhko(maxAll, startHp, residual),
      description: base.fullText,
      result: base,
    }
  }
  const low = corner('low')
  const high = corner('high')
  out.low = low
  out.high = high
  if (!low || !high) {
    out.status = out.status === 'ok' ? 'variable' : out.status
    return out
  }
  if (out.status !== 'ok') return out
  const minRoll = Math.min(...low.rolls)
  const maxRoll = Math.max(...high.rolls)
  out.damage = { min: minRoll, max: maxRoll }
  out.percent = { min: (100 * minRoll) / low.maxHp, max: (100 * maxRoll) / high.maxHp }
  if (low.critRolls.length && high.critRolls.length) {
    out.critPercent = {
      min: (100 * Math.min(...low.critRolls)) / low.maxHp,
      max: (100 * Math.max(...high.critRolls)) / high.maxHp,
    }
  }
  out.hitsToKO = { min: high.nhkoMaxRoll, max: low.nhkoMinRoll }
  if (!q.fast) out.koChance = high.ko.map((hi, i) => ({ min: low.ko[i] ?? 0, max: hi }))
  const expected = (c: CornerDamage) => {
    let e = 0
    for (const [v, pv] of c.dist) e += v * pv
    return (100 * e) / c.maxHp
  }
  out.expectedPct = (expected(low) + expected(high)) / 2
  if (out.ceiling) out.notes.push('Ceiling: from "Maximize all EVs" past the 510 cap')
  return out
}

/** Moves whose power the engine computes from the battle state (bp 0 in the table). */
function isEnginePowerMove(slug: string): boolean {
  return [
    'flail',
    'reversal',
    'eruption',
    'water-spout',
    'low-kick',
    'grass-knot',
    'gyro-ball',
    'punishment',
    'crush-grip',
    'wring-out',
    'weather-ball',
    'fling',
    'natural-gift',
    'hidden-power',
    'return',
    'frustration',
    'present',
    'magnitude',
    'spit-up',
    'trump-card',
    'beat-up',
    'triple-kick',
  ].includes(slug)
}

/**
 * A move's priority bracket. Gen 1: Quick Attack first, Counter last (pokered
 * core.asm). Gen 2: pokecrystal MoveEffectPriorities -- Protect/Endure 3, priority
 * hits 2, base 1, Roar/Whirlwind/Counter/Mirror Coat 0, Vital Throw 0. Gen 3-4:
 * the move table's own priority field.
 */
export function movePriority(ctx: GameContext, data: BattleData, moveId: number): number {
  const gm = gameMove(data, moveId)
  if (!gm) return 0
  if (ctx.generation === 1) {
    const slug = getMove(moveId)?.name
    return slug === 'quick-attack' ? 1 : slug === 'counter' ? -1 : 0
  }
  if (ctx.generation === 2) {
    if (getMove(moveId)?.name === 'vital-throw') return -1
    switch (gm.e) {
      case 'EFFECT_PROTECT':
      case 'EFFECT_ENDURE':
        return 2
      case 'EFFECT_PRIORITY_HIT':
        return 1
      case 'EFFECT_FORCE_SWITCH':
      case 'EFFECT_COUNTER':
      case 'EFFECT_MIRROR_COAT':
        return -1
      default:
        return 0
    }
  }
  return gm.pr ?? 0
}

/** Species display name with form, for labels. */
export function displayName(b: BattlerSpec): string {
  const s = getSpecies(b.speciesId)
  if (!s) return b.label
  const v = varietyOfSpec(b)
  if (v.is_default || !v.name.startsWith(`${s.name}-`)) return s.display_name
  const form = v.name
    .slice(s.name.length + 1)
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('-')
  return `${s.display_name}-${form}`
}
