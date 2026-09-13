/**
 * Render one evolution requirement as a readable clause, and the evolution facts
 * a list row needs about one species.
 *
 * `describe` was private to EvolutionTree.tsx, which was right while the chart
 * was its only reader. The Pokedex list view's "Evolves to" column needs the
 * same sentence -- and two implementations of "what does this evolution
 * require" is two chances for the chart and the table to say different things
 * about the same Eevee. The chart still renders it; it just no longer owns it.
 */

import { getEvolutionChain, getItem, getLocation, getMove, getSpecies, getType } from '../../data'
import type { EvolutionDetail, EvolutionNode, Species } from '../../data'

/**
 * Render one evolution requirement as a readable clause.
 *
 * Still every non-null field, and still the full sentence: the icons carry the
 * distinguishing condition and the short label carries the level, so this is what
 * holds the rest -- Espeon needing friendship AND daytime, Mantyke needing a party
 * member. It is the title attribute and the hidden accessible text now rather than
 * body copy, because the reference has no body copy here.
 */
export function describeEvolution(detail: EvolutionDetail): string {
  const parts: string[] = []

  switch (detail.trigger) {
    case 'level-up':
      parts.push(detail.min_level != null ? `Level ${detail.min_level}` : 'Level up')
      break
    case 'use-item':
      parts.push(`Use ${getItem(detail.item_id ?? -1)?.display_name ?? 'an item'}`)
      break
    case 'trade':
      parts.push('Trade')
      break
    case 'shed':
      parts.push('Shed (empty party slot + Poke Ball)')
      break
    default:
      parts.push(detail.trigger ?? 'Unknown')
  }

  if (detail.held_item_id != null) {
    parts.push(`holding ${getItem(detail.held_item_id)?.display_name ?? 'an item'}`)
  }
  if (detail.min_happiness != null) parts.push(`friendship ${detail.min_happiness}+`)
  if (detail.min_beauty != null) parts.push(`beauty ${detail.min_beauty}+`)
  if (detail.min_affection != null) parts.push(`affection ${detail.min_affection}+`)
  if (detail.time_of_day) parts.push(`during the ${detail.time_of_day}`)
  if (detail.location_id != null) {
    parts.push(`at ${getLocation(detail.location_id)?.display_name ?? 'a location'}`)
  }
  if (detail.known_move_id != null) {
    parts.push(`knowing ${getMove(detail.known_move_id)?.display_name ?? 'a move'}`)
  }
  if (detail.known_move_type_id != null) {
    parts.push(`knowing a ${getType(detail.known_move_type_id)?.name ?? ''} move`)
  }
  if (detail.party_species_id != null) {
    parts.push(`with ${getSpecies(detail.party_species_id)?.display_name ?? 'a species'} in party`)
  }
  if (detail.trade_species_id != null) {
    parts.push(`traded for ${getSpecies(detail.trade_species_id)?.display_name ?? 'a species'}`)
  }
  if (detail.party_type_id != null) {
    parts.push(`with a ${getType(detail.party_type_id)?.name ?? ''} type in party`)
  }
  if (detail.relative_physical_stats != null) {
    parts.push(relativeStatClause(detail.relative_physical_stats))
  }
  if (detail.gender != null) parts.push(detail.gender === 1 ? 'female only' : 'male only')
  if (detail.needs_overworld_rain) parts.push('while raining')
  if (detail.turn_upside_down) parts.push('holding the console upside down')

  return parts.join(', ')
}

export function relativeStatClause(rel: number): string {
  if (rel > 0) return 'Atk > Def'
  if (rel < 0) return 'Atk < Def'
  return 'Atk = Def'
}

/**
 * Where one species sits in its evolution chain, and what comes next.
 *
 * STAGE IS 1-BASED DEPTH IN THE CHAIN, which is what "evolution stage" means
 * everywhere it is printed: Charmander 1, Charmeleon 2, Charizard 3. A baby form
 * is stage 1 and its line is simply one stage longer, because that is what the
 * chain records -- Pichu/Pikachu/Raichu really is three deep.
 *
 * NULL CHAIN IS A REAL ANSWER, not an error: a species with no
 * `evolution_chain_id` (or one the bundle has no record for) evolves from
 * nothing and into nothing, and the columns say so with an em dash rather than
 * guessing a stage.
 */
export interface EvolutionFacts {
  /** 1-based depth. null when the species has no chain at all. */
  stage: number | null
  evolvesFrom: Species | undefined
  /** Every immediate evolution, each with its full requirement clause. */
  evolvesTo: { species: Species | undefined; condition: string }[]
  /** Does anything come AFTER this species in its line? */
  hasFurther: boolean
}

const NO_EVOLUTION: EvolutionFacts = {
  stage: null,
  evolvesFrom: undefined,
  evolvesTo: [],
  hasFurther: false,
}

function findNode(
  node: EvolutionNode,
  speciesId: number,
  depth: number,
): { node: EvolutionNode; depth: number } | null {
  if (node.species_id === speciesId) return { node, depth }
  for (const child of node.evolves_to) {
    const hit = findNode(child, speciesId, depth + 1)
    if (hit) return hit
  }
  return null
}

/*
  MEMOISED FOR THE SESSION, because the Pokedex list view asks four times per row
  and re-asks on every sort: 493 species x 4 columns is two thousand chain walks
  to paint one screen, and a sort repeats them. The bundle is immutable once
  loaded -- evolution-chains.json is fetched at boot and never refetched -- so a
  cache keyed by species id cannot go stale within a session, and a reload
  rebuilds it.
*/
const factsCache = new Map<number, EvolutionFacts>()

export function evolutionFacts(species: Species): EvolutionFacts {
  const cached = factsCache.get(species.id)
  if (cached) return cached
  const facts = computeEvolutionFacts(species)
  factsCache.set(species.id, facts)
  return facts
}

/** Test seam: the data layer's own reset drops this with it. */
export function __resetEvolutionFacts() {
  factsCache.clear()
}

function computeEvolutionFacts(species: Species): EvolutionFacts {
  if (species.evolution_chain_id == null) return NO_EVOLUTION
  const chain = getEvolutionChain(species.evolution_chain_id)
  if (!chain) return NO_EVOLUTION
  const hit = findNode(chain.chain, species.id, 1)
  if (!hit) return NO_EVOLUTION
  return {
    stage: hit.depth,
    evolvesFrom:
      species.evolves_from_species_id != null
        ? getSpecies(species.evolves_from_species_id)
        : undefined,
    evolvesTo: hit.node.evolves_to.map((child) => ({
      species: getSpecies(child.species_id),
      /* A branch can carry several alternative requirements (Nincada's Shedinja
         is one; the Eevee stones are separate branches). Every one is kept and
         joined, because "or" is part of the answer. */
      condition: child.evolution_details.map(describeEvolution).join(' / '),
    })),
    hasFurther: hit.node.evolves_to.length > 0,
  }
}
