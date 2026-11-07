# Ghost watermark (`GhostWatermark`)
Implemented by `src/components/ds/GhostWatermark.tsx` (styles `.ds-ghost*` in `src/components/ds/ds.css`). Drawn by hero-detail-card.md and species-grid-card.md.
**Purpose:** the oversized dex number behind a card, as identity, not data.
**Anatomy:** a `span` with the number padded to three digits · absolute, z-index 0, `--font-body` (the proportional face, not mono), bold, line-height 0.8, colour `--ghost-watermark` at `--ghost-watermark-opacity` (0.09 light, 0.05 dark).
| Scale | Size | Offset |
|---|---|---|
| `hero` | `--font-size-ghost-watermark` (220px) | top −46px, right −28px |
| `grid` | `--font-size-ghost-watermark-grid` (64px) | top −12px, right −8px |
**Tokens:** `--ghost-watermark`, `--ghost-watermark-opacity`, `--font-body`, `--font-weight-bold`, `--font-size-ghost-watermark`, `--font-size-ghost-watermark-grid`.
**Rules:** it bleeds off the top-right corner, so its host is `position: relative; overflow: hidden` and lifts its other children to z-index 1. Ignores the pointer and cannot be selected.
**A11y:** `aria-hidden`; the number is always printed elsewhere as text.
