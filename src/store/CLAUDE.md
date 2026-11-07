# Document store

Rules for `documentStore.ts` and `backupFile.ts`; the root `CLAUDE.md` still applies.
Suite: `npm run verify:store` (browser-free).

## Defining a document

```ts
export const notesDocument = defineDocument<NotesDoc>({
  name: 'notes',               // stable id: export key and sync row name. Never rename.
  key: 'pokeapp:notes:v1',     // localStorage key. Never change it either.
  version: 2,
  migrations: { 1: v1ToV2 },   // every step from 1 to version - 1
  empty: EMPTY_NOTES,
  normalise,                   // optional: any stored doc at `version` -> current shape
  merge,                       // optional: (base, added) for import merge and first sync
  sync: true,                  // optional, default false: mirror to the account
})
```

The handle: `read`, `write`, `update`, `subscribe`, `onLocalWrite`, `useDocument`
(hook), `replace` (the sync's: no `onLocalWrite`), `status()`, `reset()` (test seam).
Define it once at module scope; `listDocuments()` is the registry.

- **localStorage is primary.** Every access is wrapped; absent or corrupt reads as `empty`.
- **Reading never writes.** Migration happens in memory on every read; it
  reaches storage only with the next write.
- **The version** is read by `versionOf` (default: the `schemaVersion` field;
  absent = 1). With the default, the store stamps `schemaVersion` on what it reads.

## Migrations

- **Forward-only.** `migrations[n]` takes a vn document to v(n+1). There are no
  down-migrations: a document NEWER than `version` runs none, keeps its version,
  and is flagged (`status().newer`). An import of a newer one is refused.
- **Pure.** No storage, no clock, no data-layer reads; keep unknown fields
  (`{ ...doc, ...changes }`), so an older client's round trip loses nothing.
- **Tested.** Each new step gets a fixture of the old shape in `verify-store`,
  asserted with literal expected values.
- **The Team Builder is the exception that proves it.** Its v1 -> v2 is in
  `normalise`, which runs on every read and is never gated on `schemaVersion`
  (see `collection/CLAUDE.md`), so its `migrations[1]` is the identity. Its key
  `pokeapp:team-builder:v1` and its shape do not change.

## Export format

`exportDocuments(names?)` -> `{ app: 'pokeapp', format: 1, exportedAt,
documents: { [name]: { version, data } } }`. `importDocuments(json, { mode })`
refuses another app, another format or malformed JSON outright; per document,
refuses a newer version, skips an unknown name, migrates the rest forward, and
writes them (`replace`, or `merge` through the document's `merge`; none = replace).
Imports are local writes (the sync uploads them); `backupFile.ts` handles the file.

## Sync (`src/sync/`)

One row per user per document with `sync: true`. The Team Builder stays on
`team_builder_docs`; every other document goes to `user_documents`, which is
**pending the owner's approval** (`supabase/migrations/`, not applied). Until it
exists, those documents stay local-only, silently. Routing is `syncTargets.ts`.
