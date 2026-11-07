# pokeapp — project memory

Personal build-to-learn Pokémon companion PWA. Gen 1–4 scope, EXCEPT the
Poké, move and ability dexes and their learnsets, which reach Gen 9 (#1–1025,
32 version groups). Encounters, items, TMs and held items stay Gen 1–4
(`LEGACY_MAX_GENERATION` in `build-data.ts`; Gen 5+ groups have a null
`encounters_path`), and the only later items are the ones a later evolution
needs. Evolution charts go through `chainForGeneration` (`data/evolutionEra.ts`),
or a Gen 4 selection shows Sneasel evolving into Sneasler.
React + TypeScript + Vite, on GitHub Pages. **No backend the app depends on**: an
offline-first PWA. The one exception (owner, 2026-09-27): an OPTIONAL GitHub sign-in
(Supabase project `pokeapp` / `assooegomidatlnwbepb`) mirroring localStorage to one
row per user, RLS own-row only. localStorage stays primary; see `src/sync/`.

Only rules live here; reasons are in `docs/claude/rationale.md` and beside each
module. **STARTING A NEW MODULE? Read `/design-system/MODULE-PATTERNS.md` first**
(each pattern, the file to copy, the mistake it prevents). `DESIGN-SYSTEM.md` §12
is the as-built audit and wins wherever it disagrees with §1–§11.

## Workflow: requirements in, features out

The template and the reasons are in `docs/FEATURE-BRIEF.md`.

1. **Before code, ask once.** If a request is more than a one-file change and
   lacks a "Done when" or a "Not doing", reply with EVERY open question in one
   batch, the files you will touch, and the acceptance checks. No code until
   the owner answers. Never trickle questions across turns.
2. **New screen or redesign → mockup first** (static, real tokens, real data),
   for the owner to mark up: two redesigns built on a guess were reverted.
3. **One feature per branch**, named for the feature.
4. **Done = `npm run check` passes** (typecheck, lint of changed files, build,
   and the suites for the touched areas: `scripts/lib/suiteMap.mjs`), plus the
   "Done when" lines asserted in a suite where they can be, plus a browser look.
   On a branch whose work is committed, run `npm run check -- --since <base>`, or
   it checks nothing. The Stop hook runs only `check --fast`, then names what it
   left unchecked.
5. **Hand over a preview link** (see memory: push to the preview repo), and
   ask for one batched review with regions named from `?layout=1`.

Setup is `./init.sh` (Node 24 from `.nvmrc`, system Chrome). Progress is one line
per merged slice in `docs/PROGRESS.md`; `npm run status` prints the metrics.

## Architecture

- **Generation-scoped source of truth**: every dex module (species, moves, items,
  abilities) has its own scoped list function (`src/modules/dex/entrySources.ts`).
  Cross-module features (search, filters, the global selector) must reuse those
  functions — never a fresh index or raw bundle query. Generation-leak bugs came
  from exactly this.
- **Global GENERATION selector** filters the *entire* app: which species appear in
  lists, AND all data fields shown for them (moves, abilities, items, learnsets as
  of the selected generation). A full context every module respects, not a list
  filter. It picks a generation, not a game (owner, 2026-10-10), and lives in the
  account menu under the theme switch. Per-game data uses the generation's default
  game (`defaultGameOfGeneration`, `version-group/games.ts`). Where the game
  matters, a game row sits INSIDE the generation: Trainer Dex and Movedex "learned
  by" use `useGameInGeneration` + `GameRow`; the species page has its own
  `useSpeciesGameScope` (`pokedex/`). None of them can leave the generation, so
  none is an exception to the selector.
- **Exactly four sanctioned exceptions** to the global selector, each by the
  owner's request. **Do not add a fifth without asking.** Each is detailed in its
  module's CLAUDE.md:
  1. the species page Info tab's **locations** section — every game in one table;
     must stay lazy, gated on "is it on screen" (`pokedex/`);
  2. **Type Coverage**'s own generation selector (`typecoverage/`);
  3. the **Damage calculator** tab's own generation selector (`calculators/`);
  4. **Team Matchup**'s own GAME selector, seeded once per session (`team-matchup/`).
  The selector-owning ones share one shape: seeded once from the app selection,
  then independent, one-way.

- **The species page scales its Figma frame proportionally** (`--dp-u` units,
  type × `--dp-s`). A `rem`/`px` length there is a bug (`pokedex/CLAUDE.md`).
- **Sprites** are GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB). Keying, animated sets, slot encoding and
  the background colours' one use: `src/data/CLAUDE.md`.

## Data sourcing (don't deviate without asking)

- **PokéAPI** and **Bulbapedia** (automated, CC-licensed) are co-primary.
- **Serebii and Smogon are manual cross-check only — never scraped.**
- Trainer team data comes from **pret disassembly projects**, not PokéAPI.
- **Genuine per-generation mechanical accuracy is required**, not a modern-only
  model: Gen 1's unsplit Special stat, Gen 1–2's DVs/Stat Exp (not EVs/IVs),
  abilities and natures don't exist before Gen 3, and **hidden abilities don't
  exist before Gen 5**. Any component showing these fields must hide/adapt them.
- **PokéAPI's `past_` arrays are incomplete** — where a mechanic's start
  generation is a known fact, encode it as a rule (`src/data/era.ts`). Moves
  resolve per generation through `moveForGeneration` (`src/data/moveEra.ts`).
- **Japanese names come from `ja-roma`**, never a kana-to-romaji library
  (`src/data/CLAUDE.md`).

## Owner decisions (2026-11-06)

- **#22 Rental stays a set-vs-set comparator**: no team, no damage.
- **Alternate sprites stay on the Team Display** (`team-builder/altSprites.ts`).
- **Phone layout is parked.** Leave `feature/mobile-layout` alone.
- **Species card 212 × 214 is the reference** (`CARD_214`, `verify-design-system.mjs`).
- **`design-system/dist/tokens.css` is the winning token set.** Migrate
  `src/design-tokens.css` toward it over time, never in a feature commit.
- **"Has evolutions" stays a stub.**
- **HGSS rentals reuse Platinum's pool, unconfirmed** (flagged in `docs/tools/PLAN.md`).

## Signed off — do not touch without being asked

Frozen by the owner: a change needs a request, not a justification. They are also
**excluded from the design-system migration** (2026-10-04). Measurements and
rationale: `src/modules/team-builder/CLAUDE.md` — read it before touching any.

- **Team Display** (`.tb-team-viewer`), with its `--tb-slot-card: 260px` and
  seven-line order; **Team Library card width** `--tb-compact-card: 127px`.
- **Coverage panel placement** (`Popover`, `.tb-popover`) and **attacking
  coverage** (`OffencePanel`): counts per tier, one table at both scopes.
- **An immunity is never counted as a resistance** (Weak / Resist / Immune).
- **Build Form: the owner's nine changes** (2026-10-04).

Working near them: a shared component a frozen screen uses must not change in
place — add a NEW version beside it (e.g. `FooV2`). Global values still reach
them: after any global token or font change, run `npm run verify:team-builder`.

## Verification discipline

- **"Reported done" ≠ "verified"**: a browser look or an equivalent real check.
- **Stop and ask, don't over-engineer**: when an automated approach gives wrong
  results, pause and ask rather than apply a cleverer algorithm.
- **Servers start only through `scripts/lib/devServer.mjs`**, one fixed port per
  script; suites self-host and drive the system Chrome. **Worktrees live in
  `../pokeapp-worktrees/`** (`npm run worktree`), never inside the repo.
- **Prettier is not a gate**: 260 files predate it. Never run `npm run format`
  over the repo (it once rewrapped five calculator files that had to be restored).

## Design system

Source of truth: `design-system/` (`PRINCIPLES.md`, `PATTERNS.md`, then
`components/<name>.md` before touching a component; `preview.html` shows them
all). Token builds, the contrast check, the CHANGELOG rule: `design-system/CLAUDE.md`.

- Never hardcode colors, font sizes, weights, spacing or radii. Use the
  variables from `design-system/dist/tokens.css`; components use semantic tokens
  only, never primitives (`--color-accent-600` etc.).
- Theme `data-theme` on `<html>`, density `data-density` on the root. **No
  `box-shadow`, anywhere, either theme**: elevation is a tone-step.
- **`--accent` (red) has exactly TWO uses**: the active nav item and the selected
  tab. **At most 2 per screen.** Emphasis → `--color-text-default`; lines
  (stat-bar fill, gender-ratio female share) → `--color-border-strong`. Existing
  code still uses `--accent` for retired uses until each screen is migrated — do
  not "fix" one as a drive-by.
- **NOTHING gets a badge** — no fill, pill or chip, anywhere. A type is its
  colored name text; a game name is label size in `--text-secondary`.
- **The hairline-band rule**: rows with their own `border-bottom` get no row
  `gap` — never both. Verify by reconstructing the band from the hairlines.
- **Base-stat bars** are a stat table's one graphic (no ticks). No hover backgrounds,
  no underlined text; ghost buttons and underline fields only; headings and labels regular weight.
- **Fonts: IBM Plex Sans (text), Martian Mono (tabular numbers only)**, self-hosted.
- **Icons**: Tabler, 24px grid, 1.5px stroke, outline default.
- Pre-redesign modules (Itemdex, Abilitydex, Naturedex, Berrydex, Movedex) keep
  their own layout/components/colors.

## Laying out a screen

- **Position by AREA, not by coordinate**: a container placing more than two
  children declares `grid-template-areas`; no absolute offsets inside it.
- **No raw px gaps**: a module needing gaps below 8px declares a scale once (as
  `.tb` does with `--tb-1`…`--tb-6`).
- **Name the regions**: layout containers carry `data-layout="<name>"`.
- **Nothing may be clipped**: every module root contains a `ScrollArea`.
- **Layout inspector**: `?layout=1` or Ctrl+Shift+L (`LayoutOverlay.tsx`). Ships
  in production on purpose: the owner reviews the preview from a phone.
- Gotchas already hit: bare element selectors in old CSS (`.panel h2`,
  **`.panel section`**) outrank component classes; `:hover` declared after
  `.active`/`.selected` outranks it (scope hovers to `:not(.active)`); a global
  default and a per-module opt-in (font, accent) are mutually exclusive.

## Known deferred debt (logged, not fixed)

Deliberately left alone (the cheap fix is usually wrong); detail beside each module.
- The "Has evolutions" filter is a UI-only stub, by decision (`pokedex/`).
- 13 Gen 8-9 evolution requirements have no trigger kind (`pokedex/`).
- The Build Form does not autosave; every other screen does (`team-builder/`).
- Basculegion and Oinkologne lack female sprite fields (`src/data/`).

## Module rules live beside the module

A nested CLAUDE.md loads on the first read of a file under its directory. **Read it first.**

| Area | File |
|---|---|
| Signed-off screens (measurements, rationale), the unsaved member, Build Form saving, Team Building debt | `src/modules/team-builder/CLAUDE.md` |
| Species page (proportional scale, Info locations), grid and list views, "Has evolutions", evolution triggers | `src/modules/pokedex/CLAUDE.md` |
| Data layer: sprites, era resolution, Japanese names, gender-sprite exceptions | `src/data/CLAUDE.md` |
| Collection: schema v2, migration, candidate flags | `src/modules/collection/CLAUDE.md` |
| Type Coverage, Damage calculator and their selectors | `src/modules/typecoverage/CLAUDE.md`, `src/modules/calculators/CLAUDE.md` |
| Team Matchup, its selector, the battle engine | `src/modules/team-matchup/CLAUDE.md` |
| Dex search / filter / sort | `src/modules/dex/CLAUDE.md` |
| The scroll model (`ScrollArea`) | `src/components/CLAUDE.md` |
| The back stack (`navHistory`, `navGuard`) | `src/modules/nav/CLAUDE.md` |
| Saved documents (versioned store, migrations, export/import) and their sync | `src/store/CLAUDE.md` |
| Trainer Dex and its bundle | `scripts/trainers/CLAUDE.md` |
| Tokens build, contrast check, CHANGELOG | `design-system/CLAUDE.md` |
| Bulbapedia supplement, verification plumbing, worktrees, CI | `scripts/CLAUDE.md` |
| Entity links (typed refs, deep links); curated data pipeline | `src/lib/entities/CLAUDE.md`, `scripts/curated/CLAUDE.md` |
