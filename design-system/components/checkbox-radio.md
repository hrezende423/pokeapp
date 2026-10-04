# Checkbox and radio
**Checkbox:** multiple independent yes/no items, or anything needing Save. **Radio:** exactly one of 2–5 visible options; more → dropdown.
**Anatomy:** 18px mark (checkbox 3px radius, radio circle), 1.5px `border.strong`; label right, regular weight; whole row hit area ≥44px.
| State | Look |
|---|---|
| off | empty outline |
| on | checkbox: `text.default` fill + `bg.canvas` check; radio: outline + 8px dot `text.default` |
| hover | outline `text.default` |
| focus | 2px `border.focus` ring, 2px offset |
| disabled | outline `border.hairline`, label `text.disabled` |
| indeterminate (checkbox) | `text.default` fill + dash |
**Rules:** group has a legend (label-caps); stack vertically; radios arrow-key navigate as one group; no accent.
