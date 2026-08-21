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
| `locations.json`        | `{ locations, areas }`       | 315 locations / 609 areas referenced by encounters   |
| `version-groups.json`   | `{ [id]: VersionGroup }`     | index of the 14 version groups + partition paths     |
| `meta.json`             | build manifest               | source hash, scope, counts, raw + gzip file sizes    |
| `learnsets/<vg>.json`   | `LearnRow[]`                 | 14 files, 202,707 rows total                         |
| `encounters/<vg>.json`  | `EncounterRow[]`             | 14 files, 47,790 rows total                          |

`LearnRow` is `{ species_id, pokemon_id, move_id, version_group, method, level, order }`.
`EncounterRow` is `{ species_id, pokemon_id, location_id, location_area_id, version,
version_group, method, chance, level_min, level_max, conditions }`.

`pokemon_id` appears alongside `species_id` because a species can have several
battle-relevant forms (Deoxys, Rotom, Giratina, Shaymin). Keying only on `species_id`
would collapse form-specific movesets into one.

## Partitioned files

`learnsets` and `encounters` dwarf everything else and no screen needs more than one
game at a time, so they are split **one file per version group** — 14 each, including
empty-but-present files so the index never points at a missing path. Every other file
stays a single eagerly-loaded document.

Rows keep their `version_group` field, so each partition is self-describing and the
split is verifiable by inspection. Encounters carry both `version` (the specific game,
e.g. `heartgold`) and `version_group` (the file it lives in, e.g.
`heartgold-soulsilver`).

`version-groups.json` is the index a runtime loader reads to discover what exists and
what it costs before fetching:

```json
{
  "8": {
    "id": 8,
    "name": "diamond-pearl",
    "generation_id": 4,
    "order": 12,
    "versions": ["diamond", "pearl"],
    "learnsets_path": "learnsets/diamond-pearl.json",
    "encounters_path": "encounters/diamond-pearl.json",
    "learnset_rows": 26301,
    "encounter_rows": 8776
  }
}
```

Paths are relative to this directory. The loader itself is not built yet.

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

35.77 MiB raw, **1.41 MiB gzipped** in total, but the total is no longer the number
that matters — nothing needs to load all of it. The eagerly-loaded files are 2.70 MiB
raw / 388 KiB gz combined, and a single version group adds:

| Version group          | Gen | learnsets + encounters (raw) | gzip     |
| ---------------------- | --- | ---------------------------- | -------- |
| `blue-japan`           | 1   | 481.5 KiB                    | 16.4 KiB |
| `yellow`               | 1   | 633.1 KiB                    | 22.6 KiB |
| `red-blue`             | 1   | 809.6 KiB                    | 26.9 KiB |
| `red-green-japan`      | 1   | 857.3 KiB                    | 26.4 KiB |
| `crystal`              | 2   | 1694.7 KiB                   | 55.2 KiB |
| `gold-silver`          | 2   | 2200.1 KiB                   | 63.7 KiB |
| `colosseum`            | 3   | 1530.5 KiB                   | 53.3 KiB |
| `xd`                   | 3   | 1740.0 KiB                   | 65.2 KiB |
| `ruby-sapphire`        | 3   | 2283.0 KiB                   | 72.1 KiB |
| `emerald`              | 3   | 2515.7 KiB                   | 86.5 KiB |
| `firered-leafgreen`    | 3   | 2899.1 KiB                   | 89.0 KiB |
| `platinum`             | 4   | 4415.1 KiB                   | 146.0 KiB |
| `diamond-pearl`        | 4   | 4967.2 KiB                   | 144.7 KiB |
| `heartgold-soulsilver` | 4   | 6834.8 KiB                   | 191.7 KiB |

Worst case is HeartGold/SoulSilver at 192 KiB gzipped. `data/` is still not copied
into `dist/` or precached by the service worker.
