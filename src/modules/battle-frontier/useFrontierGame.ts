import { useVersionGroup } from '../version-group/context'
import { useGameInGeneration, type GameInGeneration } from '../version-group/gameInGeneration'
import { isFrontierTabGame } from './reference/games'

/**
 * The tab's game, INSIDE the app's generation (reference/games.ts): one pick
 * shared by every Frontier screen, the Trainer Dex's game-row pattern. null under
 * "All" and in a generation with none of the tab's games.
 */
export function useFrontierGame(): { scope: GameInGeneration; game: string | null; generation: number | null } {
  const { selectedGeneration } = useVersionGroup()
  const scope = useGameInGeneration('frontier', isFrontierTabGame)
  return { scope, game: scope.versionGroup?.name ?? null, generation: selectedGeneration }
}
