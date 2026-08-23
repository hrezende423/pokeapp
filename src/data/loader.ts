/**
 * Eager data-bundle loader.
 *
 * Fetches the twelve cross-cutting entity files once at boot, indexes them into
 * plain Maps keyed by id, and exposes typed accessors. No query engine — callers
 * that need a different access path build their own index over these Maps.
 *
 * The large per-version-group partitions are handled separately by
 * ./versionGroupData.ts, which loads them on demand.
 */

import { DATA_DIR, EAGER_DATA_FILES } from './manifest'
import type {
  Ability,
  Berry,
  BundleMeta,
  EggGroup,
  EvolutionChain,
  GameLocation,
  Item,
  LocationArea,
  LocationsFile,
  Move,
  Nature,
  PokemonType,
  Species,
  VersionGroup,
} from './types'

/**
 * Resolve a bundle-relative path against the Vite base.
 *
 * BASE_URL is '/pokeapp/' in production and '/' in dev, and always carries a
 * trailing slash. Hardcoding a leading-slash path here is the exact bug that broke
 * the deployed icons earlier — asset URLs in code are not base-rewritten.
 */
export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${DATA_DIR}/${path}`
}

/** Per-file timing and decoded size, surfaced for boot diagnostics. */
export interface FileLoadStat {
  file: string
  bytes: number
  ms: number
}

export interface BootStats {
  ms: number
  bytes: number
  files: FileLoadStat[]
}

interface EagerBundle {
  species: Map<number, Species>
  moves: Map<number, Move>
  items: Map<number, Item>
  abilities: Map<number, Ability>
  natures: Map<number, Nature>
  berries: Map<number, Berry>
  types: Map<number, PokemonType>
  eggGroups: Map<number, EggGroup>
  evolutionChains: Map<number, EvolutionChain>
  locations: Map<number, GameLocation>
  locationAreas: Map<number, LocationArea>
  versionGroups: Map<number, VersionGroup>
  versionGroupsByName: Map<string, VersionGroup>
  meta: BundleMeta
  stats: BootStats
}

let bundle: EagerBundle | null = null
/** Held so concurrent init() callers share one set of fetches. */
let initPromise: Promise<BootStats> | null = null

/** Fetch one bundle file, returning the parsed body plus its decoded size. */
async function fetchJson<T>(file: string): Promise<{ value: T; stat: FileLoadStat }> {
  const started = performance.now()
  const url = dataUrl(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
  // Read as text so the decoded byte count can be reported; JSON.parse of a string
  // is no slower than res.json() at these sizes.
  const text = await res.text()
  return {
    value: JSON.parse(text) as T,
    stat: { file, bytes: new TextEncoder().encode(text).length, ms: performance.now() - started },
  }
}

/** Index a `{ [id]: entity }` document by numeric id. */
function indexById<T>(record: Record<string, T>): Map<number, T> {
  const map = new Map<number, T>()
  for (const [key, value] of Object.entries(record)) map.set(Number(key), value)
  return map
}

/**
 * Load and index the eager bundle. Idempotent: repeat calls return the first
 * result without re-fetching, and concurrent calls share one in-flight load.
 */
export function initDataLayer(): Promise<BootStats> {
  if (bundle) return Promise.resolve(bundle.stats)
  if (initPromise) return initPromise

  initPromise = (async () => {
    const started = performance.now()

    // All twelve in parallel; they are independent and the browser caps concurrency.
    const [
      species,
      moves,
      items,
      abilities,
      natures,
      berries,
      types,
      eggGroups,
      evolutionChains,
      locations,
      meta,
      versionGroups,
    ] = await Promise.all([
      fetchJson<Record<string, Species>>('species.json'),
      fetchJson<Record<string, Move>>('moves.json'),
      fetchJson<Record<string, Item>>('items.json'),
      fetchJson<Record<string, Ability>>('abilities.json'),
      fetchJson<Record<string, Nature>>('natures.json'),
      fetchJson<Record<string, Berry>>('berries.json'),
      fetchJson<Record<string, PokemonType>>('types.json'),
      fetchJson<Record<string, EggGroup>>('egg-groups.json'),
      fetchJson<Record<string, EvolutionChain>>('evolution-chains.json'),
      fetchJson<LocationsFile>('locations.json'),
      fetchJson<BundleMeta>('meta.json'),
      fetchJson<Record<string, VersionGroup>>('version-groups.json'),
    ])

    const stats: BootStats = {
      ms: 0,
      bytes: 0,
      files: [],
    }
    for (const loaded of [
      species,
      moves,
      items,
      abilities,
      natures,
      berries,
      types,
      eggGroups,
      evolutionChains,
      locations,
      meta,
      versionGroups,
    ]) {
      stats.files.push(loaded.stat)
      stats.bytes += loaded.stat.bytes
    }
    stats.files.sort((a, b) => b.bytes - a.bytes)

    const versionGroupMap = indexById(versionGroups.value)
    const versionGroupsByName = new Map<string, VersionGroup>()
    for (const vg of versionGroupMap.values()) versionGroupsByName.set(vg.name, vg)

    bundle = {
      species: indexById(species.value),
      moves: indexById(moves.value),
      items: indexById(items.value),
      abilities: indexById(abilities.value),
      natures: indexById(natures.value),
      berries: indexById(berries.value),
      types: indexById(types.value),
      eggGroups: indexById(eggGroups.value),
      evolutionChains: indexById(evolutionChains.value),
      locations: indexById(locations.value.locations),
      locationAreas: indexById(locations.value.areas),
      versionGroups: versionGroupMap,
      versionGroupsByName,
      meta: meta.value,
      stats,
    }
    stats.ms = performance.now() - started
    return stats
  })()

  // A failed boot must not poison every later attempt.
  initPromise.catch(() => {
    initPromise = null
  })

  return initPromise
}

/** True once the eager bundle is indexed and accessors are safe to call. */
export function isDataLayerReady(): boolean {
  return bundle != null
}

function requireBundle(): EagerBundle {
  if (!bundle) {
    throw new Error('data layer not initialized — await initDataLayer() before reading it')
  }
  return bundle
}

// ---------------------------------------------------------------------------
// Accessors
//
// Single-entity getters return undefined for an unknown id rather than throwing:
// a missing id is a normal outcome when resolving optional references such as
// evolves_from_species_id.
// ---------------------------------------------------------------------------

export const getSpecies = (id: number): Species | undefined => requireBundle().species.get(id)
export const getMove = (id: number): Move | undefined => requireBundle().moves.get(id)
export const getItem = (id: number): Item | undefined => requireBundle().items.get(id)
export const getAbility = (id: number): Ability | undefined => requireBundle().abilities.get(id)
export const getNature = (id: number): Nature | undefined => requireBundle().natures.get(id)
export const getBerry = (id: number): Berry | undefined => requireBundle().berries.get(id)
export const getType = (id: number): PokemonType | undefined => requireBundle().types.get(id)
export const getEggGroup = (id: number): EggGroup | undefined => requireBundle().eggGroups.get(id)
export const getEvolutionChain = (id: number): EvolutionChain | undefined =>
  requireBundle().evolutionChains.get(id)
export const getLocation = (id: number): GameLocation | undefined =>
  requireBundle().locations.get(id)
export const getLocationArea = (id: number): LocationArea | undefined =>
  requireBundle().locationAreas.get(id)
export const getVersionGroup = (id: number): VersionGroup | undefined =>
  requireBundle().versionGroups.get(id)
export const getVersionGroupByName = (name: string): VersionGroup | undefined =>
  requireBundle().versionGroupsByName.get(name)

export const getBundleMeta = (): BundleMeta => requireBundle().meta
export const getBootStats = (): BootStats => requireBundle().stats

/** All species in national dex order. */
export const listSpecies = (): Species[] =>
  [...requireBundle().species.values()].sort((a, b) => a.id - b.id)

/** All types, ascending by id (includes PokeAPI's pseudo-types). */
export const listTypes = (): PokemonType[] =>
  [...requireBundle().types.values()].sort((a, b) => a.id - b.id)

/** All items, ascending by id. */
export const listItems = (): Item[] =>
  [...requireBundle().items.values()].sort((a, b) => a.id - b.id)

/** All abilities, ascending by id. */
export const listAbilities = (): Ability[] =>
  [...requireBundle().abilities.values()].sort((a, b) => a.id - b.id)

/** All natures, ascending by id. */
export const listNatures = (): Nature[] =>
  [...requireBundle().natures.values()].sort((a, b) => a.id - b.id)

/** All berries, ascending by id. */
export const listBerries = (): Berry[] =>
  [...requireBundle().berries.values()].sort((a, b) => a.id - b.id)

/** All version groups, oldest generation first. */
export const listVersionGroups = (): VersionGroup[] =>
  [...requireBundle().versionGroups.values()].sort(
    (a, b) => (a.generation_id ?? 0) - (b.generation_id ?? 0) || (a.order ?? 0) - (b.order ?? 0),
  )

/** Entity counts, for diagnostics. */
export function getIndexCounts(): Record<string, number> {
  const b = requireBundle()
  return {
    species: b.species.size,
    moves: b.moves.size,
    items: b.items.size,
    abilities: b.abilities.size,
    natures: b.natures.size,
    berries: b.berries.size,
    types: b.types.size,
    egg_groups: b.eggGroups.size,
    evolution_chains: b.evolutionChains.size,
    locations: b.locations.size,
    location_areas: b.locationAreas.size,
    version_groups: b.versionGroups.size,
  }
}

/**
 * Era-correct damage relations for a type.
 *
 * Falls back to current-generation relations only when the type has no block for
 * that generation, which for a Gen 1-4 generation means the type did not exist yet.
 */
export function getDamageRelations(typeId: number, generation: number) {
  return getType(typeId)?.damage_relations_by_generation[String(generation)]
}

/** Test seam: drop the indexed bundle so a fresh init can run. */
export function __resetDataLayer(): void {
  bundle = null
  initPromise = null
}

/** File list the loader fetches at boot, for diagnostics and tests. */
export const eagerFiles = EAGER_DATA_FILES
