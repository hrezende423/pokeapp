/**
 * The Pokedex list's own query, lifted out of the list.
 *
 * It started as local state inside SpeciesList, which was fine while the
 * controls sat directly above the rows. They now live in the app bar's controls
 * panel, which is a sibling of the module rather than a child, so the state has
 * to be somewhere both can see -- and with the filter pass there are three
 * readers, not two: the filter panel, the sort panel and the list itself.
 *
 * WHY THE POKEDEX'S CONTROLS ARE IN THE BAR AND EVERY OTHER DEX'S ARE ON THE
 * PAGE. The browse grid is a reproduction of the Figma MainPage frame, which has
 * no header of any kind -- the grid sits directly under the app bar's hairline,
 * and that is signed off. A per-page controls row is exactly the header block
 * that was removed. So this dex puts the same two disclosures, built from the
 * same FilterPanel and SortPanel components, in the bar where its search and type
 * filter already lived.
 *
 * The generation clamp lives in the query engine rather than in either consumer:
 * a type, egg group or habitat that stops existing when the generation changes
 * must not keep filtering, and having one place hand out already-clamped values
 * means the controls and the list cannot disagree about what is selectable.
 */

import { createContext, useContext } from 'react'
import type { DexQuery } from '../dex/query/useDexQuery'
import type { FilterSection, SortField } from '../dex/query/dexQuery'
import type { SpeciesRow, SpeciesView } from '../pokedex/speciesQuery'

export interface SpeciesFilters {
  /** Filter definitions for the current era. */
  sections: FilterSection<SpeciesRow>[]
  /** Sort fields for the current era AND the current view. */
  sorts: SortField<SpeciesRow>[]
  /** State, setters, and the filtered+sorted rows. */
  query: DexQuery<SpeciesRow>
  /** Every species in scope, before filtering. For counts and empty states. */
  allRows: SpeciesRow[]
  /** Grid of cards, or the sortable table. */
  view: SpeciesView
  setView: (view: SpeciesView) => void
}

export const FiltersContext = createContext<SpeciesFilters | null>(null)

export function useFilters(): SpeciesFilters {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>')
  return ctx
}
