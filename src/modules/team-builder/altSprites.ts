/**
 * Alternate animated sprites, on trial in the Team Display only (2026-10-23).
 *
 * The stored animated artwork (`resolveArtworkUrl`, motion 'animated') is NOT
 * replaced: a species listed here wins over it, a species missing from here
 * falls through to it. Set `ALT_SPRITES_ENABLED` to false to put the old ones
 * back everywhere at once.
 *
 * Non-shiny only -- these files are the regular colouring, so a shiny build
 * keeps the stored set rather than showing the wrong colours.
 */
import charizard from './assets/alt-sprites/006-charizard.webp'
import blastoise from './assets/alt-sprites/009-blastoise.webp'
import alakazam from './assets/alt-sprites/065-alakazam.webp'
import gengar from './assets/alt-sprites/094-gengar.webp'
import salamence from './assets/alt-sprites/373-salamence.webp'
import garchomp from './assets/alt-sprites/445-garchomp.webp'

export const ALT_SPRITES_ENABLED = true

const ALT_SPRITES: Readonly<Record<number, string>> = {
  6: charizard,
  9: blastoise,
  65: alakazam,
  94: gengar,
  373: salamence,
  445: garchomp,
}

export function altSpriteFor(speciesId: number, shiny: boolean): string | null {
  if (!ALT_SPRITES_ENABLED || shiny) return null
  return ALT_SPRITES[speciesId] ?? null
}
