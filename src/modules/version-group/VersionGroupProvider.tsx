import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { GENERATION_RANGES, LATEST_GENERATION, listVersionGroups } from '../../data'
import { ALL_GENERATIONS, VersionGroupContext, type VersionGroupState } from './context'
import { defaultGameOfGeneration } from './games'

/**
 * Default selection: Generation IV, the newest generation the whole app covers
 * (encounters, items and trainers stop there), and the era the old game selector
 * opened on (HeartGold/SoulSilver).
 */
const DEFAULT_GENERATION = 4

/**
 * The selection persists across reloads and sessions, like the theme (theme.ts).
 * Stored as the select's own value: a generation number, or ALL_GENERATIONS.
 * Anything unreadable or out of range falls back to the default. Every access is
 * wrapped: storage can throw (Safari private mode, policy) and a preference is
 * not worth a blank app.
 */
const GENERATION_STORAGE_KEY = 'pokeapp:generation'

function readStoredGeneration(generations: number[]): number | null {
  try {
    const raw = localStorage.getItem(GENERATION_STORAGE_KEY)
    if (raw === ALL_GENERATIONS) return null
    const n = Number(raw)
    return raw != null && generations.includes(n) ? n : DEFAULT_GENERATION
  } catch {
    return DEFAULT_GENERATION
  }
}

function writeStoredGeneration(next: number | null): void {
  try {
    localStorage.setItem(GENERATION_STORAGE_KEY, next == null ? ALL_GENERATIONS : String(next))
  } catch {
    /* the selection still works for this session */
  }
}

export function VersionGroupProvider({ children }: { children: ReactNode }) {
  const available = useMemo(() => listVersionGroups(), [])
  const generations = useMemo(
    () => GENERATION_RANGES.map((r) => r.generation).filter((g) => g <= LATEST_GENERATION),
    [],
  )
  const [selected, setSelected] = useState<number | null>(() =>
    readStoredGeneration(generations),
  )

  const setGeneration = useCallback((next: number | null) => {
    setSelected(next)
    writeStoredGeneration(next)
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
