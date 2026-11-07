import { useSyncExternalStore } from 'react'
import type { VersionGroup } from '../../data'
import { useVersionGroup } from './context'
import { defaultGameOfGeneration, gamesInGeneration } from './games'

export interface GameInGeneration {
  /** The game this screen is showing, or null under "All" (or a generation without one). */
  versionGroup: VersionGroup | null
  /** Games of the app's generation this screen can show. Length < 2 hides the row. */
  games: VersionGroup[]
  setVersionGroup: (name: string) => void
}

/*
  THE PICKS LIVE OUTSIDE REACT, keyed by screen, for two reasons. The Trainer
  Dex's game is read in two places -- the page and the app-level DexQueryProvider
  that builds its filters -- and the two must agree. And a pick should survive
  opening another entry of the same dex (the Movedex detail remounts per move).
  Session-only, like the app's own selection.
*/
const picks = new Map<string, { generation: number; name: string }>()
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * A screen's own game, INSIDE the app's generation.
 *
 * The app picks a generation; a few screens hold data that differs between that
 * generation's games (the Trainer Dex's trainers, the Movedex's "learned by").
 * Those screens offer a game row, the same one the species page has, seeded to
 * the generation's default game.
 *
 * The pick is remembered against the generation it was made in: changing the
 * app's generation falls back to the new generation's default rather than
 * holding a name from the old one, without an effect syncing state to props.
 *
 * `screen` names the pick; two callers with the same name share it.
 */
export function useGameInGeneration(
  screen: string,
  include?: (vg: string) => boolean,
): GameInGeneration {
  const app = useVersionGroup()
  const pick = useSyncExternalStore(subscribe, () => picks.get(screen))

  if (app.isAll) return { versionGroup: null, games: [], setVersionGroup: () => {} }

  const generation = app.generation
  const games = gamesInGeneration(generation, include)
  const picked =
    pick && pick.generation === generation ? games.find((g) => g.name === pick.name) : undefined
  return {
    versionGroup: picked ?? defaultGameOfGeneration(generation, include),
    games,
    setVersionGroup: (name) => {
      picks.set(screen, { generation, name })
      listeners.forEach((fn) => fn())
    },
  }
}
