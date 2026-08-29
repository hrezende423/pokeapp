/**
 * The Pokedex list's own filters, lifted out of the list.
 *
 * They used to be local state inside SpeciesList, which was fine while the
 * controls sat directly above the rows. They now live in the app bar's controls
 * panel, which is a sibling of the module rather than a child, so the state has
 * to be somewhere both can see.
 *
 * The generation clamp lives here rather than in either consumer: a type that
 * stops existing when the generation changes must not keep filtering, and having
 * the provider hand out an already-clamped list means the control and the list
 * cannot disagree about which types are selectable.
 */

import { createContext, useContext } from 'react'
import type { PokemonType } from '../../data'

export interface DexFilters {
  /** Free-text name filter. */
  search: string
  setSearch: (value: string) => void
  /** Selected type ids, already clamped to the current generation. */
  typeFilter: number[]
  setTypeFilter: (value: number[]) => void
  /** Types that exist in the current generation. */
  availableTypes: PokemonType[]
  /** True when any filter is narrowing the list, for the panel's toggle badge. */
  active: boolean
}

export const FiltersContext = createContext<DexFilters | null>(null)

export function useFilters(): DexFilters {
  const ctx = useContext(FiltersContext)
  if (!ctx) throw new Error('useFilters must be used inside <FiltersProvider>')
  return ctx
}
