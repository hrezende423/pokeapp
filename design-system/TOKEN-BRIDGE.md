# Token bridge: src/design-tokens.css → design-system/dist/tokens.css

Generated 2026-11-07 by resolving both files in Chrome, in light and dark at all three densities. The owner decided `dist/tokens.css` wins (2026-11-06); this records where the app's file now points at it, and what has no equivalent yet.

A token is aliased only when a dist token of the SAME KIND (spacing to spacing, radius to radius, type to type) has the identical computed value in every mode. A numeric coincidence across kinds (a radius equal to a font size) is not an equivalent, so those stay as they are.

## Aliased (no visual change: identical computed values)

| App token | Now | Value |
|---|---|---|
| `--font-size-body` | `var(--font-style-body-size)` | 14px |
| `--font-size-title` | `var(--font-style-h3-size)` | 20px |
| `--radius-control` | `var(--radius-md)` | 8px |
| `--radius-pill` | `var(--radius-lg)` | 12px |
| `--space-gap-sm` | `var(--space-2)` | 8px |
| `--space-gap-xl` | `var(--space-8)` | 32px |
| `--field-focus-border-width` | `var(--border-width-thick)` | 2px |
| `--font-weight-medium` | `var(--font-weight-semibold)` | 600 |
| `--font-weight-regular`, `--font-weight-bold` | removed from the app file: dist declares the same names with the same values (400, 700) | |
| `--font-body`, `--font-numeric` | already `var(--font-family-sans)` / `var(--font-family-mono)` | |

## Changed on purpose: the accent

**Light: bridged.** `--accent` is `var(--color-accent-default)` (#C91D1D, was #d91c2c). `--field-focus-border` and `--field-error-border`, defined as `var(--accent)`, follow it.

**Dark: NOT bridged, and why.** Dist has one accent for both modes, #C91D1D. Aliasing dark (#ff3b4e) to it changed **4 pixels of the signed-off Team Display in dark mode** (x 140-149, y 187-225 of `.tb-team-viewer`, in `scripts/compare-frozen.mjs`'s seeded team). A frozen screen may not move by one pixel without the owner asking, so the dark alias was reverted: dark keeps #ff3b4e until the owner decides. With light bridged and dark unchanged, all six frozen screenshots (three screens, two themes) are pixel-identical to the base.

How it was checked: `node scripts/compare-frozen.mjs capture <dir>` on the base and on this branch, then `compare`. A control (the base captured twice) differed on the Team Display by up to 65,892 pixels, because animated sprites change frame. The tool therefore hides every image in both captures (`visibility: hidden`, so each box keeps its size), and after that the control was pixel-identical.

## No equivalent in dist yet (54)

Left as they are. Each needs a dist token added (in `tokens.json`, then the build) or a deliberate value change, which is a design decision, not a bridge.

| App token | Light | Dark |
|---|---|---|
| `--radius-badge-square` | 5px | same |
| `--surface` | rgb(250, 250, 250) | rgb(20, 20, 20) |
| `--surface-raised` | rgb(255, 255, 255) | rgb(28, 28, 30) |
| `--surface-hover` | rgb(240, 240, 240) | rgb(20, 20, 20) |
| `--text-primary` | rgb(20, 20, 20) | rgb(245, 245, 245) |
| `--text-secondary` | rgb(107, 107, 107) | rgb(143, 143, 149) |
| `--hairline` | rgb(229, 229, 229) | rgb(44, 44, 46) |
| `--stat-increase` | rgb(179, 38, 30) | rgb(232, 119, 106) |
| `--stat-decrease` | rgb(31, 95, 168) | rgb(107, 163, 214) |
| `--effect-super` | rgb(24, 107, 69) | rgb(53, 172, 104) |
| `--effect-resist` | rgb(179, 38, 30) | rgb(232, 119, 106) |
| `--button-primary-fill` | rgb(58, 58, 58) | rgb(245, 245, 245) |
| `--button-primary-text` | rgb(255, 255, 255) | rgb(20, 20, 20) |
| `--ghost-watermark` | rgb(20, 20, 20) | rgb(255, 255, 255) |
| `--ghost-watermark-opacity` | 0.09 | 0.05 |
| `--mini-badge-fill` | rgba(0, 0, 0, 0.05) | rgba(255, 255, 255, 0.08) |
| `--mini-badge-text` | rgb(85, 85, 85) | rgb(181, 181, 186) |
| `--type-normal` | rgb(126, 126, 90) | rgb(168, 168, 120) |
| `--type-fire` | rgb(189, 101, 38) | rgb(240, 128, 48) |
| `--type-water` | rgb(88, 122, 203) | rgb(104, 144, 240) |
| `--type-electric` | rgb(146, 122, 28) | rgb(248, 208, 48) |
| `--type-grass` | rgb(83, 138, 55) | rgb(120, 200, 80) |
| `--type-ice` | rgb(92, 131, 131) | rgb(152, 216, 216) |
| `--type-fighting` | rgb(192, 48, 40) | rgb(201, 79, 72) |
| `--type-poison` | rgb(160, 64, 160) | rgb(171, 87, 171) |
| `--type-ground` | rgb(143, 122, 66) | rgb(224, 192, 104) |
| `--type-flying` | rgb(131, 112, 187) | rgb(168, 144, 240) |
| `--type-psychic` | rgb(211, 75, 116) | rgb(248, 88, 136) |
| `--type-bug` | rgb(119, 131, 23) | rgb(168, 184, 32) |
| `--type-rock` | rgb(142, 123, 43) | rgb(184, 160, 56) |
| `--type-ghost` | rgb(112, 88, 152) | rgb(131, 110, 165) |
| `--type-dragon` | rgb(112, 56, 248) | rgb(133, 86, 249) |
| `--type-dark` | rgb(112, 88, 72) | rgb(136, 116, 103) |
| `--type-steel` | rgb(123, 123, 139) | rgb(184, 184, 208) |
| `--font-size-display` | 38px | same |
| `--font-size-page-title` | 15px | same |
| `--font-size-label` | 11px | same |
| `--font-size-caption` | 10px | same |
| `--font-size-ghost-watermark` | 220px | same |
| `--font-size-ghost-watermark-grid` | 64px | same |
| `--radius-card` | 20px | same |
| `--radius-drawer` | 28px | same |
| `--space-card-padding` | 28px | same |
| `--space-drawer-padding` | 26px | same |
| `--space-row-padding-block` | 9px | same |
| `--space-gap-md` | 14px | same |
| `--space-gap-lg` | 20px | same |
| `--field-focus-border` | rgb(217, 28, 44) | rgb(255, 59, 78) |
| `--field-disabled-opacity` | 0.4 | same |
| `--field-error-border` | rgb(217, 28, 44) | rgb(255, 59, 78) |
| `--ledger-num-opacity-caught` | 1 | same |
| `--ledger-num-opacity-not-caught` | 0.4 | same |
| `--icon-grid` | 24px | same |
| `--icon-stroke-width` | 1.5px | same |
