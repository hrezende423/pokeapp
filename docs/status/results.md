# Result: Generation selection persists

2026-11-22. Replaces the previous result; history is in git.

Branch `feature/persist-generation`, PR #32. Published on the preview repo.

## What changed

- `src/modules/version-group/VersionGroupProvider.tsx`: the app-wide generation selection is stored in localStorage (`pokeapp:generation`, value `1`–`9` or `all`) and read back on boot. Same pattern as the theme (`src/theme.ts`): every storage access wrapped; an unreadable or out-of-range value falls back to Gen 4.
- `scripts/verify-app.mjs`: new "GENERATION — persistence across reload" section, asserted through a real reload: first visit opens on Gen 4; Gen 2 and All each survive a reload; a new tab opens on the stored value; a garbage value falls back to Gen 4.

## Assumptions

- Stored per device only; not mirrored by the optional GitHub sync (it is a preference, like the theme, which is not synced either).
- The four sanctioned exceptions are unchanged: they still seed once per session from the app selection, which is now the stored one.

## Checks

`npm run check`: typecheck, lint, build, `verify:infra` PASS. `verify:app`: the five new checks PASS; one older check, "returning to heartgold-soulsilver triggers 0 data fetches", fails intermittently **on `main` as well** (1 of 2 runs on a `main` build). The flagged requests are the Gen 5+ learnset warm-up that runs after boot (`sun-moon`, `ultra-sun-ultra-moon`, `lets-go-…`), racing the measurement window. Not touched here.
