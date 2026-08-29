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
- Sprites: GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB total, too large to bundle).
  `species-background-colors.json` lives in the same repo, fetched at
  runtime — applies ONLY to the species detail page's artwork panel,
  never the grid or any other screen.

## Data sourcing (don't deviate without asking)

- **PokéAPI** and **Bulbapedia** (automated, CC-licensed) are co-primary.
- **Serebii and Smogon are manual cross-check only — never scraped.**
- Trainer team data comes from **pret disassembly projects**, not PokéAPI.
- **Genuine per-generation mechanical accuracy is required**, not a
  modern-only model: Gen 1's unsplit Special stat, Gen 1–2's DVs/Stat Exp
  (not EVs/IVs), abilities and natures don't exist before Gen 3. Any
  component showing these fields must hide/adapt them per the active
  generation, not just always show the modern version.

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
- **`--accent` (red) has exactly three uses**: active tab/nav state,
  binary state indicators, error/validation emphasis. Never decoration.
  App-wide, not namespaced.
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
  silently outrank a component class by specificity.
- `:hover` can outrank `.active`/`.selected` at equal specificity if
  declared later — scope hovers to `:not(.active)`.
- Font stack order matters — list the self-hosted font first, or a
  same-named system font wins silently.
- A global font-family default and a per-module opt-in are mutually
  exclusive, same as the --accent situation — moving one to "everywhere"
  moves it everywhere, including untouched legacy modules.
