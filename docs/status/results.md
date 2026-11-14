# Result: Frontier reference screens

2026-11-14. Replaces the previous result; history is in git.

**DONE.** Branch `feature/frontier-reference`, pushed to origin (not merged, no PR). `npm run check -- --since main`: **PASS**, every step:

| Step | Result |
|---|---|
| typecheck, lint (18 files), build | PASS |
| `verify:frontier-reference` (new) | PASS, 138/138 |
| `verify:frontier-data`, `verify:infra` | PASS |
| `verify:app`, `verify:dexes`, `verify:ds`, `verify:ux` | PASS |
| `verify:scroll-nav`, `verify:tools` (304/304), `verify:mobile` | PASS |

`check --all` was not run.

**Preview:** see the last section.

## What was built

- **The tab.** "Battle Frontier" sits between Team Building and Tools. Clicking the word opens Facilities.
  - The dropdown lists Facilities, Brains, Challenge Tracker and Sets & Trainers.
  - The open entry is semibold, in the same colour as the others.
  - Challenge Tracker is a `StubPage` entry in `stubs/stubPages.ts`, with no screen.
- **The registry.** `src/modules/battle-frontier/pages.ts`, registered in `PageId` and `findPage`.
  - The screens load lazily, so the entry chunk never carries the loader (`verify:infra` asserts it).
- **Facilities.** 7 facility sections, then the shared section:
  - symbols;
  - Level 50 and Open Level;
  - 10 banned species;
  - Battle Points;
  - the BP shop: 30 entries from 4 clerks.
- **Brains.** 7 Brains.
  - Six have Silver and Gold teams, with a 32 px Emerald sprite on every row.
  - Noland shows the generated explanation and his rental ranges, and no team.
- **Sets & Trainers.** Three views:
  - **Sets:** 882 in one list, searchable by species, trainer class or held item, with an "Open Level only" text filter.
  - **Trainers:** 300 trainers. A row opens to that trainer's sets.
  - **Streak lookup.**
- **Streak lookup.** A reusable component: `StreakLookup({ data, initial })`, with `initial = { facility, levelMode, streak, format?, symbols?, towerLv50Streak? }`.
  - `SetsTrainers` takes `lookup` and opens on it. That is the tracker's seam; it is not wired.
- **Other generations.** Every screen shows only the notice "Battle Frontier data covers Emerald (Gen 3)." and fetches nothing.
- **Links.** Species names link through the entity engine (`deepLink` + `followLink`) and resolve through the Gen 3 species list. No line at rest, a hairline on hover.

## How it was checked

`verify:frontier-reference` (port 4206) opens each approved mockup in the browser and compares the app's text with it, region by region.

**Compared with the mockup text:**
- every facility section and every shared region;
- every Brain section;
- the first 30 set rows, the "salamence" rows and the 32 Open Level rows;
- the first 25 trainer rows, Vince's row and his first 8 sets;
- the three lookup cases.

**The "Done when" values, also asserted as literals:**

| Case | Result |
|---|---|
| Dome battle 20 | Tournament 5 final. IDs 140–199 (10 from 140–179, 5 from 160–199). Tucker (Silver) due |
| Factory battle 21 | Hard ladder 140–159. Sets #267–#371. Noland (Silver) due, generated team |
| Tower streak 49 (battle 50, Silver held) | IDs 200–299, not Hard. IV 21 for 200–219, 31 for 220–299. Next: Gold at battle 70 |

**Also checked:**
- No Frontier request under Gen 4 or All. The loader's cache is emptied before the "after leaving Gen 3" check, so that check can fail.
- The lookup is mounted on its own with initial inputs, and the form is read back.
- At most 2 accent uses per screen, in both themes. The count includes outline, background, SVG and pseudo-element accents.
- No shadow, no select except the lookup's own, and text colours from the tokens in each theme.
- The 36 Brain sprites decode.
- Switching views and opening a trainer push no back-stack step.
- At 390 px nothing runs past the scroll area.
- Since the merge base: no change to `battle-frontier/data/` or the Trainer Dex.

**Scrolling:** the 882 rows scroll at 17 ms per frame (95th percentile), so the list is not windowed.

**Reviews:** a spec review and a design audit ran on the first commit. Their findings are fixed in the second commit, `153a875`.

## Screenshots, next to the mockups

App screenshots (1440 px) are in `docs/status/frontier-reference/`. The mockup screenshots are in `docs/status/frontier-mockups/`.

| Screen | App | Mockup |
|---|---|---|
| Tab and dropdown | `nav.png` | `frontier-facilities-1.jpg` |
| Facilities | `facilities-light.png`, `facilities-dark.png` | `frontier-facilities-2.jpg` |
| Another generation | `notice.png` | (state 3 of each mockup) |
| Brains | `brains-light.png`, `brains-dark.png` | `frontier-brains-1.jpg` |
| Sets | `sets-light.png`, `sets-open-light.png`, `sets-dark.png` | `frontier-sets-1.jpg` |
| Trainers, Vince opened | `trainers-light.png` | `frontier-sets-4.jpg` |
| Streak lookup | `lookup-dome-light.png`, `lookup-dark.png` | `frontier-sets-5.jpg` |
| 390 px | `narrow-facilities.png`, `narrow-lookup.png` | `frontier-facilities` state 4 |

**Region names (`?layout=1`)** are the mockups' names. The suite asserts them on every screen. One name is new: `lookup-body`.

## Deviations from the mockups, and why

1. **Streak lookup is a third view tab.** The mockup drew it as its own state, directly under the page head. In the Sets and Trainers states, the view row sits in that same place. As a tab, all three views can be reached, and the accent stays at 2.
2. **One result, for the form.** The mockup's three fixed "owner's cases" panels are not on screen; the suite checks them against the mockup instead. The case label and the input caption went with them.
3. **Two more fields in the lookup form:**
   - **Format.** Brains appear only in Singles, so the mockup's form gave a Doubles player a Brain who never comes. The spec review found this.
   - **"Battle Tower Lv50 streak", for the Factory only.** The mockup's Factory case used it. Without it, the Factory IVs are a range.
4. **The lookup opens on Battle Tower · Singles · Lv50 · battle 1 · no symbols.** The mockup's form showed Dome 20 because that was its first case.
5. **The Pyramid Brain waits at the top, after the floor.** On floor 7 of a challenge (21, 70, …) the lookup says "Brandon (…) waits at the top, after this floor". The mockup had no Pyramid case. Read naively, the loader's streak puts him on the next challenge's floor 1.
6. **Sprites (your decision).** Brain team rows, set rows and an opened trainer's sets have a 32 px sprite, so the rows are taller (49 px against 38 px).
   - The Trainer Dex's `PartyStrip` is private, and `Trainerdex.tsx` must stay untouched. So `MonSprite` uses the same data-layer calls (`slotsFor` and `versionSpriteUrl` for `emerald`, `getSpriteUrl` as the fallback). Sprites are runtime-cached, never precached.
7. **Full lists.** All 882 sets, all 300 trainers, and all 100 of Vince's sets are shown. The mockup cut them at 30, 25 and 8 for the page.
8. **Noland's "50 on":** only the number is in mono (the design audit found "on" in mono in the mockup).
9. **No side padding on the page.** The mockup's frame padded its page by `--space-6`. In the app, the shell's panel already gives the gutter, so the page head lines up with the app bar.
10. **The dropdown's open entry uses the nav's own colour token** (`--text-primary`, legacy), so weight is the only difference from the other lines. Moving the nav to `dist` tokens is not done in a feature commit.
11. **The app bar has no region names.** The mockup's `app-bar`, `nav-tabs` and `nav-dropdown` belong to the existing shell, which has no `data-layout`. I did not add them; the shell is out of scope.

## Changes outside the module

- **`src/phoneShell.css`:** the bottom tab bar has 4 columns (was 3).
  - With 3, the fourth tab wrapped onto a second row. That row covered the bottom of every scroller on a phone, which reserves room for one row only.
  - `verify-mobile` now expects four tabs in one row.
  - The phone layout is otherwise parked and unchanged.
- **`scripts/verify-design-system.mjs`:** the expected tab list now includes Battle Frontier.
- **`design-system/`:** per its rule (a component's `.md` plus a CHANGELOG entry in the same commit):
  - CHANGELOG 2.1.23;
  - a link exception in `link.md` (your Q14 answer);
  - the Frontier dropdown in `nav.md`.
- **`scripts/lib/suiteMap.mjs`:** `battle-frontier/`, `navConfig`, `stubs/` and the frontier mockups route to `frontier-reference`.

## Assumptions

- **`streak` in the lookup's input** counts battles won, the way your log counts them: battle = streak + 1, so "streak 49" is battle 50. The Dome is also counted in battles, and is converted to tournaments only inside.
- **`initial` seeds the form once, when it mounts.** To open it on another log row, the tracker gives it a new React `key`.
- **IVs per trainer ID** (Trainers view) are read from the loader's own pools. The loader API has no direct call for them, and the loader may not change.
- **Search** matches a case-insensitive substring of the species name, a trainer class that draws the set, or the held item.

## Open items

- **Third tab or panel.** The lookup as a third tab is my call. Moving it under the lists, or onto its own entry, is a small change if you prefer.
- **Tracker branch.** Open the lookup through `SetsTrainers`' `lookup` prop, or a one-shot handoff. `format` is part of the input now.
- **Mockup generator.** `scripts/mockups/frontier.mjs` shares the Pyramid label issue (deviation 5). The mockups were not regenerated.
- **`check --all`** was not run. Run it before merging.

## Preview

**NOT published.** The push to the `preview` remote was denied in this session.

To publish it yourself:

1. Open a terminal in the repo folder.
2. Run `git push --force preview feature/frontier-reference:main`.
3. Wait for the Pages deploy in `hrezende423/pokeapp-preview` to finish (its Actions tab shows it).
4. Open https://hrezende423.github.io/pokeapp-preview/
5. In the account menu, set the generation to **3**. The default is 4, which shows the notice.
6. Open the **Battle Frontier** tab.
7. Add `?layout=1` to the URL, or press Ctrl+Shift+L, to see the region names.

**For the review**, name regions from `?layout=1`. Mark up all three screens in one batch.
