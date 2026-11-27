# Battle Frontier audit: PRD rows vs code

Source: Notion "Pokémon App — PRD", Domain = Battle Frontier, 9 rows (fetched 2026-11-22).
Each row was checked against the code, its suites and a browser look, not against the Notion status.

## Step 0: recheck on `origin/main` @ cb59d9c (2026-11-22)

Suites on that tree, all passing: `verify:frontier-data` (all passed), `verify:frontier-reference`
138/138, `verify:frontier-tracker` 276/276, `verify:tools` 304/304, `verify:trainers` 105/105.
Browser look: the suites' own screenshots (`scripts/.verify-shots/frontier-reference-*.png`), opened.

| # | PRD row (Notion status) | Verdict | Evidence |
|---|---|---|---|
| 1 | Battle facility reference data (Unknown) | **Partial** | Emerald's 7 facilities + shared rules: `battle-frontier/Facilities.tsx`, suite `frontier-reference` §3. Missing: Emerald Trainer Hill, FRLG Trainer Tower, Platinum and HGSS Frontiers. Outside Gen 3 the shell shows one notice (`parts.tsx` FrontierShell, `data/index.ts` `isFrontierGeneration`), and D/P has no explicit "no Frontier" state. |
| 2 | Trainer Tower/Hill reference and tracking (To do) | **Missing** | The data exists in the Trainer Dex (Emerald `trainer-hill`: 32 trainers, 4 modes × 4 floors; FRLG `trainer-tower`: 63 trainers, 4 modes × 8 floors; `verify:trainers`). There is no Frontier-tab view and no tracking (grep: no Hill/Tower in `src/modules/battle-frontier/`). |
| 3 | Personal challenge progress tracker (To do) | **Partial** | Emerald: all 7 facilities, runs, battles, symbols, BP ledger, Pyramid floor log, xlsx import. `tracker/model.ts`, `trackerStore.ts` (v1), suite `frontier-tracker` 276/276. Missing: per-game key, Platinum/HGSS facilities and Prints, Tower/Hill. |
| 4 | Battle Palace move-selection odds (Unknown) | **Done** (Emerald) | Tool #20, `tools/palace/palaceMath.ts`; `verify:tools` asserts the nature table against PokéAPI, Adamant 38/31/31, fallback and idle, and the Support-count bug. Gate `{gens:[3], games:['emerald']}`. Gen 4 has no Palace, correctly. Rechecked against pokeemerald in S6. |
| 5 | Battle Arena scoring simulator (Done) | **Done**, label defects | Tool #21, `tools/arena/arenaMath.ts`; the maths matches pokeemerald. Two real defects in labels only: Levitate is named as a −5 "made useless" case (it is a miss, −2), and Flash Fire's −2 cannot be entered from the labels. Reopened and fixed in S6. |
| 6 | Frontier Brain trainer data (Done) | **Partial** | Emerald: 7 Brains × Silver/Gold, `Brains.tsx` + Trainer Dex (`verify:trainers` "Emerald: 7 Frontier Brains x 2 symbols"). Platinum/HGSS: the Trainer Dex has Palmer, Dahlia and Darach teams (Bulbapedia) and Thorton/Argenta with a "no fixed team" note, but the Brains screen is Emerald-only, and no Gen 4 appearance rule (21st/49th; Hall 50th/170th) is shown. |
| 7 | Rental pool data (Trainerdex extension) (Unknown) | **Partial** | The Factory pools for Emerald/Platinum/HGSS are in `tools/rental/rentalMath.ts` (HGSS flagged as reusing Platinum). The Slateport Battle Tent pool (70 sets) is in the Emerald bundle but unused. Battle Castle: no rental Pokémon exist (its rentals are held items), so the PRD's "Castle pool" needs a correction, not data. |
| 8 | Rental set preview/comparator (Unknown) | **Partial** | Tool #22 compares sets side by side for the Factory (`verify:tools`). By owner decision (2026-11-06) it stays set-vs-set, with no team and no damage. Missing: the Slateport Tent pool. |
| 9 | Battle Pike/Pyramid simulation tools (To discuss) | **Partial** | Pyramid: the floor log has trainer, wild and item columns, the wild-category hint and Brandon's pick (`tracker/PyramidPanel.tsx`, `frontier-tracker` B12/A10). Pike: nothing (no room types, no odds). |

No row this brief marked Done failed outright. The Arena's two label defects are reopened in S6;
the Emerald Frontier, Brains and the tracker hold.

## Proposed Notion "Build status" (not written to Notion)

Filled in at the end of the slices: see the table below once S1–S7 land.
