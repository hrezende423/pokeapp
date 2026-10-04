## Design system (design-system/)
Source of truth: `design-system/`. Read `PRINCIPLES.md` and `PATTERNS.md` first, then the spec in `components/<name>.md` before building or changing any UI component.
- Never hardcode colors, font sizes, weights, spacing or radii. Use CSS variables from `design-system/dist/tokens.css` (`var(--color-text-default)`, `var(--font-style-body-size)`, `var(--d-row)`…). Components use semantic tokens only, never primitives (`--color-accent-600` etc. are off limits in components).
- Theme: `data-theme="light|dark"` on `<html>`; density: `data-density="airy|default|compact"` on the page root.
- Rules that are easy to break: no hover backgrounds anywhere; no underlined text; ghost buttons only; underline text fields only; accent red = active nav item and selected tab only (max 2 per screen); color a type by its name text, not a chip; no ticks on stat bars; headings and UPPERCASE labels are regular weight.
- Do not edit `dist/tokens.css` by hand. Change `tokens.json`, run `python3 design-system/scripts/build-tokens.py` then `python3 design-system/scripts/check-contrast.py` (must show `fails: 0`).
- A design change = update the matching `components/*.md` + CHANGELOG entry in the same commit.
- `design-system/preview.html` is a visual reference for every component and state (open it in a browser).
