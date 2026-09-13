import { useMemo, useState, type ReactNode } from 'react'
import { typesInGeneration } from '../../../data'
import { useDexSelection, useNav } from '../../nav/navContext'
import type { DexModuleId } from '../../nav/registry'
import {
  buildSpeciesRows,
  speciesFilterSections,
  speciesSortFields,
  type SpeciesView,
} from '../../pokedex/speciesQuery'
import { useVersionGroup } from '../../version-group/context'
import {
  abilityEntries,
  berryEntries,
  eggGroupEntries,
  itemEntries,
  moveEntries,
  natureEntries,
  speciesEntries,
} from '../entrySources'
import { DexQueryContext } from './dexQueryContext'
import type { FilterSection, SortField } from './dexQuery'
import {
  abilitydexSections,
  abilitydexSorts,
  berrydexSections,
  berrydexSorts,
  breedingdexSections,
  itemdexSections,
  itemdexSorts,
  movedexSections,
  naturedexSections,
} from './registries'
import { useDexQuery } from './useDexQuery'

/**
 * One query for whichever dex is on screen, owned above the app bar.
 *
 * Every entry list here comes from modules/dex/entrySources.ts and nothing
 * re-derives a generation rule beside it -- that is the app's oldest standing
 * rule and the reason the global search and each dex cannot disagree about
 * scope. This provider simply asks the same functions the dexes used to call
 * themselves.
 *
 * THE COST IS ONE LIST PER RENDER OF THE ACTIVE DEX, not all six: `buildConfig`
 * switches on the module id, so browsing the Itemdex never builds species rows.
 * Each branch is memoised on the generation, so changing a filter does not
 * rebuild the list it filters.
 */
interface DexConfig {
  dexId: DexModuleId | null
  entries: unknown[]
  sections: FilterSection<unknown>[]
  sorts: SortField<unknown>[]
  defaultSort: string | null
}

const EMPTY: DexConfig = {
  dexId: null,
  entries: [],
  sections: [],
  sorts: [],
  defaultSort: null,
}

/* The three casts per branch are the type erasure the context documents: the
   config is built for ONE dex and consumed by that dex, and useDexRows checks
   the pairing at runtime because the compiler cannot see across the context. */
const erase = <T,>(
  dexId: DexModuleId,
  entries: T[],
  sections: FilterSection<T>[],
  sorts: SortField<T>[],
  defaultSort: string | null,
): DexConfig => ({
  dexId,
  entries: entries as unknown[],
  sections: sections as unknown as FilterSection<unknown>[],
  sorts: sorts as unknown as SortField<unknown>[],
  defaultSort,
})

export function DexQueryProvider({ children }: { children: ReactNode }) {
  const nav = useNav()
  const { generation, isAll } = useVersionGroup()
  const [view, setView] = useState<SpeciesView>('grid')
  const [selectedSpecies] = useDexSelection('pokedex')

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])
  const moduleId = nav.moduleId

  const config = useMemo<DexConfig>(() => {
    const scope = { generation, isAll }
    switch (moduleId) {
      case 'pokedex': {
        const rows = buildSpeciesRows(speciesEntries(scope), generation)
        return erase(
          'pokedex',
          rows,
          speciesFilterSections({ rows, generation, availableTypes }),
          speciesSortFields(),
          'dex',
        )
      }
      case 'movedex': {
        const entries = moveEntries(scope)
        // No sort fields: this list is a table and its headers are its sort.
        return erase('movedex', entries, movedexSections(availableTypes), [], null)
      }
      case 'itemdex': {
        const entries = itemEntries(scope)
        return erase('itemdex', entries, itemdexSections(entries), itemdexSorts, 'id')
      }
      case 'berrydex': {
        const entries = berryEntries(scope)
        return erase('berrydex', entries, berrydexSections(availableTypes), berrydexSorts, 'id')
      }
      case 'abilitydex': {
        const entries = abilityEntries(scope)
        return erase('abilitydex', entries, abilitydexSections(entries), abilitydexSorts, 'id')
      }
      case 'naturedex':
        // No sort fields: the page is a 5x5 matrix whose axes are the two stats,
        // so a cell's position is its meaning and there is nothing to re-order.
        return erase('naturedex', natureEntries(scope), naturedexSections(), [], null)
      case 'breedingdex':
        return erase('breedingdex', eggGroupEntries(scope), breedingdexSections(), [], null)
      default:
        // Type Coverage, Team Building, the design-system page: not a dex, so the
        // bar shows no filters and no sort.
        return EMPTY
    }
  }, [moduleId, generation, isAll, availableTypes])

  const query = useDexQuery({
    entries: config.entries,
    sections: config.sections,
    sorts: config.sorts,
    defaultSort: config.defaultSort,
    // Switching dex starts a fresh query. Without this a name typed on the
    // Pokedex would still be narrowing the Itemdex a click later, from a control
    // whose panel the reader has not opened.
    resetKey: config.dexId ?? 'none',
  })

  const value = useMemo(
    () => ({
      dexId: config.dexId,
      sections: config.sections,
      sorts: config.sorts,
      query,
      sortDisabled: config.dexId === 'pokedex' && view === 'list',
      view,
      setView,
      // The Pokedex's browse page only: with a species open there is no list on
      // screen for the switch to describe.
      showViewToggle: config.dexId === 'pokedex' && selectedSpecies == null,
    }),
    [config, query, view, selectedSpecies],
  )

  return <DexQueryContext.Provider value={value}>{children}</DexQueryContext.Provider>
}
