# Text field (input, number, textarea)
**Purpose:** typed values. **Not for:** choosing from a list (dropdown), on/off (toggle), ranges (slider).
**Anatomy:** label (`label-caps`, muted, above) · value (`font.style.body`; numbers `font.style.data` mono, tabular, right-aligned) · underline · optional help/error text (12px) · optional trailing clear ×.
**Style:** underline only, no box, no fill. Height `--d-field` (32/40/44). Textarea: same underline, min 3 rows, grows with content.
| State | Underline | Text | Extra |
|---|---|---|---|
| default | 1px `border.strong` | value `text.default`, placeholder `text.muted` | |
| hover | 1px `text.default` | same | |
| focus | 2px `border.focus` | same | no box-shadow glow |
| filled | as default | | clear × on hover/focus |
| error | 2px `action.danger` | same | message below with ⚠ in `feedback.error.fg`; `aria-invalid`, `aria-describedby` |
| disabled | 1px `border.hairline` | `text.disabled` | no hover, not focusable |
| read-only | none | `text.default` | looks like a value row, still selectable/focusable |
**Rules:** label always visible (placeholder is an example, never the label); validate on blur, not per keystroke; help text only when it prevents an error; number fields use `inputmode="numeric"`; whole row is hit area, ≥44px on touch.
**Number stepper (decided 2026-10-04):** − / + signs (44px wide, 18px, regular weight) around a centered mono value (16px). Hover, press and keyboard focus: sign turns bold (700), no background; focus adds the 2px ring. Ranges ≤ ~100; Up/Down arrows change the value; hold repeats; for wider ranges use a slider + field.
