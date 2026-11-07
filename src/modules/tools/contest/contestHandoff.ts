/**
 * A ONE-SHOT pick for #18 (Contest stats plan): #19 sets the block or Poffin it
 * just made and navigates; the plan's state initializer reads it and an effect
 * clears it. Same shape as collectionHandoff.ts.
 */

import type { Treat } from './contestMath'

let pending: { id: number; treat: Treat } | null = null
let seq = 0

export function setContestTreat(treat: Treat): void {
  pending = { id: ++seq, treat }
}

export const peekContestTreat = () => pending

export function clearContestTreat(id: number): void {
  if (pending?.id === id) pending = null
}
