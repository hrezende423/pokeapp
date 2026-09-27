/**
 * The Trainer Dex bundle: public/data/trainers/<version-group>.json.
 *
 * Built by scripts/build-trainers.mjs from two sources (see its header): the pret
 * disassemblies for what every trainer carries, Bulbapedia's walkthroughs and
 * location pages for where the player meets them. This file is the shape the
 * build writes and the on-demand loader for it -- the same pattern as the
 * learnset and encounter partitions (versionGroupData.ts): fetched the first
 * time a screen asks, held in memory, CacheFirst in the service worker.
 *
 * ONE FILE PER VERSION GROUP, main series only. Colosseum, XD and the Japanese
 * Red/Green/Blue have no disassembly to build from, so they have no file, and
 * `hasTrainerData` says so rather than a fetch failing.
 */

import { dataUrl } from './loader'

/** The ten version groups the build writes. */
export const TRAINER_VERSION_GROUPS = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
] as const

export const hasTrainerData = (vg: string | null | undefined): boolean =>
  vg != null && (TRAINER_VERSION_GROUPS as readonly string[]).includes(vg)

/** Gen 1-2 DVs. Gen 1 trainers all carry 9/8/8/8; Gen 2's come from the class. */
export interface TrainerDvs {
  attack: number
  defense: number
  speed: number
  special: number
}

export type StatSpread = Partial<
  Record<
    'hp' | 'attack' | 'defense' | 'speed' | 'special-attack' | 'special-defense',
    number | null
  >
>

export interface TrainerPokemon {
  species_id: number
  /** The variety (form) fought, as a PokeAPI pokemon id. */
  pokemon_id: number
  /** The game's own form index where one is set (Gen 4), else null. */
  form: number | null
  level: number
  /** Move ids, in slot order. */
  moves: number[]
  /** True when the game sets these moves; false when they are the level-up default. */
  moves_explicit: boolean
  item_id: number | null
  /** The game's own item name where the bundle item is a later equivalent (Gen 2's Pink Bow). */
  item_name?: string
  /** Gen 3-4: one IV for all six stats. */
  iv?: number
  /**
   * Gen 4: the data's IV scale overflows the game's byte into random IVs
   * (Platinum's Volkner's Electivire); `iv` is then absent.
   */
  iv_random?: true
  /** Gen 1-2. */
  dvs?: TrainerDvs
  /** Gen 3-4, from the personality value. */
  nature_id?: number
  /** Gen 3-4: which ability slot (0 or 1); resolve with resolveAbilitiesForGeneration. */
  ability_slot?: number
  gender: 'M' | 'F' | null
  personality?: number
}

export interface TrainerAppearance {
  /** Walkthrough placement carries play order; a location-page one does not. */
  source: 'walkthrough' | 'location-page'
  /** Position in the game's walkthrough, across every part; null from a location page. */
  order: number | null
  part: number | null
  location: string | null
  area: string | null
  /** PokeAPI location, where the walkthrough's location is one. */
  location_id: number | null
  /** "If the player chose Turtwig", "Rematch 2", ... */
  variant: string | null
  note: string | null
  /** Inherited from the trainer this one is a rematch of. */
  inherited?: true
}

export interface Trainer {
  /** The disassembly's constant (TRAINER_LEADER_ROARK) or class + number (Gen 1). */
  id: string
  index: number
  class_id: string
  name: string | null
  /** The name in the data, when the displayed one differs (a player-named rival). */
  game_name?: string
  rematch_of?: string
  /** In the data, never fought in the game. */
  unused?: true
  /** Version-exclusive fights (Ruby / Sapphire). */
  versions?: string[]
  battle: 'single' | 'double' | 'tag'
  prize: number | null
  /** Bag items the trainer can use, as item ids. */
  items: number[]
  ai: string[]
  party: TrainerPokemon[]
  appearances: TrainerAppearance[]
}

export interface TrainerClass {
  id: string
  name: string
}

/** One prepared set in a facility pool. */
export interface FacilitySet {
  key: string
  species_id?: number
  pokemon_id?: number
  form?: number | null
  level?: number
  group?: number
  moves: number[]
  item_id: number | null
  item_name?: string
  nature_id?: number | null
  evs?: StatSpread | null
  dvs?: TrainerDvs
  stat_exp?: Record<string, number>
}

/** A facility Pokemon spelled out in full (Trainer Tower, Trainer Hill, the Brains). */
export interface FacilityPokemon {
  species_id?: number
  pokemon_id?: number
  moves: number[]
  item_id: number | null
  evs?: StatSpread
  ivs?: StatSpread
  ability_slot?: number
  nature_id?: number | null
  gender?: 'M' | 'F' | null
}

export interface FacilityTrainer {
  key: string
  class_id: string | null
  class_name: string | null
  name: string | null
  group?: string
  note?: string
  /** Wiki-sourced (the Gen 4 Frontier Brains). */
  source?: 'bulbapedia'
  /** Draws at random from these sets. */
  set_keys?: string[]
  /** Crystal: draws from the chosen level bracket's sets. */
  set_group?: string
  /** Fixed team. */
  party?: FacilityPokemon[]
}

export interface Facility {
  id: string
  name: string
  /** How the game picks what you face, in a sentence or two. */
  rules: string
  /** Where the data is not the game's own bytes (HGSS reuses Platinum's pool). */
  source_note?: string
  sets: FacilitySet[]
  trainers: FacilityTrainer[]
}

export interface TrainerPartition {
  version_group: string
  generation: number
  classes: Record<string, TrainerClass>
  trainers: Trainer[]
  /** The walkthrough's location sequence, for a game-order view. */
  route: { part: number; location: string | null; location_id: number | null }[]
  facilities: Facility[]
  sources: { disassembly: string; walkthrough: { title: string; revid: number }[] }
  coverage: Record<string, number>
  checks: Record<string, unknown>
}

/**
 * "Youngster Tristan": class then name -- except where the class already ends in
 * the name, which the games do for their Grunts ("Team Aqua Grunt" / "Grunt") and
 * Diamond and Pearl for their Gym Leaders and Battleground regulars ("Leader
 * Candice" / "Candice"), where the pair would read "Leader Candice Candice".
 */
export function trainerLabel(className: string, name: string | null): string {
  if (!name) return className
  if (className === name || className.endsWith(` ${name}`)) return className
  return `${className} ${name}`
}

const cache = new Map<string, TrainerPartition>()
const inflight = new Map<string, Promise<TrainerPartition>>()

/** Load one game's trainers, or return them from memory. A failure is never cached. */
export function loadTrainers(versionGroup: string): Promise<TrainerPartition> {
  const hit = cache.get(versionGroup)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(versionGroup)
  if (pending) return pending
  if (!hasTrainerData(versionGroup)) {
    return Promise.reject(new Error(`no trainer data for "${versionGroup}"`))
  }
  const promise = (async () => {
    const url = dataUrl(`trainers/${versionGroup}.json`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
    const partition = (await res.json()) as TrainerPartition
    cache.set(versionGroup, partition)
    return partition
  })()
  inflight.set(versionGroup, promise)
  void promise.finally(() => inflight.delete(versionGroup)).catch(() => {})
  return promise
}

/** The partition if it is already in memory. */
export const peekTrainers = (versionGroup: string): TrainerPartition | undefined =>
  cache.get(versionGroup)

/** Test seam. */
export function __resetTrainerCache(): void {
  cache.clear()
  inflight.clear()
}
