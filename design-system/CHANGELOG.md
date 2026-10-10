# Changelog
## 2.2.0 — 2026-10-10 (non-breaking)
- Type colours: `--type-*` (app) now aliases `color.type-ink` per mode, i.e. what `--color-type-text-*` resolves to. All 18 types ≥4.5:1 on both canvases (the old set sat at 4.0:1 on 12 of 17 in light); Fairy added, so a Gen 6+ type no longer falls back to grey
- New editorial detail page for the Movedex, Abilitydex, Itemdex, Naturedex and Berrydex (`PATTERNS.md` §5): name → identity → ghost → strip → lead text → grouped facts → related data; no borders, fills or shadows for grouping. The Breeding dex keeps the card-grid detail on the same component (`variant` flag)
- Key-value list: new `strip` layout (label-caps over an h3-size value, side by side, no hairlines) for an entry's headline numbers; first shared implementation (`KeyValueList`), as a `<dl>`
- Stat bar: first shared implementation (`StatBar`), used for berry flavour potency on a 0–40 scale; the species page's base-stat bars are not yet migrated to it
- Ghost watermark: a `detail` scale carrying text (a move's power, a nature's stat delta), in flow in its own grid area, `font.style.watermark` in `color.text-watermark`; always restated as readable text
- Ledger row: a `plain` variant (no number column, no vertical rule, regular-weight name) and a trailing `aside` value, for grouped species lists
- Naturedex: matrix without gridlines or fills (alignment and a wide gutter; diagonal by italics and muted ink); hover is weight, not background; stat arrows use `color.status.up/down`
- Berrydex card: the ghost dex number is removed; the grid stays
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
