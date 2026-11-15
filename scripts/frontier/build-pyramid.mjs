/**
 * The Battle Pyramid's logging data, from the owner's two fixtures:
 *
 *   docs/fixtures/pyramid-wild-categories.tsv  20 wild categories: the old man's hint,
 *                                              a tactic label, the wild species
 *   docs/fixtures/pyramid-items-by-round.tsv   rounds 1-40, ten item slots each
 *
 * -> src/modules/battle-frontier/tracker/pyramidData.ts (generated, typed; ids only).
 *
 * EVERY NAME MUST RESOLVE: a species through the loader's resolveSpecies (the Gen 3
 * Pokédex list, the dex's own scoped list), an item through the Itemdex's own Gen 3
 * list (itemEntries). One that does not stops the script. ALIASES is for a real
 * mismatch only, and is reported.
 *
 *   node scripts/frontier/build-pyramid.mjs [--out PATH]
 *
 * --out PATH: write elsewhere (verify:frontier-tracker regenerates it to compare).
 */
import { build } from 'esbuild'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { memoryStorage } from '../lib/tsModule.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const WILD = join(ROOT, 'docs/fixtures/pyramid-wild-categories.tsv')
const ITEMS = join(ROOT, 'docs/fixtures/pyramid-items-by-round.tsv')
const outArg = process.argv.indexOf('--out')
const OUT = outArg > 0 ? process.argv[outArg + 1] : join(ROOT, 'src/modules/battle-frontier/tracker/pyramidData.ts')

/** Fixture name -> the name the Gen 3 list knows. Empty: every fixture name resolves as written. */
const ALIASES = { species: {}, items: {} }

// ------------------------------------------------------------------ the fixtures (pure: the suite reuses them)

/**
 * The wild categories. A hint runs over several lines with no quoting, so a
 * record starts at a line that opens with its number and a tab.
 */
export function parseWild(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^Category\t/.test(l))
  if (start < 0) throw new Error('pyramid-wild-categories.tsv: no "Category" header')
  const records = []
  for (const line of lines.slice(start + 1)) {
    if (/^\d+\t/.test(line)) records.push(line)
    else if (records.length && line.trim()) records[records.length - 1] += `\n${line}`
  }
  return records.map((r) => {
    const cols = r.split('\t')
    if (cols.length !== 4) throw new Error(`pyramid-wild-categories.tsv: category "${cols[0]}" has ${cols.length} columns, not 4`)
    const [id, hint, tactic, species] = cols
    return {
      id: Number(id),
      hint: hint.split('\n').map((l) => l.trim()).filter(Boolean),
      tactic: tactic.trim(),
      species: species
        .split(/,\s*(?:and\s+)?|\s+and\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    }
  })
}

/** The items: one row per round, its number then ten slots. */
export function parseItems(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((c) => /^\d+$/.test(c[0]) && c.length === 11 && !/^\d+$/.test(c[1]))
    .map((c) => ({ round: Number(c[0]), items: c.slice(1).map((s) => s.trim()) }))
}

/** An item name as a lookup key: the loader's speciesKey rule (letters and digits, lowercase). */
export const itemKey = (name) =>
  String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// ------------------------------------------------------------------ the run (only as a script)

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) await main()

async function main() {
  globalThis.fetch = async (url) => {
    const path = join(ROOT, 'public', String(url).replace(/^\//, ''))
    return existsSync(path) ? new Response(readFileSync(path)) : new Response('', { status: 404 })
  }
  globalThis.localStorage = memoryStorage()
  const bundled = await build({
    stdin: {
      contents: [
        "export * from './src/modules/battle-frontier/data/index.ts'",
        "export { initDataLayer } from './src/data/index.ts'",
        "export { itemEntries } from './src/modules/dex/entrySources.ts'",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'build' }) },
  })
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
  await api.initDataLayer()
  const fd = await api.loadFrontierData(3)
  if (!fd) throw new Error('the loader returned nothing for Gen 3')

  const itemIndex = new Map()
  for (const i of api.itemEntries({ generation: 3, isAll: false })) {
    itemIndex.set(itemKey(i.name), i.id)
    itemIndex.set(itemKey(i.display_name), i.id)
  }
  const missing = []
  const species = (name) => {
    const id = fd.resolveSpecies(ALIASES.species[name] ?? name)
    if (id == null) missing.push(`species "${name}"`)
    return id
  }
  const item = (name) => {
    const id = itemIndex.get(itemKey(ALIASES.items[name] ?? name))
    if (id == null) missing.push(`item "${name}"`)
    return id
  }

  const wild = parseWild(readFileSync(WILD, 'utf8'))
  const rounds = parseItems(readFileSync(ITEMS, 'utf8'))
  if (wild.length !== 20 || wild.some((c, i) => c.id !== i + 1)) throw new Error(`expected categories 1-20, got ${wild.map((c) => c.id).join(',')}`)
  if (rounds.length !== 40 || rounds.some((r, i) => r.round !== i + 1)) throw new Error(`expected rounds 1-40, got ${rounds.length}`)
  const categories = wild.map((c) => ({ id: c.id, hint: c.hint, tactic: c.tactic, species: c.species.map(species) }))
  const items = rounds.map((r) => r.items.map(item))
  if (missing.length) throw new Error(`names that do not resolve to Gen 3 data: ${missing.join(', ')}`)

  const short = categories.filter((c) => c.species.length !== 8)
  const aliasCount = Object.keys(ALIASES.species).length + Object.keys(ALIASES.items).length
  const ts = `/**
 * GENERATED by scripts/frontier/build-pyramid.mjs from docs/fixtures/pyramid-wild-categories.tsv
 * and docs/fixtures/pyramid-items-by-round.tsv. Do not edit: change a fixture and re-run it.
 *
 * Species ids resolve through the loader's resolveSpecies (Gen 3), item ids through
 * the Itemdex's Gen 3 list (itemEntries).
 */

export interface PyramidCategory {
  /** 1-20, as the fixture numbers them. */
  id: number
  /** The old man's hint, line by line. */
  hint: string[]
  tactic: string
  /** Species ids, in the fixture's order. */
  species: number[]
}

export const PYRAMID_CATEGORIES: PyramidCategory[] = [
${categories
  .map(
    (c) => `  {
    id: ${c.id},
    hint: ${JSON.stringify(c.hint)},
    tactic: ${JSON.stringify(c.tactic)},
    species: ${JSON.stringify(c.species)},
  },`,
  )
  .join('\n')}
]

/** Rounds 1-40 (round = ceil(floor / 7)): ten item slots each, item ids in slot order, duplicates kept. */
export const PYRAMID_ITEMS_BY_ROUND: number[][] = [
${items.map((r) => `  ${JSON.stringify(r)},`).join('\n')}
]
`
  writeFileSync(OUT, ts.replace(/\r\n/g, '\n'))
  console.log(`categories: ${categories.length}, wild entries: ${categories.reduce((s, c) => s + c.species.length, 0)}`)
  if (short.length) console.log(`categories without 8 species: ${short.map((c) => `${c.id} (${c.species.length})`).join(', ')}`)
  console.log(`rounds: ${items.length}, item slots: ${items.flat().length}, distinct items: ${new Set(items.flat()).size}`)
  console.log(`aliases used: ${aliasCount}`)
  console.log(`wrote ${OUT}`)
}
