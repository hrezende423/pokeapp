/**
 * Team Matchup's OWN game -- the FOURTH sanctioned exception to the app-wide
 * selector, approved by the owner when this screen was built (2026-10).
 *
 * Why it departs from the rule: a matchup is pinned to ONE GAME, more tightly
 * than the Damage Calculator is pinned to a generation -- the game decides the
 * trainers, their AI, the badge boosts and the send-out logic (S4). Planning the
 * Elite Four in Emerald while browsing the Platinum Pokedex must not re-filter
 * the app, and re-filtering the app must not move the matchup.
 *
 * SAME SHAPE AS useDamageCalcScope: seeded once from the app selection (so the
 * screen opens on the game being browsed when it has a matchup context), then
 * independent; it reads the app selection and never writes it. A GAME, not a
 * generation: only the ten Gen 1-4 main-series games with a disassembly
 * (battle/game.ts MATCHUP_GAMES).
 *
 * SEEDED ONCE PER SESSION, NOT PER VISIT -- where it differs from the calculator.
 * Leaving the screen unmounts it (a matrix cell hands off to the Damage
 * Calculator, M3), and re-seeding on the way back put the matchup on whatever
 * game the app showed, where the reader has no setup: the round trip lost the
 * matchup. So the game the reader last picked is kept in module scope and wins
 * over the app on every later visit; a reload starts from the app again.
 */

import { useState } from 'react'
import { MATCHUP_GAMES, hasGameContext } from '../battle/game'
import { useVersionGroup } from '../version-group/context'
import { gameGroups, generationOfGame, type GameGroup } from '../version-group/games'

export interface MatchupScope {
  versionGroup: string
  generation: number
  games: GameGroup[]
  setVersionGroup: (vg: string) => void
}

const FALLBACK = 'platinum'

/** The game this session last used (see the header); null until the first visit. */
let sessionGame: string | null = null

export function useMatchupScope(initial?: string | null): MatchupScope {
  const app = useVersionGroup()
  const [games] = useState(() => gameGroups({ include: (vg) => MATCHUP_GAMES.includes(vg) }))
  const [versionGroup, setVersionGroup] = useState<string>(() => {
    const name = initial ?? sessionGame ?? app.versionGroup?.name
    sessionGame = name && hasGameContext(name) ? name : FALLBACK
    return sessionGame
  })
  return {
    versionGroup,
    generation: generationOfGame(versionGroup) ?? 4,
    games,
    setVersionGroup: (vg: string) => {
      sessionGame = vg
      setVersionGroup(vg)
    },
  }
}
