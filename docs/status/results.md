# Results: Battle Frontier preview fixes (2026-11-23)

Three defects the owner found on the combined preview (`feature/frontier-brains-gen4` + `feature/frontier-pike-odds`).
Each fix is on the branch that owns it; the stacks were rebased and the local `preview-all` rebuilt. Nothing was pushed or merged.
The audit and proposed Notion statuses stay in `docs/status/frontier-audit.md` (row 1's wording updated).

## What changed

| Fix | Branch (PR) | Commit | Change |
|---|---|---|---|
| 1. No game tab for games without a Frontier | `feature/frontier-facility-reference` (#33) | `2d52747` | The game row offers Emerald and FireRed/LeafGreen in Gen 3, Platinum and HeartGold/SoulSilver in Gen 4. `NO_FRONTIER` and the RS/DP notices are gone. The §2b assertions are rewritten: the row lists, a fallback check, no `NO_FRONTIER` export. |
| 1 (follow-on) | `feature/frontier-speed` (#37) | in `6a9a6ea` | The dead RS/DP subjects in `speedNotice` and the RS speed-notice check are removed. |
| 1 (follow-on) | `feature/frontier-tracker-games` (#38) | `a92963c` | The tracker suite asserted the RS/DP notices; it now asserts the Gen 3 and Gen 4 rows. |
| 2. Trainer Hill & Tower sprites | `feature/frontier-speed` (#37) | `6a9a6ea` | `MonSprite` falls back to the same generation's static sprite (Emerald, then Ruby/Sapphire), never the animated artwork. The suite checks every `<img>` in every mode and floor. |
| 3. Tools "Battle Frontier" group | `feature/frontier-pike-odds` (#36) | `4f88888` | Test only: the group per generation (see the root cause). |

Rebased onto the fixes: S2 onto S1, S3 onto S2, S5 onto S3 (all clean). Local `preview-all` = S5 merged with S7.

## Root causes

1. **Game row.** `FRONTIER_TAB_GAMES` listed `ruby-sapphire` and `diamond-pearl` so they could show a "no Frontier" notice. A pick outside the row already falls back: `useGameInGeneration` honours only a pick the row offers, then `defaultGameOfGeneration` gives Emerald / HGSS. No new code was needed for that.
2. **Sprites.** FireRed/LeafGreen's sprite set covers #1–151 only. For the 58 non-Kanto Pokémon in the Tower, `MonSprite` fell back to the animated artwork (`getSpriteUrl`) without `hasGenderDifference`. The result: 58 animated sprites, and 18 of them broken, because a gendered species has no unsuffixed `{id}-front-n.webp`. Murkrow is the exception (its unsuffixed file exists). Examples: Politoed, Heracross, Houndoom, Sneasel, Quagsire. All 166 Emerald Hill Pokémon already loaded their static sprite. The fix keeps the existing path scheme (`versionSpriteUrl` with the variety's slot mask) and only changes which game it reads.
3. **Tools group.** The index is not at fault. The deployed preview (`d30c0b3`) draws "Battle Frontier" at desktop width: Gen 3 with all four tools open, Gen 4 with Rental open and the other three disabled with "Not in Gen 4: this exists in Gen 3." Neither of the brief's two hypotheses holds: the group is not hidden by the gate, and it is rendered. **Below 640 px (the phone shell), tapping Tools only opens its sheet** (`NavGroup`: `isPhone()` toggles the sheet instead of `onActivate`). The sheet lists Calculators … Breeding Planner, so on a phone the index, and with it every numbered tool, cannot be reached. The owner reviews the preview from a phone. Screenshot: `fix3-phone-tools-sheet-390-*.png`.

## Assumptions and decisions (logged, not asked)

1. Fix 2 changes the shared `MonSprite` (`parts.tsx`), not a copy for one page. The animated fallback is a broken image for any gendered species on any screen. Emerald, Platinum and HGSS sets cover every species those screens show, so their sprites do not change. The suites confirm it: Brains 36 Emerald sprites, Gen 4 Brains.
2. "Static only" is asserted as: no request to the sprites repo's WebP releases, no `.webp`/`.gif`, no `/animated/` path. Every `<img>` is switched to eager loading and awaited before reading `naturalWidth`.
3. Fix 3: no product change was made. A fix for the phone would mean either the Tools sheet gets an index entry, which changes the dropdown the owner kept "unchanged" (2026-10-15), or a tap on Tools opens the index on a phone, which touches the parked phone layout. Both are CLAUDE.md conflicts, so this is **for the owner**. The new assertions pin the desktop behaviour the brief expects.
4. S3 was touched (one test commit) but not gated separately. The S5 head contains it, and its gate runs every suite S3's would.

## Checks (`npm run check -- --since main`, all exit 0)

- S1 `feature/frontier-facility-reference`: typecheck, lint, build, app, frontier-data, frontier-reference 177/177, frontier-tracker 276/276, infra.
- S2 `feature/frontier-speed`: those plus dexes, ds, scroll-nav, store, tools 304/304 and ux; frontier-reference 228/228. Hill: 192 images, 0 broken, 0 animated. Tower: 378 images, 0 broken, 0 animated. Politoed, Heracross and Houndoom now load Emerald's static PNG.
- S5 `feature/frontier-brains-gen4` (contains S1–S3): all suites; frontier-reference 239/239, frontier-tracker 313/313 (with the new Gen 3/Gen 4 row checks).
- S7 `feature/frontier-pike-odds`: typecheck, lint, build, app, infra, tools 350/350, including the new group checks for Gen 3 and Gen 4.
- Browser look on the rebuilt combined branch: Gen 3 row "Emerald | FireRed / LeafGreen", Gen 4 row "Platinum | HeartGold / SoulSilver"; 0 broken or animated images on the Tower or the Hill.

Screenshots (light/dark, 1440 and 390 px): `docs/status/frontier-fixes/`.

## For the owner

- **Tools on a phone:** choose either (a) an "All tools" entry in the Tools sheet/dropdown, or (b) a tap on Tools opening the index on a phone. Both conflict with a standing decision (the dropdown stays unchanged; phone layout is parked), so neither was built.
- The rebased branches need a force-push to update PRs #33, #37, #38 and #39 (#36 gets a normal push). The preview repo needs the rebuilt `preview-all`. None of this was done, per the brief.
