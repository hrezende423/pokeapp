# Result: Pyramid columns and Next floor at the top

2026-11-15. Replaces the previous result; history is in git.

**DONE.** Branch `feature/pyramid-columns` (from `main` at `0a75833`), committed, not pushed, not merged. `npm run check -- --since main` on `cebd89f`: **PASS** (typecheck, lint, build, verify:app, verify:frontier-data, verify:frontier-reference, verify:frontier-tracker 276/276, verify:infra).

Preview: not published.

## What changed (owner's request, from a screenshot)

- **No tabs.** Wild, Trainer and Item show at once, as three columns of equal width, in that order (the old tab order).
- **Aligned.** One grid with shared rows. The three headings (with their counts) share a row, and so do the three searches. Each list sits at the foot of its own column, under its own heading. While open, the category chooser spans all three columns.
- **Next floor at the top**, at the right of the floor's head ("Add to floor N · Round r · floor f of 7"). The note and Retire stay at the foot.
- The floor editor (Edit on a logged floor) uses the same three columns.

Screenshots: `docs/status/pyramid-columns/open-floor-dark.png` and `docs/status/pyramid-columns/layout-1440.png` (the latter with `?layout=1`).

## Assumptions

- **Column order is Wild · Trainer · Item**, the old tab order, with Wild (the most tapped) first. The floor log's rows and the "Trainers / wild / items" counts keep their order.
- **The trainer column puts Lost, Lost to another and More on the quick-picks row, above the trainer picker.** The picker sits on the searches' row, so all three searches line up, and its open list cannot cover Lost or More.
- **The More fields (For, Trainer, Set) now stack**, because a column is a third of the floor.
- **Quick picks shrink to at least two per row in a column**, so the searches and lists stay on screen at 1440 px.
- **The column headings have no icons.** The icons were the tabs' own.

## Effect on taps

The common floor takes **9 taps, not 10**: the category once, 3 species, 2 items, the trainer field, the trainer, and Next floor. With no tabs, the Item tap goes. The trainer field now takes one tap to open, where the Trainer tab used to open it. So `SpeciesPicker`'s `focusOnMount` is removed.

## Suite changes (`verify:frontier-tracker`, B12)

New checks:
- no tabs, with the headings in order;
- Next floor is in the head, above the columns;
- headings, searches and lists each on one row, with each list under its heading;
- two quick picks per row at 1440 px;
- Lost is flush with the trainer column;
- the reopened floor uses the same columns.

Updated: the tap count (9), and the region list (`pyramid-columns`, `pyramid-head-*` and `pyramid-trainer-search` added; `pyramid-strip`, `pyramid-modes` and `pyramid-entries` gone).

## Try it on the preview (once published)

1. Battle Frontier → Challenge Tracker → New run → facility Battle Pyramid → Start.
2. Check that the three columns show at once and that Next floor is at the top right.
3. Pick a category. The species buttons appear in the Wild column, and the searches and lists stay lined up.
4. Add a wild Pokémon, an item and a trainer, then tap Next floor at the top.
