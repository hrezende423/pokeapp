# Link
**Purpose:** navigate (another page, an entry in the dex, external site). **Not for:** actions (button).
**Style:** semibold, `text.default`, no underline anywhere (owner decision 2026-10-04). Same weight/size/tracking as the surrounding text style except weight 600.
| State | Look |
|---|---|
| default | semibold `text.default` |
| hover | bold (700), no background (same as button) |
| focus-visible | 2px `border.focus` ring, 2px offset |
| active | same as hover |
| visited | no change |
| external | trailing ↗ icon 12px, `aria-label` adds "(opens in new tab)" |
| disabled | not used; remove the link instead |
**Rules:** no accent (accent = current page only); in running text the only cue is semibold, so keep link text short and put links at line or sentence ends where possible; lists of links (related Pokémon, moves) use rows with hairlines, not inline text.
**A11y:** `<a href>`; Enter; weight is the non-color cue (WCAG 1.4.1). Known risk: weight alone is a weak cue in long paragraphs; revisit if usability testing shows missed links.
**Exception (owner, 2026-11-14, Battle Frontier review batch Q14):** a species name in a data row of the Battle Frontier screens is a text button at the row's own weight (regular), no line at rest, a `border.strong` hairline under it on hover; focus as above.
