# Build phase spec: Team transfer, gender fixes, Collection v2

Written 2026-11-06 from the owner's autonomous brief. Choices the brief left open are logged as "Decision: X because Y" in `docs/status/PROGRESS.md`. Work items and their pass state: `docs/features.json`.

## Goal

Get teams and Builds in and out as Showdown text, give Builds a real name, tags that search, and side-by-side comparison. Correct gender for Gen 1-2. Grow the Collection into a real record of owned Pokémon that the Damage calculator and Team Matchup can use as input.

## Out of scope (whole phase)

- Notion and the PRD: the owner is reworking them separately.
- Training, Ribbons, Journal, Nuzlocke, Achievements, Glossary, Progression Guide. No code, UI or stubs. Collection v2 only reserves the ribbon slot it was asked for.
- Phone layout, `src/design-tokens.css` migration, Gen 5+ game data.
- Merging to `main` and production deploys.
- Team Display, Team Library card, Coverage panel: frozen, not changed.

## Rules that shaped this

| Rule | Consequence |
|---|---|
| Frozen Build Form, Build Library card, Team Display | The Build name is edited in the Build info modal. Import and export live in modals and library heads. Only the gender change touches the Build Form, because the brief asks for it by name |
| Four selector exceptions, no fifth | Import lands in the app's generation. Collection stays scoped to the selector |
| Per-generation accuracy | One rule table per slice, below, asserted in a suite |
| No badges, no hover backgrounds, tokens only | "Fits" flags are text. New CSS uses `dist/tokens.css` names where they exist |
| One feature per branch | `feature/team-transfer`, `fix/gender-gen1-2`, `feature/collection-v2`, stacked in that order on `tools/integration` |

---

## Slice A: Team transfer

Branch `feature/team-transfer`. Mockup: `public/mockups/team-transfer.html`.

### Files and interfaces

- `src/modules/team-builder/model.ts`: `Build.name?: string`, `BUILD_NAME_MAX = 40`.
- `src/modules/team-builder/buildFacts.ts`: `buildLabel(build, species)`, name, then nickname, then species.
- `src/modules/team-builder/showdown.ts` (new, pure): `formatBuild`, `formatTeam`, `parseShowdown`.
- `src/modules/team-builder/showdownImport.ts` (new): resolves parsed text against the data layer into `Build` values plus a report.
- `src/modules/team-builder/ui/TransferModal.tsx` (new): export and import dialogs.
- `src/modules/team-builder/CompareBuilds.tsx` (new): the comparison screen, plus `tbNav.ts` and `TeamBuilding.tsx` wiring.
- `src/modules/team-builder/BuildLibrary.tsx`, `MyTeams.tsx`, `TeamViewer.tsx`, `ui/BulkSelect.tsx`: entry points.
- `src/modules/team-builder/libraryQuery.ts`: search name and tags, a Tag filter.
- `scripts/verify-team-transfer.mjs` (new suite), `scripts/check.mjs` routing.

### Showdown rules by generation

| Field | Gen 1 | Gen 2 | Gen 3-4 |
|---|---|---|---|
| Gender `(M)`/`(F)` | Never written, ignored | Written from the Build; on import, the slice B derivation decides | Written; validated against the species |
| Item `@` | Never written, dropped with a note | Yes | Yes |
| Ability | Never written, dropped | Never written, dropped | Yes, from the species' abilities in that generation; hidden abilities never accepted (they do not exist before Gen 5) |
| Nature | Never written, dropped | Never written, dropped | Yes |
| Shiny | Never written, dropped | Written when the DVs are shiny; on import, DVs decide | Yes |
| Happiness | Never written, dropped | Written unless 255 | Written unless 255 |
| EVs line | From Stat Exp | From Stat Exp | EVs as stored |
| IVs line | From DVs | From DVs | IVs as stored |

Gen 1-2 conversion, Showdown's own convention, so pastes work both ways:

- Export EV = `floor(min(ceil(sqrt(StatExp)), 255) / 4) × 4`, which gives 252 for 65535.
- Import Stat Exp = EV², except EV 252, which becomes 65535. No EVs line in Gen 1-2 means maximum, as Showdown treats it.
- Export IV = DV × 2, with DV 15 left out as the default. Import DV = `floor(IV / 2)`. HP is never read: its DV is derived.
- Special: `SpA` carries it. Gen 1-2 import reads `SpA` or `Spc`; a differing `SpD` is noted and ignored.
- The dialog says that a partial Stat Exp rounds to Showdown's steps.

Other parsing:

- Species and forms match on a normalised id, so `Nidoran-F`, `Mr. Mime`, `Farfetch'd`, `Deoxys-Attack`, `Rotom-Wash` resolve.
- A species outside the generation rejects that Pokémon, with a line in the report.
- A move the species cannot learn in that generation leaves the slot empty, with a note. `Hidden Power [Ice]` and `Hidden Power Ice` both resolve to Hidden Power.
- Missing `Level` is 100 and missing `Happiness` is 255, as in Showdown.
- An EV above 252 is clamped with a note. A total over 510 is kept and noted; the Build Form already shows it as over.
- `=== [gen4ou] Name ===` headers are read as the team name. Only the first team is imported; a Pokémon past the sixth, or a further team, is noted.
- A pasted single-Build import takes the first block and notes the rest.
- Import never overwrites: it always creates new Builds and, for a team, a new team in the app's generation, carrying the imported name.
- Export has no `===` header, because Showdown's single-team box does not read one.

### Done when

- [ ] A Gen 4 team exports to text that `parseShowdown` reads back to the same species, level, nature, ability, item, moves, EVs and IVs.
- [ ] Gen 1 and Gen 2 Builds export with no ability, nature or (Gen 1) item, gender or shiny line.
- [ ] 65535 Stat Exp exports as 252 and returns as 65535; DV 14 exports as IV 28 and returns as 14.
- [ ] A pasted Gen 4 set imported on a Gen 2 selection drops ability and nature and reports each drop.
- [ ] A hidden ability, an illegal move, and a species outside the generation each produce a report line, and nothing crashes.
- [ ] Import creates a new team and new Builds, reachable in the libraries, and leaves existing records untouched.
- [ ] A Build's name saves, labels its library card, and appears in the Damage calculator's set list and the Collection's target list. A document without `name` reads unchanged and keeps every nickname.
- [ ] Library search finds a Build by name and by tag, and the Tag filter narrows the list.
- [ ] Selecting exactly two Builds offers Compare; the screen shows both, with differing rows marked, and a Build of another generation hides fields that generation lacks.
- [ ] `verify:team-builder` still passes.

### Not doing

- Editing the name on the Build Form (frozen).
- Pokémon Showdown's packed format, or URL sharing.
- Comparing three or more Builds, or two teams.
- Updating an existing Build from text.
- A generation picker in the import dialog.

---

## Slice B: Gender fixes

Branch `fix/gender-gen1-2`, on top of slice A. The brief names this change to the frozen Build Form.

### Rules

- Gen 1: no gender anywhere. `buildGender` returns null. Stored values are left alone.
- Gen 2, from pokecrystal `GetGender`: `(AttackDV << 4 | SpeedDV) > ratio` is male, and the ratio's low nibble is F, so only the Attack DV decides.

| `gender_rate` (eighths female) | pokecrystal constant | Female when Attack DV |
|---|---|---|
| 0 | `GENDER_F0` | never |
| 1 | `GENDER_F12_5` (31) | ≤ 1 |
| 2 | `GENDER_F25` (63) | ≤ 3 |
| 4 | `GENDER_F50` (127) | ≤ 7 |
| 6 | `GENDER_F75` (191) | ≤ 11 |
| 8 | `GENDER_F100` | always |
| -1 | `GENDER_UNKNOWN` | genderless |

- Gen 3+: unchanged.

### Files and interfaces

- `src/modules/team-builder/statMath.ts`: `gen2GenderFromAttackDv(attackDv, genderRate)`, pure.
- `src/modules/team-builder/buildFacts.ts`: `buildGender(build, species)`, the one reader.
- `src/modules/team-builder/BuildForm.tsx`: hidden in Gen 1; in Gen 2 the field shows the derived value, disabled, the shape a forced gender already takes.
- Consumers move to `buildGender`: `ui/MemberCard.tsx`, `src/modules/battle/sources.ts`, `src/modules/calculators/damageSets.ts`, `showdown.ts`.

### Done when

- [ ] A Gen 1 Build shows no gender field, card glyph or export `(M)`, even if one was stored.
- [ ] For each `gender_rate`, Attack DVs either side of the threshold give the table's answer.
- [ ] Changing the Attack DV in a Gen 2 Build changes the shown gender.
- [ ] A Gen 3 Build still sets gender by hand.
- [ ] Team Display geometry unchanged: `verify:team-builder` passes.

### Not doing

- Rewriting stored `gender` values.
- Gender for Gen 2 Trainer Dex or calculators' typed-in Pokémon.

---

## Slice C: Collection v2

Branch `feature/collection-v2`, on top of slice B. Mockup: `public/mockups/collection-v2.html`.

### Schema

```ts
interface CollectionEntry {            // v1 fields stay exactly as they are
  id; seq; generation; speciesId; nickname; level; natureId; effort; buildId
  // v2
  pokemonId: number | null             // the variety; null = species default
  game: string | null                  // version group it lives in
  gender: Gender | null
  shiny: boolean
  abilityId: number | null
  individual: StatNumbers              // IVs, or DVs in Gen 1-2
  itemId: number | null
  moveIds: (number | null)[]           // always 4 long
  met: { location: string; level: number | null; date: string | null }
  ot: { name: string; id: string; language: string | null }
  acquired: { date: string | null; method: AcquireMethod | null }
  pokerus: 'none' | 'infected' | 'cured'
  ribbons: string[]                    // reserved slot, no UI
}
```

- `TeamBuilderData.schemaVersion?: number`, written as 2.
- `migrateEntry(raw)` in `src/modules/collection/collectionSchema.ts` is pure, idempotent, and never drops or rewrites a v1 field. `normalise` runs it on read.
- localStorage key stays `pokeapp:team-builder:v1`. Sync stays one JSON document: no table change. `normalise` and `mergeDocs` keep unknown fields, so an older client that writes the document back loses nothing.

### Per-generation fields

| Field | Gen 1 | Gen 2 | Gen 3 | Gen 4 |
|---|---|---|---|---|
| Gender | hidden | derived | stored | stored |
| Shiny | hidden | derived from DVs | stored | stored |
| Ability, nature | hidden | hidden | stored | stored |
| Item | hidden | stored | stored | stored |
| IVs/DVs | DVs | DVs | IVs | IVs |
| Effort | Stat Exp | Stat Exp | EVs | EVs |
| Met location, level | hidden | Crystal only | stored | stored |
| Met date | hidden | hidden | hidden | stored |
| OT name, ID | stored | stored | stored | stored |
| OT language | hidden | hidden | stored | stored |
| Pokérus | hidden | stored | stored | stored |
| Acquired date, method | stored | stored | stored | stored |

Acquired is the player's own record, so every generation has it.

### Candidate flags

Computed, never stored, same generation only, in `src/modules/collection/candidates.ts`.

- **Fits**: same species, and gender, nature and ability match where the Build sets them and the generation has them. A Build field left empty matches anything.
- **Exact**: Fits, plus every editable IV or DV equal.
- Shown as text on the entry, with the Build's label. A Filter narrows to entries that fit any Build.

### Inputs elsewhere

- `entryToBuild(entry)` in `collectionSchema.ts` is the one bridge. Everything downstream reuses Build paths.
- Damage calculator: entries of the generation join the set list under their own source.
- Team Matchup: "My team" gains a Source choice, Team or Collection; Collection picks up to six entries of the generation.
- `collectionId` on the Matchup run link is filled when the source is Collection.

### Files and interfaces

- `src/modules/team-builder/model.ts`, `store.ts`, `src/sync/teamSync.ts`.
- `src/modules/collection/collectionSchema.ts`, `candidates.ts`, `collectionQuery.ts` (new); `CollectionPage.tsx`, `collectionMath.ts`.
- `src/modules/dex/query/DexQueryProvider.tsx`: Collection joins the Search/Filter menu.
- `src/modules/calculators/damageSets.ts`; `src/modules/team-matchup/SetupTab.tsx`, `resolve.ts`, `model.ts`.
- `scripts/verify-collection.mjs` (new suite), `scripts/check.mjs`.

### Done when

- [ ] A v1 document loads with every entry field intact, gains defaults, and `normalise(normalise(x))` equals `normalise(x)`.
- [ ] `mergeDocs` of a v1 and a v2 document keeps both sets and re-points `buildId`.
- [ ] An older client's write-back keeps v2 fields (unknown fields survive `normalise`).
- [ ] Each generation shows exactly its row of the field table.
- [ ] Search by nickname, species and OT works, and filters narrow by method, Pokérus, shiny and Fits.
- [ ] Fits and Exact answer correctly for match, mismatch, and a Build with empty fields.
- [ ] A Collection entry fills a Damage calculator side with its stats, moves, item and ability.
- [ ] Team Matchup runs a team picked from the Collection, and a mismatched generation cannot be picked.
- [ ] #9 EV remaining still works from a v2 entry.

### Not doing

- Any ribbon UI, or logic behind the slot.
- Trade history, boxes, friendship, PP, form-specific art, screenshots.
- Save-file import, legality warnings.
- Showing other generations' entries: the list follows the selector.

---

## Verification

Each slice, on its branch:

```
npm run check -- --since <base> team-builder
```

plus the slice's new suite, and a browser look with screenshots in `scripts/.verify-shots/`. The end-to-end proof for A is exporting a team, importing it on a fresh profile, and comparing. For C it is a v1 localStorage document loaded into the app, then used in the Damage calculator.
