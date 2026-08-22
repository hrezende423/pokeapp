/**
 * On-demand loader for the per-version-group partitions.
 *
 * learnsets and encounters are ~34 MiB raw across all fourteen groups, so they are
 * never precached. Each group's two files are fetched the first time that group is
 * asked for, indexed by species, and kept in memory. The service worker's
 * CacheFirst rule keeps them available offline after that first fetch.
 *
 * Paths come from version-groups.json rather than being built by string
 * concatenation, so the build stays the single source of truth for the layout.
 */

import { dataUrl, getVersionGroupByName, listVersionGroups } from './loader'
import type { EncounterRow, LearnRow } from './types'

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

/** Groups already loaded and indexed. */
const cache = new Map<string, VersionGroupData>()
/**
 * In-flight loads, keyed by group. Without this, two components mounting at once
 * and asking for the same group would each fire their own pair of fetches.
 */
const inflight = new Map<string, Promise<VersionGroupData>>()

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

/**
 * Load one version group's learnset and encounter partitions.
 *
 * Resolves immediately from memory on repeat calls — exactly two network requests
 * per group for the lifetime of the page.
 */
export function loadVersionGroupData(versionGroup: string): Promise<VersionGroupData> {
  const cached = cache.get(versionGroup)
  if (cached) return Promise.resolve(cached)

  const pending = inflight.get(versionGroup)
  if (pending) return pending

  const vg = getVersionGroupByName(versionGroup)
  if (!vg) {
    return Promise.reject(
      new Error(
        `unknown version group "${versionGroup}" — known: ${listVersionGroups()
          .map((v) => v.name)
          .join(', ')}`,
      ),
    )
  }

  const promise = (async () => {
    const started = performance.now()
    const [learn, enc] = await Promise.all([
      fetchRows<LearnRow>(vg.learnsets_path),
      fetchRows<EncounterRow>(vg.encounters_path),
    ])
    const data: VersionGroupData = {
      versionGroup,
      learnsets: learn.rows,
      encounters: enc.rows,
      learnsetsBySpecies: groupBySpecies(learn.rows),
      encountersBySpecies: groupBySpecies(enc.rows),
      stats: {
        versionGroup,
        ms: performance.now() - started,
        bytes: learn.bytes + enc.bytes,
        learnsetBytes: learn.bytes,
        encounterBytes: enc.bytes,
      },
    }
    cache.set(versionGroup, data)
    return data
  })()

  inflight.set(versionGroup, promise)
  // Clear the slot either way: a rejection must not be cached as permanent, and a
  // success is served from `cache` from then on.
  void promise.finally(() => inflight.delete(versionGroup))
  return promise
}

/** True when this group's partitions are already in memory. */
export const isVersionGroupLoaded = (versionGroup: string): boolean => cache.has(versionGroup)

/** Groups currently held in memory. */
export const loadedVersionGroups = (): string[] => [...cache.keys()]

export const getVersionGroupStats = (versionGroup: string): VersionGroupLoadStats | undefined =>
  cache.get(versionGroup)?.stats

/**
 * Learnset rows for one species in one version group, loading the group if needed.
 *
 * Rows are per (pokemon, move, method, level): a species with several forms
 * contributes rows for each, distinguished by `pokemon_id`.
 */
export async function getLearnsetsForSpecies(
  speciesId: number,
  versionGroup: string,
): Promise<LearnRow[]> {
  const data = await loadVersionGroupData(versionGroup)
  return data.learnsetsBySpecies.get(speciesId) ?? []
}

/** Encounter rows for one species in one version group, loading the group if needed. */
export async function getEncountersForSpecies(
  speciesId: number,
  versionGroup: string,
): Promise<EncounterRow[]> {
  const data = await loadVersionGroupData(versionGroup)
  return data.encountersBySpecies.get(speciesId) ?? []
}

/** Synchronous read for callers that have already awaited the group. */
export function peekLearnsetsForSpecies(
  speciesId: number,
  versionGroup: string,
): LearnRow[] | undefined {
  return cache.get(versionGroup)?.learnsetsBySpecies.get(speciesId)
}

/** Test seam: forget every cached group. */
export function __resetVersionGroupCache(): void {
  cache.clear()
  inflight.clear()
}
