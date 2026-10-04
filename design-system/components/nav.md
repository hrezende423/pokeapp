# Nav (global)
Horizontal text items, `font.style.label`. Active item = `color.accent.default` text (the screen's accent, see PRINCIPLES #3). Bar bg `bg.canvas`, bottom `border.hairline`. Search/filter muted at right.
**A11y:** `<nav>` + `aria-current="page"` on active; accent never the only cue (also weight 600 + `aria-current`).
**Known exception:** dark theme uses the same accent as light (owner decision 2026-10-04); contrast 3.28:1 on canvas, lowest 1.48:1 (`accent.strong` on `bg.subtle`). Recorded in tokens.json `$exceptions`; never use accent for text people must read.
