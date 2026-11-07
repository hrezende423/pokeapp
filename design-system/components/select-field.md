# Select field (`SelectField`)
Implemented by `src/components/ds/SelectField.tsx` (styles `.ds-field*`, `.ds-select-*` in `src/components/ds/ds.css`).
**Purpose:** a styled native `<select>` in the text field's shell. The most used ds field: the calculators, every tool, Team Matchup, the Collection, the dex filter panel, the generation selector. **Not** a custom overlay menu: the open list is the browser's own.
**Anatomy:** the text field's label, control and helper (text-field.md) · `appearance: none`, 18px right padding · chevron `▾` (a unicode glyph, not an icon), absolute right 4px / bottom 8px, 11px, `--text-secondary`, `aria-hidden`, ignores the pointer.
**Options:** plain strings (value = label), `{ value, label }` pairs (an "Any" that submits `''`), or `{ group, options }` drawn as an `<optgroup>`.
| State | Look |
|---|---|
| default | 1px `--hairline` underline |
| focus (`:focus` or `state="focus"`) | 2px `--field-focus-border` underline |
| error | 1px `--field-error-border` underline; no message slot |
| disabled | `<select disabled>`; label and control at `--field-disabled-opacity` |
| success | accepted, no visual change |
**Tokens:** as text-field.md, plus `--text-secondary` for the chevron.
**Rules:** `hideLabel` and `fieldSize` behave as in text-field.md. `.dcalc` (calculators.css) moves the chevron to bottom 4px at 9px.
**A11y:** a real `<select>` inside its `<label>`: native keyboard, native picker on touch.
