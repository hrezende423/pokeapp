/**
 * #15 Team threat finder: which of the generation's Pokemon threaten a team.
 *
 * PURE, AND UI-FREE. The score is a stated formula, printed on the page
 * (docs/tools/PLAN.md): a Pokemon's threat is the number of team members at
 * least one of its own types (its STAB types) hits super-effectively, read on
 * that generation's type chart; ties are broken by base stat total, then dex
 * number. Types, stats and the chart are all as of the generation, so a Gen 1
 * Gengar's Ghost does nothing to an Alakazam and a Gen 1 Magnemite is not Steel.
 */

import {
  getType,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
  type Species,
  type Variety,
} from '../../../data'

/** A team member: a species, and the form a build chose (default form when absent). */
export interface Member {
  speciesId: number
  pokemonId?: number
}

export interface MemberHit {
  /** Index into the team. */
  member: number
  /** The attacker's type that hits hardest, and how hard. */
  typeId: number
  multiplier: number
}

export interface Threat {
  speciesId: number
  /** Members hit super-effectively by a STAB type. */
  hits: MemberHit[]
  bst: number
}

export const varietyOf = (s: Species, pokemonId?: number): Variety =>
  s.varieties.find((v) => v.pokemon_id === pokemonId) ??
  s.varieties.find((v) => v.is_default) ??
  s.varieties[0]

export const typesOf = (generation: number, v: Variety): number[] =>
  resolveTypesForGeneration(v, generation).map((t) => t.type_id)

/** The hardest super-effective hit any of the attacker's types lands on a defender, or null. */
export function stabHit(
  generation: number,
  attackerTypes: number[],
  defenderTypes: number[],
): { typeId: number; multiplier: number } | null {
  let best: { typeId: number; multiplier: number } | null = null
  for (const e of typeEffectivenessAgainst(defenderTypes, generation)) {
    if (!attackerTypes.includes(e.type.id) || e.multiplier <= 1) continue
    if (!best || e.multiplier > best.multiplier)
      best = { typeId: e.type.id, multiplier: e.multiplier }
  }
  return best
}

export function threatOf(generation: number, attacker: Species, team: number[][]): Threat {
  const v = varietyOf(attacker)
  const types = typesOf(generation, v)
  const hits: MemberHit[] = []
  team.forEach((defender, member) => {
    const hit = stabHit(generation, types, defender)
    if (hit) hits.push({ member, ...hit })
  })
  const bst = resolveStatsForGeneration(v, generation).reduce((a, s) => a + s.base_stat, 0)
  return { speciesId: attacker.id, hits, bst }
}

/**
 * The pool's Pokemon ranked by threat to the team. Only those that hit at least
 * one member are listed. `resolve` turns a species id into its record.
 */
export function teamThreats(
  generation: number,
  members: Member[],
  pool: Species[],
  resolve: (id: number) => Species | undefined,
  limit = 20,
): Threat[] {
  const team = members.map((m) => {
    const s = resolve(m.speciesId)
    return s ? typesOf(generation, varietyOf(s, m.pokemonId)) : []
  })
  return pool
    .map((s) => threatOf(generation, s, team))
    .filter((t) => t.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || b.bst - a.bst || a.speciesId - b.speciesId)
    .slice(0, limit)
}

export const typeName = (id: number) => getType(id)?.display_name ?? String(id)
