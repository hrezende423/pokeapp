# Team Building

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Signed off — do not touch without being asked

Screens the owner has reviewed, accepted and explicitly frozen. Not
"finished" in the sense of having no debt — frozen in the sense that a
change here needs a request, not a justification. Read the deferred-debt
section below before deciding something on this list is a bug: the known
imperfections are already logged there deliberately.

- **The Team Display sizes its sprite from what the text leaves over.**
  `.tb-team-viewer` is `min-height: 100%` with `box-sizing: border-box` (the
  screen's own 8/14px padding would otherwise push it 22px past the scroller),
  the grid is `flex: 1` with `1fr 1fr` rows, and `.tb-card-art` is `flex: 1`
  against `flex: 0 0 auto` facts — so the artwork absorbs the remainder of a
  grid row and is as large as the window allows at any window size. Measured:
  188px at a 720px window up to the 260px cap from 900 up, against the 84px it
  was fixed at. All six cards stay on screen with no overflow across that whole
  range; verify-team-builder §14 drives five heights.
  **`max-height: var(--tb-slot-card)` on the art box is load-bearing**, not
  taste: the frame is `aspect-ratio: 1` sized from its height, so an art box
  taller than the card is wide makes a square frame WIDER than its card — and
  the card sets `overflow: hidden`, so the held-item badge positioned against
  that frame gets clipped off the picture.
  `--tb-slot-card: 260px` (264 until 2026-10-03) is measured the same way as the Team Library card:
  the widest Gen 1–4 move row (218px — "High Jump Kick" at 112px plus the type
  and category columns) and the widest types|nature|ability line (259px), which
  is the binding one.
  **The seven-line order is scoped to `variant="full"`.** The Build Library card
  keeps the layout it was signed off with — species on its own line, nature and
  ability dot-separated — and §14 guards that the two have not merged.

  **ONE DRAWN SIZE, TWO NOMINAL ONES.** The sans lines are at caption; the mono
  ones (nickname, level, EV spread, all four move names) are at
  `--tb-slot-mono`, `calc(var(--font-size-caption) * 0.82)`. Martian Mono draws
  about a fifth larger than Plex Sans at the same px — the rail measured it as
  9px mono == 11px sans — and the mono lines here are the long ones, so a card
  levelled at ONE nominal size read as two. Cap heights are now within 0.4px and
  §14 asserts that rather than nominal equality.
  `.tb-card-full .tb-card-facts` sets a font-size of its own, and it is NOT
  redundant with the per-line rules: the wrappers between the block and the
  lines (headline, id line, type run, the separator+fact spans) set none, so
  `.tb-meta-sep` and `.tb-type-sep` drew at the PAGE's 18px body — and an 18px
  item in a 13px line box pushed the baseline down far enough to make the id
  line 3px taller than its own leading, on every card. Leading is
  `--tb-slot-line: 12px`. The facts block went 115px → 91px and all 24 of those
  pixels went to the sprite.

- **A coverage panel is placed in the app frame, not in the card.**
  `Popover` (`ui/Overlay.tsx`) portals to `document.body` and is
  `position: fixed`, placed from a measurement of the wrapper it is written
  inside — so every call site keeps its old anchor contract without passing a
  ref, via a `display: none` marker whose `parentElement` IS that wrapper. It
  was `position: absolute`, and two different ancestors cut it: `.tb-card` sets
  `overflow: hidden` (the watermark and the artwork both bleed to the card's
  edge), so a member's panel was clipped to a 264px card and lost its bottom
  rows; and the team's panel hangs off a dock that now sits in the narrow left
  column, where right-aligned it started at a NEGATIVE x. It is pushed back
  inside horizontally rather than flipped — a coverage chart's left edge is its
  labels, and flipping would move the panel out from under the icon that opened
  it — and it flips ABOVE the trigger when there is more room there, taking a
  `max-height` of that room so a panel taller than the window scrolls itself.
  **The frame is `.panel`, not the window**: clamped to the window, the team's
  panel came to rest outside the app, over the page background beside it.
  A side effect worth keeping: the panel no longer inherits `.tb-corner`'s
  `opacity: 0`, so moving the mouse off a card no longer makes an open panel
  invisible while it is still open. verify-team-builder §15 drives all four
  panels at two window heights and asserts no ancestor cuts them, that they sit
  inside `.panel`, and that nothing in them is unreachable.

  **THE TOKENS ARE HOSTED TWICE BECAUSE OF THIS**, and it is not optional:
  `.tb, .tb-popover` declares the `--tb-*` scale, because a portalled panel is
  no longer inside `.tb` and an unresolved custom property does not fall back --
  it makes the whole declaration invalid, so `gap: var(--tb-3) var(--tb-4)`
  computed to `normal` and the type run ran straight into "2 of 4 moves
  counted". §15 reads a real gap back out of a live panel. Anything else the
  module scopes to `.tb` and a panel might use has to be hosted the same way;
  moving the scale to `:root` is the wrong fix, since it exists precisely
  because it is not the app's.

  **`box-sizing: border-box` on `.tb-popover`** is load-bearing for the same
  placement: `max-height` arrives as the room actually available, and under
  content-box the panel's own 14px padding and 1px border were added to it, so
  a capped panel came out 34px taller than the space it was capped to -- with
  its bottom edge outside the frame, which is the one thing the placement is
  there to prevent.

- **An immunity is never counted as a resistance.** The team's defensive table
  (`TeamMatchup`) has three exclusive buckets — Weak, Resist, **Immune** — and
  the immune one exists because `multiplier < 1` swept 0x in with 0.5x: a team
  of Zapdos, Bronzong, Gengar and Aggron read "Ground: 1 weak, 3 resist" when
  three of those members cannot be hit by Ground at all (Zapdos by its Flying
  half, the other two by Levitate). Every immunity the per-species panel knows
  about is counted here: both halves of a dual type, type-and-ability
  (Bronzong's Levitate, Heatran's Flash Fire over an otherwise neutral Fire) and
  ability-only. **A row earns its place with a weakness OR an immunity**, not a
  weakness alone — the old `weak > 0` filter dropped the team's best news, so
  Gengar's Normal immunity never appeared because nothing on that team happened
  to be weak to Normal. verify-team-builder §10 asserts the three buckets off
  the rendered table; the two checks it replaced asserted the conflated numbers,
  which is how the bug survived a suite that was already driving this panel.

- **Attacking coverage counts ATTACKS, per tier, in ONE table at both scopes.**
  `OffencePanel` (`ui/TypeMatchup.tsx`) renders one moveset or six: a member's
  panel and the team's are the same component, because "the same analysis for a
  member and for the team" is a requirement and two implementations would drift.
  One row per defending type, one column per multiplier, and the cell is how
  many damaging attacks land there — so a row's columns SUM to the number of
  damaging moves, which is the invariant §8 and §16 assert (a double count or a
  dropped move shows up as a row that does not add up). Counting attacks rather
  than "the best you can manage" is the point: 2x said coverage existed without
  saying whether it was one move deep, and six members with one Earthquake
  between them is not the team six members with one each is.

  **4x AND 0.25x CANNOT OCCUR HERE and that is not a gap.** The chart gives one
  of 0, 0.5, 1 or 2 for a single attacking type against a single defending type;
  the doubling that produces 4x on defence comes from the DEFENDER having two
  types, and an attack has only one type to bring. Those tiers need a pair-aware
  pass over the type combinations that really exist, which is a different panel
  and has not been asked for. **Nothing hardcodes their absence** — `TIER_ORDER`
  is `[4, 2, 1, 0.5, 0.25, 0]` and the columns rendered are the ones the rows
  actually use, so a pair-aware caller would simply see more of them.

  **Worst matchups lead, and only a WALL is marked.** Rows with no
  super-effective attack sort to the top (the opposite of the defensive table,
  where the high count leads), and such a row prints an explicit `0` where every
  other empty cell is blank. The `--accent` marker goes on that zero only when
  the type also resists or ignores something: a half-built member has no
  super-effective answer to almost anything, and colouring all thirteen of those
  rows would spend the page's one alarm colour on "this build is unfinished".
  Each member's moves resolve in the MEMBER's own generation while the chart is
  the enclosing generation, the same split the defensive panel makes.

  **The panel's leading is its own** (`.tb-matchup { line-height: 15px }`, table
  cells at 2px): seventeen rows at the page's inherited 26.1px did not fit an
  800px window and the panel capped itself into a scroller. verify-team-builder
  §16 derives every number in it by hand from a three-member team.

- **The Team Library card's width is a MEASURED CONSTANT.**
  `--tb-compact-card: 127px` is the rendered width of "ELECTRIC · FIGHTING" —
  the longest type pair in Gen 1–4 scope, 116.6px with the card's own uppercase
  transform, tracking and separator margins — plus a 5px inset either side.
  All 272 ordered pairs were measured in a browser to establish that it is the
  longest. Do not replace it with `max-content` (each card would then be as
  wide as its own type pair) or with `flex: 1` (a team of one drew a card as
  wide as the lane, which is what it used to do). verify-team-builder §13
  re-measures every pair and asserts the constant still fits.

  The 5px inset lives on `.tb-card-facts`, not on the card: the type run is
  centred inside it and every other line starts at its left edge, while the
  sprite group and the dex watermark stay centred on the CARD so the watermark's
  bleed is symmetrical.

- **Team Building — Build Form: the owner's nine changes** (2026-10-04, branch
  `team-builder-v2`, pending review). A first, broader redesign was merged and
  reverted the same day; this one applies ONLY the nine requested items and
  leaves the rest of the screen as it was (native selects, label sizes, stat
  table, identity panel). In short: no accent on the page; move type/category
  abbreviations (NOR FIR WAT… / Phy Spe Sta, mono 11px); no ⓘ icons, the label
  is the tooltip trigger (`ui/LabelTip`, `data-tip` + aria-describedby); EV Total
  directly under the sliders with "⚠ N (over by X)"; "− value +" steppers
  (`ui/NumberStepper`); regular-weight fields; underline focus on fields and a
  ring on :focus-visible elsewhere; rail with 64px sprites and type-only
  selection; one spacing variable `--fgap` (24 / Tight 16 / Roomy 32,
  `?fgap=tight|roomy`). The old frozen layout notes (17px rail leading, rail
  ending level with the Total row) no longer hold.
  Its BEHAVIOUR (see "the unsaved member" below) is unchanged.
  **Owner's round of 2026-10-07**, measured at the owner's window (1270x612 CSS
  px, DPR 1.5, where the form's scroller is 504px): stat table with no row
  hairlines, 4px above and below each row, and no bar track; form ROWS spaced by
  `--frow` (half of `--fgap`, 12px) with no extra half-gap before the moves or
  spreads, and a `--space-2` foot -- the form is then 477px and fits; rail with
  no "#00N" heading (the id is `data-team` on `.tb-rail`), 6px card padding (six
  cards = 462px), every line `--bf-weight-light` (300) except the edited
  member's name at regular; spread values are `NumberStepper`s whose signs show
  only on row hover or focus; the item list is `itemOptionsFor`'s battle-held
  allowlist plus Everstone (and the build's current item, so an old build never
  reads "—").

## The unsaved member

`Build.draft` IS LEGACY. Nothing writes it; the shell prunes any it finds.

A member that does not exist yet is **a value in the Build Form's state plus
the rail SLOT it is destined for** (`buildId: null` + `slot` in `tbNav`). The
build and its slot assignment are written **together**, by `persist`, at the
first save point — or never. This is not a refactor for its own sake; the
previous shape (create the record up front, flag it `draft`, place it by a
later "keep it?" answer) failed in four ways that were all reported at once:

- when that question was removed, **nothing placed it** — filling the form and
  pressing "Back to team" put the build in the library and returned to a team
  that was still empty;
- the id was consumed up front, so **the numbering drifted**;
- the slot being filled read as free, so the rail drew an "add member" button
  on it — **the same question the reader had just answered** — and answering it
  again abandoned the member in progress;
- and if that member was still untouched it was deleted underneath the open
  form, which is where **"this build no longer exists" mid-build** came from.

Rules that must not be re-derived:

- **The slot and the record are one write.** Never save one without the other.
- **The slot being edited is never an "add" affordance.** `railAddSlot` skips it.
- **A slot holding an id nothing resolves to is an EMPTY slot** (`slotIsFree`).
  Team Viewer always treated it that way; the rail did not, and skipped it.
- **`slot` and `seed` must be threaded through the shell.** `TeamBuilding` drops
  them on the floor if you forget, and the symptom is a member saved into the
  library with its team left empty — the original bug, exactly.
- **One build cannot be in two slots of one team.** The picker hides builds
  already on the target team and "add to other team" disables such a team. Two
  identical ids in one team's slots is not a cosmetic duplicate: React reports
  a duplicate key, the coverage panels count that Pokemon twice, "remove from
  this team" clears only the first slot, and it does not register as a shared
  build — sharing counts teams, not slots — so editing changes both with no
  prompt.

## Known deferred debt — Team Building

- **A build from one generation can be placed on a team of another.** The
  picker offers every build whatever the team's generation, so a Gen 3 build
  with a nature, an ability and a held item can sit on a Gen 1 team, and the
  team then renders cards with two different `data-generation` values. Every
  field is still gated on the BUILD's own generation, so nothing renders a
  mechanic that did not exist — the team is simply not a legal team for its
  era. Left alone because the fix is a product decision, not a bug fix: hide
  mismatched builds from the picker, warn and allow, or offer to convert. Ask
  before picking one.

- **Three defensive abilities are deliberately not modelled**, all in
  `src/modules/team-builder/typeDefence.ts`: Filter and Solid Rock (0.75x on
  super-effective) and Dry Skin's 1.25x Fire penalty. Each would put a build on a
  multiplier that is not a chart tier — 1.5x, 3x, 2.5x — and the matchup panel
  groups by tier. Dry Skin's Water immunity IS modelled. **Lightning Rod and
  Storm Drain are absent on purpose and are an era trap, not an omission**: in
  Gen 3-4 both only REDIRECT the move and the holder still takes normal damage;
  the immunity arrives in Gen 5, which is outside this app's scope.

- ~~**The Build Form's rail ends 17px below the left column in Gen 1 only.**~~
  **OBSOLETE**: the rail is no longer measured against the stat table.

- **`.tb`'s `data-generation` is the APP's generation, not the open build's.**
  Opening a Gen 3 build while the app is set to Gen 4 gives a module wrapper
  that says 4 and a form whose fields are all correctly gated on 3. Nothing
  user-facing reads the attribute — the era gates read `build.generation` — but
  anything that styles or tests off the wrapper is reading the wrong number.
  Same class: a card whose species is not in the data bundle renders
  `.tb-card-missing`, which carries no `data-tb="member-card"`, so a selector
  counting members silently misses it.

- **The type-run dot draws at 18px on the Build Library and Team Library
  cards.** `.tb-type-sep` sets margin and colour and no font-size, so it
  inherits the page's 18px body — the same defect fixed on the Team Display card
  by giving `.tb-card-full .tb-card-facts` a size of its own. It is not
  cosmetic-only: a baseline-aligned flex line is as tall as its tallest item, so
  the type line measures 29.1px on the Build Library card (against its ~14px
  leading) and 17px on the Team Library card. Both screens are signed off with
  it on screen, and the fix is one declaration — `font-size:
  var(--font-size-caption)` on each variant's `.tb-card-facts` — which WILL
  change both card heights. Ask before applying it.

- ~~**Shedinja's fixed 1 HP is not special-cased in the stat math.**~~
  **FIXED** with the damage calculator: `computeStat` returns 1 for base HP 1
  (the reference does the same). The same pass fixed `statExpBonus`, which
  lacked the game's 255 cap on sqrt(Stat Exp) — every maxed Gen 1-2 stat was one
  point high at level 100 (Mewtwo's Special 407, real 406; pret `CalcStat`).
  verify-team-builder still passes.

- **The Build Form does not use the shared team-build form components.** They
  were built for the damage calculator in `components/ds/` (FormParts,
  EvStatTable + RangeSlider, MoveSlotTile, SearchSelect); the Build Form keeps
  its own `.tb-form-*` / SpreadControls / MoveSlots, because its layout is
  frozen. Two copies until someone asks for the migration — it must land with
  no visual change and verify-team-builder unchanged.


## Build Form does not autosave (moved from the root CLAUDE.md)

- **Build Form does not autosave; every other screen does.** This is deliberate
  and is not an inconsistency to "fix". Build Form holds field edits in local
  state and writes them only at a transition — going back, duplicating, adding
  to a team, answering a rail prompt, or leaving by the app bar. My Teams, Team
  Viewer and Build Library all still commit on blur. Reset and Delete are the
  two actions that deliberately do NOT commit first.

  **THE RAIL ASKS; everything else commits silently.** Clicking another member
  offers save-first or discard; clicking the "+" adds a third answer, move the
  edit to the new member; clicking the slot you are already on offers to revert,
  and is not even a control when there is nothing to revert. A build two or more
  teams use keeps its own three-way prompt instead of any of those, because it
  is a superset of them and it carries the warning about how far a save reaches.
