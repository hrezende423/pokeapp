# Changelog
## 2.1.7 — 2026-10-11 (non-breaking)
- New tokens: `font.weight.light` (300); `color.category-ink.*` + semantic `color.category-text.{physical,special,status}` (physical a light orange near the Fighting ink, special a blue near the Water ink, status the muted neutral; contrast-checked both themes)
- Data table `plain`: rows LIGHT at rest, REGULAR on hover (was regular → semibold)
- Abilitydex list: the number at the table's size, centred on the row
- Movedex list: Category in capitals at the type label's size, coloured by category; number columns in `--text-secondary`; "%" in the mono face at the numbers' size
- Sort/Filter is disabled on an open Abilitydex or Movedex entry page
- Movedex page: "Introduced in Generation N" as a grey line under the description; Battle (two columns in shared-height lanes) and Contest (one column, values left-aligned) sections that do not fold; change history as a vertical timeline ("Move changes throughout generations"); the learner total is gone and each learn method shows "N species" under its label; the game row is a right-aligned mini navbar (ghost buttons, selected in accent, one hairline under the buttons, no label); info column 600px with a 28px scrollbar gutter, stacking by a container query
- Itemdex page: attributes on one line; acquisition lists every game from Generation 1 up to the selected one
## 2.1.6 — 2026-10-11 (non-breaking)
- Poképedia order: Pokédex, Movedex, Abilitydex, Itemdex, Berrydex, Naturedex, Breeding dex, Trainer Dex; Type Coverage moved to Tools (after Calculators)
- Data table, `plain` variant (Movedex, Abilitydex, Itemdex lists): no hairlines, every cell and header regular, the hovered row semibold in place of a hover fill; columns are declared widths so nothing moves, and a prose cell reserves its semibold height
- Itemdex list: icon before the name at 48px, centred on it; Price column (₽, selected generation's default game)
- Itemdex page: centred column; ₽ prices grouped by game; generations as a range ("1–4"); attributes as read-only checkboxes; a centred Acquisition chevron unfolds a Games / Finite / Repeatable table
- Abilitydex list: the number at caption × 0.92 in `--text-secondary`, as on the species card
- Movedex list: Category at the type label's size
- Abilitydex and Movedex pages: two columns, each scrolling on its own — info (title regular) beside the species grid at its unchanged 3 × 212px — centred; stacked below 1300px. The Movedex's facts sit in two columns under the description
- Checkbox: a read-only state (see `components/checkbox-radio.md`)
## 2.1.5 — 2026-10-10 (non-breaking)
- App bar: Grid/List, Sort and Search/Filter merge into one text trigger, "Sort/Filter", whose panel has three parts (View mode · Sort · Search/Filter) with hairlines only between them; disabled on pages with nothing to sort or filter (Naturedex, Type Coverage, Build Form, calculators, Team Matchup)
- Every navbar menu (nav dropdowns, Sort/Filter, account) is `--surface`, not `--surface-raised`
- Filter menu: "Reset filters" sticky at the top, no icon; section resets use the plain rotate glyph (no centre dot); "More filters" is a down/up chevron
- Type filter: every type name in its own colour, regular; selected adds bold
- Type Coverage: no underline under the selected tab; the Matrix toggles are text labels at the tab size, selected = bold `--text-primary`
- One gap under the app bar for every page (`--space-gap-lg` margin); the 14px top padding of Type Coverage, Calculators and Team Matchup is gone
## 2.1.4 — 2026-10-10 (non-breaking)
- Species grid card: the four text lines evenly spaced (12.5px baseline-to-cap); `#0001` at the BST number's size
- Itemdex, Abilitydex (with an Ability # column), Breeding dex and Trainer Dex are sortable data tables like the Movedex; their bar Sort menu is gone
- Data table: an unsortable column's header takes the sortable headers' face; a prose cell (`.data-table-prose`) wraps
## 2.1.3 — 2026-10-10 (non-breaking)
- Page titles take the nav's face and normal tracking (they inherited a -1.68px h1 letter-spacing)
- Species grid card: row gap 9px (= column gap), `#0001` back before the name, name and BST/Speed numbers regular, ability line-height normal
- Dex pages other than the Pokédex: list/table centred, top level with the title; title beside it at ≥1300px
## 2.1.2 — 2026-10-10 (non-breaking)
- Account menu: a Generation row under Theme (label left, underline select right, 112px, label-size type) replaces the game select in the Search/Filter panel
- Game row (the species page's segmented `species-scope` buttons, game axis only) on the Trainer Dex and the Movedex detail, inside the selected generation
- Type label: the `unknown` type reads `???`
## 2.1.1 — 2026-10-04 (non-breaking)
- `font.family.sans` is IBM Plex Sans again (Manrope reverted: it breaks the Team Display's cap-height levelling); `font.family.mono` leads with Martian Mono, JetBrains Mono as fallback
## 2.1.0 — 2026-10-04 (non-breaking)
- Accent hue 360/sat 75; dark accent = light accent (accepted exception in `$exceptions`)
- Font Manrope; new `font.weight.*`, `font.tracking.*`, `size.bar-height`; every font style references weight + tracking
- Sizes: body 14, label-caps 9, data 12, watermark 108, h1 30; caps tracking .2em
- Weights: display/h1–h4/label-caps now regular (owner decision); semibold kept for buttons, tabs, nav, type names, row labels; bold only for the ghost numeral
- Interactive style: buttons and links = semibold, bold on hover; no underlines; no hover backgrounds anywhere; new `components/link.md`
- Tabs: selected = accent color (no bold, no underline); slider thumb = filled oblong, no border
- Form controls specified: text field, dropdown, toggle, checkbox/radio, slider (filled oblong thumb), stepper (bold-on-hover signs)
- Component styles fixed: ghost-only buttons, underline inputs, stat bars without ticks
- Deprecated (remove in 3.0.0): `action.primary*`, `action.secondary*`, `action.danger-hover`, `text.on-action`, `data.tick`
- Contrast gate: 208 checks, 0 fails, 6 accepted exceptions
## 2.0.0 — 2026-10-03 (breaking vs 1.0.0)
- Direction rebuilt from the reference pages (PRINCIPLES.md, PATTERNS.md)
- BREAKING: `brand` (indigo) removed → `accent` (red, wayfinding-only); `action.primary` now dark; `text.link/subtle`, `border.default` removed → `text.muted`, `border.hairline`; neutrals now pure grey
- Added: `type-text` (accessible colored type names), `status.up/down`, `data.*`, `text.watermark`, `font.style.label-caps|data|watermark|name`, `density.*` (+ `--d-*` aliases), specs: nav, type-label, stat-bar, key-value-list, section
- Removed Tailwind preset (stack = plain CSS)
- Contrast gate: 202 checks, 0 fails
## 1.0.0 — 2026-10-03
- Initial rebuild
