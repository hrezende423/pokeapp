# pokeapp design principles
Extracted from the reference pages (Pokédex grid = the benchmark; Team library = near it; Detail and Build form = need fixing).

## The essence
**Quiet canvas, loud data.** Greys carry structure; color only appears where it *means* something.

1. **Monochrome structure.** White/near-black canvas, grey text hierarchy, hairline dividers. No boxes, cards, fills or shadows to separate content — whitespace and hairlines do it.
2. **Color = meaning, never decoration.** Type colors tint the type *name* (text, not chips). `status.up/down` for stat deltas/effectiveness (always with ↑/↓ or +/−, never color alone). Everything else is grey.
3. **One accent, one job.** `color.accent` = wayfinding ("you are here"): active nav item, selected row. **Max one accent element per region, ≤2 per screen.** Never for bars, tabs, links, buttons, gender ratio, emphasis. (This is what went wrong on Detail/Build form.)
4. **Type does the hierarchy.** Name regular weight; `#id` and secondary info muted; small UPPERCASE `label-caps` for categories; mono `data` for values; ghost `watermark` numeral as identity. Weight and size, not color, create emphasis.
5. **Density is a choice per page, not an accident.** Three tiers (below). Same tokens, different density.
6. **Actions are quiet.** Buttons are ghost only (text, no fill, no border); a hover tint and semibold label mark them. No red or dark filled buttons.

## Density tiers (`data-density` on the page root)
| Tier | For | Look | Pages |
|---|---|---|---|
| `airy` | Browse | Image-led grid, big gaps, watermark numerals | Pokédex grid |
| `default` | Library | Hairline-separated rows, one line of meta each | Team library, Movedex lists |
| `compact` | Reference / editing | Key-value lists, tabs, disclosure, 32px fields | Species detail, Build form, calculators |

Compact tier on touch (`pointer: coarse`) must still give ≥44px targets: raise `--d-field`/`--d-row` via media query, never shrink hit areas.

## Showing a lot of content (compact tier)
- **Split by tabs** what users rarely compare together (Info / Learnset / Description / Sprites). One tab visible, rest one click away.
- **Key-value lists** instead of boxed fields: muted label left, mono value right, hairline between rows, two or three columns on wide screens.
- **Sticky identity panel** (sprite, name, types) on the left; scrolling content on the right. Identity never scrolls away.
- **Progressive disclosure:** sections collapse (`section` component), with a one-line summary when closed ("EVs: 252 Atk / 4 Def / 252 Spe"). Default open only what is needed first.
- **Inline over modal:** edit in place; no nested boxes.
- **Group, don't decorate:** a `label-caps` heading + hairline starts each group; no panel backgrounds.
- **Numbers aligned:** `font-variant-numeric: tabular-nums`, right-aligned columns, units muted.
- **Neutral bars:** stat bars use `data.fill` on `data.track`; highlight by value labels, not color.

## Type: weights and tracking
Weights are tokens (`font.weight.*`); styles and components reference them, never raw numbers. Weight creates emphasis only between items of the same size.
| Weight | Use |
|---|---|
| Regular 400 | Page titles and headings (hierarchy by size only), UPPERCASE labels, body text, descriptions, item names (Pokémon, moves), key-value values, mono data, input text |
| Medium 500 | Unused by default (reserved) |
| Semibold 600 | Buttons, selected tab, active nav (+ accent), type names, row/field labels |
| Bold 700 | Ghost numeral only |
Rules: max two weights per component; never bold running text; accent only with semibold (active nav); mono stays regular.
Tracking (`font.tracking.*`): caps .2em, headings .06em, ghost numeral .18em, everything else .035em.
Small text: 9px UPPERCASE labels are the floor; never smaller, never for content users must read to act.

## No underlines
Buttons and links share one interactive style: semibold label, bold on hover. **No hover backgrounds anywhere in the system** (hover = weight or line/color change only). Nothing in the system is underlined except the active tab indicator and form-field underlines.

## Do / Don't
- Do color the type name; don't fill chips unless the badge sits on imagery.
- Do mark current page with accent text; don't also accent the tab, the button and the chart on that page.
- Don't use red for both "active" and "bad": negative deltas use `status.down` *with* a ↓ glyph and sit away from nav.
