# Search select (`SearchSelect`)
Implemented by `src/components/ds/SearchSelect.tsx` (styles `.ds-search-*` in `src/components/ds/ds.css`).
**Purpose:** a select you type into, for lists too long to scroll (493 species, trainer sets). Damage calculator, Team Matchup (setup and gauntlet), the Collection's moves, the account menu.
**Anatomy:** the text field's shell (label always shown, underline, `▾` chevron) · an input showing the query while open and the selected option's label otherwise (that label is also its `title`) · a list under it: absolute, 2px below, z-index 30, max-height 260px then scroll, padding 4px 0, `--surface-raised`, 1px `--hairline`, `--radius-control`.
**Rows:** option = label left, optional `hint` right (`--font-numeric`, `--font-size-label`, `--text-secondary`), padding 5px 10px, `--font-size-caption` · a group heading wherever `group` changes between consecutive matches (`--font-size-label`, bold, uppercase, 0.06em, `--text-secondary`; the options after it indent to 16px) · "No match" in `--text-secondary`.
| State | Look |
|---|---|
| closed | value = selected label |
| focused / open | list open, field text selected, query empty |
| option active (arrow keys or pointer) | `--surface-hover` background |
| option selected | bold |
**Matching:** case-insensitive over the label; exact match first, then prefix, then substring, each in the caller's order; at most `maxResults` (60). No index of its own: the options are what the caller scoped.
**Rules:** typing never commits; only Enter or a pointer press on an option does. Blur, Escape or a press outside closes without a change. No `state`, `helper` or `hideLabel` props.
**Tokens:** the field's (text-field.md), `--surface-raised`, `--surface-hover`, `--hairline`, `--radius-control`, `--font-size-caption`, `--font-size-label`, `--font-numeric`, `--font-weight-bold`, `--text-secondary`.
**A11y:** input `role="combobox"`, `aria-expanded`, `aria-controls` while open, `aria-autocomplete="list"`; list `role="listbox"`, options `role="option"` + `aria-selected`, headings `role="presentation"`. Down opens and moves, Up moves, Enter commits and blurs, Escape closes. The active option is not exposed through `aria-activedescendant`.
