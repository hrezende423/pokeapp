# Pokeapp Design System — v1 extraction

Extracted from the locked POC (`ds-hero-variant-a-dark.html`) and the exploration
rounds that led to it. This is reference documentation, not a changelog — it
captures the current state and the reasoning behind it, not a running history
of every round.

Companion files: `design-tokens.json` (platform-agnostic, W3C DTCG-flavored),
`design-tokens.css` (web/React implementation).

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
The accent (`--accent`, Pokedex red) is reserved for exactly two functional
jobs — active tab/nav state, and binary state indicators (caught toggle,
similar future toggles). It never decorates. If a new component wants to use
the accent, ask whether it's a genuinely analogous functional case first.

**The dex number is the signature element, not a caption.** Across the whole
system, the catalog number gets outsized visual treatment — a full ledger
column with its own rule in lists, a 220px 5%-opacity watermark in detail
views. This is the one deliberately loud move; everything else stays quiet
around it (spend the boldness in one place).

**No shadows, anywhere, in either mode.** Hierarchy comes from hairline
borders (`--hairline`) and whitespace. This was a hard-won decision after
several rounds defaulted to "safe" ambient shadows — treat any urge to add a
`box-shadow` as a signal to reconsider the layout, not a styling gap to fill.

**Type is data, not decoration.** Type (Fire/Water/Grass/etc.) renders as a
colored text label only — no fill, no pill, no badge shape. Colored badge
chips were tried and explicitly rejected (see §4) as the single most common
"AI-generated dashboard" tell we found across every reference search.

**Numbers are always monospace.** Dex index and stat values use
`--font-numeric`; names, labels, and body copy use `--font-body`
(**IBM Plex Sans**, self-hosted — see implementation note below). This is
the only typographic mixing rule in the system.

**Stats are a plain data table, not a progress-bar widget.** Label left,
value right, monospace, hairline row divider. Progress bars were tried and
rejected — too close to the generic fitness-app/RPG-clone default, and
disconnected from anything specific to a Pokedex.

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
  found across every reference search. Replaced with colored text.
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
- Ghost watermark: dex number, `--font-numeric`, `--font-size-ghost-watermark`,
  `--ghost-watermark` color at `--ghost-watermark-opacity`, positioned
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
- No tertiary/ghost/danger variants specified yet.

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
- Mini ghost watermark: dex number, `--font-numeric`, `--font-size-ghost-watermark-grid`
  (64px — a scaled-down version of the hero/detail treatment, same color and
  opacity rules), positioned top-right of the card, bleeding off the edge.
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

### Species detail page
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

**Implementation note — IBM Plex Sans**: this is a self-hosted webfont, not
a system font. Download the actual font files from Google Fonts and bundle
them (same treatment as sprite assets — no CDN dependency, offline-first).
Add `@font-face` rules once those files exist; `design-tokens.css`
currently only has the fallback stack wired up.

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

Next real task: pick up the next component or screen from the 95-item
scope and design it under these constraints — this document plus the two
token files are now the actual reference for that, not the chat history.
