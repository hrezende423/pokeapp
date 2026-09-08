/**
 * This page's OWN generation, and the second sanctioned exception to the
 * app-wide selector.
 *
 * THE RULE IT DEPARTS FROM IS REAL, so the departure is written down rather than
 * assumed: CLAUDE.md's architecture section says the global game/generation
 * selector filters the entire app and that every module must respect it. Until
 * now the species page's locations section was the only exception. This is the
 * second, by explicit request, and for the same reason the species page has its
 * own scope: the question this page asks -- "which type chart, and which
 * combinations really exist" -- is being asked ABOUT a generation rather than
 * inside one, so answering it must not re-filter the Pokedex behind it.
 *
 * SEEDED ONCE, THEN INDEPENDENT. `useState` with an initialiser rather than an
 * effect syncing the app selection in: syncing would fight the reader every time
 * they picked a different era here, which is precisely the independence being
 * asked for. Opening the page still shows the era you were already browsing.
 *
 * The dependency runs one way only. This hook READS the app selection to seed
 * and never calls `setVersionGroup`, so changing the page's generation cannot
 * move the global one; and because the seed is captured on mount, changing the
 * global one cannot move this page's either.
 *
 * GENERATION ONLY, no version-group axis. Unlike a learnset, the type chart is
 * genuinely per generation -- every game in a generation shares one chart -- so
 * a second row of game buttons would offer a choice that changes nothing. That
 * is the same reasoning `useSpeciesGameScope` uses to HIDE its second row when a
 * generation holds one game; here it never applies.
 */

import { useState } from 'react'
import { GENERATION_RANGES, LATEST_GENERATION } from '../../data'
import { useVersionGroup } from '../version-group/context'

export interface TypeCoverageScope {
  /** The generation this page is showing. Never null. */
  generation: number
  /** Generations offered, ascending. */
  generations: number[]
  setGeneration: (generation: number) => void
}

/** Every generation in the app's scope, 1..4. */
const GENERATIONS: number[] = GENERATION_RANGES.map((r) => r.generation).filter(
  (g) => g <= LATEST_GENERATION,
)

export function useTypeCoverageScope(): TypeCoverageScope {
  const app = useVersionGroup()

  /*
    The app's generation is never null -- it falls back to the newest in scope
    under an "All" selection -- so there is no empty case to handle, only a
    range check in case the app's scope ever widens past this page's.
  */
  const [generation, setGeneration] = useState(() =>
    GENERATIONS.includes(app.generation) ? app.generation : LATEST_GENERATION,
  )

  return { generation, generations: GENERATIONS, setGeneration }
}
