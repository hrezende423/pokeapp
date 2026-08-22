/**
 * Single source of truth for the data-bundle layout.
 *
 * vite.config.ts imports EAGER_DATA_FILES to build the Workbox precache glob, and
 * the runtime loader imports it to know what to fetch. Keeping one list means the
 * precache manifest and the loader cannot drift apart — a file added to one but
 * not the other would otherwise fetch fine online and fail silently offline.
 *
 * Deliberately free of DOM and Node types so it can be imported from both the
 * browser bundle and the Vite config.
 */

/** Directory (under the Vite base) that build-data.ts writes into. */
export const DATA_DIR = 'data'

/**
 * Files loaded once at boot and precached by the service worker.
 *
 * These are the small, cross-cutting entity tables that every screen needs. The
 * large per-version-group partitions are deliberately NOT here — see
 * PARTITION_DIRS.
 */
export const EAGER_DATA_FILES = [
  'species.json',
  'moves.json',
  'items.json',
  'abilities.json',
  'natures.json',
  'berries.json',
  'types.json',
  'egg-groups.json',
  'evolution-chains.json',
  'locations.json',
  'meta.json',
  'version-groups.json',
] as const

export type EagerDataFile = (typeof EAGER_DATA_FILES)[number]

/**
 * Subdirectories holding the 14-files-each per-version-group partitions. Fetched
 * on demand and populated into the runtime cache on first request, never
 * precached at install time.
 */
export const PARTITION_DIRS = ['learnsets', 'encounters'] as const
