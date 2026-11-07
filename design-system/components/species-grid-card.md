# Species grid card (`SpeciesGridCard`)
Implemented by `src/components/ds/SpeciesGridCard.tsx` (styles `.ds-grid*` in `src/components/ds/ds.css`). Rendered by the design-system reference page only; the Pokédex grid draws its own card (`src/modules/pokedex/`).
**Purpose:** one species in a browse grid: a ghost card, no border, no fill; the artwork carries the colour.
**Anatomy:** a `<button>`, relative, overflow hidden, padding `--space-gap-md`, `--radius-card`, no border or background · ghost watermark, grid scale (ghost-watermark.md) · artwork 110px tall, contained, lazy (an empty box of the same height when missing) · a line with the number (`--font-numeric`, `--font-size-label`, `--text-secondary`, three digits) and the name (15px, bold, `--text-primary`), baseline-aligned, `--space-gap-sm` apart, 6px below the art · small type row (type-label.md) · ability, if given (`--font-size-caption`, `--text-secondary`).
**Grid:** `.ds-grid`, three equal columns, `--space-gap-lg` gap.
| State | Look |
|---|---|
| default | as anatomy |
**Tokens:** `--radius-card`, `--space-gap-sm`, `--space-gap-md`, `--space-gap-lg`, `--font-numeric`, `--font-size-label`, `--font-size-caption`, `--font-weight-bold`, `--text-primary`, `--text-secondary`.
**Rules:** order below the art is fixed: number + name, types, ability. Nothing dims; there is no `caught` prop. No hover or focus styles of its own.
**A11y:** a `<button>` named by its text; the artwork's `alt` is the name; the watermark is hidden.
