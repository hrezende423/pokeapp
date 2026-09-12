/**
 * What a dex's filters and sorts ARE, as data.
 *
 * Every dex in the app now offers search, filter and sort. Five of them do it
 * from a shared shell and the Pokedex does it from the app bar, and none of them
 * describes its own controls in JSX: a dex declares a list of sections, each
 * holding a list of filter definitions, plus a list of sort fields -- and the
 * panel renders whatever it is handed. Same decision DataTable's column config
 * made for the Movedex, for the same reason: the second dense list should be a
 * config, not a second component.
 *
 * WHY A DISCRIMINATED UNION RATHER THAN A RENDER FUNCTION PER FILTER. Six kinds
 * cover every filter the six dexes asked for (text, multi-select, single select,
 * numeric range, boolean toggle, and the type filter), and each kind carries its
 * own `match`. That means the PANEL owns every control's markup -- one hairline
 * underline, one middot row, one reset -- and a dex cannot accidentally ship a
 * bordered box because it drew its own input. `custom` is deliberately absent:
 * the moment a dex needs a control this file has no kind for, the right move is
 * a seventh kind here, not an escape hatch that re-opens the drift.
 *
 * THE "types" KIND IS THE ONE EXCEPTION TO "the panel owns the markup", and it
 * is the sanctioned one: the type filter is `components/TypeFilter.tsx`, the
 * bordered per-type pill, reused exactly as the Pokedex and Movedex already ship
 * it. It is a kind here rather than a render prop so it is still declared, still
 * resettable and still counted as active like everything else.
 *
 * `hidden` is how an era removes a filter. Habitat is a Generation 3 concept and
 * Gen 1's Special is one stat rather than two, so those definitions are built
 * with `hidden: true` in the eras they do not belong to -- and a hidden filter is
 * skipped by BOTH the renderer and the matcher, which is what stops a value left
 * over from another generation quietly narrowing the list.
 */

import type { PokemonType } from '../../../data'
import type { SortValue } from '../../../components/sortValues'

export interface FilterOption {
  value: string
  label: string
}

/**
 * A fixed option list, or one derived from the other filters' current values.
 *
 * The derived form exists for exactly one relationship, and it is a real one:
 * the Itemdex's 40 categories belong to 8 pockets, and offering "Revival" while
 * the reader has narrowed to the Poke Balls pocket offers a choice that can only
 * ever return nothing. A category that leaves scope when the pocket selection
 * changes is dropped by the same clamp that drops an out-of-era type, so the
 * two controls cannot end up describing different lists.
 */
export type FilterOptions = FilterOption[] | ((values: FilterValues) => FilterOption[])

export function optionsOf(options: FilterOptions, values: FilterValues): FilterOption[] {
  return typeof options === 'function' ? options(values) : options
}

interface FilterBase {
  /** Unique within its dex. Drives the state key and the test ids. */
  key: string
  label: string
  /**
   * Override for the control's test id. One use: every dex's name search has
   * been `<dex>-search` since before this config existed, and the shared
   * Playwright helper drives it by that id on six pages. Renaming it to
   * `<dex>-filter-name` would have been a rename with no reader-visible reason
   * and six suites' worth of churn.
   */
  testId?: string
  /** Hidden from the panel AND skipped when matching. See the note above. */
  hidden?: boolean
  /**
   * Rendered, settable, and DELIBERATELY INERT.
   *
   * For a control whose UI is agreed but whose semantics are not. It never
   * matches (so it cannot narrow the list), never counts as active (so it
   * cannot light the accent or enable a reset), and must carry a `note` saying
   * so -- a control that quietly does nothing is worse than no control, and the
   * whole value of shipping one is that the question it raises is visible.
   * Exactly one exists: the Pokedex's "Has evolutions".
   */
  stub?: boolean
  /** A line of explanation under the control. Required for a `stub`. */
  note?: string
}

/** Free text, matched by the definition rather than by a fixed name comparison. */
export interface TextFilter<T> extends FilterBase {
  kind: 'text'
  placeholder?: string
  match: (entry: T, term: string) => boolean
}

/** Middot-separated ghost buttons, OR across the selection. */
export interface MultiFilter<T> extends FilterBase {
  kind: 'multi'
  options: FilterOptions
  match: (entry: T, selected: string[]) => boolean
}

/** A native select. The cleared state is the empty string and is always first. */
export interface SelectFilter<T> extends FilterBase {
  kind: 'select'
  options: FilterOptions
  /** Label for the cleared option, e.g. "Any". */
  anyLabel?: string
  match: (entry: T, value: string) => boolean
}

/**
 * Two numeric inputs. An entry whose value is null is EXCLUDED once either bound
 * is set: "between 60 and 80" is a question a missing number cannot answer, and
 * treating it as zero would be inventing a measurement.
 */
export interface RangeFilter<T> extends FilterBase {
  kind: 'range'
  value: (entry: T) => number | null
  /** Shown as the input placeholders, so the reader knows the real extent. */
  bounds: { min: number; max: number }
  step?: number
  unit?: string
}

/** A single on/off condition, applied only while on. */
export interface ToggleFilter<T> extends FilterBase {
  kind: 'toggle'
  match: (entry: T) => boolean
}

/** The shared TypeFilter, selection OR-ed, interpreted by the definition. */
export interface TypesFilter<T> extends FilterBase {
  kind: 'types'
  available: PokemonType[]
  testIdPrefix: string
  match: (entry: T, selected: number[]) => boolean
}

export type DexFilter<T> =
  | TextFilter<T>
  | MultiFilter<T>
  | SelectFilter<T>
  | RangeFilter<T>
  | ToggleFilter<T>
  | TypesFilter<T>

export interface FilterSection<T> {
  id: string
  label: string
  /**
   * true -> inside the collapsed "More filters" sub-disclosure. The name search
   * and each dex's one primary filter stay out of it, which is the whole point:
   * the controls you reach for every time are never behind two clicks.
   */
  more?: boolean
  filters: DexFilter<T>[]
}

/**
 * One sortable field.
 *
 * Deliberately the same shape as DataTable's `Column.sortValue`, so a page that
 * has both a table and a sort panel declares the accessor once and hands it to
 * both. The Pokedex list view does exactly that.
 */
export interface SortField<T> {
  key: string
  label: string
  value: (entry: T) => SortValue
}

export type SortDirection = 'asc' | 'desc'

export interface RangeValue {
  min: string
  max: string
}

/** Held as strings because these come straight off inputs: "" is "no bound". */
export type FilterValue = string | string[] | number[] | boolean | RangeValue

export type FilterValues = Record<string, FilterValue>

export const EMPTY_RANGE: RangeValue = { min: '', max: '' }

export function defaultValue<T>(filter: DexFilter<T>): FilterValue {
  switch (filter.kind) {
    case 'text':
      return ''
    case 'select':
      return ''
    case 'multi':
      return []
    case 'types':
      return []
    case 'toggle':
      return false
    case 'range':
      return EMPTY_RANGE
  }
}

export function asText(value: FilterValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

export function asStrings(value: FilterValue | undefined): string[] {
  return Array.isArray(value) ? (value as unknown[]).filter((v) => typeof v === 'string') : []
}

export function asNumbers(value: FilterValue | undefined): number[] {
  return Array.isArray(value) ? (value as unknown[]).filter((v) => typeof v === 'number') : []
}

export function asBool(value: FilterValue | undefined): boolean {
  return value === true
}

export function asRange(value: FilterValue | undefined): RangeValue {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) return value
  return EMPTY_RANGE
}

/** Is this filter currently narrowing the list? Drives the reset icons and the accent. */
export function filterIsActive<T>(filter: DexFilter<T>, value: FilterValue | undefined): boolean {
  if (filter.hidden || filter.stub) return false
  switch (filter.kind) {
    case 'text':
      return asText(value).trim().length > 0
    case 'select':
      return asText(value).length > 0
    case 'multi':
      return asStrings(value).length > 0
    case 'types':
      return asNumbers(value).length > 0
    case 'toggle':
      return asBool(value)
    case 'range': {
      const range = asRange(value)
      return range.min.trim().length > 0 || range.max.trim().length > 0
    }
  }
}

/**
 * Drop selections the current era no longer offers.
 *
 * The same clamp FiltersProvider has always applied to the type filter, applied
 * to every kind that has a fixed option set: a Ghost selection made in Gen 4 must
 * not keep filtering a Gen 1 list where Ghost is still a type but a Steel
 * selection would not be. Returns the SAME object when nothing changed, so the
 * memo downstream is not invalidated on every render.
 */
export function clampValues<T>(sections: FilterSection<T>[], values: FilterValues): FilterValues {
  let changed = false
  const out: FilterValues = { ...values }
  for (const section of sections) {
    for (const filter of section.filters) {
      const value = values[filter.key]
      if (value == null) continue
      if (filter.kind === 'multi') {
        // Resolved against `out`, not `values`: sections are declared in
        // dependency order, so a pocket cleared a moment ago has already landed
        // there and the categories it governed go with it in the same pass.
        const options = optionsOf(filter.options, out)
        const kept = asStrings(value).filter((v) => options.some((o) => o.value === v))
        if (kept.length !== asStrings(value).length) {
          out[filter.key] = kept
          changed = true
        }
      } else if (filter.kind === 'select') {
        const current = asText(value)
        if (current && !optionsOf(filter.options, out).some((o) => o.value === current)) {
          out[filter.key] = ''
          changed = true
        }
      } else if (filter.kind === 'types') {
        const kept = asNumbers(value).filter((id) => filter.available.some((t) => t.id === id))
        if (kept.length !== asNumbers(value).length) {
          out[filter.key] = kept
          changed = true
        }
      }
    }
  }
  return changed ? out : values
}

function matchesRange<T>(
  filter: RangeFilter<T>,
  entry: T,
  value: FilterValue | undefined,
): boolean {
  const { min, max } = asRange(value)
  const lo = min.trim() === '' ? null : Number(min)
  const hi = max.trim() === '' ? null : Number(max)
  if (lo == null && hi == null) return true
  const actual = filter.value(entry)
  // No number is not a small number -- see the type's own note.
  if (actual == null) return false
  if (lo != null && !Number.isNaN(lo) && actual < lo) return false
  if (hi != null && !Number.isNaN(hi) && actual > hi) return false
  return true
}

export function matchesFilter<T>(
  filter: DexFilter<T>,
  entry: T,
  value: FilterValue | undefined,
): boolean {
  if (filter.hidden || filter.stub) return true
  switch (filter.kind) {
    case 'text': {
      const term = asText(value).trim().toLowerCase()
      return term === '' || filter.match(entry, term)
    }
    case 'select': {
      const picked = asText(value)
      return picked === '' || filter.match(entry, picked)
    }
    case 'multi': {
      const selected = asStrings(value)
      return selected.length === 0 || filter.match(entry, selected)
    }
    case 'types': {
      const selected = asNumbers(value)
      return selected.length === 0 || filter.match(entry, selected)
    }
    case 'toggle':
      return !asBool(value) || filter.match(entry)
    case 'range':
      return matchesRange(filter, entry, value)
  }
}

export function applyFilters<T>(
  entries: T[],
  sections: FilterSection<T>[],
  values: FilterValues,
): T[] {
  const active = sections
    .flatMap((s) => s.filters)
    .filter((f) => !f.hidden && filterIsActive(f, values[f.key]))
  if (active.length === 0) return entries
  return entries.filter((entry) => active.every((f) => matchesFilter(f, entry, values[f.key])))
}

/**
 * A short string that changes whenever the visible list would.
 *
 * Feeds the scroll-memory key. A narrowed or re-ordered list is a different list,
 * and an offset measured against the previous one would drop the reader somewhere
 * they had never been -- the same reasoning the Pokedex grid's key already used
 * for its search term and type filter, extended to everything else.
 */
export function querySignature<T>(
  sections: FilterSection<T>[],
  values: FilterValues,
  sortKey: string | null,
  direction: SortDirection,
): string {
  const parts: string[] = []
  for (const section of sections) {
    for (const filter of section.filters) {
      if (filter.hidden) continue
      const value = values[filter.key]
      if (!filterIsActive(filter, value)) continue
      if (filter.kind === 'range') {
        const range = asRange(value)
        parts.push(`${filter.key}=${range.min}-${range.max}`)
      } else if (Array.isArray(value)) {
        parts.push(`${filter.key}=${[...value].sort().join('.')}`)
      } else {
        parts.push(`${filter.key}=${String(value).trim().toLowerCase()}`)
      }
    }
  }
  parts.push(`sort=${sortKey ?? 'none'}.${direction}`)
  return parts.join('|')
}
