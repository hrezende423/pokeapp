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
| `npm run verify:dexes`    | The four secondary dexes + navigation             |
| `npm run verify:movedex`  | Movedex list, detail and move reverse lookup      |
| `npm run verify:search`   | Global search: grouping, scope reuse, navigation  |
| `npm run verify:ds`       | Design-system tokens, fonts, and component specs  |

## Layout

```
src/components/   shared presentational components
  ds/             design-system components (§5 + §10 of DESIGN-SYSTEM.md)
src/assets/fonts/ self-hosted IBM Plex Sans (woff2)
design-system/    the design-system handoff: tokens, spec, component libraries
src/modules/      per-domain feature modules
  pokedex/        species list + detail view
  dex/            the shared list+detail shell, and the five secondary dexes
  nav/            module registry, tab switcher, and the active tab + selection
  search/         the global search over four dexes
  design-system/  live reference page for the design-system components
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
adding another dex means appending one entry and nothing else. The version-group
picker and the global search sit beside the switcher rather than inside any one
module: the picker gates five of the six dexes, and the search reaches four of
them.

All four secondary dexes share `src/modules/dex/DexShell.tsx` — the same 240px
sidebar and card layout as the Pokédex, reusing its CSS classes so a layout fix
lands once.

| Dex        | Entries    | Detail                                                           | Generation gating                                          |
| ---------- | ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Itemdex    | 563        | category, effect, price, fling, attributes                       | `generation_ids` membership                                |
| Movedex    | 485        | power/accuracy/PP, type, damage class, effect, contest, learners | `generation_id <= G`                                       |
| Abilitydex | 123 of 161 | effect + reverse lookup of every carrier                         | `generation_id <= G`, clamped to Gen 1-4; empty in Gen 1-2 |
| Naturedex  | 25         | increased/decreased stat pair, flavours                          | whole list, Gen 3+                                         |
| Berrydex   | 64         | firmness, growth, Natural Gift, flavours                         | derived from the linked item                               |

### Movedex

The list adds a type filter, which is the **same** `src/components/TypeFilter.tsx`
the Pokedex species list uses -- extracted rather than duplicated, so the palette,
the OR semantics and the "Any" clear behaviour cannot drift between the two.

Two fields are easy to confuse and are shown separately:

- **`damage_class`** is physical / special / status (196 / 113 / 176 moves).
- **`meta.category`** is a different axis -- damage, ailment, net-good-stats, ohko,
  field-effect and eleven more -- describing what the move does. It is labelled
  "effect kind", never "category".

Contest data needed a small additive ingestion change: the bundle carried
`contest_type` (the cool/tough/... category) but **not** appeal or jam, which live
on separate `contest-effect` and `super-contest-effect` entities that a move only
references. Both are now resolved and inlined on the move (354 and 467 of 485
moves have one). They are inlined rather than emitted as two more entity files --
a deliberate, documented exception to the reference-by-id rule, since neither has
any identity beyond two integers and nothing else points at them.

#### Move reverse lookup

"Which species learn this move" reads the same learnset partitions as the Pokedex
learnset card, so the two can never disagree:

- **One game** -- that partition only, one entry per species, with its methods and
  lowest level-up level.
- **All** -- the union across all fourteen groups, **deduplicated by species**
  rather than one row per game, since the question is "can this be learned at all
  in Gen 1-4". Each entry records how many games contributed, so the dedup never
  hides that a species learns it in only one obscure version group.

The "All" path loads all fourteen partitions: 23.5 MiB raw / ~906 KiB gzipped,
202,707 rows. It is therefore lazy -- nothing loads until a move detail is opened
in that mode -- and every partition is reused afterwards, so later moves cost
nothing. A partition that fails is reported rather than silently dropped, so a
partial answer is never presented as complete.

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

| Dex        | Entries                             | Out of Gen 1-4 scope                                      |
| ---------- | ----------------------------------- | --------------------------------------------------------- |
| Itemdex    | 563                                 | **0** — every item is indexed in at least one of Gens 1-4 |
| Abilitydex | **123 listed** of 161 in the bundle | the 38 introduced in Gens 5/6/8/9 are **not listed**      |
| Naturedex  | 25                                  | 0 — all Gen 3                                             |
| Berrydex   | 64                                  | 0 — every berry exists in at least one of Gens 1-4        |

The ingestion filter (Gen 1-4 `game_index` ∪ referenced by an in-scope
species/move) held for items: there are **no** Gen 5+-exclusive items in the
bundle — `eviolite`, `air-balloon` and `rocky-helmet` are all absent, and no
item has a minimum generation above 4.

Abilities are the one entity where out-of-era rows survive in the _data_, because
dropping them would dangle a species reference. **The Abilitydex list clamps them
out**: it shows the 123 abilities with a Gen 1-4 presence and never the other 38,
under "All" as much as under a specific game. The clamp is on the list only --
`resolveAbilitiesForGeneration` still sees all 161, which is what lets a species
page resolve Gengar back to Levitate for Gen 3-4 (its modern ability is the Gen 5
Cursed Body) and lets the reverse lookup include Gengar under Levitate.

`verify:dexes` asserts all of this, including that no hidden ability leaks into
the list or its search while remaining present in the bundle.

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

## Global search

One input in the app bar, reachable from every tab, searching species, moves,
items and abilities at once. Results are grouped under those four headings, and a
group with no match is absent rather than rendered empty.

### It reuses each dex list, and cannot do otherwise

`src/modules/dex/entrySources.ts` holds exactly one function per category —
`speciesEntries`, `moveEntries`, `itemEntries`, `abilityEntries` — and **both** the
dex module and the search call it. The search's own files (`searchCategories.ts`,
`GlobalSearch.tsx`) never import a bundle list (`listSpecies`, `listMoves`, …) or a
generation predicate at all, so they have nothing to re-derive scope from.

That is a hard rule rather than a preference, because the failure it prevents
already happened once: the Abilitydex list was clamped to the 123 abilities with a
Gen 1-4 presence while a second code path still saw all 161, so its own search box
surfaced entries the list refused to show. A global search built the naive way
would reproduce that leak across four entity types instead of one.

A category also names its destination as a `DexModuleId` — the union of ids the
registry actually declares — so a result pointing at an unregistered module is a
compile error, not a click that silently lands on the Pokédex.

### Navigating to a result

Clicking a result switches tab and opens that entry in one update. That needs the
selection to outlive the module, so it lives in `src/modules/nav/navContext.ts`
keyed per dex, not in each list component. Two consequences worth knowing:
switching tabs and back returns to what was open, and a detail view stays open
while the dex's own search box narrows the list underneath it — the open entry is
resolved against the full gated list, not the filtered rows.

Each group shows at most 8 rows and states the true total (`Species 8 of 271`), so
the cap is visible rather than a silent truncation. Escape closes the panel and
clears the query, which is what Chrome does natively with `input type="search"`.

### What `verify:search` proves

183 checks, two of them the ones that matter most:

- Under Gen 1-2, searching a genuinely Gen 3-introduced ability (`Overgrow`,
  `generation_id` 3) returns **nothing**, and the Abilitydex list agrees at 0. The
  Gen 3-4 positive control finds it, so the zero is the clamp working rather than a
  broken search.
- `cursed` returns **nothing** under all four games and under "All", matching the
  assertion already proven for the Abilitydex's own box, while Cursed Body remains
  in the bundle.

Plus, for every (game × term × category) probe, the count the search reports, the
count that dex's own list reports, and the count computed from the bundle must all
three agree — a leak in either path shows up as a mismatch instead of a plausible
number.

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

`vite-plugin-pwa` runs in `generateSW` mode. The install payload is the app shell,
the eager data tier, and the two self-hosted IBM Plex Sans files — 26 entries,
~3.3 MiB. `woff2` is in `globPatterns` on purpose: a font fetched over the network
would fall back to the system stack the first time the app opened offline, which
defeats the point of self-hosting it. Version-group partitions stay on the
`CacheFirst` runtime route. The icons in `public/` are flat placeholders and should
be replaced with real artwork.

## Design system

The handoff lives in `design-system/` — `design-tokens.json` (source of truth),
`design-tokens.css`, `DESIGN-SYSTEM.md`, and three component-library HTML files.
Those files are the reference and are not edited by the app.

`src/design-tokens.css` is the shipped copy, imported from `main.tsx` after
`index.css`. Token values are identical to the handoff — `verify:ds` asserts that
declaration by declaration — with three deltas, all of them syncing the CSS to the
JSON:

- **`@font-face` rules added** for the bundled font (the file asked for them once
  the assets existed).
- **`--field-*` and `--ledger-num-opacity-*` moved out of `[data-theme="dark"]`**
  into the mode-agnostic `:root` rule. They were defined only in the dark rule, so
  in light mode the form-field states and the ledger dim rule resolved to nothing.
  Both are mode-agnostic rules in the JSON and every value is either
  `var(--accent)` or a plain number.
- **`--radius-badge-square: 5px` added**, from `radius.badge-square` in the JSON.
  Its absence left the sanctioned solid-square type badge unbuildable from tokens.

### Theme

The tokens key off `data-theme="light" | "dark"`, which is what the token file
declares ("on `:root` or any ancestor"). `src/theme.ts` sets it on `<html>` from
the OS preference at boot and keeps it in sync — without it, a dark-preferring OS
would get the light palette. Because the attribute works on any ancestor, the
reference page renders light and dark side by side in one document.

### Font

IBM Plex Sans is self-hosted in `src/assets/fonts/`, no CDN. Google Fonts now
serves it **only as a variable font** (wght 100–700, wdth 75–100), so the three
weight rules in their stylesheet all point at the same file: what is bundled is one
variable woff2 per subset (latin, latin-ext, 75 KiB total) declared
`font-weight: 100 700`, not three static instances. 400/600/700 all resolve from it,
and 600 is a real master rather than an interpolation. Cyrillic, Greek and
Vietnamese subsets are deliberately not bundled — the data is English, and every
bundled subset is precached.

### Components

`src/components/ds/` implements the fourteen validated components from
DESIGN-SYSTEM.md §5 plus the form-field states from §10, on the tokens. The
`Design system` tab renders all of them against real bundle data and real artwork.

Two structural notes:

- Components must be rendered inside a `.ds-root` container: that is what
  establishes the system's own font, surface and text alignment instead of
  inheriting the app shell's. Five rules are additionally scoped as
  `.ds-root .ds-*` because `App.css` styles bare `h1`/`h2`/`section` inside
  `.panel` at (0,1,1), which outranks a plain component class — the hero name was
  rendering at 14.4px uppercase before that fix.
- The species-tinted detail background reads
  `species-background-colors.json` from the **pokeapp-sprites** repo at runtime
  (`raw.githubusercontent.com`, already covered by the artwork `CacheFirst` route)
  rather than bundling a copy, so there is one source of truth for it. If the fetch
  fails the page falls back to the standard background mode and says so.

### Deliberately not built

Flagged rather than guessed, per the handoff:

- The **solid-square type badge**. Sanctioned, and it has a radius token, but no
  fill or text colour is specified anywhere. The colored-text treatment (the
  documented default) is what ships.
- Anything needing a **status-green**: still genuinely open for non-form
  indicators, so no component here uses one. Form-level success is a checkmark in
  `--text-primary`, per the tokens.
- The **custom icons** on the still-searching list, including the caught/not-caught
  Poké Ball. The toggle uses its track and thumb only.
- The 81 components of §7 (`ds-component-library-full95.html`), which that section
  itself describes as consistent token application rather than validated design.
- **Retrofitting the existing dex modules.** Still an open item. The tokens are
  loaded app-wide and no existing screen was restyled — with one unavoidable
  exception: the design system and the old stylesheet both define `--accent`, so
  the old modules now draw their accent from the design system (Pokédex red
  `#d91c2c`) instead of the previous purple. Making `--accent` available app-wide
  and leaving the old value in place are mutually exclusive.

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which lints,
builds, and publishes `dist/` to GitHub Pages via the Actions deployment source.
Because the site is served from a subpath, `base` in `vite.config.ts` is
`/pokeapp/`; renaming the repo means updating that value.
