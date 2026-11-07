# Entity links

Every rule in the root `CLAUDE.md` still applies here.

## What it is

A typed pointer (`EntityRef`) at anything a later module links to, its stable
string form, and four operations. Suite: `npm run verify:entities`
(`scripts/verify-entities.mjs`, browser-free).

| Kind | String form | `deepLink` |
|---|---|---|
| species | `species:25` | `{ page: 'pokedex', entry: 25 }` |
| move | `move:85` | `{ page: 'movedex', entry: 85 }` |
| item | `item:1` | `{ page: 'itemdex', entry: 1 }` |
| ability | `ability:65` | `{ page: 'abilitydex', entry: 65 }` |
| collectionEntry | `collectionEntry:c12` | `{ page: 'collection', entry: null }` |
| trainer | `trainer:platinum/TRAINER_CHAMPION_CYNTHIA` | `{ page: 'trainerdex', entry: null }` |
| route (location area) | `route:1` | null |
| game (version group) | `game:platinum` | null |
| playthrough (reserved) | `playthrough:<id>` | null |

## Rules

- **Store the string, not the object.** `formatRef` throws on a ref with no
  canonical form; `parseRef` returns null for anything non-canonical
  (`species:025`, `Species:25`). Round trip is asserted per kind.
- **`ref.ts` and `engine.ts` stay pure**: type-only imports, every lookup
  through the injected `EntityContext`. That is what lets the suite run them in
  Node. Anything that touches the data layer or a store goes in `appContext.ts`.
- **Generation scoping reuses the dex lists.** `appContext` resolves species,
  moves, items and abilities with a generation through `entrySources.ts`, never a
  raw bundle query (the root rule). A Collection entry resolves only in its own
  generation; a game only in its generation's list; a trainer only when its
  partition is loaded and in that generation. Locations have no scoped list.
- **Deep links are navHistory's `NavLocation`**, applied with `followLink`
  (`nav.navigate` with an entry, `nav.setModule` without). Collection and Trainer
  Dex links are page-only: the nav holds neither entry. A Trainer Dex row id is
  an index within the game its own game row shows, so an entry without the game
  would open the wrong trainer. Making those exact is a nav change, not a change
  here.
- **`playthrough` resolves to null until its module registers a resolver** in
  the context. A new kind: add it to `ENTITY_KINDS` and the union, its string
  rule, `fallbackLabel`, `deepLink`, and a sample in every suite section.
- `whatLinksHere` dedupes owners (string or ref, structural) and skips an owner
  that is the target itself.
