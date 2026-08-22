/**
 * Resolves which image to show for a species, from four independent choices:
 * source, colour, motion and gender.
 *
 * Only three of the eight combinations are real, because animation exists only
 * for the custom artwork:
 *
 *   source=in-game  motion=static    -> PokeAPI in-game front sprite
 *   source=artwork  motion=static    -> PokeAPI official (Sugimori) artwork
 *   source=artwork  motion=animated  -> pokeapp-sprites animated WebP
 *
 * There are no in-game animated sprites in scope, so `motion` is inert (and the
 * UI disables it) whenever the source is in-game.
 *
 * GENDER AVAILABILITY IS PER MODE, CHECKED AGAINST THE UNDERLYING DATA -- it is
 * not one blanket rule, because the three sources disagree:
 *
 *   in-game static   94/493 species. `front_female` / `front_shiny_female` are
 *                    non-null for exactly the species flagged
 *                    `has_gender_differences`; null for the other 399.
 *   artwork static   0/493. `sprites.other['official-artwork']` exposes only
 *                    `front_default` and `front_shiny` -- audited across all 508
 *                    varieties in the snapshot, no female key appears anywhere.
 *                    So this mode never offers a gender choice.
 *   artwork animated 94/493, from the release assets: 94 species ship a `-f`
 *                    file. (93 also ship `-m`; Murkrow ships an unsuffixed file
 *                    instead -- see sprites.ts.)
 *
 * The rule everywhere is check-before-offering: if the current combination has
 * no gendered image, the toggle is disabled rather than silently serving the
 * male image under a "Female" label.
 */

import { getSpriteUrl } from './sprites'
import type { Species, Variety } from './types'

export type ArtworkSource = 'in-game' | 'artwork'
export type ArtworkMotion = 'static' | 'animated'
export type ArtworkGender = 'male' | 'female'

export interface ArtworkView {
  source: ArtworkSource
  shiny: boolean
  motion: ArtworkMotion
  gender: ArtworkGender
}

/** Opening state for every species: official artwork, regular, static, male. */
export const DEFAULT_ARTWORK_VIEW: ArtworkView = {
  source: 'artwork',
  shiny: false,
  motion: 'static',
  gender: 'male',
}

/** The three combinations that can actually be rendered. */
export type ArtworkMode = 'in-game-static' | 'artwork-static' | 'artwork-animated'

export const ARTWORK_MODES: readonly ArtworkMode[] = [
  'in-game-static',
  'artwork-static',
  'artwork-animated',
] as const

/**
 * Collapses the four axes onto one of the three real modes. Motion is ignored
 * for the in-game source rather than producing a fourth, unrenderable mode.
 */
export function artworkMode(view: ArtworkView): ArtworkMode {
  if (view.source === 'in-game') return 'in-game-static'
  return view.motion === 'animated' ? 'artwork-animated' : 'artwork-static'
}

/** Motion is only a real choice for the custom artwork. */
export function motionAvailable(view: Pick<ArtworkView, 'source'>): boolean {
  return view.source === 'artwork'
}

/**
 * Whether a gendered image exists for this species in this exact combination.
 *
 * Split out from `resolveArtworkUrl` so the UI can ask the question before
 * offering the control, and so it can be tested per species per mode.
 */
export function genderAvailableIn(
  species: Species,
  variety: Variety,
  mode: ArtworkMode,
  shiny: boolean,
): boolean {
  switch (mode) {
    case 'in-game-static':
      return (shiny ? variety.sprites.front_shiny_female : variety.sprites.front_female) != null
    case 'artwork-static':
      // Official artwork has no gendered variant for any species -- constant,
      // not a data lookup, because there is no field to look up.
      return false
    case 'artwork-animated':
      return species.has_gender_differences
  }
}

export function genderAvailable(species: Species, variety: Variety, view: ArtworkView): boolean {
  return genderAvailableIn(species, variety, artworkMode(view), view.shiny)
}

/**
 * The image URL for a view, or null when the underlying source has no image.
 *
 * A female request for a mode with no female image falls back to the default
 * image -- but callers should never get here, since `genderAvailable` gates the
 * control that would produce such a request.
 */
export function resolveArtworkUrl(
  species: Species,
  variety: Variety,
  view: ArtworkView,
): string | null {
  const mode = artworkMode(view)
  const female = view.gender === 'female' && genderAvailableIn(species, variety, mode, view.shiny)
  const { sprites } = variety

  switch (mode) {
    case 'in-game-static':
      if (female) return view.shiny ? sprites.front_shiny_female : sprites.front_female
      return view.shiny ? sprites.front_shiny : sprites.front_default
    case 'artwork-static':
      return view.shiny ? sprites.official_artwork_shiny : sprites.official_artwork
    case 'artwork-animated':
      return getSpriteUrl(species.id, {
        shiny: view.shiny,
        gender: view.gender,
        hasGenderDifference: species.has_gender_differences,
      })
  }
}

/**
 * Thumbnail for an evolution-tree node.
 *
 * Deliberately only shiny-aware: nodes follow the detail view's colour choice so
 * a shiny-viewing user sees a shiny chain, but stay on static official artwork
 * with the default gender regardless of the other toggles. Syncing all four
 * axes onto a row of thumbnails buys nothing and would make a chain of animated
 * WebPs load on every detail open.
 */
export function evolutionThumbUrl(variety: Variety, shiny: boolean): string | null {
  return shiny ? variety.sprites.official_artwork_shiny : variety.sprites.official_artwork
}
