/**
 * Which game the Battle Frontier tab is showing, and what it says where there is
 * nothing to show. PURE: no React, no loader.
 *
 * GENERATION-SCOPED, NOT AN EXCEPTION. The app picks a generation; the tab's game
 * row (useGameInGeneration + GameRow, the Trainer Dex's pattern) picks a game
 * INSIDE it and cannot leave it. It offers only the games with something to
 * show: Gen 3's Emerald and FireRed/LeafGreen, Gen 4's Platinum and
 * HeartGold/SoulSilver. A game without a Frontier (Ruby/Sapphire, Diamond/Pearl)
 * is not selectable (owner, 2026-11-23). Every other generation has no row and
 * one notice. Colosseum and XD are not offered.
 *
 * Gen 3 defaults to Emerald and Gen 4 to HeartGold/SoulSilver
 * (`defaultGameOfGeneration`), so a reader who never touches the row sees
 * exactly what the tab showed before it had one in Gen 3. A pick outside the row
 * falls back to that default (`useGameInGeneration` only honours a pick the row
 * offers).
 */

/** Games the tab's row offers, in no particular order (the row sorts by release). */
export const FRONTIER_TAB_GAMES: readonly string[] = [
  'emerald',
  'firered-leafgreen',
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

/** A screen's notice for a game it has nothing for (e.g. Brains in FireRed and LeafGreen). */
export function gameNotice(game: string, screen: string): string {
  if (game === 'firered-leafgreen')
    return `FireRed and LeafGreen have no Battle Frontier, so no ${screen}. Their Trainer Tower is under Facilities.`
  return `${screen} covers Emerald only.`
}

/** A game as a sentence's subject, with its verb ("Platinum has", "Diamond and Pearl have"). */
const GAME_SUBJECT: Record<string, string> = {
  'ruby-sapphire': 'Ruby and Sapphire have',
  emerald: 'Emerald has',
  'firered-leafgreen': 'FireRed and LeafGreen have',
  'diamond-pearl': 'Diamond and Pearl have',
  platinum: 'Platinum has',
  'heartgold-soulsilver': 'HeartGold and SoulSilver have',
}

/** The Trainer Hill & Tower screen's notice: only Emerald (the Hill) and FireRed/LeafGreen (the Tower) have one. */
export const speedNotice = (game: string): string => `${GAME_SUBJECT[game] ?? `${game} has`} no Trainer Hill or Trainer Tower.`
