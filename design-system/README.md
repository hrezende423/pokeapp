# pokeapp design system
- `tokens.json` — single source of truth (W3C-style). Semantic tokens carry `$extensions.mode.dark`.
- `python3 scripts/build-tokens.py` → `dist/tokens.css` (generated; never hand-edit)
- `python3 scripts/check-contrast.py` → must report `fails: 0` (WCAG AA, light + dark; accepted exceptions listed from tokens.json `$exceptions`); run in CI
- Theme: `<html data-theme="light|dark">`; absent = follows `prefers-color-scheme`
- Components use **semantic tokens only** (e.g. `color.text.default`, `color.border.strong`), never primitives
- `border.hairline` = decorative only; control borders use `border.strong`. Read PRINCIPLES.md and PATTERNS.md first
- Contribute: issue/PR with rationale + screenshots → owner review → bump CHANGELOG
