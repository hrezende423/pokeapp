# Curated data

Every rule in the root `CLAUDE.md` still applies here (sourcing included:
PokéAPI and Bulbapedia are co-primary, Serebii and Smogon are cross-check only).

## Layout

- `<type>/schema.json`: JSON Schema (draft-07, validated with `ajv`) for ONE record.
- `<type>/data/*.json`: each file is a JSON ARRAY of records. Split files however
  reads best; ids must be unique across all of a type's files.
- `__fixtures__/<case>/<type>/data/*.json`: invalid trees, one reason each, run
  against the REAL schemas by `verify:curated`. Not a type.
- Output: `public/data/curated/<type>.json`, `{ "records": [...], "type" }`,
  records sorted by id, keys sorted, LF (`.gitattributes` pins it). Committed;
  never hand-edited.

Types today: `ribbons`, `glossary`, `milestones`. Every record so far is
`"example": true`, a placeholder. Real records drop that flag.

## The per-generation rule

Every record has a stable kebab-case `id` and says which generations it covers,
one of two ways (the schema's `if/then/else` enforces exactly one):

- `generations`: an object keyed `"1"`…`"9"` (any other key fails), each value
  holding that generation's facts, with the type's required fields; or
- `allGenerations: true`: the same everywhere it exists. Where the type has
  required per-generation facts (ribbons, milestones) they go in `all`.

Per type: ribbons `introduced` + per generation `name`, `how`; glossary `term`,
`definition` + per generation an optional `note` where the meaning differs;
milestones per generation, per game (version group name) `order` + `title`.
A ribbon's "every generation" means every one from `introduced` on.

## Adding a type

1. `scripts/curated/<type>/schema.json` (copy a sibling; keep the envelope and
   `additionalProperties: false`), plus `data/`.
2. Add it to `EXPECTED_TYPES` in `scripts/verify-curated.mjs`.
3. `npm run build:curated`, then commit the data, schema and output together.

## Commands

- `npm run build:curated`: validates every file (schema, duplicate ids,
  generation keys 1-9); on any violation prints `file  id=<id>  <pointer>  <reason>`
  and exits 1 without writing. `--data <dir>` validates another tree, never writes.
- `npm run verify:curated`: real data passes, each fixture fails for its reason,
  and the committed outputs are byte-identical to a fresh build.
