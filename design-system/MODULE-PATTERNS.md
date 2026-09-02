# What a new module inherits

`DESIGN-SYSTEM.md` is the design reference — principles, component specs, what
was rejected. **This file is the build reference**: the patterns the Pokédex grid
and the species detail page established, in the order you need them when
starting a module, with the file to copy from and the mistake each one exists to
prevent.

Two screens are the reference implementation. Everything below is extracted from
them, not proposed:

| screen         | files                                                                |
| -------------- | -------------------------------------------------------------------- |
| Pokédex browse | `SpeciesCardGrid.tsx`, `pokedex.css` § _species grid_                |
| Species detail | `SpeciesDetailPage.tsx` + the four tab files, `pokedex.css` § _species page_ |

The five pre-redesign dexes (Itemdex, Abilitydex, Naturedex, Berrydex, Movedex)
are **not** reference implementations. They keep their own layout and typography
by standing decision; do not copy from them and do not "fix" them to match.

---

## 1. First decision: token-scaled or frame-scaled?

This is the fork that shapes everything else, and the two reference screens
answer it differently on purpose.

**Token-scaled — the default.** Sizes come from `--font-size-*` and `--space-*`
directly. Use this unless the whole screen is a reproduction of one fixed design
frame. The grid page is token-scaled: its geometry is Figma values divided by a
**measured** scale (2.348, from `calibrate-scale.mjs`) and then frozen as CSS px
— `repeat(3, 212px)`, `top: 42px`, `left: 55px` — with the grid centred in a
wider shell rather than stretched. Every type role lands on a locked token at
that divisor, which is how the divisor was chosen; a conventional 2.0 export
scale put every role 1.2–3.0px between tokens.

**Frame-scaled — only for a whole-screen frame reproduction.** The species detail
page is one Figma frame (1860 × 1172) reproduced proportionally:

```css
.thing-page       { container-type: inline-size; max-width: min(1400px, …); }
.thing-page-inner { --dp-u: calc(100cqw / 1860);          /* one raw unit */
                    --dp-s: 0.78;                          /* type scale    */
                    --dp-t: calc(var(--dp-u) * var(--dp-s));
                    --font-size-body: calc(30 * var(--dp-t));   /* … etc */
                    --space-gap-md:   calc(20 * var(--dp-t)); }
```

Five rules come with it, each of which cost a round to learn:

1. **Redefine the TOKENS, not the rules.** Every shared component
   (`DataTable`, `StatRow`, `Tabs`) already reads those custom properties, so
   redefining them on the wrapper scales the whole subtree with zero
   per-component work.
2. **Spacing must come down with type.** `--dp-s` dropped the type 22% and the
   spacing did not follow, so every row kept the rhythm of a larger face. The
   `--space-*` tokens are redefined in the same units. **If a spacing value on a
   frame-scaled page is in `rem` or `px`, it is a bug** — with two known
   exceptions in shared CSS that a token cannot reach (`.ds-stat-row`'s
   `padding: 8px 0` and `.data-table`'s `5px 7px`), both overridden inside the
   page's own scope.
3. **An element cannot query its own container.** `100cqw` inside
   `.thing-page`'s own declarations resolves against the nearest _ancestor_
   container. That is the only reason the `-inner` wrapper exists, and the same
   reason `.species-hero > *` exists for the nested column.
4. **Exactly two tunable numbers**, kept separate on purpose: the width cap and
   `--dp-s`. Because every length is one unit, "smaller text" and "narrower
   page" would otherwise be the same control, and they are different requests.
5. **Measure, don't read.** `getPropertyValue('--dp-u')` returns the literal
   `calc(100cqw / 1860)` — custom properties are substituted, not resolved. Derive
   the unit from the measured width. `npm run report:type-scale` prints every
   size in the app, app-wide tokens and this page's raw units, measured in a real
   browser; **the RAW column is the number to edit.**

---

## 2. Colour

**Monochrome plus one accent.** `--accent` (Pokédex red) has exactly **four**
sanctioned uses and no others:

1. active tab / nav state
2. binary state indicators — caught/not-caught, and the gender-ratio bar's
   female share
3. error / validation emphasis
4. **base-stat magnitude** (the filled portion of a stat bar)

The fourth is a deliberate reversal of the "stats are a plain table, never bars"
rule, confirmed against the real Figma prototype, and it is **narrow**: base
stats at magnitude on the species detail page. It is not a licence for progress
bars generally. Read-only stat rows elsewhere stay `StatRow` — label left, value
right, hairline, no bar.

**Three surface tones, only three.** `--surface` (the page), `--surface-raised`
(anything floating above it, and bar/track fills), `--surface-hover` (pointer
feedback on a row inside a floating panel). Hover is not an accent use, which is
why the third exists.

**Type is coloured text. Nothing gets a badge.** No fill, no pill, no chip,
anywhere. The community type palette is the palette in both themes, with
per-mode contrast overrides (dark overrides 5 of 17, light overrides 12 — light's
bright pastels were the worse problem, Electric at 1.43:1). The muted custom set
is retired: still in `design-tokens.json` for the record, referenced by nothing.

Game names were badged for two passes — a per-version `--game-*` colour at a 12%
self-tint — and the badge, the palette and its calibration script were all
removed on request. That closes the last exception: `--radius-badge-square`
remains a sanctioned token that **nothing uses**. Do not reach for it without
asking. `git log -- src/modules/pokedex/GameBadge.tsx` has the whole thing if a
badge is ever wanted back.

**Artwork provides the colour.** The chrome is achromatic. Do not add UI colour to
fill a screen that feels quiet — the quietness is what lets the artwork read.

---

## 3. Type

- `--font-body` — IBM Plex Sans, self-hosted, **Roman and Italic**, variable
  (wght 100–700), two `unicode-range` subsets each.
- `--font-numeric` — Martian Mono first, JetBrains Mono second, both self-hosted.
  Every entry after them is a system font, so the bundled face must lead the
  stack or a same-named system font wins silently.
- **The mono rule is about tabular data**, so it stops at display numbers: the
  ghost watermark takes `--font-body`. Every number you read a _value_ off of
  stays mono.
- `font-variant-numeric: tabular-nums` wherever a number sits in a fixed box —
  Plex draws proportional digits by default, so `#1` is narrower than `#111` and
  a watermark calibrated on one clips on the other.
- **Never assert italic from a computed style.** `font-style: italic` was a
  silent no-op app-wide for months: only Roman faces were bundled and Chrome
  synthesised nothing, so the computed style read `italic` over upright glyphs.
  Measure the advance width — a real italic face has its own metrics, a fallback
  and a synthesised oblique both measure identically.
- **Letter-spacing is not applied after the last character of a line**, so a
  centred line needs no trailing-tracking correction. A `padding-left` "fix" was
  tried and was wrong twice over.
- **Case.** The redesigned pages use `capitalize` with tracking dropped to
  0.01em, in one block scoped to the page. `text-transform: uppercase` is still
  the design-system default for the old modules and the reference page. Scope
  any change; do not go global.

---

## 4. Elevation, separation, and the hairline-band rule

**No `box-shadow`, anywhere, in either theme.** Hierarchy is hairlines,
whitespace and the `--surface` / `--surface-raised` tone-step. Treat the urge to
add one as a signal to reconsider the layout. A floating popover is
`--surface-raised` plus a hairline — that is the whole recipe, and it is what the
one surviving violation (`.egg-marker-note`) was replaced with. `verify-design-system.mjs`
now scans every tracked CSS file under `src/` for the declaration, so a new one
fails a suite rather than waiting for someone to notice it.

**The hairline-band rule** — the newest hard-won one, and the least obvious:

> If rows draw their own `border-bottom`, the band a reader sees runs from one
> hairline to the **next**. A row `gap` lands _inside_ that band — above the next
> row's box rather than between two rows — so content centred in its own box sits
> a half-gap low in its apparent band.

The metadata columns had a 26-unit row gap and every row read ~8px low while
every box-relative measurement passed to within half a pixel. Fix: no row gap on
a bordered-row grid (keep the column gap — it has nothing to do with hairlines),
and let the shared `--space-row-padding-block` be the only thing setting the
rhythm. The other two row families on that page, `.species-stat-bars li` and
`.type-matchup-tier`, are plain ungapped lists and were correct all along.

**Verify it by reconstructing the band from the hairlines** — previous row's
bottom edge to the top of this row's border — not by measuring the row box. The
box-relative check is true and insufficient, which is exactly how this shipped
wrong once.

---

## 5. Data rows, tables and paired columns

Reuse, in preference order:

| need                        | component                                     |
| --------------------------- | --------------------------------------------- |
| label/value metadata row    | `StatRow` + `StatList` (`components/ds/DataRows.tsx`) |
| sortable multi-column table | `DataTable` (`components/DataTable.tsx`)      |
| dense browse list           | `LedgerList`                                  |
| binary state toggle         | `components/ds/Toggle.tsx` — **not** `ToggleSwitch.tsx`, which is unimported dead code and the last `box-shadow` in the repo |
| titled section on a tab     | `.species-info-block` + `.species-info-heading` |

`DataTable` is driven by a column config — a column declares how to render a
cell and how to sort by it. A second dense list should be a config, not another
component. Two details worth copying: sorting is **stable and null-last in both
directions** (a status move has no power, it is not "0 power"), and a
`sortValue` may be an ordering key rather than the displayed text — the
locations table sorts its Game column by release position, because alphabetical
would open with Colosseum and end with Yellow.

**Paired columns use CSS `subgrid`.** Two lists side by side whose rows are read
as pairs must share row tracks, or the taller cell in one column walks every
hairline below it out of line with its neighbour. The outer grid owns the rows;
each list is `grid-template-rows: subgrid`. This keeps the row component owning
its own hairline and its own `space-between`, which a flat four-track grid would
have had to rebuild.

Group a chart by the **axis with fewer buckets**: type effectiveness is six
multiplier tiers listing their types, not seventeen per-type cells. Empty tiers
are not rendered, so there is no empty state to style.

---

## 6. Scope, loading, and what a screen costs

**Every module respects the app-wide game/generation selector**, and reaches
scoped data only through `src/modules/dex/entrySources.ts`. Never build a fresh
index or query the raw bundle — that is how generation-leak bugs get introduced,
and it has happened.

**Era accuracy is a rule, not a data read.** PokéAPI's `past_*` arrays are
incomplete, so start-of-mechanic facts are encoded as rules in `src/data/era.ts`.
A component showing an era-sensitive field goes through a resolver, never the raw
record.

**The `LoadState` discipline** (`usePartitionRows.ts`): `idle | loading | ready |
error`, and **`ready` with an empty array is not `error`**. Those were conflated
once and the UI rendered "no data for this species", which asserts something
false — the data exists, the request failed. Readiness is derived from a request
key rather than cleared in the effect body, so a new request never briefly shows
the previous one's rows. `retry` bumps the key.

**On-demand partitions, and the gate is "on screen", not "scrolled".** Large
per-scope data is fetched when its section becomes visible, via an
`IntersectionObserver` gating the loader's own argument so `idle` stays a real
state rather than a second code path. Two things to get right:

- A section the reader **can see** must never sit behind "Loads when you scroll
  to it". If the layout shortens and the section rises into view, loading on
  open is correct.
- Therefore **do not assert "nothing was fetched" at one viewport** — that
  measures the layout and calls it the gate. Assert both branches: idle and
  unfetched where the section is genuinely below the fold, loaded and no idle
  message where it is visible.

Partial failures are **named, never dropped**: a table missing three games' rows
must not read as "not in those games". Only a total failure is an `error`.

---

## 7. Cross-navigation and disclosure

**The affordance is a label you can click, not a button shape.** Egg groups jump
to the Breedingdex, evolution nodes jump to a species, and a section heading that
expands to fill its tab is the heading itself as a `<button>` with a direction
icon — no separate control beside it. Keep hover to a hairline and focus to the
accent ring.

When a section expands to own the whole tab, **replace** the rest rather than
pushing it down — the point is the room. Keep the state inside the component so
leaving the tab resets it, and early-return so the hidden sections are not
mounted and fetching behind something nobody can see.

---

## 8. Icons

Tabler, 24px grid, 1.5px stroke, outline default. Custom SVG only where the game
has a concept Tabler has no equivalent for (the evolution-condition icons).

**Prefer the plainer glyph.** `IconArrowUp`, not `IconArrowBarToUp` — the bar
reads as "jump to the very start of a document", which is a different promise
from "back to top".

---

## 9. Verification

Every module gets a suite in `scripts/`, driving the real app in a real browser —
ten of them, 1,317 checks. `"Reported done" ≠ "actually verified"`, and
type-checking is not verification. What the existing suites do that a new one
should:

- **Cover the screens, not just the reference page.** The no-shadow rule held for
  months everywhere it was being watched, and a popover on the species detail
  page kept a legacy drop shadow the whole time because no suite visited it. If a
  rule is app-wide, check it app-wide — statically as well as in the DOM where
  the property makes that cheap.

- **Assert the relation, not the pixel.** Row padding as a fraction of its type
  survives a scale change; `5.87px` does not.
- **Measure what rendered, not what was declared.** The computed style says what
  the CSS asked for. Decode the pixels (canvas + `getImageData` for sprite
  transparency), measure the advance (a real italic face), read the file's own
  header (`RIFF`/`WEBP` magic and the `VP8X` flag byte, since GitHub serves every
  release asset as `application/octet-stream`).
- **Assert removals.** An exception that has been taken out — no fill, no radius,
  no leftover padding, one shared colour where there were sixteen — grows back
  otherwise.
- **Screenshot both themes**, and wait on `img.complete` before measuring;
  `networkidle` plus a timeout gave blank artwork once.
- **Third-party hosts are not this app's defects.** `raw.githubusercontent`
  rate-limits and answers _without_ CORS headers, so a browser reports a throttle
  as a CORS failure. Assert `404` specifically (a wrong path) and check asset
  existence from Node, not from the page. Split console errors: resource loads
  from a third-party host are logged with their URLs; anything else fails.

---

## 10. Traps that have each cost real time

- **Bare element selectors in old CSS outrank component classes.**
  `.panel section` (`margin-top: 2rem; padding-top: 1.5rem; border-top`) reached
  every `<section>` on all four species-page tabs and was the actual cause of
  what looked like three separate design problems. `.panel h2` uppercased every
  shared detail page's title. When a page's own spacing will not respond to its
  own rules, check for one of these first.
- `:hover` can outrank `.active` at equal specificity if declared later — scope
  hovers to `:not(.active)`.
- **A font stack's bundled face must lead**, or a same-named system font wins.
- **An append-only bit order is not a display order.** Sprite slots are stored
  as a bitmask whose order is append-only, so rendering in bit order gave "Front
  Shiny, Back Normal, Back Shiny, Front Normal". Sort for display.
- **A global default and a per-component opt-in are mutually exclusive.** Moving
  one to "everywhere" moves it everywhere, legacy modules included.
- **Percentage `max-width` and an auto width do not compose with a centring
  transform.** With `left` set and `right: auto`, an auto width shrink-to-fits
  against the space from `left` to the container's right edge — the transform
  moves the box after layout and cannot widen it. Use `width: max-content` with a
  `max-width` cap.
