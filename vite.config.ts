import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { DATA_DIR, EAGER_DATA_FILES, PARTITION_DIRS } from './src/data/manifest.ts'

// Repo is served from https://<user>.github.io/pokeapp/, so every asset URL
// must be prefixed with the repo name.
const BASE = '/pokeapp/'

// Precache the eager bundle by name rather than with a `data/*.json` wildcard, so a
// stray file landing in data/ can never be silently added to the install payload.
const EAGER_DATA_GLOB = `${DATA_DIR}/{${EAGER_DATA_FILES.join(',')}}`

// The per-version-group partitions are ~34 MiB raw in total, so they are fetched on
// demand and cached on first use instead. CacheFirst is right because the files are
// immutable for a given build: a rebuild produces new content under the same name,
// and cleanupOutdatedCaches plus a new SW revision handles that.
const PARTITION_PATTERN = new RegExp(`/${DATA_DIR}/(${PARTITION_DIRS.join('|')})/[^/]+\\.json$`)

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is done explicitly from src/pwa.ts.
      injectRegister: null,
      manifest: {
        name: 'Pokeapp',
        short_name: 'Pokeapp',
        description: 'Pokémon companion app',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        theme_color: '#dc2c2c',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // No includeAssets and no `webmanifest` here: the plugin already precaches
        // manifest.webmanifest, and favicon/apple-touch-icon are matched by the svg
        // and png globs. Listing them twice inflated the manifest with duplicate
        // entries for the same revision.
        // woff2 is here because the design system's IBM Plex Sans is self-hosted:
        // an offline-first PWA that fetched its own font over the network would fall
        // back to the system stack the first time it opened offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}', EAGER_DATA_GLOB],
        // species.json is the largest precached file at ~1.6 MiB; the Workbox default
        // is 2 MiB, which would silently drop it if the bundle grew.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [PARTITION_PATTERN],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Artwork lives on other origins: PokeAPI's sprite repo for the static
            // images, and GitHub releases (which redirect to objects.*) for the
            // animated WebP. Cross-origin responses are opaque, so status 0 has to
            // be treated as cacheable alongside 200.
            urlPattern: ({ url }) =>
              url.hostname === 'raw.githubusercontent.com' ||
              url.hostname === 'objects.githubusercontent.com' ||
              (url.hostname === 'github.com' && url.pathname.includes('/releases/download/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokeapp-artwork',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: PARTITION_PATTERN,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokeapp-version-group-data',
              // 14 version groups x 2 files, with headroom for a build transition.
              expiration: { maxEntries: 40 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})
