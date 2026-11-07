# Type Coverage

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Type Coverage (Poképedia)

Four tabs — **Matrix | Flow | Against | Card**, Matrix leading and default.
Built from `design-system/typechart-mockup.html`, which stays as the design
record and is NOT app code.

- **Matrix is ONE computation read two ways.** `defendingRows` is built per
  defending typing in attacking-type order; Custom renders it as it stands,
  Standard reads the same array with the loops exchanged. The transpose is an
  index swap, never a second table — that is what makes the two orientations
  incapable of disagreeing about a cell. Do not add a separate Standard path.
- **Custom is the default orientation**, and it is the only one that can show
  4x / ¼x: those tiers need a defender holding two types, and only the row
  axis carries a pair. 31 cells reach 4x in Gen 4, 48 fall to ¼x.
- **Toggles B (Full/Single) and C (Existing/All) are Custom-only**, hidden
  rather than disabled, and **switching orientation RESETS both to their
  defaults plus clears the type filter** — by explicit request, so nobody
  reads a matrix shaped by a control they cannot see.
- **STANDARD DOES NOT PRUNE ITS AXES BY WHAT EXISTS**, and this is where the
  brief contradicted itself. Standard is specified as "the traditional
  layout" *and* as forcing Existing; those cannot both hold, because the
  printed chart is a chart of the type system. Measured: nothing in Gen 1–4
  is pure Flying, and in Gen 1 nothing is pure Rock, Ghost or Ice either — so
  pruning made the Gen 1 chart 11 columns against 15 rows. Existing keeps its
  stated meaning where it is a CONTROL (Custom); Standard shows the full
  system. **CONFIRMED by the owner — keep the columns. Settled; do not
  re-litigate.**
- **The matrix table is its own scroller and that is load-bearing.**
  `position: sticky` resolves against the nearest *scrolling* ancestor, so a
  table that merely grows the page has nothing to stick to — the mockup's
  column headers already declared `top: 0` and still scrolled away for
  exactly that reason. **Both axes freeze**: vertical was the request, and the
  horizontal row-header freeze was kept deliberately on request.
- **The dark row highlight could not use `--surface-hover`.** In dark that
  token is `#141414`, byte-identical to `--surface`, so the rule painted a
  colour indistinguishable from the page while the CSS looked correct.
  `--surface-raised` is the reuse, per "elevation is a tone-step".
- **The type filter is underlined, not filled**, and is deliberately NOT
  `components/TypeFilter.tsx` — that one fills selected buttons with the type
  colour, which is the chip the design system forbids. It is kept for the
  pre-redesign dexes; reusing it here would import a forbidden pattern.
- **"By type" was dropped on request** and never built in `src/`. "Defending"
  is not missing either — it IS Matrix's Custom orientation.
- **Registered in `typecoverage/pages.ts`, NOT in `DEX_MODULES`.** It is not a
  dex (no entry list, no per-entry selection) and `registry.ts` is the single
  source of truth for what a dex is — `verify-dexes` walks that array and
  requires each entry to mount a `dex-<id>` rows table. Same arrangement as
  `team-builder/pages.ts`, for the same reason. Consequence: `dex-switcher`
  wraps this entry too, so verify-dexes narrows to the registered dex ids
  rather than asserting nothing else shares the wrapper.
- **TWO NAMED REGIONS, AND ONLY THE LEFT ONE SCROLLS.**
  `data-layout="type-coverage-main"` is a grid of `content rail` — the view
  left inside its own `ScrollArea`, the controls right **outside** it, directly
  under the tab strip. The rail is a SIBLING of the scroller, not a child:
  `position: sticky` inside one scroller would look identical until the rail
  grew taller than the window, then scroll away too. `.tc-main` needs
  `flex: 1; min-height: 0` or the grid grows to fit all 153 rows and nothing
  scrolls — the bottom just becomes unreachable. `.tc-scroll-col` exists
  because `ScrollArea` is `flex: 1; min-height: 0` and needs a bounded flex
  parent to resolve against. Two scrollers side by side is an established
  arrangement here (the Itemdex rail and its detail panel), which is why
  `ScrollArea`'s back-to-top anchors to its own section, not the viewport. The generation
  dropdown has to land in the SAME place on all four tabs, so the rail belongs
  to the shell and Matrix's toggle state lives in `useMatrixControls` rather
  than inside the view. **`--tc-rail: 132px` is a FIXED track and that is
  load-bearing**: sized to its content the rail sat 47px further right on the
  three tabs with no toggles, so the one control common to all four moved as
  you switched. 132px was measured against the old Combinations pill; the text
  labels that replaced it are narrower. Moving a control is editing that grid,
  not editing a view.
- **The three Matrix toggles are text labels in the tab strip's style**
  (owner, 2026-10-10): the tabs' 13px (`--tc-tab-size`, ds.css has no token for
  it) and gap, no pill. Selected is bold `--text-primary`, never the accent —
  the nav item and the selected tab already spend both accent uses. The selected
  tab has no underline on this page (scoped to `.tc-subnav`; the species page
  keeps its own).
- **The column headers' bottom hairline is a pseudo-element, not a border.**
  Under `border-collapse: collapse` the collapsed borders are painted by the
  TABLE, so a `position: sticky` header travels without its own bottom border —
  the cell's `borderBottomWidth` reads as set while nothing is drawn. Verify it
  off the `::after`, never off the cell. `border-collapse: separate` would also
  fix it, at the cost of hand-managing every shared edge in a 17-column table.
- **`--tc-control-size` (caption) is declared once** so the rail's labels and
  the type filter cannot drift apart (the toggles left it for the tab size); the table stays the loudest thing on
  the page. Assert it against `--font-size-label` read off the page, not
  against a hardcoded 10.
- **Flow is capped but NOT centred.** The 1040px cap stays (full-bleed, the
  wings were mostly whitespace and read as two columns). `margin: 0 auto` was
  removed on request — centred, it floated 80px in from the left with empty
  page either side, and the room it frees is the room the rail sits in.
- **Against wraps its type runs at four, in a GRID not a wrapping flex line.**
  Grid gives every line in a cell the same four column widths, so names align
  into columns instead of ragging wherever the wrap fell. That is what let the
  table drop its 620px `min-width`.
- **No page subtitle, no scope caption, and the row count is the corner cell's
  tooltip** — all removed/moved on request. The per-generation chart notes went
  with the subtitle; Gen 1 is still genuinely its own chart, just not narrated.
- **`typeCombos.ts` is combo-shaped everywhere**, and that is deliberate
  future-proofing: Flow, Against and Card are expected to grow dual-type
  support, so nothing takes a bare `typeId` on the defending side and the
  three single-type views call `singleCombos()`. It computes no chart of its
  own — `typeEffectivenessAgainst` in `data/era.ts` already composes across a
  dual typing, and a wrong matrix still renders as a matrix.


## Its own generation selector (moved from the root CLAUDE.md)

- **Type Coverage has its OWN generation selector — the SECOND sanctioned
  exception**, also by explicit request (`useTypeCoverageScope`). The
  question that page asks is "which type chart, and which combinations
  really exist" — asked *about* a generation rather than inside one — so
  answering it must not re-filter the app behind it. It seeds from the app
  selection once on mount (the `useSpeciesGameScope` pattern) and then
  diverges; the dependency runs one way only, so neither selector can move
  the other. Generation only, no version-group axis: every game in a
  generation shares one chart, so a second row would offer a choice that
  changes nothing.
