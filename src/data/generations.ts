/**
 * National-dex id -> generation mapping.
 *
 * KNOWN GAP (deliberate simplification, not a bug): this maps a species to the
 * generation it was *introduced* in, by national dex id range. It does not model
 * regional dex availability, which is what "can I actually see this species in
 * this game" really depends on. Concretely:
 *
 *   - Ruby/Sapphire's Hoenn dex excludes Johto species until the National Dex is
 *     unlocked, yet this mapping happily reports Chikorita as gen 2 <= gen 3 and
 *     the Pokedex list will show it under a Ruby/Sapphire selection.
 *   - Colosseum and XD have very small rosters, but are treated as full gen 3.
 *   - FireRed/LeafGreen's Kanto dex, HeartGold/SoulSilver's Johto dex and the
 *     various post-game unlocks are all likewise ignored.
 *
 * Modelling that properly needs the `pokedex` endpoint's per-regional-dex species
 * lists, which the data bundle does not currently carry. Until then, "generation
 * of introduction, cumulative" is the agreed approximation.
 */

export interface GenerationRange {
  generation: number
  first: number
  last: number
}

export const GENERATION_RANGES: readonly GenerationRange[] = [
  { generation: 1, first: 1, last: 151 },
  { generation: 2, first: 152, last: 251 },
  { generation: 3, first: 252, last: 386 },
  { generation: 4, first: 387, last: 493 },
] as const

/**
 * Scope of the app, both DERIVED from GENERATION_RANGES so that supporting a new
 * generation is a one-line change: append its range above and the dex ceiling,
 * the "All" option and the latest-era fallback all follow.
 */
export const MAX_SPECIES_ID = GENERATION_RANGES[GENERATION_RANGES.length - 1].last
export const LATEST_GENERATION = GENERATION_RANGES[GENERATION_RANGES.length - 1].generation

/**
 * Generation a species was introduced in, from its national dex id.
 *
 * Returns null for ids outside 1..493 rather than guessing, so a caller passing
 * a Gen 5+ id gets an explicit miss instead of a silently wrong 4.
 */
export function getGenerationForSpecies(id: number): number | null {
  for (const range of GENERATION_RANGES) {
    if (id >= range.first && id <= range.last) return range.generation
  }
  return null
}

/**
 * Whether a species is available under a given generation, using the cumulative
 * reading: a Gen 4 game includes everything introduced in Gens 1-4.
 */
export function isSpeciesInGeneration(id: number, generation: number): boolean {
  const gen = getGenerationForSpecies(id)
  return gen != null && gen <= generation
}

/** Generation number a release tag maps to, e.g. 'gen3' -> 3. */
export function generationTag(generation: number): string {
  return `gen${generation}`
}
