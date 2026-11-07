# Navigation parts (`Tabs`, `SearchFilterRow`, `FormSectionLabel`)
Implemented by `src/components/ds/Navigation.tsx` (styles `.ds-tab*`, `.ds-search`, `.ds-filter*`, `.ds-section-label` in `src/components/ds/ds.css`). Not the global nav bar (nav.md).
**Tabs:** used by the species page, Calculators, Type Coverage and Team Matchup. A flex row, `--space-gap-lg` between tabs, 13px, 1px `--hairline` under the row · each tab a text button, padding 0 0 8px, 2px transparent bottom border pulled 1px down onto the row's hairline.
| State | Look |
|---|---|
| idle | `--text-secondary` |
| selected (`aria-selected`) | `--accent` text, bold, 2px `--accent` underline |
**SearchFilterRow:** a `type="search"` input (220px, 13px, `--text-primary`, 1px `--hairline` underline, padding 6px 2px, 12px below; focus: 2px `--field-focus-border` underline) over a row of filters as plain text buttons (12px, `--text-secondary`) separated by a `·` (6px each side, `aria-hidden`). The active filter (`aria-pressed`) is `--text-primary` bold. No chips, no search icon.
**FormSectionLabel (this one):** a `<p>`, `--font-size-label`, bold, uppercase, 0.06em, `--text-secondary`, no rule under it. Used by the dex filter panel. Not the same component as form-parts.md's `FormSectionLabel`, which adds a hairline and an aside slot.
**Tokens:** `--hairline`, `--accent`, `--text-primary`, `--text-secondary`, `--field-focus-border`, `--field-focus-border-width`, `--space-gap-lg`, `--font-size-label`, `--font-weight-bold`.
**Rules:** no hover or focus styles on tabs or filters (the browser's focus outline only).
**A11y:** tabs `role="tablist"` / `role="tab"` with `aria-selected`; no `aria-controls`, no arrow-key handling (Tab moves between them). The search input's `aria-label` is its placeholder ("Search species" by default). Filters are `<button aria-pressed>`.
