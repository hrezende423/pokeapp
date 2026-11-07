# Theme switcher (`ThemeSwitcher`)
Implemented by `src/components/ds/ThemeSwitcher.tsx` (styles `.ds-theme-*` in `src/components/ds/ds.css`).
**Purpose:** the Light/Dark choice in the account menu (`src/sync/AccountControl.tsx`). Two labelled segments, both always visible; no System segment.
**Anatomy:** track inline-flex, padding 3px, `--hairline` background, radius 10px (a literal) · two segments, padding 4px 2px, 12px, regular, line-height 1, `--text-secondary`, no background, `--radius-control`, min-width 33px so bolding one does not shift the other.
| State | Look |
|---|---|
| active segment | `--text-primary`, bold, `--surface-raised` background, default cursor |
| inactive, hover | `--text-primary` |
| focus-visible | 2px `--accent` outline, 1px offset |
**Behaviour:** reads the theme store in `src/theme.ts` (`useSyncExternalStore`), so it follows a change made at boot or by the OS; a click calls `setTheme`. `data-theme-source` reads `system` until someone has chosen, then `user`.
**Tokens:** `--hairline`, `--surface-raised`, `--text-primary`, `--text-secondary`, `--accent`, `--radius-control`, `--font-weight-bold`.
**Rules:** in dark the active segment's `--surface-raised` is darker than its `--hairline` track; the selection is carried by the bold `--text-primary` label, not the fill.
**A11y:** `role="group"` named "Theme"; each segment a `<button aria-pressed>`, each in the tab order; no arrow-key handling.
