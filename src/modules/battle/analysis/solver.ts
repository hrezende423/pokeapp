/**
 * D5: THE BULK AND ATTACK THRESHOLD SOLVER.
 *
 *   Bulk:   the least HP and defence investment that GUARANTEES surviving n
 *           uses of a move (its strongest roll, against the spread's least
 *           bulky corner) -- HP alone, defence alone, and the cheapest mix.
 *   Attack: the least attacking investment that GUARANTEES a KO in n uses (its
 *           weakest roll, against the target's bulkiest corner), with the
 *           current nature and with a nature that raises the stat.
 *
 * Investment steps are the game's own: EVs in 4s (Gen 3-4, the stat formula
 * floors EV/4); Stat Exp at the values where floor(ceil(sqrt(x)) / 4) steps up
 * (Gen 1-2: 0, 10, 50, 122, ... 65026). Damage is analyzeMove's, so every
 * number here is the verified engine's.
 *
 * The solver edits a COPY of the spread (S7b); nothing is written back.
 */

import { listNatures } from '../../../data'
import type { StatKey } from '../../team-builder/statMath'
import { type BattlerSpec } from '../battler'
import { analyzeMove, categoryOf, type MatchField } from '../damage'
import type { BattleData } from '../battleData'
import type { GameContext } from '../game'
import { point } from '../range'

/** Every effort value at which the stat can step up, ascending. */
export function effortSteps(ctx: GameContext): number[] {
  if (ctx.spreadModel === 'ev') return Array.from({ length: 64 }, (_, i) => i * 4)
  // floor(ceil(sqrt(e)) / 4) = p needs ceil(sqrt(e)) >= 4p, i.e. e >= (4p - 1)^2 + 1.
  return Array.from({ length: 65 }, (_, p) => (p === 0 ? 0 : Math.min(65535, (4 * p - 1) ** 2 + 1)))
}

function withEffort(
  b: BattlerSpec,
  patch: Partial<Record<StatKey, number>>,
  natureIds?: number[],
): BattlerSpec {
  const effort = { ...b.spread.effort }
  for (const [k, v] of Object.entries(patch)) effort[k as StatKey] = point(v as number)
  return {
    ...b,
    spreadMode: 'custom',
    spread: { ...b.spread, effort, natureIds: natureIds ?? b.spread.natureIds, ceiling: false },
  }
}

function natureRaising(stat: StatKey): number[] {
  return listNatures()
    .filter((n) => n.increased_stat === stat && n.decreased_stat !== stat)
    .map((n) => n.id)
}

export interface SolverInput {
  ctx: GameContext
  data: BattleData
  field: MatchField
  badges: Set<string>
}

const defenseKey = (ctx: GameContext, category: string): StatKey =>
  category === 'special' ? (ctx.generation <= 2 ? 'special' : 'special-defense') : 'defense'
const attackKey = (ctx: GameContext, category: string): StatKey =>
  category === 'special' ? (ctx.generation <= 2 ? 'special' : 'special-attack') : 'attack'

export interface BulkAnswer {
  moveId: number
  uses: number
  /** Uses the move needs now (attacker's best case). */
  currentHitsToKO: number
  survivesNow: boolean
  defenseStat: StatKey
  /** Least HP investment alone (defence as it is), or null if none suffices. */
  hpOnly: number | null
  defOnly: number | null
  /** The cheapest HP + defence mix, or null. */
  mix: { hp: number; def: number } | null
  /** Over the era's EV total with the rest of the spread? */
  exceedsCap: boolean
}

/** Bulk: `defender` (mine) surviving `uses` of `attacker`'s `moveId`. */
export function solveBulk(
  inp: SolverInput,
  defender: BattlerSpec,
  attacker: BattlerSpec,
  moveId: number,
  uses: number,
): BulkAnswer {
  const { ctx, data, field, badges } = inp
  const category = categoryOf(ctx, data, moveId)
  const dKey = defenseKey(ctx, category)
  const steps = effortSteps(ctx)
  const atKO = (d: BattlerSpec) =>
    analyzeMove({
      ctx,
      data,
      attacker,
      defender: d,
      moveId,
      attackerSide: attacker.side,
      field,
      atk: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      def: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      badges,
      fast: true,
    }).hitsToKO.min
  const survives = (hp: number, def: number) =>
    atKO(withEffort(defender, { hp, [dKey]: def })) > uses
  const curHp = defender.spread.effort.hp?.max ?? 0
  const curDef = defender.spread.effort[dKey]?.max ?? 0
  const current = atKO(defender)
  // Least index i in steps with pred(steps[i]) true (monotonic), or -1.
  const least = (pred: (v: number) => boolean): number => {
    if (!pred(steps[steps.length - 1])) return -1
    let lo = 0
    let hi = steps.length - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (pred(steps[m])) hi = m
      else lo = m + 1
    }
    return lo
  }
  const hpI = least((v) => survives(v, curDef))
  const defI = least((v) => survives(curHp, v))
  let mix: { hp: number; def: number } | null = null
  let bestTotal = Infinity
  for (const hp of steps) {
    const i = least((v) => survives(hp, v))
    if (i < 0) continue
    const total = hp + steps[i]
    if (total < bestTotal) {
      bestTotal = total
      mix = { hp, def: steps[i] }
    }
    if (i === 0) break
  }
  const others = Object.entries(defender.spread.effort)
    .filter(([k]) => k !== 'hp' && k !== dKey)
    .reduce((s, [, r]) => s + (r?.max ?? 0), 0)
  return {
    moveId,
    uses,
    currentHitsToKO: current,
    survivesNow: current > uses,
    defenseStat: dKey,
    hpOnly: hpI < 0 ? null : steps[hpI],
    defOnly: defI < 0 ? null : steps[defI],
    mix,
    exceedsCap:
      ctx.effortTotalCap != null && mix != null && mix.hp + mix.def + others > ctx.effortTotalCap,
  }
}

export interface AttackAnswer {
  moveId: number
  uses: number
  currentHitsToKO: number
  koNow: boolean
  attackStat: StatKey
  /** Least investment with the current nature (or null). */
  effort: number | null
  /** Least with a nature raising the stat (Gen 3-4), or null. */
  effortPlusNature: number | null
}

/** Attack: `attacker` (mine) KOing `defender` in `uses` with `moveId`, guaranteed. */
export function solveAttack(
  inp: SolverInput,
  attacker: BattlerSpec,
  defender: BattlerSpec,
  moveId: number,
  uses: number,
): AttackAnswer {
  const { ctx, data, field, badges } = inp
  const category = categoryOf(ctx, data, moveId)
  const aKey = attackKey(ctx, category)
  const steps = effortSteps(ctx)
  const worst = (a: BattlerSpec) =>
    analyzeMove({
      ctx,
      data,
      attacker: a,
      defender,
      moveId,
      attackerSide: a.side,
      field,
      atk: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      def: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      badges,
      fast: true,
    }).hitsToKO.max
  const solve = (natureIds?: number[]): number | null => {
    const ko = (v: number) => worst(withEffort(attacker, { [aKey]: v }, natureIds)) <= uses
    if (!ko(steps[steps.length - 1])) return null
    let lo = 0
    let hi = steps.length - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (ko(steps[m])) hi = m
      else lo = m + 1
    }
    return steps[lo]
  }
  const current = worst(attacker)
  return {
    moveId,
    uses,
    currentHitsToKO: current,
    koNow: current <= uses,
    attackStat: aKey,
    effort: solve(),
    effortPlusNature: ctx.hasNatures ? solve(natureRaising(aKey)) : null,
  }
}
