# Stat bar
Row: label (`label-caps`, muted) · value (`font.style.data`, tabular) · bar (track `data.track`, fill `data.fill`, height `size.bar-height` 8px, no ticks) · optional delta (`status.up/down` with ↑/↓).
No accent, no per-stat color. Total row separated by hairline. **A11y:** `role="meter"` with value/min/max; value text always shown.
**Scale:** the caller passes the real ceiling — 255 for a base stat, 40 for berry flavour potency. Not a licence for progress bars elsewhere: it is for several values on one scale where the spread is the fact.
**Code:** `src/components/ds/StatBar.tsx` (`StatBar`, `StatBarList`; rows share columns via subgrid). Used by the Berrydex flavour profile. The species page's base-stat bars still draw inline (`--accent` fill, `--dp-u` units) until that screen is migrated.
