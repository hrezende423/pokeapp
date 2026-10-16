# Tools project — progress

Newest last. Plan and decisions: `docs/tools/PLAN.md`.

| Step | Branch | Status | Notes |
|---|---|---|---|
| Plan + decisions | `tools/integration` | done | Owner answered the question round 2026-10-15 |
| 0 Baseline | `tools/00-baseline` | done | Stat level bug fixed (+ every level x base x IV checked); stale Itemdex test fixed; location loader counts only games with a file (eggmoves green); Team Display move-name floor restored (lost in d59f6f0); `check --since`; `verify:ds` gated to its 12 known failures; `.cache` and `dist` read-denies removed |
| Index | `tools/01-index` | done | Tools tab opens the index (dropdown unchanged); registry-driven, gated entries disabled with the reason; shared ToolShell (scope, game row, reason-in-place-of-result); Calculators opens on a handed-off tab; `verify:tools` (19 checks, both themes photographed) |
| #1 Stat | `tools/02-stat` | done | Bulbapedia "Stat" worked examples as fixtures (Gen 1-2 Pikachu L81, Gen 3-4 Garchomp L78); Stat/Speed/Catch tabs say "Gen 1–4 only" on Gen 5–9 and under All |
| #2 Hidden Power | `tools/03-hidden-power` | done | Own page; fixtures worked from pokecrystal HiddenPowerDamage + pokeemerald Cmd_hiddenpowercalc (Bulbapedia would not load in the browser); Tools tab stays active on tool pages. Side step `tools/03a-flaky-gate`: scroll-nav retried, logged as debt |
| #3 Damage | `tools/04-damage-doubles` | done | Doubles on the Damage page (Gen 3-4): Singles/Doubles, partner standing, Helping Hand per side; each move's range from the game's own move table. 5 live-calc doubles lines (calc.pokemonshowdown.com window.calc, 2026-10-15) match roll for roll and verbatim; description prints Helping Hand like the reference |
| #4 Multi-move | `tools/05-multi-move` | done | The Damage page's top row (decision 10): suite asserts all 8 moves carry a result in Gen 1 and Gen 4 and a pick shows its own line |
| #5 Speed tiers | `tools/06-speed-tiers` | done | New page on the battle engine's ladder (battle/speed.ts, per-game turn-order routines): typed-in rows or a loaded team, weather, Tailwind, Trick Room, ties 50/50, priority/Quick Claw exceptions. Fixtures worked from the Stat formula + cited routines (Gen 1 and Gen 4). Tool body: result beside the inputs on wide windows |
| #6 Speed EV minimizer | `tools/07-speed-minimizer` | done | New page on the engine's speedThreshold solver; brute force over every EV / every Stat Exp value agrees in all four gens (Garchomp 228 EVs, Salamence 84, Alakazam 46226 Stat Exp in Gen 1 and 2) and on the minimum level. Row editor shared with #5 |
| #7 Defensive bulk | `tools/08-bulk` | done | New page reusing the Damage Calculator's own Pokémon and field panels; least HP + Def/SpD (Spc) effort surviving the highest roll with a kept share of HP; EVs in steps of 4 within 510, Stat Exp at its 64 bonus steps. Exhaustive-grid check equal in Gen 1, 2, 4 (e.g. Gen 2 Snorlax 1850 HP / 11450 Def Stat Exp vs Cross Chop). useSideMoves moved to its own hook |
