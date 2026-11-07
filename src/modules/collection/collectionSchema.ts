/**
 * The Collection's schema, v2 (docs/SPEC.md slice C): reading an entry of any
 * age, which fields a generation has, and the one bridge to a Build.
 *
 * MIGRATION IS ON READ, PER ENTRY, AND NEVER GATED ON `schemaVersion`. A client
 * from before v2 normalises the document down to the top-level fields it knows,
 * so a v2 document it writes back has lost `schemaVersion` -- but it keeps each
 * entry whole (it spreads them), so the v2 fields survive. Reading the version to
 * decide whether to migrate would therefore skip exactly the documents that need
 * it. `migrateEntry` is idempotent instead, and runs on every read.
 *
 * `entryToBuild` IS THE ONE BRIDGE. The Damage calculator, Team Matchup and the
 * candidate flags all take a Build, so an entry becomes one here and every path
 * downstream is the Build path, unchanged.
 */

import { getSpecies } from '../../data'
import { MOVE_SLOTS, padSlots, type Build, type CollectionEntry, type Pokerus } from '../team-builder/model'

const isObject = (x: unknown): x is Record<string, unknown> =>
  x != null && typeof x === 'object' && !Array.isArray(x)

const POKERUS: readonly Pokerus[] = ['none', 'infected', 'cured']

/**
 * Any stored entry -> a v2 entry. Pure and idempotent.
 *
 * Every field already there is kept as it is, v1 or not, known or not (a newer
 * client's field must survive this one). Only an ABSENT v2 field is filled, plus
 * the shape repairs the screens index on: four move slots, the three nested
 * records merged over their defaults, a valid Pokerus state, a ribbon array.
 * The one v1 repair is `effort`, filled with {} only when it is missing: every
 * screen reads a stat out of it.
 */
export function migrateEntry(raw: unknown): CollectionEntry {
  const r: Record<string, unknown> = isObject(raw) ? raw : {}
  const met = isObject(r.met) ? r.met : {}
  const ot = isObject(r.ot) ? r.ot : {}
  const acquired = isObject(r.acquired) ? r.acquired : {}
  return {
    ...r,
    effort: isObject(r.effort) ? r.effort : {},
    pokemonId: r.pokemonId ?? null,
    game: r.game ?? null,
    gender: r.gender ?? null,
    shiny: typeof r.shiny === 'boolean' ? r.shiny : false,
    abilityId: r.abilityId ?? null,
    individual: isObject(r.individual) ? r.individual : {},
    itemId: r.itemId ?? null,
    moveIds: padSlots(Array.isArray(r.moveIds) ? [...r.moveIds] : [], MOVE_SLOTS, null),
    met: { location: '', level: null, date: null, ...met },
    ot: { name: '', id: '', language: null, ...ot },
    acquired: { date: null, method: null, ...acquired },
    pokerus: POKERUS.includes(r.pokerus as Pokerus) ? r.pokerus : 'none',
    ribbons: Array.isArray(r.ribbons) ? r.ribbons : [],
  } as CollectionEntry
}

/* ---------------------------------------------------- per-generation fields */

/** Every field the entry form can show. */
export type CollectionField =
  | 'species'
  | 'nickname'
  | 'level'
  | 'game'
  | 'gender'
  | 'shiny'
  | 'nature'
  | 'ability'
  | 'item'
  | 'moves'
  | 'individual'
  | 'effort'
  | 'metLocation'
  | 'metLevel'
  | 'metDate'
  | 'otName'
  | 'otId'
  | 'otLanguage'
  | 'pokerus'
  | 'acquiredDate'
  | 'acquiredMethod'
  | 'build'

/** `stored`: the player sets it. `derived`: computed from other fields, shown read-only. */
export type FieldMode = 'stored' | 'derived'

/**
 * The spec's field table, one generation at a time. A field this returns no
 * mode for is ABSENT from the form, never disabled.
 *
 * Met location and level are Gen 2 for CRYSTAL ONLY: Gold and Silver record no
 * met data at all; Crystal records the location and level (no date).
 */
export function collectionFields(
  generation: number,
  game: string | null,
): Partial<Record<CollectionField, FieldMode>> {
  const gen = generation
  const f: Partial<Record<CollectionField, FieldMode>> = {
    species: 'stored',
    nickname: 'stored',
    level: 'stored',
    game: 'stored',
    moves: 'stored',
    individual: 'stored',
    effort: 'stored',
    otName: 'stored',
    otId: 'stored',
    acquiredDate: 'stored',
    acquiredMethod: 'stored',
    build: 'stored',
  }
  if (gen === 2) {
    f.gender = 'derived'
    f.shiny = 'derived'
  }
  if (gen >= 3) {
    f.gender = 'stored'
    f.shiny = 'stored'
    f.nature = 'stored'
    f.ability = 'stored'
    f.otLanguage = 'stored'
  }
  if (gen >= 2) {
    f.item = 'stored'
    f.pokerus = 'stored'
  }
  if (gen >= 3 || (gen === 2 && game === 'crystal')) {
    f.metLocation = 'stored'
    f.metLevel = 'stored'
  }
  if (gen >= 4) f.metDate = 'stored'
  return f
}

/* --------------------------------------------------------------- the bridge */

/**
 * The entry as a Build, for every path that takes one.
 *
 *   id: the entry's own ("c3"), so a Matchup override keyed by it never meets a
 *     Build's ("b3").
 *   gender and shiny: the stored values from Gen 3, null / false before, so
 *     `buildGender` and `isShinyByDvs` derive them exactly as for a Build.
 *   Gen 2 Special: the entry keeps ONE `special` Stat Exp (#9 reads it there);
 *     a Gen 2 Build keeps it under the split keys. Both are written here, so
 *     computeStat, the calculator's applyBuild, battle exactSpread and #9 all
 *     read the same number whichever key they ask for.
 */
export function entryToBuild(entry: CollectionEntry): Build {
  const gen = entry.generation
  const species = getSpecies(entry.speciesId)
  const variety =
    species?.varieties.find((v) => v.pokemon_id === entry.pokemonId) ??
    species?.varieties.find((v) => v.is_default) ??
    species?.varieties[0]
  const modern = gen >= 3
  const effort = { ...entry.effort }
  if (gen === 2 && effort.special != null) {
    effort['special-attack'] = effort.special
    effort['special-defense'] = effort.special
  }
  return {
    id: entry.id,
    generation: gen,
    speciesId: entry.speciesId,
    pokemonId: variety?.pokemon_id ?? entry.pokemonId ?? entry.speciesId,
    nickname: entry.nickname,
    gender: modern ? entry.gender : null,
    shiny: modern ? entry.shiny : false,
    level: entry.level,
    friendship: gen >= 2 ? (species?.base_happiness ?? 70) : 0,
    itemId: gen >= 2 ? entry.itemId : null,
    abilityId: modern ? entry.abilityId : null,
    natureId: modern ? entry.natureId : null,
    moveIds: padSlots([...entry.moveIds], MOVE_SLOTS, null),
    effort,
    individual: { ...entry.individual },
    tags: [],
    notes: '',
  }
}
