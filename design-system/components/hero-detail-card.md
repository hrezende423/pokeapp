# Hero detail card (`HeroDetailCard`)
Implemented by `src/components/ds/HeroDetailCard.tsx` (styles `.ds-hero*`, `.ds-mini-badge*` in `src/components/ds/ds.css`). Imported today by the design-system reference page only.
**Purpose:** a species shown whole, as one card: identity, artwork, types, stats, actions.
**Anatomy, in order:** `<article>`, relative, overflow hidden, padding `--space-card-padding` (28px), `--radius-card` (20px), `--surface`, no border, max-width 420px ·
era micro-label, top-left, rotated −90° (`--font-size-caption`, uppercase, 0.08em, `--text-secondary`; any text, e.g. "Region: Sinnoh") ·
ghost watermark, hero scale (ghost-watermark.md) ·
height and weight ("0.7 m", "6.9 kg"), right-aligned, each a pill: padding 3px 8px, `--radius-pill`, `--mini-badge-fill` behind `--mini-badge-text`, caption size, uppercase ·
artwork 220×220, contained, centred, no frame or shadow ·
name `<h2>` (`--font-size-display` 38px, bold, centred, line-height 1.05, −0.01em) ·
type row, centred (type-label.md) · genus (`--font-size-label`, `--text-secondary`, centred) · `children` ·
stats as a `StatList` (data-rows.md), `--space-gap-lg` above · actions: up to two `Button`s (primary, secondary), centred, `--space-gap-sm` apart.
**Optional blocks:** omitting `types`, `stats`, the height/weight or the actions drops that block instead of drawing it empty.
**Tokens:** `--surface`, `--radius-card`, `--radius-pill`, `--space-card-padding`, `--space-gap-sm`, `--space-gap-lg`, `--font-size-display`, `--font-size-label`, `--font-size-caption`, `--font-body`, `--font-weight-bold`, `--text-primary`, `--text-secondary`, `--mini-badge-fill`, `--mini-badge-text`.
**Rules:** the name's selector is bound to the card (`.ds-hero h2.ds-hero-name`), so it holds outside `.ds-root` against App.css's `.panel h2`.
**A11y:** the artwork's `alt` is the species name; the watermark is hidden; the name is a heading.
