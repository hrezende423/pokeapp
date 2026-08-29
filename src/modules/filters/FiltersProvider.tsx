import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { typesInGeneration } from '../../data'
import { useVersionGroup } from '../version-group/context'
import { FiltersContext } from './filtersContext'

/** Must sit inside VersionGroupProvider: the generation clamp reads from it. */
export function FiltersProvider({ children }: { children: ReactNode }) {
  const { generation } = useVersionGroup()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<number[]>([])

  const availableTypes = useMemo(() => typesInGeneration(generation), [generation])

  // A type that stops existing when the generation changes must not keep
  // filtering, so the clamp happens here and both consumers see the same list.
  const clamped = useMemo(
    () => typeFilter.filter((id) => availableTypes.some((t) => t.id === id)),
    [typeFilter, availableTypes],
  )

  const value = useMemo(
    () => ({
      search,
      setSearch,
      typeFilter: clamped,
      setTypeFilter,
      availableTypes,
      active: search.trim().length > 0 || clamped.length > 0,
    }),
    [search, clamped, availableTypes],
  )

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
}
