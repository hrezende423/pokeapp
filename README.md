# Pokeapp

Pokémon companion app — an installable PWA built with Vite + React + TypeScript.

Live: https://hrezende423.github.io/pokeapp/

## Status

Infrastructure phase. The app shell is scaffolded, installable, and deploying to
GitHub Pages. No Pokémon data or features yet.

## Scripts

| Script                    | What it does                                      |
| ------------------------- | ------------------------------------------------- |
| `npm run dev`             | Vite dev server                                   |
| `npm run build`           | Type-check (`tsc -b`) then production build       |
| `npm run build:data`      | Regenerate the data bundle in `public/data/`      |
| `npm run lint`            | ESLint over the repo                              |
| `npm run format`          | Prettier, writing changes                         |
| `npm run format:check`    | Prettier in check-only mode (useful in CI)        |
| `npm run preview`         | Serve the production build locally                |
| `npm run verify:app`      | Drive the built app in Chrome, assert caching     |
| `npm run verify:pokedex`  | Drive the Pokedex in Chrome, assert each scenario |
| `npm run verify:ux`       | Assert the artwork/layout/evolution UX batch      |
| `npm run verify:eggmoves` | Egg moves + partition failure isolation           |

## Layout

```
src/components/   shared presentational components
src/modules/      per-domain feature modules
  pokedex/        species list + detail view
  version-group/  the app-wide "which game" selection
src/data/         runtime data loader, indices, era resolution and types
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

## Dex modules

`src/modules/nav/registry.ts` is the whole registration mechanism: an array of
`{ id, label, Component }`. The switcher and the app shell both render from it, so
adding a sixth dex means appending one entry and nothing else. The version-group
picker sits beside the switcher rather than inside any one module, because it gates
four of the five.

All four secondary dexes share `src/modules/dex/DexShell.tsx` — the same 240px
sidebar and card layout as the Pokédex, reusing its CSS classes so a layout fix
lands once.

| Dex        | Entries | Detail                                     | Generation gating                      |
| ---------- | ------- | ------------------------------------------ | -------------------------------------- |
| Itemdex    | 563     | category, effect, price, fling, attributes | `generation_ids` membership            |
| Abilitydex | 161     | effect + reverse lookup of every carrier   | `generation_id <= G`; empty in Gen 1-2 |
| Naturedex  | 25      | increased/decreased stat pair, flavours    | whole list, Gen 3+                     |
| Berrydex   | 64      | firmness, growth, Natural Gift, flavours   | derived from the linked item           |

### What the generation signals actually are

Audited rather than assumed, because the four files differ (see
`src/data/availability.ts`):

- **Abilities** carry a clean `generation_id` on all 161 entries. Cumulative.
- **Items** carry `generation_ids`, an array built from PokeAPI's `game_indices` —
  a real per-generation index table, non-empty for all 563 items. It is treated as
  a **set, not a range**: 61 items have genuine gaps and the gaps are historically
  right. Safari Ball is `[1,3,4,…]`, absent from Gen 2 which had no Safari Zone
  ball; TM51-55 are `[1,4,…]`. `min <= G` would put a Safari Ball in Gold/Silver.
- **Berries** have **no generation field of their own**. All 64 have an `item_id`
  that resolves, so availability is _derived_ from the linked item and labelled as
  derived in the UI. Counts: 0 / 10 / 43 / 64 across Gens 1-4.
- **Natures** have no per-entry signal, correctly — all 25 arrived together in
  Gen 3 and none has been added or removed. Gated as one rule, not per entry.

### Scope under "All"

`All` drops the era filter. What that exposes differs per entity, and the header
note now states it per module rather than claiming a blanket "in scope":

| Dex        | Entries | Out of Gen 1-4 scope                                                   |
| ---------- | ------- | ---------------------------------------------------------------------- |
| Itemdex    | 563     | **0** — every item is indexed in at least one of Gens 1-4              |
| Abilitydex | 161     | **38** (Gens 5/6/8/9), kept only so species ability references resolve |
| Naturedex  | 25      | 0 — all Gen 3                                                          |
| Berrydex   | 64      | 0 — every berry exists in at least one of Gens 1-4                     |

The ingestion filter (Gen 1-4 `game_index` ∪ referenced by an in-scope
species/move) held for items: there are **no** Gen 5+-exclusive items in the
bundle — `eviolite`, `air-balloon` and `rocky-helmet` are all absent, and no
item has a minimum generation above 4. Abilities are the one entity where
out-of-era rows genuinely survive, because dropping them would dangle a species
reference. `verify:dexes` asserts all of this.

Note that 563 (total) and 514 (present in Gen 4) are different quantities: 49
items are Gen 1-3 retirees — the Hoenn bikes, the FRLG tickets, Gen 3 mail —
that never appear in a Gen 4 game.

### Ability reverse lookup

`speciesWithAbility(id, generation)` joins over species.json's ability references
and goes through the same `resolveAbilitiesForGeneration` the species detail view
uses, so the two can never disagree. That matters: a naive `variety.abilities` scan
would **miss Gengar** under Levitate (its modern ability is Cursed Body, restored
for Gen ≤6 by `past_abilities`) and would **wrongly include Bulbasaur** under
Chlorophyll (a Gen 5 hidden ability). Alternate forms are scanned too, and results
are deduplicated per species.

## Pokédex

`src/modules/pokedex/` is the first feature module: a filterable species list and a
full detail view, both driven by the version group selected in
`src/modules/version-group/`. Changing the game updates an open detail view in
place.

The detail view is generation-accurate rather than showing current-gen values:

- **Abilities** are resolved for the selected generation only. Resolution is
  per-slot, because a species can have several `past_abilities` entries each
  covering a different slot. Under a Gen 1-2 selection no abilities are shown at
  all, since abilities did not exist yet.
- **Types** use `past_types` where it applies, so Clefairy is Normal in Gen 1-4,
  not Fairy.
- **Type effectiveness** uses the per-generation damage relations from the data
  bundle: 15 attacking types under Gen 1 (no Dark or Steel), 17 under Gen 2-4.
- **Learnsets and encounters** come from the selected version group's partition
  only, loaded on demand. TM vs HM is resolved from the machine item's name.

The game picker also offers **All**, which drops the era filter and lists the whole
national dex. Its ceiling and its era fallback are both derived from
`GENERATION_RANGES`, so adding a generation is a one-line change. Learnsets and
encounters have no answer under All -- they are per version group -- so those cards
ask for a specific game instead of quietly showing one.

### Artwork

Four independent choices drive the image, but only three combinations exist, because
animation exists only for the custom artwork:

| Source  | Motion   | Comes from                              | Gendered?      |
| ------- | -------- | --------------------------------------- | -------------- |
| In-game | static   | `sprites.front_default` / `front_shiny` | 94/493 species |
| Artwork | static   | `sprites.other["official-artwork"]`     | never          |
| Artwork | animated | `pokeapp-sprites` release assets        | 94/493 species |

The Motion switch is disabled (and forced to Static) under the in-game source.

Gender availability is checked **per combination against the real data**, never as a
blanket rule: the in-game sprites carry `front_female`/`front_shiny_female` for
exactly the 94 species flagged `has_gender_differences`; official artwork exposes no
female field for any species (audited across all 508 varieties); and the animated
assets ship a `-f` file for the same 94. When the current combination has no gendered
image the switch is disabled with a stated reason, rather than serving the male image
under a "Female" label. `npm run verify:ux` reports the per-mode counts.

### Evolution tree

Rendered as a real tree: each node is the species' official artwork, with children
stacked vertically to the right of their parent and the same rule applied recursively,
so linear chains are one row and Eevee's seven branches are seven rows -- no special
case. Each arrow is labelled with a Tabler icon plus the distinguishing detail
(`IconTrendingUp` + level, `IconDiamond` + stone, `IconSwords` + move,
`IconArrowsExchange` alone for trade, `IconGift` + item for trade-while-holding,
`IconMapPin` + location, `IconHeart` + friendship, `IconHandGrab` + held item,
`IconGhost` for Shedinja); the full compound clause stays available as the title.
No Poké Ball motif is used anywhere here -- that is reserved for caught status.

Node artwork follows the shiny switch but deliberately stays static and
default-gender, so viewing a shiny chain does not pull a row of animated WebPs.

### Known gap

`getGenerationForSpecies()` maps a species to the generation it was _introduced_
in, by national dex id range, and the list shows everything up to the selected
generation. It does **not** model regional dex availability — Ruby/Sapphire's
Hoenn dex excludes Johto species until the National Dex is unlocked, and
Colosseum/XD have small rosters, but all of them list the full cumulative dex
here. Doing this properly needs the `pokedex` endpoint's per-regional-dex species
lists, which the bundle does not currently carry. This is a documented
simplification, not a bug.

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
