# Icon
24px grid, 2px stroke, rounded caps, `currentColor`; sizes 16/20/24. Decorative icons `aria-hidden`; meaningful icons need label. Export as SVG.

## Move category icons (`MoveCategoryIcon`, owner 2026-10-12)
Used on the Trainer Dex party cards' move lines, after the type dot. Tabler's grid (24 units, 1.5 stroke, round joins), 1em, seated on the baseline:
- **Physical**: an eight-point star, outlined, in `color.category-text.physical`
- **Special**: three concentric circles (Tabler `target`), in `color.category-text.special`
- **Status**: a yin-yang, outlined, **without** its two dots, in `color.category-text.status`
The category word is the accessible name and the tooltip.
