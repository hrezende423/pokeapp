/**
 * Canonical Pokemon type colours, keyed by PokeAPI type name.
 *
 * SOURCE: Bulbapedia's per-type colour templates, read from their raw wikitext,
 * e.g.
 *
 *   https://bulbapedia.bulbagarden.net/w/index.php?title=Template:Fire_color&action=raw
 *
 * Those templates are what the wiki itself renders every type banner and infobox
 * with, which makes them the closest thing to a published standard palette. The
 * values below were transcribed from the templates rather than eyeballed, so
 * they are reproducible: re-fetch the 18 URLs and diff.
 *
 * Two things worth knowing before reviewing the hues:
 *
 *   - Bulbapedia's FIRE is a red-orange (#E62829) and its FIGHTING is the pure
 *     orange (#FF8000). That is the wiki's convention, not a transcription slip.
 *   - Every template pairs its colour with white text, so #fff is legible on all
 *     18 and no per-type text colour is needed.
 *
 * Used by both the type badges and the list's type filter, deliberately from one
 * table: two palettes would let the same type render two different colours in
 * the same view.
 */
export const TYPE_COLORS: Record<string, string> = {
  normal: '#9FA19F',
  fire: '#E62829',
  water: '#2980EF',
  electric: '#FAC000',
  grass: '#3FA129',
  ice: '#3DCEF3',
  fighting: '#FF8000',
  poison: '#9141CB',
  ground: '#915121',
  flying: '#81B9EF',
  psychic: '#EF4179',
  bug: '#91A119',
  rock: '#AFA981',
  ghost: '#704170',
  dragon: '#5060E1',
  dark: '#624D4E',
  steel: '#60A1B8',
  fairy: '#EF70EF',
}

/** Neutral fill for anything outside the 18 real types (e.g. the `unknown` type). */
export const UNKNOWN_TYPE_COLOR = '#68787f'

export function typeColor(name: string | null | undefined): string {
  if (!name) return UNKNOWN_TYPE_COLOR
  return TYPE_COLORS[name] ?? UNKNOWN_TYPE_COLOR
}
