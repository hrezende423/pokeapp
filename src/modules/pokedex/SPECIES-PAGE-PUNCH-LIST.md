# Species detail page — punch list

State of the rebuilt page (`SpeciesDetailPage.tsx`, `SpeciesHero.tsx`,
`SpeciesBanner.tsx` and the four `Species*Tab.tsx` files).

Sections 1–5 are DONE and kept as the record of what changed and why.
Section 6 is the open list. `npm run verify:species-page` is green at 122
checks and the other nine suites pass.

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

## 2 — Animated sprites: what PokéAPI actually has

Asked as part of FIX 5 and audited across all 493 in-scope records in the
local `api-data` snapshot rather than assumed:

- **One game has an `animated` object: `generation-v/black-white`** — 493
  species × 8 slots. Gen 5, out of scope.
- **Emerald has none.** Nor does Crystal. Both animated in-game; PokéAPI
  carries static slots only for every Gen 1–4 game.
- The only other animated source upstream is `sprites.other.showdown` (493
  species, front/back × regular/shiny) — Pokémon Showdown's art in a single
  modern style rather than per-game, and not a sanctioned source in
  CLAUDE.md.

So the animated WebPs in `pokeapp-sprites` (94/493) remain the only animated
content in scope, and the app's existing note in `src/data/artwork.ts`
("there are no in-game animated sprites in scope") is now proven rather than
asserted.

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

## 6 — OPEN

### 6a — A real per-generation accuracy bug, found while verifying FIX 5

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
untouched pre-redesign module. Needs a decision.

### 6b — Smaller things, no decision needed to ship

- **Flavour text carries the games' own hyphenation.** Umbreon's Gold entry
  reads "this POKéMON pro tects itself" — PokéAPI's `flavor_text` preserves
  the line breaks and soft hyphens of the original 8-character-wide game
  text. A de-hyphenation pass in `build-data.ts` would fix it for all 493 ×
  16 entries; risky to do blindly, since some breaks are legitimate spaces.
- **Sprite-card tone step in light mode** (carried from §5).
- **The middle branch of a three-way fan** still overlaps the parent's
  artwork by a few units on tight chains (Tyrogue). The reference avoids it
  by hand-placing; see the `VGAP_WIDE` note.

### 6c — Two facts from the pre-cutover page that never came back

Both outside the DetailPage spec, both still absent, both still needing a
yes/no rather than being added unrequested:

1. **Breeding partners** — the old page's "N species in Generation G share
   an egg group" count, from `useBreedingPartners`.
2. **Ability effect text** — the old page printed each ability's
   `short_effect` as body text. The Info tab has it as the ability's `title`
   attribute, so it is a hover rather than a read.

### 6d — Still deferred by prior decision

- **Pokéathlon stats** — Gen 4 only, absent from PokéAPI at species level.
  The Info tab renders a one-line sourcing note under a Gen 4 selection.
- **Biology write-up** — deferred, Bulbapedia.

Both fold into the one Bulbapedia sourcing task: ~41 min rate-limited fetch,
a wikitext parser, a lazy partition, CC BY-NC-SA attribution.
