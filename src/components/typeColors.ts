/**
 * Canonical Pokemon type colours for FILLED contexts, keyed by PokeAPI type name.
 *
 * ONE PALETTE, APP-WIDE. This is the community-standard type hex set -- the same
 * palette the --type-* CSS custom properties now carry, and the only type palette
 * left in the project. The muted custom set is retired, and the Bulbapedia
 * template transcription that used to live in this file is retired with it:
 * having a third palette here meant the Movedex's type-filter buttons could sit
 * directly beside type text and disagree with it about what colour Water is.
 *
 * WHY THE RAW VALUES HERE, AND ADJUSTED ONES IN CSS. These two consumers paint
 * the colour as a background with #fff text on top (TypeBadge, and TypeFilter's
 * pressed state), which is what the community palette was drawn for -- it comes
 * from the games' own type-chart UI, where every swatch is a fill. --type-* is
 * for coloured TEXT on a page surface, a different problem with a different
 * answer: 12 of the 17 are illegible as light-mode text unmodified (Electric at
 * 1.43:1), so that side of the system darkens them to a >=4:1 floor. Same hue,
 * two renderings, each correct for its medium. See design-tokens.json,
 * type-color-community and its two per-mode override sets.
 *
 * A NOTE ON WHAT THIS IS NOT: DESIGN-SYSTEM.md is explicit that a type indicator
 * is coloured text and never a fill or a pill, so TypeBadge is legacy -- it
 * predates that rule and survives only in the pre-redesign modules that CLAUDE.md
 * leaves alone. TypeLabel/TypeRow are the sanctioned treatment and read --type-*
 * instead. Nothing new should reach for this table.
 */
export const TYPE_COLORS: Record<string, string> = {
  normal: '#A8A878',
  fire: '#F08030',
  water: '#6890F0',
  electric: '#F8D030',
  grass: '#78C850',
  ice: '#98D8D8',
  fighting: '#C03028',
  poison: '#A040A0',
  ground: '#E0C068',
  flying: '#A890F0',
  psychic: '#F85888',
  bug: '#A8B820',
  rock: '#B8A038',
  ghost: '#705898',
  dragon: '#7038F8',
  dark: '#705848',
  // Gen 6, so outside this app's Gen 1-4 scope and unreachable via
  // resolveTypesForGeneration. Listed for completeness of the palette.
  fairy: '#EE99AC',
  steel: '#B8B8D0',
}

/** Neutral fill for anything outside the 18 real types (e.g. the `unknown` type). */
export const UNKNOWN_TYPE_COLOR = '#68787f'

export function typeColor(name: string | null | undefined): string {
  if (!name) return UNKNOWN_TYPE_COLOR
  return TYPE_COLORS[name] ?? UNKNOWN_TYPE_COLOR
}
