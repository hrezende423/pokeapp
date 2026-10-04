# Button (v2.1.0, decided: semibold; hover = bold, no background)
**Purpose:** trigger an action on the current page. **Not for:** navigation (link/nav), toggling (switch), choosing one of ≤5 (tabs/radio).
**Style:** ghost only. No fill, no border, no hover background anywhere (owner decision 2026-10-04). Rest = semibold label; hover = bold (700).

## Anatomy
[icon 16px, optional] [label, `font.style.label`: 14px, semibold, tracking .035em] [icon, optional]. Gap 8px. Horizontal padding 12px. Radius `radius.md`.

## Sizes (height; padding is invisible, hit area ≥44px on touch)
| Size | Height | Use |
|---|---|---|
| sm | 32 | compact tier (dense forms, rows) |
| md | 40 | default tier (default) |
| lg | 44 | airy tier / touch |
Size follows `--d-field` (density), not a prop, unless overridden.

## Tones
| Tone | Text | Use |
|---|---|---|
| default | `text.default` | every action |
| danger | `action.danger` | destructive only (delete team, release Pokémon); label names the action; confirm step before irreversible |
No "primary" or "secondary". Importance comes from position (bottom-right of the form, one per region) and wording, not styling.

## State matrix
| State | Background | Text | Other |
|---|---|---|---|
| default | none | `text.default` | |
| hover | none | bold (700) | pointer only |
| focus-visible | none | same | 2px `border.focus` ring, 2px offset |
| active (pressed) | none | bold (700) | no movement/scale |
| disabled | none | `text.disabled` | `aria-disabled`, no hover, tooltip not required |
| loading | none | `text.muted` | spinner replaces leading icon, label kept (width stable), `aria-busy`, ignores clicks |
Danger: same matrix, text `action.danger`.
Motion: background `motion.duration.fast`; respects reduced motion.

## Rules
- One button group per region; max 3 buttons in a row; order: least destructive first, danger last.
- Icon-only buttons need `aria-label` and a 44px hit area.
- Never use accent on buttons (accent = wayfinding).
- Ghost buttons must read as clickable: always semibold, inside a recognizable action area (form footer, row end, toolbar), never inline in running text (use link there; same semibold + bold-on-hover style).
- Full width allowed < `breakpoint.sm`.

## A11y
`<button type="button">`; Enter/Space; label visible text; contrast of `text.default` and `action.danger` ≥4.5:1 in both themes (checked by the gate).
