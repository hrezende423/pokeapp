# Slider
**Purpose:** fast way to set a number in a large range (EV 0–252 step 4, IV 0–31, level 1–100). **Never alone:** always paired with a mono number field showing the exact value (typing = precise path).
**Decided 2026-10-04:** thin track + filled oblong thumb (alternatives considered: circle, ring, line, pill, square, hollow oblong, bar-only, segmented, scrub).
**Anatomy:** label-caps above · track 4px (`data.track`, fill `data.fill`) · thumb = filled horizontal oblong 20×12px (3/4 of the first 26×16 draft), `text.default` fill, radius 6px, no border, no ring, no shadow · number field right (56px, mono, right-aligned). Row height 44px. No tick marks, no value bubble.
| State | Look |
|---|---|
| default | as anatomy |
| hover | thumb ring 1px stronger (cursor grab) |
| focus-visible | 2px `border.focus` ring around thumb (offset 3px) |
| dragging | same as focus |
| disabled | track + thumb at 40% (`text.disabled`), number field disabled |
**Keys:** ←/→ ±step, PageUp/Down ±10 steps, Home/End min/max. Typing a value clamps to range and snaps to step on blur.
**Rules:** shared constraint (EV total 510) shown as a muted "remaining" value in the section header, not on the slider; no dual-thumb range for now.
**A11y:** native `<input type="range">` with label and `aria-valuetext` ("128 EVs").
