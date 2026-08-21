# Pokeapp

Pokémon companion app — an installable PWA built with Vite + React + TypeScript.

Live: https://hrezende423.github.io/pokeapp/

## Status

Infrastructure phase. The app shell is scaffolded, installable, and deploying to
GitHub Pages. No Pokémon data or features yet.

## Scripts

| Script                 | What it does                                |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Vite dev server                             |
| `npm run build`        | Type-check (`tsc -b`) then production build |
| `npm run lint`         | ESLint over the repo                        |
| `npm run format`       | Prettier, writing changes                   |
| `npm run format:check` | Prettier in check-only mode (useful in CI)  |
| `npm run preview`      | Serve the production build locally          |

## Layout

```
src/components/   shared presentational components
src/modules/      per-domain feature modules (pokedex, team-builder, ...)
src/pwa.ts        service worker registration
scripts/          build-time tooling (data ingestion)
data/             generated data-layer output -- see data/README.md
public/           static assets, PWA icons
```

## Data layer

`scripts/build-data.ts` ingests PokeAPI's static JSON snapshot and writes a
normalized Gen 1-4 bundle (national dex 1-493, 14 version groups) to `data/`. The
bundle is committed, so a normal `npm run build` needs no network access.

It is normalized by design: entities reference each other by integer id, nothing is
embedded, and reverse indices are omitted as derivable. The build fails if any
emitted `*_id` fails to resolve. Historical data (`past_types`, `past_stats`,
`past_abilities`, per-generation type matchups) is preserved because current-gen
PokeAPI values are wrong for the Gen 1-4 era.

`data/README.md` documents the shapes, invariants and the generation-accuracy rules.

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
