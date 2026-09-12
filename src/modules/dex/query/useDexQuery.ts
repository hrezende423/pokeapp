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

export function useDexQuery<T>({
  entries,
  sections,
  sorts = [],
  defaultSort = null,
}: {
  entries: T[]
  sections: FilterSection<T>[]
  sorts?: SortField<T>[]
  /** Sort field applied before anything is picked. null keeps the entry order. */
  defaultSort?: string | null
}): DexQuery<T> {
  const [raw, setRaw] = useState<FilterValues>({})
  const [pickedSort, setPickedSort] = useState<string | null>(defaultSort)
  const [direction, setDirection] = useState<SortDirection>('asc')

  /*
    The sort field list can SHRINK under a live selection: the Pokedex offers
    eleven fields in its list view and three in its grid, so switching back to
    the grid while sorted by Sp. Atk leaves a key nothing can satisfy. Falling
    back to the default here rather than in an effect means the panel reports
    what the list is really ordered by in the same paint, instead of showing a
    field it no longer offers for one frame.
  */
  const sortKey = useMemo(
    () => (sorts.some((s) => s.key === pickedSort) ? pickedSort : defaultSort),
    [sorts, pickedSort, defaultSort],
  )

  const values = useMemo(() => clampValues(sections, raw), [sections, raw])

  const setValue = useCallback((key: string, value: FilterValue) => {
    setRaw((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetSection = useCallback(
    (sectionId: string) => {
      const section = sections.find((s) => s.id === sectionId)
      if (!section) return
      setRaw((prev) => {
        const next = { ...prev }
        for (const filter of section.filters) next[filter.key] = defaultValue(filter)
        return next
      })
    },
    [sections],
  )

  const clearAll = useCallback(() => setRaw({}), [])

  const setSort = useCallback((key: string, next: SortDirection) => {
    setPickedSort(key)
    setDirection(next)
  }, [])

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

  // Memoised because consumers memoise on it: the Pokedex hands this whole
  // object through a context, and a fresh identity every render would make that
  // context value change on every render of the app shell.
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
