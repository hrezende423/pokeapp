/**
 * Types for the generated Gen 1-4 data bundle.
 *
 * These mirror what scripts/build-data.ts emits. The bundle is normalized: every
 * cross-entity link is an integer id, so most fields here are `number` rather than
 * a nested object. Resolve them through the loader accessors.
 *
 * Fields ending in `_id` are nullable wherever the upstream source can legitimately
 * omit them (e.g. a species with no evolution chain). A null `ability_id` inside
 * `past_abilities` is meaningful: that slot was empty in that generation.
 */

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

export interface TypeSlot {
  slot: number
  type_id: number
}

export interface StatEntry {
  stat: string | null
  base_stat: number
  effort: number
}

export interface AbilitySlot {
  ability_id: number
  is_hidden: boolean
  slot: number
}

/** Historical typing, keyed by the last generation the old typing applied to. */
export interface PastTypes {
  generation_id: number | null
  types: TypeSlot[]
}

/** Historical ability slots. `ability_id: null` means the slot was empty then. */
export interface PastAbilities {
  generation_id: number | null
  abilities: { ability_id: number | null; is_hidden: boolean; slot: number }[]
}

/** Historical base stats — Gen 1's combined `special` shows up here. */
export interface PastStats {
  generation_id: number | null
  stats: StatEntry[]
}

export interface HeldItem {
  item_id: number
  versions: { version: string | null; rarity: number }[]
}

export interface Sprites {
  front_default: string | null
  front_shiny: string | null
  official_artwork: string | null
}

export interface DamageRelations {
  double_damage_to: number[]
  half_damage_to: number[]
  no_damage_to: number[]
  double_damage_from: number[]
  half_damage_from: number[]
  no_damage_from: number[]
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** One battle-relevant form of a species (default form, Deoxys-Attack, Rotom-Heat...). */
export interface Variety {
  pokemon_id: number
  name: string
  is_default: boolean
  form_version_groups: (string | null)[]
  height: number | null
  weight: number | null
  base_experience: number | null
  types: TypeSlot[]
  past_types: PastTypes[]
  abilities: AbilitySlot[]
  past_abilities: PastAbilities[]
  stats: StatEntry[]
  past_stats: PastStats[]
  held_items: HeldItem[]
  sprites: Sprites
}

export interface Species {
  id: number
  name: string
  display_name: string
  genus: string | null
  generation_id: number | null
  order: number | null
  gender_rate: number | null
  capture_rate: number | null
  base_happiness: number | null
  hatch_counter: number | null
  growth_rate: string | null
  color: string | null
  shape: string | null
  habitat: string | null
  is_baby: boolean
  is_legendary: boolean
  is_mythical: boolean
  has_gender_differences: boolean
  forms_switchable: boolean
  egg_group_ids: number[]
  evolution_chain_id: number | null
  evolves_from_species_id: number | null
  pokedex_numbers: Record<string, number>
  flavor_text: Record<string, string | null>
  varieties: Variety[]
}

export interface MoveMeta {
  ailment: string | null
  ailment_chance: number
  category: string | null
  crit_rate: number
  drain: number
  flinch_chance: number
  healing: number
  max_hits: number | null
  max_turns: number | null
  min_hits: number | null
  min_turns: number | null
  stat_chance: number
}

export interface Move {
  id: number
  name: string
  display_name: string
  generation_id: number | null
  type_id: number | null
  damage_class: string | null
  power: number | null
  pp: number | null
  accuracy: number | null
  priority: number
  target: string | null
  effect_chance: number | null
  effect: string | null
  short_effect: string | null
  meta: MoveMeta | null
  stat_changes: { stat: string | null; change: number }[]
  contest_type: string | null
  /** Kept verbatim from PokeAPI; no per-generation resolution is inferred. */
  past_values: {
    version_group: string | null
    power: number | null
    pp: number | null
    accuracy: number | null
    effect_chance: number | null
    type_id: number | null
  }[]
  machines: { version_group: string | null; item_id: number | null }[]
}

export interface Item {
  id: number
  name: string
  display_name: string
  category: string | null
  attributes: (string | null)[]
  generation_ids: number[]
  fling_power: number | null
  fling_effect: string | null
  effect: string | null
  short_effect: string | null
  prices: {
    version_group: string | null
    currency: string | null
    purchase_price: number | null
    sell_price: number | null
  }[]
  machines: { version_group: string | null; move_id: number | null }[]
  sprite: string | null
}

export interface Ability {
  id: number
  name: string
  display_name: string
  generation_id: number | null
  is_main_series: boolean
  effect: string | null
  short_effect: string | null
  effect_changes: { version_group: string | null; effect: string | null }[]
}

export interface Nature {
  id: number
  name: string
  display_name: string
  increased_stat: string | null
  decreased_stat: string | null
  likes_flavor: string | null
  hates_flavor: string | null
  pokeathlon_stat_changes: { pokeathlon_stat: string | null; max_change: number }[]
  move_battle_style_preferences: {
    move_battle_style: string | null
    low_hp_preference: number
    high_hp_preference: number
  }[]
}

export interface Berry {
  id: number
  name: string
  item_id: number | null
  firmness: string | null
  natural_gift_power: number | null
  natural_gift_type_id: number | null
  size: number | null
  smoothness: number | null
  soil_dryness: number | null
  growth_time: number | null
  max_harvest: number | null
  flavors: { flavor: string | null; potency: number }[]
}

export interface PokemonType {
  id: number
  name: string
  display_name: string
  generation_id: number
  move_damage_class: string | null
  /** Current-generation relations. Wrong for Gen 1-4 — prefer the per-gen map. */
  damage_relations: DamageRelations
  past_damage_relations: { generation_id: number | null; damage_relations: DamageRelations }[]
  /**
   * Resolved relations per generation, filtered to types that existed then.
   * Keyed by generation number as a string ('1'..'4'). Absent for a generation
   * the type did not exist in.
   */
  damage_relations_by_generation: Record<string, DamageRelations | undefined>
}

export interface EggGroup {
  id: number
  name: string
  display_name: string
}

export interface EvolutionDetail {
  trigger: string | null
  version_group: string | null
  item_id: number | null
  held_item_id: number | null
  known_move_id: number | null
  used_move_id: number | null
  known_move_type_id: number | null
  party_type_id: number | null
  party_species_id: number | null
  trade_species_id: number | null
  location_id: number | null
  gender: number | null
  min_level: number | null
  min_happiness: number | null
  min_beauty: number | null
  min_affection: number | null
  relative_physical_stats: number | null
  time_of_day: string | null
  needs_overworld_rain: boolean
  turn_upside_down: boolean
}

export interface EvolutionNode {
  species_id: number
  evolution_details: EvolutionDetail[]
  evolves_to: EvolutionNode[]
}

export interface EvolutionChain {
  id: number
  baby_trigger_item_id: number | null
  chain: EvolutionNode
}

export interface GameLocation {
  id: number
  name: string
  display_name: string
  region: string | null
  area_ids: number[]
}

export interface LocationArea {
  id: number
  name: string
  display_name: string
  location_id: number
}

export interface LocationsFile {
  locations: Record<string, GameLocation>
  areas: Record<string, LocationArea>
}

/** One entry of version-groups.json — also the partition index for the loader. */
export interface VersionGroup {
  id: number
  name: string
  generation_id: number | null
  order: number | null
  versions: (string | null)[]
  learnsets_path: string
  encounters_path: string
  learnset_rows: number
  encounter_rows: number
}

export interface BundleMeta {
  generated_by: string
  source: { repo: string; url: string; tarball_sha256: string | null }
  scope: {
    max_species_id: number
    max_generation: number
    version_groups: string[]
    versions: string[]
  }
  counts: Record<string, number>
  file_bytes: Record<string, number>
  file_bytes_gzip: Record<string, number>
  validation: { references_checked: number; dangling_references: number }
  notes: string[]
}

// ---------------------------------------------------------------------------
// Partitioned row types
// ---------------------------------------------------------------------------

export interface LearnRow {
  species_id: number
  pokemon_id: number
  move_id: number
  version_group: string
  method: string
  level: number
  order: number | null
}

export interface EncounterRow {
  species_id: number
  pokemon_id: number
  location_id: number
  location_area_id: number
  version: string
  version_group: string
  method: string
  chance: number
  level_min: number
  level_max: number
  conditions: string[]
}
