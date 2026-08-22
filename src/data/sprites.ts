/**
 * URLs for the animated WebP artwork hosted in the pokeapp-sprites repo.
 *
 * Assets are individual GitHub release assets, split across four release tags by
 * generation (GitHub caps a single release at 1000 assets and the full set is
 * 1174 files). The tag is derived from the same national-dex mapping the Pokedex
 * uses, so a sprite URL and a list filter can never disagree about which
 * generation a species belongs to.
 *
 *   https://github.com/hrezende423/pokeapp-sprites/releases/download/{tag}/{id}-front-{n|s}[-{m|f}].webp
 */

import { getGenerationForSpecies, generationTag } from './generations'

const SPRITE_REPO = 'hrezende423/pokeapp-sprites'
const RELEASE_BASE = `https://github.com/${SPRITE_REPO}/releases/download`

export type SpriteGender = 'male' | 'female'

export interface SpriteOptions {
  shiny?: boolean
  /**
   * Only meaningful for species with a gender difference. Ignored otherwise,
   * because those species have no gendered files to point at.
   */
  gender?: SpriteGender
  /**
   * Whether this species has gendered artwork at all. Pass
   * `species.has_gender_differences`; without it a gender request is ignored.
   */
  hasGenderDifference?: boolean
}

/**
 * Murkrow is the one species whose files break the documented convention.
 *
 * It has a gender difference, but its four files are `n`, `n-f`, `s`, `s-f` --
 * an unsuffixed default plus `-f`, rather than the `-m`/`-f` pair every other
 * gendered species uses. So `198-front-n-m.webp` does not exist and must never
 * be requested; the unsuffixed file is the default/male variant. The `-f` files
 * do exist and follow the normal pattern.
 *
 * See the pokeapp-sprites README, "Known naming exception".
 */
const UNSUFFIXED_MALE_SPECIES = new Set([198])

/** Species that have a `-f` file (i.e. gendered artwork) but no `-m` file. */
export function usesUnsuffixedMaleSprite(speciesId: number): boolean {
  return UNSUFFIXED_MALE_SPECIES.has(speciesId)
}

/**
 * Build the release URL for one animated sprite.
 *
 * Returns null for a species outside the covered dex range rather than
 * fabricating a URL that would 404.
 */
export function getSpriteUrl(id: number, options: SpriteOptions = {}): string | null {
  const generation = getGenerationForSpecies(id)
  if (generation == null) return null

  const { shiny = false, gender, hasGenderDifference = false } = options
  const paddedId = String(id).padStart(3, '0')
  const shinyPart = shiny ? 's' : 'n'

  // A gendered species has NO unsuffixed file, so the suffix is mandatory once
  // hasGenderDifference is set -- an omitted `gender` must still resolve to the
  // male file rather than falling through to a 404. File census of the 1174
  // assets: 400 unsuffixed (399 non-gendered species + Murkrow), 93 `-m`,
  // 94 `-f`.
  let genderPart = ''
  if (hasGenderDifference) {
    if (gender === 'female') {
      genderPart = '-f'
    } else if (!usesUnsuffixedMaleSprite(id)) {
      genderPart = '-m'
    }
    // else: male + Murkrow -> stay unsuffixed, since 198-front-*-m.webp is absent.
  }

  return `${RELEASE_BASE}/${generationTag(generation)}/${paddedId}-front-${shinyPart}${genderPart}.webp`
}

/**
 * The gender variants that actually have artwork for a species, in display order.
 * Empty when the species has no gender difference, which is what the UI uses to
 * decide whether to render a gender toggle at all.
 */
export function availableSpriteGenders(hasGenderDifference: boolean): SpriteGender[] {
  return hasGenderDifference ? ['male', 'female'] : []
}
