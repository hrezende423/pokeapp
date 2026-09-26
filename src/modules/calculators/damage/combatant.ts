/**
 * A CalcPokemon resolved for one generation -- the reference's `Pokemon` class,
 * minus everything that is not a Gen 1-4 singles fact.
 *
 * NOTHING HERE RE-DERIVES AN ERA RULE. Types come from resolveTypesForGeneration,
 * base stats from resolveStatsForGeneration (Gen 1's unsplit Special, Beedrill's
 * Gen 1 Attack), the stat formula from statMath.computeStat (Stat Exp/DVs in Gen
 * 1-2, EVs/IVs/natures in Gen 3-4). What this file adds is the two gates a
 * battle needs and a species page does not: no held item in Gen 1, no ability
 * before Gen 3.
 *
 * Mutable on purpose, as in the reference: a mechanics module adjusts boosts
 * (Intimidate, Download), types (Forecast) and ability (Mold Breaker) on its OWN
 * copy -- `makeCombatant` is called fresh for every calculation, so nothing leaks
 * between runs.
 */

import {
  ABILITIES_INTRODUCED_IN_GENERATION,
  getType,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
} from '../../../data'
import type { Item } from '../../../data'
import {
  computeStat,
  type NatureMods,
  type StatKey,
  type StatNumbers,
} from '../../team-builder/statMath'
import type { BoostStat, Boosts, CalcPokemon, StatId, StatusId } from './model'

/** Items arrived in Gen 2. */
export const HELD_ITEMS_INTRODUCED_IN_GENERATION = 2

export type StatTable = Record<StatId, number>

export interface Combatant {
  gen: number
  level: number
  /** Display name, forms suffixed the way the reference prints them: "Deoxys-Attack". */
  name: string
  speciesSlug: string
  varietySlug: string
  /** Era type names, lowercase bundle names, primary first. */
  types: string[]
  typeIds: number[]
  rawStats: StatTable
  stats: StatTable
  boosts: Record<BoostStat, number>
  maxHp: number
  curHp: number
  /** Item slug, or '' -- '' in Gen 1, and after Klutz or Knock Off. */
  item: string
  itemName: string
  /** The held item's bundle record, for the facts it carries as fields (Fling power). */
  itemRecord: Item | null
  /** Ability slug, or '' before Gen 3. */
  ability: string
  abilityName: string
  abilityOn: boolean
  status: StatusId | ''
  gender: 'M' | 'F' | 'N'
  weightKg: number
  nature: NatureMods
  input: CalcPokemon
}

/** Engine stat id -> statMath key, per era. Gen 1 reads its one Special for both halves. */
function statKeyFor(stat: StatId, gen: number): StatKey {
  switch (stat) {
    case 'hp':
      return 'hp'
    case 'atk':
      return 'attack'
    case 'def':
      return 'defense'
    case 'spe':
      return 'speed'
    case 'spa':
      return gen === 1 ? 'special' : 'special-attack'
    case 'spd':
      return gen === 1 ? 'special' : 'special-defense'
  }
}

/**
 * Gen 2 split the Special STAT but not its DV or its Stat Exp: one `special` value
 * feeds both halves. statMath reads per key, so the shared value is copied onto
 * both split keys here rather than taught to statMath as a special case.
 */
function spreadForGen(spread: StatNumbers, gen: number): StatNumbers {
  if (gen !== 2) return spread
  const special = spread.special ?? 0
  return { ...spread, 'special-attack': special, 'special-defense': special }
}

export function natureModsOf(pokemon: CalcPokemon, gen: number): NatureMods {
  if (gen < 3 || !pokemon.nature) return { increased: null, decreased: null }
  return {
    increased: (pokemon.nature.increased_stat as StatKey | null) ?? null,
    decreased: (pokemon.nature.decreased_stat as StatKey | null) ?? null,
  }
}

/** The six computed stats before any in-battle modifier. */
export function computeRawStats(pokemon: CalcPokemon, gen: number): StatTable {
  const bases = new Map(
    resolveStatsForGeneration(pokemon.variety, gen).map((s) => [s.stat, s.base_stat]),
  )
  const individual = spreadForGen(pokemon.individual, gen)
  const effort = spreadForGen(pokemon.effort, gen)
  const nature = natureModsOf(pokemon, gen)
  const out = {} as StatTable
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatId[]) {
    const key = statKeyFor(stat, gen)
    out[stat] = computeStat({
      generation: gen,
      level: pokemon.level,
      base: bases.get(key) ?? 0,
      key,
      effort,
      individual,
      nature,
    })
  }
  return out
}

function displayName(pokemon: CalcPokemon): string {
  const { species, variety } = pokemon
  if (variety.is_default || !variety.name.startsWith(`${species.name}-`))
    return species.display_name
  const form = variety.name
    .slice(species.name.length + 1)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
  return `${species.display_name}-${form}`
}

export function makeCombatant(pokemon: CalcPokemon, gen: number): Combatant {
  const typeIds = resolveTypesForGeneration(pokemon.variety, gen).map((t) => t.type_id)
  const rawStats = computeRawStats(pokemon, gen)
  const boosts: Record<BoostStat, number> = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  for (const [k, v] of Object.entries(pokemon.boosts as Boosts)) {
    boosts[k as BoostStat] = Math.max(-6, Math.min(6, v ?? 0))
  }
  // Gen 1 has one Special stage; the form sets `spa` and it moves both halves.
  if (gen === 1) boosts.spd = boosts.spa

  const hasItem = gen >= HELD_ITEMS_INTRODUCED_IN_GENERATION && pokemon.item != null
  const hasAbility = gen >= ABILITIES_INTRODUCED_IN_GENERATION && pokemon.ability != null
  const maxHp = rawStats.hp
  const curHp =
    pokemon.currentHp == null ? maxHp : Math.max(0, Math.min(maxHp, Math.round(pokemon.currentHp)))

  return {
    gen,
    level: pokemon.level,
    name: displayName(pokemon),
    speciesSlug: pokemon.species.name,
    varietySlug: pokemon.variety.name,
    types: typeIds.map((id) => getType(id)?.name ?? 'unknown'),
    typeIds,
    rawStats,
    stats: { ...rawStats },
    boosts,
    maxHp,
    curHp,
    item: hasItem ? pokemon.item!.name : '',
    itemName: hasItem ? pokemon.item!.display_name : '',
    itemRecord: hasItem ? pokemon.item : null,
    ability: hasAbility ? pokemon.ability!.name : '',
    abilityName: hasAbility ? pokemon.ability!.display_name : '',
    abilityOn: pokemon.abilityOn,
    status: pokemon.status === 'healthy' ? '' : pokemon.status,
    gender: pokemon.gender,
    weightKg: (pokemon.variety.weight ?? 0) / 10,
    nature: natureModsOf(pokemon, gen),
    input: pokemon,
  }
}

// --------------------------------------------------------------- predicates
// Slugs, not display names: 'choice-band', 'huge-power', 'giratina-origin'.

export const hasItem = (p: Combatant, ...items: string[]) => p.item !== '' && items.includes(p.item)
export const hasAbility = (p: Combatant, ...abilities: string[]) =>
  p.ability !== '' && abilities.includes(p.ability)
export const hasType = (p: Combatant, ...types: string[]) => p.types.some((t) => types.includes(t))
export const hasStatus = (p: Combatant, ...statuses: StatusId[]) =>
  p.status !== '' && statuses.includes(p.status)
/** Matches the species OR the exact form: named(p, 'giratina-origin') is the form only. */
export const named = (p: Combatant, ...names: string[]) =>
  names.includes(p.speciesSlug) || names.includes(p.varietySlug)
