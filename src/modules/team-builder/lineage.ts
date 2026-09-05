/**
 * The evolution lineage a build inherits from: base stage through the build's own
 * stage, INCLUSIVE, and nothing above it.
 *
 * WHY THE DIRECTION MATTERS. A Pokemon keeps everything it learnt as a lower
 * stage, so an Ivysaur may know any of Bulbasaur's moves. It has not yet learnt
 * anything Venusaur alone gets, so a Venusaur-only move on an Ivysaur build is an
 * illegal set. The whole rule is therefore "downwards only", and the shape of the
 * answer is the PATH from the chain root to the build's species -- not the chain.
 *
 * THE CHAIN IS A TREE, NOT A LIST, which is exactly why the path is computed
 * rather than read off. Eevee branches into eight, so `evolves_to` from the root
 * reaches Jolteon *and* Vaporeon; taking the whole subtree would give a Jolteon
 * build Vaporeon's Water Gun. A depth-first search for the target species and the
 * path taken to reach it keeps the siblings out.
 *
 * READ-ONLY over Pokepedia's evolution-chain data: this walks
 * `getEvolutionChain`/`getSpecies` and derives its own answer. Nothing here writes
 * to or reshapes that data.
 */

import { getEvolutionChain, getSpecies } from '../../data'
import type { EvolutionNode, Species } from '../../data'

/** Depth-first search for `targetId`, returning the root-to-target path. */
function pathTo(node: EvolutionNode, targetId: number, prefix: number[]): number[] | null {
  const here = [...prefix, node.species_id]
  if (node.species_id === targetId) return here
  for (const child of node.evolves_to) {
    const found = pathTo(child, targetId, here)
    if (found) return found
  }
  return null
}

/**
 * Species ids from the base stage down to `speciesId`, base first, inclusive.
 *
 * Falls back to `[speciesId]` when the species has no chain, or when it is somehow
 * absent from the chain it points at. A lone stage is the correct answer for a
 * species that does not evolve, and it is also the SAFE answer for broken data:
 * too few stages narrows the moveset, whereas a wrong guess at more stages would
 * widen it and produce an illegal set -- which is the failure that matters here.
 */
export function lineageThroughStage(speciesId: number): number[] {
  const species = getSpecies(speciesId)
  if (!species?.evolution_chain_id) return [speciesId]
  const chain = getEvolutionChain(species.evolution_chain_id)
  if (!chain) return [speciesId]
  return pathTo(chain.chain, speciesId, []) ?? [speciesId]
}

/** The same path, resolved to Species records. Stages the bundle lacks are dropped. */
export function lineageSpecies(speciesId: number): Species[] {
  return lineageThroughStage(speciesId)
    .map((id) => getSpecies(id))
    .filter((s): s is Species => s != null)
}

/**
 * The `pokemon_id` to read learnset rows against, per lineage stage.
 *
 * Learnset rows are per (pokemon, move, method, level), so a multi-form species
 * contributes a row set for every form. Ancestors are always read at their DEFAULT
 * form -- a build's history is that it was the ordinary lower stage -- while the
 * build's OWN stage honours `pokemonId` when the caller has one, so a Deoxys-Attack
 * or Rotom-Wash build reads its own form's rows rather than the base form's.
 */
export function lineagePokemonIds(speciesId: number, pokemonId?: number): Set<number> {
  const ids = new Set<number>()
  for (const species of lineageSpecies(speciesId)) {
    if (species.id === speciesId && pokemonId != null) {
      ids.add(pokemonId)
      continue
    }
    const variety = species.varieties.find((v) => v.is_default) ?? species.varieties[0]
    if (variety) ids.add(variety.pokemon_id)
  }
  return ids
}
