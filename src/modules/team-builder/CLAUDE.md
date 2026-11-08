# Team Building

Module rules; the root `CLAUDE.md` still applies. Measurements, history and reasons
are in `RATIONALE.md` (not auto-loaded): read it before changing anything signed off.

## Signed off — do not touch without being asked

Frozen by the owner: a change needs a request, not a justification. Read "Known
deferred debt" before calling something here a bug. `§n` = the `verify-team-builder`
section that guards it.

- **Team Display sizing** (§14). `.tb-team-viewer` is `min-height: 100%` with
  `box-sizing: border-box`; the grid is `flex: 1` with `1fr 1fr` rows; `.tb-card-art`
  is `flex: 1` against `flex: 0 0 auto` facts, so the art takes what the text leaves.
  - `max-height: var(--tb-slot-card)` on the art box is load-bearing: a taller art box
    makes the square frame wider than its card, and `overflow: hidden` clips the
    held-item badge.
  - `--tb-slot-card: 260px` is measured (widest types|nature|ability line, 259px).
  - The seven-line order is scoped to `variant="full"`; the Build Library card keeps
    its own layout (§14 guards that they have not merged).
  - Sans lines at caption, mono at `--tb-slot-mono` (caption × 0.82): one drawn size,
    two nominal ones; §14 asserts cap heights. Leading `--tb-slot-line: 12px`.
  - `.tb-card-full .tb-card-facts` needs a font-size of its own: the wrappers set
    none, so separators draw at the page's 18px body and inflate the line.
- **Six alternate animated sprites on the Team Display only**: Charizard, Blastoise,
  Alakazam, Gengar, Salamence, Garchomp (`altSprites.ts` via `ui/MemberCard.tsx`).
  Every other surface and every shiny build keeps the stored set.
  `ALT_SPRITES_ENABLED = false` restores the old set.
- **Coverage panels are placed in the app frame, not the card** (§15). `Popover`
  (`ui/Overlay.tsx`) portals to `document.body`, is `position: fixed`, and is placed
  from a measurement of its wrapper (a `display: none` marker whose `parentElement`
  is the wrapper). Never back to `position: absolute`: `.tb-card` clips with
  `overflow: hidden`. Pushed inside horizontally, never flipped; flips above when
  there is more room, with `max-height` set to that room. The frame is `.panel`.
  - **Tokens are hosted twice, not optional**: `.tb, .tb-popover` declares the
    `--tb-*` scale, because a portalled panel is outside `.tb` and an unresolved
    custom property invalidates the whole declaration. Host anything else a panel
    uses the same way. Never move the scale to `:root`.
  - `box-sizing: border-box` on `.tb-popover` is load-bearing for the `max-height`.
- **An immunity is never counted as a resistance** (§10). The team defensive table
  (`TeamMatchup`) has three exclusive buckets: Weak, Resist, Immune. Count every
  immunity the per-species panel knows (dual-type halves, type+ability,
  ability-only). A row earns its place with a weakness OR an immunity.
- **Attacking coverage counts attacks, per tier, in one table at both scopes**
  (§8, §16). `OffencePanel` (`ui/TypeMatchup.tsx`) serves one member or the team.
  One row per defending type, one column per multiplier, cell = damaging attacks
  landing there; a row's columns sum to the number of damaging moves.
  - 4x and 0.25x cannot occur here (an attack has one type). Not a gap, and nothing
    hardcodes their absence (`TIER_ORDER` is `[4, 2, 1, 0.5, 0.25, 0]`).
  - Worst matchups lead. A row with no super-effective attack prints an explicit `0`;
    `--accent` marks it only when the type also resists or ignores something.
  - Member moves resolve in the member's generation, the chart in the enclosing one.
    `.tb-matchup { line-height: 15px }` (cells 2px) is its own leading.
- **Team Library card width is a measured constant** (§13). `--tb-compact-card: 127px`
  = "ELECTRIC · FIGHTING" (116.6px, longest of all 272 pairs) + 5px inset each side.
  Not `max-content`, not `flex: 1`. The inset lives on `.tb-card-facts`; sprite and
  watermark stay centred on the card.
- **Build Form: the owner's nine changes** (2026-10-04, round of 2026-10-07). Only
  those items; native selects, label sizes, stat table and identity panel stay as they
  were. No accent; the label is the tooltip trigger (`ui/LabelTip`), no ⓘ; EV Total
  under the sliders; `ui/NumberStepper`; regular-weight fields; rail with 64px sprites;
  one spacing variable `--fgap` (24 / Tight 16 / Roomy 32, `?fgap=`). Item list is
  `itemOptionsFor`'s allowlist plus Everstone plus the build's current item. The rest
  and the measurements: `RATIONALE.md`.

## Team transfer and gender (2026-11-06/07)

Spec: `docs/SPEC.md` slices A and B. Suites: `verify-team-transfer`, `verify-team-builder`.

- `showdown.ts` knows the format, `showdownImport.ts` knows the data. Import never
  overwrites. An unset IV exports as 0, never 31.
- `Build.name` is edited in the Build info modal (the Build Form is frozen);
  `buildLabel` is the one reader. Team Display and battle labels stay on the nickname.
  `.tb-build-name` is `flex: 1 1 0` on purpose, or a signed-off card grows 32px (§3).
- `buildGender(build, species)` (`buildFacts.ts`) is the one reader: Gen 1 null, Gen 2
  derived from the Attack DV alone, Gen 3+ stored. Stored `gender` is never rewritten.
  Build Form: no field in Gen 1, disabled at the derived value in Gen 2 (the owner's
  named exception to the freeze).

## The unsaved member

`Build.draft` is legacy: nothing writes it, the shell prunes any it finds. A member
that does not exist yet is a value in the Build Form's state plus its destined rail
SLOT (`buildId: null` + `slot` in `tbNav`).

- **The slot and the record are one write**, by `persist`, at the first save point or
  never. Never save one without the other.
- **The slot being edited is never an "add" affordance** (`railAddSlot` skips it).
- **A slot holding an id nothing resolves to is empty** (`slotIsFree`).
- **Thread `slot` and `seed` through the shell.** `TeamBuilding` drops them if
  forgotten: the member lands in the library and the team stays empty.
- **One build cannot be in two slots of one team.** The picker hides builds already on
  the target team, and "add to other team" disables such a team.

## Known deferred debt — Team Building

- **A build from one generation can sit on a team of another.** Every field stays
  gated on the BUILD's generation; the team is just not legal for its era. The fix is
  a product decision (hide, warn, or convert): ask before picking one.
- **Filter, Solid Rock and Dry Skin's Fire penalty are not modelled**
  (`typeDefence.ts`): they give multipliers that are not chart tiers. Lightning Rod and
  Storm Drain are absent on purpose: Gen 3-4 only redirect; the immunity is Gen 5.
- **`.tb`'s `data-generation` is the app's, not the open build's.** Era gates read
  `build.generation`. A card with a species missing from the bundle renders
  `.tb-card-missing` with no `data-tb="member-card"`, so member counts miss it.
- **The type-run dot draws at 18px on the Build Library and Team Library cards**
  (`.tb-type-sep` has no font-size). Fix is `font-size: var(--font-size-caption)` on
  each variant's `.tb-card-facts`; it WILL change both card heights. Ask before applying.
- **The Build Form does not use the shared team-build form components**
  (`components/ds/`): its own `.tb-form-*` / SpreadControls / MoveSlots, because its
  layout is frozen. Migration must land with no visual change and verify-team-builder
  unchanged.

## Build Form does not autosave

Deliberate; not an inconsistency to "fix". The Build Form holds edits in local state
and writes at a transition (back, duplicate, add to a team, a rail prompt, leaving by
the app bar). Every other screen commits on blur. Reset and Delete do NOT commit first.
The rail asks (save-first, discard, move the edit to a new member, revert); a build
used by two or more teams keeps its own three-way prompt about how far a save reaches.
