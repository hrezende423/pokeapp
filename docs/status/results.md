# Result: Frontier mockups

2026-11-14. Replaces the previous result; history is in git.

DONE, except the preview. Branch `feature/frontier-mockups`, pushed to origin for a PR (not opened, not merged). `npm run check -- --since main`: 5/5 PASS (typecheck, lint, build, frontier-data, infra).

**Preview: NOT published.** The repo publishes a preview by force-pushing the branch to the `preview` remote's `main`, and that push was denied in this session. To publish it, run `git push --force preview feature/frontier-mockups:main` from the repo, wait for the Pages deploy in `hrezende423/pokeapp-preview`, and the links below go live.

**Preview links** (live once the push above is done):
- [frontier-facilities.html](https://hrezende423.github.io/pokeapp-preview/mockups/frontier-facilities.html)
- [frontier-brains.html](https://hrezende423.github.io/pokeapp-preview/mockups/frontier-brains.html)
- [frontier-tracker.html](https://hrezende423.github.io/pokeapp-preview/mockups/frontier-tracker.html)
- [frontier-sets.html](https://hrezende423.github.io/pokeapp-preview/mockups/frontier-sets.html)

## What was made

- **Four static mockups** in `public/mockups/`, like the Counters slice: one self-contained file per screen, states stacked and numbered, `tokens.css` inlined.
- **Generated, not hand-written.** `scripts/mockups/frontier.mjs` builds them, so every value is real:
  - the frozen frontier loader, bundled in memory the way `verify:frontier-data` does it;
  - names from the eager bundle;
  - the tracker runs from `docs/fixtures/bf-tracker.xlsx`.
- **Regenerate** with `node scripts/mockups/frontier.mjs`.
- **The generator checks the Brain rows.** It throws if the loader's Brain flag disagrees with a Brain row in your log. It agrees on all three: Dome battles 20 and 40, Factory run 4 battle 21.
- **No app code changed:** no nav entry (`NAV_TABS` untouched), no component, no store, no import code, no loader change.
- **Shared reader:** the xlsx reader moved to `scripts/lib/xlsx.mjs`, used by both the suite and the generator.
- **Checks on the rendered mockups** (Chrome, every frame):
  - at most 2 accent elements;
  - 0 box-shadows;
  - IBM Plex Sans and Martian Mono both loaded;
  - no horizontal page overflow; wide tables scroll inside their own wrapper.
- **Design audit:** a read-only audit found 7 rule violations. All are fixed:
  - colliding EV text;
  - Brain spacing that broke the hairline-band rule;
  - resting underlines on links;
  - the dropdown overrunning its frame;
  - stacks of more than two children without named areas;
  - numbers in Sans and words in mono;
  - semibold emphasis in data cells.

## Screens: screenshots and region names

Screenshots are in `docs/status/frontier-mockups/` (1440 px viewport).

Every frame shares these regions: `app-bar`, `nav-tabs`, `frontier-scroll` (the module's ScrollArea) and `page-head`. The other-generation state also shows `frontier-notice`.

| Screen | Screenshots | Regions (`data-layout`) |
|---|---|---|
| Facilities | `frontier-facilities-1.jpg` (tab and dropdown), `-2.jpg` (the screen) | `nav-dropdown`, `frontier-facilities`, `facility-grid`, `facility` ×7, `facility-facts`, `frontier-shared`, `frontier-symbols`, `frontier-levels`, `frontier-banned`, `frontier-bp-rules`, `frontier-bp-shop`, `bp-shop-clerk` ×4 |
| Brains | `frontier-brains-1.jpg` | `frontier-brains`, `brain-list`, `brain` ×7, `brain-head`, `brain-appearances`, `brain-team` (Silver, Gold), `brain-generated` (Noland) |
| Challenge Tracker | `frontier-tracker-1.jpg` (home), `-2.jpg` (Dome run), `-3.jpg` (Factory run 4), `-4.jpg` (picker, unknown Pokémon), `-8.jpg` (390 px) | home: `frontier-tracker`, `tracker`, `tracker-main`, `tracker-runs`, `tracker-insights` (`insight-history`, `insight-species`, `insight-dome-pairs`), `tracker-side`, `tracker-bp` · run: `frontier-run`, `run-head`, `run-team`, `run-log`, `tracker-stats`, `log-add-state`, `log-add`, `species-picker` · `new-run`, `new-run-form`, `tracker-empty` |
| Sets & Trainers | `frontier-sets-1.jpg` (Sets), `-4.jpg` (Trainers), `-5.jpg` (Streak lookup) | `frontier-sets`, `sets-body`, `sets-views`, `sets-controls`, `sets-count`, `sets-list`, `trainers-body`, `trainers-search`, `trainers-list`, `streak-lookup`, `streak-lookup-form`, `streak-lookup-cases`, `streak-lookup-result` |

### States per mockup

- **Facilities** (4 states):
  1. the open tab;
  2. the screen;
  3. another generation;
  4. 390 px.
- **Brains** (2 states):
  1. the seven Brains, with Noland generated;
  2. another generation.
- **Tracker** (8 states):
  1. home after import;
  2. Dome run 1 (40 battles, Tucker at 20 and 40);
  3. Factory run 4 (40 battles, rentals and swaps, Noland at 21);
  4. logging a battle with the species picker, and an unknown Pokémon;
  5. new run;
  6. empty;
  7. another generation;
  8. 390 px.
- **Sets & Trainers** (6 states):
  1. Sets;
  2. search "salamence";
  3. Open Level only;
  4. Trainers, with Vince (#222) opened;
  5. Streak lookup with your three cases;
  6. another generation.

### The owner's cases (Streak lookup)

- **Dome battle 20** = tournament 5, the final:
  - IDs 140–199, drawn as 10 from 140–179 and 5 from 160–199;
  - IVs 12 / 15 / 18, by ID slice;
  - Tucker (Silver) is due.
- **Factory battle 21** = set 3, battle 7:
  - the Hard ladder, 140–159;
  - opponent sets #267–#371;
  - Noland (Silver) is due, with a generated team at IV 15.
- **"Streak 49"** = 49 won, so Tower battle 50:
  - IDs 200–299, not the Hard ladder;
  - IV 21 for IDs 200–219, 31 for 220–299;
  - with Silver held, the next Brain is Gold at battle 70.

## Questions (one batch, answer once; each default is already in the mockups)

1. **Dome "dropped" (1–3).**
   - *Default:* the opponent's Pokémon in that slot, the one that did not battle (opponents also bring 2 of their 3).
   - Shown in a "Dropped" column as the slot number and the species, e.g. "2 Salamence".
2. **Factory rentals you never saw.**
   - Each set's draft offers 6 and you rent 3; each swap offers the beaten trainer's Pokémon.
   - *Default:* record only your 3 at each draft, plus each swap (out → in). Nothing for unpicked offers.
   - An opponent Pokémon you never saw is "Unknown".
3. **Spreadsheet import.**
   - *Default:* a dev script converts the xlsx into the tracker's export JSON, and the existing document import loads it. No spreadsheet dependency in the PWA.
   - `scripts/lib/xlsx.mjs` already reads the file with no dependency.
   - The alternative is an in-app importer, which adds a parser to the app.
4. **Dates.** The log has none.
   - *Default:* imported runs carry the import date; new runs carry the date they start.
5. **Win/loss.** The log has no result column.
   - *Default on import:* every battle is a win, except the last battle of a run that another run follows (a loss). The last run of each block is ongoing.
   - Please confirm Factory runs 1–4 ended in a loss rather than a retirement, and that Dome run 1 and Factory run 5 are ongoing.
   - Because of this default, the Dome win rate per pair reads 100% for every pair.
6. **Format and level.** The log doesn't say.
   - *Default:* Singles for both, because Brains only appear in singles.
   - Lv50 for both. The Factory's Lv50 is supported by Noland's team fitting the Lv50 draw. **Is the Dome Lv50?**
7. **Battle Points before the app.**
   - *Default:* an editable opening balance (0), then one ledger line per completed set. Shop spending is a minus line.
   - Under the defaults, imported runs earn 82 BP: Dome 50, Factory 32.
   - The alternative is one "current balance" field instead.
8. **Opponent trainer.** The log has no trainer column.
   - *Default:* no trainer field per battle.
9. **Factory run 4, battle 29.**
   - It is a new set, so the game re-drafts the rentals at that point (`factory_generaterentalmons`).
   - Your log keeps Espeon and Heracross across that draft.
   - *Default:* shown as logged, as set 5's draft. Please confirm it is not a typo.
10. **Run detail is a screen inside the module.**
    - *Default:* its "All runs" link is the module's own control, like Team Building's screens. It is not a step in the back stack.
11. **The Sets list.**
    - *Default:* one scrolling list of all 882 (the mockup shows the first 30).
    - The alternative is pages.
12. **Sprites.**
    - *Default:* names only (links to the species page) in Brains, the log and the sets.
    - Should Brain teams and log rows show sprites, as Trainer Dex parties do?
13. **Symbol toggles.**
    - The design system's Toggle turns accent when on, and accent is reserved for the tab and the selected view.
    - *Default:* a checkbox icon with a semibold label instead.
14. **Links at rest.**
    - *Default:* no line at rest, a hairline on hover (per the audit).
    - The Pokédex's egg-group links keep a hairline at rest. Which one do you want?
15. **Streak lookup location.**
    - *Default:* inside Sets & Trainers only.
    - Should a log row also open it for that battle?
16. **Dome team.**
    - *Default:* your three are recorded once per run (the log has one team line), and each battle records the pair you brought.

## Assumptions

- **Fonts** are inlined as data URIs: the latin subsets of Plex Sans Roman and Martian Mono. The other mockups load no fonts and fall back to system faces.
- **Accent per screen:**
  - the Battle Frontier tab;
  - on Sets & Trainers, also the selected view tab;
  - the open dropdown marks the current entry by weight only.
- **BP per format** on Facilities is one line per format, in runs: "1–2 → 1 · 3–4 → 2 · … · 29 on → 15". It is exact; a 30-column table did not fit.
- **The tracker stores the battle number as logged.** It is converted to the loader's streak only when the loader is called (Dome: wins before the battle ÷ 4). The screens show the logged number and its label, never the raw streak.
- **A Brain flag on a log row** comes from `trainerPoolForStreak({ symbols })` (the same rule as `nextBrainAt`); in the Dome, only on the final.
- **Factory rentals:**
  - a heading line at each set's draft (battles 1, 8, 15, 22, 29, 36);
  - a swap line where one changed inside a set;
  - never repeated on every row.
- **The per-battle note** is an optional field when logging (state 4). Notes do not get their own log column.
- **The stats panel** belongs to facility × format × level, not to a run. Its "Current streak" names the run it comes from.
- **Narrow frames** use a container query at 900 px, so the regions stack inside a 390 px frame. The phone layout stays parked.
- **`docs/status/`** is gitignored, so this file and the screenshots are force-added.

## Open items

- None blocks the build. Answering questions 1, 5, 6 and 9 also fixes the import.
- Not drawn: dark theme (nothing theme-specific), sprites (question 12), Platinum and HGSS.
