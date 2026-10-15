# Tools project — plan and decisions

The owner's brief (2026-10-15): implement every calculator/tool below, features
only (functional, unstyled-OK), one branch per tool, math in pure UI-free
functions with the UI wired on top. Decisions were taken in one question round
the same day; they are recorded here so no session re-asks them.

Progress lives in `docs/tools/PROGRESS.md`.

## Scope

| # | Tool | Gen gate | Game picker | Notes |
|---|---|---|---|---|
| 1 | Stat calculation | 1–4 | — | EXISTS (Calculators → Stat). Add fixtures, index entry |
| 2 | Hidden Power | 2–4 | — | Formula exists in `statMath.hiddenPower`; becomes its own tool |
| 3 | Single-hit damage | 1–4 (doubles 3–4) | — | EXISTS (Damage Calculator). Add doubles controls; Gen 1–2 roll 39 values |
| 4 | Multi-move comparison | 1–4 | — | IS the Damage page's top row. Index entry + suite assertion, no new page |
| 5 | Speed tier checker | 1–4 | — | Speed tab exists (2 sides). Extend to a team + modifiers |
| 6 | Speed EV minimizer | 1–4 | — | Reuses #1/#5; checked by brute force over every EV value |
| 7 | Defensive bulk calc | 1–4 | — | Reuses #1/#3; checked by brute force |
| 8 | Catch rate | 1–4 | yes (Gen 4: DPPt vs HGSS balls) | REWRITE: per-gen formula, every ball |
| 9 | EV/Stat Exp remaining | 1–4 | — | Target = a Build, actual = a Collection entry |
| 10 | Moveset searcher | 1–4 | yes | Learn methods per game |
| 11 | Status move finder | 1–4 | — | Per-game effect constants from battle data (Gen 1 encodes the chance in the effect name) |
| 12 | Doubles targeting | 3–4 | — | Per-game targets already in battle data (`tg`) |
| 13 | Compare Pokémon | 1–4 | — | Graduates the `compare-pokemon` nav stub |
| 14 | Similarity finder | 1–4 | — | Stat shape 40 / defensive profile 30 / BST 20 / shared type 10 — printed on the page |
| 15 | Team threat finder | 1–4 | — | Members hit SE by a STAB type, ties by BST — printed on the page |
| 16 | Breeding chain | 2–4 | yes | Graduates the `breeding-planner` nav stub |
| 17 | Pokérus simulation | 2–4 | — | |
| 19 | Pokéblock / Poffin | RSE (3), DPPt (4) | yes | Built BEFORE #18. Poffin cooking may need Bulbapedia (minigame not found in the decomp) |
| 18 | Contest stats plan | RSE (3), DPPt (4) | yes | FRLG and HGSS have no contests |
| 20 | Battle Palace odds | Emerald | — | Linked from Spenser's Trainer Dex entry |
| 21 | Battle Arena scoring | Emerald | — | Linked from Greta's Trainer Dex entry |
| 22 | Rental set comparator | Emerald, Pt, HGSS | yes | Linked from Noland / Thorton |
| 23 | Nickname generator | 1–4 | — | Curated word lists; 10-character cap (all Gen 1–4 constants) |

Plus, by decision: a **Tools index** (the Tools tab's trigger opens it; the
dropdown is unchanged) and a **minimal Collection** (below).

Out of scope (brief): layout/visual design, mockups, new components, saved /
shareable / compare-scenario infrastructure (EXCEPT the Collection, by the
owner's later decision), moving existing calculators, PRD "Not now" rows,
Gen 5+ mechanics, coverage analyzers, ribbons, Nuzlocke danger lists.

## Decisions (owner, 2026-10-15)

- **Scope:** tools follow the app's generation. Where the game matters they
  get the existing in-generation game picker (`useGameInGeneration` +
  `GameRow`) — not a selector exception. No per-tool generation selector.
- **App on Gen 5–9:** every tool shows "Gen 1–4 only" instead of a result.
- **#9 source:** a minimal **Collection** first — species, nickname, level,
  nature, current EVs (Stat Exp in Gen 1–2), optional target Build. Saved
  inside the Team Builder document (so it syncs when signed in). Nav: Team
  Building tab. Team Matchup's `collectionId` link fields were shaped for it.
- **Before Batch 1:** fix the stat bug (`computeStat` floors a float; one point
  low at levels 29/35/41/57/58/69/70/82), the stale `verify:dexes` Itemdex
  check, the location-loader total-failure bug (Gen 5–9 groups with no file
  count as loaded), and the Team Display move-name column regression (find the
  cause, restore the signed-off width). Remove the `.cache` deny rule.
- **Branches:** `tools/integration` (from `feature/generation-selector`) is the
  integration branch; each tool is `tools/NN-slug` off it, merged back by
  Claude once `npm run check` passes. Never `main`.
- **Preview:** push `tools/integration` to the preview site once per batch.
- **Test values:** Bulbapedia worked examples, read in the owner's Chrome
  (Bulbapedia 403s scripts), cross-checked against the pinned pret routine.
  Optimizers (#6, #7) are checked by brute force.
- **`verify:ds`:** passes only while its failures are exactly the 12 known
  species-card checks (deferred debt).

## Data sources (pinned pret disassemblies, `scripts/trainers/sources.mjs`)

| Need | Source |
|---|---|
| Catch formula + balls | pokered/pokeyellow + pokegold/pokecrystal `engine/items/item_effects.asm`; pokeemerald `src/battle_script_commands.c` (`Cmd_handleballthrow`); pokeplatinum `src/battle/battle_script.c` |
| Pokérus | pokecrystal `engine/events/pokerus/pokerus.asm`; pokeemerald + pokeplatinum `src/pokemon.c` |
| Pokéblocks | pokeemerald `src/berry_blender.c`, `src/pokeblock.c`, `src/pokeblock_feed.c`, `src/berry.c` (`gBerries`) |
| Poffins | pokeplatinum `src/poffin.c` (+ Bulbapedia for cooking) |
| Battle Palace | natures' `move_battle_style_preferences` (bundled); pokeemerald `src/battle_gfx_sfx_util.c` (`GetBattlePalaceMoveGroup`) |
| Battle Arena | pokeemerald `src/battle_arena.c` (`sMindRatings`, per move) |
| Rental pools | pokeemerald `src/data/battle_frontier/battle_frontier_mons.h` (Factory rents from `gFacilityTrainerMons`); pokeplatinum `res/trainers/frontier/pokemon/`; HGSS unconfirmed |
| Move effects / targets | `public/data/battle/<game>.json` (`e`, `c`, `tg`) |

Paths outside a repo's sparse list need adding to `sources.mjs`.

## Layout names

Index: `data-layout="tools-index"`, areas `title` / `groups`. Tool page:
`data-layout="tool"`, areas `head` (title + scope row) / `inputs` / `result`
(an invalid input shows its reason where the result would be).

## Checkpoints

After each tool: `✅ #N <tool> — branch <name>, check passed (X tests) | ⏭ next:
#N+1 | ⚠ blockers/assumptions: …`. After each batch: tools done, skipped or
blocked and why, data gaps found, preview link.
