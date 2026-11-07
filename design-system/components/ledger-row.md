# Ledger row (`LedgerRow`)
Implemented by `src/components/ds/LedgerRow.tsx` (styles `.ds-ledger-*` in `src/components/ds/ds.css`). Rendered by the design-system reference page only.
**Purpose:** one species per row of a list, the dex number as the row's subject in its own ruled column.
**Anatomy:** a full-width `<button>`, flex, centred, `--space-gap-md` gap, `--space-row-padding-block` (9px) top and bottom, 1px `--hairline` under it, no fill · number (38px column, right-aligned, `--font-numeric`, tabular, 20px, bold, `--text-primary`, padded to three digits) · 1px vertical `--hairline` rule · sprite: 32px circle, 1.5px `--hairline` outline, image contained (an empty outlined circle when there is no sprite) · name (13px, medium, `--text-primary`, one line, ellipsis) · type row, small (type-label.md).
| State | Look |
|---|---|
| caught | number at `--ledger-num-opacity-caught` (1) |
| not caught (default) | number at `--ledger-num-opacity-not-caught` (0.4) |
**Tokens:** `--hairline`, `--text-primary`, `--font-numeric`, `--font-weight-bold`, `--font-weight-medium`, `--space-gap-md`, `--space-row-padding-block`, `--ledger-num-opacity-caught`, `--ledger-num-opacity-not-caught`.
**Rules:** only the number dims; the sprite never does. `caught` is a prop with no store behind it. Inside `.ds-ledger-list` the last row has no hairline. No hover or focus styles of its own.
**A11y:** a `<button>` named by its text (number, name, types); the rule is `aria-hidden`, the sprite has `alt=""`.
