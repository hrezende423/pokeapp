/**
 * The app-wide "which generation am I looking at" selection.
 *
 * Everything era-sensitive reads from here: which species the Pokedex lists,
 * which abilities a species had, which type chart applies, what type and power a
 * move had.
 *
 * A GENERATION, NOT A GAME (owner, 2026-10-10). It used to pick a version group;
 * the control now picks a generation, and lives in the account menu under the
 * theme switch. Per-game data has not gone away, though -- learnsets, trainers,
 * prices and regional dex numbers really do differ between the games of one
 * generation -- so the state still carries `versionGroup`: the generation's
 * DEFAULT game (`defaultGameOfGeneration`), the stand-in for screens that need one
 * game but do not ask. The screens where the choice matters (the species page,
 * the Trainer Dex, the Movedex's "learned by") offer their own game row inside
 * the generation, seeded from that default -- see `useGameInGeneration`.
 *
 * The selection can also be "All", which is not a generation: it means "the whole
 * dex, no era filter". Then `versionGroup` is null -- a real null rather than a
 * stand-in game -- and `generation` falls back to the newest generation in scope
 * so era-resolved data has a defined answer.
 *
 * Deliberately NOT persisted. Persistence belongs to the Settings domain, which is
 * a later pass.
 */

import { createContext, useContext } from 'react'
import type { VersionGroup } from '../../data'

/** Sentinel selection value for the unfiltered national dex. */
export const ALL_GENERATIONS = 'all'

export interface VersionGroupState {
  /** The selected generation, or null when the selection is "All". */
  selectedGeneration: number | null
  isAll: boolean
  /** Era to resolve generation-sensitive data with. Never null. */
  generation: number
  /**
   * The selected generation's default game, or null under "All". A stand-in for
   * per-game data, not a choice the reader made.
   */
  versionGroup: VersionGroup | null
  setGeneration: (generation: number | null) => void
  /** Generations offered, ascending. */
  generations: number[]
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
