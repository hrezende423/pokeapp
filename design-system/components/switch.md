# Toggle (switch)
**Purpose:** an on/off setting that applies immediately (Shiny, Pokérus, dark mode). **Not for:** choices submitted with a Save button (checkbox).
**Anatomy:** track 36×20 · thumb 13px · label to the right (regular, 10px gap). Label is part of the hit area; row ≥44px tall.
| State | Look |
|---|---|
| off | track outline 1.5px `border.strong`, thumb `text.muted` |
| on | track filled `text.default`, thumb `bg.canvas`, thumb slides 16px |
| hover | outline `text.default` |
| focus | 2px `border.focus` ring, 2px offset |
| disabled | outline `border.hairline`, thumb `text.disabled`, label `text.disabled` (on: track `text.disabled`) |
**Rules:** label states the setting, not the action ("Shiny", not "Toggle shiny"); on/off must not rely on color: fill vs outline plus thumb position carry it; motion `motion.duration.fast`, none under reduced motion.
**A11y:** `role="switch"` + `aria-checked`; Space toggles.
