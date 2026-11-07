# EV / stat table (`EvStatTable`, `EvStatRow`, `RangeSlider`)
Implemented by `src/components/ds/EvStatTable.tsx` (styles `.ds-ev-*`, `.ds-range` in `src/components/ds/ds.css`). Used by the damage calculator's Pokémon panels.
**Purpose:** the six stats with editable spread values and the resulting stat, era-agnostic: each row takes an effort cell and an individual cell, either absent or read-only; the caller decides what an era has.
**Columns:** Stat | Base | IV | EV (+ slider) | Total, and an optional sixth cell (the calculator's stat stage). One grid for header and rows: 34px 28px 34px 1fr 38px (+46px), 10px column gap, padding 5px 0, 1px `--hairline` under each row.
**Cells:** header (`--font-size-label`, uppercase, 0.05em, `--text-secondary`; base, IV and total right-aligned) · stat label (same voice) · base (`--font-size-caption`, `--text-secondary`, right) · number cells (`--font-numeric`, `--font-size-caption`, bold, right, `--text-primary`, transparent underline) · a read-only IV (the Gen 1–2 HP DV) in `--text-secondary`, titled "Derived from the other DVs" · total (`--font-size-caption`, bold, right) · optional footer `<p>` (`--font-size-label`, `--text-secondary`, 6px above).
**EV cell:** number box then slider (52px + 1fr, 8px gap); with no slider (Gen 1–2 Stat Exp) the number takes up to 64px.
**RangeSlider:** native range, 0–max, step 1, 16px tall · track 4px, 1px `--hairline` border, radius 2px, filled to `--fill` in `--accent`, the rest `--ds-slider-track` · thumb 20×11, radius 6px, `--ds-on-accent` fill, 1px `--ds-slider-thumb-border`. The three `--ds-*` values are local to `.ds-ev-table` (light `#e2e2e6` / `#9b9ba1`, dark `#3a3a3e` / `#ffffff`; thumb fill `#ffffff`).
| State | Look |
|---|---|
| number hover | underline `--hairline` |
| number focus | 2px `--field-focus-border` underline |
| slider focus-visible | thumb border `--field-focus-border` |
| slider disabled | `--field-disabled-opacity`, not-allowed |
**Editing:** number cells use `useDraftNumber`: the box may be empty while typing, each keystroke that parses commits clamped to 0–max and rounded, blur restores the committed value.
**Tokens:** `--hairline`, `--text-primary`, `--text-secondary`, `--accent`, `--font-numeric`, `--font-size-label`, `--font-size-caption`, `--font-weight-bold`, `--field-focus-border`, `--field-focus-border-width`, `--field-disabled-opacity`.
**Rules:** no cap check of its own (no 510 warning); the footer says whatever the caller passes. `.dcalc` (calculators.css) re-lays the columns for the calculator.
**A11y:** inputs named "<Stat> individual value", "<Stat> effort", "<Stat> effort slider"; string headers are `aria-hidden` (rows carry their names), node headers (the reset buttons) stay in the tree.
