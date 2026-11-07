# Data rows (`StatRow`, `StatList`, `EvRow`, `EvTotal`, `MoveSlotGrid`)
Implemented by `src/components/ds/DataRows.tsx` (styles `.ds-stat-*`, `.ds-ev-input`, `.ds-ev-total`, `.ds-move-tile`, `.ds-move-grid` in `src/components/ds/ds.css`).
**Purpose:** read-only label/value rows. `StatRow` + `StatList` are used by the species Info tab and the Stat and Experience calculators; `EvRow`, `EvTotal` and `MoveSlotGrid` only by the design-system reference page.
**StatRow:** flex, `space-between`, `--space-gap-md`, padding 8px 0, 1px `--hairline` under it · label (`--font-size-label`, uppercase, 0.05em, `--text-secondary`) · value (`--font-numeric`, tabular, bold, 13px, `--text-primary`). `StatList` wraps rows and drops the last row's hairline. No bars, no colour by value.
**EvRow:** the same row as a `<label>`, the value an `<input type="number">` (0–252), right-aligned mono bold. The `.ds-ev-input` rule is shared with ev-stat-table.md and its later declarations win: full width, `--font-size-caption`, a transparent underline that turns `--hairline` on hover and 2px `--field-focus-border` on focus.
**EvTotal:** a `<p>` "N / 510 EV allocated", with "— N over the cap" past the cap · `--text-secondary`, `--font-size-caption`, bold, right-aligned (the later `.ds-ev-total` rule) · over the cap (`data-over`) → `--accent`.
**MoveSlotGrid / its MoveSlotTile:** four read-only tiles in a 2-column `max-content` grid, `--space-gap-md` gap · tile 150px, padding 12px 14px, 1px `--hairline`, `--radius-control`, no fill · "Move N" label (`--font-size-caption`, uppercase, `--text-secondary`) over the move name (13px, medium, `--text-primary`; empty = "—"). Not the selectable tile in move-slot-tile.md, which has the same export name.
| State | Look |
|---|---|
| EvRow input focus | 2px `--field-focus-border` underline |
| EvTotal over the cap | `--accent` text |
**Tokens:** `--hairline`, `--text-primary`, `--text-secondary`, `--font-numeric`, `--font-size-label`, `--font-size-caption`, `--font-weight-bold`, `--font-weight-medium`, `--space-gap-md`, `--space-gap-sm`, `--radius-control`, `--field-focus-border`, `--field-focus-border-width`, `--accent`.
**A11y:** `StatRow` is a `div` of two `span`s, not a `<dl>`. The EvRow input is named by its wrapping `<label>`. EvTotal is plain text, no live region.
