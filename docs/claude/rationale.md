# Rationale behind the root CLAUDE.md rules

Moved verbatim out of the root `CLAUDE.md` (2026-10-15) so the always-loaded
file holds rules only. Read the matching section before arguing with a rule.

## Design system non-negotiables

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
- **`--accent` (red) has exactly TWO uses**: the active nav item and the
  selected tab — wayfinding, "you are here". **At most 2 accent elements per
  screen.** Decided 2026-10-04 with the new design system
  (`design-system/PRINCIPLES.md`), replacing the earlier four-use rule. The two
  retired uses move to neutrals, via the design-system tokens:
  - **emphasis** (binary state indicators such as caught/not-caught, and
    error/validation emphasis) → `--color-text-default`;
  - **lines** (the filled portion of a base-stat bar, the gender-ratio bar's
    female share) → `--color-border-strong`. The male share and the track stay
    neutral too, never a literal `#fff`.
  Never decoration. App-wide, not namespaced. **Existing code still uses
  `--accent` for the retired uses until each screen is migrated** — do not
  "fix" one as a drive-by; migrate it with its screen.
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
- **Fonts: IBM Plex Sans for text, Martian Mono for values** (Manrope was tried
  on 2026-10-04 and reverted the same day: it draws ~9% larger than Plex at the
  same px, which broke the Team Display's levelled cap heights). The design
  system's `--font-family-sans` / `--font-family-mono` carry these stacks
  (source `design-system/tokens.json` -> `dist/tokens.css`, never hand-edit the
  dist) and the old names are ALIASES of them in `src/design-tokens.css`:
  `--font-body` = `var(--font-family-sans)`, `--font-numeric` =
  `var(--font-family-mono)`. New code uses the design-system names.
  Self-hosted, no CDN; the font must lead the stack, or a system font silently
  wins (happened once already). Mono is for tabular/functional numbers only.
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

## Excluded from migration

The migration to the new design system (`design-system/`, tokens in
`dist/tokens.css`) **does not touch these screens**. Decided 2026-10-04. They
are the signed-off screens above, frozen as they are:

- **Team Display** (`.tb-team-viewer`, the member cards and their sprite sizing)
- **Coverage panels** (`Popover` placement, `.tb-popover`, `--tb-*` scale)
- **Team Matchup defensive table** (Weak / Resist / Immune)
- **Attacking coverage** (`OffencePanel`, `.tb-matchup`)
- **Team Library card** (`--tb-compact-card`)

Rules for working near them:
- **Do not edit these files or their CSS** to migrate them.
- **A shared component a frozen screen uses must not change in place.** If the
  migration needs it different, add a NEW version beside it (e.g.
  `FooV2`) used by migrated screens, and leave the old one for the frozen ones.
- **Global values still reach them.** Any global token or font change lands on
  these screens without editing them, and their measured constants
  (`--tb-compact-card` 127px, `--tb-slot-card` 264px, the cap-height levelling)
  were measured with Plex Sans and Martian Mono. Re-run
  `npm run verify:team-builder` after any global change rather than assuming
  they still hold (a Manrope trial failed 3 checks there).

## Known gotchas

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

## Laying out a screen

Adopted after the Build Form took four review rounds of "move it up a bit".
Every one of those notes was about the same thing: elements placed by
independent pixel coordinates that did not refer to each other, so each fix
was local and the next complaint was too.

- **Position by AREA, not by coordinate.** A container that places more than
  two children declares `grid-template-areas` and each child takes a
  `grid-area`. Absolute `top`/`left` offsets inside a container are the
  smell — they encode a relationship ("just under the numeral") as a number
  that silently stops being true when the other thing changes. Moving an
  element should be swapping two words in the template.
- **No raw px gaps.** The design system's `--space-gap-*` starts at 8px,
  which is too coarse for dense form UI, so `.tb` declares its own scale
  (`--tb-1: 2px` … `--tb-6: 20px`). If a module needs gaps below 8px it
  declares a scale once; it does not pick numbers per rule.
- **Name the regions.** A layout container carries `data-layout="<name>"`.
  That name is the vocabulary for reviewing it — see below.
- **Nothing may be clipped.** `#root` is pinned to the viewport and `.panel`
  sets `overflow: hidden`, so a module taller than the window does NOT
  scroll — it is truncated, with the bottom unreachable. Every module root
  must contain a `ScrollArea`. Team Building shipped without one and the
  Build Form simply ended mid-page. verify-team-builder section 7 asserts
  reachability at a deliberately short viewport rather than asserting a
  height, which would only be true on the machine that ran it.

### The layout inspector

`?layout=1` on any URL, or Ctrl+Shift+L — `src/components/LayoutOverlay.tsx`.
Draws every `[data-layout]` region and every named grid area over the live
page, with sizes and column tracks. **It ships in the production bundle on
purpose**: this app is reviewed on the deployed preview from a phone, and a
`import.meta.env.DEV` gate would put it exactly where it is no use. ~2KB,
inert until switched on, `pointer-events: none` so the page stays usable.

Use it to REVIEW: screenshot with it on and name the region, rather than
describing a direction and a distance. It reads `grid-template-areas` from
the computed style, so a name it prints is a name in the stylesheet.

## Deferred debt, closed

- ~~**Leaving Build Form via the global app nav bar does not prompt for a
  shared build's unsaved edits.**~~ **FIXED** — the cross-module navigation
  guard this entry asked for now exists, in the nav layer, as
  `src/modules/nav/navGuard.ts`. See "The scroll model and the back stack"
  above. Build Form registers a blocker that delegates to its own `saveThen`,
  so the three-way question gets asked at every door rather than at the ones
  Team Building happens to know about — which now includes the back control, a
  second door that did not exist when this was logged. The unmount flush stays
  as the fallback for the paths no guard can cover (`pagehide`, a closing tab).
  verify-scroll-nav §5 drives both the nav bar and the back control, and
  asserts nothing is written while the question is open.
- **The Pokédex's "Has evolutions" filter is UI-only, pending a definition.**
  Not a bug and not an oversight: see "Dex search / filter / sort" above. It is
  `stub: true`, so it cannot narrow the list or read as active, and it says so on
  screen. Unblocked by one answer — "can still evolve" or "is in a multi-stage
  line" — and wired by one function in `speciesQuery.ts`.

- **verify-design-system: 12 species-card geometry checks fail** (both themes:
  the card is 212 × 214 against Figma's 199-high aspect, and the text lines'
  y-positions follow from that — the owner's 2026-09-27 looser leading). The
  suite now runs to the end (2026-10-11: the Tools order assertion was updated
  with Type Coverage's move, and the stale Itemdex ledger-row block that threw
  was rewritten for the table), so the static scans after it run again. The
  card checks need the owner to decide whether 214 is the new reference.
