/**
 * build:curated -- validate the hand-curated datasets and write the app's copies.
 *
 *   scripts/curated/<type>/schema.json     JSON Schema for one record
 *   scripts/curated/<type>/data/*.json     arrays of records
 *   -> public/data/curated/<type>.json     { type, records } sorted by id, keys sorted
 *
 * Checks, all reported before anything is written: every record against its
 * type's schema, no id used twice within a type (across files), and every
 * `generations` key within 1-9. Any violation prints file, record id and JSON
 * pointer (into the file) and exits 1 without writing. See scripts/curated/CLAUDE.md.
 *
 * `buildCurated` is exported for verify-curated.mjs, which runs it over the
 * invalid fixtures in scripts/curated/__fixtures__/ with the real schemas.
 */
import Ajv from 'ajv'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CURATED_ROOT = 'scripts/curated'
export const OUT_DIR = 'public/data/curated'
const GENERATION_KEY = /^[1-9]$/

const rel = (p) => relative(resolve('.'), resolve(p)).replace(/\\/g, '/')
const pointerToken = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1')

/** Types are the folders under `schemaRoot` that hold a schema.json. */
export function curatedTypes(schemaRoot = CURATED_ROOT) {
  return readdirSync(schemaRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(schemaRoot, d.name, 'schema.json')))
    .map((d) => d.name)
    .sort()
}

/** Objects with their keys sorted, recursively, so the output never depends on authoring order. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeys(value[k])]),
    )
  }
  return value
}

/**
 * Validate every type's data under `dataRoot` against the schemas under
 * `schemaRoot`. Returns the violations and, per type, the exact output text.
 */
export function buildCurated({ dataRoot = CURATED_ROOT, schemaRoot = CURATED_ROOT } = {}) {
  const ajv = new Ajv({ allErrors: true })
  const violations = []
  const outputs = new Map()

  for (const type of curatedTypes(schemaRoot)) {
    const validate = ajv.compile(JSON.parse(readFileSync(join(schemaRoot, type, 'schema.json'), 'utf8')))
    const dataDir = join(dataRoot, type, 'data')
    const files = existsSync(dataDir)
      ? readdirSync(dataDir)
          .filter((f) => f.endsWith('.json'))
          .sort()
      : []
    const records = []
    const firstSeen = new Map()

    for (const name of files) {
      const file = rel(join(dataDir, name))
      const add = (id, pointer, message) => violations.push({ type, file, id, pointer, message })
      let data
      try {
        data = JSON.parse(readFileSync(join(dataDir, name), 'utf8'))
      } catch (err) {
        add(null, '', `not valid JSON: ${err.message}`)
        continue
      }
      if (!Array.isArray(data)) {
        add(null, '', 'a data file must be a JSON array of records')
        continue
      }

      data.forEach((record, i) => {
        const id = record && typeof record === 'object' && typeof record.id === 'string' ? record.id : null
        const at = (path) => `/${i}${path}`

        // Generation keys first, in words: the schema says the same thing less readably.
        const gens = record && typeof record === 'object' ? record.generations : undefined
        const badKeys =
          gens && typeof gens === 'object' && !Array.isArray(gens)
            ? Object.keys(gens).filter((k) => !GENERATION_KEY.test(k))
            : []
        for (const k of badKeys) {
          add(id, at(`/generations/${pointerToken(k)}`), `generation key "${k}" is outside 1-9`)
        }

        if (!validate(record)) {
          for (const e of validate.errors) {
            // Already reported above, in words.
            if (badKeys.length && e.instancePath === '/generations' && (e.keyword === 'propertyNames' || e.propertyName != null)) continue
            // `must match "then"/"else" schema` only wraps the specific error beside it.
            if (e.keyword === 'if') continue
            const where = e.keyword === 'additionalProperties' ? `${e.instancePath}/${pointerToken(e.params.additionalProperty)}` : e.instancePath
            const extra = e.keyword === 'additionalProperties' ? ` (${e.params.additionalProperty})` : ''
            // The schemas' only `not`s are the envelope's: say which half is wrong.
            const message =
              e.keyword === 'not' && e.schemaPath === '#/then/not'
                ? '"generations" cannot be set with "allGenerations": true'
                : e.keyword === 'not' && e.schemaPath === '#/else/not'
                  ? '"all" needs "allGenerations": true'
                  : `${e.message}${extra}`
            add(id, at(where), message)
          }
        }

        if (id != null) {
          const prior = firstSeen.get(id)
          if (prior) add(id, at('/id'), `duplicate id "${id}" (first in ${prior.file} at ${prior.pointer})`)
          else firstSeen.set(id, { file, pointer: at('/id') })
        }
        records.push(record)
      })
    }

    const sorted = [...records].filter((r) => r && typeof r.id === 'string').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    outputs.set(type, `${JSON.stringify(sortKeys({ type, records: sorted }), null, 2)}\n`)
  }
  return { violations, outputs }
}

export function formatViolation(v) {
  return `${v.file}  id=${v.id ?? '(none)'}  ${v.pointer || '/'}  ${v.message}`
}

export function writeOutputs(outputs, outDir = OUT_DIR) {
  mkdirSync(outDir, { recursive: true })
  for (const [type, text] of outputs) writeFileSync(join(outDir, `${type}.json`), text)
}

/*
  `--data <dir>` validates another tree against the real schemas and never
  writes: that is how verify:curated runs a fixture through the CLI.
*/
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const flag = process.argv.indexOf('--data')
  const dataRoot = flag > 0 ? process.argv[flag + 1] : CURATED_ROOT
  if (!dataRoot) {
    console.error('build:curated: --data needs a directory')
    process.exit(2)
  }
  const { violations, outputs } = buildCurated({ dataRoot })
  if (violations.length) {
    console.error(`build:curated: ${violations.length} violation(s), nothing written`)
    for (const v of violations) console.error(`  ${formatViolation(v)}`)
    process.exit(1)
  }
  if (flag > 0) {
    console.log(`build:curated: ${rel(dataRoot)} is valid (not written)`)
    process.exit(0)
  }
  writeOutputs(outputs)
  for (const [type, text] of outputs) {
    console.log(`  ${OUT_DIR}/${type}.json  ${JSON.parse(text).records.length} record(s)`)
  }
}
