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
data/             generated data-layer output (empty for now)
public/           static assets, PWA icons
```

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
