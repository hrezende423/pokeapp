# Pokeapp

Pokémon companion app — an installable PWA built with Vite + React + TypeScript.

Live: https://hrezende423.github.io/pokeapp/

## Status

Infrastructure phase. The app shell is scaffolded, installable, and deploying to
GitHub Pages. No Pokémon data or features yet.

## Scripts

| Script                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Vite dev server                               |
| `npm run build`        | Type-check (`tsc -b`) then production build   |
| `npm run build:data`   | Regenerate the data bundle in `public/data/`  |
| `npm run lint`         | ESLint over the repo                          |
| `npm run format`       | Prettier, writing changes                     |
| `npm run format:check` | Prettier in check-only mode (useful in CI)    |
| `npm run preview`      | Serve the production build locally            |
| `npm run verify:app`   | Drive the built app in Chrome, assert caching |

## Layout

```
src/components/   shared presentational components
src/modules/      per-domain feature modules (pokedex, team-builder, ...)
src/data/         runtime data loader, indices and types
src/pwa.ts        service worker registration
scripts/          build-time tooling (data ingestion, browser verification)
public/data/      generated data bundle -- see public/data/README.md
public/           static assets, PWA icons
```

## Data layer

`scripts/build-data.ts` ingests PokeAPI's static JSON snapshot and writes a
normalized Gen 1-4 bundle (national dex 1-493, 14 version groups) to `public/data/`.
The
bundle is committed, so a normal `npm run build` needs no network access.

It is normalized by design: entities reference each other by integer id, nothing is
embedded, and reverse indices are omitted as derivable. The build fails if any
emitted `*_id` fails to resolve. Historical data (`past_types`, `past_stats`,
`past_abilities`, per-generation type matchups) is preserved because current-gen
PokeAPI values are wrong for the Gen 1-4 era.

The two large row-oriented files are partitioned per version group into
`public/data/learnsets/` and `public/data/encounters/` (14 files each), indexed by
`public/data/version-groups.json`. Loading one game costs 16-192 KiB gzipped instead of the
full 1.4 MiB. Everything else is a single eagerly-loaded file.

`public/data/README.md` documents the shapes, invariants and the generation-accuracy
rules.

### Runtime

`src/data/` wires the bundle into the app:

- `initDataLayer()` fetches the 12 eager files once at boot (~388 KiB gzipped,
  ~2.70 MiB decoded) and indexes them into Maps keyed by id. Typed accessors --
  `getSpecies`, `getMove`, `getItem`, `getAbility`, `getType`, ... -- read those Maps.
  There is no query engine; callers needing another access path build their own index.
- `loadVersionGroupData(vg)` fetches one version group's two partition files, indexes
  them by species, and caches the result in memory. Concurrent calls for the same
  group share one pair of requests and repeat calls issue none.
  `getLearnsetsForSpecies(id, vg)` / `getEncountersForSpecies(id, vg)` trigger the
  load when needed.

Caching is split to match: the eager tier is precached at service-worker install, and
the partitions use a Workbox `CacheFirst` route so each is stored on first use. A
version group never opened online is genuinely unavailable offline. `npm run
verify:app` asserts all of this against a real browser network log, including an
offline reload.

## PWA

`vite-plugin-pwa` runs in `generateSW` mode and precaches the app shell only.
Pokémon data caching is deliberately not wired up yet — that lands with the data
layer. The icons in `public/` are flat placeholders and should be replaced with
real artwork.

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which lints,
builds, and publishes `dist/` to GitHub Pages via the Actions deployment source.
Because the site is served from a subpath, `base` in `vite.config.ts` is
`/pokeapp/`; renaming the repo means updating that value.
