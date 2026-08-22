/**
 * The app-wide "which game am I looking at" selection.
 *
 * Everything era-sensitive reads from here: which species the Pokedex lists,
 * which abilities a species had, which type chart applies, and which learnset
 * and encounter partitions get loaded.
 *
 * Deliberately NOT persisted. Persistence and the surrounding settings UI belong
 * to the Settings domain, which is a later pass.
 */

import { createContext, useContext } from 'react'
import type { VersionGroup } from '../../data'

export interface VersionGroupState {
  versionGroup: VersionGroup
  /** Convenience mirror of versionGroup.generation_id, never null. */
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
