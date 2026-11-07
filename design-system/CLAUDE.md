# Design system: working rules

Moved out of the root `CLAUDE.md`, which keeps the design RULES (tokens only, no
badge, no box-shadow, the two `--accent` uses, the hairline band). This file is
the procedure for changing the system itself.

- **Tokens: never hand-edit `dist/tokens.css`.** Change `tokens.json`, then run
  `python3 design-system/scripts/build-tokens.py` and
  `python3 design-system/scripts/check-contrast.py`, which must show `fails: 0`
  (CI's PR workflow fails otherwise).
  **On Windows set `PYTHONUTF8=1`** (and use `py` if `python3` is missing), or
  `tokens.css` is written non-UTF-8 and the Vite build fails.
- **A design change = the matching `components/*.md` + a `CHANGELOG.md` entry, in
  the same commit.**
- **`dist/tokens.css` is the winning token set** (owner, 2026-11-06).
  `src/design-tokens.css` migrates toward it over time, never in a feature commit.
- **Never assert italic from a computed style: measure the advance.** The italic
  faces were added late, after `font-style: italic` had been a silent no-op that a
  computed style read as italic over upright glyphs (`DESIGN-SYSTEM.md`, Font).
- **Icons**: Tabler, 24px grid, **1.5px stroke** (74 of the 80 `stroke=` uses in
  `src/`; the other six are one-offs, not a second standard), outline, `currentColor`.
