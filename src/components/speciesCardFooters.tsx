import type { ReactNode } from 'react'
import { resolveAbilitiesForGeneration } from '../data'
import type { Species } from '../data'

/**
 * The species card's bottom line, as a type plus the default implementation.
 *
 * Its own module rather than living beside the card: a file that exports both
 * components and plain functions breaks fast refresh, which is what
 * react-refresh/only-export-components is protecting. The Breeding dex's
 * egg-group variant lives with that dex, since it needs that dex's navigation.
 */

/** Renders the card's bottom line. Return null to leave it off entirely. */
export type SpeciesCardFooter = (species: Species, generation: number) => ReactNode

/** The default form is what a card shows; alternate forms live in the detail view. */
function defaultVariety(species: Species) {
  return species.varieties.find((v) => v.is_default) ?? species.varieties[0]
}

/**
 * Non-hidden abilities, middot-separated.
 *
 * Read off the Figma reference, where Quagsire shows "Damp · Water Absorb" but
 * not Unaware. Empty for Gens 1-2, which had no abilities; the line is simply
 * absent then, and because the text block is positioned as a whole it cannot
 * move the lines above it.
 */
export const abilitiesFooter: SpeciesCardFooter = (species, generation) => {
  const abilities = resolveAbilitiesForGeneration(defaultVariety(species), generation)
    .filter((a) => !a.is_hidden)
    .map((a) => a.ability.display_name)
  if (abilities.length === 0) return null
  return (
    <span className="species-card-ability" data-testid={`species-card-ability-${species.id}`}>
      {abilities.join(' · ')}
    </span>
  )
}
