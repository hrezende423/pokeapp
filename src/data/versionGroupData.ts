/**
 * On-demand loader for the per-version-group partitions.
 *
 * learnsets and encounters are ~34 MiB raw across all fourteen groups, so they are
 * never precached. Each file is fetched the first time it is asked for, indexed by
 * species, and kept in memory. The service worker's CacheFirst rule keeps it
 * available offline after that first fetch.
 *
 * Paths come from version-groups.json rather than being built by string
 * concatenation, so the build stays the single source of truth for the layout.
 *
 * THE TWO PARTITIONS LOAD AND CACHE INDEPENDENTLY. They used to be fetched as one
 * `Promise.all` and cached only on joint success, which meant a transient failure
 * on either file discarded the other one's rows even though they had arrived
 * intact -- and, because nothing was cached, re-downloaded both (4.2 MiB + 2.8 MiB
 * for heartgold-soulsilver) on the next attempt, making a throttling server more
 * likely to fail again. Learnsets and encounters are unrelated datasets shown in
 * separate cards; neither has any business breaking the other.
 */

import { dataUrl, getVersionGroupByName, listVersionGroups } from './loader'
import type { EncounterRow, LearnRow } from './types'

export interface PartitionLoadStats {
  versionGroup: string
  ms: number
  bytes: number
}

export interface VersionGroupLoadStats {
  versionGroup: string
  ms: number
  bytes: number
  learnsetBytes: number
  encounterBytes: number
}

export interface VersionGroupData {
  versionGroup: string
  learnsets: LearnRow[]
  encounters: EncounterRow[]
  learnsetsBySpecies: Map<number, LearnRow[]>
  encountersBySpecies: Map<number, EncounterRow[]>
  stats: VersionGroupLoadStats
}

/** One loaded partition file, indexed by species. */
interface Partition<T> {
  rows: T[]
  bySpecies: Map<number, T[]>
  stats: PartitionLoadStats
}

type PartitionKind = 'learnsets' | 'encounters'

interface Store<T> {
  /** Files already loaded and indexed, keyed by version group. */
  cache: Map<string, Partition<T>>
  /**
   * In-flight loads, keyed by version group. Without this, two components mounting
   * at once and asking for the same file would each fire their own fetch.
   */
  inflight: Map<string, Promise<Partition<T>>>
}

const learnsetStore: Store<LearnRow> = { cache: new Map(), inflight: new Map() }
const encounterStore: Store<EncounterRow> = { cache: new Map(), inflight: new Map() }

async function fetchRows<T>(path: string): Promise<{ rows: T[]; bytes: number }> {
  const url = dataUrl(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
  const text = await res.text()
  return { rows: JSON.parse(text) as T[], bytes: new TextEncoder().encode(text).length }
}

function groupBySpecies<T extends { species_id: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const row of rows) {
    const existing = map.get(row.species_id)
    if (existing) existing.push(row)
    else map.set(row.species_id, [row])
  }
  return map
}

function pathFor(vgName: string, kind: PartitionKind): string {
  const vg = getVersionGroupByName(vgName)
  if (!vg) {
    throw new Error(
      `unknown version group "${vgName}" — known: ${listVersionGroups()
        .map((v) => v.name)
        .join(', ')}`,
    )
  }
  return kind === 'learnsets' ? vg.learnsets_path : vg.encounters_path
}

/**
 * Load one partition file, or return it from memory.
 *
 * A rejection is never cached: the inflight slot is cleared either way, so a retry
 * after a transient failure re-attempts the fetch rather than replaying the error
 * forever.
 */
function loadPartition<T extends { species_id: number }>(
  store: Store<T>,
  kind: PartitionKind,
  versionGroup: string,
): Promise<Partition<T>> {
  const cached = store.cache.get(versionGroup)
  if (cached) return Promise.resolve(cached)

  const pending = store.inflight.get(versionGroup)
  if (pending) return pending

  let path: string
  try {
    path = pathFor(versionGroup, kind)
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)))
  }

  const promise = (async () => {
    const started = performance.now()
    const { rows, bytes } = await fetchRows<T>(path)
    const partition: Partition<T> = {
      rows,
      bySpecies: groupBySpecies(rows),
      stats: { versionGroup, ms: performance.now() - started, bytes },
    }
    store.cache.set(versionGroup, partition)
    return partition
  })()

  store.inflight.set(versionGroup, promise)
  void promise.finally(() => store.inflight.delete(versionGroup))
  return promise
}

/** Load just the learnset partition for a version group. */
export const loadLearnsets = (versionGroup: string) =>
  loadPartition(learnsetStore, 'learnsets', versionGroup)

/** Load just the encounter partition for a version group. */
export const loadEncounters = (versionGroup: string) =>
  loadPartition(encounterStore, 'encounters', versionGroup)

/**
 * Load both of a version group's partitions.
 *
 * Still rejects if either file fails -- a caller asking for both is asking for
 * both -- but the half that succeeded is cached regardless, so a retry only
 * re-fetches the file that actually failed.
 */
export async function loadVersionGroupData(versionGroup: string): Promise<VersionGroupData> {
  const [learn, enc] = await Promise.all([
    loadLearnsets(versionGroup),
    loadEncounters(versionGroup),
  ])
  return {
    versionGroup,
    learnsets: learn.rows,
    encounters: enc.rows,
    learnsetsBySpecies: learn.bySpecies,
    encountersBySpecies: enc.bySpecies,
    stats: {
      versionGroup,
      ms: Math.max(learn.stats.ms, enc.stats.ms),
      bytes: learn.stats.bytes + enc.stats.bytes,
      learnsetBytes: learn.stats.bytes,
      encounterBytes: enc.stats.bytes,
    },
  }
}

/** True when BOTH of this group's partitions are in memory. */
export const isVersionGroupLoaded = (versionGroup: string): boolean =>
  learnsetStore.cache.has(versionGroup) && encounterStore.cache.has(versionGroup)

/** Groups with both partitions held in memory. */
export const loadedVersionGroups = (): string[] =>
  [...learnsetStore.cache.keys()].filter((vg) => encounterStore.cache.has(vg))

export const getVersionGroupStats = (versionGroup: string): VersionGroupLoadStats | undefined => {
  const learn = learnsetStore.cache.get(versionGroup)
  const enc = encounterStore.cache.get(versionGroup)
  if (!learn || !enc) return undefined
  return {
    versionGroup,
    ms: Math.max(learn.stats.ms, enc.stats.ms),
    bytes: learn.stats.bytes + enc.stats.bytes,
    learnsetBytes: learn.stats.bytes,
    encounterBytes: enc.stats.bytes,
  }
}

/**
 * Learnset rows for one species in one version group, loading the file if needed.
 *
 * Rows are per (pokemon, move, method, level): a species with several forms
 * contributes rows for each, distinguished by `pokemon_id`. Depends on the learnset
 * file only -- an encounters failure cannot empty this.
 */
export async function getLearnsetsForSpecies(
  speciesId: number,
  versionGroup: string,
): Promise<LearnRow[]> {
  const partition = await loadLearnsets(versionGroup)
  return partition.bySpecies.get(speciesId) ?? []
}

/** Encounter rows for one species in one version group, loading the file if needed. */
export async function getEncountersForSpecies(
  speciesId: number,
  versionGroup: string,
): Promise<EncounterRow[]> {
  const partition = await loadEncounters(versionGroup)
  return partition.bySpecies.get(speciesId) ?? []
}

/** Synchronous read for callers that have already awaited the group. */
export function peekLearnsetsForSpecies(
  speciesId: number,
  versionGroup: string,
): LearnRow[] | undefined {
  return learnsetStore.cache.get(versionGroup)?.bySpecies.get(speciesId)
}

/** Every learnset row for one version group, loading the file if needed. */
export async function learnsetRowsForVersionGroup(versionGroup: string): Promise<LearnRow[]> {
  return (await loadLearnsets(versionGroup)).rows
}

/**
 * Load every version group's learnset partition.
 *
 * Only the Movedex's "All" reverse lookup needs this, and it is expensive: 14
 * files, 23.5 MiB raw / ~906 KiB gzipped, 202,707 rows. It is therefore never
 * called eagerly -- a caller asks for it when a move detail is opened under an
 * "All" selection, and every partition already in memory is reused, so switching
 * between moves costs nothing after the first.
 *
 * Partitions that fail are reported rather than silently dropped, so a partial
 * answer is never presented as complete.
 */
export async function loadAllLearnsets(): Promise<{
  partitions: { versionGroup: string; rows: LearnRow[] }[]
  failed: string[]
}> {
  const groups = listVersionGroups().map((v) => v.name)
  const settled = await Promise.allSettled(
    groups.map(async (vg) => ({ versionGroup: vg, rows: (await loadLearnsets(vg)).rows })),
  )
  const partitions: { versionGroup: string; rows: LearnRow[] }[] = []
  const failed: string[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') partitions.push(r.value)
    else failed.push(groups[i])
  })
  return { partitions, failed }
}

/**
 * Every game's encounter rows for one species, in chronological game order.
 *
 * THE COUNTERPART TO loadAllLearnsets, and the same warning applies with
 * different numbers: 14 files, 9.6 MiB raw / ~287 KiB gzipped, and once parsed the
 * rows stay indexed in memory for the rest of the session.
 *
 * WHO CALLS IT: the species page's Locations section, which is game-agnostic --
 * every game's locations in one table. It is called when that section is scrolled
 * to and never on page open, which is what keeps the cost off the default tab.
 * Every partition already in memory is reused, so the second species is free.
 *
 * THE ORDER IS LOAD-BEARING rather than incidental: it is the table's default
 * sort, and it comes from listVersionGroups (generation, then the bundle's own
 * `order`), so Red/Blue's rows precede Yellow's precede Gold/Silver's without the
 * component knowing anything about release dates. Promise.allSettled resolves in
 * argument order regardless of which file arrives first, so the sequence survives
 * the parallel fetch.
 *
 * PARTITIONS THAT FAIL ARE REPORTED rather than silently dropped: a table missing
 * three games' rows must not read as "this species is not in those games". If ALL
 * of them fail it THROWS instead, because zero rows and zero games loaded is an
 * error state and not an empty result -- the same distinction LoadState draws
 * between `error` and a `ready` empty array.
 */
export async function getEncountersForSpeciesAllGames(
  speciesId: number,
): Promise<{ rows: EncounterRow[]; failed: string[] }> {
  const groups = listVersionGroups().map((v) => v.name)
  const settled = await Promise.allSettled(groups.map((vg) => loadEncounters(vg)))
  const rows: EncounterRow[] = []
  const failed: string[] = []
  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      failed.push(groups[i])
      return
    }
    rows.push(...(result.value.bySpecies.get(speciesId) ?? []))
  })
  if (failed.length === groups.length) {
    throw new Error(`no encounter partition could be loaded (${failed.length} files failed)`)
  }
  return { rows, failed }
}

/** True when every version group's learnset partition is already in memory. */
export const areAllLearnsetsLoaded = (): boolean =>
  listVersionGroups().every((v) => learnsetStore.cache.has(v.name))

/** Test seam: forget every cached partition. */
export function __resetVersionGroupCache(): void {
  learnsetStore.cache.clear()
  learnsetStore.inflight.clear()
  encounterStore.cache.clear()
  encounterStore.inflight.clear()
}
