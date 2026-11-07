/**
 * A ONE-SHOT TAB for the Calculators screen, so another screen (the Tools index)
 * can open it on a given tab without Calculators learning anything about that
 * screen. Same shape as damageCalcHandoff.ts: the caller sets it and navigates;
 * the screen's state initializer READS it (initializers must stay pure --
 * StrictMode runs them twice) and an effect after mount clears it, by id, so a
 * later visit opens on the default tab again.
 */

import type { CalculatorTab } from './Calculators'

let pending: { id: number; tab: CalculatorTab } | null = null
let seq = 0

export function setCalculatorsTab(tab: CalculatorTab): void {
  pending = { id: ++seq, tab }
}

export function peekCalculatorsTab(): { id: number; tab: CalculatorTab } | null {
  return pending
}

export function clearCalculatorsTab(id: number): void {
  if (pending?.id === id) pending = null
}
