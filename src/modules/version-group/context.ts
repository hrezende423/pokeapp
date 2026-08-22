/**
 * The app-wide "which game am I looking at" selection.
 *
 * Everything era-sensitive reads from here: which species the Pokedex lists,
 * which abilities a species had, which type chart applies, and which learnset
 * and encounter partitions get loaded.
 *
 * The selection can also be ALL_VERSION_GROUPS, which is not a game: it means
 * "the whole dex, no era filter". In that state `versionGroup` is null -- a real
 * null rather than a stand-in game -- and `generation` falls back to the newest
 * generation in scope so era-resolved data (types, abilities, effectiveness) has
 * a defined answer. Per-version-group data has no answer under "All", so the
 * learnset and encounter views ask for a specific game instead of guessing one.
 *
 * Deliberately NOT persisted. Persistence and the surrounding settings UI belong
 * to the Settings domain, which is a later pass.
 */

import { createContext, useContext } from 'react'
import type { VersionGroup } from '../../data'

/** Sentinel selection value for the unfiltered national dex. */
export const ALL_VERSION_GROUPS = 'all'

export interface VersionGroupState {
  /** The selected game, or null when the selection is "All". */
  versionGroup: VersionGroup | null
  /** Raw selection: a version-group name, or ALL_VERSION_GROUPS. */
  selection: string
  isAll: boolean
  /** Era to resolve generation-sensitive data with. Never null. */
  generation: number
  setVersionGroup: (name: string) => void
  available: VersionGroup[]
}

export const VersionGroupContext = createContext<VersionGroupState | null>(null)

export function useVersionGroup(): VersionGroupState {
  const ctx = useContext(VersionGroupContext)
  if (!ctx) {
    throw new Error('useVersionGroup must be used inside <VersionGroupProvider>')
  }
  return ctx
}
