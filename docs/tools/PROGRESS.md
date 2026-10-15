# Tools project — progress

Newest last. Plan and decisions: `docs/tools/PLAN.md`.

| Step | Branch | Status | Notes |
|---|---|---|---|
| Plan + decisions | `tools/integration` | done | Owner answered the question round 2026-10-15 |
| 0 Baseline | `tools/00-baseline` | done | Stat level bug fixed (+ every level x base x IV checked); stale Itemdex test fixed; location loader counts only games with a file (eggmoves green); Team Display move-name floor restored (lost in d59f6f0); `check --since`; `verify:ds` gated to its 12 known failures; `.cache` and `dist` read-denies removed |
| Index | `tools/01-index` | done | Tools tab opens the index (dropdown unchanged); registry-driven, gated entries disabled with the reason; shared ToolShell (scope, game row, reason-in-place-of-result); Calculators opens on a handed-off tab; `verify:tools` (19 checks, both themes photographed) |
| #1 Stat | `tools/02-stat` | done | Bulbapedia "Stat" worked examples as fixtures (Gen 1-2 Pikachu L81, Gen 3-4 Garchomp L78); Stat/Speed/Catch tabs say "Gen 1–4 only" on Gen 5–9 and under All |
