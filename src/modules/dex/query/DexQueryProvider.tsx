import { useMemo, useState, type ReactNode } from 'react'
import { typesInGeneration } from '../../../data'
import { useDexSelection, useNav } from '../../nav/navContext'
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
import { trainerEntries, useTrainerPartition, useTrainerdexGame } from '../trainerEntries'
import { DexQueryContext, type QueryListId } from './dexQueryContext'
import {
  buildFilterSections,
  buildRows,
  buildSortFields,
  teamFilterSections,
  teamRows,
  teamSortFields,
} from '../../team-builder/libraryQuery'
import { useTeamBuilderData } from '../../team-builder/store'
import { useTbScreen } from '../../team-builder/tbNav'
import type { FilterSection, SortField } from './dexQuery'
import {
  abilitydexSections,
  berrydexSections,
  berrydexSorts,
  breedingdexSections,
  itemdexSections,
  movedexSections,
  naturedexSections,
  trainerdexSections,
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
  dexId: QueryListId | null
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
  dexId: QueryListId,
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

const TEAM_BUILDING_IDS = new Set(['my-teams', 'build-library', 'new-team', 'new-build'])

export function DexQueryProvider({ children }: { children: ReactNode }) {
  const nav = useNav()
  const { generation, isAll } = useVersionGroup()
  const trainerGame = useTrainerdexGame()
  const [view, setView] = useState<SpeciesView>('grid')
  const [selectedSpecies] = useDexSelection('pokedex')

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])
  const moduleId = nav.moduleId

  /*
    THE ONE DEX WHOSE LIST IS FETCHED. Trainers are per game and live in an
    on-demand partition, so the list is empty until it arrives and this provider
    re-runs its config when it does. Asked for only while the Trainer Dex is the
    open module, so browsing elsewhere never downloads a game's trainers.
  */
  const trainerLoad = useTrainerPartition(
    moduleId === 'trainerdex' ? (trainerGame.versionGroup?.name ?? null) : null,
  )
  const trainerPartition = trainerLoad.state.status === 'ready' ? trainerLoad.state.partition : null
  const trainerRows = useMemo(
    () => (trainerPartition ? trainerEntries(trainerPartition) : []),
    [trainerPartition],
  )

  /*
    THE TEAM BUILDER'S TWO LIBRARIES, which are lists too. Which one is on screen
    is the module's own screen state (tbNav), not the nav id -- "New team" is a
    nav id that lands on the Team Library -- so it is read from there, and only
    while the Team Building module is the one open.
  */
  const tbScreen = useTbScreen()
  const tbData = useTeamBuilderData()
  const tbList: 'tb-builds' | 'tb-teams' | null = TEAM_BUILDING_IDS.has(moduleId)
    ? tbScreen.kind === 'build-library'
      ? 'tb-builds'
      : tbScreen.kind === 'my-teams'
        ? 'tb-teams'
        : null
    : null

  const config = useMemo<DexConfig>(() => {
    const scope = { generation, isAll }
    if (tbList === 'tb-builds') {
      const rows = buildRows(tbData)
      return erase('tb-builds', rows, buildFilterSections(rows), buildSortFields(), 'order')
    }
    if (tbList === 'tb-teams') {
      const rows = teamRows(tbData)
      return erase('tb-teams', rows, teamFilterSections(rows), teamSortFields(), 'order')
    }
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
        return erase('movedex', entries, movedexSections(entries, availableTypes), [], null)
      }
      case 'itemdex': {
        const entries = itemEntries(scope)
        // No sort fields: a table since 2026-10-10, its headers are its sort.
        return erase('itemdex', entries, itemdexSections(entries), [], null)
      }
      case 'berrydex': {
        const entries = berryEntries(scope)
        return erase('berrydex', entries, berrydexSections(availableTypes), berrydexSorts, 'id')
      }
      case 'abilitydex': {
        const entries = abilityEntries(scope)
        // No sort fields: a table since 2026-10-10, its headers are its sort.
        return erase('abilitydex', entries, abilitydexSections(entries), [], null)
      }
      case 'naturedex':
        // No sort fields: the page is a 5x5 matrix whose axes are the two stats,
        // so a cell's position is its meaning and there is nothing to re-order.
        return erase('naturedex', natureEntries(scope), naturedexSections(), [], null)
      case 'breedingdex':
        return erase('breedingdex', eggGroupEntries(scope), breedingdexSections(), [], null)
      case 'trainerdex':
        return erase(
          'trainerdex',
          trainerRows,
          trainerdexSections(trainerRows),
          // No sort fields: a table since 2026-10-10, its headers are its sort.
          [],
          null,
        )
      default:
        // Type Coverage, Team Building, the design-system page: not a dex, so the
        // bar shows no filters and no sort.
        return EMPTY
    }
  }, [moduleId, generation, isAll, availableTypes, trainerRows, tbList, tbData])

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
