/**
 * R1: THE GAUNTLET -- a run of trainers fought back to back (the Elite Four and
 * the Champion), HP, PP and status CARRIED from one fight to the next, with a
 * healing budget spent between fights the way a player would: revive the
 * fainted, cure status, then top up the most hurt.
 *
 * Healing amounts are the Gen 1-4 items': Potion 20 HP, Super Potion 50, Hyper
 * Potion 200, Max Potion and Full Restore all of it (Full Restore also cures),
 * Revive half, Max Revive all. PP is not restored (Ethers are not in the budget).
 */

import type { BattleData } from '../battleData'
import type { BattlerSpec } from '../battler'
import type { StatusId } from '../../calculators/damage'
import type { GameContext } from '../game'
import { greedyPlayer, newBattle, runBattle, type CarryOver, type TrainerInfo } from '../session'
import { cornerPlans } from './outcome'
import type { MatchField } from '../damage'

export interface GauntletStage {
  key: string
  label: string
  trainer: TrainerInfo
  theirs: BattlerSpec[]
  /** A double battle (S6): fought two-on-two. */
  doubles?: boolean
}

export interface HealingBudget {
  potion: number
  superPotion: number
  hyperPotion: number
  maxPotion: number
  fullRestore: number
  fullHeal: number
  revive: number
  maxRevive: number
}

export const EMPTY_BUDGET: HealingBudget = {
  potion: 0,
  superPotion: 0,
  hyperPotion: 0,
  maxPotion: 0,
  fullRestore: 0,
  fullHeal: 0,
  revive: 0,
  maxRevive: 0,
}

export const BUDGET_LABELS: Record<keyof HealingBudget, string> = {
  potion: 'Potion',
  superPotion: 'Super Potion',
  hyperPotion: 'Hyper Potion',
  maxPotion: 'Max Potion',
  fullRestore: 'Full Restore',
  fullHeal: 'Full Heal',
  revive: 'Revive',
  maxRevive: 'Max Revive',
}

interface Carried {
  hp: number[]
  maxHp: number[]
  status: StatusId[]
  pp: number[][]
}

/** Spend the budget between fights. Mutates both. Returns what was used. */
export function healBetween(
  c: Carried,
  budget: HealingBudget,
): Partial<Record<keyof HealingBudget, number>> {
  const used: Partial<Record<keyof HealingBudget, number>> = {}
  const spend = (k: keyof HealingBudget) => {
    budget[k]--
    used[k] = (used[k] ?? 0) + 1
  }
  // Revive the fainted, strongest first (by max HP, as a stand-in for value).
  const fainted = c.hp
    .map((h, i) => (h === 0 ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => c.maxHp[b] - c.maxHp[a])
  for (const i of fainted) {
    if (budget.maxRevive > 0) {
      spend('maxRevive')
      c.hp[i] = c.maxHp[i]
    } else if (budget.revive > 0) {
      spend('revive')
      c.hp[i] = Math.floor(c.maxHp[i] / 2)
    }
    c.status[i] = 'healthy'
  }
  // Cure status.
  c.status.forEach((s, i) => {
    if (s === 'healthy' || c.hp[i] === 0) return
    if (budget.fullHeal > 0) {
      spend('fullHeal')
      c.status[i] = 'healthy'
    } else if (budget.fullRestore > 0) {
      spend('fullRestore')
      c.status[i] = 'healthy'
      c.hp[i] = c.maxHp[i]
    }
  })
  // Top up: the most hurt first, the smallest item that fills it (or the biggest left).
  const heals: [keyof HealingBudget, number][] = [
    ['potion', 20],
    ['superPotion', 50],
    ['hyperPotion', 200],
    ['maxPotion', Infinity],
    ['fullRestore', Infinity],
  ]
  for (let guard = 0; guard < 60; guard++) {
    const order = c.hp
      .map((h, i) => ({ i, missing: h > 0 ? c.maxHp[i] - h : 0, frac: h > 0 ? h / c.maxHp[i] : 1 }))
      .filter((x) => x.missing > 0 && x.frac < 0.75)
      .sort((a, b) => a.frac - b.frac)
    const t = order[0]
    if (!t) break
    const fit =
      heals.find(([k, amt]) => budget[k] > 0 && amt >= t.missing) ??
      [...heals].reverse().find(([k]) => budget[k] > 0)
    if (!fit) break
    spend(fit[0])
    c.hp[t.i] = Math.min(c.maxHp[t.i], c.hp[t.i] + fit[1])
  }
  return used
}

export interface GauntletInput {
  ctx: GameContext
  data: BattleData
  mine: BattlerSpec[]
  stages: GauntletStage[]
  badges: string[]
  budget: HealingBudget
  runs: number
  seed?: number
  field?: MatchField
  onProgress?: (done: number, total: number) => void
}

export interface StageResult {
  key: string
  label: string
  /** P(reaching this fight) and P(winning it | reached). */
  reached: number
  wonIfReached: number
  /** Mean HP % of my team (alive and fainted, out of total max HP) entering it. */
  hpIn: number
  /** Mean Pokemon of mine standing entering it. */
  aliveIn: number
}

export interface GauntletResult {
  runs: number
  clear: number
  /** By corner plan when spreads are ranged (unfavourable, favourable). */
  clearByPlan: { name: string; clear: number }[]
  stages: StageResult[]
  /** Mean items used per run. */
  itemsUsed: Partial<Record<keyof HealingBudget, number>>
  /** P(each of my Pokemon faints at least once in the run). */
  faintRisk: { key: string; label: string; p: number }[]
}

export function runGauntlet(inp: GauntletInput): GauntletResult {
  const { ctx, data } = inp
  const plans = cornerPlans({ mine: inp.mine, theirs: inp.stages.flatMap((s) => s.theirs) })
  const total = inp.runs * plans.length
  const stages = inp.stages.map((s) => ({
    key: s.key,
    label: s.label,
    reached: 0,
    won: 0,
    hpIn: 0,
    aliveIn: 0,
  }))
  const items: Partial<Record<keyof HealingBudget, number>> = {}
  const faintRuns = inp.mine.map(() => 0)
  const clearByPlan: { name: string; clear: number }[] = []
  let clear = 0
  let done = 0
  for (const plan of plans) {
    let planClear = 0
    for (let r = 0; r < inp.runs; r++) {
      const budget = { ...inp.budget }
      let carry: CarryOver | undefined
      let carried: Carried | null = null
      const faintedEver = new Set<number>()
      let cleared = true
      for (let si = 0; si < inp.stages.length; si++) {
        const stage = inp.stages[si]
        const { state } = newBattle(ctx, data, inp.mine, stage.theirs, stage.trainer, {
          badges: inp.badges,
          minePick: plan.mine,
          theirsPick: plan.theirs,
          carry,
          field: inp.field,
          doubles: stage.doubles,
        })
        if (!carried) {
          carried = {
            hp: state.sides.mine.mons.map((m) => m.hp),
            maxHp: state.sides.mine.mons.map((m) => m.maxHp),
            status: state.sides.mine.mons.map((m) => m.status),
            pp: state.sides.mine.mons.map((m) => [...m.pp]),
          }
        }
        const sr = stages[si]
        sr.reached++
        sr.hpIn += carried.hp.reduce((a, b) => a + b, 0) / carried.maxHp.reduce((a, b) => a + b, 0)
        sr.aliveIn += carried.hp.filter((h) => h > 0).length
        if (carried.hp.every((h) => h === 0)) {
          cleared = false
          break
        }
        const o = runBattle(
          ctx,
          data,
          state,
          greedyPlayer,
          (inp.seed ?? 1) + r * 7919 + si * 104729,
        )
        o.mineFainted.forEach((i) => faintedEver.add(i))
        const fin = o.final.sides.mine.mons
        carried = {
          hp: fin.map((m) => (m.fainted ? 0 : m.hp)),
          maxHp: fin.map((m) => m.maxHp),
          status: fin.map((m) => (m.fainted ? 'healthy' : m.status)),
          pp: fin.map((m) => [...m.pp]),
        }
        if (o.winner !== 'mine') {
          cleared = false
          break
        }
        sr.won++
        if (si < inp.stages.length - 1) {
          const used = healBetween(carried, budget)
          for (const [k, n] of Object.entries(used))
            items[k as keyof HealingBudget] = (items[k as keyof HealingBudget] ?? 0) + (n ?? 0)
        }
        carry = {
          hpPct: carried.hp.map((h, i) => (h === 0 ? 0 : (100 * h) / carried!.maxHp[i])),
          status: carried.status,
          pp: carried.pp,
        }
      }
      if (cleared) {
        clear++
        planClear++
      }
      faintedEver.forEach((i) => faintRuns[i]++)
      done++
      if (inp.onProgress && (done % 5 === 0 || done === total)) inp.onProgress(done, total)
    }
    clearByPlan.push({ name: plan.name, clear: planClear / inp.runs })
  }
  return {
    runs: total,
    clear: clear / total,
    clearByPlan,
    stages: stages.map((s) => ({
      key: s.key,
      label: s.label,
      reached: s.reached / total,
      wonIfReached: s.reached ? s.won / s.reached : 0,
      hpIn: s.reached ? (100 * s.hpIn) / s.reached : 0,
      aliveIn: s.reached ? s.aliveIn / s.reached : 0,
    })),
    itemsUsed: Object.fromEntries(Object.entries(items).map(([k, n]) => [k, (n ?? 0) / total])),
    faintRisk: inp.mine.map((m, i) => ({ key: m.key, label: m.label, p: faintRuns[i] / total })),
  }
}
