# Data layer (generated)

Everything in this directory is **generated output** — do not hand-edit. Regenerate with:

```
npm run build:data              # reuses the cached snapshot
npm run build:data -- --force-download   # re-fetch the upstream snapshot
```

Source: [PokeAPI/api-data](https://github.com/PokeAPI/api-data), downloaded once as a
tarball into `.cache/` (gitignored). The live PokeAPI REST service is never called at
build time. `meta.json` records the snapshot hash, the exact scope, and all counts.

## Scope

National dex **1–493** (Gen 1–4, Bulbasaur through Arceus) across 14 version groups:

`red-green-japan`, `blue-japan`, `red-blue`, `yellow`, `gold-silver`, `crystal`,
`ruby-sapphire`, `emerald`, `firered-leafgreen`, `colosseum`, `xd`, `diamond-pearl`,
`platinum`, `heartgold-soulsilver`

Anything not reachable from a Gen 1–4 species or a Gen 1–4 version group is excluded.

## Invariants

These are enforced by the build; it exits non-zero if any is violated.

1. **Normalized.** Entities reference each other by integer id. Nothing is embedded.
2. **Zero dangling references.** Every `*_id` resolves to an entry in its own file
   (807,135 references checked at time of writing).
3. **No reverse indices.** `learned_by_pokemon`, `type.pokemon`, `ability.pokemon` and
   `egg_group.pokemon_species` are omitted — derivable from forward refs, and they
   would dominate the bundle size.
4. **Deterministic.** Object keys are sorted, so rebuilding from the same snapshot
   produces byte-identical files.

## Files

| File                    | Shape                        | Contents                                             |
| ----------------------- | ---------------------------- | ---------------------------------------------------- |
| `species.json`          | `{ [id]: Species }`          | 493 species, each with its in-scope `varieties` (forms) |
| `moves.json`            | `{ [id]: Move }`             | 485 moves                                            |
| `items.json`            | `{ [id]: Item }`             | 563 items                                            |
| `abilities.json`        | `{ [id]: Ability }`          | 161 abilities                                        |
| `natures.json`          | `{ [id]: Nature }`           | 25 natures                                           |
| `berries.json`          | `{ [id]: Berry }`            | 64 berries                                           |
| `types.json`            | `{ [id]: Type }`             | 20 types, with per-generation damage relations       |
| `egg-groups.json`       | `{ [id]: EggGroup }`         | 15 egg groups                                        |
| `evolution-chains.json` | `{ [id]: EvolutionChain }`   | 246 chains, pruned to in-scope species and methods   |
| `learnsets.json`        | `LearnRow[]`                 | 202,707 rows                                         |
| `encounters.json`       | `EncounterRow[]`             | 47,790 rows                                          |
| `locations.json`        | `{ locations, areas }`       | 315 locations / 609 areas referenced by encounters   |
| `version-groups.json`   | `{ [id]: VersionGroup }`     | the 14 in-scope version groups                       |
| `meta.json`             | build manifest               | source hash, scope, counts, file sizes               |

`LearnRow` is `{ species_id, pokemon_id, move_id, version_group, method, level, order }`.
`EncounterRow` is `{ species_id, pokemon_id, location_id, location_area_id, version,
method, chance, level_min, level_max, conditions }`.

`pokemon_id` appears alongside `species_id` because a species can have several
battle-relevant forms (Deoxys, Rotom, Giratina, Shaymin). Keying only on `species_id`
would collapse form-specific movesets into one.

## Generation accuracy

Current-gen PokeAPI data is wrong for the Gen 1–4 era in several ways. The bundle
preserves the historical values rather than flattening them:

- **`types[].damage_relations_by_generation`** — resolved matchups for gens 1–4.
  PokeAPI's `past_damage_relations[].generation` means "applied up to and including
  that generation", so the build picks the earliest past entry whose generation is
  `>= target`, else falls back to current. Crucially, each list is then filtered to
  types that *existed* in that generation — types with no past entry (Normal, Water)
  otherwise fall through to current relations that mention Steel/Dark/Fairy. Raw
  `past_damage_relations` is kept alongside.
- **`varieties[].past_types`** — Clefairy is Fairy in current data, Normal in Gen 1–4.
- **`varieties[].past_stats`** — Gen 1's single combined Special stat.
- **`varieties[].past_abilities`** — a `null` `ability_id` is meaningful: the slot was
  empty in that generation.
- **`moves[].past_values`** — kept verbatim. PokeAPI keys these by version group with
  ambiguous semantics, so the build deliberately does not invent a resolution rule.

Two entries are deliberately out-of-era but retained, because dropping them would
dangle a reference from current-gen species/move data. Both are flagged by
`generation_id`, and neither appears in any gen 1–4 relation block:

- **Fairy** (type 18, `generation_id: 6`) — referenced by `varieties[].types`.
- **38 of the 161 abilities** have `generation_id > 4` — abilities granted to Gen 1–4
  species only in Gen 5+ games. Use `past_abilities` for era-correct ability slots.

`types.json` also contains PokeAPI's two pseudo-types, `unknown` (10001, the `???`
type) and `shadow` (10002, Colosseum/XD). Both are `generation_id <= 4` and Colosseum
and XD are in scope, so they are kept.

## Size

34.28 MiB raw, **1.40 MiB gzipped** — the row-oriented files are highly repetitive.
`learnsets.json` (24 MiB raw / 803 KiB gz) and `encounters.json` (8.3 MiB raw / 248 KiB
gz) are the bulk. They are not currently copied into `dist/` or precached by the
service worker; whichever module consumes them should split or index them per version
group rather than shipping the whole array to the client.
