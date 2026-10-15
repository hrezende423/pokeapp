# Pokédex

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## The Pokédex's two views

- **Grid** — the Figma MainPage frame: 212px cards, three columns, 9px gaps
  both ways (the row gap was Figma's 17px until the owner evened it,
  2026-10-10). The card prints `#0001` before the name again, the name and the
  BST/Speed numbers are regular weight, and the ability line is
  `line-height: normal` (at 1 it clipped descenders). Its Sort menu offers only what a card prints (Dex #, Name, BST,
  Speed). **The card gained a fourth line** (`BST 318 · Spe 45`) and the card did
  NOT grow: the 5px came out of the bottom two lines' LEADING, because the card
  height and the y of the number, type and ability lines are Figma ratios
  `verify-design-system` asserts and leading is the one dimension that is not.
  The Breeding dex's cards gained a gender row the same way — and
  `.species-card-egg-group` needs `line-height: inherit`, because a `<button>`
  does not inherit it and its UA box was 3px taller than its line.
- **List** — 44 columns (`pokedex/speciesColumns.tsx`), **one fact per column,
  never a joined list**: two type columns, two ability columns plus the hidden
  slot, two egg-group columns and one EV-yield column per stat. A cell reading
  "Grass/Poison" sorts under G, which is not a column. The EV block follows the
  same era rule as the base stats beside it and is absent before Gen 3.
  **The identity block — national # → Speed, fifteen columns — fits the
  window**; the rest are over a horizontal scroll. **This table sorts itself from
  its own headers** — it is NOT wired to the bar's sort state, because the menu
  holds four keys and the table has 44, so a header click would set a key the
  menu could not hold and the fallback would silently do nothing.
- **A table's own widths only win because it says so.** `Column.width` emits a
  `<colgroup>`, and DataTable also marks the table `data-table-sized`. Both are
  needed. The positional `.data-table th:nth-child(n)` rules were written for the
  Movedex's original six columns and reach every table in the app; they are
  wrapped in `:where()` so anything declaring its own widths outranks them, and
  the marker class resets the cell widths outright — because Chrome's fixed
  layout takes the LARGER of the column's width and the first row's cell width,
  so a colgroup alone left the first column at 282px against the 70px it asked
  for. **And `.data-table-sized` is `width: min-content`**: under `width: auto`
  Chrome sizes the table by the CONTENT algorithm first, so one overlong cell
  still set its column (Eevee's seven evolutions made "Evolves to" 1359px against
  a declared 360px) while every other column obeyed.
- **The list view is the app's one horizontally scrolling section**, via
  `ScrollArea`'s `horizontal` prop. It shipped without one: `.scroll-area` sets
  `overflow-x: hidden` for every other scroller, so the columns past the twelfth
  were not merely off-screen but unreachable. The bar is drawn, not native, and
  it lives in the OUTER frame rather than at the foot of the content — a bar
  below 493 rows is a control you have to scroll to the bottom to reach.
  `useScrollThumb` takes an axis rather than being copied. **Its idle state is
  the one that is visible rather than invisible**, and that is deliberate: the
  vertical thumb can fade to nothing because the scroll-down chevron still says
  "more below", and there is no sideways equivalent of that cue.
- **Regional dex numbers are a written-out table**, not derived: a generation
  does not determine the dex (FRLG are Gen 3 and use KANTO, Platinum extends
  Sinnoh, HGSS use updated-johto). Colosseum, XD and "All games" have none and
  print a dash rather than borrowing a number.

**BLOCKED — the Pokédex's "Has evolutions" FILTER is UI-only.** It renders, it
is settable, and it deliberately never matches and never counts as active
(`stub: true`), with a note on screen saying so. The semantics need a decision:
*can still evolve further* (excludes Charizard) or *belongs to a multi-stage
line* (includes it). The list view's **"Further evo" COLUMN** is not blocked and
is implemented — "further" is unambiguous — so the definition for the filter is
one line away in `speciesQuery.ts` once the reading is chosen.


## The species detail page (moved from the root CLAUDE.md)

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
- **No ALL-CAPS on the species detail page.** One block in `pokedex.css`
  scoped to `.species-page` turns `text-transform: uppercase` into
  `capitalize` and drops the tracking to 0.01em. Scoped, not global: the
  five pre-redesign dexes and the design-system reference page keep their
  own typography.
