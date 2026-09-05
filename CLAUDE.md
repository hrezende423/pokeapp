# pokeapp — project memory

Personal build-to-learn Pokémon companion PWA. Gen 1–4 scope.
React + TypeScript + Vite. GitHub Pages + GitHub Actions CI/CD.
**No backend, ever** — everything runs client-side, offline-first PWA.

Full rationale for anything below lives in `/design-system/DESIGN-SYSTEM.md`
and `/design-system/design-tokens.json`. This file is only the rules that
must never be re-derived, re-explained, or re-litigated in a fresh session.

**STARTING A NEW MODULE? Read `/design-system/MODULE-PATTERNS.md` first.**
It is the build reference — every pattern the Pokédex grid and species
detail page established, in the order you need them, each with the file to
copy from and the mistake it exists to prevent. `DESIGN-SYSTEM.md` §12 is
the as-built audit of those two screens and is authoritative wherever it
disagrees with §1–§11, which were written before implementation.

## Architecture

- **Generation-scoped source of truth**: every dex module (species, moves,
  items, abilities) has its own scoped list function
  (`src/modules/dex/entrySources.ts`). Cross-module features (search,
  filters, the global game/gen selector) must reuse those functions —
  never a fresh index or raw bundle query. This is how generation-leak
  bugs get introduced, and it's happened before.
- **Global game/generation selector** filters the *entire* app: which
  species appear in lists, AND all data fields shown for them (moves,
  abilities, items, learnsets as of the selected game). Not just a list
  filter — a full context that every module must respect.
- Favor extensibility (Gen 5+ additions via config) over refactoring.
- **The species detail page reproduces its Figma frame proportionally**,
  not at the token sizes. `DetailPage-Light` is 1860 × 1172 raw units drawn
  at 2.23× (established by `scripts/calibrate-scale.mjs`), so every length
  on that page is a multiple of `--dp-u` = `100cqw / 1860` and the type
  tokens are REDEFINED in those units on `.species-page-inner`. That is why
  shared components (`DataTable`, `StatRow`, `Tabs`) scale with the page
  without per-component work — and why an element there cannot query its
  own container, which is what the `-inner` wrapper exists for.
  **It has exactly two tunable numbers**, and they are separate on purpose:
  the 1400px width cap, and `--dp-s` (0.78) which multiplies only the TYPE.
  Because every length is one unit, "smaller text" and "narrower page" would
  otherwise be the same control. `npm run report:type-scale` prints every
  size in the app — the fixed tokens and this page's raw units, measured in
  a browser — and the RAW column is the number to edit.
  **The SPACING tokens are redefined in those units too** (`--space-gap-*`,
  `--space-row-padding-block`), which is not decoration: the type dropped 22%
  when `--dp-s` landed and absolute padding did not come with it, so every
  row kept the rhythm of a larger face. Two values in shared CSS cannot be
  reached that way and are overridden inside `.species-page` —
  `.ds-stat-row`'s `padding: 8px 0` and `.data-table`'s `5px 7px`. If a
  spacing value on that page is in `rem` or `px`, it is a bug.
- **The Info tab's locations section is the ONE EXCEPTION to the global
  game selector**, by explicit request: it shows every game's locations in
  one table, with a `--game-*` badge per row and release order as the
  default sort. Nothing else on the page may follow it in ignoring the
  selector — every other era-sensitive field still goes through a resolver.
- **And it must stay lazy — that gate is now essential, not an
  optimisation.** Info is the DEFAULT tab and being game-agnostic means all
  fourteen encounter partitions, 9.6 MiB raw / ~280 KiB gzipped, so an
  eager section there would spend that on every species open for a visit
  that only wanted the stat line. **The gate is "is it on screen", NOT "has
  the reader scrolled"** — since the metadata rows lost their row gap the
  block is ~92px shorter, so on a window taller than ~800px the section is
  already visible when Info opens and correctly loads then. A section the
  reader can see must never sit behind "Loads when you scroll to it". The
  cost lands once per session, not once per species. It gates its own fetch
  behind an `IntersectionObserver`; `getEncountersForSpeciesAllGames` de-duplicates
  in-flight loads and indexes each file once per session, so the second
  species is free. Four suites drive a scroll rather than a tab click
  because of this, and verify-app asserts 14 files / 14 requests.
  It reports partitions that FAILED rather than dropping them — a table
  missing three games must never read as "not in those games" — and throws
  only when every one of them failed.
- Sprites: GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB total, too large to bundle).
  `species-background-colors.json` lives in the same repo, fetched at
  runtime — applies ONLY to the species detail page's artwork panel,
  never the grid or any other screen.
- **PokéAPI serves the Gen 1–2 sprites on an opaque WHITE background**, and
  it is inconsistent about what it also serves transparently. 2,110 of those
  slots have a `transparent/` counterpart upstream and are simply not
  rendered; 2,110 have none (both gray slots on red-blue/yellow,
  front_shiny/back_default/back_shiny on gold/silver) and are keyed to
  transparency by us, hosted at
  `pokeapp-sprites/transparent/{game}/{slot}/{id}.png`. The keying is a
  **border flood fill, never a global colour key** — these sprites use the
  same `#ffffff` for eyes and teeth as for the background. `npm run
  audit:white-sprites` re-derives the table; the pixel proof is in
  verify-species-page section N, which decodes every Gen 1–2 tile in a canvas.
- **Two animated sets live in that repo, under separate release tags.**
  `gen1`…`gen4` are the high-resolution animated WebP artwork (1,174 files).
  `bw-gen1`…`bw-gen4` are PokéAPI's Black/White animated GIFs converted to
  animated WebP (2,340 files, `{iii}-bw-{front|back}-{n|s}[-f].webp`) — the
  ONLY animated sprites the API has, and Gen 5 art of Gen 1–4 species, so
  the section showing them names the game. Which of the eight slots exists
  per species is an 8-bit mask in `src/data/animatedSprites.ts`;
  `npm run audit:bw-sprites` cross-checks upstream, the mask and the
  releases, because a mask entry with no asset is a broken image.
- **Sprite slot encoding**: 14 real slot variants exist across Gen 1–4
  (16,204 tiles for 493 species), stored as a per-game bitmask rather
  than a name array purely for install payload — 98 KiB against 638 KiB
  on the eagerly precached `species.json`. Eager and NOT lazy-fetched on
  purpose: the app is offline-first, and a lazy file would leave the
  Sprites tab broken until someone opened it online first.

## Data sourcing (don't deviate without asking)

- **PokéAPI** and **Bulbapedia** (automated, CC-licensed) are co-primary.
- **Serebii and Smogon are manual cross-check only — never scraped.**
- Trainer team data comes from **pret disassembly projects**, not PokéAPI.
- **Genuine per-generation mechanical accuracy is required**, not a
  modern-only model: Gen 1's unsplit Special stat, Gen 1–2's DVs/Stat Exp
  (not EVs/IVs), abilities and natures don't exist before Gen 3, and
  **hidden abilities don't exist before Gen 5**. Any component showing
  these fields must hide/adapt them per the active generation, not just
  always show the modern version.
- **PokéAPI's `past_` arrays are incomplete, so era rules can't be left
  to the data alone.** Two cases fixed in `src/data/era.ts`: 17 species
  have no `past_abilities` entry emptying their hidden slot (Koffing
  advertised Stench in HGSS), and 20 have a Gen 1 `special` entry *plus* a
  later entry on a physical stat, so stats must resolve per stat rather
  than per entry (Beedrill's Gen 1 Attack is 80, not the modern 90).
  Where a mechanic's start generation is a known fact, encode it as a rule.
- **Moves have `past_values` and NOTHING READS IT — open bug.** Charm,
  Sweet Kiss and Moonlight are stored as Fairy (`type_id: 18`, a Gen 6
  type) with a `past_values` entry giving Normal, so all three render as
  FAIRY under a Gen 1–4 selection. Affects the Movedex and every learnset
  table, not one page. Same class as the hidden-ability case and the data
  is already in the bundle; needs a `resolveMoveTypeForGeneration` and a
  decision, since it touches a pre-redesign module. See
  `src/modules/pokedex/SPECIES-PAGE-PUNCH-LIST.md` §10a.
- **Japanese species names**: PokéAPI's `ja-roma` gives the real,
  official Nintendo romanization, NOT a mechanical transliteration —
  ゲンガー is "Gangar", not "gengaa"; ラッキー is "Lucky", not
  "rakkii". Never use a kana-to-romaji library for this (wanakana was
  considered and rejected); `ja-roma` already carries the correct
  trademark name for all 493 species in Gen 1–4 scope. Language codes
  are lowercase: `ja-hrkt`, not `ja-Hrkt` — the documented casing
  silently returns null rather than erroring.

## Verification discipline

- **"Reported done" ≠ "actually verified."** Visual/browser confirmation
  (or an equivalent real check) is required before marking anything done
  — not just that code compiles or type-checks pass.
- **Stop and ask, don't over-engineer.** When an automated approach
  produces wrong results, the correct response is pausing to ask, not
  applying a cleverer algorithm.
- Ambiguity → ask. Don't silently pick a resolution for anything not
  explicitly covered here or in the fuller docs.

## Design system non-negotiables

(Full rationale in DESIGN-SYSTEM.md — this is the condensed "don't violate
by accident" version, since these are easy to break even in a session
that isn't explicitly about design.)

- **No `box-shadow`, anywhere, either theme.** Elevation is a tone-step:
  `--surface` vs `--surface-raised`.
- **The hairline-band rule.** Where rows draw their own `border-bottom`,
  the band a reader sees runs from one hairline to the NEXT — so a row
  `gap` falls inside that band and content centred in its own box reads a
  half-gap low. Either no row gap or no per-row border; never both. This
  shipped wrong once with every box-relative measurement passing, so
  verify by reconstructing the band from the hairlines, not the row box.
- **Base-stat bars are the one sanctioned reversal of "stats are a plain
  table".** Six values on one 0-255 scale where the spread is the fact.
  Scoped to that block; not a licence for progress bars anywhere else.
- **`--accent` (red) has exactly four uses**: active tab/nav state,
  binary state indicators, error/validation emphasis, and stat magnitude
  (the filled portion of a base-stat bar on the species detail page).
  The fourth was added during the Detail Page redo and deliberately
  reverses an earlier "plain data table" decision, confirmed against the
  real Figma prototype. Never decoration. App-wide, not namespaced.
  The **gender-ratio bar's female share** is the second of those four, not
  a fifth use — a gender split is a binary indicator, the same use that
  covers caught/not-caught. Its male share is `--text-primary`, i.e. the
  theme's version of "white", never a literal `#fff`.
- **NOTHING gets a badge. No fill, no pill, no chip, anywhere.** "Type is
  data, not decoration" is now the whole rule rather than a rule with one
  exception: game names were badged for two passes, in a `--game-*` colour
  at a 12% self-tint, and the badge was removed on request along with the
  palette and `scripts/calibrate-game-colors.mjs`. A version name is set in
  the label size and `--text-secondary`, the same as every other small
  label. `--radius-badge-square` remains a sanctioned token that nothing
  uses; do not reach for it without asking, and if a badge is ever wanted
  again, `git log -- src/modules/pokedex/GameBadge.tsx` has the whole thing.
- **No ALL-CAPS on the species detail page.** One block in `pokedex.css`
  scoped to `.species-page` turns `text-transform: uppercase` into
  `capitalize` and drops the tracking to 0.01em. Scoped, not global: the
  five pre-redesign dexes and the design-system reference page keep their
  own typography.
- **`--font-numeric`** (Martian Mono primary, JetBrains Mono fallback,
  both self-hosted) for tabular/functional numbers only (stat tables, EV
  inputs, dex numbers in lists) — must lead the font stack, or a system
  font silently wins (happened once already).
- **`--font-body`** (IBM Plex Sans, self-hosted variable font) for
  everything else, including decorative display numbers. This is now the
  actual app-wide default, not just a per-component opt-in.
  **Roman AND italic faces are bundled** — four `@font-face` blocks, two
  subsets x two styles. The italic was missing for months and the failure
  was invisible: `font-style: italic` fell back to the Roman and Chrome
  synthesised nothing, so the romanised name, the banner genus and the
  Naturedex's neutral cell all drew upright. A real italic, never an
  `oblique`/`skewX` fake: Plex Italic is a redrawn face. Never assert
  italic from a computed style — measure the advance width, because a
  fallback and a synthesised oblique both report `font-style: italic`.
- **Icons**: Tabler, 24px grid, 1.5px stroke, outline default.
- **Type indicators**: colored text label only, no fill/badge/icon — same
  treatment in list and detail contexts.
- Old (pre-redesign) modules — Itemdex, Abilitydex, Naturedex, Berrydex,
  Movedex — keep their own layout/components/colors untouched, but now
  inherit the app-wide Plex Sans default like everything else.

## Known gotchas (already hit once)

- Bare element selectors in old CSS (`.panel h2`, `.panel section`) can
  silently outrank a component class by specificity. **`.panel section`
  has bitten once for real**: `margin-top: 2rem; padding-top: 1.5rem;
  border-top: 1px solid` reached every `<section>` on all four species-page
  tabs, and was the actual cause of what looked like three separate design
  problems (unremovable whitespace on the Learnset tab, a stray hairline
  above the first table, and an "airy" Info tab). When a page's own spacing
  will not respond to its own rules, check for one of these first.
- `:hover` can outrank `.active`/`.selected` at equal specificity if
  declared later — scope hovers to `:not(.active)`.
- Font stack order matters — list the self-hosted font first, or a
  same-named system font wins silently.
- A global font-family default and a per-module opt-in are mutually
  exclusive, same as the --accent situation — moving one to "everywhere"
  moves it everywhere, including untouched legacy modules.

## Known deferred debt (logged, not fixed)

Real, reproducible, and deliberately left alone. Each entry says why it is
not worth fixing yet — read that before "fixing" one as a drive-by, because
the reason is usually that the cheap fix is the wrong one.

- ~~**Leaving Build Form via the global app nav bar does not prompt for a
  shared build's unsaved edits.**~~ **Half fixed**, by the move to explicit save
  points. Build Form now flushes its draft from its own unmount cleanup, so an
  UNSHARED build survives leaving through the app bar — that path is covered by
  a check in verify-team-builder section 5. A SHARED build (2+ teams) still
  drops the edit there, and deliberately: the cleanup runs with the component
  already gone, so there is nobody left to ask which of save-back /
  save-as-new / discard was meant, and writing without asking would change every
  team that uses the build. The failure direction stays safe — the shared
  original is untouched. A real fix is still a cross-module navigation guard the
  nav layer consults BEFORE switching modules; **do not build a
  Team-Building-local version of that.**
- **Shedinja's fixed 1 HP is not special-cased in the stat math.** It is the
  one species whose HP does not follow the normal formula — it is always 1,
  at every level, with any DV/IV or EV spread — and `statMath.ts` computes it
  like everything else. Affects exactly one species (Gen 3+ only, since it
  does not exist before then). Low priority and an easy guarded early return
  whenever convenient.
