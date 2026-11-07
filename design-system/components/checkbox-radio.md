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
| read-only (checkbox) | not a control: no hover, no focus — a readout of a yes/no fact (the Itemdex's attributes). Drawn in the DISABLED look (owner, 2026-10-11): `text.disabled` outline and label, "on" a `text.disabled` fill with a `bg.canvas` check. The first version kept the enabled look so "no" would not read "unavailable"; the owner preferred the readout to recede |
**Rules:** group has a legend (label-caps); stack vertically; radios arrow-key navigate as one group; no accent.
