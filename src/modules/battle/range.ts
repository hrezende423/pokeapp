/**
 * A number that may be a range. Every numeric INPUT of the matchup engine is one
 * of these (S7c: "unknown IVs 0-31"), and every OUTPUT carries min and max through
 * the whole pipeline, so a range on the way in never blocks a result on the way
 * out -- it widens it.
 *
 * A single value is a range with min === max. Nothing downstream branches on
 * "is this a range"; it just reads both ends.
 */

export interface Range {
  min: number
  max: number
}

export const point = (n: number): Range => ({ min: n, max: n })

export const range = (a: number, b: number): Range =>
  a <= b ? { min: a, max: b } : { min: b, max: a }

export const isPoint = (r: Range): boolean => r.min === r.max

export const clampRange = (r: Range, lo: number, hi: number): Range => ({
  min: Math.max(lo, Math.min(hi, r.min)),
  max: Math.max(lo, Math.min(hi, r.max)),
})

/** The range spanned by several. */
export function hull(...rs: Range[]): Range {
  let min = Infinity
  let max = -Infinity
  for (const r of rs) {
    if (r.min < min) min = r.min
    if (r.max > max) max = r.max
  }
  return { min, max }
}

/** "214", or "198-214" when it is a range. */
export function fmtRange(r: Range, digits = 0, sep = '–'): string {
  const f = (n: number) => (digits ? n.toFixed(digits) : String(Math.round(n)))
  return isPoint(r) || f(r.min) === f(r.max) ? f(r.min) : `${f(r.min)}${sep}${f(r.max)}`
}

/** "41.3%" or "38.2–44.0%". */
export const fmtPct = (r: Range, digits = 1) => `${fmtRange(r, digits)}%`

/** Midpoint, for the rare place a single representative value is needed. */
export const mid = (r: Range): number => (r.min + r.max) / 2
