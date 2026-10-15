# Data layer and sprites

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Sprites

- Sprites: GitHub Release assets in `hrezende423/pokeapp-sprites`,
  runtime-cached, NOT precached (648MB total, too large to bundle).
  `species-background-colors.json` lives in the same repo, fetched at
  runtime — applies ONLY to the species detail page's artwork panel,
  never the grid or any other screen.
- **PokéAPI serves the Gen 1–2 sprites on an opaque WHITE background**, and
  it is inconsistent about what it also serves transparently. 2,110 of those
  slots have a `transparent/` counterpart upstream and are simply not
  rendered; 2,110 have none (both gray slots on red-blue/yellow,
  front_shiny/back_default/back_shiny on gold/silver) and are keyed to
  transparency by us, hosted at
  `pokeapp-sprites/transparent/{game}/{slot}/{id}.png`. The keying is a
  **border flood fill, never a global colour key** — these sprites use the
  same `#ffffff` for eyes and teeth as for the background. `npm run
  audit:white-sprites` re-derives the table; the pixel proof is in
  verify-species-page section N, which decodes every Gen 1–2 tile in a canvas.
- **Two animated sets live in that repo, under separate release tags.**
  `gen1`…`gen4` are the high-resolution animated WebP artwork (1,174 files).
  `bw-gen1`…`bw-gen4` are PokéAPI's Black/White animated GIFs converted to
  animated WebP (2,340 files, `{iii}-bw-{front|back}-{n|s}[-f].webp`) — the
  ONLY animated sprites the API has, and Gen 5 art of Gen 1–4 species, so
  the section showing them names the game. Which of the eight slots exists
  per species is an 8-bit mask in `src/data/animatedSprites.ts`;
  `npm run audit:bw-sprites` cross-checks upstream, the mask and the
  releases, because a mask entry with no asset is a broken image.
- **Sprite slot encoding**: 14 real slot variants exist across Gen 1–4
  (16,204 tiles for 493 species), stored as a per-game bitmask rather
  than a name array purely for install payload — 98 KiB against 638 KiB
  on the eagerly precached `species.json`. Eager and NOT lazy-fetched on
  purpose: the app is offline-first, and a lazy file would leave the
  Sprites tab broken until someone opened it online first.

## Era resolution

- **PokéAPI's `past_` arrays are incomplete, so era rules can't be left
  to the data alone.** Two cases fixed in `src/data/era.ts`: 17 species
  have no `past_abilities` entry emptying their hidden slot (Koffing
  advertised Stench in HGSS), and 20 have a Gen 1 `special` entry *plus* a
  later entry on a physical stat, so stats must resolve per stat rather
  than per entry (Beedrill's Gen 1 Attack is 80, not the modern 90).
  Where a mechanic's start generation is a known fact, encode it as a rule.
- **Moves are read as they were in the selected generation** — FIXED
  2026-10-10. `moveForGeneration` (`src/data/moveEra.ts`) resolves type,
  power, accuracy, PP and effect chance from `past_values`, plus the pre-Gen-4
  rule that a damaging move's category is its type's (Fire Punch is special
  in Gen 3). `moveEntries` returns those copies, so the Movedex table, detail
  and filters agree; the Learnset tab resolves by its own scope's generation.
  Charm is Normal through Gen 5; Curse is ??? in Gen 2–4. Still raw: ability
  and item effect TEXT (`effect_changes` is prose, not values).

## Japanese names

- **Japanese species names**: PokéAPI's `ja-roma` gives the real,
  official Nintendo romanization, NOT a mechanical transliteration —
  ゲンガー is "Gangar", not "gengaa"; ラッキー is "Lucky", not
  "rakkii". Never use a kana-to-romaji library for this (wanakana was
  considered and rejected); `ja-roma` already carries the correct
  trademark name for all 493 species in Gen 1–4 scope. Language codes
  are lowercase: `ja-hrkt`, not `ja-Hrkt` — the documented casing
  silently returns null rather than erroring.
