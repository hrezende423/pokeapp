/**
 * Build-time data ingestion for the Gen 1-4 Pokémon data layer.
 *
 * Reads PokeAPI's static JSON snapshot (github.com/PokeAPI/api-data) from a local
 * cache and writes a normalized, reference-only bundle to /data. The live REST API
 * is never called; the snapshot is downloaded once as a tarball and reused.
 *
 * Design rules (these are load-bearing for every downstream module):
 *   1. Normalized, never denormalized. Entities reference each other by integer id.
 *      No entity embeds another entity's payload.
 *   2. Reverse indices (move.learned_by_pokemon, type.pokemon, ability.pokemon,
 *      egg_group.pokemon_species) are NOT emitted -- they are derivable from the
 *      forward references and would bloat the bundle.
 *   3. Zero dangling references. Every *_id emitted resolves to an entry in its own
 *      file. Reference *lists* are filtered to retained entities; essential single
 *      references pull their target into the retained set.
 *   4. Generation-accurate. Gen 1-4 differs from current-gen in type matchups,
 *      typings, abilities and base stats, so past_* data is preserved rather than
 *      flattened to modern values.
 *
 * Usage:  npm run build:data  [-- --force-download]
 */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const CACHE_DIR = join(ROOT, '.cache')
const SNAPSHOT_DIR = join(CACHE_DIR, 'api-data')
const TARBALL = join(CACHE_DIR, 'api-data.tar.gz')
const OUT_DIR = join(ROOT, 'data')

const SNAPSHOT_URL = 'https://codeload.github.com/PokeAPI/api-data/tar.gz/refs/heads/master'
const SNAPSHOT_SUBTREE = 'api-data-master/data/api/v2'

/** National dex cutoff: Bulbasaur (1) .. Arceus (493). */
const MAX_SPECIES_ID = 493
/** Generations in scope. */
const MAX_GENERATION = 4

const GENERATION_IDS: Record<string, number> = {
  'generation-i': 1,
  'generation-ii': 2,
  'generation-iii': 3,
  'generation-iv': 4,
  'generation-v': 5,
  'generation-vi': 6,
  'generation-vii': 7,
  'generation-viii': 8,
  'generation-ix': 9,
}

const DAMAGE_RELATION_KEYS = [
  'double_damage_to',
  'half_damage_to',
  'no_damage_to',
  'double_damage_from',
  'half_damage_from',
  'no_damage_from',
] as const

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

// Upstream api-data payloads are large, deeply nested and untyped. Modelling every
// endpoint's shape would be far more code than the narrow reads below justify, so
// snapshot rows stay `any` and every value is funnelled through the ref*/english/
// cleanText helpers, which do the null-checking.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
type NamedRef = { name: string; url: string } | null | undefined

const log = (...a: unknown[]) => console.log(...a)

/** Pull the trailing numeric id out of an api-data URL: "/api/v2/move/5/" -> 5. */
function refId(ref: NamedRef): number | null {
  if (!ref || !ref.url) return null
  const m = ref.url.match(/\/(\d+)\/?$/)
  return m ? Number(m[1]) : null
}

function refName(ref: NamedRef): string | null {
  return ref ? ref.name : null
}

function genId(ref: NamedRef): number | null {
  const n = refName(ref)
  return n ? (GENERATION_IDS[n] ?? null) : null
}

/** English text picker; api-data orders languages arbitrarily. */
function english(entries: Json[] | undefined): Json | null {
  if (!entries || !entries.length) return null
  return entries.find((e: Json) => refName(e.language) === 'en') ?? null
}

/** Game text uses form feeds and hard newlines for in-game line breaks. */
function cleanText(s: string | null | undefined): string | null {
  if (!s) return null
  return (
    s
      .replace(/[\f\n\r­]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null
  )
}

/** Deterministic stringify: keys sorted so re-running produces byte-identical files. */
function stableStringify(value: Json): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.keys(v)
          .sort((a, b) => {
            const na = Number(a)
            const nb = Number(b)
            if (Number.isInteger(na) && Number.isInteger(nb)) return na - nb
            return a < b ? -1 : a > b ? 1 : 0
          })
          .map((k) => [k, v[k]]),
      )
    }
    return v
  })
}

function sortedUnique(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b)
}

/** Bounded-concurrency map; the snapshot is ~10k small files and serial IO is slow. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// ---------------------------------------------------------------------------
// Snapshot acquisition
// ---------------------------------------------------------------------------

const V2 = () => join(SNAPSHOT_DIR, 'data', 'api', 'v2')

async function sha256OrNull(file: string): Promise<string | null> {
  try {
    return createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
  } catch {
    return null
  }
}

async function ensureSnapshot(forceDownload: boolean): Promise<{ tarballSha256: string | null }> {
  const v2 = V2()
  if (!forceDownload && existsSync(join(v2, 'pokemon-species', '1', 'index.json'))) {
    log(`snapshot: reusing ${v2}`)
    return { tarballSha256: await sha256OrNull(TARBALL) }
  }

  await mkdir(CACHE_DIR, { recursive: true })
  if (forceDownload || !existsSync(TARBALL)) {
    log(`snapshot: downloading ${SNAPSHOT_URL}`)
    const res = await fetch(SNAPSHOT_URL, { redirect: 'follow' })
    if (!res.ok) throw new Error(`snapshot download failed: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(TARBALL, buf)
    log(`snapshot: downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MiB`)
  }

  await mkdir(SNAPSHOT_DIR, { recursive: true })
  log(`snapshot: extracting ${SNAPSHOT_SUBTREE}`)
  const r = spawnSync(
    'tar',
    ['-xzf', TARBALL, '-C', SNAPSHOT_DIR, '--strip-components=1', SNAPSHOT_SUBTREE],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) throw new Error(`tar extraction failed (status ${r.status})`)
  if (!existsSync(join(v2, 'pokemon-species', '1', 'index.json'))) {
    throw new Error('snapshot extracted but pokemon-species/1 is missing')
  }
  return { tarballSha256: await sha256OrNull(TARBALL) }
}

// ---------------------------------------------------------------------------
// Snapshot readers
// ---------------------------------------------------------------------------

async function readEntity(endpoint: string, id: number | string): Promise<Json | null> {
  try {
    return JSON.parse(await readFile(join(V2(), endpoint, String(id), 'index.json'), 'utf8'))
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') return null
    throw err
  }
}

/** Numeric subdirectory ids for an endpoint (api-data also stores name-keyed dirs). */
async function listIds(endpoint: string): Promise<number[]> {
  const names = await readdir(join(V2(), endpoint))
  return names
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => a - b)
}

async function readAll(endpoint: string): Promise<Json[]> {
  const ids = await listIds(endpoint)
  const rows = await mapLimit(ids, 64, (id) => readEntity(endpoint, id))
  return rows.filter(Boolean)
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now()
  const forceDownload = process.argv.includes('--force-download')
  const { tarballSha256 } = await ensureSnapshot(forceDownload)

  // -- Version groups / versions in scope ----------------------------------
  const allVersionGroups = await readAll('version-group')
  const gen14VersionGroups = allVersionGroups.filter(
    (vg) => (genId(vg.generation) ?? 99) <= MAX_GENERATION,
  )
  const vgNames = new Set<string>(gen14VersionGroups.map((vg) => vg.name))
  const versionNames = new Set<string>()
  for (const vg of gen14VersionGroups) {
    for (const v of vg.versions) versionNames.add(v.name)
  }
  log(`scope: ${vgNames.size} version groups, ${versionNames.size} versions`)
  log(`  ${[...vgNames].sort().join(', ')}`)

  // -- Species -------------------------------------------------------------
  const speciesIds = Array.from({ length: MAX_SPECIES_ID }, (_, i) => i + 1)
  const speciesRaw = await mapLimit(speciesIds, 64, (id) => readEntity('pokemon-species', id))
  const missingSpecies = speciesIds.filter((_id, i) => !speciesRaw[i])
  if (missingSpecies.length) {
    throw new Error(`missing species in snapshot: ${missingSpecies.join(', ')}`)
  }

  // -- Forms: decide which varieties belong to Gen 1-4 ---------------------
  // pokemon.game_indices is empty for every alternate form, so it cannot separate
  // Gen 3 Deoxys forms from Gen 6 cosplay Pikachu. pokemon-form.version_group is
  // the authoritative "form introduced here" marker, so use that instead.
  const allForms = await readAll('pokemon-form')
  const formVersionGroup = new Map<number, string | null>()
  for (const fm of allForms) formVersionGroup.set(fm.id, refName(fm.version_group))

  const candidatePokemonIds = sortedUnique(
    (speciesRaw as Json[]).flatMap((sp: Json) => sp.varieties.map((v: Json) => refId(v.pokemon)!)),
  )
  const pokemonRaw = new Map<number, Json>()
  await mapLimit(candidatePokemonIds, 64, async (id) => {
    const p = await readEntity('pokemon', id)
    if (p) pokemonRaw.set(id, p)
  })

  const retainedPokemon = new Set<number>()
  for (const sp of speciesRaw as Json[]) {
    for (const variety of sp.varieties) {
      const pid = refId(variety.pokemon)!
      const p = pokemonRaw.get(pid)
      if (!p) continue
      const introducedInScope = p.forms.some((fr: Json) => {
        const vg = formVersionGroup.get(refId(fr)!)
        return vg ? vgNames.has(vg) : false
      })
      if (variety.is_default || introducedInScope) retainedPokemon.add(pid)
    }
  }
  log(
    `species: ${(speciesRaw as Json[]).length}  varieties retained: ${retainedPokemon.size} / ${candidatePokemonIds.length}`,
  )

  // -- Learnsets -----------------------------------------------------------
  // One row per (pokemon, move, version_group, method, level). pokemon_id is kept
  // alongside species_id so form-specific movesets (Deoxys, Rotom) are not
  // collapsed; every field the spec requires is present.
  type LearnRow = {
    species_id: number
    pokemon_id: number
    move_id: number
    version_group: string
    method: string
    level: number
    order: number | null
  }
  const learnsets: LearnRow[] = []
  const referencedMoveIds = new Set<number>()
  const pokemonToSpecies = new Map<number, number>()
  for (const sp of speciesRaw as Json[]) {
    for (const v of sp.varieties) pokemonToSpecies.set(refId(v.pokemon)!, sp.id)
  }
  for (const pid of sortedUnique(retainedPokemon)) {
    const p = pokemonRaw.get(pid)!
    const sid = pokemonToSpecies.get(pid)!
    for (const entry of p.moves) {
      const moveId = refId(entry.move)
      if (moveId == null) continue
      for (const d of entry.version_group_details) {
        const vg = refName(d.version_group)
        if (!vg || !vgNames.has(vg)) continue
        referencedMoveIds.add(moveId)
        learnsets.push({
          species_id: sid,
          pokemon_id: pid,
          move_id: moveId,
          version_group: vg,
          method: refName(d.move_learn_method)!,
          level: d.level_learned_at ?? 0,
          order: d.order ?? null,
        })
      }
    }
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  learnsets.sort(
    (a, b) =>
      a.species_id - b.species_id ||
      a.pokemon_id - b.pokemon_id ||
      a.move_id - b.move_id ||
      cmp(a.version_group, b.version_group) ||
      cmp(a.method, b.method) ||
      a.level - b.level,
  )
  log(`learnsets: ${learnsets.length} rows referencing ${referencedMoveIds.size} distinct moves`)

  // -- Evolution chains ----------------------------------------------------
  const chainIds = sortedUnique(
    (speciesRaw as Json[])
      .map((sp: Json) => refId(sp.evolution_chain))
      .filter((x): x is number => x != null),
  )
  const chainsRaw = new Map<number, Json>()
  await mapLimit(chainIds, 64, async (id) => {
    const c = await readEntity('evolution-chain', id)
    if (c) chainsRaw.set(id, c)
  })

  const evoItemIds = new Set<number>()
  const evoMoveIds = new Set<number>()
  const evoTypeIds = new Set<number>()
  const evoLocationIds = new Set<number>()
  let prunedChainNodes = 0
  let prunedEvoDetails = 0

  function normalizeEvoDetail(d: Json) {
    const item = refId(d.item)
    const heldItem = refId(d.held_item)
    const knownMove = refId(d.known_move)
    const usedMove = refId(d.used_move)
    const knownMoveType = refId(d.known_move_type)
    const partyType = refId(d.party_type)
    const partySpecies = refId(d.party_species)
    const tradeSpecies = refId(d.trade_species)
    const location = refId(d.location)
    if (item != null) evoItemIds.add(item)
    if (heldItem != null) evoItemIds.add(heldItem)
    if (knownMove != null) evoMoveIds.add(knownMove)
    if (usedMove != null) evoMoveIds.add(usedMove)
    if (knownMoveType != null) evoTypeIds.add(knownMoveType)
    if (partyType != null) evoTypeIds.add(partyType)
    if (location != null) evoLocationIds.add(location)
    return {
      trigger: refName(d.trigger),
      version_group: refName(d.version_group),
      item_id: item,
      held_item_id: heldItem,
      known_move_id: knownMove,
      used_move_id: usedMove,
      known_move_type_id: knownMoveType,
      party_type_id: partyType,
      // Cross-species requirements outside the dex range would dangle; drop them.
      party_species_id:
        partySpecies != null && partySpecies <= MAX_SPECIES_ID ? partySpecies : null,
      trade_species_id:
        tradeSpecies != null && tradeSpecies <= MAX_SPECIES_ID ? tradeSpecies : null,
      location_id: location,
      gender: d.gender ?? null,
      min_level: d.min_level ?? null,
      min_happiness: d.min_happiness ?? null,
      min_beauty: d.min_beauty ?? null,
      min_affection: d.min_affection ?? null,
      relative_physical_stats: d.relative_physical_stats ?? null,
      time_of_day: d.time_of_day || null,
      needs_overworld_rain: !!d.needs_overworld_rain,
      turn_upside_down: !!d.turn_upside_down,
    }
  }

  function pruneChainNode(node: Json, isRoot: boolean): Json | null {
    const sid = refId(node.species)
    if (sid == null || sid > MAX_SPECIES_ID) {
      prunedChainNodes++
      return null
    }
    const detailsInScope = (node.evolution_details as Json[]).filter((d) => {
      const vg = refName(d.version_group)
      return vg != null && vgNames.has(vg)
    })
    prunedEvoDetails += node.evolution_details.length - detailsInScope.length
    // A non-root node with no Gen 1-4 evolution method did not exist in Gen 1-4.
    if (!isRoot && detailsInScope.length === 0) {
      prunedChainNodes++
      return null
    }
    const children = (node.evolves_to as Json[])
      .map((c) => pruneChainNode(c, false))
      .filter((c): c is Json => c != null)
    return {
      species_id: sid,
      evolution_details: detailsInScope.map(normalizeEvoDetail),
      evolves_to: children,
    }
  }

  const evolutionChains: Record<number, Json> = {}
  for (const id of chainIds) {
    const raw = chainsRaw.get(id)
    if (!raw) continue
    const chain = pruneChainNode(raw.chain, true)
    if (!chain) continue
    const babyItem = refId(raw.baby_trigger_item)
    if (babyItem != null) evoItemIds.add(babyItem)
    evolutionChains[id] = { id, baby_trigger_item_id: babyItem, chain }
  }
  log(
    `evolution chains: ${Object.keys(evolutionChains).length} (pruned ${prunedChainNodes} out-of-scope nodes, ${prunedEvoDetails} out-of-scope details)`,
  )

  // -- Moves ---------------------------------------------------------------
  // Retained = referenced by a Gen 1-4 learnset or evolution requirement, UNION
  // every move that exists in Gen 1-4 (generation <= 4), so the Movedex is complete
  // rather than only covering moves something happens to learn.
  const allMoves = await readAll('move')
  const movesById = new Map<number, Json>(allMoves.map((m) => [m.id, m]))
  const retainedMoveIds = new Set<number>()
  let movesByGeneration = 0
  let movesByReferenceOnly = 0
  for (const m of allMoves) {
    const g = genId(m.generation) ?? 99
    const referenced = referencedMoveIds.has(m.id) || evoMoveIds.has(m.id)
    if (g <= MAX_GENERATION) {
      retainedMoveIds.add(m.id)
      movesByGeneration++
    } else if (referenced) {
      retainedMoveIds.add(m.id)
      movesByReferenceOnly++
    }
  }
  const moveTypeIds = new Set<number>()
  for (const id of retainedMoveIds) {
    const t = refId(movesById.get(id)!.type)
    if (t != null) moveTypeIds.add(t)
  }
  log(
    `moves: ${retainedMoveIds.size} retained (${movesByGeneration} generation<=4, ${movesByReferenceOnly} out-of-era but referenced)`,
  )

  // -- Types ---------------------------------------------------------------
  const allTypes = await readAll('type')
  const typeGeneration = new Map<number, number>()
  for (const t of allTypes) typeGeneration.set(t.id, genId(t.generation) ?? 99)

  const speciesTypeIds = new Set<number>()
  for (const pid of retainedPokemon) {
    const p = pokemonRaw.get(pid)!
    for (const t of p.types) {
      const id = refId(t.type)
      if (id != null) speciesTypeIds.add(id)
    }
    for (const past of p.past_types ?? []) {
      for (const t of past.types) {
        const id = refId(t.type)
        if (id != null) speciesTypeIds.add(id)
      }
    }
  }
  const retainedTypeIds = new Set<number>()
  for (const t of allTypes) {
    const g = typeGeneration.get(t.id)!
    // Gen 1-4 types, plus any type referenced by a retained species/move. The latter
    // pulls in Fairy: Clefairy et al. are Fairy in the current-gen data and dropping
    // it would dangle. Its generation_id (6) marks it as out-of-era.
    if (
      g <= MAX_GENERATION ||
      speciesTypeIds.has(t.id) ||
      moveTypeIds.has(t.id) ||
      evoTypeIds.has(t.id)
    ) {
      retainedTypeIds.add(t.id)
    }
  }

  function relationIds(source: Json, maxGen?: number): Record<string, number[]> {
    const out: Record<string, number[]> = {}
    for (const key of DAMAGE_RELATION_KEYS) {
      out[key] = sortedUnique(
        ((source && source[key]) ?? [])
          .map((r: NamedRef) => refId(r))
          .filter((id: number | null): id is number => id != null)
          .filter(
            (id: number) =>
              retainedTypeIds.has(id) &&
              (maxGen == null || (typeGeneration.get(id) ?? 99) <= maxGen),
          ),
      )
    }
    return out
  }

  /**
   * Damage relations as they stood in `gen`.
   *
   * past_damage_relations[].generation means "these relations applied up to and
   * including that generation", so pick the earliest past entry whose generation is
   * >= gen, else fall back to the current relations.
   *
   * The fallback alone is not enough: types with no past entry (Normal, Water, ...)
   * fall through to current relations, which mention Steel/Dark/Fairy. Every list is
   * therefore filtered to types that actually existed in `gen`.
   */
  function relationsForGeneration(type: Json, gen: number): Record<string, number[]> | null {
    if ((typeGeneration.get(type.id) ?? 99) > gen) return null
    const past = (type.past_damage_relations ?? [])
      .map((p: Json) => ({ gen: genId(p.generation) ?? 99, relations: p.damage_relations }))
      .filter((p: { gen: number }) => p.gen >= gen)
      .sort((a: { gen: number }, b: { gen: number }) => a.gen - b.gen)
    const source = past.length ? past[0].relations : type.damage_relations
    return relationIds(source, gen)
  }

  const types: Record<number, Json> = {}
  for (const t of allTypes) {
    if (!retainedTypeIds.has(t.id)) continue
    const byGen: Record<number, Json> = {}
    for (let g = 1; g <= MAX_GENERATION; g++) {
      const rel = relationsForGeneration(t, g)
      if (rel) byGen[g] = rel
    }
    types[t.id] = {
      id: t.id,
      name: t.name,
      display_name: english(t.names)?.name ?? t.name,
      generation_id: typeGeneration.get(t.id)!,
      move_damage_class: refName(t.move_damage_class),
      damage_relations: relationIds(t.damage_relations),
      past_damage_relations: (t.past_damage_relations ?? []).map((p: Json) => ({
        generation_id: genId(p.generation),
        damage_relations: relationIds(p.damage_relations),
      })),
      damage_relations_by_generation: byGen,
    }
  }
  const typesInEra = Object.values(types).filter(
    (t: Json) => t.generation_id <= MAX_GENERATION,
  ).length
  log(`types: ${Object.keys(types).length} retained (${typesInEra} in-era)`)

  // -- Abilities -----------------------------------------------------------
  const retainedAbilityIds = new Set<number>()
  for (const pid of retainedPokemon) {
    const p = pokemonRaw.get(pid)!
    for (const a of p.abilities) {
      const id = refId(a.ability)
      if (id != null) retainedAbilityIds.add(id)
    }
    for (const past of p.past_abilities ?? []) {
      for (const a of past.abilities) {
        // past_abilities carries ability: null to mean "this slot was empty then".
        const id = refId(a.ability)
        if (id != null) retainedAbilityIds.add(id)
      }
    }
  }
  const allAbilities = await readAll('ability')
  const abilities: Record<number, Json> = {}
  for (const a of allAbilities) {
    if (!retainedAbilityIds.has(a.id)) continue
    const eff = english(a.effect_entries)
    abilities[a.id] = {
      id: a.id,
      name: a.name,
      display_name: english(a.names)?.name ?? a.name,
      generation_id: genId(a.generation),
      is_main_series: !!a.is_main_series,
      effect: cleanText(eff?.effect),
      short_effect: cleanText(eff?.short_effect),
      effect_changes: (a.effect_changes ?? [])
        .map((c: Json) => ({
          version_group: refName(c.version_group),
          effect: cleanText(english(c.effect_entries)?.effect),
        }))
        .filter((c: Json) => c.version_group && vgNames.has(c.version_group)),
    }
  }
  const abilitiesInEra = Object.values(abilities).filter(
    (a: Json) => (a.generation_id ?? 99) <= MAX_GENERATION,
  ).length
  log(
    `abilities: ${Object.keys(abilities).length} referenced (${abilitiesInEra} in-era, ${Object.keys(abilities).length - abilitiesInEra} assigned to Gen 1-4 species only in later games)`,
  )

  // -- Egg groups ----------------------------------------------------------
  const retainedEggGroupIds = new Set<number>()
  for (const sp of speciesRaw as Json[]) {
    for (const eg of sp.egg_groups) {
      const id = refId(eg)
      if (id != null) retainedEggGroupIds.add(id)
    }
  }
  const allEggGroups = await readAll('egg-group')
  const eggGroups: Record<number, Json> = {}
  for (const eg of allEggGroups) {
    if (!retainedEggGroupIds.has(eg.id)) continue
    eggGroups[eg.id] = {
      id: eg.id,
      name: eg.name,
      display_name: english(eg.names)?.name ?? eg.name,
    }
  }
  log(`egg groups: ${Object.keys(eggGroups).length} referenced of ${allEggGroups.length}`)

  // -- Items ---------------------------------------------------------------
  const allItems = await readAll('item')

  const heldItemIds = new Set<number>()
  for (const pid of retainedPokemon) {
    const p = pokemonRaw.get(pid)!
    for (const h of p.held_items ?? []) {
      const inScope = (h.version_details ?? []).some((vd: Json) =>
        versionNames.has(refName(vd.version)!),
      )
      const id = refId(h.item)
      if (inScope && id != null) heldItemIds.add(id)
    }
  }

  // move.machines -> /machine/{id} -> item. Only Gen 1-4 version groups count.
  const machineRows = await readAll('machine')
  const machineById = new Map<number, Json>(machineRows.map((m) => [m.id, m]))
  const tmItemIds = new Set<number>()
  for (const id of retainedMoveIds) {
    for (const mref of movesById.get(id)!.machines ?? []) {
      const machine = machineById.get(refId(mref.machine)!)
      if (!machine) continue
      if (!vgNames.has(refName(machine.version_group)!)) continue
      const itemId = refId(machine.item)
      if (itemId != null) tmItemIds.add(itemId)
    }
  }

  const allBerries = await readAll('berry')

  const retainedItemIds = new Set<number>()
  for (const it of allItems) {
    const inEra = (it.game_indices ?? []).some(
      (gi: Json) => (genId(gi.generation) ?? 99) <= MAX_GENERATION,
    )
    if (inEra || heldItemIds.has(it.id) || tmItemIds.has(it.id) || evoItemIds.has(it.id)) {
      retainedItemIds.add(it.id)
    }
  }
  // Berries are only retained when their backing item is; keep the two consistent.
  const retainedBerries = allBerries.filter((b) => {
    const id = refId(b.item)
    return id != null && retainedItemIds.has(id)
  })

  const items: Record<number, Json> = {}
  for (const it of allItems) {
    if (!retainedItemIds.has(it.id)) continue
    const eff = english(it.effect_entries)
    items[it.id] = {
      id: it.id,
      name: it.name,
      display_name: english(it.names)?.name ?? it.name,
      category: refName(it.category),
      attributes: (it.attributes ?? []).map((a: NamedRef) => refName(a)).sort(),
      generation_ids: sortedUnique(
        (it.game_indices ?? [])
          .map((gi: Json) => genId(gi.generation))
          .filter((g: number | null): g is number => g != null),
      ),
      fling_power: it.fling_power ?? null,
      fling_effect: refName(it.fling_effect),
      effect: cleanText(eff?.effect),
      short_effect: cleanText(eff?.short_effect),
      prices: (it.prices ?? [])
        .filter((p: Json) => vgNames.has(refName(p.version_group)!))
        .map((p: Json) => ({
          version_group: refName(p.version_group),
          currency: refName(p.currency),
          purchase_price: p.purchase_price ?? null,
          sell_price: p.sell_price ?? null,
        })),
      machines: (it.machines ?? [])
        .map((mref: Json) => {
          const m = machineById.get(refId(mref.machine)!)
          return m
            ? { version_group: refName(m.version_group), move_id: refId(m.move) }
            : { version_group: null, move_id: null }
        })
        .filter(
          (m: Json) =>
            m.version_group &&
            vgNames.has(m.version_group) &&
            m.move_id != null &&
            retainedMoveIds.has(m.move_id),
        ),
      sprite: it.sprites?.default ?? null,
    }
  }
  log(`items: ${Object.keys(items).length} retained of ${allItems.length}`)

  // -- Berries -------------------------------------------------------------
  const berries: Record<number, Json> = {}
  for (const b of retainedBerries) {
    const ngType = refId(b.natural_gift_type)
    berries[b.id] = {
      id: b.id,
      name: b.name,
      item_id: refId(b.item),
      firmness: refName(b.firmness),
      natural_gift_power: b.natural_gift_power ?? null,
      natural_gift_type_id: ngType != null && retainedTypeIds.has(ngType) ? ngType : null,
      size: b.size ?? null,
      smoothness: b.smoothness ?? null,
      soil_dryness: b.soil_dryness ?? null,
      growth_time: b.growth_time ?? null,
      max_harvest: b.max_harvest ?? null,
      flavors: (b.flavors ?? []).map((fl: Json) => ({
        flavor: refName(fl.flavor),
        potency: fl.potency,
      })),
    }
  }
  log(`berries: ${Object.keys(berries).length} retained of ${allBerries.length}`)

  // -- Natures (all 25; introduced Gen 3, unchanged since) -----------------
  const allNatures = await readAll('nature')
  const natures: Record<number, Json> = {}
  for (const n of allNatures) {
    natures[n.id] = {
      id: n.id,
      name: n.name,
      display_name: english(n.names)?.name ?? n.name,
      increased_stat: refName(n.increased_stat),
      decreased_stat: refName(n.decreased_stat),
      likes_flavor: refName(n.likes_flavor),
      hates_flavor: refName(n.hates_flavor),
      pokeathlon_stat_changes: (n.pokeathlon_stat_changes ?? []).map((c: Json) => ({
        pokeathlon_stat: refName(c.pokeathlon_stat),
        max_change: c.max_change,
      })),
      move_battle_style_preferences: (n.move_battle_style_preferences ?? []).map((p: Json) => ({
        move_battle_style: refName(p.move_battle_style),
        low_hp_preference: p.low_hp_preference,
        high_hp_preference: p.high_hp_preference,
      })),
    }
  }
  log(`natures: ${Object.keys(natures).length}`)

  // -- Moves output --------------------------------------------------------
  const moves: Record<number, Json> = {}
  for (const id of sortedUnique(retainedMoveIds)) {
    const m = movesById.get(id)!
    const eff = english(m.effect_entries)
    moves[id] = {
      id: m.id,
      name: m.name,
      display_name: english(m.names)?.name ?? m.name,
      generation_id: genId(m.generation),
      type_id: refId(m.type),
      damage_class: refName(m.damage_class),
      power: m.power ?? null,
      pp: m.pp ?? null,
      accuracy: m.accuracy ?? null,
      priority: m.priority ?? 0,
      target: refName(m.target),
      effect_chance: m.effect_chance ?? null,
      effect: cleanText(eff?.effect),
      short_effect: cleanText(eff?.short_effect),
      meta: m.meta
        ? {
            ailment: refName(m.meta.ailment),
            ailment_chance: m.meta.ailment_chance ?? 0,
            category: refName(m.meta.category),
            crit_rate: m.meta.crit_rate ?? 0,
            drain: m.meta.drain ?? 0,
            flinch_chance: m.meta.flinch_chance ?? 0,
            healing: m.meta.healing ?? 0,
            max_hits: m.meta.max_hits ?? null,
            max_turns: m.meta.max_turns ?? null,
            min_hits: m.meta.min_hits ?? null,
            min_turns: m.meta.min_turns ?? null,
            stat_chance: m.meta.stat_chance ?? 0,
          }
        : null,
      stat_changes: (m.stat_changes ?? []).map((s: Json) => ({
        stat: refName(s.stat),
        change: s.change,
      })),
      contest_type: refName(m.contest_type),
      // Historical stat lines kept verbatim. PokeAPI keys each entry by a version
      // group; no resolution rule is inferred here.
      past_values: (m.past_values ?? []).map((p: Json) => {
        const t = refId(p.type)
        return {
          version_group: refName(p.version_group),
          power: p.power ?? null,
          pp: p.pp ?? null,
          accuracy: p.accuracy ?? null,
          effect_chance: p.effect_chance ?? null,
          type_id: t != null && retainedTypeIds.has(t) ? t : null,
        }
      }),
      machines: (m.machines ?? [])
        .map((mref: Json) => {
          const mach = machineById.get(refId(mref.machine)!)
          return mach
            ? { version_group: refName(mach.version_group), item_id: refId(mach.item) }
            : { version_group: null, item_id: null }
        })
        .filter(
          (x: Json) =>
            x.version_group &&
            vgNames.has(x.version_group) &&
            x.item_id != null &&
            retainedItemIds.has(x.item_id),
        ),
    }
  }

  // -- Encounters ----------------------------------------------------------
  const allLocationAreas = await readAll('location-area')
  const areaToLocation = new Map<number, number>()
  for (const la of allLocationAreas) {
    const loc = refId(la.location)
    if (loc != null) areaToLocation.set(la.id, loc)
  }
  const allLocations = await readAll('location')
  const locationsById = new Map<number, Json>(allLocations.map((l) => [l.id, l]))

  type EncounterRow = {
    species_id: number
    pokemon_id: number
    location_id: number
    location_area_id: number
    version: string
    method: string
    chance: number
    level_min: number
    level_max: number
    conditions: string[]
  }
  const encounters: EncounterRow[] = []
  const usedAreaIds = new Set<number>()
  const usedLocationIds = new Set<number>()

  await mapLimit(sortedUnique(retainedPokemon), 48, async (pid) => {
    let rows: Json
    try {
      rows = JSON.parse(
        await readFile(join(V2(), 'pokemon', String(pid), 'encounters', 'index.json'), 'utf8'),
      )
    } catch {
      return
    }
    const sid = pokemonToSpecies.get(pid)!
    for (const entry of rows) {
      const areaId = refId(entry.location_area)
      if (areaId == null) continue
      const locId = areaToLocation.get(areaId)
      if (locId == null) continue
      for (const vd of entry.version_details) {
        const version = refName(vd.version)
        if (!version || !versionNames.has(version)) continue
        for (const det of vd.encounter_details) {
          usedAreaIds.add(areaId)
          usedLocationIds.add(locId)
          encounters.push({
            species_id: sid,
            pokemon_id: pid,
            location_id: locId,
            location_area_id: areaId,
            version,
            method: refName(det.method)!,
            chance: det.chance ?? 0,
            level_min: det.min_level ?? 0,
            level_max: det.max_level ?? 0,
            conditions: (det.condition_values ?? []).map((c: NamedRef) => refName(c)!).sort(),
          })
        }
      }
    }
  })
  encounters.sort(
    (a, b) =>
      a.species_id - b.species_id ||
      a.pokemon_id - b.pokemon_id ||
      a.location_id - b.location_id ||
      a.location_area_id - b.location_area_id ||
      cmp(a.version, b.version) ||
      cmp(a.method, b.method) ||
      a.level_min - b.level_min ||
      a.level_max - b.level_max ||
      cmp(a.conditions.join(), b.conditions.join()),
  )

  // Evolution details can require a location too (Leafeon's mossy rock, ...).
  for (const locId of evoLocationIds) {
    if (locationsById.has(locId)) usedLocationIds.add(locId)
  }

  const locationAreas: Record<number, Json> = {}
  for (const la of allLocationAreas) {
    if (!usedAreaIds.has(la.id)) continue
    locationAreas[la.id] = {
      id: la.id,
      name: la.name,
      display_name: english(la.names)?.name ?? la.name,
      location_id: areaToLocation.get(la.id)!,
    }
  }
  const locations: Record<number, Json> = {}
  for (const id of sortedUnique(usedLocationIds)) {
    const l = locationsById.get(id)
    if (!l) continue
    locations[id] = {
      id: l.id,
      name: l.name,
      display_name: english(l.names)?.name ?? l.name,
      region: refName(l.region),
      area_ids: sortedUnique(
        (l.areas ?? [])
          .map((a: NamedRef) => refId(a))
          .filter((x: number | null): x is number => x != null && usedAreaIds.has(x)),
      ),
    }
  }
  log(
    `encounters: ${encounters.length} rows across ${Object.keys(locations).length} locations / ${Object.keys(locationAreas).length} areas`,
  )

  // -- Species output ------------------------------------------------------
  const species: Record<number, Json> = {}
  for (const sp of speciesRaw as Json[]) {
    const varieties = sp.varieties
      .filter((v: Json) => retainedPokemon.has(refId(v.pokemon)!))
      .map((v: Json) => {
        const p = pokemonRaw.get(refId(v.pokemon)!)!
        return {
          pokemon_id: p.id,
          name: p.name,
          is_default: !!v.is_default,
          form_version_groups: sortedUnique(
            p.forms
              .map((fr: Json) => refId(fr))
              .filter((x: number | null): x is number => x != null),
          ).map((fid) => formVersionGroup.get(fid) ?? null),
          height: p.height ?? null,
          weight: p.weight ?? null,
          base_experience: p.base_experience ?? null,
          types: p.types
            .map((t: Json) => ({ slot: t.slot, type_id: refId(t.type) }))
            .filter((t: Json) => t.type_id != null && retainedTypeIds.has(t.type_id)),
          // Current-gen typing is wrong for the Gen 1-4 era (Clefairy is Fairy now,
          // Normal then). past_types records the old typing, keyed by the last
          // generation it applied to.
          past_types: (p.past_types ?? []).map((pt: Json) => ({
            generation_id: genId(pt.generation),
            types: pt.types
              .map((t: Json) => ({ slot: t.slot, type_id: refId(t.type) }))
              .filter((t: Json) => t.type_id != null && retainedTypeIds.has(t.type_id)),
          })),
          abilities: p.abilities
            .map((a: Json) => ({
              ability_id: refId(a.ability),
              is_hidden: !!a.is_hidden,
              slot: a.slot,
            }))
            .filter((a: Json) => a.ability_id != null && retainedAbilityIds.has(a.ability_id)),
          past_abilities: (p.past_abilities ?? []).map((pa: Json) => ({
            generation_id: genId(pa.generation),
            abilities: pa.abilities.map((a: Json) => ({
              // A null ability_id is meaningful: the slot was empty that generation.
              ability_id: refId(a.ability),
              is_hidden: !!a.is_hidden,
              slot: a.slot,
            })),
          })),
          stats: p.stats.map((s: Json) => ({
            stat: refName(s.stat),
            base_stat: s.base_stat,
            effort: s.effort ?? 0,
          })),
          // Gen 1 had a single combined Special stat; Gen 1-4 stat calcs need this.
          past_stats: (p.past_stats ?? []).map((ps: Json) => ({
            generation_id: genId(ps.generation),
            stats: ps.stats.map((s: Json) => ({
              stat: refName(s.stat),
              base_stat: s.base_stat,
              effort: s.effort ?? 0,
            })),
          })),
          held_items: (p.held_items ?? [])
            .map((h: Json) => ({
              item_id: refId(h.item),
              versions: (h.version_details ?? [])
                .filter((vd: Json) => versionNames.has(refName(vd.version)!))
                .map((vd: Json) => ({ version: refName(vd.version), rarity: vd.rarity })),
            }))
            .filter(
              (h: Json) =>
                h.item_id != null && retainedItemIds.has(h.item_id) && h.versions.length > 0,
            ),
          sprites: {
            front_default: p.sprites?.front_default ?? null,
            front_shiny: p.sprites?.front_shiny ?? null,
            official_artwork: p.sprites?.other?.['official-artwork']?.front_default ?? null,
          },
        }
      })

    const evolvesFrom = refId(sp.evolves_from_species)
    const chainId = refId(sp.evolution_chain)
    species[sp.id] = {
      id: sp.id,
      name: sp.name,
      display_name: english(sp.names)?.name ?? sp.name,
      genus: english(sp.genera)?.genus ?? null,
      generation_id: genId(sp.generation),
      order: sp.order ?? null,
      gender_rate: sp.gender_rate ?? null,
      capture_rate: sp.capture_rate ?? null,
      base_happiness: sp.base_happiness ?? null,
      hatch_counter: sp.hatch_counter ?? null,
      growth_rate: refName(sp.growth_rate),
      color: refName(sp.color),
      shape: refName(sp.shape),
      habitat: refName(sp.habitat),
      is_baby: !!sp.is_baby,
      is_legendary: !!sp.is_legendary,
      is_mythical: !!sp.is_mythical,
      has_gender_differences: !!sp.has_gender_differences,
      forms_switchable: !!sp.forms_switchable,
      egg_group_ids: sortedUnique(
        sp.egg_groups
          .map((eg: NamedRef) => refId(eg))
          .filter((x: number | null): x is number => x != null),
      ),
      evolution_chain_id: chainId != null && evolutionChains[chainId] ? chainId : null,
      evolves_from_species_id:
        evolvesFrom != null && evolvesFrom <= MAX_SPECIES_ID ? evolvesFrom : null,
      pokedex_numbers: Object.fromEntries(
        (sp.pokedex_numbers ?? []).map((pn: Json) => [refName(pn.pokedex), pn.entry_number]),
      ),
      flavor_text: Object.fromEntries(
        (sp.flavor_text_entries ?? [])
          .filter(
            (fe: Json) => refName(fe.language) === 'en' && versionNames.has(refName(fe.version)!),
          )
          .map((fe: Json) => [refName(fe.version), cleanText(fe.flavor_text)]),
      ),
      varieties,
    }
  }

  // -- Version groups (reference data for interpreting learnset rows) ------
  const versionGroups: Record<number, Json> = {}
  for (const vg of gen14VersionGroups) {
    versionGroups[vg.id] = {
      id: vg.id,
      name: vg.name,
      generation_id: genId(vg.generation),
      order: vg.order ?? null,
      versions: vg.versions.map((v: NamedRef) => refName(v)),
    }
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  const registries: Record<string, Set<number>> = {
    species: new Set(Object.keys(species).map(Number)),
    pokemon: new Set(
      (Object.values(species) as Json[]).flatMap((s: Json) =>
        s.varieties.map((v: Json) => v.pokemon_id),
      ),
    ),
    moves: new Set(Object.keys(moves).map(Number)),
    items: new Set(Object.keys(items).map(Number)),
    abilities: new Set(Object.keys(abilities).map(Number)),
    types: new Set(Object.keys(types).map(Number)),
    eggGroups: new Set(Object.keys(eggGroups).map(Number)),
    berries: new Set(Object.keys(berries).map(Number)),
    natures: new Set(Object.keys(natures).map(Number)),
    chains: new Set(Object.keys(evolutionChains).map(Number)),
    locations: new Set(Object.keys(locations).map(Number)),
    locationAreas: new Set(Object.keys(locationAreas).map(Number)),
  }

  /** Map a key name to the registry its value must resolve in. Order matters. */
  function registryForKey(key: string): string | null {
    const k = key.replace(/_ids$/, '_id')
    if (k.endsWith('location_area_id')) return 'locationAreas'
    if (k.endsWith('location_id')) return 'locations'
    if (k.endsWith('type_id')) return 'types'
    if (k.endsWith('move_id')) return 'moves'
    if (k.endsWith('item_id')) return 'items'
    if (k.endsWith('ability_id')) return 'abilities'
    if (k.endsWith('egg_group_id')) return 'eggGroups'
    if (k.endsWith('species_id')) return 'species'
    if (k.endsWith('pokemon_id')) return 'pokemon'
    if (k.endsWith('chain_id')) return 'chains'
    if (k.endsWith('berry_id')) return 'berries'
    if (k.endsWith('nature_id')) return 'natures'
    return null
  }

  const dangling: string[] = []
  const refsByRegistry: Record<string, number> = {}
  let refsChecked = 0

  function scan(node: Json, path: string) {
    if (node == null) return
    if (Array.isArray(node)) {
      node.forEach((v, i) => scan(v, `${path}[${i}]`))
      return
    }
    if (typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      const p = `${path}.${key}`
      const reg = registryForKey(key)
      if (reg && (typeof value === 'number' || Array.isArray(value))) {
        const ids =
          typeof value === 'number'
            ? [value]
            : (value as unknown[]).filter((v): v is number => typeof v === 'number')
        for (const id of ids) {
          refsChecked++
          refsByRegistry[reg] = (refsByRegistry[reg] ?? 0) + 1
          if (!registries[reg].has(id)) dangling.push(`${p} -> ${reg}#${id}`)
        }
        if (typeof value === 'number') continue
      }
      scan(value, p)
    }
  }

  const outputs: Record<string, Json> = {
    'species.json': species,
    'moves.json': moves,
    'items.json': items,
    'abilities.json': abilities,
    'natures.json': natures,
    'berries.json': berries,
    'types.json': types,
    'egg-groups.json': eggGroups,
    'evolution-chains.json': evolutionChains,
    'learnsets.json': learnsets,
    'encounters.json': encounters,
    'locations.json': { locations, areas: locationAreas },
    'version-groups.json': versionGroups,
  }
  for (const [file, payload] of Object.entries(outputs)) scan(payload, file)

  const problems: string[] = []

  // Species-count assertions the spec calls out explicitly.
  const speciesKeys = Object.keys(species).map(Number)
  if (speciesKeys.length !== MAX_SPECIES_ID) {
    problems.push(`species count is ${speciesKeys.length}, expected ${MAX_SPECIES_ID}`)
  }
  const overMax = speciesKeys.filter((id) => id > MAX_SPECIES_ID)
  if (overMax.length) problems.push(`species ids over ${MAX_SPECIES_ID}: ${overMax.join(', ')}`)
  const missing = speciesIds.filter((id) => !species[id])
  if (missing.length) problems.push(`missing species ids: ${missing.slice(0, 20).join(', ')}`)

  // Gen 1 must not know about Dark or Steel.
  const DARK = 17
  const STEEL = 9
  for (const t of Object.values(types) as Json[]) {
    const g1 = t.damage_relations_by_generation?.['1']
    if ((t.id === DARK || t.id === STEEL) && g1) {
      problems.push(
        `type ${t.name} has a generation-1 relation block but was introduced in gen ${t.generation_id}`,
      )
    }
    if (!g1) continue
    for (const key of DAMAGE_RELATION_KEYS) {
      for (const id of g1[key] ?? []) {
        if (id === DARK || id === STEEL) {
          problems.push(`type ${t.name}.gen1.${key} references ${id === DARK ? 'dark' : 'steel'}`)
        }
      }
    }
  }

  // Rows must stay inside the declared scope.
  for (const row of learnsets) {
    if (!vgNames.has(row.version_group)) {
      problems.push(`learnset row has out-of-scope version group ${row.version_group}`)
      break
    }
  }
  for (const row of encounters) {
    if (!versionNames.has(row.version)) {
      problems.push(`encounter row has out-of-scope version ${row.version}`)
      break
    }
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------
  await mkdir(OUT_DIR, { recursive: true })
  const sizes: Record<string, number> = {}
  for (const [file, payload] of Object.entries(outputs)) {
    const text = stableStringify(payload) + '\n'
    await writeFile(join(OUT_DIR, file), text)
    sizes[file] = Buffer.byteLength(text)
  }

  const counts = {
    species: Object.keys(species).length,
    pokemon_varieties: registries.pokemon.size,
    moves: Object.keys(moves).length,
    items: Object.keys(items).length,
    abilities: Object.keys(abilities).length,
    natures: Object.keys(natures).length,
    berries: Object.keys(berries).length,
    types: Object.keys(types).length,
    types_in_era: typesInEra,
    egg_groups: Object.keys(eggGroups).length,
    evolution_chains: Object.keys(evolutionChains).length,
    learnset_rows: learnsets.length,
    encounter_rows: encounters.length,
    locations: Object.keys(locations).length,
    location_areas: Object.keys(locationAreas).length,
    version_groups: Object.keys(versionGroups).length,
  }

  const meta = {
    generated_by: 'scripts/build-data.ts',
    source: { repo: 'PokeAPI/api-data', url: SNAPSHOT_URL, tarball_sha256: tarballSha256 },
    scope: {
      max_species_id: MAX_SPECIES_ID,
      max_generation: MAX_GENERATION,
      version_groups: [...vgNames].sort(),
      versions: [...versionNames].sort(),
    },
    counts,
    file_bytes: sizes,
    validation: { references_checked: refsChecked, dangling_references: dangling.length },
    notes: [
      'Normalized: entities reference each other by id; nothing is embedded.',
      'Reverse indices (learned_by_pokemon, type.pokemon, ability.pokemon, egg_group.pokemon_species) are intentionally omitted as derivable.',
      'types.damage_relations_by_generation resolves past_damage_relations for gens 1-4 and filters each list to types that existed in that generation.',
      'species.varieties[].past_types / past_abilities / past_stats preserve Gen 1-4 accuracy where current-gen data differs.',
      'moves.past_values are kept verbatim; no resolution rule is inferred.',
      'learnsets carry pokemon_id alongside species_id so form-specific movesets are not collapsed.',
      'Fairy (type 18) is retained because current-gen species data references it; generation_id marks it out-of-era and it never appears in gen 1-4 relation blocks.',
    ],
  }
  const metaText = stableStringify(meta) + '\n'
  await writeFile(join(OUT_DIR, 'meta.json'), metaText)
  sizes['meta.json'] = Buffer.byteLength(metaText)

  // -----------------------------------------------------------------------
  // Report
  // -----------------------------------------------------------------------
  log('')
  log('=== counts ===')
  for (const [k, v] of Object.entries(counts)) log(`  ${k.padEnd(20)} ${v}`)
  log('')
  log('=== output files ===')
  let total = 0
  for (const [f, b] of Object.entries(sizes).sort()) {
    total += b
    log(`  ${f.padEnd(24)} ${(b / 1024).toFixed(1).padStart(10)} KiB`)
  }
  log(`  ${'TOTAL'.padEnd(24)} ${(total / 1024 / 1024).toFixed(2).padStart(10)} MiB`)
  log('')
  log('=== validation ===')
  log(`  references checked   ${refsChecked}`)
  for (const [reg, n] of Object.entries(refsByRegistry).sort()) {
    log(`    ${reg.padEnd(16)} ${n}`)
  }
  log(`  dangling references  ${dangling.length}`)
  if (dangling.length) {
    for (const d of dangling.slice(0, 40)) log(`    ${d}`)
    if (dangling.length > 40) log(`    ... and ${dangling.length - 40} more`)
  }
  for (const p of problems) log(`  PROBLEM: ${p}`)
  log(`  elapsed              ${((Date.now() - started) / 1000).toFixed(1)}s`)

  if (dangling.length || problems.length) {
    log('')
    log('BUILD FAILED: validation errors above')
    process.exit(1)
  }
  log('')
  log('BUILD OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
