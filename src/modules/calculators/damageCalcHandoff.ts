/**
 * A ONE-SHOT PREFILL for the Damage Calculator, so another screen can open it on a
 * given matchup (Team Matchup's matrix cell, M3) without the calculator learning
 * anything about that screen.
 *
 * The caller puts a prefill here and navigates; the calculator's state
 * initializers READ it (they must stay pure -- StrictMode runs them twice) and an
 * effect after mount clears it, by id, so a later visit opens on the defaults
 * again.
 */

import type { DualField, SideState } from './damageCalcState'

export interface DamageCalcPrefill {
  id: number
  versionGroup: string
  sides: [SideState, SideState]
  field: DualField
  /** The move result to select first: which Pokemon, which slot. */
  selected: { side: 0 | 1; slot: number }
}

let pending: DamageCalcPrefill | null = null
let seq = 0

export function setDamageCalcPrefill(p: Omit<DamageCalcPrefill, 'id'>): void {
  pending = { ...p, id: ++seq }
}

export function peekDamageCalcPrefill(): DamageCalcPrefill | null {
  return pending
}

export function clearDamageCalcPrefill(id: number): void {
  if (pending?.id === id) pending = null
}
