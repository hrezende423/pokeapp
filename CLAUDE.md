# pokeapp — project memory

Personal build-to-learn Pokémon companion PWA. Gen 1–4 scope.
React + TypeScript + Vite. GitHub Pages + GitHub Actions CI/CD.
**No backend, ever** — everything runs client-side, offline-first PWA.

Full rationale for anything below lives in `/design-system/DESIGN-SYSTEM.md`
and `/design-system/design-tokens.json`. This file is only the rules that
must never be re-derived, re-explained, or re-litigated in a fresh session.

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
- **The Info tab's locations section must stay lazy.** Info is the default
  tab and the encounter partitions run to 2.8 MB, so it gates its own
  `versionGroup` argument behind an `IntersectionObserver` — the whole point
  of mounting one tab at a time is that opening a species costs no partition
  fetch, and an eager section there spends it silently. Three suites drive
  a scroll rather than a tab click because of this.
- Sprites: GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB total, too large to bundle).
  `species-background-colors.json` lives in the same repo, fetched at
  runtime — applies ONLY to the species detail page's artwork panel,
  never the grid or any other screen.
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
  `src/modules/pokedex/SPECIES-PAGE-PUNCH-LIST.md` §6a.
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
- **`--game-*` is a real palette now**: one colour per version, because
  PokéAPI has none (`version` carries id / name / names / version_group and
  nothing else). Source is the community version-colour set, corrected per
  theme by `scripts/calibrate-game-colors.mjs` to clear 4:1 against the 12%
  self-tint a badge paints behind it — same method as the type palette.
  Blue, Sapphire and Blue (JP) are TINTED toward white rather than scaled,
  because pure blue's luminance saturates at 2.3:1 on black.
- **A version label is the one thing that gets a badge.** Type indicators
  stay bare coloured text ("type is data, not decoration"); a game name is
  a NAME that repeats down a column and needs a shape to be scannable. It
  uses `--radius-badge-square`, which `design-tokens.json` sanctions and
  `TypeLabel` deliberately left unimplemented for want of a fill and
  text-colour spec. Do not generalise the badge to anything else without
  asking.
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
