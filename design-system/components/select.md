# Dropdown (select / combobox)
**Purpose:** pick one (or several) of 6–~15 options. **Not for:** 2–5 options (radio), >15 (searchable combobox, same menu plus a filter field at top).
**Closed:** looks like a text field underline + 16px chevron (↓ closed, ↑ open); label above like text field.
**Menu:** `bg.surface`, 1px `border.strong`, no shadow, 4px vertical padding, width ≥ trigger, max-height 8 rows then scroll. Option row height `--d-field`, padding-x 12px.
| State | Look |
|---|---|
| option default | regular `text.default` |
| option hover | semibold, no background |
| option keyboard focus | 2px `border.focus` inset ring |
| option selected | semibold + ✓ right (never accent) |
| option disabled | `text.disabled`, `aria-disabled`, explains why in label if useful |
| trigger states | same as text field (hover, focus, error, disabled) |
**Multi-select:** ✓ per selected option, menu stays open, trigger shows "3 selected" or comma list truncated.
**A11y:** trigger `aria-haspopup="listbox"`, `aria-expanded`; Up/Down move, Enter/Space select, Esc closes and returns focus, type-ahead jumps; on touch use the native `<select>` picker.
