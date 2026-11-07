# Move-slot tile (`MoveSlotTile`, `MoveSlotGrid`)
Implemented by `src/components/ds/MoveSlotTile.tsx` (styles `.ds-move-slot*` in `src/components/ds/ds.css`). Used by the damage calculator, one tile per move with its result.
**Purpose:** a small bordered tile, label over value, four to a 2×2 grid; optionally the selected one of the four.
**Anatomy:** flex column, 4px gap, padding 10px 12px, 1px `--hairline`, `--radius-control`, no fill · label (`--font-size-label`, uppercase, 0.05em, `--text-secondary`): a button when `onSelect` is given, else plain text · value (`--font-size-body`, medium): a move picker or a name; a ds field inside it is full width · optional detail line (`--font-size-caption`, `--text-secondary`), e.g. a damage range.
**Grid:** `MoveSlotGrid`, two equal columns, 10px gap.
| State | Look |
|---|---|
| default | as anatomy |
| selected (`data-selected`) | `--surface-raised` background, `--text-secondary` border |
| label focus-visible | 2px `--accent` outline, 2px offset |
**Behaviour:** clicking the label, or focusing anything inside the tile (the picker included), calls `onSelect`.
**Tokens:** `--hairline`, `--surface-raised`, `--text-secondary`, `--accent`, `--radius-control`, `--font-size-label`, `--font-size-body`, `--font-size-caption`, `--font-weight-medium`.
**Rules:** selection is a tone-step, not a colour; no shadow. Not the read-only tile `DataRows.tsx` also exports as `MoveSlotTile` (data-rows.md).
**A11y:** the label button carries `aria-pressed`; the picker inside keeps its own label.
