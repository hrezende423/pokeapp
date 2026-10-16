/**
 * #9 EV / Stat Exp remaining: a Build's target spread minus a Collection
 * entry's current one, stat by stat.
 *
 * PURE, AND UI-FREE. A stat already past its target is reported as OVER, not as
 * a negative number to train, because effort cannot be trained downward by
 * battling (only Gen 4+ berries lower EVs, and that is a different question).
 */

import { effortKeysFor } from '../../collection/collectionMath'
import type { StatKey, StatNumbers } from '../../team-builder/statMath'

export interface RemainingRow {
  key: StatKey
  current: number
  target: number
  /** Still to gain; 0 when the target is met or passed. */
  left: number
  /** By how much the current spread is past the target. */
  over: number
}

export interface Remaining {
  rows: RemainingRow[]
  totalLeft: number
  done: boolean
}

export function remaining(
  generation: number,
  current: StatNumbers,
  target: StatNumbers,
): Remaining {
  const rows = effortKeysFor(generation).map((key) => {
    const c = current[key] ?? 0
    const t = target[key] ?? 0
    return { key, current: c, target: t, left: Math.max(0, t - c), over: Math.max(0, c - t) }
  })
  const totalLeft = rows.reduce((s, r) => s + r.left, 0)
  return { rows, totalLeft, done: totalLeft === 0 }
}
