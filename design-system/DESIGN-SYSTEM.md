# Pokeapp Design System — v1 extraction

Extracted from the locked POC (`ds-hero-variant-a-dark.html`) and the exploration
rounds that led to it. This is reference documentation, not a changelog — it
captures the current state and the reasoning behind it, not a running history
of every round.

Companion files: `design-tokens.json` (platform-agnostic, W3C DTCG-flavored),
`design-tokens.css` (web/React implementation), and **`MODULE-PATTERNS.md`** —
the build reference for anyone starting a new module, extracted from the two
screens that have actually shipped.

**Read §12 first if you are implementing.** Two screens have now been built for
real against real data, and §12 is the as-built record of them. Where it differs
from §5, §12 is what shipped and §5 is the spec it was designed from; both are
kept, because the reasoning in §5 is still the reasoning, and knowing which
parts survived contact is the useful part.

---

## 1. How this was built (the reusable framework)

For future projects, the process that got us here:

1. Research current design-system best practices and token standards.
2. Interview on practical constraints (platform, deliverable format, maintenance
   appetite) — *before* any taste/aesthetic questions.
3. Interview on taste/direction (density, shape, color approach, motion,
   explicit anti-goals like "must not look AI-generated").
4. Comprehensive reference search — named design systems to study for
   *decisions*, inspiration galleries to study for *aesthetic direction*,
   kept explicitly separate.
5. POC rounds, cheapest-first: isolated component styles → expanded component
   sets for shortlisted styles → full real screens → real content/artwork.
   Each round should force a real decision, not just add options.
6. Self-critique against the "does this look AI-generated" test at every
   round — specific, nameable tells (generic badge shapes, ambient shadows,
   safe palette-generator color picks, templated layouts), not a vibe check.
7. Extract tokens and component specs *before* expanding to more screens or
   layouts. Un-extracted exploration doesn't compound — each new sample
   re-decides things the last one already settled.
8. Apply to the real product once tokens exist.

---

## 2. Design principles

**Monochrome + one reserved accent.** Ink and paper do almost all the work.
The accent (`--accent`, Pokedex red) is reserved for exactly **four** functional
jobs — active tab/nav state, binary state indicators (caught toggle, the
gender-ratio bar's female share), error/validation emphasis, and base-stat
magnitude. It never decorates. If a new component wants to use the accent, ask
whether it's a genuinely analogous functional case first. The third was
confirmed in §8 and the fourth in §12; the count has grown twice by argument and
never by drift, which is the discipline worth keeping.

**The dex number is the signature element, not a caption.** Across the whole
system, the catalog number gets outsized visual treatment — a full ledger
column with its own rule in lists, a 220px 5%-opacity watermark in detail
views. This is the one deliberately loud move; everything else stays quiet
around it (spend the boldness in one place).

**No shadows, anywhere, in either mode.** Hierarchy comes from hairline
borders (`--hairline`) and whitespace. This was a hard-won decision after
several rounds defaulted to "safe" ambient shadows — treat any urge to add a
`box-shadow` as a signal to reconsider the layout, not a styling gap to fill.

Three surface tones, and only three: `--surface` (the page), `--surface-raised`
(anything floating above it), and `--surface-hover` (pointer feedback on a row
inside a floating panel). The third exists because the accent has exactly four
sanctioned uses and hover is not one of them, and because on white a step to
`--surface` is imperceptible — `--surface-hover` is 0.129 of luminance below
`--surface-raised` in light where `--surface` is only 0.044 below it. In dark it
equals `--surface`, which already read correctly. It is a fill, so it never
substitutes for `--hairline`, and vice versa.

**Type is data, not decoration.** Type (Fire/Water/Grass/etc.) renders as a
colored text label only — no fill, no pill, no badge shape. Colored badge
chips were tried and explicitly rejected (see §4) as the single most common
"AI-generated dashboard" tell we found across every reference search.

**Functional numbers are monospace.** Dex index and stat values use
`--font-numeric` (**Martian Mono**, self-hosted, with JetBrains Mono as a
second self-hosted fallback); names, labels, and body
copy use `--font-body` (**IBM Plex Sans**, self-hosted — see implementation
note below). This is the only typographic mixing rule in the system.

The rule is about tabular data, so it stops at the **ghost watermark**, which
takes `--font-body`. Mono buys column alignment, and a single centered
three-digit number at 5–9% opacity has no column to align to — it is display
type that happens to be a number. Confirmed as a refinement of the mono rule,
not an exception to it. Every number you actually read a value off of — stat
tables, EV fields, dex numbers in list rows and grid cards — stays mono.

**Stats are a plain data table, not a progress-bar widget.** Label left,
value right, monospace, hairline row divider. Progress bars were tried and
rejected — too close to the generic fitness-app/RPG-clone default, and
disconnected from anything specific to a Pokedex.

*Narrowly reversed for base stats — see §12.* The species detail page's
base-stat block does use a bar, in `--accent`, confirmed against the real Figma
prototype. It is scoped to that one block: six values on one comparable 0-255
scale, where the shape of the spread is the fact being read. Every other stat row
in the app is still the plain table above, and this is not a general licence for
bars — a metadata row, an EV row and a matchup tier all stay text.

**Artwork provides the color.** The UI chrome is almost entirely
achromatic (ink/paper + the one reserved accent). Real sprite/artwork,
background-removed, is what actually carries color into the screen. Don't
add UI color to "fill in" a screen that feels quiet — that quietness is
intentional and is what lets the artwork read as the focal point.

---

## 3. Locked — type indicator, list vs. detail

Two earlier rounds produced two different treatments; **colored text label
only** (`Fire` in `--type-fire`, no icon, no fill) is now confirmed as the
answer for both list/ledger rows and detail/hero screens, not just the
detail screen. The alternative — a monochrome geometric glyph for list
rows specifically (`ds-full-screen-poc-v2.html`) — is superseded, not a
live option. Confirmed deliberately: this is the choice most consistent
with the system's core restraint (color carries meaning, shape doesn't
duplicate it), and introducing a glyph-based split between contexts would
reintroduce exactly the kind of extra visual machinery this system has
repeatedly stripped out elsewhere.

**And now it is the whole rule rather than a rule with an exception.** Game
names were badged for two passes — a per-version colour at a 12% self-tint of
itself, argued on the grounds that a version is a NAME a reader scans a column
by rather than a value — and the badge was removed on request along with its
palette. Nothing in the app carries a fill, a pill or a chip.
`--radius-badge-square` is now a sanctioned token that nothing uses, which is
the honest state; the open item in `design-tokens.json` that called the badge
treatment "a dev-time per-context call" is closed by removal, not by choosing.

---

## 4. Rejected directions (and why)

Kept here so they don't get quietly re-tried later without remembering why
they didn't work:

- **Pure neumorphism / pure glassmorphism as the main system** — beautiful in
  isolation, doesn't hold up across a fuller component set; parked as
  possible accents for specific info-card/chart use cases, not the base.
- **50/50 Material + Minimalism blend** — fighting itself, since the two
  solve visual hierarchy with opposite tools (color/depth vs. absence).
  Material-forward with minimalism as restraint (not co-equal system) won.
- **Colored fill badge/chip for type** — the most common generic-AI tell
  found across every reference search. Replaced with colored text. A badge was
  later built for GAME names rather than types, on the argument that a version
  is a name and not a value; it shipped for two passes and was removed. The
  category is now closed rather than narrowed: no badges at all (§3).
- **Horizontal progress bars for stats** — generic fitness-app/RPG-clone
  default. Replaced with a plain right-aligned data table.
- **"Tasteful muted hue" accent selection** (teal/cobalt/amber/crimson/olive
  tested) — the selection *method* was the problem, not any specific hue:
  picking "which color looks nice" with no connection to the subject. The
  accent that stuck was chosen because it's the actual color of a real
  Pokedex device, not a palette-generator pick.
- **Per-species dynamic accent** (Variant B, background/accent shifts per
  Pokemon's type) — genuinely considered, tested side-by-side against a
  global accent using real artwork, and the global monochrome + single
  accent (Variant A) won.
- **Bento grid and grain texture as the base style** — both work well as
  named techniques but were deferred to specific future use cases (charts,
  callout cards) rather than the default screen structure.

---

## 5. Validated component specs

These have been through multiple rounds and real-content testing. Everything
else in the 95-component scope has not been designed yet (§6).

### Hero detail card
Full species detail view. `--radius-card` corners, `--space-card-padding`
padding, `--surface` background, no border, no shadow.
- Rotated micro-label, top-left (e.g. "Gen 2"), `--font-size-caption`,
  `--text-secondary`, `rotate(-90deg)` from a left-top origin.
- Ghost watermark: dex number, `--font-body` (display type, not tabular —
  see §2), `--font-size-ghost-watermark`, `--ghost-watermark` color at
  `--ghost-watermark-opacity` (0.09 light / 0.05 dark), positioned
  top-right, bleeding off the card edge.
- Mini badges (height/weight), top corners, pill radius, small caption text,
  `--mini-badge-fill` background.
- Hero artwork, centered, background removed (chroma-key on near-white,
  feathered edges — see `remove-background.py` pattern if scripting this at
  scale), no shadow/platform under it.
- Name: `--font-size-hero-name`, `--font-weight-bold`, `--font-body`,
  centered.
- Type: colored text label, centered, `--font-size-label`,
  `--font-weight-bold`, uppercase, letter-spacing 0.05em.
- Stat table: see below.
- Actions row: primary + secondary button, centered, `--space-gap-sm` apart.

### Ledger list row
- Flex row, `--space-gap-md` gap, `--space-row-padding-block` vertical
  padding, `--hairline` bottom border (omit on last row).
- Dex number: fixed-width column, right-aligned, `--font-numeric`, bold,
  ~20px, at full opacity for entries the user has seen/caught, ~35% opacity
  for unseen entries (dimming pattern established, not yet fully specified
  as a rule — confirm the exact dim/undim logic when this gets built).
- 1px vertical rule between the number column and the rest of the row.
- Sprite: small circle, outlined (not filled) in the placeholder state.
- Name: flex-1, `--font-body`, medium weight.
- Type: colored text label, right-aligned before the row's end.

### Data table stat row
Label (`--text-secondary`, uppercase, `--font-size-label`) left, value
(`--font-numeric`, bold) right, `--hairline` bottom border, no bars, no
color-coding by value tier.

### Buttons
- Primary: `--button-primary-fill` background, `--button-primary-text`,
  `--radius-control`, no shadow, no border.
- Secondary: transparent background, `--hairline`-derived border, `--text-primary`.
- Ghost: text only -- no border, no fill, no icon. `--text-secondary`, going
  to `--text-primary` on hover, and the 2px accent focus ring. Added after the
  fact rather than designed: `.nav-trigger` and `.pokedex-back` were already
  exactly this, unnamed, and the app-bar controls trigger made a third, so it is
  written down here as `.ghost-button` instead of being re-derived a fourth time.
- No danger variant specified yet.

### Toggle (binary state, e.g. "caught")
Track + circular thumb, `--radius-pill`. Off state: neutral gray track.
On state: `--accent` fill. This is the accent's second sanctioned use.

### Search / filter (list screens)
Search: single hairline-underline input, no border box, no icon specified
yet. Filters: plain text separated by a middot (`·`), active filter in
`--text-primary` + bold, inactive in `--text-secondary`. No chip/pill
container — this was a deliberate de-chroming decision alongside the type
label change.

### Species grid card (Pokedex list)
Top-level browse view. Top horizontal nav, not a side panel — `--hairline`
bottom border under the nav, active item in `--accent`. 3-column grid,
`--space-gap-lg` gutters.
- Card: no border, no background fill (ghost — ties to the "artwork provides
  the color" principle even at grid scale).
- Mini ghost watermark: dex number, `--font-body` (display type, not tabular —
  see §2), `--font-size-ghost-watermark-grid` (64px — a scaled-down version of
  the hero/detail treatment, same color and opacity rules). **Position corrected
  against Figma MainPage-Light/Dark:** centered on the card and flush with its
  top, entirely inside it, with the artwork overlapping its lower half — NOT
  top-right and NOT bleeding off the edge. Figma's `shadow-number` node sits at
  x=68 y=0 in a 497-wide card, and its box is 74.4% x 42.4% of the card.
- Artwork: centered, top of card, background removed, no platform/frame.
- Below artwork, in order: dex number (mono, secondary text) + name
  (bold, humanist) on one line; type row (colored text, dual types
  separated by a middot, each type in its own color); ability (secondary
  text, smaller).
- Tested alongside four other treatments (bordered card, borderless ledger-
  tile grid with hairline cell dividers, pure-whitespace ghost with no
  watermark, and a bento-influenced featured-first-card grid) — this one
  was selected. Worth remembering if a future session is tempted to
  redesign the grid from scratch: this was a genuine five-way comparison,
  not a default.
- Open question carried over from §3: whether the dex number gets dimmed
  for not-yet-seen entries — not yet re-confirmed at grid scale.
- **As built, and still accurate**, which is worth saying because the detail
  page's spec did not survive the same way. Two additions from implementation:
  the geometry is frozen CSS px at a *measured* scale rather than proportional
  units (§12), and the card carries an explicit `font-size: 13.3333px` that is
  load-bearing — the Figma calibration was done while the card was a `<button>`
  inheriting Chrome's UA size, and turning it into a `<div>` moved the ability
  line 9px. The value is stated on purpose; nothing inside the card renders at
  it.

### Species detail page

> **SUPERSEDED BY §12 as the built spec.** What shipped is a proportional
> reproduction of the `DetailPage-Light` Figma frame: a pinned artwork column, a
> persistent banner, a sub-nav of four tabs, and **one flat `--surface` plane** —
> no drawer, no floating panel, no rounded exposed edge, and no species-tinted
> background. The two-panel drawer described here IS built and IS live, but only
> on the design-system reference page (`?ds=1`, `SpeciesDetailPanel.tsx`), where
> it remains the handoff artefact for this spec. The species-background database
> (§9, all 493 hand-reviewed pairs) is likewise used only there. Both are kept
> deliberately: the spec below is a complete, tested design, and if the frame
> reproduction is ever revisited this is what it would be revisited against.

Two-panel layout, not a card. Artwork panel is fixed/non-scrolling; the info
drawer is a persistent, pronounced, rounded-corner panel (not an overlay
with a scrim) anchored to the right edge, rounded only on its exposed left
side. Drawer content scrolls internally, independent of the artwork panel.

**Layering rule**: the whole screen shares one background color layer first;
the drawer is a separate surface that floats on top of it. The drawer's own
background never changes; only the shared background behind/around it does.

**Background color — two supported modes**:
- *Standard*: one constant neutral background (`--surface`), identical for
  every species. Use this until the per-species data exists, and keep it
  available afterward as a fallback/simple mode, not a deprecated one.
- *Species-tinted* (primary, once implemented): the artwork panel's
  background is **art-directed per illustration**, not derived from the
  type-color tokens — picked by eye per species, richer/deeper rather than
  a pale "safe" tint (e.g. Gengar gets a saturated purple, not a pastel
  lavender). Requires a `species_id -> {bg_light, bg_dark}` lookup — a data
  table to populate during implementation, not a token or formula. Contrast
  against the artwork's own dominant tones is the hard constraint (Umbreon,
  being near-black, needed a warm gray-gold rather than anything pushing
  toward black, to stay legible against its own artwork).

The drawer itself is unaffected by either mode — same white/dark surface,
same content, every time.

### Tabs
Underline style, `--accent` on the active tab (text + 2px underline),
`--text-secondary` on inactive. This is the accent's first sanctioned use.

---

### Text input / select (form fields)
Hairline-underline style, no border box, no fill — consistent with the
minimalist-restraint principle. Label above (`--font-size-label`, uppercase,
`--text-secondary`). Input/select: `--font-body`, `--font-size-body`,
bottom border only in `--hairline`, transparent background. Selects use a
small unicode chevron rather than a styled native arrow. No focus/error/
disabled states specified yet — that's a real gap, not an oversight.

### EV/stat editable row
Same visual shape as the read-only data table stat row (label left, value
right, hairline divider) but the value is an editable numeric field
(`--font-numeric`, bold). A running total against the 510-point cap is
shown as plain secondary text below the list, not a bar. **Open item**:
sliders were requested for EV/IV entry and are not yet designed — treat the
plain-number version as a placeholder for that, not the final answer.

### Move-slot tile
Small bordered card (`--radius-control`-ish corner, hairline border),
label + select stacked inside. Used specifically for arranging the 4 fixed
move slots as a 2x2 grid rather than a linear list — a deliberate echo of
the species grid card's visual language at a smaller scale.

### Form section label
Uppercase, `--font-size-label`, `--text-secondary`, used to break a long
form into named groups (e.g. "Identity", "Battle setup", "Moveset", "EV
allocation") with hairline-adjacent spacing rather than boxed sections.

### Compact field strip
A flex-wrapped row of fields (nickname, level, ability, nature, item, all
four moves) used to compress "configuration" fields into minimal vertical
space so a more complex component (the EV table) can take the dominant
visual position on the page. Only meaningful when one section of a form is
genuinely more important than the rest — not a default pattern.

## 6. Component coverage — now complete

All 95 components from the original scope are covered: 14 in §5 (validated
across multiple real rounds — hero detail card, ledger list row, data
table stat row, buttons, toggle, search/filter, tabs, the species detail
two-panel page, the species grid card, text input/select, the EV/stat
editable row, the move-slot tile, the form section label, the compact
field strip) plus 81 in §8 (validated for consistent token application,
per the note there about what "validated" means at that tier).

See `open-items` in `design-tokens.json` for what's still genuinely
deferred — this is a shorter, more honest list now that coverage is
complete: EV/IV sliders were resolved in §8; dex-number dimming and
type-color dark-mode contrast were resolved in §10; the species color
data table was completed in §8's dex-dimming/contrast entry and the species color table below. What's left is real: form field
error/focus/disabled states are specified but not yet built as an actual
component (see §10 once complete), which type-color palette and badge
treatment a given context uses (both sanctioned, dev-time call either
way), status-green for non-form indicators, bento/grain's eventual
occasions, and the retrofit-vs-fresh-application decision for pokeapp's
existing built modules.

**Implementation note — IBM Plex Sans**: DONE. Self-hosted, four `@font-face`
blocks in `src/design-tokens.css` — two subsets (latin, latin-ext) x two styles
(Roman, Italic), variable wght 100-700, precached, no CDN. The italic pair was
added late, after `font-style: italic` turned out to have been a silent no-op
app-wide: only Roman faces were bundled and Chrome synthesised nothing, so the
computed style read `italic` over upright glyphs in three places. Martian Mono
and JetBrains Mono are bundled the same way. `design-tokens.css` (the handoff
copy) still carries only the fallback stack, by design — it is the handoff copy.

## 7. Full 95-component pass (validated)

`ds-component-library-full95.html` covers the remaining ~81 components from
the original 95-item scope, organized by the same 9 categories agreed
early on. Promoted from draft to validated as of this entry — treat all
95 components as part of the settled design system, not provisional.
That said, "validated" here means consistent, correct application of the
locked tokens across every component, not that each one individually went
through the same multi-round, real-content scrutiny as the original 14 in
§5 or the species color table in §12 — if a specific component turns out
to need real content testing later (the way the Pokedex grid or detail
page did), that's a normal next step, not a sign this promotion was wrong.

Corrections already folded in: number-input stepper arrows are stacked
vertically (not side by side); rating input uses smooth path-based SVG
stars, not the unicode star character; modal/drawer/bottom-sheet scrims
are a genuinely translucent ~22% overlay, not a near-opaque wash; every
placeholder icon across all 95 components now uses one small, consistent
stroke-based SVG icon set instead of mismatched text/unicode glyphs.

Two principle questions surfaced during this pass and are deliberately
unresolved, not silently decided: whether `accent` (currently reserved for
active tab/nav state and binary indicators) should extend to a third use
— error/alert emphasis — and whether a separate status-green is warranted
for things like a "synced" indicator, distinct from both accent-red and
the type-color families.

Also clarified during this pass: the existing `toggle` component is
specifically a **binary state indicator**, not a segmented control (that's
now designed separately); the existing `select` is a **styled native
`<select>`**, not a custom dropdown-menu overlay (also now designed
separately, under Navigation).

**Button fill correction**: light-mode primary button now uses a new
`ink.800` primitive (`#3a3a3a`), not full `ink.900` black — see the color
tokens for detail.

## 8. Closed out: dex dimming, type-color dark contrast, form field states

Three items from the open-items list got real answers rather than staying
flagged indefinitely:

**Dex-number dimming.** Ties to caught/not-caught — the app's only tracked
binary state, not a separate "seen" concept that isn't tracked anywhere
else. Caught: 100% opacity. Not caught: 40%. Artwork itself is unaffected
either way — a silhouette-until-caught system would be a real feature
decision, not something to sneak in as a token default.

**Type-color dark-mode contrast**, computed properly (actual WCAG relative
luminance, not eyeballed) against both dark surfaces. Result: 10 of the 16
untested colors genuinely failed a reasonable floor — `ghost` was the
worst at 1.9:1. All 17 (both the muted and community palettes) now have a
verified dark-mode variant, each lightened by computed blend-toward-white
until clearing >=4:1. `dark` keeps its earlier hand-picked value since it
already exceeded that floor. These are computed-sufficient, not
hand-art-directed — further eyeballing is optional polish, not a blocker.

**Form field states.** Focus reuses the exact active-tab visual language
(2px accent underline) rather than inventing something new. Disabled drops
label/value/border to 40% opacity. Error uses accent-red for the border and
message — which resolves the standing question from the full-95 pass:
accent-red now has a confirmed third sanctioned use (active tab/nav state,
binary indicators, error/validation), still never plain decoration.
Success deliberately does *not* get a new status-green — a plain
ink-colored checkmark is enough, and introducing a new semantic color for
one case wasn't worth breaking monochrome+one-accent discipline. The
separate "does a non-form status-green exist" question (e.g. a synced
indicator) is different and still open.

## 9. Species background color database

`species-background-colors.json` — all 493 Gen 1-4 species, `{bg_light,
bg_dark}` pairs. Full methodology and revision history in
`design-tokens.json`'s `species-background-extraction` entry: three
extraction approaches were tried (synthetic hue reconstruction, real
k-means clustering, k-means plus an automated contrast-solver), and the
final answer rejected the two more "clever" automated approaches in favor
of the simplest one plus direct human review species-by-species. Worth
remembering if a future session is tempted to "improve" this with more
automation — that path was tried twice already and both times needed to
be walked back.

## 10. Form field states (built)

`ds-form-field-states.html` — default, focus, disabled, and error states,
actually built as a component rather than only described in tokens.
Focus reuses the active-tab 2px accent underline; disabled drops to 40%
opacity; error uses accent-red for both the border and message, per the
third sanctioned accent use confirmed in §8.

## 11. Current state and next step

Locked and validated: color/type/surface tokens, typography scale, radius/
spacing scale, the "no shadow, tone-step elevation instead" rule, the
Pokedex grid page (ghost card + mini watermark), the species detail page
(two-panel, persistent rounded drawer, layered background), both the
standard and species-tinted background modes, and the team-build form
(compact strip + EV-dominant layout).

*Written before implementation. §12 is the state now, and the two-panel drawer
line above is the one that did not survive — see §12.2.*

Next real task: pick up the next component or screen from the 95-item
scope and design it under these constraints — this document plus the two
token files are now the actual reference for that, not the chat history.

---

## 12. As built — the two screens that shipped

Everything above §12 was designed before implementation. This section is the
audit of what actually exists after building the Pokedex browse grid and the
species detail page against real data for all 493 Gen 1-4 species. It is the
authoritative record where the two disagree.

**`MODULE-PATTERNS.md` is the companion to this section** — same material,
organised as instructions for building the next module rather than as a record
of these two.

### 12.1 What survived contact, unchanged

Worth stating first, because most of the system did:

- **Monochrome plus one accent.** Held completely. The accent grew from two
  sanctioned uses to four, each by explicit argument.
- **No shadows — but this audit found the exception.** The DOM assertions cover
  every element the *reference page* renders, which is most of the system and not
  the whole app: `.egg-marker-note`, a popover on the species detail page's
  Learnset tab, was still carrying `box-shadow: var(--shadow)` — the legacy
  10px/15px double drop shadow from `index.css` — because no suite visits it.
  Fixed during this audit (`--surface-raised` plus the accent hairline it already
  had), and the suite now scans **every tracked CSS file under `src/`** for a
  `box-shadow` declaration, with one named allow-list entry: `.toggle-knob`, in
  the unimported `ToggleSwitch.tsx`. The rule held everywhere it was being
  watched, which is the useful lesson about where it was being watched.
- **Type as coloured text.** Held, and strengthened: there is now no badge of
  any kind anywhere in the app (§3).
- **Artwork provides the colour.** Held. Both screens are achromatic chrome plus
  official artwork.
- **The dex number as the signature element.** Held and amplified — the detail
  page's watermark is 341 raw units, exactly 200px at the width cap, letter-spaced
  0.2em, `tabular-nums` so it contains for all 493.
- **Three surface tones.** Held. On the detail page `--surface-raised` appears
  only as a bar/track fill; the page itself is one flat `--surface` plane.
- **Functional numbers are monospace, display numbers are not.** Held exactly as
  §2 refined it.
- **Hairline-and-whitespace separation.** Held. No card backgrounds and no
  borders anywhere in the detail page's tab content.

### 12.2 What changed, and why

| § | designed | built | why |
| --- | --- | --- | --- |
| 2 | accent has 2 uses | **4** | error emphasis (§8), then base-stat magnitude, confirmed against the Figma prototype |
| 2 | stats are never bars | **base stats are bars** | six values on one 0-255 scale; the spread is the fact. Scoped to that block only |
| 5 | detail page is a two-panel layout with a persistent rounded drawer | **one flat plane**: pinned column + banner + sub-nav + four tabs | the real Figma frame (`DetailPage-Light`) is not a drawer layout. The drawer spec is still built and live on the reference page |
| 5 | species-tinted artwork background | **not used on the real page** | the frame has no tint. The 493-pair database (§9) drives the reference page only |
| 5, 7 | uppercase micro-labels | **`capitalize`, tracking 0.01em** | requested directly; scoped to `.species-page` so the five old dexes and the reference page keep their own typography |
| 6 | Plex Sans "not yet in the codebase" | **self-hosted, Roman + Italic** | done; see the note in §6 |
| open-items | type badge and type palette are "dev-time per-context calls" | **both closed** | no badges at all; the community palette is the palette, the muted set is retired |

### 12.3 The scaling model — the one genuinely new architectural idea

Neither screen renders at the token sizes across an arbitrary viewport, and they
solve that differently. **This is the first decision a new screen has to make.**

**Grid page — frozen px at a measured scale.** The Figma frames are drawn at
2.348x, established by `calibrate-scale.mjs`: it measures every unambiguous text
node's advance in the real self-hosted face and inverts it to the size the node
was set at. Every role lands on a locked token at that divisor, which is how the
divisor was chosen — a conventional 2.0 export scale puts every role 1.2-3.0px
between tokens. Geometry is then Figma-value / 2.348, frozen as CSS px, and the
three 212px columns are **centred** in the wider shell rather than stretched.

**Detail page — proportional to its container.** The whole screen is one frame
(1860 x 1172), so `--dp-u` is one raw unit (`100cqw / 1860`) and every length is
a multiple of it. The crucial move is that the type and spacing **tokens** are
redefined in those units on an inner wrapper, so `DataTable`, `StatRow` and
`Tabs` scale with the page for free — no per-component pass. Two tunable numbers,
deliberately separate: the 1400px width cap, and `--dp-s` (0.78) which multiplies
only type. Because every length is one unit, "narrower page" and "smaller text"
would otherwise be one control.

`npm run report:type-scale` prints every size in the app — the fixed tokens and
the detail page's raw units, measured in a real browser. The RAW column is what
you edit.

### 12.4 Patterns that emerged during implementation

None of these were in the original scope. All are now reusable, and all are
written up with their failure modes in `MODULE-PATTERNS.md`:

- **The hairline-band rule.** If rows draw their own `border-bottom`, a row *gap*
  falls inside the band a reader sees, and content centred in its own box reads
  low. No row gap on a bordered-row grid; verify by reconstructing the band from
  the hairlines, not by measuring the row box.
- **Subgrid for paired columns.** Two lists read as pairs must share row tracks,
  or the taller cell walks every hairline below it out of line.
- **`LoadState` as a four-state type.** `ready` with an empty array is not
  `error`; conflating them made the UI assert something false.
- **On-demand data behind an intersection gate**, where the gate is "on screen"
  rather than "has scrolled" — and partial failures are named, never dropped.
- **Cross-navigation is a clickable label**, never a button shape. Includes
  section headings that expand to own their tab.
- **Group a chart by the axis with fewer buckets** — six multiplier tiers, not
  seventeen per-type cells.
- **Custom SVG only where the game has no Tabler equivalent** (evolution
  conditions), and prefer the plainer glyph elsewhere.

### 12.5 Verification as part of the system

Ten suites, **1,317 checks**, driving the real app in a real browser — 341 of
them in `verify-design-system.mjs`, which resolves expected values out of
`design-tokens.json` and asserts them against what the browser computes, so it
fails if the CSS drifts from the tokens rather than comparing the CSS to a copy
of itself. This is part of the design system rather than adjacent to it, because
several design decisions were only provable by measurement and two shipped wrong
without it:

- **Assert the relation, not the pixel** — padding as a fraction of its type
  survives a scale change.
- **Measure what rendered, not what was declared** — a computed style says what
  the CSS asked for. `font-style: italic` read `italic` over upright glyphs for
  months; sprite transparency needed canvas pixel decoding; the animated-WebP
  check reads the file's own `VP8X` flag byte.
- **Assert removals** — no fill, no radius, no leftover padding, one colour where
  there were sixteen. An exception that has been taken out grows back otherwise.
- **Both themes, every time**, and wait on `img.complete` before measuring.

### 12.6 Still open after implementation

- **`ToggleSwitch.tsx` is dead code and a trap.** Nothing imports it; the
  sanctioned toggle is `components/ds/Toggle.tsx`. It is the last `box-shadow` in
  the codebase, allow-listed by name in the suite rather than fixed, so that
  adding the app-wide scan did not also delete a component. Delete both together
  when someone decides to.

- **Dex-number dimming at grid scale** (carried from §5). The ledger rule exists
  (caught 100% / not-caught 40%); the grid card has not adopted it.
- **The reference page shows the superseded detail design.** Deliberate — it is
  the handoff artefact for the §5 spec, and rebuilding it around the frame
  reproduction would duplicate the real page. Flagged rather than done.
- **Status-green for non-form indicators** — unchanged from §8, still open.
- **`--radius-badge-square`** — a sanctioned token nothing uses, now that the
  game badge is gone.
- **Retrofit of the five pre-redesign dexes** — unchanged. They keep their own
  layout and typography by standing decision.
- **Species-tinted backgrounds and the 493-pair database** — built, reviewed
  species-by-species, and currently unused by the shipping detail page. Not
  deprecated; it has nowhere to go under the frame design as drawn.
