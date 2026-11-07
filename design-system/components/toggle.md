# Toggle (`Toggle`)
Implemented by `src/components/ds/Toggle.tsx` (styles `.ds-toggle*` in `src/components/ds/ds.css`).
**Purpose:** a binary on/off control that applies at once (calculator options, tools, the dex filter panel). A `<button>`, not a checkbox.
**Anatomy:** inline-flex, 6px gap · label text LEFT (12px, `--text-secondary`) · track 36×20, `--radius-pill` · thumb 14px circle, 3px inset, literal `#ffffff` in both themes.
| State | Look |
|---|---|
| off | track `--hairline`, thumb left |
| on (`aria-pressed="true"`) | track `--accent`, thumb slides to left 19px |
**Motion:** track background and thumb position ease over 120ms; ds.css has no reduced-motion rule for it.
**Tokens:** `--hairline`, `--accent`, `--text-secondary`, `--radius-pill`.
**Rules:** no hover, focus or disabled styles of its own (focus is the browser's outline); no disabled prop. `.dcalc` (calculators.css) scales it to a 26×14 track, a 10px thumb and a caption-size label.
**A11y:** `<button type="button" aria-pressed>`, named by its label text; Enter/Space toggle.
