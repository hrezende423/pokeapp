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
