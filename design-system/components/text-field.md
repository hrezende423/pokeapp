# Text field (`TextField`)
Implemented by `src/components/ds/TextField.tsx` (styles `.ds-field*` in `src/components/ds/ds.css`).
**Purpose:** a labelled single-line `<input>` (text or number; every input prop passes through). Used across the calculators, the tools, the Collection and the dex filter panel. Number fields pair it with `useDraftNumber` so the value can be empty mid-edit.
**Anatomy:** `<label>` column, 5px gap, 220px wide (max 100%) · label (`--font-size-label`, uppercase, 0.05em, `--text-secondary`; `hideLabel` keeps it for assistive tech only) · control (`--font-size-body`, `--text-primary`, no fill, 1px `--hairline` underline, radius 0, padding 7px 2px; placeholder `--text-secondary`) · optional success check · helper or error line (`--font-size-label`, `--text-secondary`).
| State | Look |
|---|---|
| default | 1px `--hairline` underline |
| focus (`:focus` or `state="focus"`) | `--field-focus-border-width` (2px) `--field-focus-border` underline; bottom padding drops 1px so the field keeps its height |
| error | 1px `--field-error-border` underline; the `error` text replaces the helper, in `--accent`, `role="alert"` |
| success | Tabler check, 16px, 1.5 stroke, `--text-primary`, right of the value |
| disabled | input `disabled`; label and control at `--field-disabled-opacity` (0.4), cursor not-allowed |
**Tokens:** `--font-size-label`, `--font-size-body`, `--text-primary`, `--text-secondary`, `--hairline`, `--field-focus-border`, `--field-focus-border-width`, `--field-error-border`, `--field-disabled-opacity`, `--accent`, `--space-gap-sm`.
**Rules:** no hover style; no clear button. Inside a `CompactFieldStrip` (form-parts.md) `fieldSize` sets the share: `narrow` 56px fixed, `wide` 2 1 168px, unset 1 1 112px. `.dcalc` (calculators.css) tightens the gap to 2px and the padding to 3px 1px.
**A11y:** the input sits inside its `<label>`, so the label names it; the error is announced through `role="alert"`; the success icon has `aria-label="Valid"`. No `aria-invalid` or `aria-describedby` is set.
