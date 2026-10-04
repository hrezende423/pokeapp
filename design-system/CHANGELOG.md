# Changelog
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
