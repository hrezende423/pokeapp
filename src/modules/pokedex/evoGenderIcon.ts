/**
 * The painted male/female icons -- EVOLUTION CHART ONLY.
 *
 * WHAT THESE ARE. Two of the eleven custom evolution-condition assets, in the same
 * shaded register as the rest of the set (rendered to sit beside official item
 * art). They exist to mark the five gender-gated evolutions the Gen 1-4 data
 * actually has: Gallade and Mothim (male), Froslass, Wormadam and Vespiquen
 * (female).
 *
 * WHY THEY LIVE IN THEIR OWN MODULE. The instruction was that these must not
 * become the app's general gender glyph, must not replace or consolidate with the
 * gender affordance used elsewhere, and must be scoped so they cannot leak by
 * accident. A comment is not a scope, so the enforcement is real: eslint.config.js
 * lists this module under no-restricted-imports for all of src/, with an override
 * for the evolution-chart files only. Importing it from anywhere else fails lint.
 *
 * WORTH KNOWING, because the brief assumed otherwise: there is no existing gender
 * ICON anywhere in this app to be distinct from. The only gender affordance today
 * is the artwork panel's ToggleSwitch with the text labels "Male" / "Female"
 * (src/modules/pokedex/Artwork.tsx), and public/icons.svg holds nothing but brand
 * glyphs. So there was no line-icon set to avoid replacing -- but the scoping is
 * kept anyway, because the moment someone does add a general gender icon these two
 * are exactly what a well-meaning refactor would reach for.
 *
 * The gender values are PokeAPI's, verified against the bundle rather than
 * assumed: 1 is female, 2 is male, across all five details that set the field.
 */

import { evoIconUrl } from './evoConditionIcons'

/** PokeAPI's `evolution_details.gender`, as it appears in this bundle. */
export const EVO_GENDER_FEMALE = 1
export const EVO_GENDER_MALE = 2

const EVO_GENDER_ICON_FILES = {
  [EVO_GENDER_MALE]: 'icon-male.png',
  [EVO_GENDER_FEMALE]: 'icon-female.png',
} as const

/**
 * The painted icon for a gender-gated evolution, or null when the requirement is
 * not gender-gated.
 *
 * Returns null rather than throwing for an unrecognised value: a future generation
 * adding a third value should drop the icon, not break the chart.
 */
export function evoGenderIconUrl(gender: number | null): string | null {
  if (gender !== EVO_GENDER_MALE && gender !== EVO_GENDER_FEMALE) return null
  return evoIconUrl(EVO_GENDER_ICON_FILES[gender])
}

/** Screen-reader text, since the icon alone carries the requirement. */
export function evoGenderLabel(gender: number | null): string | null {
  if (gender === EVO_GENDER_MALE) return 'Male only'
  if (gender === EVO_GENDER_FEMALE) return 'Female only'
  return null
}
