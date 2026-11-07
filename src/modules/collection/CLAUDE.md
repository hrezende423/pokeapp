# Collection

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Collection v2 (2026-11-07)

Spec: `docs/SPEC.md`, slice C. Mockup: `public/mockups/collection-v2.html`.
Suite: `verify-collection` (port 4205); `verify-tools` §9 still drives the v1 flow.

- **The schema is in `team-builder/model.ts` (`CollectionEntry`), its rules in
  `collectionSchema.ts`.** The entries live in the Team Builder document
  (`pokeapp:team-builder:v1`), so they sync with it as one JSON row: no table,
  key or Supabase change.
- **Never gate migration on `schemaVersion`.** It is written as 2 and never read
  as a gate: an older client's `normalise` keeps only the top-level fields it
  knows, so a v2 document it writes back has lost it. `migrateEntry` runs on
  every read instead, and is idempotent (`normalise(normalise(x))` is
  `normalise(x)`).
- **Entry fields survive old clients.** The v1 `normalise` spread each entry, so
  the v2 fields ride through it untouched. Ours keeps unknown fields too, top
  level (`{...doc, ...known}`) and per entry, and `mergeDocs` starts from
  `{...device, ...cloud}` and ends through `normalise`. Never rebuild an entry
  from a list of known keys.
- **`migrateEntry` fills only what is absent** (and repairs shapes the screens
  index on: four move slots, `met`/`ot`/`acquired` merged over defaults, a valid
  Pokérus state, a ribbon array, `effort` when missing). It never rewrites a v1
  field.
- **`individual` is sparse on purpose: a missing IV/DV is UNKNOWN.** That is why a
  migrated v1 entry (no IVs) is never an Exact fit (`candidates.ts`). The Build
  side reads an unset value as 0, as the Build Form does.
- **`entryToBuild` is the one bridge.** The Damage calculator (`c:<entry id>`
  sets), Team Matchup (`battle/sources.entryToSpec`), Gen 2's derived gender and
  the candidate flags all go through it and then down the Build path. Do not
  write a second entry-to-battler conversion.
- **Gen 2 Special keys.** The entry stores ONE `special` Stat Exp (the keys #9
  reads, `spreadKeys(2).effort`); a Gen 2 Build keeps it under
  `special-attack`/`special-defense`. `entryToBuild` writes both, so
  `computeStat`, the calculator's `applyBuild`, `exactSpread` and #9 read the
  same number. The DVs stay four keys (`spreadStatKeys(2)`), Special unsplit.
- **The field table is `collectionFields(gen, game)`**, and the form renders
  exactly its fields, each wrapper `data-field="<name>"`. A field the era lacks
  is ABSENT, not disabled; Gen 2's gender and shininess are `derived` and show
  disabled at the value the DVs give. Met location and level are Gen 2 for
  Crystal only; met date Gen 4 only. Met location is free text: there is no
  per-game location list function to choose from.
- **The list follows the global selector.** The Collection is not a selector
  exception; another generation's entries are not rows (`collectionRows`).
  Team Matchup's Collection source offers only its game's generation, which is
  its own existing exception, not a fifth.
- **Search, filters and sorts are `collectionQuery.ts`**, wired in
  `DexQueryProvider` as list id `collection`; the page reads the bundle softly
  (every entry if the bar's query is momentarily another list's). Keep the
  test ids `verify-tools` drives: `col-species` (a native select), `col-nickname`,
  `col-effort-<key>`, `col-build`, `col-save`, `col-list`, `col-remaining-<id>`,
  and the "toward <label>" text.
- **`ribbons` is a reserved slot**: no UI and no logic, by the spec.
