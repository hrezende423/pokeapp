/**
 * The damage calculator's OWN generation -- the THIRD sanctioned exception to the
 * app-wide selector, approved by the owner when this calculator was built.
 *
 * Why it departs from the rule: a damage calc is pinned to a ruleset. Someone
 * checking a Gen 3 matchup wants Gen 3's formula, items and category split
 * regardless of which game they happen to be browsing in the Pokedex, and
 * switching the whole app to change one calc's era would re-filter every other
 * screen behind it.
 *
 * SAME SHAPE AS useTypeCoverageScope, deliberately: seeded once from the app
 * selection (so opening the tool shows the era you were browsing), then
 * independent. It reads the app selection and never calls `setVersionGroup`, so
 * the dependency runs one way only.
 *
 * GENERATION ONLY, no game axis. Every mechanic the engine models is per
 * generation, and "can this Pokemon learn the move" is answered across all of a
 * generation's games at once (useGenerationLearnset), so a second row of game
 * buttons would offer a choice that changes nothing on this screen.
 */

import { useState } from 'react'
import { useVersionGroup } from '../version-group/context'
import { CALC_GENERATIONS } from './damage'

export interface DamageCalcScope {
  generation: number
  generations: readonly number[]
  setGeneration: (generation: number) => void
}

export function useDamageCalcScope(): DamageCalcScope {
  const app = useVersionGroup()
  const [generation, setGeneration] = useState<number>(() =>
    (CALC_GENERATIONS as readonly number[]).includes(app.generation)
      ? app.generation
      : CALC_GENERATIONS[CALC_GENERATIONS.length - 1],
  )
  return { generation, generations: CALC_GENERATIONS, setGeneration }
}
