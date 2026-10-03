/**
 * An evolution chain as it stood in one generation.
 *
 * The bundle carries every generation's chain (Gen 1-9), so read raw, a Gen 4
 * selection shows Sneasel evolving into Sneasler. Three rules put it back:
 *
 *   - A species that does not exist yet is dropped, with everything after it.
 *     A dropped ROOT is the exception: babies were added later than the species
 *     they grow into (Pichu is Gen 2, Pikachu Gen 1), so the chain passes to the
 *     root's surviving children rather than vanishing -- Pikachu keeps its line
 *     under Gen 1. If several survive (Tyrogue's Hitmonlee and Hitmonchan under
 *     Gen 1, unrelated then), the one holding `focusId` is the chain.
 *   - A requirement recorded in a later version group is dropped, and an
 *     evolution left with no requirement did not exist yet, so it goes too.
 *   - Requirements that differ only by version group are one requirement, kept
 *     once (Raichu's Thunder Stone is recorded for Red/Blue and again for Sun/Moon).
 */

import { isSpeciesInGeneration } from './generations'
import { getVersionGroupByName } from './loader'
import type { EvolutionChain, EvolutionDetail, EvolutionNode } from './types'

function detailInGeneration(detail: EvolutionDetail, generation: number): boolean {
  if (detail.version_group == null) return true
  const gen = getVersionGroupByName(detail.version_group)?.generation_id
  return gen == null || gen <= generation
}

function dedupe(details: EvolutionDetail[]): EvolutionDetail[] {
  const seen = new Set<string>()
  return details.filter((d) => {
    const key = JSON.stringify({ ...d, version_group: null })
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function children(node: EvolutionNode, generation: number): EvolutionNode[] {
  return node.evolves_to
    .map((child) => branch(child, generation))
    .filter((child): child is EvolutionNode => child != null)
}

/** A non-root node: it needs its species AND at least one requirement in scope. */
function branch(node: EvolutionNode, generation: number): EvolutionNode | null {
  if (!isSpeciesInGeneration(node.species_id, generation)) return null
  const details = dedupe(node.evolution_details.filter((d) => detailInGeneration(d, generation)))
  if (details.length === 0) return null
  return {
    species_id: node.species_id,
    evolution_details: details,
    evolves_to: children(node, generation),
  }
}

/** The chain's possible roots: the root itself, or its surviving descendants. */
function roots(node: EvolutionNode, generation: number): EvolutionNode[] {
  if (isSpeciesInGeneration(node.species_id, generation)) {
    return [
      {
        species_id: node.species_id,
        evolution_details: [],
        evolves_to: children(node, generation),
      },
    ]
  }
  return node.evolves_to.flatMap((child) => roots(child, generation))
}

function contains(node: EvolutionNode, speciesId: number): boolean {
  return node.species_id === speciesId || node.evolves_to.some((c) => contains(c, speciesId))
}

/**
 * The chain under `generation`, or undefined when none of it existed yet.
 * `focusId` picks the line when a dropped root leaves several (see above).
 */
export function chainForGeneration(
  chain: EvolutionChain,
  generation: number,
  focusId?: number,
): EvolutionChain | undefined {
  const candidates = roots(chain.chain, generation)
  const root =
    (focusId != null ? candidates.find((r) => contains(r, focusId)) : undefined) ?? candidates[0]
  if (!root) return undefined
  return {
    ...chain,
    // The baby's incense belongs to the baby; a promoted root has none.
    baby_trigger_item_id:
      root.species_id === chain.chain.species_id ? chain.baby_trigger_item_id : null,
    chain: root,
  }
}
