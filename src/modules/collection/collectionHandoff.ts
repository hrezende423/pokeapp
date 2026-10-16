/**
 * A ONE-SHOT pick for #9 (EV/Stat Exp remaining): the Collection sets the entry
 * and navigates; the tool's state initializer reads it and an effect clears it.
 * Same shape as damageCalcHandoff.ts.
 */

let pending: { id: number; entryId: string } | null = null
let seq = 0

export function setRemainingEntry(entryId: string): void {
  pending = { id: ++seq, entryId }
}

export const peekRemainingEntry = () => pending

export function clearRemainingEntry(id: number): void {
  if (pending?.id === id) pending = null
}
