# Type label
Type name as text: `font.style.label-caps`, color `color.type-text.<name>` (pre-verified ≥4.5:1 on canvas/surface, both themes). Multiple types separated by a muted `·`. **Default treatment; no fill.**
Optional `fill` variant for use over imagery: bg `color.type.<name>`, text `color.type-on.<name>`.
**A11y:** the name is always text; color reinforces, never replaces.
**In the app:** `--type-<name>` aliases `color.type-ink.<name>.<mode>` (= `color.type-text`, resolved per theme block so a wrapper's `data-theme` is honoured); all 18 types, Fairy included (2.2.0).
**The `???` type** (data name `unknown`; Curse in Gen 2–4) reads `???`, in `text.secondary` — it has no type colour.
