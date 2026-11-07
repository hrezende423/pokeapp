# Build phase progress

Newest last. Spec: `docs/SPEC.md`. Work items: `docs/features.json`. Slice 1 log: `docs/status/SLICE1-2026-11-06.md`.

## Decisions

### Phase 1

- Decision: keep `key={i}` at `RentalTool.tsx:211` because `verify:tools` showed no duplicate keys, the condition the owner set. The suite picks two different sets, so choosing the same set twice stays unexercised.
- Decision: `scripts/_measure.mjs` went to `~/Downloads/pokeapp-archive-2026-11-06/` because that keeps it out of the repo without losing it.
- Decision: leave the two `493` checks at `verify-ux.mjs:682,687` because they still pass on what appears to be the Gen 4 scoped list; they are not the stale whole-dex ceiling.
- Decision: the species-card reference is measured from the rendered card (212 × 214, ghost height 84.5, line 136, types 156.2, ability 178.6) because the owner set 214 as the reference and no other source for those numbers exists.
- Decision: "the dex number and the name share one line" now asserts the number sits inside the name's line box, because it demanded equal top edges of two different type sizes, which the 214 reference does not have.
- Decision: zips leave out `node_modules` because it is restorable from `package-lock.json`; `.git` and uncommitted work are included.

### Phase 2 plan

- Decision: slices are stacked, `feature/team-transfer` on `tools/integration`, `fix/gender-gen1-2` on A, `feature/collection-v2` on B, because B and C share code with A and each PR then shows only its own diff.
- Decision: PRs target the branch beneath them, never `main`, because the brief forbids merging to `main` and the integration branch is not on `main` yet.
- Decision: the Build name is edited in the Build info modal because the Build Form is frozen and the modal changes no signed-off layout. The Build Library card shows it beside the id, truncated, so the card's height and width do not move.
- Decision: no rewrite of stored nicknames; a Build with no `name` falls back to its nickname, then its species. Because the Build Form cannot edit the name, a copied name would go stale when the nickname changes, and the fallback keeps every record as it was.
- Decision: import and export sit in modals and library heads because the docks on frozen cards stay as signed off.
- Decision: import lands in the app's generation because a generation picker in the dialog would be a fifth selector exception.
- Decision: illegal moves and impossible fields are dropped with a report line, not refused, because a paste from another tool should still produce a usable Build the reader can finish.
- Decision: Gen 1-2 text follows Showdown's convention (EV² to Stat Exp, 252 to 65535, IV ÷ 2 to DV) because pastes must work with the real tool. Partial Stat Exp is lossy, and the dialog says so.
- Decision: export writes no `===` header because Showdown's single-team box does not read one.
- Decision: Build comparison is two Builds, launched from the library's existing selection mode, because that adds no control to a frozen card.
- Decision: a differing row is marked with a strong left hairline because the design rules forbid accent, badge and fill for this.
- Decision: Gen 2 gender is computed at read time by `buildGender`, not stored, because the Attack DV can change at any time and stored values must not be rewritten. Rule taken from pokecrystal `GetGender`.
- Decision: Collection v2 also adds `moveIds`, `itemId`, `pokemonId` and `game`, beyond the listed fields, because a calculator input needs moves and an item, and Crystal-only met info needs the game.
- Decision: Gen 3 has no met date and Gen 4 does, because the Gen 3 data structure stores no date. Acquired date and method are the player's own record, so every generation has them.
- Decision: candidate flags are computed and shown as text because the design rule is no badges and the PRD says computed, not stored.
- Decision: the Collection list stays scoped to the generation selector because an all-generations view would be a fifth exception.
- Decision: mockups live in `public/mockups/` so they are reachable on the preview. Work does not wait on them, per the brief.
- Decision: the preview repo is updated at the end so the report's preview link shows this work, as CLAUDE.md's workflow step 5 asks. It is a separate site; production and `main` are untouched.
