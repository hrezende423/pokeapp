# pokeapp — project memory

Personal build-to-learn Pokémon companion PWA. Gen 1–4 scope, EXCEPT the
Poké, move and ability dexes and their learnsets, which reach Gen 9 (#1–1025,
32 version groups). Encounters, items, TMs and held items stay Gen 1–4
(`LEGACY_MAX_GENERATION` in `build-data.ts`; Gen 5+ groups have a null
`encounters_path`), and the only later items are the ones a later evolution
needs. Evolution charts go through `chainForGeneration` (`data/evolutionEra.ts`),
or a Gen 4 selection shows Sneasel evolving into Sneasler.
React + TypeScript + Vite. GitHub Pages + GitHub Actions CI/CD.
**No backend the app depends on** — everything runs client-side, offline-first PWA.
The one exception, by the owner's decision (2026-09-27): an OPTIONAL sign-in
(GitHub, via Supabase project `pokeapp` / `assooegomidatlnwbepb`) that mirrors the
Team Builder's localStorage document to one row per user (`team_builder_docs`; the
account menu's name and picture live in `profiles`, both
RLS own-row only) so it follows the owner across devices. localStorage stays the
primary copy; signed out, nothing changes. See `src/sync/`.

This file is only the rules that must never be re-derived, re-explained, or
re-litigated in a fresh session. The reasons behind them are in
`docs/claude/rationale.md`, the module rules beside each module (table below),
and the design rationale in `/design-system/DESIGN-SYSTEM.md`.

**STARTING A NEW MODULE? Read `/design-system/MODULE-PATTERNS.md` first.**
It is the build reference — every pattern the Pokédex grid and species
detail page established, each with the file to copy from and the mistake it
exists to prevent. `DESIGN-SYSTEM.md` §12 is the as-built audit of those two
screens and is authoritative wherever it disagrees with §1–§11.

## Workflow: requirements in, features out

The template and the reasons are in `docs/FEATURE-BRIEF.md`.

1. **Before code, ask once.** If a request is more than a one-file change and
   lacks a "Done when" or a "Not doing", reply with EVERY open question in one
   batch, the files you will touch, and the acceptance checks. No code until
   the owner answers. Never trickle questions across turns.
2. **New screen or redesign → mockup first** (static, real tokens, real data)
   for the owner to mark up. Do not build a full redesign on a guess — two were
   built and reverted that way.
3. **One feature per branch**, named for the feature. Don't pile unrelated work
   onto the current branch; ask if unsure which branch something belongs on.
4. **Done = `npm run check` passes** (typecheck, lint of changed files, build,
   and the verify suites for the touched areas — see `scripts/check.mjs`), plus
   the "Done when" lines asserted in a suite where they can be, plus a
   browser look. On a feature branch whose work is committed, run
   `npm run check -- --since <base branch>`, or it checks nothing. A Stop hook
   runs `check --fast`; it is not the whole gate.
5. **Hand over a preview link** (see memory: push to the preview repo), and
   ask for one batched review with regions named from `?layout=1`.

## Architecture

- **Generation-scoped source of truth**: every dex module (species, moves,
  items, abilities) has its own scoped list function
  (`src/modules/dex/entrySources.ts`). Cross-module features (search,
  filters, the global selector) must reuse those functions — never a fresh
  index or raw bundle query. Generation-leak bugs came from exactly this.
- **Global GENERATION selector** filters the *entire* app: which
  species appear in lists, AND all data fields shown for them (moves,
  abilities, items, learnsets as of the selected generation). Not just a list
  filter — a full context that every module must respect. It picks a
  generation, not a game (owner, 2026-10-10), and lives in the account menu
  under the theme switch. Per-game data uses the generation's default game
  (`defaultGameOfGeneration`, `version-group/games.ts`); the screens where the
  game matters — species page, Trainer Dex, Movedex "learned by" — have their
  own game row INSIDE the generation (`useGameInGeneration` + `GameRow`). Those
  rows are not exceptions to the selector: they cannot leave its generation.
- **Exactly four sanctioned exceptions** to the global selector, each by the
  owner's request. **Do not add a fifth without asking.** Each is detailed in
  its module's CLAUDE.md:
  1. the species page Info tab's **locations** section — every game in one
     table; must stay lazy, gated on "is it on screen" (`pokedex/`);
  2. **Type Coverage**'s own generation selector (`typecoverage/`);
  3. the **Damage calculator** tab's own generation selector (`calculators/`);
  4. **Team Matchup**'s own GAME selector, seeded once per session
     (`team-matchup/`).
  The selector-owning ones share one shape: seeded once from the app
  selection, then independent, one-way.
- Favor extensibility (Gen 5+ additions via config) over refactoring.
- **The species detail page scales its Figma frame proportionally** (`--dp-u`
  units, type × `--dp-s`). A `rem`/`px` length or spacing there is a bug.
  Detail in `src/modules/pokedex/CLAUDE.md`.
- **Sprites** are GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB). `species-background-colors.json`
  applies ONLY to the species page's artwork panel. Gen 1–2 white-background
  keying, the two animated sets and slot encoding: `src/data/CLAUDE.md`.

## Data sourcing (don't deviate without asking)

- **PokéAPI** and **Bulbapedia** (automated, CC-licensed) are co-primary.
- **Serebii and Smogon are manual cross-check only — never scraped.**
- Trainer team data comes from **pret disassembly projects**, not PokéAPI.
- **Genuine per-generation mechanical accuracy is required**, not a
  modern-only model: Gen 1's unsplit Special stat, Gen 1–2's DVs/Stat Exp
  (not EVs/IVs), abilities and natures don't exist before Gen 3, and
  **hidden abilities don't exist before Gen 5**. Any component showing
  these fields must hide/adapt them per the active generation.
- **PokéAPI's `past_` arrays are incomplete** — where a mechanic's start
  generation is a known fact, encode it as a rule (`src/data/era.ts`). Moves
  resolve per generation through `moveForGeneration` (`src/data/moveEra.ts`).
  Detail in `src/data/CLAUDE.md`.
- **Japanese names come from `ja-roma`** (official romanization: "Gangar",
  not "gengaa"). Never a kana-to-romaji library. Codes are lowercase
  (`ja-hrkt`) — the documented casing silently returns null.

## Signed off — do not touch without being asked

Frozen by the owner: a change here needs a request, not a justification. They
are also **excluded from the design-system migration** (2026-10-04).

- **Team Display** (`.tb-team-viewer`): sprite sized from what the text
  leaves over, `--tb-slot-card: 260px`, the seven-line order on
  `variant="full"`, mono lines levelled by cap height (`--tb-slot-mono`).
- **Coverage panel placement** (`Popover` in `team-builder/ui/Overlay.tsx`,
  `.tb-popover`): portalled, fixed, framed by `.panel`; the `--tb-*` scale is
  hosted on `.tb, .tb-popover` and `box-sizing: border-box` is load-bearing.
- **An immunity is never counted as a resistance** (`TeamMatchup`: Weak /
  Resist / Immune).
- **Attacking coverage** (`OffencePanel`, `team-builder/ui/TypeMatchup.tsx`):
  counts attacks per tier, one table at both scopes.
- **Team Library card width** `--tb-compact-card: 127px` is a measured constant.
- **Build Form: the owner's nine changes** (2026-10-04).

Working near them:
- **A shared component a frozen screen uses must not change in place.** Add a
  NEW version beside it (e.g. `FooV2`) for migrated screens.
- **Global values still reach them.** After any global token or font change,
  run `npm run verify:team-builder` (a Manrope trial failed 3 checks there).
- Measurements and rationale: `src/modules/team-builder/CLAUDE.md`. Read it
  before touching any of them.

## Verification discipline

- **"Reported done" ≠ "actually verified."** Visual/browser confirmation
  (or an equivalent real check) is required before marking anything done
  — not just that code compiles or type-checks pass.
- **Stop and ask, don't over-engineer.** When an automated approach
  produces wrong results, pause and ask; don't apply a cleverer algorithm.
- Ambiguity → ask. Don't silently pick a resolution for anything not
  explicitly covered here or in the fuller docs.
- **Every script that starts a server goes through `scripts/lib/devServer.mjs`**
  and owns its own port; a new browser suite must self-host. Detail in
  `scripts/CLAUDE.md`.
- **Prettier is not a gate**: 260 files predate it. Never run `npm run format`
  over the repo (it once rewrapped five calculator files that had to be restored).

## Design system

Source of truth: `design-system/`. Read `PRINCIPLES.md` and `PATTERNS.md`
first, then `components/<name>.md` before building or changing any UI
component. `design-system/preview.html` shows every component and state.

- Never hardcode colors, font sizes, weights, spacing or radii. Use the
  variables from `design-system/dist/tokens.css`; components use semantic
  tokens only, never primitives (`--color-accent-600` etc.).
- Theme: `data-theme="light|dark"` on `<html>`; density:
  `data-density="airy|default|compact"` on the page root.
- **No `box-shadow`, anywhere, either theme.** Elevation is a tone-step.
- **`--accent` (red) has exactly TWO uses**: the active nav item and the
  selected tab. **At most 2 per screen.** Emphasis → `--color-text-default`;
  lines (stat-bar fill, gender-ratio female share) → `--color-border-strong`.
  Existing code still uses `--accent` for the retired uses until each screen
  is migrated — do not "fix" one as a drive-by.
- **NOTHING gets a badge** — no fill, pill or chip, anywhere. A type is its
  colored name text; a game name is label size in `--text-secondary`.
- **The hairline-band rule**: rows with their own `border-bottom` get no row
  `gap` — never both. Verify by reconstructing the band from the hairlines.
- **Base-stat bars** are the one sanctioned graphic in a stat table; no ticks.
- No hover backgrounds; no underlined text; ghost buttons only; underline text
  fields only; headings and UPPERCASE labels are regular weight.
- **Fonts: IBM Plex Sans (text), Martian Mono (tabular numbers only)**,
  self-hosted, leading the stack, Roman AND italic faces. New code uses
  `--font-family-sans` / `--font-family-mono` (`--font-body`/`--font-numeric`
  are aliases). Never assert italic from a computed style — measure the advance.
- **Icons**: Tabler, 24px grid, 1.5px stroke, outline default.
- Pre-redesign modules (Itemdex, Abilitydex, Naturedex, Berrydex, Movedex)
  keep their own layout/components/colors.
- **Tokens**: never hand-edit `dist/tokens.css`. Change `tokens.json`, run
  `python3 design-system/scripts/build-tokens.py` then
  `python3 design-system/scripts/check-contrast.py` (must show `fails: 0`).
  **On Windows set `PYTHONUTF8=1`** (and `py` if `python3` is missing), or
  `tokens.css` is written non-UTF-8 and the Vite build fails.
- A design change = update the matching `components/*.md` + CHANGELOG entry in
  the same commit.

## Laying out a screen

- **Position by AREA, not by coordinate**: a container placing more than two
  children declares `grid-template-areas`; no absolute offsets inside it.
- **No raw px gaps**: a module needing gaps below 8px declares a scale once
  (as `.tb` does with `--tb-1`…`--tb-6`).
- **Name the regions**: layout containers carry `data-layout="<name>"`.
- **Nothing may be clipped**: every module root contains a `ScrollArea`.
- **Layout inspector**: `?layout=1` or Ctrl+Shift+L
  (`src/components/LayoutOverlay.tsx`). Ships in production on purpose — the
  app is reviewed on the deployed preview from a phone.

## Known gotchas (already hit once)

- Bare element selectors in old CSS (`.panel h2`, **`.panel section`**) outrank
  component classes. When a page's spacing ignores its own rules, check these first.
- `:hover` can outrank `.active`/`.selected` if declared later — scope hovers
  to `:not(.active)`.
- A global default and a per-module opt-in (font, accent) are mutually
  exclusive — moving one to "everywhere" reaches untouched legacy modules too.

## Known deferred debt (logged, not fixed)

Deliberately left alone; the cheap fix is usually the wrong one.

- **The Pokédex's "Has evolutions" filter is UI-only** (`stub: true`), pending
  the owner's definition: "can still evolve" or "is in a multi-stage line".
- **Build Form does not autosave; every other screen does.** Deliberate — see
  `src/modules/team-builder/CLAUDE.md`.
- **verify-design-system: 12 species-card geometry checks fail** (card is
  212 × 214 vs Figma's 199-high aspect, after the owner's looser leading). Needs
  the owner to decide whether 214 is the new reference. `npm run check` passes it
  only while exactly these 12 fail (`KNOWN_FAILING` in `scripts/check.mjs`).

- **verify-scroll-nav §2 is flaky: ~1 run in 3 the Pokédex grid comes back at
  1455 instead of 900** after opening a species and going back. It predates the
  tools work (it failed at HEAD before any of it). Ruled out on 2026-10-15:
  coalesced scroll events swallowing the reader's scroll, and CSS scroll
  anchoring. `npm run check` retries it up to three times (`FLAKY` in
  `scripts/check.mjs`) and prints every failed attempt. Needs a real diagnosis.

## Module rules live beside the module

A nested CLAUDE.md loads on the first read of a file under its directory.
**Read the matching file before changing anything in that area.**

| Area | File |
|---|---|
| Signed-off screens (measurements, rationale), the unsaved member, Build Form saving, Team Building debt | `src/modules/team-builder/CLAUDE.md` |
| Species detail page (proportional scale, Info locations), grid and list views, "Has evolutions" | `src/modules/pokedex/CLAUDE.md` |
| Data layer: sprites, era resolution, Japanese names | `src/data/CLAUDE.md` |
| Type Coverage and its selector | `src/modules/typecoverage/CLAUDE.md` |
| Damage calculator and its selector | `src/modules/calculators/CLAUDE.md` |
| Team Matchup, its selector, the battle engine | `src/modules/team-matchup/CLAUDE.md` |
| Dex search / filter / sort | `src/modules/dex/CLAUDE.md` |
| The scroll model (`ScrollArea`) | `src/components/CLAUDE.md` |
| The back stack (`navHistory`, `navGuard`) | `src/modules/nav/CLAUDE.md` |
| Trainer Dex and its bundle | `scripts/trainers/CLAUDE.md` |
| Bulbapedia supplement, verification plumbing | `scripts/CLAUDE.md` |
