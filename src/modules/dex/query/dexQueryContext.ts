/**
 * The active dex's query, hoisted to the app so the app bar can render it.
 *
 * WHY IT IS APP-LEVEL. There is one Search/Filter menu and one Sort menu now,
 * both in the bar, for every Pokepedia page -- and the bar is rendered ABOVE the
 * active module in the tree, so it cannot read a config that only exists once
 * that module has mounted. The provider therefore builds the config for whatever
 * module the nav says is active, owns the state, and hands the filtered, sorted
 * list back DOWN to the module that renders it.
 *
 * TYPE ERASURE AT THE BOUNDARY, AND A RUNTIME GUARD AT THE CONSUMER. The bundle
 * holds one dex's entries at a time and they are a different shape per dex, so
 * the context carries `unknown` and each module reads it through `useDexRows`,
 * which THROWS if the active dex is not the one asking. That turns a mis-wired
 * module from a silently wrong list -- a berry rendered as a species -- into an
 * immediate, loud failure. It is checked rather than cast blind precisely
 * because the compiler cannot see across this boundary.
 */

import { createContext, useContext } from 'react'
import type { DexModuleId } from '../../nav/registry'
import type { FilterSection, SortField } from './dexQuery'
import type { DexQuery } from './useDexQuery'
import type { SpeciesView } from '../../pokedex/speciesQuery'

export interface DexQueryBundle {
  /** The dex the bundle describes, or null on a page that is not a dex. */
  dexId: DexModuleId | null
  sections: FilterSection<unknown>[]
  sorts: SortField<unknown>[]
  query: DexQuery<unknown>
  /**
   * The Sort trigger renders but does nothing. True where the list on screen is
   * a TABLE and its own column headers are the sort control -- the Pokedex's
   * list view. Disabled rather than hidden: a control that disappears when you
   * switch view reads as a bug, where a greyed one says "not here, and here is
   * where it was".
   */
  sortDisabled: boolean
  /** Grid or table. Pokedex only; every other dex ignores it. */
  view: SpeciesView
  setView: (view: SpeciesView) => void
  /** The Grid/List switch belongs in the bar, on the Pokedex's list page only. */
  showViewToggle: boolean
}

export const DexQueryContext = createContext<DexQueryBundle | null>(null)

export function useDexQueryBundle(): DexQueryBundle {
  const ctx = useContext(DexQueryContext)
  if (!ctx) throw new Error('useDexQueryBundle must be used inside <DexQueryProvider>')
  return ctx
}

/**
 * The active dex's filtered, sorted rows, typed for the module asking.
 *
 * The `dexId` argument is not decoration: it is the guard that makes the cast
 * below safe to read. A module that asks while another dex is active is a wiring
 * bug, and it fails here rather than rendering the wrong entity's fields.
 */
export function useDexRows<T>(dexId: DexModuleId): { rows: T[]; query: DexQuery<T> } {
  const bundle = useDexQueryBundle()
  if (bundle.dexId !== dexId) {
    throw new Error(`useDexRows('${dexId}') called while the active dex query is '${bundle.dexId}'`)
  }
  return {
    rows: bundle.query.visible as T[],
    query: bundle.query as unknown as DexQuery<T>,
  }
}
