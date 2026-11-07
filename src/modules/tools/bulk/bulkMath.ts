/**
 * #7 Defensive bulk: the least HP and Defense (or Sp. Def / Special) effort that
 * lets a Pokemon survive one hit, keeping at least a given share of its HP.
 *
 * PURE, AND UI-FREE. Every damage number is the damage calculator's own
 * (`calculateDamage`, checked against the reference calc), so "survives" means
 * the hit's HIGHEST roll leaves the HP asked for -- a guarantee, not a chance.
 *
 * WHICH DEFENCE is the move's, as it resolves in that generation: Defense for a
 * physical hit, the Special Defense for a special one -- and before Gen 4 that is
 * decided by the move's TYPE (the engine's category gate). In Gen 1-2 the effort
 * key is the unsplit `special` Stat Exp, which raises both halves.
 *
 * ONLY THE EFFORT VALUES THAT CHANGE A STAT ARE TRIED. Gen 3-4: EVs in steps of
 * 4 (a stat reads floor(EV/4)), within the 510 total after the defender's other
 * EVs. Gen 1-2: the 64 Stat Exp values where the bonus floor(ceil(sqrt(E))/4)
 * steps up -- (4b-1)^2 + 1 for bonus b -- since anything between is the same stat.
 * For each HP value the defence is binary-searched: damage only falls as it rises.
 */

import {
  calculateDamage,
  computeRawStats,
  type CalcField,
  type CalcPokemon,
} from '../../calculators/damage'
import type { Move } from '../../../data'
import type { StatKey } from '../../team-builder/statMath'

export interface BulkInput {
  gen: number
  attacker: CalcPokemon
  defender: CalcPokemon
  move: Move
  isCrit: boolean
  field: CalcField
  /** Keep at least this % of max HP after the hit; 0 = survive with 1 HP or more. */
  keepPct: number
}

export interface BulkPlan {
  hp: number
  def: number
  /** Total effort spent on the two (EVs, or Stat Exp in Gen 1-2). */
  total: number
  maxHp: number
  maxDamage: number
  /** HP left after the highest roll. */
  left: number
}

export type BulkOutcome =
  | {
      ok: true
      /** The effort key the defence is raised through. */
      defKey: StatKey
      /** 'Def', 'SpD' or 'Spc', for the readout. */
      defLabel: string
      /** As the defender is set now. */
      current: BulkPlan
      /** Least total over both; null when no spread survives. */
      best: BulkPlan | null
      /** Least HP with the defence as set; null when HP alone cannot. */
      hpOnly: BulkPlan | null
      /** Least defence with HP as set; null when the defence alone cannot. */
      defOnly: BulkPlan | null
    }
  | { ok: false; reason: string }

/** Effort values that change a stat, ascending. */
export function effortSteps(gen: number, max: number): number[] {
  if (gen >= 3) return Array.from({ length: Math.floor(max / 4) + 1 }, (_, i) => i * 4)
  return Array.from({ length: 64 }, (_, b) => (b === 0 ? 0 : (4 * b - 1) ** 2 + 1)).filter(
    (e) => e <= max,
  )
}

/** The HP the hit must leave: at least 1, or the share asked for (rounded up). */
export const hpToKeep = (maxHp: number, keepPct: number): number =>
  keepPct <= 0 ? 1 : Math.ceil((maxHp * keepPct) / 100)

export function readBulk(input: BulkInput): BulkOutcome {
  const { gen, attacker, move, isCrit, field, keepPct } = input
  if (!Number.isFinite(keepPct) || keepPct < 0 || keepPct >= 100) {
    return { ok: false, reason: 'The HP to keep must be a share from 0 to 99%.' }
  }
  const hit = (hp: number, def: number, key: StatKey) => {
    const defender: CalcPokemon = {
      ...input.defender,
      currentHp: null,
      effort: { ...input.defender.effort, hp, [key]: def },
    }
    const r = calculateDamage(
      gen,
      attacker,
      defender,
      { move, isCrit, hits: null, powerOverride: null },
      field,
      {
        koText: false,
      },
    )
    const maxHp = computeRawStats(defender, gen).hp
    return { r, maxHp }
  }

  const probe = hit(input.defender.effort.hp ?? 0, 0, 'defense')
  if (probe.r.noDamageReason === 'status')
    return { ok: false, reason: 'Pick a damaging move: a status move deals no damage.' }
  if (probe.r.noDamageReason === 'immune')
    return { ok: false, reason: 'The target is immune to this move: any spread survives it.' }
  if (probe.r.noDamageReason)
    return {
      ok: false,
      reason: 'This move’s damage is not calculated (fixed, OHKO or variable damage).',
    }

  const physical = probe.r.category === 'physical'
  const defKey: StatKey = physical ? 'defense' : gen <= 2 ? 'special' : 'special-defense'
  const defLabel = physical ? 'Def' : gen === 1 ? 'Spc' : 'SpD'

  const maxEffort = gen <= 2 ? 65535 : 252
  const steps = effortSteps(gen, maxEffort)
  // The 510 cap counts the defender's other EVs too (Gen 3-4 only).
  const others =
    gen >= 3
      ? Object.entries(input.defender.effort)
          .filter(([k]) => k !== 'hp' && k !== defKey)
          .reduce((sum, [, v]) => sum + (v ?? 0), 0)
      : 0
  const budget = gen >= 3 ? 510 - others : Infinity

  const plan = (hp: number, def: number): BulkPlan => {
    const { r, maxHp } = hit(hp, def, defKey)
    return { hp, def, total: hp + def, maxHp, maxDamage: r.range[1], left: maxHp - r.range[1] }
  }
  const survives = (p: BulkPlan) => p.left >= hpToKeep(p.maxHp, keepPct)

  /** Least defence step (index) surviving at this HP, or null. Damage falls as defence rises. */
  const leastDef = (hp: number, allowed: number[]): BulkPlan | null => {
    if (allowed.length === 0) return null
    const top = plan(hp, allowed[allowed.length - 1])
    if (!survives(top)) return null
    let lo = 0
    let hi = allowed.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (survives(plan(hp, allowed[mid]))) hi = mid
      else lo = mid + 1
    }
    return plan(hp, allowed[lo])
  }

  let best: BulkPlan | null = null
  for (const hp of steps) {
    if (hp > budget) break
    const p = leastDef(
      hp,
      steps.filter((d) => hp + d <= budget),
    )
    if (p && (!best || p.total < best.total || (p.total === best.total && p.left > best.left)))
      best = p
  }

  const setHp = input.defender.effort.hp ?? 0
  const setDef = input.defender.effort[defKey] ?? 0
  const hpOnly = (() => {
    for (const hp of steps) {
      if (hp + setDef > budget) return null
      const p = plan(hp, setDef)
      if (survives(p)) return p
    }
    return null
  })()
  const defOnly = leastDef(
    setHp,
    steps.filter((d) => setHp + d <= budget),
  )

  return { ok: true, defKey, defLabel, current: plan(setHp, setDef), best, hpOnly, defOnly }
}
