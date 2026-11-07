/**
 * After install, fetch the partitions the service worker did NOT precache (the Gen 5+
 * learnsets: see PRECACHE_MAX_GENERATION in manifest.ts), so they work offline too
 * before anyone opens them. Each fetch goes through the worker's CacheFirst rule
 * (`pokeapp-version-group-data`), exactly as a first view would, so nothing here
 * duplicates the cache logic.
 *
 * Quiet by design: one file at a time, low priority, skipped when the browser asks to
 * save data or when there is no controlling worker (dev, first load before install),
 * stopped at the first network failure (offline: the next session tries again).
 */
import { dataUrl, listVersionGroups } from './loader'
import { PRECACHE_MAX_GENERATION } from './manifest'

export interface WarmupResult {
  fetched: number
  alreadyCached: number
  skipped: null | 'no-service-worker' | 'save-data' | 'offline'
}

export function warmupUrls(): string[] {
  return listVersionGroups()
    .filter((v) => (v.generation_id ?? 99) > PRECACHE_MAX_GENERATION)
    .map((v) => dataUrl(v.learnsets_path))
}

export async function warmRemainingPartitions(): Promise<WarmupResult> {
  const result: WarmupResult = { fetched: 0, alreadyCached: 0, skipped: null }
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller || typeof caches === 'undefined') {
    return { ...result, skipped: 'no-service-worker' }
  }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return { ...result, skipped: 'save-data' }
  for (const url of warmupUrls()) {
    if (await caches.match(url)) {
      result.alreadyCached++
      continue
    }
    try {
      const res = await fetch(url, { priority: 'low' } as RequestInit)
      if (!res.ok) continue
      await res.arrayBuffer()
      result.fetched++
    } catch {
      return { ...result, skipped: 'offline' }
    }
  }
  return result
}

/**
 * Run the warm-up once a worker controls the page: at once on a returning visit, or
 * on `controllerchange` after a first install. A few seconds' delay keeps it off the
 * boot path. The result is announced as a `pokeapp:offline-warmup` window event
 * (verify-offline waits on it).
 */
export function scheduleWarmup(delayMs = 4000) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  const run = () =>
    setTimeout(() => {
      void warmRemainingPartitions().then((detail) =>
        window.dispatchEvent(new CustomEvent('pokeapp:offline-warmup', { detail })),
      )
    }, delayMs)
  if (navigator.serviceWorker.controller) run()
  else navigator.serviceWorker.addEventListener('controllerchange', run, { once: true })
}
