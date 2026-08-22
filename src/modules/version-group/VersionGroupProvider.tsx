import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { listVersionGroups } from '../../data'
import { VersionGroupContext, type VersionGroupState } from './context'

/**
 * Default selection: the newest in-scope games, so the Pokedex opens on the full
 * 493-species dex rather than a 151-species subset.
 */
const DEFAULT_VERSION_GROUP = 'heartgold-soulsilver'

export function VersionGroupProvider({ children }: { children: ReactNode }) {
  const available = useMemo(() => listVersionGroups(), [])
  const [name, setName] = useState(
    () => available.find((v) => v.name === DEFAULT_VERSION_GROUP)?.name ?? available[0].name,
  )

  const setVersionGroup = useCallback((next: string) => {
    setName(next)
  }, [])

  const value = useMemo<VersionGroupState>(() => {
    const versionGroup = available.find((v) => v.name === name) ?? available[0]
    return {
      versionGroup,
      generation: versionGroup.generation_id ?? 1,
      setVersionGroup,
      available,
    }
  }, [available, name, setVersionGroup])

  return <VersionGroupContext.Provider value={value}>{children}</VersionGroupContext.Provider>
}
