# Form parts (`FormSectionLabel`, `CompactFieldStrip`)
Implemented by `src/components/ds/FormParts.tsx` (styles `.ds-form-section-*`, `.ds-field-strip` in `src/components/ds/ds.css`).
**Purpose:** the structure of a long form without boxes: a named group header and a wrapping row of fields. Used by the damage calculator and the Collection's entry form. Team Building's Build Form draws its own (`.tb-form-*`).
**FormSectionLabel:** flex row, baseline-aligned, `space-between`, `--space-gap-sm` gap, 4px bottom padding, 1px `--hairline` under it · title an `<h3>` (`--font-size-label`, bold, uppercase, 0.06em, `--text-secondary`, line-height 1.4) · optional `aside` on the right (`--font-size-label`, `--text-secondary`) for a readout or control that belongs to the group (an EV total, a mode switch).
**CompactFieldStrip:** flex, wrapping, bottom-aligned, gaps 10px row / 14px column. Its children are ds fields (TextField, SelectField, SearchSelect); each takes `flex: 1 1 112px` (width auto, min-width 0) unless it sets `fieldSize`:
| `fieldSize` | Flex |
|---|---|
| unset | 1 1 112px |
| `narrow` (a 2–3 digit value) | 0 0 56px |
| `wide` (a name that must not truncate) | 2 1 168px |
A field's control truncates with an ellipsis.
**Tokens:** `--hairline`, `--text-secondary`, `--font-size-label`, `--font-weight-bold`, `--space-gap-sm`.
**Rules:** the label and its hairline are the group's whole boundary; no background, no box. `.dcalc` (calculators.css) tightens the strip's gaps to 6px / 10px.
**A11y:** the title is a real heading (`h3`); the strip adds no semantics, each field keeps its own label.
