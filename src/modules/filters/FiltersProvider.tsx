import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { typesInGeneration } from '../../data'
import { speciesEntries } from '../dex/entrySources'
import { useDexQuery } from '../dex/query/useDexQuery'
import {
  buildSpeciesRows,
  speciesFilterSections,
  speciesSortFields,
  type SpeciesView,
} from '../pokedex/speciesQuery'
import { useVersionGroup } from '../version-group/context'
import { FiltersContext } from './filtersContext'

/** Must sit inside VersionGroupProvider: every clamp below reads from it. */
export function FiltersProvider({ children }: { children: ReactNode }) {
  const { generation, isAll } = useVersionGroup()
  const [view, setView] = useState<SpeciesView>('grid')

  /*
    speciesEntries is the ONE source for "which species does this era have" --
    the global search calls the same function, and the two were once scoped
    differently, which is the generation leak that has to stay impossible.

    Rows are built once per era rather than per filter or per comparison: see
    the note in speciesQuery.ts for why that is a correctness point and not only
    a speed one.
  */
  const allRows = useMemo(
    () => buildSpeciesRows(speciesEntries({ generation, isAll }), generation),
    [generation, isAll],
  )

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  const sections = useMemo(
    () => speciesFilterSections({ rows: allRows, generation, availableTypes }),
    [allRows, generation, availableTypes],
  )

  // The grid can order by three fields and the table by all of them, so the
  // list is view-dependent; useDexQuery falls back to the default when a
  // selected field is no longer offered.
  const sorts = useMemo(() => speciesSortFields({ view, generation }), [view, generation])

  const query = useDexQuery({ entries: allRows, sections, sorts, defaultSort: 'dex' })

  const value = useMemo(
    () => ({ sections, sorts, query, allRows, view, setView }),
    [sections, sorts, query, allRows, view],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}
