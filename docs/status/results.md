# Result: Frontier tracker

2026-11-15. Replaces the previous result; history is in git.

**DONE.** Branch `feature/frontier-tracker`, pushed to origin (not merged, no PR). `npm run check -- --since main`: **PASS**, every step:

| Step | Result |
|---|---|
| typecheck, lint (13 changed files), build | PASS |
| `verify:frontier-tracker` (new) | PASS, 173/173 |
| `verify:frontier-reference`, `verify:frontier-data`, `verify:store`, `verify:infra` | PASS |
| `verify:app`, `verify:collection`, `verify:dexes`, `verify:ds`, `verify:scroll-nav` | PASS |
| `verify:team-builder`, `verify:tools` (304/304), `verify:ux` | PASS |

`check --all` was not run.

**Preview:** see the last section.

## How to load your log (do this once per device)

The file is `docs/fixtures/bf-tracker.import.json` on this branch.

1. Get the file:
   - **From GitHub:** open the branch, open that file, and click **Download raw file**.
   - **From the repo on your computer:** the file is already there.
2. Open the app.
3. Click the **account menu**. It is the last item on the right of the top bar ("Sign in", or your name).
4. Set **Generation** to **Gen 3**. The default is Gen 4, which shows only a notice.
5. Under **Saved documents**, click **Import…** and choose the file.
6. The menu then says `frontier-tracker: replaced`.
   - If the tracker on this device already holds data, it asks first: "This replaces what this device holds for: frontier-tracker".
   - Press **Replace** to load the file, or **Cancel** to change nothing.
7. Close the menu. Open **Battle Frontier → Challenge Tracker**.

Until the sync table is approved (see "Sync" below), do this on the phone and on the desktop separately.

## What was built

- **The tracker** (`src/modules/battle-frontier/tracker/`) replaces the Challenge Tracker stub. It is the fourth entry of the Battle Frontier dropdown and loads lazily.
- **Home:**
  - runs grouped by facility, newest first;
  - run history, the 10 most-seen opponents, and the Dome win rate per pair;
  - Battle Points with an opening balance and the ledger.
- **A run** is a screen inside the module, not a back-stack step:
  - its head;
  - the Dome's three;
  - a logging row while the run is ongoing;
  - the battle log;
  - stats for its facility, format and level, then Battle Points.
- **The log:**
  - The battle number is shown as logged, with its label: tournament and round, set and battle, Pike room, Pyramid floor.
  - Opponents have 32 px Emerald sprites. Unknown is shown muted.
  - The Dome log has a Dropped column (the opponent's slot that sat out, with that species) and a Your pair column.
  - A Brain row shows its known team and "matches" or "differs". Noland shows "Generated team: nothing to compare".
  - In the Factory, a draft line opens each set and a swap line appears where a rental changed. Rentals are not repeated on every row.
- **The Brain flag** comes from the loader, at the symbols held at that battle. It is never typed.
  - After the import: Dome 20 (Tucker, Silver), Dome 40 (Gold), Factory run 4 battle 21 (Noland, Silver).
- **The Streak lookup:** click a row's battle label (for example "Tournament 5 · Final"). It opens under the row, prefilled with the facility, format, level, the battle as logged and the symbols held then.
- **Logging a battle:**
  - three species pickers, each with search and **Unknown (not seen)** first;
  - a note;
  - **Won** and **Lost**.
  - **Dome:** your pair (2 of your 3) and the dropped slot.
  - **Factory, at a set's first battle (1, 8, 15…):** the three rentals, each with an optional set (any of that species' Frontier sets the level allows).
  - **Factory, inside a set:** an optional swap. Same species on another set is allowed.
  - A loss ends the run.
  - A win that completes a set adds the line `bpAward` proposes, with +10 on a won Brain battle.
- **Symbols:** a checkbox icon with a semibold label, not the accent Toggle.
  - A won Brain battle sets them.
  - A toggle overrides them.
  - A symbol you mark as held, which the log never earned, is treated as won before the app.
- **Battle Points:** the opening balance is editable.
  - Click a line to edit or delete it.
  - **Add a line** with a minus records shop spending.
  - The cap is 9,999 (`addBattlePoints`).
- **Import script:** `scripts/frontier/import-bf-xlsx.mjs`, no new dependency.
  - It writes the document's own export format.
  - It checks the log's own silver/gold cells against the loader and stops on a mismatch.

## Done when, as asserted

| Line | Where it is asserted |
|---|---|
| 1 Dome run (40), 5 Factory runs (6/3/7/40/7); the JSON loads through the app's import | A1; B3 (the account menu) |
| Brain rows from the loader at Dome 20 and 40, Factory run 4 battle 21; nothing typed in the file | A1, A3, B5, B6 |
| Dome Silver and Gold held, Factory Silver held | A3, B5 |
| BP 82 (Dome 50, Factory 32), each line from `bpAward` | A5: the literal deltas `1,1,2,2,13,3,4,4,5,15 / 3,3,14,4,5 / 3` |
| A logged battle (picker, Unknown, W/L, Dome pair and dropped) persists across reload | B7 |
| Export → import is lossless | A8 (store), B8 (the menu's file round trip) |
| Dome battle 20 → loader streak 4 → Tucker due | A2 (`poolArgsAt`), B5 (the lookup opened from row 20) |
| Screens match the mockup states | B1–B9, text compared region by region with `frontier-tracker.html` |
| Accent ≤ 2, no badge, no shadow, tokens only, both themes | B10 (home, Dome, Factory, logging) |

## Screenshots, next to the mockup

The app screenshots (1440 px unless named narrow) are in `docs/status/frontier-tracker/`. The mockup screenshots are in `docs/status/frontier-mockups/`.

| Mockup state | App | Mockup |
|---|---|---|
| 1. Home after the import | `home-light.png`, `home-dark.png` | `frontier-tracker-1.jpg` |
| 2. Dome run 1 | `dome-light.png` (row 20's lookup open), `dome-dark.png` | `frontier-tracker-2.jpg` |
| 3. Factory run 4 | `factory4-light.png`, `factory4-dark.png` | `frontier-tracker-3.jpg` |
| 4. Logging, the picker, Unknown | `logging-picker-light.png`, `logging-light.png`, `logging-dark.png` | `frontier-tracker-4.jpg` |
| 5. New run | `new-run-light.png` | state 5 in `public/mockups/frontier-tracker.html` |
| 6. Empty | `empty.png` | state 6 |
| 7. Another generation | `other-generation.png` | state 7 |
| 8. 390 px | `narrow-home.png`, `narrow-dome.png`, `narrow-factory5.png` | `frontier-tracker-8.jpg` |
| The import | `account-import.png` | (not in the mockup) |

The dark Dome and Factory shots were taken after the suite logged a test battle, so the Dome there shows 41 battles.

**Region names (`?layout=1`)** are the mockup's. The suite asserts every name each mockup state uses.

New names:
- `log-pair`, `log-rental`, `run-team-pick`, `bp-line-edit`, `run-undo`;
- in the account menu: `saved-documents-actions`, `saved-documents-confirm`.

## Deviations from the mockup, and why

1. **Saved documents → Export / Import in the account menu (new).**
   - The app had no document import button. The store had the code (`importDocuments`) but no UI.
   - **Import replaces each document the file holds, and asks first when that document already has data here.** A merge would add a second copy of every Team Builder build and team if you re-imported a full export. The spec review found this.
   - Export downloads every saved document.
   - The two buttons use the account menu's existing ghost style (regular weight), so they match its other buttons. The design audit noted that this differs from the tracker's semibold ghost.
2. **Sprites** on log rows, draft lines and swap lines, as the task asks. The Dome's seven columns therefore needed room at 1440:
   - "Your pair" wraps onto two lines;
   - the Brain cell has a minimum width;
   - the cell padding is a little tighter.
   - The suite asserts that neither log scrolls sideways at 1440.
3. **The logging row has more than state 4 shows:**
   - the Dome pair and dropped slot;
   - the Factory draft at a set's first battle (state 4 itself is battle 8, a set start);
   - the Factory swap inside a set.
   - It sits at the top of an ongoing run, under the Dome's three, as state 4 places it.
4. **Added controls:**
   - **Retire the run** (two clicks);
   - **Undo battle N** (it also removes that battle's draft or swap, and its set's BP line);
   - **Add a line**, and a click on a ledger line to edit or delete it;
   - "N older not shown", which is a link that shows them all;
   - **Cancel** on New run.
5. **The Dome's three** is chosen with three pickers until the run's first battle, then fixed.
6. **The Streak lookup opens under its row.** Clicking the battle label opens it, so no text is added to the row.
7. **A battle note** shows under that row's opponents.

## Sync

**`sync: true`, with no Supabase change of its own.** The store sends every document except the Team Builder to the `user_documents` table, one row per document name.

That table is the migration `supabase/migrations/20261107120000_user_documents.sql`. It is written but **still pending your approval**. Until it is applied, the tracker stays on each device, without an error (`src/sync/syncTargets.ts`).

Once it is applied:
- A device's first sync merges: a run both sides have is taken whole from the side that logged more of it.
- Ledger lines are joined, so a line deleted on one device comes back from the other on that first sync only.
- After that, the latest writer wins, as for every document.

## Assumptions

- **Import date:** imported runs carry 14 Nov 2026, the day the script ran (`--date`). They have no end date; the log has none.
- **Order:** imported runs come first, as the history before the app, then runs by the day they started. Run numbers, the symbol walk and "current streak" follow that order.
- **Symbol overrides:**
  - An override is stored only where it differs from what the log earned.
  - Turning on a symbol the log lacks means you won it before the app.
- **Brain flags by facility:**
  - Pyramid: on the floor-7 row, the Streak lookup's rule.
  - Pike: rooms count like battles.
  - Doubles never gets a Brain (the loader's rule).
- **Lookup input:** `streak` is the logged count of wins before the battle, which is the component's own contract. It converts to the loader's unit at its own loader call. The tracker's single conversion is `poolArgsAt`.
- **New run defaults:** Battle Dome · Singles · Lv50, as the mockup's form.
- **The species picker:** it shows 6 matches by name prefix, from the whole Gen 3 list (#1–386, as the mockup says). The 10 banned species are not removed.
- **A ledger line's reason** is written when the line is made, for example "Factory run 4, set 3". The Brain name beside it comes from its run.
- **The `cleared` outcome** exists in the model, with no button: Pike and Pyramid clears are not modelled.

## Reviews

A spec review and a design audit ran on the first commit. Their findings are fixed in `1b7e3dc`:
- the import's replace with a confirmation;
- a symbol won before the app now stays held when the log reaches that Brain;
- the merge takes a shared run whole;
- the run order;
- the document keeps fields a newer client adds, as `src/store/CLAUDE.md` requires for a synced document;
- the Dome log is no longer clipped at 1440;
- three CSS precedence bugs;
- the region names;
- four tests that could not fail.

## Changes outside the module

- `src/sync/AccountControl.tsx` and `account.css`: Saved documents.
- `src/store/CLAUDE.md`: one paragraph on that UI, and on defining a document eagerly so the import finds it.
- `src/modules/stubs/stubPages.ts` and `src/modules/nav/navConfig.ts`: the stub graduated.
- `scripts/verify-frontier-reference.mjs`: its "Challenge Tracker is a stub" check now expects the screen.
- `scripts/lib/suiteMap.mjs` and `package.json`: `verify:frontier-tracker`.

## Open items

- **Approve `user_documents`**, or the phone and the desktop keep separate logs.
- **Symbols for a facility with no run yet** can only be toggled from a run's detail, as the mockup places them. A symbol won before the app at such a facility needs a run first.
- **Phone layout** stays parked. At 390 px, nothing runs past the scroll area; that is all that was checked.
- **`check --all`** was not run. Run it before merging.
- **Risk is data:** your log and a saved document. Please review before merging.

## Preview

See the next message in this file's commit history, or the reply that delivered it.
