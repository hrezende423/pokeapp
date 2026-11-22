/**
 * Which game the Battle Frontier tab is showing, and what it says where there is
 * nothing to show. PURE: no React, no loader.
 *
 * GENERATION-SCOPED, NOT AN EXCEPTION. The app picks a generation; the tab's game
 * row (useGameInGeneration + GameRow, the Trainer Dex's pattern) picks a game
 * INSIDE it and cannot leave it. It offers only the games this tab speaks about:
 * Gen 3's Ruby/Sapphire (no Frontier), Emerald and FireRed/LeafGreen, and Gen 4's
 * Diamond/Pearl (no Frontier), Platinum and HeartGold/SoulSilver. Every other
 * generation has no row and one notice. Colosseum and XD are not offered.
 *
 * Gen 3 defaults to Emerald and Gen 4 to HeartGold/SoulSilver
 * (`defaultGameOfGeneration`), so a reader who never touches the row sees
 * exactly what the tab showed before it had one in Gen 3.
 */

/** Games the tab's row offers, in no particular order (the row sorts by release). */
export const FRONTIER_TAB_GAMES: readonly string[] = [
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
]

export const isFrontierTabGame = (vg: string): boolean => FRONTIER_TAB_GAMES.includes(vg)

/** The games with something to show on at least one screen. */
export type FrontierGame = 'emerald' | 'firered-leafgreen' | 'platinum' | 'heartgold-soulsilver'

export const isFrontierGame = (vg: string | null | undefined): vg is FrontierGame =>
  vg === 'emerald' || vg === 'firered-leafgreen' || vg === 'platinum' || vg === 'heartgold-soulsilver'

/** The scope tag beside a screen's title. */
export const GAME_SCOPE: Record<FrontierGame, string> = {
  emerald: 'Emerald · Gen 3',
  'firered-leafgreen': 'FireRed and LeafGreen · Gen 3',
  platinum: 'Platinum · Gen 4',
  'heartgold-soulsilver': 'HeartGold and SoulSilver · Gen 4',
}

const COVERS = 'This tab covers Emerald, FireRed and LeafGreen, Platinum, and HeartGold and SoulSilver.'

/**
 * The notice when the app's generation (null = "All") has no game for this tab:
 * never a blank page.
 */
export function generationNotice(generation: number | null): string {
  if (generation == null) return `Pick a generation in the account menu. ${COVERS}`
  return `No Battle Frontier in Gen ${generation}. ${COVERS}`
}

/** The notice for a game with no Frontier at all. */
export const NO_FRONTIER: Record<string, string> = {
  'ruby-sapphire': 'Ruby and Sapphire have no Battle Frontier. Emerald added it.',
  'diamond-pearl': 'Diamond and Pearl have no Battle Frontier. Platinum added it.',
}

/** A screen's notice for a game it has nothing for (e.g. Brains in FireRed and LeafGreen). */
export function gameNotice(game: string, screen: string): string {
  if (NO_FRONTIER[game]) return NO_FRONTIER[game]
  if (game === 'firered-leafgreen')
    return `FireRed and LeafGreen have no Battle Frontier, so no ${screen}. Their Trainer Tower is under Facilities.`
  return `${screen} covers Emerald only.`
}
