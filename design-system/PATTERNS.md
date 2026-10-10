# Page patterns
## 1. Browse grid (airy) — Pokédex
Nav (accent on active) → search/filter row (muted, inline) → 3–N col grid. Cell: sprite, watermark numeral behind (`text.watermark`, aria-hidden), `#id` muted + name (`font.style.name`), type names as `label-caps` in `type-text`, ability line muted. No card chrome. Hover: `bg.subtle`.

## 2. Library rows (default) — Team library
Hairline-separated rows, `--d-row`. Row = drag handle · index muted · members inline (sprite, name `label-caps`, ability·nature muted) · chevron. Selected row = accent marker (2px left bar), nothing else red.

## 3. Reference detail (compact) — Species
```
[sticky identity]            [header: #id muted · Name · epithet muted · types]
 sprite + watermark          [tabs: Info | Learnset | Description | Sprites]  (neutral underline)
 JP name, region muted       Info tab: 2-col key-value (Abilities, Height, Weight, XP, Growth, Gender,
                               Egg group, Hatch, Friendship, Catch rate, EV yield)
                             Base stats: label · value (mono) · neutral bar · total
                             Evolution/forms: sprite strip (secondary, below the fold)
```
Gender ratio: neutral two-tone bar with text "87.5% ♂ · 12.5% ♀" (no red segment).

## 4. Dense form (compact) — Build form
Sticky left summary (sprite, name, types, EV total remaining, BST) · right column of collapsible `section`s: Identity → Moves → EVs/IVs → Item/Ability/Nature → Notes. Each section: `label-caps` heading, hairline, key-value-style fields (underline inputs allowed at compact), `field-strip` for paired fields (EV/IV rows). Closed sections show a one-line summary. Actions are ghost buttons pinned bottom-right; no accent on the form.
## 5. Editorial detail (compact) — Movedex, Abilitydex, Itemdex, Naturedex, Berrydex
Chrome-less: no borders, fills or shadows group anything; size and spacing do. One rhythm per entry, top to bottom:
```
← All moves
Name (h2)                                   [ghost]  ← text ghost, own grid area, aria-hidden
IDENTITY · CATEGORY (type in type-text, rest muted caps)
POWER  ACCURACY  PP                          ← key-value strip, values by size
Lead text (h4 size, text.default, ≤60ch)     ← the entry's own description
DETAILS ─────────────                        ← label-caps heading + one hairline
Label ............. value                    ← key-value rows
POKÉMON 28 ─────────────────────────────
○ Gastly  GHOST · POISON   ○ Haunter ...     ← LedgerRow plain, multi-column
```
- **Ghost:** one per page at most, and only when a number or delta orients the reader (a move's power, a nature's `+Atk / −SpA`); none for abilities or items. Always restated as readable text.
- **Art:** an item or berry shows its literal sprite, compact (60px), beside the name — never as a ghost.
- **Colour:** type names only, plus `status.up/down` on a stat-delta glyph. Categories, pockets, firmness are muted caps.
- **Code:** `src/modules/dex/EditorialDetail.tsx`; `EntityDetailPage variant="editorial"` for the two with species lists. The Breeding dex keeps the card-grid detail.
