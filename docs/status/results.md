# Result: Frontier pyramid log

2026-11-15. Replaces the previous result; history is in git.

**DONE.** Branch `feature/frontier-pyramid`, pushed to origin (not merged, no PR). `npm run check -- --since main` on `61eb265` (the last code commit): **PASS**, every step:

| Step | Result |
|---|---|
| typecheck, lint (10 changed files), build | PASS |
| `verify:frontier-tracker` (new sections A10 and B12; Pyramid screens added to B10 and B11) | PASS, 271/271 |
| `verify:frontier-reference` | PASS, 138/138 |
| `verify:frontier-data`, `verify:app`, `verify:infra` | PASS |

`check --all` was not run.

**Preview: NOT published.** The push to the `preview` remote was denied in this session. The last section says how to publish it.

## What was built

- **A Pyramid run's detail** replaces the battle row and the log rows with:
  - **"Add to floor N"**, the open floor, at the top of an ongoing run. It shows the floor as logged and its label, for example "Round 2 · floor 3 of 7".
  - **The floor log:** one row per floor, then Brandon's row where he appears.
  - **Run totals** in the head: floors, trainers, wild defeated, items.
- Every other facility is unchanged. They keep the battle row and the battle log.
- **Every tap saves at once.** There is no form and no Save button. The open floor is saved on the run, so a reload keeps it.
- **Three big buttons: Wild, Trainer, Item.** Wild is chosen by default.
- **Wild:**
  - Pick the category from 20 entries. Each shows the first line of the old man's hint and the tactic.
  - The pick is kept for the rest of the round, and **Change** switches it on any floor.
  - The category's species are sprite buttons. Each tap adds 1 defeated.
  - A search below reaches any Gen 3 species, with "Unknown (not seen)" first.
- **Item:**
  - The round's items are one-tap buttons with the name and a 32 px sprite. Lum Berry, listed twice in some rounds, is one button.
  - Each tap adds 1.
  - A search reaches any Gen 3 item.
  - From round 41 on there are no buttons, only the search.
- **Trainer:**
  - Tapping Trainer opens the species picker at once, with "Unknown (not seen)" first.
  - Picking a species saves that trainer as defeated, with that one Pokémon. Tap the field again for the next trainer.
  - **Lost to Golem** (the trainer you just added) turns that trainer into the loss and ends the run.
  - **Lost to another** is for a trainer whose Pokémon you did not see. It adds an Unknown trainer as the loss and ends the run.
  - **More** (collapsed) holds the trainer, limited to the loader's ID range for that floor, and the set, among that species' Frontier sets. With two or more trainers on the floor, a **For** list picks which one.
- **The floor's entries** sit below the buttons: trainers, wild × count and items × quantity.
  - Wild and items have − / + / remove.
  - Trainers have remove.
- **Next floor** closes the floor as cleared and opens the next one. The floor note stays as an optional field.
- **Undo floor N** works as for the other facilities: it removes the floor, its lists and its BP line.
- **Brandon:**
  - The loader decides his floors: 21 (Silver) and 70 (Gold), then every 35 once both symbols are held.
  - On his floor the strip adds "Brandon · Silver · at the top, after this floor", with his three (Unknown first) and **Lost to Brandon**.
  - In the log, his row follows the floor. It shows his three with sprites, Won or Lost, and the known team with "matches" or "differs".
  - Regular floor rows never carry a Brain.
- **The log:**
  - Each row has the floor label (click it for the Streak lookup), the counts (trainers / wild / items), the three lists with sprites, and Cleared or Lost.
  - **Edit** reopens a saved floor with the same buttons, its note, and Brandon's three on his floor. Changes save at once; the result stays.
  - A run you retire in the middle of a floor keeps that floor in the log as "Retired", with its entries.
- **Home, once there is a Pyramid run:** the top 10 wild species defeated, items obtained and trainers' Pokémon seen, across runs. Unknown is not counted.

## The data

- `scripts/frontier/build-pyramid.mjs` reads the two fixtures and writes `src/modules/battle-frontier/tracker/pyramidData.ts`.
  - A species resolves through the loader's `resolveSpecies` (the Gen 3 Pokédex list).
  - An item resolves through the Itemdex's Gen 3 list (`itemEntries`).
  - A name that does not resolve stops the script.
- **No alias was needed.** Every name in both fixtures resolves as written.
- The suite re-runs the script and must get the committed file back. It also parses the fixtures again and checks every name.
- Both fixtures are committed on this branch.

## Done when, as asserted

Everything is in `verify:frontier-tracker`. Part A runs in Node (the model and the data); Part B drives the app.

| Line | Where |
|---|---|
| A floor with 2 trainers (one species each), a species added 3 times (×3) and 2 items persists across reload | B12: the open floor after a reload, then the closed floor after a second reload |
| Export → import is lossless | A10: floors, Brandon's three, a loss, an open floor |
| `bf-tracker.import.json` still loads unchanged | A10: normalising it gives it back exactly |
| Every wild entry and item name resolves to Gen 3 data | A10: 157 wild entries, 400 item slots (29 distinct items) |
| Round 1's chips are exactly its distinct items, in slot order | A10 (ids), B12 (ids and names) |
| Round 41+ shows no chips | A10; B12 (floor 281) |
| The common floor needs no typing; the taps are counted | B12: **10 taps, 0 keys** (category 1, three species 3, Item 1, two items 2, Trainer 1, the species 1, Next floor 1) |
| The trainer picker offers only the loader's range for that floor | B12: compared with `trainerPoolForStreak` for floors 2 and 3, not with a literal |
| A trainer entry cannot hold two species | A10: dropped when the document is read, and `addTrainer` throws |
| Brandon's row after 21 and 70 with the comparison; regular rows never | A10 (model); B12 (21 "matches", 70 "differs", no floor row has one) |
| Run totals and the Pyramid insights match the logged data | A10; B12 (compared with the model over what is stored) |
| Undo removes a floor's lists and its BP line | A10; B12 (floor 7, +5) |
| The loader's Pyramid party size vs. one Pokémon per trainer | A10, and "The party size" below |
| Accent ≤ 2, no badge, no shadow, tokens only, both themes | B10: three Pyramid screens in both themes |
| Nothing clips at 390 px | B11: two Pyramid screens |

## The party size

- **The loader says 3** (`facilities()`, Pyramid, Singles). That is the **player's** party, and Brandon's. The loader has no field for a regular trainer's party.
- **The owner's rule is correct.** In pokeemerald, `BattleSetup_StartTrainerBattle` (`src/battle_setup.c`) calls `FillFrontierTrainerParty(1)` for a Pyramid trainer.
  - When two trainers spot you at once, each still has one Pokémon.
  - Brandon gets `FRONTIER_PARTY_SIZE` (3).
- **Built to the owner's rule:** one species per trainer, enforced when the document is read.

## Screenshots

In `docs/status/frontier-pyramid/`, at 1440 px unless the name says narrow:

| File | What |
|---|---|
| `pyramid-layout.png` | The open floor with `?layout=1`: floor 2 after a reload, with two trainers, Pikachu ×3 and two items |
| `pyramid-open-light.png`, `pyramid-open-dark.png` | The open floor: a category chosen, its species, the entries |
| `pyramid-log-full.png` (whole page), `pyramid-log-light.png`, `pyramid-log-dark.png` | A run lost on floor 7: totals, the floor log with its lists, Golem (lost) |
| `pyramid-brain-rows.png` (whole page) | A 70-floor run: Brandon's rows after floor 21 (Silver, "matches") and 70 (Gold, "differs") |
| `pyramid-brain-light.png`, `pyramid-brain-dark.png` | The same run's first screen: the head and the category list on floor 71 |
| `pyramid-brain-floor-light.png` | Floor 21: Brandon's three in the strip, then the log |
| `pyramid-home-light.png`, `home-dark.png` | Home with the Pyramid insights |
| `narrow-pyramid-open.png`, `narrow-pyramid-log.png` | 390 px |

## Deviations, and why

1. **The open floor is stored on the run (`Run.openFloor`), not as a Battle.** A floor becomes a Battle only when it closes, so an unfinished floor never counts as a win, a set or a Brain battle. It is an optional field, like `Battle.pyramid`. The document stays version 1.
2. **A wild entry may be Unknown (`species: null`).** The brief's model says `species: number`, but it also asks for "Unknown (not seen)" first in the wild search.
3. **The item "chips" are plain ghost buttons.** The design system bans chips and badges.
4. **Trainers have remove only, no − / +.** A trainer is one battle. Pick again to add another.
5. **Added after the spec review:**
   - "Lost to another";
   - More's "For" list;
   - the "Retired" floor row;
   - the floor note and Brandon's three in a reopened floor;
   - a second tap reopens the picker list; when text is typed, Enter takes the first match, not Unknown.
6. **More sits beside the picker, not under it.** Trainer mode opens the picker's list at once, and that list would cover anything below it.
7. **The Brain row is hidden** when a regular trainer ended the floor, because Brandon was never reached.
8. **The label "Round r · floor f of 7"** is used in the new strip and log. The Streak lookup keeps its own wording, because `format.ts` is frozen.
9. **No mockup came first.** CLAUDE.md asks for one for a new screen. Your brief specified this one in detail and asked for questions only on a true blocker, so the review is on the preview.

## Assumptions

- **Totals and insights** include the open floor's entries, because they are saved. "Floors" counts closed floors only.
- **The wild category** in force on a floor is that floor's own pick, or else the latest pick on an earlier floor of its round. Each closed floor stores the category it used.
- **Undo floor N** also drops the open floor after it, because its entries belonged to the next floor.
- **The trainer range on floor n** is drawn from the floors cleared before it (n − 1). pokeemerald's `GetUniqueTrainerId` confirms it. Floor 7 of each round reads the Hard row.
- **The set list** is that species' Frontier sets at the run's level. It is not narrowed to the chosen trainer's sets.
- **The species pickers** are the tracker's existing ones: 6 matches by name prefix, from the Gen 3 list (#1–386).
- **The item search** covers the Itemdex's Gen 3 list, matching the start of the name or of a word, with 6 shown.

## Open items

- **Category 6 in the wild fixture lists 5 species, not 8**, so there are 157 entries, not 160. The game's table has 8 slots per round; the 3 missing ones may be repeats. To change it, edit the TSV and run `node scripts/frontier/build-pyramid.mjs`.
- **The game decides the category per round.** pokeemerald (`GenerateBattlePyramidWildMon`, and the old man's `GetBattlePyramidHint`) uses (floors cleared ÷ 7) mod 20. That makes round 1 category 1, round 20 category 20, and then it wraps. The app could pre-select it and save one tap per round. This was not built, because your brief asks for the pick.
- **The game's item table wraps every 20 rounds.** Rows 21–40 of the fixture equal rows 1–20, so round 41 would repeat round 1. The app was built to your brief: no buttons past round 40.
- **Shared wording that says "battle":** the run head ("Lost battle 7") and the stats panel ("Current streak: 7 battles"). For the Pyramid these count floors.
- **Undo floor N deletes that floor's lists**, as the brief says. A mis-tapped "Lost" therefore loses the floor's entries on Undo. A mis-tapped "Next floor" is fixed with Edit.
- **The design audit found** that the Wild / Trainer / Item row, the category buttons and the pick buttons have no component spec in `design-system/components/`. The tracker's earlier controls have none either. Say if you want specs added.
- **Phone layout is parked.** At 390 px nothing runs past the scroll area; the floor log scrolls sideways inside its table.
- **`check --all`** was not run. Run it before merging.
- **Risk is data:** the saved document's shape. Please review before merging.

## Reviews

- **Design audit and spec review** ran on `03316d8`. Their findings are fixed in `32c999c`:
  - 48 px hit areas on − / + / remove;
  - the mode row placed by area;
  - two region names;
  - item rows no taller than the others;
  - the retired floor, Lost, More, the picker and the editor, from deviation 5.
- **Mechanics check:** pokeemerald, read by a research agent, confirmed three things:
  - a regular Pyramid trainer has one Pokémon;
  - the trainer ID uses the floors cleared before;
  - the wild category is chosen per round.

## Changes outside the tracker module

- `scripts/frontier/build-pyramid.mjs` (new).
- `scripts/lib/suiteMap.mjs`: a change to the Pyramid fixtures runs `verify:frontier-tracker`.
- `scripts/verify-frontier-tracker.mjs`: the new sections.

**New region names (`?layout=1`):**
- the head and the strip: `run-totals`, `pyramid-add`, `pyramid-head`, `pyramid-strip`, `pyramid-modes`;
- Wild: `pyramid-wild`, `pyramid-category`, `pyramid-categories`, `pyramid-wild-picks`, `pyramid-wild-search`;
- Item: `pyramid-item`, `pyramid-item-picks`, `pyramid-item-search`, `item-picker`;
- Trainer and Brandon: `pyramid-trainer`, `pyramid-trainer-more`, `pyramid-trainer-more-fields`, `pyramid-brain`;
- the entries: `pyramid-entries`, `pyramid-entries-trainers`, `pyramid-entries-wild`, `pyramid-entries-items`, `pyramid-floor-actions`;
- the log: `floor-edit`, `floor-edit-brain`, `floor-lists`;
- home: `insight-pyramid`, `insight-pyramid-wild`, `insight-pyramid-items`, `insight-pyramid-trainers`.

## How to try it on the preview

**Publish it** (the push was denied here):

1. Open a terminal in the repo folder.
2. Run `git push --force preview feature/frontier-pyramid:main`.
3. Wait for the Pages deploy in `hrezende423/pokeapp-preview` to finish. Its Actions tab shows it.
4. Open https://hrezende423.github.io/pokeapp-preview/

**Start a Pyramid run:**

5. Click the **account menu**, the last item on the right of the top bar ("Sign in", or your name).
6. Set **Generation** to **Gen 3**, then close the menu.
7. Open **Battle Frontier → Challenge Tracker**.
8. Click **New run**.
9. Set **Facility** to **Battle Pyramid**, choose the **Level**, then click **Start run**.

**Log a floor:**

10. **Wild** is already chosen. Tap the category the old man in the lobby gave you. It is kept for the round.
11. Tap each wild Pokémon you defeated. Each tap adds 1; − / + / × in the list below fix it.
12. Tap **Item**, then tap each item you found.
13. Tap **Trainer**. The list opens: tap the trainer's Pokémon, or "Unknown (not seen)". Tap the field again for the next trainer.
    - If you lost: tap **Lost to …**, or **Lost to another** for an unseen trainer.
    - **More** sets the trainer and the set, both optional.
14. Tap **Next floor**.

**Then check:**

15. In the floor log:
    - **Edit** reopens a floor;
    - the floor label opens the Streak lookup;
    - **Undo floor N** takes back the last floor.
16. **All runs** goes home, where the Pyramid insights are, under the other insights.
17. Add `?layout=1` to the URL, or press Ctrl+Shift+L, to see the region names.

The preview is a separate site, so its storage starts empty, and the app does not keep Gen 3 across a reload.

**For the review,** name regions from `?layout=1`, and mark up in one batch:
- the open floor (Wild, Item, Trainer);
- the floor log;
- a reopened floor;
- Brandon's floor;
- home.
