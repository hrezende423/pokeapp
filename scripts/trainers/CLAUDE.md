# Trainer Dex bundle

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Trainer Dex (Poképedia) and its bundle

Owner's decisions (2026-09-26): **sources** = pret disassemblies for parties +
Bulbapedia for placement; **games** = all ten Gen 1–4 main-series version
groups at once; **scope** = everything, battle facilities included;
**deliverable** = database and screen. Colosseum, XD and the Japanese
Red/Green/Blue have no disassembly and no file (`hasTrainerData`).

- **Build:** `npm run build:trainers` (`scripts/build-trainers.mjs` +
  `scripts/trainers/`). Writes `public/data/trainers/<vg>.json`, an on-demand
  partition like learnsets (`PARTITION_DIRS`, `src/data/trainers.ts`). The ten
  disassemblies are sparse-cloned at **pinned SHAs** (`trainers/sources.mjs`);
  Bulbapedia wikitext is cached in `.cache/trainers/bulbapedia/`
  (`--refresh-wiki` refetches). Offline rebuilds need no network.
- **What the disassembly decides:** species, levels, moves, items, IVs/DVs, AI,
  bag items, prize money, facility pools. Derived values are TRANSCRIPTIONS of
  the game routines, each named in `trainers/mechanics.mjs` / `complete.mjs`:
  level-up default moves (from the disassembly's own learnset order, never
  PokeAPI's, whose same-level ties are sorted by id); Gen 1's LoneMoves /
  TeamMoves / Champion moves and Yellow's SpecialTrainerMoves; Gen 3 personality
  (running name hash over the charmap, never reset between party members); Gen 4
  personality (LCRNG seeded by IV scale + level + species + trainer id, stepped
  class-index times; HGSS's gender/ability override leaks into later party
  members — reproduced); nature, ability SLOT and gender from it; Gen 2 gender
  from the Attack DV. Gen 4 IVs go through the game's u8 — Platinum Volkner's
  Electivire (`ivScale 2500`) is `iv_random`, as in the game.
- **What Bulbapedia decides:** where and in what order. Walkthrough parts first
  (play order), location pages second (`placeFromLocationPages`, only for
  still-unplaced trainers, only under a "Trainers" heading for that game),
  rematches inherit their original's place. The join key is the PARTY (species +
  level, in order); the name breaks ties; a rival (player-named, placeholder in
  the data: Cedric, ?, Terry) may differ; one trainer is one person (a sighting
  cannot claim a trainer already placed under another wiki name).
- **The wiki is a witness, not a source of truth.** `checks` in each file counts
  agreement on prize, gender and boss movesets; `verify:trainers` holds floors.
  The disagreements examined were wiki errors (Karate Master's Mega Kick,
  Platinum prizes copied from DP, Kadabra shown female for a female trainer) —
  **the disassembly wins**, don't "fix" the build toward the wiki.
- **Facilities:** Crystal Battle Tower, RS Battle Tower, Emerald Frontier (+ 3
  Tents + Trainer Hill + Brains from `frontier_util.c`), FRLG Trainer Tower, DP
  Battle Tower (raw NARC members, names from message bank 16; Platinum revised
  the pool — only 14/950 sets survive), Platinum Frontier (JSON). **HGSS's pool
  is Platinum's** (not extracted in its disassembly; Bulbapedia documents one
  shared list and 350/350 of its rows match) — marked `source_note`. **Gen 4
  Frontier Brains come from Bulbapedia** (the games keep them in code), marked
  `source: 'bulbapedia'`; Thorton and Argenta have no fixed team.
- **Unplaced ≠ unused.** `unused` is only a provable placeholder (DUMMY slots,
  DP's Mickey/Angelica Rattata, FRLG's RS leftovers, Gen 1 "Unused" lines).
  Other unplaced trainers (Gen 2's leftover Beauties/Cooltrainers, some HGSS)
  stay in the list with "Location not found".
- **Attribution:** Bulbapedia content is CC BY-NC-SA; the detail page credits
  it. The User-Agent and 1.2 s delay are the same courtesy as the supplement.

