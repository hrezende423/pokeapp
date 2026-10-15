/**
 * Where each tool exists: which generations, and which games when the feature is
 * narrower than its generation.
 *
 * PURE, AND UI-FREE. A tool is never "unavailable" silently: every way out of
 * this file carries a sentence the page prints in place of a result (the brief's
 * "never NaN/blank").
 *
 * TOOLS FOLLOW THE APP'S GENERATION (owner, 2026-10-15). Where the game matters
 * they get the in-generation game row (`useGameInGeneration` + `GameRow`), which
 * cannot leave the generation -- so none of this is an exception to the global
 * selector. A tool's `games` list doubles as that row's `include` filter: the row
 * offers only games where the tool exists, and the default falls to one of them.
 *
 * GEN 1-4 MECHANICS ONLY. With the app on Gen 5-9 every tool says so instead of
 * answering; under "All" it asks for a generation, because a mechanic has to be
 * read in one.
 */

import { gameLabel, gamesInGeneration } from '../version-group/games'

/** The newest generation whose mechanics these tools model. */
export const TOOLS_MAX_GENERATION = 4

/**
 * The main-series games a tool may be read in. Colosseum and XD share Gen 3's
 * version-group list but are not main-series handhelds: no tool here models them.
 */
export const MAIN_SERIES_GAMES: readonly string[] = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
]

export interface ToolGate {
  /** Generations the mechanic exists in, within 1-4. */
  gens: readonly number[]
  /** Games it exists in, when narrower than its generations. Defaults to every main-series game. */
  games?: readonly string[]
}

export type Availability = { ok: true } | { ok: false; reason: string }

/** "Gen 3–4", "Gen 2–4", "Gen 3": the gate's generations as one readable span. */
export function genSpan(gens: readonly number[]): string {
  const lo = Math.min(...gens)
  const hi = Math.max(...gens)
  return lo === hi ? `Gen ${lo}` : `Gen ${lo}–${hi}`
}

/** The include filter for this tool's game row. */
export function gameFilter(gate: ToolGate): (vg: string) => boolean {
  const allowed = gate.games ?? MAIN_SERIES_GAMES
  return (vg) => allowed.includes(vg)
}

/**
 * Can this tool answer in the app's generation (null = "All")?
 *
 * The GAME is not checked here: the game row only offers allowed games, so a
 * generation with at least one of them is enough. A generation with none -- Gen 4
 * for the Battle Palace -- is the reason.
 */
export function toolAvailability(gate: ToolGate, generation: number | null): Availability {
  if (generation == null) {
    return { ok: false, reason: 'Pick a generation (Gen 1–4) in the account menu to use this tool.' }
  }
  if (generation > TOOLS_MAX_GENERATION) {
    return { ok: false, reason: `Gen 1–4 only. The app is set to Gen ${generation}.` }
  }
  if (!gate.gens.includes(generation)) {
    return { ok: false, reason: `Not in Gen ${generation}: this exists in ${genSpan(gate.gens)}.` }
  }
  const games = gamesInGeneration(generation, gameFilter(gate))
  if (games.length === 0) {
    const where = (gate.games ?? []).map(gameLabel).join(', ')
    return { ok: false, reason: `Not in any Gen ${generation} game: this exists in ${where}.` }
  }
  return { ok: true }
}
