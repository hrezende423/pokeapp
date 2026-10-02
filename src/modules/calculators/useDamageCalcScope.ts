/**
 * The damage calculator's OWN game -- the THIRD sanctioned exception to the
 * app-wide selector, approved by the owner when this calculator was built.
 *
 * Why it departs from the rule: a damage calc is pinned to a ruleset. Someone
 * checking a Gen 3 matchup wants Gen 3's formula, items and category split
 * regardless of which game they happen to be browsing in the Pokedex, and
 * switching the whole app to change one calc's era would re-filter every other
 * screen behind it.
 *
 * SAME SHAPE AS useTypeCoverageScope, deliberately: seeded once from the app
 * selection (so opening the tool shows the game you were browsing), then
 * independent. It reads the app selection and never calls `setVersionGroup`, so
 * the dependency runs one way only.
 *
 * A GAME, NOT ONLY A GENERATION (owner, 2026-09-27). Every mechanic the engine
 * models is still per generation, and "can this Pokemon learn the move" is still
 * answered across the generation's games (useGenerationLearnset) -- what the game
 * decides is whose trainers the set list offers.
 */

import { useState } from 'react'
import { useVersionGroup } from '../version-group/context'
import { gameGroups, generationOfGame, type GameGroup } from '../version-group/games'
import { CALC_GENERATIONS } from './damage'

export interface DamageCalcScope {
  versionGroup: string
  generation: number
  games: GameGroup[]
  setVersionGroup: (vg: string) => void
}

const LATEST = 'heartgold-soulsilver'

export function useDamageCalcScope(initial?: string | null): DamageCalcScope {
  const app = useVersionGroup()
  const [games] = useState(() =>
    gameGroups().filter((g) => (CALC_GENERATIONS as readonly number[]).includes(g.generation)),
  )
  const [versionGroup, setVersionGroup] = useState<string>(() => {
    // A prefill from another screen (damageCalcHandoff.ts) brings its own game.
    const name = initial ?? app.versionGroup?.name
    return name && games.some((g) => g.options.some((o) => o.value === name)) ? name : LATEST
  })
  return {
    versionGroup,
    generation: generationOfGame(versionGroup) ?? 4,
    games,
    setVersionGroup,
  }
}
