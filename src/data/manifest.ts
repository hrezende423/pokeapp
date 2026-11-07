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
  /*
    Bulbapedia's per-game item prices and acquisition methods, which PokeAPI does
    not carry (scripts/build-item-supplement.mjs). Eager, not a partition: the
    Itemdex's price column reads it on the list, and offline-first means a lazy
    file would leave that column empty until someone opened it online.
  */
  'item-supplement.json',
] as const

export type EagerDataFile = (typeof EAGER_DATA_FILES)[number]

/**
 * Subdirectories holding the per-version-group partitions (14 files each for
 * learnsets and encounters, 10 each for trainers and battle -- the matchup
 * engine's per-game move tables and AI, scripts/build-battle-data.mjs). Fetched
 * on demand and populated into the runtime cache on first request, never
 * precached at install time.
 */
export const PARTITION_DIRS = ['learnsets', 'encounters', 'trainers', 'battle'] as const

/**
 * OFFLINE BEFORE FIRST VIEW (2026-11-07). The partitions of the mechanics scope,
 * Gen 1-4, are PRECACHED: every encounter, trainer and battle file and the Gen 1-4
 * learnsets (41 MiB raw), so a species page, a move page and the Trainer Dex open
 * offline the moment the service worker has installed, never having been viewed.
 * The Gen 5+ learnsets (the dexes reach Gen 9; 52 MiB raw) are not precached: they
 * are warmed in the background after install (offlineWarmup.ts), into the same
 * runtime cache a first view would fill. Sprites are never precached (648 MB).
 */
export const PRECACHE_MAX_GENERATION = 4
