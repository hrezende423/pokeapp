import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { GENERATION_RANGES, LATEST_GENERATION, listVersionGroups } from '../../data'
import { VersionGroupContext, type VersionGroupState } from './context'
import { defaultGameOfGeneration } from './games'

/**
 * Default selection: Generation IV, the newest generation the whole app covers
 * (encounters, items and trainers stop there), and the era the old game selector
 * opened on (HeartGold/SoulSilver).
 */
const DEFAULT_GENERATION = 4

export function VersionGroupProvider({ children }: { children: ReactNode }) {
  const available = useMemo(() => listVersionGroups(), [])
  const generations = useMemo(
    () => GENERATION_RANGES.map((r) => r.generation).filter((g) => g <= LATEST_GENERATION),
    [],
  )
  const [selected, setSelected] = useState<number | null>(DEFAULT_GENERATION)

  const setGeneration = useCallback((next: number | null) => {
    setSelected(next)
  }, [])

  const value = useMemo<VersionGroupState>(() => {
    if (selected == null) {
      return {
        selectedGeneration: null,
        isAll: true,
        // Newest era in scope, derived from the generation ranges: it is the one
        // reading under which every species in the dex exists.
        generation: LATEST_GENERATION,
        versionGroup: null,
        setGeneration,
        generations,
        available,
      }
    }
    return {
      selectedGeneration: selected,
      isAll: false,
      generation: selected,
      versionGroup: defaultGameOfGeneration(selected),
      setGeneration,
      generations,
      available,
    }
  }, [available, generations, selected, setGeneration])

  return <VersionGroupContext.Provider value={value}>{children}</VersionGroupContext.Provider>
}
