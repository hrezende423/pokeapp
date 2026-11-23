# Results: Battle Frontier domain, recheck then completion (2026-11-22/23)

Brief: `docs/briefs/battle-frontier-completion.md`. Audit and proposed Notion statuses: `docs/status/frontier-audit.md`.

## What changed

Two PR stacks, one branch per slice:

| Slice | PR | Branch | Base | What |
|---|---|---|---|---|
| S1 Facility reference | #33 | `feature/frontier-facility-reference` | main | Game row inside the generation. Emerald Trainer Hill; FRLG Trainer Tower; Platinum/HGSS five facilities with every BP table; "no Frontier" notices for RS/DP. |
| S2 Trainer Hill & Tower | #37 | `feature/frontier-speed` | S1 | New page "Trainer Hill & Tower": modes, floors, fixed teams, speed tracking (best clear, current run). Tracker document v2. |
| S3 Tracker per game | #38 | `feature/frontier-tracker-games` | S2 | Challenge Tracker for Platinum/HGSS: per-facility streak, best, Silver/Gold Print, next Brain. |
| S5 Gen 4 Brains | #39 | `feature/frontier-brains-gen4` | S3 | Brains screen for Platinum/HGSS: prints, teams from the disassembly's frontier trainers. |
| S4 Rental pools | #34 | `feature/frontier-rental-pools` | main | Slateport Battle Tent pool in #22; Castle line (it has no rental Pokémon). |
| S6 Palace/Arena | #35 | `feature/frontier-palace-arena` | S4 | Recheck against pokeemerald: maths correct; two Arena label defects fixed; 11 new assertions. |
| S7 Pike odds | #36 | `feature/frontier-pike-odds` | S6 | New tool #24 Battle Pike room odds (Emerald). Pyramid: already covered, no change. `.tool-body` single minmax column. |

## Assumptions and decisions (logged, not asked)

1. Decision: the Frontier tab picks a game with the Trainer Dex's in-generation game row (`useGameInGeneration('frontier')`), because CLAUDE.md says such a row is not a selector exception. The old suite check that banned `GameRow` in the module now bans only a generation selector.
2. Decision: Gen 3 defaults to Emerald and Gen 4 to HGSS (`defaultGameOfGeneration`), so Gen 3 readers see what they saw before.
3. Decision: the frozen loader (`battle-frontier/data/`) stays untouched. The Gen 4, Hill and Tower reference data lives in `battle-frontier/reference/`. The tracker suite's freeze on the reference screens was narrowed to the loader, because this brief changes those screens.
4. Decision: no mockups for the new screens. They extend the approved Facilities, Brains and Tracker patterns with the same parts. CLAUDE.md asks for a mockup first; the brief asked for no questions. **The owner should mark up the screenshots.**
5. Correction to the PRD (S4): the Battle Castle has no rental Pokémon. You battle with your own party, and its "rentals" are held items paid in Castle Points (pokeplatinum `BattleCastle_Init`, `RentItem`). The comparator says so instead of inventing a pool. **Needs owner sign-off.**
6. Decision (S5): Darach's six sets per print (two per Pokémon) are shown as his pool. The disassembly's set order does not pair them into the two teams Bulbapedia lists. The suite asserts the pooled Bulbapedia teams equal the disassembly sets.
7. Decision (S2): tracker document v1 → v2 (`games: {}`), forward-only and pure; Emerald fields untouched. A v1-stamped doc that already carries `games` keeps it. The committed v1 xlsx export stays v1 and imports (migrated). The xlsx script now writes v2.
8. Decision (S3): Gen 4 tracking is per facility (streak, best, prints), not per format. The PRD says "per facility, per game". Merge keeps the base's streak, the max best, and ORs the prints.
9. Decision (S7): the Pike assumption from the brief stands: room-outcome odds, read-only, tool #24 (#23 is reserved in `docs/tools/PLAN.md`). Pyramid: the floor log already has trainer, wild and item columns and the category hint; floor layouts are random, so nothing was added.
10. Rejected review finding: Trainer Hill entry stays "After the Hall of Fame". The Hill's code comment says it cannot be entered before it; the `FLAG_SYS_GAME_CLEAR` check serves the ungated Japanese release.
11. HGSS: every Gen 4 rule, pool and Brain team shown for HGSS is Platinum's, flagged "unconfirmed" on screen. Only the banned list was checked in pokeheartgold (+ Spiky-eared Pichu).
12. Stacking: S1 ← S2 ← S3 ← S5 (shared Frontier files) and S4 ← S6 ← S7 (shared `verify-tools.mjs`), so each PR merges cleanly in order.

## Sources (pret; never Serebii/Smogon)

pokeemerald @ 9103e52 (trainer_hill.c, battle_pike.c, battle_tent.c, battle_arena.c, Palace sources); pokefirered @ ce6406d (trainer_tower*.c); pokeplatinum @ 485c400 (battle_tower.c, overlay104/battle_{factory,hall,castle,arcade}.c, *_helpers.c, constants/battle_frontier.h, pokemon.c); pokeheartgold @ 4e95633 (pokemon.c banlist). Bulbapedia is used for prose only, and each use is named in the module headers.

## Checks (all on the branch heads)

- S1: `check --since main`: typecheck, lint, build, app, frontier-data, frontier-reference, infra pass. Frontier-tracker failed once on its old freeze and passed after the narrowing. Final: frontier-reference 178/178, frontier-tracker 276/276, app pass.
- S4–S7 stack head: `check --since main` passes (typecheck, lint, build, app, infra, `verify:tools` 344/344).
- S5 head (covers S1–S5): `check --since main`: typecheck, lint, build, app, dexes, ds, frontier-data, frontier-reference 236/236, frontier-tracker 313/313, infra, scroll-nav, store, tools, ux all pass. S3 head: the same, after one test fix (frontier-tracker 313/313).
- Fresh-context reviews ran on every slice. Their real findings are fixed: Hall 17 panels, Double party 3, the empty grid track, the hairline on the flag, the Gen 4 species names, the speciesName map-index regression, the v1-stamped `games`, the streak committed per keystroke, the Pike impossible state, MAX_STREAK, the Pike page at 390 px, and weak tests.

## Not done / for the owner

- Notion was not edited. The proposed Build status per row is in `docs/status/frontier-audit.md`.
- No preview link: nothing was pushed to the preview repo.
- Review the screenshots in `docs/status/frontier-*/` and the two owner calls above (4, 5).
