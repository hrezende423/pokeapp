/**
 * The one comparator every sorted list in the app uses.
 *
 * It was DataTable's, inline, and it was the right implementation -- stable,
 * null-last in both directions, numbers compared as numbers and everything else
 * by locale. The dex sort panels needed exactly that behaviour for lists that
 * are NOT tables (the Pokedex grid, the Berrydex cards, the ledger lists), and
 * two copies of a comparator is two chances for "Power, descending" to mean
 * something different depending on which control you reached for.
 *
 * NULL-LAST REGARDLESS OF DIRECTION, which is the part worth keeping honest: a
 * status move has no power, it is not "0 power", and an item with no fling power
 * cannot be flung at all. Sinking those rows whichever way the arrow points is
 * the difference between "no value" and "the smallest value".
 */

export type SortValue = string | number | null

/** `sign` is 1 for ascending, -1 for descending. Nulls sort last either way. */
export function compareSortValues(a: SortValue, b: SortValue, sign: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign
  return String(a).localeCompare(String(b)) * sign
}

/**
 * A copy of `rows`, sorted by one accessor.
 *
 * Slices first: `Array.prototype.sort` mutates, and `rows` belongs to the caller
 * -- re-ordering a memoised array in place is how a list ends up sorted before
 * React has been told anything changed.
 */
export function sortRows<T>(
  rows: T[],
  value: (row: T) => SortValue,
  direction: 'asc' | 'desc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return rows.slice().sort((a, b) => compareSortValues(value(a), value(b), sign))
}
