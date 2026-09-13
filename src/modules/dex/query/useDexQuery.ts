import { useCallback, useMemo, useState } from 'react'
import { sortRows } from '../../../components/sortValues'
import {
  applyFilters,
  clampValues,
  defaultValue,
  filterIsActive,
  querySignature,
  type DexFilter,
  type FilterSection,
  type FilterValue,
  type FilterValues,
  type SortDirection,
  type SortField,
} from './dexQuery'

/**
 * One dex's filter and sort state, and the list that falls out of it.
 *
 * Filter and sort in the same hook rather than two: they answer the same
 * question ("what is on screen, in what order"), they share the signature the
 * scroll memory is keyed by, and a page that reset one without the other would
 * be the drift this whole pass exists to remove.
 *
 * THE STATE IS A FLAT MAP, keyed by filter key. Not one useState per filter:
 * the definitions are data, the count differs per dex and per era, and hooks
 * cannot be conditional. The values are deliberately loose (`FilterValue`) and
 * read back through the `as*` helpers, which is the cost of a config-driven
 * panel and is paid in one file rather than in six dexes.
 *
 * CLAMPING RUNS ON READ, not on a generation-change effect. An effect would fire
 * after a render that had already filtered with the stale selection, so the list
 * would flash the wrong contents; deriving the effective values means a
 * generation change and its clamp land in the same paint.
 *
 * SO DOES THE RESET. `resetKey` changes when the reader moves to another dex,
 * and the state carries the key it was written under: a mismatch is simply
 * ignored and the defaults are used instead. That is a derivation rather than a
 * setState-during-render or an effect -- no extra render, no frame of the
 * previous dex's filters applied to this dex's list, and nothing to remember to
 * call.
 */
export interface DexQuery<T> {
  /** Filtered and sorted, ready to render. */
  visible: T[]
  /** The clamped values -- what the controls should display. */
  values: FilterValues
  setValue: (key: string, value: FilterValue) => void
  /** Clear one section's filters, leaving the rest alone. */
  resetSection: (sectionId: string) => void
  clearAll: () => void
  /** Is this section narrowing the list? Drives its reset icon. */
  sectionIsActive: (sectionId: string) => boolean
  /** How many filters are narrowing the list, across every section. */
  activeCount: number
  sortKey: string | null
  direction: SortDirection
  setSort: (key: string, direction: SortDirection) => void
  /** Changes whenever `visible` would. Part of the scroll-memory key. */
  signature: string
}

interface QueryState {
  key: string
  values: FilterValues
  sortKey: string | null
  direction: SortDirection
}

const freshState = (key: string, defaultSort: string | null): QueryState => ({
  key,
  values: {},
  sortKey: defaultSort,
  direction: 'asc',
})

export function useDexQuery<T>({
  entries,
  sections,
  sorts = [],
  defaultSort = null,
  resetKey = 'dex',
}: {
  entries: T[]
  sections: FilterSection<T>[]
  sorts?: SortField<T>[]
  /** Sort field applied before anything is picked. null keeps the entry order. */
  defaultSort?: string | null
  /** Changing this abandons the current filters and sort. See the note above. */
  resetKey?: string
}): DexQuery<T> {
  const [stored, setStored] = useState<QueryState>(() => freshState(resetKey, defaultSort))
  const state = stored.key === resetKey ? stored : freshState(resetKey, defaultSort)

  /** Every write starts from the EFFECTIVE state, so a stale one is discarded. */
  const update = useCallback(
    (change: (current: QueryState) => QueryState) => {
      setStored((prev) => change(prev.key === resetKey ? prev : freshState(resetKey, defaultSort)))
    },
    [resetKey, defaultSort],
  )

  const values = useMemo(() => clampValues(sections, state.values), [sections, state.values])

  /*
    The sort field list can SHRINK under a live selection: the Pokedex offers
    twelve fields in its list view and four in its grid, so switching back to the
    grid while sorted by Sp. Atk leaves a key nothing can satisfy. Falling back to
    the default here rather than in an effect means the panel reports what the
    list is really ordered by in the same paint, instead of showing a field it no
    longer offers for one frame.
  */
  const sortKey = useMemo(
    () => (sorts.some((s) => s.key === state.sortKey) ? state.sortKey : defaultSort),
    [sorts, state.sortKey, defaultSort],
  )
  const direction = state.direction

  const setValue = useCallback(
    (key: string, value: FilterValue) => {
      update((current) => ({ ...current, values: { ...current.values, [key]: value } }))
    },
    [update],
  )

  const resetSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return
      update((current) => {
        const next = { ...current.values }
        for (const filter of section.filters) next[filter.key] = defaultValue(filter)
        return { ...current, values: next }
      })
    },
    [sections, update],
  )

  const clearAll = useCallback(() => {
    update((current) => ({ ...current, values: {} }))
  }, [update])

  const setSort = useCallback(
    (key: string, next: SortDirection) => {
      update((current) => ({ ...current, sortKey: key, direction: next }))
    },
    [update],
  )

  const activeFilters: DexFilter<T>[] = useMemo(
    () =>
      sections
        .flatMap((s) => s.filters)
        .filter((f) => !f.hidden && filterIsActive(f, values[f.key])),
    [sections, values],
  )

  const sectionIsActive = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return false
      return section.filters.some((f) => !f.hidden && filterIsActive(f, values[f.key]))
    },
    [sections, values],
  )

  const filtered = useMemo(
    () => applyFilters(entries, sections, values),
    [entries, sections, values],
  )

  const visible = useMemo(() => {
    const field = sorts.find((s) => s.key === sortKey)
    if (!field) return filtered
    return sortRows(filtered, field.value, direction)
  }, [filtered, sorts, sortKey, direction])

  const signature = useMemo(
    () => querySignature(sections, values, sortKey, direction),
    [sections, values, sortKey, direction],
  )

  // Memoised because consumers memoise on it: this object travels through a
  // context, and a fresh identity every render would make that context value
  // change on every render of the app shell.
  return useMemo(
    () => ({
      visible,
      values,
      setValue,
      resetSection,
      clearAll,
      sectionIsActive,
      activeCount: activeFilters.length,
      sortKey,
      direction,
      setSort,
      signature,
    }),
    [
      visible,
      values,
      setValue,
      resetSection,
      clearAll,
      sectionIsActive,
      activeFilters,
      sortKey,
      direction,
      setSort,
      signature,
    ],
  )
}
