# Key-value list
Definition list (`<dl>`): label left (muted, 13px, `font.tracking.label`), value right (`font.style.data` mono, tabular-nums, `text.default`). Row `--d-row` tall, hairline between rows; 1–3 columns by width (min 260px per column, 40px gutter). Labels never wrap.
**Value types:** plain · with unit (unit muted, no space change) · empty = "—" muted · text value (sans, e.g. ability names) · link (semibold + hover tint, see link.md) · editable (underline field right-aligned, same states as text field, 96px wide) · two-part ("50 % / 50 %").
Long values truncate with ellipsis and a tooltip/title. **A11y:** semantic `<dt>/<dd>`; editable rows keep the `dt` as the field label (`aria-labelledby`).
