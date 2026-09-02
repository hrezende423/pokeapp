# Species detail page — punch list

State of the rebuilt page (`SpeciesDetailPage.tsx`, `SpeciesHero.tsx`,
`SpeciesBanner.tsx` and the four `Species*Tab.tsx` files).

Sections 1–8 are DONE and kept as the record of what changed and why.
Section 9 is the open list and is last in the file.
`npm run verify:species-page` is green at 203 checks, and the other nine
suites pass.

## 1 — The five-item fix pass — DONE

### FIX 1 — the pinned column, from the frame

Read out of Figma `DetailPage-Light` (57:730), node `container-sprite`
(57:837), which is 737 × 1031 raw units:

| node            | id     | x   | y   | w   | h   |
| --------------- | ------ | --- | --- | --- | --- |
| `shadow-number` | 57:842 | 0   | 29  | 701 | 344 |
| `poke-artwork`  | 57:843 | 95  | 213 | 500 | 500 |
| `Region`        | 57:840 | 17  | 604 | 78  | 313 |
| `Name-kata`     | 57:841 | 85  | 717 | 557 | 146 |
| `Name-main`     | 57:838 | 85  | 879 | 284 | 78  |
| `Name-roma`     | 57:839 | 369 | 882 | 305 | 78  |

Every child is placed at its own percentage of that box, so the column IS
the frame at whatever size it gets. All five raised items resolved:

1. **Watermark clipping — fixed by POSITION, not size.** The frame puts
   `shadow-number` at x=0 in a 737-wide column: left-aligned, 95% of the
   width, and entirely inside the bounds. The design-system hero card's
   watermark genuinely _does_ bleed off its top-right, and the previous
   build used the card's treatment here. `font-variant-numeric: tabular-nums`
   is what makes containment true for all 493 rather than for #197 — Plex
   Sans draws proportional digits, so a wide number rendered wider.
   Asserted for #1/#111/#289/#388/#493.
2. **Artwork position** — 20.7% down, 67.8% of the column's width. Asserted
   as a ratio, not eyeballed.
3. **Name position** — and the frame corrected the prose spec: the katakana
   is ABOVE the two Latin names, and those two share ONE ROW
   (`Name-roma` starts at x=369, exactly where `Name-main`'s box ends).
   The previous build stacked main / kana / roma.
4. **Genus removed from this column.** It is in the banner now, which is
   where the frame puts it (`genus` 57:745 is a child of
   `container-poke-name`). A purpose-built `SpeciesHero` rather than
   `HeroDetailCard` is what removed it at the root — the shared card's DOM
   order is name-then-genus-then-children, which cannot produce this
   composition. `HeroDetailCard` is untouched and still serves the DS page.
5. **Sub-nav order** — see FIX 2. It had no fix while the banner did not
   exist.

Type sizes are MEASURED, not read: `get_metadata` carries no type
properties and the Figma MCP hit its Starter-plan call limit before
`get_design_context` landed. `scripts/calibrate-detail.mjs` inverts each
node's box width through the real advance of the real self-hosted face, the
same method and the same 2.23 frame scale `calibrate-scale.mjs` used on the
MainPage frames. It independently re-confirmed the token scale:

| role                      | raw | ÷2.23 | nearest token | spread            |
| ------------------------- | --- | ----- | ------------- | ----------------- |
| section heading / body    | 30  | 13.6  | 14            | 0.19 over 3 nodes |
| label / stat abbreviation | 26  | 11.5  | 11            | 1.27 over 7 nodes |
| sub-nav tab               | 33  | 14.4  | 14            | 0.98 over 4 nodes |
| dex number, region label  | 43  | 19.3  | 20            | —                 |
| name (hero and banner)    | 66  | 29.6  | off-token     | —                 |
| katakana                  | 111 | 50.0  | off-token     | —                 |
| genus                     | 40  | 17.9  | off-token     | —                 |
| watermark                 | 389 | 174.6 | off-token     | —                 |

### FIX 2 — the persistent banner, and the page's scale

`SpeciesBanner` renders the dex number, name, genus and type row from
`container-poke-name` (57:733, 1115 × 159). It is **page chrome**: rendered
once by `SpeciesDetailPage`, outside the tab switch and outside the scroll
region. The suite asserts the stronger form of the requirement — the same
DOM node, stamped with an attribute React does not control, survives all
four tab switches unmoved — rather than "a banner is present on every tab",
which four separate copies would satisfy.

That is also what made punch-list item 5 fixable: the name used to be in the
LEFT column and the types inside the Info tab, so there was no single
stacking order to reorder. There is one now — banner, sub-nav (right-aligned,
`Tabs` 139:644 at x=575 y=182), then the panel.

**The aspect-ratio and type-size half.** The frame is 1860 × 1172 raw units
at 2.23×, i.e. an 834px-wide page. Rendering it at token sizes across a
1500px+ window is what read as "too wide and too small" — the same type over
nearly twice the linear space, with a 420px pinned track beside a 960px
panel where the frame has 737 : 1115. So `.species-page` is a container,
`--dp-u` is one raw unit (`100cqw / 1860`), and the type tokens are
redefined in those units for the whole subtree. `DataTable`, `StatRow` and
`Tabs` scale with it for free because they already read those properties —
no per-component pass was needed.

`--dp-frame-max` (1400px) is the one tunable number, and it is also the
"less wide relative to height" answer: the page stops growing and centres
instead of stretching to a 2560px monitor. A second cap by `vh` keeps the
1031-unit pinned column fitting on a short window.

### FIX 3 — the evolution chart, rebuilt

`evoLayout.ts` is new and holds the geometry; `EvolutionTree.tsx` keeps the
data layer and replaces the presentation whole. Constants are read out of
the nine `layout-evo-*` frames, not chosen — the table is in
`evoLayout.ts`'s header. Gone: bordered cards, dex numbers, names, the
Tabler glyph + text caption. `TriggerIcon.tsx` was deleted with them, along
with `TRIGGER_ICON_NAMES` and `triggerCaption`.

Three things worth knowing:

- **The arrow length follows the span.** `arrow-evo-chain` is 280 × 61.5 on
  a 391-raw linear gap (span − 0.55 A) and is stretched to ~570 × 90 on
  Eevee's 2.3 A radial one. Thickness is derived as length / 4.55, the
  artwork's own ratio, so the chevrons never distort.
- **The icon sizes come from `layout-evo-eevee`**, the only frame with every
  register in it (0.40–0.48 A), not from the DetailPage's own cramped
  chart (0.25 A). Set to 0.40 / 0.36, mid-range: Eevee's own sizes made
  "Lv.37" and the King's Rock overrun Slowbro on the branch charts.
- **Radial is a formula, not a transcription.** `layout-evo-eevee` puts the
  seven children at a mean 2.31 A on angles that come out at an even
  360/7 apart with one child straight up — exactly `-90 + k * 360 / n`.

Two deliberate deviations, both in `evoLayout.ts`: `VGAP` is 0.40 A rather
than the frames' 0.317, and a three-way fan gets 0.80 A. The reference
places every label by hand to miss its neighbours; a renderer that cannot do
that has to buy the clearance with the gap.

### FIX 4 — type effectiveness, grouped by multiplier

Six tiers (4x / 2x / 1x / 0.5x / 0.25x / Immune), each listing every type in
it, empty tiers not rendered. Coloured text through the shared `TypeLabel` —
no badges, no pills, no boxes. The component counts what it grouped and
renders an alert if a multiplier falls outside the six, so a type cannot
vanish silently; the suite asserts grouped === total.

### FIX 5 — tab polish

- **Pokéathlon note moved to the bottom** of the Info tab, after the type
  chart. Asserted as an index, not by eye.
- **Learnset whitespace** — and the cause was not this page's CSS. App.css's
  `.panel section { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px
solid var(--border) }` reached every `<section>` on all four tabs, because
  `.species-info-block` and `.species-learn-group` are both `<section>`
  elements. It accounted for three separate symptoms: the 38px the Learnset
  tab could not lose however small its own gap got, a stray full-width
  hairline above the first table on every tab, and most of what §5 below had
  logged as "the Info tab is airy". Neutralised at (0,2,1). The gap between
  the selector and the first table went 46px → 10px.
- **Description tab** — no game selector. All 16 versions' entries in
  sequence, grouped by generation, in `listVersionGroups` order (not
  `Object.keys` order, which is whatever the build wrote). The locations
  section still needs one game because the encounter partitions run to
  2.8 MB × 14, so it follows the APP-WIDE selector — the architecture rule
  in CLAUDE.md — with the page's own scope as the fallback when that
  selector is on "All".
- **Sprites tab** — no control. One sequence, per-game headings kept because
  labelling every card was the original brief for the tab.

## 2 — Animated sprites: what PokéAPI actually has — SHIPPED

Audited as part of FIX 5, then acted on in the polish pass. Re-audited
directly against the eight GitHub directory listings by
`scripts/audit-bw-sprites.mjs`, which is now a repeatable check rather than
a one-off finding:

- **One game has animated sprites: `generation-v/black-white`.** They are
  GIF, at `sprites/pokemon/versions/generation-v/black-white/animated`,
  across eight directories (front/back × regular/shiny × ±female). 2,340
  files cover all 493 in-scope species.
- **Emerald has none.** Nor does Crystal. Both animated in-game; PokéAPI
  carries static slots only for every Gen 1–4 game.
- The only other animated source upstream is `sprites.other.showdown` (493
  species, front/back × regular/shiny) — Pokémon Showdown's art in a single
  modern style rather than per-game, and not a sanctioned source in
  CLAUDE.md.

**All 2,340 are converted to animated WebP and hosted**, in
`pokeapp-sprites` under four release tags of their own (`bw-gen1`…`bw-gen4`,
688/488/612/552 assets — GitHub caps a release at 1000). The Sprites tab
shows them as a "Black / White animated" section, which names the game
deliberately: the species are in scope, the game they were drawn for is not.

Two findings worth keeping, because both contradict the assumption behind
the request:

- **The source GIFs are already transparent.** Audited across 18 species:
  every corner pixel is alpha 0. There was no white background to strip. The
  white that GIF conversion is notorious for is the RGB _under_ those pixels,
  which only surfaces if something interpolates them — lossless WebP rewrites
  the colour of fully-transparent pixels while compressing, and the tab draws
  these nearest-neighbour, so nothing does.
- **WebP bought no bytes.** 90.0 MiB of GIF became 86.3 MiB of WebP: −4%. For
  sprites this small the format is a wash. What it did buy is one animated
  format across the whole tab and 8-bit alpha instead of GIF's 1 bit.

**Four species have no front-shiny animated GIF upstream** — 96 Drowzee,
97 Hypno, 98 Krabby, 99 Kingler. Encoded in the 8-bit-per-species
availability bitmask in `src/data/animatedSprites.ts`, so those cards are
absent rather than broken. Eevee (133) is flagged
`has_gender_differences` but has no female animated file either; the mask
wins over the flag, since the flag says the species differs and the mask
says which files exist.

The bitmask, the upstream listing and the release assets are three records
of one census, and `audit-bw-sprites.mjs` cross-checks all three — a mask
entry with no asset is a broken image, an asset with no mask entry is dead
weight nobody requests.

## 3 — The cutover — DONE (earlier pass)

`?detail` is gone and this is the live detail view. `SpeciesDetail.tsx`,
`Learnset.tsx`, `Encounters.tsx` and `TypeEffectiveness.tsx` were deleted.
`Artwork.tsx` and `TriggerIcon.tsx` were deleted in this pass.

## 4 — Hidden abilities in Gen 1–4 — FIXED (earlier pass)

Was: 17 species showed a slot-3 hidden ability under a Gen 4 selection (12
under Gen 3), because PokéAPI carries no `past_abilities` entry emptying
that slot for them. Koffing advertised Stench in HeartGold/SoulSilver.

Now gated by `HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION` in
`src/data/era.ts`: the hidden SLOT did not exist before Gen 5, whatever the
data says about the ability in it. Applied at the resolver, so it reaches
the Info tab and the Abilitydex's holder lists through `abilityHolders.ts`.
Audited across all 493: 0 hidden abilities survive in Gens 1–4, no ability
lost all its holders, Abilitydex entry list unchanged at 123 in Gen 4.

## 5 — Observations from the earlier pass, now resolved or superseded

- ~~Gen 1's game row offers the Japanese-only releases.~~ Still true, still
  consistent with the app-wide selector's own 14 options. Unchanged and not
  raised as a defect.
- ~~Sprite-card tone step is very subtle in light mode.~~ Still true:
  `--surface-raised` is `#fff` against `--surface` `#fafafa`. Correct per
  the tokens. Open, below.
- ~~The Info tab is airy.~~ RESOLVED, and the cause was the App.css
  `.panel section` leak described under FIX 5 rather than this page's own
  spacing.

## 6 — The polish pass — DONE

Ten items, all visual complaints against the shipped five-fix page.

### 6.1 — Type scale: one knob, and the clipped name fixed

`--dp-s` on `.species-page-inner`, default **0.78**, multiplied into every
font size on the page. It is a SEPARATE knob from the 1400px width cap on
purpose: every length on this page is one raw unit, so "smaller text" and
"narrower page" were the same control, and they are two different requests.
The layout keeps the frame's proportions; only the type shrinks.

`scripts/report-type-scale.mjs` prints the whole table — the app-wide tokens
read out of `design-tokens.css`, and the species page measured in a real
browser at a real width. The RAW column is the number to edit.

**The clipped name was a wrap problem, not a size problem.** "Bulbasaur
Fushigidane" rendered as "…Fushigidan" because `.species-hero-names` was
`white-space: nowrap` inside a column with `overflow: hidden`. A smaller
scale alone would only have moved which pair clips — the romanised names are
data and some are long. The row can wrap now (each name still refuses to
break internally), and the romanisation dropped from the frame's 66 raw to
52 so the common case stays on one line. Verified against the five widest
name pairs in the dex, computed rather than sampled: 69 Bellsprout /
Madatsubomi at 21 characters, then 1, 12, 73, 449 at 20.

### 6.2 — No ALL-CAPS type

One block in `pokedex.css`, scoped to `.species-page`, turning
`text-transform: uppercase` into `capitalize` for `.ds-stat-label`,
`.ds-type`, `.species-info-heading`, `.species-scope-label`,
`.species-flavor-gen-label` and `.species-ability-hidden`, plus `none` for
`.data-table-sort` (its labels are authored, and "TM/HM" and "PP" are
initialisms). Letter-spacing drops to 0.01em with it — 0.05–0.08em is
tracking for caps and reads as a gap on mixed case.

`capitalize`, not `none`, because the source strings are a mix of Title Case
("Abilities"), sentence case ("Base stats") and lowercase data ("grass"), so
leaving it to the strings would give three different answers.

**Scoped, not global.** The five pre-redesign dexes and the design-system
reference page keep their own typography, per the standing rule — the DS page
in particular is a handoff artefact that has to keep matching its spec. Say
the word if you want it app-wide.

### 6.3 — The arrow's actual geometry

The wedge was already the right shape: an isosceles trapezoid on its side,
`0,22 280,0 280,61.5 0,39.5` — parallel sides vertical, legs equal and
mirrored about the centreline. The chevrons were the problem: stroked
`polyline`s with `stroke-linecap: round` and `stroke-linejoin: round`, i.e. a
generic arrow glyph sitting on top of the wedge.

They are six-point filled polygons now, derived from the wedge's own numbers
in `EvolutionTree.tsx`: tip on the centreline, arms at 45°, constant
horizontal thickness, and **each arm end cut along the leg it meets**, 2.5
units inside it. That last property is the one that was asked for and is
what makes them read as part of the shape — a chevron is as tall as the band
is wherever it sits, so the three grow toward the head (33.2 → 39.3 → 45.4
units) as the band widens. The suite asserts it as two gradients that have to
match: −0.0788 against the leg's −0.0786.

### 6.4 — No dimmed stages

`.evo-art-btn[data-current='false'] .evo-art { opacity: 0.7 }` is gone. It
read as focus but made two thirds of a linear chart — and seven of eight on
Eevee's radial — look unavailable. Hover is a 1.05 scale now, since there is
no opacity left to lift from.

### 6.5 — Gender ratio: two hues

`--accent` for the female share, `--text-primary` for the male one.
Genderless is a full bar in the grey the female segment used to be, rather
than the bare word — the row used to be a different SHAPE for the 19
genderless species, which broke the metadata columns' shared rows for exactly
those species.

**Not a fifth use of `--accent`.** Its sanctioned list is active tab/nav
state, **binary indicators**, error emphasis and base-stat magnitude, and a
gender split is the second of those — the same use that already covers
caught/not-caught. Recorded because the count is a rule in CLAUDE.md and a
reader will check it.

`--text-primary` rather than a literal white: "white for male" is what that
token is in the dark theme the page was designed in, and `#fff` would vanish
into the light theme's white track.

### 6.6 — The two metadata columns share their rows

They were two independent lists, on the reasoning that a long value should
grow its own row without dragging its neighbour. That is exactly what went
wrong: the Gender ratio row is two lines tall, so every row below it on the
left sat a step lower than its pair on the right and seven hairlines drifted
apart down the block.

The outer grid owns seven rows now and each `.ds-stat-list` is a
`grid-template-rows: subgrid` participant in them. Both lists have exactly
seven rows and are read as pairs, so a shared row track is what the content
already meant. Subgrid rather than one flat four-track grid, so `.ds-stat-row`
keeps owning its own hairline and its own `space-between`. The gender legend
also dropped to 18 raw units, which is the readable half of the same fix.

The narrow container query resets it to two stacked lists — 14 rows in 7
tracks would overlap.

### 6.7 — Learnset rhythm, second pass

The first pass overcorrected: `--space-gap-sm` plus a 0.35rem step ran
consecutive tables together with no break between the end of one and the
heading of the next. `--space-gap-md` now, with most of the separation in the
group-to-group margin, because a heading is what starts a section. The suite
asserts a BAND rather than a ceiling (16–44px between tables); both bounds
have failed once.

### 6.8 — Locations moved to the Info tab

Under the base-stat and evolution charts, above type effectiveness, as
`SpeciesLocations.tsx`. A sortable five-column encounter table under sixteen
paragraphs of prose was two different kinds of reading in one tab.

**It fetches only when scrolled to, and that is load-bearing.** Info is the
default tab, so moving the section here would otherwise have made every
species open pull an encounter partition — 2.8 MB for Diamond/Pearl — for a
visit that only wanted the stat line, which is the exact cost the
one-tab-mounted-at-a-time rule exists to avoid. An `IntersectionObserver`
with a 200px margin gates the `versionGroup` argument, so `idle` stays a real
state in `usePartitionRows` rather than becoming a second code path.

It still follows the APP-WIDE game selector, with the page-local scope only
as the "All" fallback. Three suites had to learn that the trigger is a scroll
and not a tab click (`verify-app` step 3/4, `verify-pokedex`,
`verify-eggmoves`).

### 6.9 — Game names as coloured badges

**PokéAPI has no colour for a version.** `version` carries id / name / names
/ version_group and nothing else, and neither does this app's
`version-groups.json`. So the palette is the community version-colour set,
corrected per theme by `scripts/calibrate-game-colors.mjs` the same way the
type palette was: scale all three channels equally — which preserves the hue
— until the colour clears 4:1 against the 12% self-tint the badge paints
behind it. 16 of 21 need no change on dark, 5 need none on light.

**Three cannot be fixed by scaling, and they are all blue.** `#1111ff` keeps
nearly all its luminance in the 7.2%-weighted channel, so scaling saturates
it at 2.3:1 and stops. Blue, Sapphire and Blue (JP) are tinted toward white
instead — which is what the community palette itself did for `--type-water`.

**A badge here where a type is never one**, deliberately. "Type is data, not
decoration" still holds; a version label is a NAME, the thing a reader scans
a sixteen-entry Pokédex history by, and it repeats down a column where a
shape is what makes it findable. It uses `--radius-badge-square`, the badge
radius `design-tokens.json` sanctions and `TypeLabel` deliberately left
unimplemented for want of a fill and text-colour spec. This is that spec.

Gold/HeartGold and Silver/SoulSilver land on near-identical values on
purpose: the remakes are named after the originals.

### 6.10 — Sprites: the API's animated set

See §2. Shipped as a "Black / White animated" section with front and back,
regular and shiny, plus female where upstream has a file.

## 7 — Where the reference was deliberately narrowed

Unchanged from the five-fix pass and repeated here so it is not re-litigated:
the nine `layout-evo-*` frames are hand-composed (Tyrogue's third branch is
drawn to the LEFT with a left-pointing arrow), so the renderer follows only
the rules that generalise — linear left-to-right, 2–3 branches fanning right,
≥4 becoming the Eevee circle — plus two spacing deviations (`VGAP` 0.40 A,
and 0.80 A for a three-way fan) that buy clearance the reference gets by
hand.

## 8 — The second polish pass — DONE

Twelve items. Same shape as §6: visual complaints, each turned into something
that can be read back, with the screenshots for the parts that cannot.

### 8.1 — Back to top is a plain arrow

`IconArrowBarToUp` → `IconArrowUp`. The bar under that glyph reads as "jump to
the start of a document"; this scrolls a panel.

### 8.2 — The pinned column is one grey

Every text element in it — watermark, region label, katakana, both names — is
now `#999999` at 0.8 opacity. That is what turns the column from a second
headline into the quiet decorative half of the page, and the banner still
carries the name in `--text-primary`, so the species is stated at full strength
exactly once.

`#999999` is a **fixed grey in both themes**, held as `--hero-quiet` on the
column rather than as a token: it is 4.4:1 on the dark surface and 2.8:1 on the
light one, deliberately below the body-text floor because none of it is body
text. `--text-secondary` would have re-themed it and lost that.

**"20% more transparent" is read as opacity 0.8** for the four text lines. For
the watermark it is applied RELATIVELY — `--ghost-watermark-opacity × 0.8`,
0.05 → 0.04 on dark and 0.09 → 0.072 on light — because that token is per-mode
on purpose (5% white on near-black reads far stronger than 5% black on
near-white) and one absolute alpha would have broken one of the two themes.

Per element:

| element      | change                                                      |
| ------------ | ----------------------------------------------------------- |
| watermark    | 341 raw = **200px at the 1400px cap**, 0.2em tracking, bold |
| katakana     | colour + opacity only                                       |
| romanisation | Plex Sans **Light italic** (300)                            |
| region label | Plex Sans **Light** (300), un-rotated, under the watermark  |
| main name    | Plex Sans **Bold**, colour + opacity                        |

The watermark stays in raw units rather than literal `200px` so it still scales
on a narrow window and the one type knob still moves it. The tracking is what
makes it tight: 0.2em on three tabular digits is 2.4em = 638 of the column's 737
raw units, with 99 to spare, and identical for all 493 because the digits are
tabular.

**The region label is un-rotated**, at the watermark's own left edge (0) and
directly below it. "Aligned at the left side of the sprite" is ambiguous between
the column edge, the artwork edge and the name column's 11.533%; sharing an edge
with the block directly above it is the reading that looks intentional. It sits
over the artwork's 500×500 box, which is fine in practice — every
official-artwork PNG has transparent margin at that corner — and it carries
`z-index: 2` in case one ever does not.

### 8.3 — The Info tab's rhythm follows its type

`--dp-s` took the type down 22% in §6 and the SPACING did not come with it, so
every row kept the padding of a larger face. The spacing tokens are now
redefined in the page's own units on `.species-page-inner`, the same move the
type scale makes:

```
--space-row-padding-block  10 raw   5.9px   (was 9px absolute)
--space-gap-sm             12 raw   7.0px
--space-gap-md             20 raw  11.7px
--space-gap-lg             26 raw  15.3px
--space-gap-xl             42 raw  24.7px
```

Two hard-coded values in shared CSS could not be reached that way and are
overridden inside `.species-page`: `.ds-stat-row`'s `padding: 8px 0` and
`.data-table`'s `5px 7px`. The suite asserts the RELATION rather than the pixels
— padding over type size has to stay 10/26 — because an absolute value is
exactly what was wrong.

### 8.4 — The arrow's wedge is a gradient

Transparent at the tail, solid where the chevrons point. One
`<linearGradient>` per arrow, in that arrow's own `<defs>`: `fill: url(#id)`
resolves against ids in the document, so a single shared id across Eevee's seven
arrows would be seven references to whichever one mounted first. Keyed to the
child's species id.

`objectBoundingBox` space, so `x=0` is the tail at every length, and the CSS
rotation carries the gradient with the shape — "opaque where the chevrons point"
holds at every angle. The element opacity went 0.2 → 0.3, because a band that is
now weakest along most of its length needs more at the head to read as the same
connector.

### 8.5 — The Evolution heading expands the chart

Clicking it hands the whole Info tab to the chart; clicking again gives it back.
The chart normally gets half of a half-page column, which is fine for a
two-stage chain and nowhere near enough for Eevee's eight species and seven
conditions — measured, the tree goes 404px → 824px.

It **replaces** the other blocks rather than pushing them down, which is what
was asked and also what keeps the locations section from sitting mounted (and
fetching its partition) behind a chart nobody can scroll past. State lives in
`SpeciesInfoTab`, so leaving the tab resets it.

The heading IS the button — no separate control beside it — which is the same
affordance language as the egg-group links.

### 8.6 — The Lv column matches TM/HM

Both lead columns were already the same WIDTH; the difference was that level-up's
lead is a numeric column and machine's is not, so `DataTable` right-aligned one
and left-aligned the other. Lv is left-aligned now. **Alignment only** — it keeps
`--font-numeric` and keeps sorting by the real level — and every other column is
identical between the two tables, which the suite checks column by column.

Two rules, because `.data-table th.data-table-num` is (0,2,1) and
`.data-table-num .data-table-sort` is (0,2,0) and each has to be out-ranked
separately.

### 8.7 — No white-background sprites anywhere

**PokéAPI serves the Gen 1–2 sprites on an opaque white background.** Audited by
decoding the real PNGs' corner alpha, per game and per slot:

| games            | white slots                         |
| ---------------- | ----------------------------------- |
| red-blue, yellow | front/back default, front/back gray |
| gold, silver     | front/back × default/shiny          |
| crystal          | front/back × default/shiny          |
| Ruby/Sapphire on | none — already transparent          |

Two fixes, because upstream is inconsistent about what it also provides
transparently:

1. **2,110 have a `transparent/` counterpart upstream** — a different rendering
   of the same face and shininess, on a different canvas size (96×96 against
   40×40 for red-blue). Those white slots are simply not rendered.
2. **2,110 have none** — both gray slots on red-blue and yellow, and
   front_shiny / back_default / back_shiny on gold and silver. Dropping them
   would have lost every Game Boy grayscale sprite and every Gold/Silver back
   and shiny, so they are keyed to transparency and hosted in `pokeapp-sprites`
   under `transparent/{game}/{slot}/{id}.png`.

**Flood fill inward from the border, not a global colour key.** These sprites use
the same `#ffffff` for eyes, teeth and highlights as for the background, so
keying every white pixel punches holes in them — 344,194 interior white pixels
across the set survive because only white connected to the edge is cleared.
4-connected, so the fill cannot leak through a one-pixel diagonal gap in an
outline.

The suite proves this by DECODING: every Gen 1–2 tile is drawn into a canvas and
its four corners are read. "The URL says transparent" is exactly the assumption
that was wrong — gold's `front_default` is white and its `front_transparent` is
not, and both are 200s.

### 8.8 — Two labelling consequences of 8.7

- **"Transparent" is no longer a label.** It only ever distinguished anything
  because the white version sat beside it; every tile is transparent now, so
  `front_transparent` reads "Front · Normal", which is what the reader is
  looking at.
- **Slots are sorted for display, not by bit position.** `SLOT_ORDER` is a bit
  order and is append-only, so the six Gen 1–2 variants sit at bits 8–13 and
  sorted after every default and back slot — Gold's four tiles came out as
  "Front Shiny, Back Normal, Back Shiny, Front Normal", which is the bit layout
  showing through the UI. `slotRank` sorts front→back, plain→shiny,
  male→female, colour→gray.

### 8.9 — No card behind a sprite

`--surface-raised` with `--radius-control`, on the reasoning that a transparent
image needs a frame. Two things made that wrong: on the light theme
`--surface-raised` is `#fff` against a `#fafafa` page, so the "frame" was a white
box (logged as an open item for two passes), and every sprite in the tab is
transparent now, so a container whose job is to say "this image has no
background" says nothing. Same treatment as the species grid, which has been
card-less from the start.

The frame keeps its fixed 5.5rem height as pure layout, so a 40px Gen 1 sprite
and a 96px Gen 4 one leave their labels on the same baseline.

### 8.10 — What is repeatable

`npm run audit:white-sprites` re-derives which slots are white, re-checks
whether upstream has grown a counterpart for any of the ten we key, and samples
the hosted set. It does NOT decode pixels — that lives in the suite, where a
browser is the cheapest PNG decoder this project has.

## 9 — The third polish pass — DONE

Six items, three on the pinned column and three on the Info tab. The first two
are pure type; the third is an alignment change that had to leave the sprite
alone; the last is the one real architecture change in the pass.

### 9.1 — The region label is a rotated spine again, at the top

Rotated −90° at `left: 2.307%` with `transform-origin: left top`, so the text
runs upward. It spent one pass as a horizontal line under the watermark on the
reasoning that a rotated label competes with the watermark for the same left
edge; the smaller type is what makes the original work — at 20px it reads as a
spine label rather than as a second headline.

**It hangs from the watermark rather than sitting at the frame's bottom-left**
(`top: 27%`, one percent below where the watermark's own box ends at 25.6%),
which was asked for separately with the direction explicitly unchanged.

`transform: rotate(-90deg) translateX(-100%)` is what makes `top` mean the TOP.
With the origin at left top, `rotate(-90deg)` alone pivots the box about that
point and the text runs up FROM it, so `top` was the bottom end of the visual
line and the top end moved with the length of the string. The extra
`translateX(-100%)` shifts the box back down along its own (now vertical) reading
axis by its own width, so "Region: Sinnoh" starts under the watermark at exactly
the same place "Region: Kanto" does, and the reading direction is untouched.

### 9.2 — 20px and 30px, written as raw units

`34.07` raw for the region label and `51.1` for the three names, which draw at
exactly 20.00px and 30.00px at the 1400px cap. NOT written as `20px` and `30px`,
for the same reason the watermark's 200px is written as 341: the frame still has
to scale on a narrower window, and `--dp-s` still has to move it. One raw unit
of type is 0.5871px at the cap, so the conversion is `px ÷ 0.5871`.

The names went to 25px first and came back up to 30 — one step too far down. The
30 is the ROMANISATION's original size, which is the useful way to read it: the
quietest of the three set the level for all three.

The three names are ONE TREATMENT, where they were a 65 / 39 / 30 hierarchy: same
30px, same 0.2em of tracking, and only weight and slope separate them — bold,
upright, light italic. The main name also flipped from −0.01em to +0.2em, which is
the real change of intent: a tightened bold headline and a letter-spaced label are
opposite gestures, and the column is now the label.

**No tracking compensation, and this was measured rather than reasoned.**
`letter-spacing` is not applied after the last character of a line, so 0.2em of
tracking does not push a centred line half a step left — checked with a Range
over the glyphs, which lands exactly on the artwork's centre with nothing added.
An 0.2em `padding-left` "correction" was tried first and made it worse in both
directions at once: `width` here is a content-box width, so the padding widened
the element by 0.2em AND moved its centre 0.1em right, which is precisely the
2.5px the suite then reported.

### 9.3 — The two text rows are centred on the sprite

The column reads as three rows — artwork, katakana, Latin names — and the two
text rows centre on the artwork's own axis: `left: 46.811%` (12.89 + 67.843/2,
the artwork's centre) with `transform: translateX(-50%)`.

That replaced a first version which used the artwork's BOX — `left: 12.89%;
width: 67.843%` plus `text-align: center` — the same axis by a different route,
but it also fixed the row's width at the artwork's, and at 30px the widest name
pair does not fit in that. Centring on the axis and letting the row size to its
own text is the version that does not make the type size and the wrap point the
same decision.

**`width: max-content`, not `auto`, and that is the trap.** With `left` set and
`right: auto`, an auto width shrink-to-fits against the space from `left` to the
containing block's RIGHT edge — 53.2% of the column, because the transform moves
the box after layout and cannot widen it. So the row wrapped at 295px instead of
at its real limit, and every one of the five widest pairs reported identical
containment numbers, which is what gave it away. `max-content` sizes to the text
and leaves the capping to `max-width: 93.622%` — twice the 46.811% centre, i.e.
the widest box still symmetric about the sprite's axis AND inside the column.

**The sprite did not move**, which is half the requirement and the half that
could regress silently, so the suite asserts its box against the frame's
percentages independently.

The five-widest-pairs containment check moved from the row's own rect to the
UNION OF ITS CHILDREN, because a centred row sized to its content can overflow
in BOTH directions; measuring the box alone would have missed it. Bellsprout /
Madatsubomi, the widest pair in the dex, clears the column by 24px on the left
and 59px on the right — asymmetric because the row is centred on the sprite's
axis rather than on the column's.

### 9.3b — The gap between the two name rows

`top: 76%`, where the frame said 85.257%, i.e. the gap closed by two thirds. The
frame's 162 raw units between the rows were spaced for katakana at 111 raw; at
51.1 the line is less than half that tall and the same gap read as a hole.

**The katakana did not move.** It sits directly under the artwork, which ends at
69.157%, and pulling it down to meet the names would have opened the same hole
one row higher up. The suite asserts the gap as a RELATION — less than half the
katakana's own line box — rather than as a percentage, so it stays meaningful if
the type scale moves again.

### 9.4 — Every Info row is centred in its track

`align-items: center` where the metadata rows had `baseline`, plus
`align-content: center` on the value cluster and `center` on the type tiers.

Why it showed up at all: the two metadata columns share their row tracks via
subgrid, so a track is as tall as the taller of its two cells and the shorter one
hung from the top of it. Baseline alignment also only ever aligns the FIRST line,
so a two-line value pinned its own label to the top — which is what put "Gender
ratio" above its bar instead of beside it.

`align-items` vs `align-content` on the value is not interchangeable here:
`align-items` aligns the pieces of ONE line, so the number and its unit still
share a baseline, and `align-content` stacks the LINES, so a three-line held-item
list sits in the middle of its row.

**The gender bar centres as one object**, requested explicitly. It was already a
flex column of bar-then-legend, so nothing new was needed — but the suite asserts
the WRAPPER's centre rather than the bar's, because if the two pieces were ever
placed independently that is the assertion that would fail.

Horizontally nothing moved, and the suite says so: label flush left, value flush
right, on all fourteen rows.

### 9.5 — Locations are game-agnostic

`getEncountersForSpeciesAllGames(speciesId)` loads all fourteen partitions with
`Promise.allSettled` and returns the species' rows in chronological game order.
The Game column's `sortValue` is a release position rather than the label, and it
is the table's default sort, so the table reads as one contiguous block per game
— Red (JP), Green (JP), Red, Blue, Yellow, Gold, Silver, Crystal, … Sorting is
stable, so within a game the rows keep the partition's own order, which is by
area.

**What it costs, stated plainly**: 9.6 MiB of raw JSON, 278.7 KiB on the wire
(measured by verify-app), where one game was 1 KiB to 2.8 MiB. Which is why the
`IntersectionObserver` gate went from important to load-bearing: Info is the
DEFAULT tab. The loader's `inflight` map means fourteen parallel asks are
fourteen fetches and not twenty-eight, and each file is indexed once per session,
so the second species is free — verify-app asserts 14 files / 14 requests, then
asserts that moving the app selector afterwards fetches NOTHING.

**This is the one place on the page that ignores the global game selector**, and
that is a deliberate exception to an architecture rule, recorded in CLAUDE.md
rather than left to be rediscovered. It takes no scope props at all now:
`SpeciesInfoTab` lost its `scope` prop and `SpeciesDetailPage` stopped passing
`gameScope`.

**Not `usePartitionRows`**, and the difference is the reason a local hook exists:
that hook loads ONE partition and its `ready` carries rows alone. Fourteen files
settle independently, so `ready` has to carry the list of the ones that did not
arrive — a table quietly missing three games' rows would read as "not found in
those games", the exact false claim the `LoadState` split was written to prevent.
A partial failure names the missing games; only a total failure is an `error`
with a retry.

### 9.6 — Two things the data said that the wording had wrong

Both found while verifying 9.5, both corrected in the app rather than in the
assertion:

- **PokéAPI puts GIFT and EVENT encounters in the encounters table.** Bulbasaur
  has nine rows across nine games, every one of them method "Gift". So the empty
  state cannot say "not found in the wild" — it says "No recorded encounter in
  any game". The suite's empty-state case moved from Bulbasaur to **Ivysaur**:
  97 of the 493 have no encounter row anywhere, and every one of them is a mid
  or final evolution.
- **The denominator is 21, not 14.** Fourteen partitions, but twenty-one
  versions, and the table's rows are per version — Gold and Silver are two
  games. The caption counts versions because the badges do.

### 9.7 — Section H stopped failing on other people's rate limits

Eight `net::ERR_FAILED` console lines failed the suite while naming no URL:
`page.on('response')` never sees a request that got no response at all. A
`requestfailed` listener now records URL and failure text, and the assertion
split in two — console errors that are NOT resource loads, plus dropped requests
to OUR OWN origin. All eight turned out to be raw.githubusercontent throttling
sprite images, which section H already declines to assert on when the same host
answers 429 with a status code. Now they are printed with their URLs instead of
being an anonymous count.

### 9.8 — The italic was never rendering, anywhere in the app

The romanised name has said `font-style: italic; font-weight: 300` since the
column was built, and it drew perfectly upright. **The bundle had no italic
face** — only two `font-style: normal` `@font-face` blocks for IBM Plex Sans —
and Chrome did not synthesise an oblique either, so the declaration was a silent
no-op. Measured before the fix: the canvas advance for `italic 300 30px` was
_identical_ to `300 30px`, and so was `oblique 12deg`.

**This was app-wide, not one rule.** Three places ask for italic and none of them
was getting it:

- `.species-hero-roma` — the romanised name.
- `.species-banner-genus` — "Seed Pokémon", which is _supposed_ to be italic and
  is one of the few pieces of genuinely editorial type on the page.
- `.nature-cell-btn` in the Naturedex's neutral cell — a pre-redesign module,
  which CLAUDE.md keeps untouched. This is the same class of exception as the
  app-wide Plex Sans default: the module already asked for italic and was being
  denied it, so honouring it is a fix rather than a restyle.

**A real italic, not an oblique**, which is why this is two bundled files rather
than a `transform: skewX` or `oblique 12deg`. IBM Plex Sans Italic is a redrawn
face — single-storey _a_, a different _g_, entry and exit strokes on the
lowercase — so a synthesised slant would have been the wrong typeface, not a
cheaper version of the right one. Same variable axis range (wght 100–700,
wdth 100%) and the same two `unicode-range` subsets as the Roman, so nothing else
about the stack changes. 84 KiB, precached with the rest.

`IBM-Plex-OFL.txt` went in beside the files while I was there — the other two
bundled families carried their OFL text and Plex did not.

**The check that let this through was the computed style.** Section N asserted
`column.roma.style === 'italic'`, which is what the CSS asked for and says
nothing about what the font did. Both suites now measure the FACE instead: a real
italic has its own advance widths, where a fallback to the Roman or a synthesised
oblique measures identically. verify-design-system additionally parses the
`@font-face` blocks (rather than counting `font-style: italic` anywhere in the
file, which the three _usages_ also match — a face was what was missing, so a
face is what gets counted).

One deliberate non-check: the design-system reference page has no italic text, so
its italic face is legitimately `unloaded` there. Asserting "loaded" would have
forced italic content onto a page with no reason to carry any; the species page
uses it, and that is where "loaded and rendered" is asserted.

## 10 — OPEN

### 10a — A real per-generation accuracy bug, found while verifying FIX 5

**Raised twice, still unanswered.**

**Three moves render as Fairy under a Gen 1–4 selection.** Charm, Sweet Kiss
and Moonlight are `type_id: 18` (Fairy) in the bundle, each with a
`past_values` entry giving `type_id: 1` (Normal). Fairy is a Gen 6 type, so
all three should be Normal everywhere in this app. Visible in the Gen 4
learnset table — Umbreon's Moonlight is labelled FAIRY.

Nothing reads `past_values` at all: `grep` finds it only in
`src/data/types.ts`. So this affects the Movedex, the learnset tables and
every other move-type display, not just this page.

This is the same class as the hidden-ability bug in §4 and the data to fix
it is already in the bundle — a `resolveMoveTypeForGeneration` in
`src/data/era.ts` plus its call sites. NOT fixed here: it is outside the
five fixes, and it touches the Movedex, which CLAUDE.md keeps as an
untouched pre-redesign module. Needs a decision. **Raised once and still
unanswered.**

### 10b — Smaller things, no decision needed to ship

- **Flavour text carries the games' own hyphenation.** Umbreon's Gold entry
  reads "this POKéMON pro tects itself" — PokéAPI's `flavor_text` preserves
  the line breaks and soft hyphens of the original 8-character-wide game
  text. A de-hyphenation pass in `build-data.ts` would fix it for all 493 ×
  16 entries; risky to do blindly, since some breaks are legitimate spaces.
- ~~Sprite-card tone step in light mode~~ RESOLVED in §8.9 — the card is gone
  entirely, so there is no tone step to be subtle.
- **Location names are not links yet.** Confirmed as wanted — each should open
  the corresponding map — but there is no map module to open, so they stay
  text rather than becoming buttons that do nothing.
- **The middle branch of a three-way fan** still overlaps the parent's
  artwork by a few units on tight chains (Tyrogue). The reference avoids it
  by hand-placing; see the `VGAP_WIDE` note.

### 10c — Two facts from the pre-cutover page that never came back

Both outside the DetailPage spec, both still absent, both still needing a
yes/no rather than being added unrequested:

1. **Breeding partners** — the old page's "N species in Generation G share
   an egg group" count, from `useBreedingPartners`.
2. **Ability effect text** — the old page printed each ability's
   `short_effect` as body text. The Info tab has it as the ability's `title`
   attribute, so it is a hover rather than a read.

### 10d — Coverage that changed shape in the polish pass

`verify-species-page` went 122 → 164 checks; the other nine are unchanged in
what they claim. Three suites had assertions RE-POINTED rather than removed,
all for the same reason — the encounter partition is now requested by a
scroll on the Info tab instead of by a click on the Description tab:

- `verify-app` steps 3 and 4 drive `revealLocations()` instead of
  `openTab('Description')`. The claim is unchanged: each partition is fetched
  exactly once, whichever control asks. "Opening a species fetches no
  partition at all" is TRUE again, which the eager version would have broken.
- `verify-pokedex`'s encounters check scrolls the Info tab.
- `verify-eggmoves`' root-cause section checked "the flavour text beside the
  failure still renders"; the neighbours changed with the section, so it now
  checks the stat bars, the evolution chart and the type tiers — all three
  from the eager bundle, which is the same point.

One assertion became growth-tolerant rather than being weakened: section A's
"the right column really did scroll to its own end" was a race against the
locations fetch (it failed once at 694 of 787). It scrolls, waits for the
section to settle, and scrolls again.

### 10e — Crystal and Emerald are still static, and here is what it would take

Raised as "Crystal and Emerald sprites still are static", which is true, and
PokéAPI is not going to fix it — audited twice now: its only animated set is
`generation-v/black-white`. But both games DO animate in-game, and the pret
disassemblies are a sanctioned source in CLAUDE.md, so this is a decision
rather than a dead end. The two are not equally tractable:

- **Crystal is a frame sequence, and extractable.** `pret/pokecrystal` carries
  `gfx/pokemon/{name}/front.png` as a vertical frame sheet plus `anim.asm` (the
  intro) and `anim_idle.asm` (the loop), which are the frame order and the
  delays as data. So the work is: parse the two scripts, slice the sheet, apply
  the palette, assemble ~251 animated WebPs. Real but mechanical — the same
  shape as the Black/White job already shipped.
- **Emerald is a transform program, and is not.** `pret/pokeemerald` has only
  `anim_front.png` (two frames) plus per-species animation FUNCTIONS in
  `src/data/pokemon_graphics/front_pic_anims.h` that scale, rotate and
  translate the sprite over time. Reproducing it means interpreting those
  transforms, not slicing a sheet — a much larger job, and the output would be
  our rendering of the animation rather than the game's frames.

Not started. Needs a yes/no, and the honest split is "Crystal yes, Emerald
probably not worth it".

### 10f — Still deferred by prior decision

- **Pokéathlon stats** — Gen 4 only, absent from PokéAPI at species level.
  The Info tab renders a one-line sourcing note under a Gen 4 selection.
- **Biology write-up** — deferred, Bulbapedia.

Both fold into the one Bulbapedia sourcing task: ~41 min rate-limited fetch,
a wikitext parser, a lazy partition, CC BY-NC-SA attribution.
