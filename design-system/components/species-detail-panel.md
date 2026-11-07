# Species detail panel (`SpeciesDetailPanel`)
Implemented by `src/components/ds/SpeciesDetailPanel.tsx` (styles `.ds-detail*` in `src/components/ds/ds.css`). Rendered by the design-system reference page only; the real species page is its own (`src/modules/pokedex/`).
**Purpose:** a species as two panels, not a card: fixed artwork on a shared background, a drawer of content beside it.
**Anatomy:** `<section>`, grid `1fr 380px`, 560px tall, `--radius-card`, overflow hidden · artwork panel: transparent, centred, padding `--space-card-padding`, image up to 340px wide, does not scroll · drawer `<aside>`: `--surface-raised`, `--radius-drawer` (28px) on its left corners only, padding `--space-drawer-padding` (26px), scrolls on its own (thin scrollbar) · drawer head: dex number (`--font-numeric`, `--font-size-label`, `--text-secondary`), name `<h2>` (`--font-size-title`, bold), type row, genus (13px, `--text-secondary`), then `children`.
| Mode | Shared background |
|---|---|
| `standard` | `--surface` |
| `tinted` (with a `tint`) | the species' pair from `species-background-colors.json`, `bg_light` or `bg_dark` by the `theme` prop, inline |
**Tokens:** `--surface`, `--surface-raised`, `--radius-card`, `--radius-drawer`, `--space-card-padding`, `--space-drawer-padding`, `--space-gap-lg`, `--space-gap-sm`, `--font-numeric`, `--font-size-label`, `--font-size-title`, `--font-weight-bold`, `--text-primary`, `--text-secondary`.
**Rules:** only the shared background changes per species; the drawer stays `--surface-raised`, with no scrim and no shadow. `theme` is a prop, not read from the document, so a light and a dark instance can sit side by side. The grid and the name rules are scoped under `.ds-root`.
**A11y:** the artwork's `alt` is the species name; the drawer is an `<aside>` with the name as its heading.
