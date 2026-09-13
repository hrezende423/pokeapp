import type { ReactNode } from 'react'
import { genderRatio, resolveAbilitiesForGeneration, resolveStatsForGeneration } from '../data'
import type { Species } from '../data'

/**
 * The species card's bottom lines, as a type plus the implementations.
 *
 * Its own module rather than living beside the card: a file that exports both
 * components and plain functions breaks fast refresh, which is what
 * react-refresh/only-export-components is protecting. The Breeding dex's
 * egg-group variant lives with that dex, since it needs that dex's navigation.
 *
 * THREE VARIANTS, AND WHICH GRID GETS WHICH IS THE POINT. The card is shared by
 * five grids; only two of them wanted a second line, so only those two pass a
 * footer that draws one. A grid on a move's page still shows abilities alone,
 * unchanged -- adding the stat line there would have been a change nobody asked
 * for, arriving purely because the component was shared.
 */

/** Renders the card's bottom line(s). Return null to leave it off entirely. */
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

/**
 * The Pokedex grid's own footer: abilities, then the base-stat total and Speed.
 *
 * ERA-RESOLVED, through the same resolver every other stat readout uses, so a
 * Gen 1 card totals the five Gen 1 stats and a Gen 4 card the six -- and a
 * species whose stats changed between them totals the right ones. A card that
 * summed the modern figures under a Gen 1 selection would be the quietest
 * possible way to be wrong.
 *
 * "BST 318 · Spe 45" -- the label and the number, middot-separated, in the same
 * shape as the ability line above it. Speed is the one individual stat on the
 * line because it is the one the grid can now be sorted by.
 */
export const pokedexFooter: SpeciesCardFooter = (species, generation) => {
  const abilities = abilitiesFooter(species, generation)
  const stats = resolveStatsForGeneration(defaultVariety(species), generation)
  const bst = stats.reduce((total, entry) => total + entry.base_stat, 0)
  const speed = stats.find((entry) => entry.stat === 'speed')?.base_stat ?? null
  return (
    <>
      {abilities}
      <span className="species-card-stats" data-testid={`species-card-stats-${species.id}`}>
        BST <span className="num">{bst}</span>
        <span className="species-card-stat-sep">·</span>
        Spe <span className="num">{speed ?? '—'}</span>
      </span>
    </>
  )
}

/**
 * The gender split, for the Breeding dex's cards.
 *
 * Breeding is the one context where it is the fact you came for, which is why it
 * is here and not on every card. `genderRatio` is the same helper the species
 * page's bar and the Pokedex list view's column use -- three readouts, one
 * derivation, so they cannot disagree about Nidoran.
 */
export function genderFooterLine(species: Species): ReactNode {
  const ratio = genderRatio(species.gender_rate)
  const label = !ratio
    ? 'Genderless'
    : ratio.female === 0
      ? '100% ♂'
      : ratio.female === 100
        ? '100% ♀'
        : `${100 - ratio.female}% ♂ · ${ratio.female}% ♀`
  return (
    <span className="species-card-stats" data-testid={`species-card-gender-${species.id}`}>
      {label}
    </span>
  )
}
