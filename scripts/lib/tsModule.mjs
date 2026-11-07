/**
 * Import an app TypeScript module in plain Node, for the browser-free suites
 * (verify:store, verify:entities, verify:curated). The app's imports are
 * extensionless and Vite-resolved, which Node cannot load directly, so the entry is
 * bundled in memory by esbuild (a devDependency) and imported from a data URL.
 *
 *   const store = await importTs('src/store/documentStore.ts')
 *
 * Only for PURE modules: anything that touches the DOM, fetch or the data bundle at
 * import time belongs in a browser suite. `localStorage` is not provided; a suite
 * that needs one installs `globalThis.localStorage = memoryStorage()` first.
 */
import { build } from 'esbuild'
import { resolve } from 'node:path'

export async function importTs(entry) {
  const out = await build({
    entryPoints: [resolve(entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    loader: { '.json': 'json' },
  })
  const code = out.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

/** A Map-backed Storage, for suites that exercise localStorage code in Node. */
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  }
}
