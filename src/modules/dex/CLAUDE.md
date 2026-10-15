# Dex modules

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Dex search / filter / sort

**ONE "Sort/Filter" menu for the whole of Poképedia, in the app bar** (owner,
2026-10-10; it was three triggers: Grid/List, Sort, Search/Filter). Its panel is
three parts — **View mode · Sort · Search/Filter** — with a hairline BETWEEN
parts and none inside one; a part the page lacks is absent. The trigger is
**disabled, not hidden**, where there is nothing to view, sort or filter
(Naturedex, Type Coverage, Build Form, calculators, Team Matchup), and the
cross-dex search goes with it there. "Reset filters" is sticky at the panel top.
Every dex used to carry its own control row above its own list;
none does now. The bar is rendered ABOVE the active module in the tree, so a
module cannot hand its config upward — `DexQueryProvider` (app level, inside
NavProvider) builds the config for whichever page the nav says is active, owns
the state, and hands the filtered, sorted list back DOWN. `DexPageShell` renders
the COUNT and nothing else above the list: a readout, not a control.

- **A dex declares its filters and sorts as DATA, never as JSX.**
  `modules/dex/query/dexQuery.ts` defines the model — filter *sections*, each
  holding filters of six kinds (`text`, `multi`, `select`, `range`, `toggle`,
  `types`), plus `SortField`s. The configs live in
  `modules/dex/query/registries.ts` (and `pokedex/speciesQuery.ts` for species,
  which needs its own row type). `FilterPanel`/`SortPanel` render whatever they
  are handed. Add a filter by adding a definition; if a dex needs a control the
  model has no kind for, add a **seventh kind** — never an escape hatch.
- **The context is type-erased and `useDexRows(dexId)` guards it at runtime.**
  One dex's entries at a time, different shapes per dex, so the context carries
  `unknown` and a module asking while another dex is active THROWS rather than
  rendering a berry as a species.
- **Switching dex resets the query**, via `resetKey` — state carries the key it
  was written under and a mismatch derives back to defaults. Not an effect and
  not setState-during-render: no extra render, no frame of the previous dex's
  filters applied to this one's list.
- **`components/TypeFilter.tsx` has exactly ONE call site**: `FilterPanel`, via
  the `types` kind. Pokédex, Movedex and Berrydex all reach it from there.
  **It is a GHOST LABEL now, not a chip** — no border, no fill; every type name
  is in its own colour, regular, and selected adds bold (owner, 2026-10-10). That was the
  last badge in the app and its removal closes "type is data, not decoration".
- **`hidden: true` is how an era removes a filter**, and a hidden filter is
  skipped by the matcher as well as the renderer. Habitat is Gen 3+, egg groups
  Gen 2+, and Gen 1 offers the combined **Special** in place of the split pair.
- **Option lists are read off the entries in scope, never hardcoded.** The
  Itemdex's categories go further and are derived from the pocket selection
  (`FilterOptions` may be a function); `clampValues` drops a selection its own
  control has stopped offering.
- **One comparator, app-wide**: `components/sortValues.ts`, shared by
  `DataTable` and the sort panels. Stable, **null-last in both directions**.
- **Each dex's default sort IS its shipped order, declared as a field**
  (`Ability #`, `Berry #`, `Item #`, `Dex #`).
- **The panel dismisses on an outside click** — `useDisclosureGroup`, one open id. Destructure its result at the call
  site: it returns a ref, and the react-hooks lint refuses to let an object
  carrying a ref be passed to a function during render.
- **The menus are the smallest type in the app, at one size.** Everything in a
  `.dex-menu` is `--font-size-caption` — the size the egg-group names in the
  filter rows already used — so a 320px panel has one type size rather than
  three, and the tables it narrows stay the loudest thing on screen. The numeric
  range inputs go smaller still (`--dex-menu-mono`, 0.82 of it): Martian Mono
  draws about a fifth larger than Plex Sans at the same px, so at a shared size
  the numbers were visibly the biggest text in the menu.
  **`--dex-menu-row` is the type filter's own row gap**, lifted to every stacked
  gap in the panel, rather than five hand-picked numbers that drift apart. The
  hairline-separated blocks keep a little more (`--dex-menu-band`), because that
  padding is half of a band between two hairlines, not a gap between two rows.
- **The bar's order is Sort/Filter · account menu (theme inside)**, and the account
  menu being LAST is the point: the cluster is right-aligned, so the one
  control that belongs to no page never moves as the page-specific triggers come
  and go beside it. Its segments are sized to the word ("Light" + 2px either
  side, `min-width: 33px` measured), not to the full-95 spec's 12px inset.
- **A dex whose list is a table has NO bar sort; its headers sort it** — the
  Movedex, and since 2026-10-10 the Itemdex, Abilitydex, Breeding dex and
  Trainer Dex (they were ledger lists). Their registries declare no sort fields.
- **On the Pokédex list view the Sort part says "sort from the column headers"**
  instead of offering fields — the headers are the control there. The menu's
  `open` is ANDed with "this page has a part", so a panel can never be left open
  under a disabled trigger.
- **The Naturedex has no filters** (owner, 2026-10-10). `naturedexSections` is
  kept in `registries.ts`, unwired, so restoring it is one line in the provider.

## The reference dexes' table and detail pages (owner, 2026-10-11)

- **`DataTable plain`** is the Movedex/Abilitydex/Itemdex table: no hairlines,
  rows LIGHT at rest and the hovered ROW REGULAR instead of a hover fill (owner,
  2026-10-11; the first pass was regular -> semibold). It cannot move a column
  because every column is a declared width (colgroup, fixed layout); a prose cell
  must be `ProseCell`, which reserves its hover-weight height so a hover cannot
  re-wrap a sentence and grow the row. Opt-in: Movedex, Abilitydex, Itemdex,
  Breeding dex and Trainer Dex use it; the Pokédex list and species-page tables
  were not part of the request.
- **`EntityDetailPage layout="split"`** (Abilitydex, Movedex): info column and
  species grid side by side, each its own ScrollArea, via `DexPageShell
  detailScrolls`. The grid column is exactly 654px — three 212px cards, two 9px
  gaps — so the cards keep their size; the info column is 600px including a 28px
  gutter for the drawn scroll thumb. **Widths are px and the stacking breakpoint
  is a CONTAINER query on `.entity-split`**: the first pass used 34rem and a
  viewport query, and on an 18px-root browser the pair outgrew the module and
  centring clipped the info column's left edge. The Trainer Dex uses the same
  skeleton (`SplitColumns`) with its party cards on the right. The Breeding dex
  keeps `stack`, centred at 654px like the Item/Berry/Nature pages
  (`.entity-column`). **No hairlines on any of these pages** (owner, third
  pass), except the one under the Movedex's game navbar.
- **A section can be re-sorted by its own number** (`SpeciesSection.sort`): the
  Movedex's Level up by level. One arrow after the label cycles dex order →
  ascending → descending → dex order; in dex order it shows only while the GRID
  column is hovered.
- **Sort/Filter is disabled on an open Abilitydex/Movedex entry page**
  (`menuDisabled` in DexQueryProvider), tested against the dex's scoped entries
  exactly as DexPageShell resolves the page, so a stale selection keeps the menu.
- **The move-change timeline is derived, not read** (`moveTimeline`): the raw
  move resolved once per generation through `moveForGeneration`, so a step can
  never disagree with the page, and rule-based changes (category by type before
  Gen 4) appear too. Capped at the selected generation. **The split alone is
  not a history**: when the only change is the category at Gen 4, no timeline.
- **Item artwork is PokéAPI's Dream World set, and 279 of the 563 in-scope
  items have none** (all TMs/HMs, key items, mail, data cards, Apricorns...):
  checked 2026-10-11 against the repo's `sprites/items/dream-world` listing —
  the 52 files no item uses are all Gen 5+ items, so it is absence, not a naming
  bug. Those pages fall back to the 30px icon by design (`ItemArtwork`).
- **Item prices and acquisition are Bulbapedia's** (`getItemSupplement`, see
  `scripts/CLAUDE.md`), follow the global generation selector, and the list's
  price is the generation's DEFAULT game (the latest Gen 1–4 game that sells it
  under "All").

- **The Trainer Dex is one row per TRAINER** (`trainerEntries` groups the
  data's per-team records): rematches by `rematch_of`, plus siblings with the
  same class, name, location and area. A NAMELESS trainer merges only when the
  data marks a variant -- five Grunts on one floor are five people. Teams are
  labelled by starter where the data says "If you chose X", else Initial and
  Rematch 1…N (one numbering whatever the game's own words; "onwards" → "+").
  **A rematch's prize is derived** (`TrainerTeam.prize`): every rematch record
  in Gen 2/4 has a null prize, and the games pay the class's base times the last
  Pokémon's level, so the rate is read off the trainer's first team. The page
  marks it `data-derived`.
- **Every Poképedia table has a frozen header** (pokedex.css, "FROZEN HEADERS"):
  inside `.pokedex` the table wrap must NOT be a scroller -- an overflow-x wrap
  is one, and sticky resolves against it and sticks to nothing. The page's
  ScrollArea takes the sideways scroll instead (the Pokédex list passes
  `horizontal`). A page with its own sticky bar over a table sets
  `--table-sticky-top` (the Trainer Dex's game navbar, 3rem).
- **The Trainer Dex's credit is in the app's "i" panel** (`usePageCredit`,
  `components/pageCredit.ts`), not on the page.

The Trainer Dex screen lives here; its bundle rules are in
`scripts/trainers/CLAUDE.md`. The Pokédex grid and list views are in
`src/modules/pokedex/CLAUDE.md`.
