import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { LATEST_GENERATION, listVersionGroups } from '../../data'
import { ALL_VERSION_GROUPS, VersionGroupContext, type VersionGroupState } from './context'

/**
 * Default selection: the newest in-scope games, so the Pokedex opens on the full
 * 493-species dex rather than a 151-species subset.
 */
const DEFAULT_VERSION_GROUP = 'heartgold-soulsilver'

export function VersionGroupProvider({ children }: { children: ReactNode }) {
  const available = useMemo(() => listVersionGroups(), [])
  const [selection, setSelection] = useState(
    () => available.find((v) => v.name === DEFAULT_VERSION_GROUP)?.name ?? available[0].name,
  )

  const setVersionGroup = useCallback((next: string) => {
    setSelection(next)
  }, [])

  const value = useMemo<VersionGroupState>(() => {
    if (selection === ALL_VERSION_GROUPS) {
      return {
        versionGroup: null,
        selection,
        isAll: true,
        // Newest era in scope, derived from the generation ranges: it is the one
        // reading under which every species in the dex exists.
        generation: LATEST_GENERATION,
        setVersionGroup,
        available,
      }
    }
    const versionGroup = available.find((v) => v.name === selection) ?? available[0]
    return {
      versionGroup,
      selection: versionGroup.name,
      isAll: false,
      generation: versionGroup.generation_id ?? 1,
      setVersionGroup,
      available,
    }
  }, [available, selection, setVersionGroup])

  return <VersionGroupContext.Provider value={value}>{children}</VersionGroupContext.Provider>
}
