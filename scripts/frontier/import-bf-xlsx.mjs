/**
 * One-time import of the owner's Battle Frontier log: docs/fixtures/bf-tracker.xlsx
 * -> docs/fixtures/bf-tracker.import.json, in the "frontier-tracker" document's own
 * export format (src/store/documentStore.ts exportDocuments), so the app's account
 * menu (Saved documents -> Import) loads it. No in-app xlsx reader, no dependency.
 *
 * THE MAPPING is the approved mockup's (scripts/mockups/frontier.mjs), with the
 * owner's answers: both blocks are Singles at Lv50; every battle is a win except
 * the last battle of a Factory run that another run follows (runs 1-4 lost, run 5
 * ongoing); the Dome's one run is ongoing, its trio from the sheet's "## dome"
 * row, each battle's pair from the "duo" letters and the OPPONENT's slot that sat
 * out from "dropped". Factory rentals: a draft at each set's start (1, 8, 15, ...)
 * and a swap where they change inside a set; species only, no set index.
 *
 * NOTHING DERIVED IS TYPED: the Brain rows and the BP ledger come from the app's
 * own model (tracker/model.ts) over the frozen loader, and the log's own
 * silver/gold cells are only CHECKED against the loader (a mismatch stops it).
 *
 *   node scripts/frontier/import-bf-xlsx.mjs [--date YYYY-MM-DD] [--out PATH]
 *
 * --date is the "import date" the imported runs carry (default: today).
 *
 * VERSION: the file is written at the document's CURRENT version (v2 since
 * feature/frontier-speed: `games` joins, empty). The committed
 * docs/fixtures/bf-tracker.import.json is the v1 file this script wrote on
 * 2026-11-14 and stays so: the store migrates it on import, and
 * verify:frontier-tracker A1 checks that a fresh run equals it migrated.
 */
import { build } from 'esbuild'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { memoryStorage } from '../lib/tsModule.mjs'
import { readSheet } from '../lib/xlsx.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'docs/fixtures/bf-tracker.xlsx')
const outArg = process.argv.indexOf('--out')
/** --out PATH: write elsewhere (verify:frontier-tracker regenerates it to compare with the committed file). */
const OUT = outArg > 0 ? process.argv[outArg + 1] : join(ROOT, 'docs/fixtures/bf-tracker.import.json')

const dateArg = process.argv.indexOf('--date')
const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const DATE = dateArg > 0 ? process.argv[dateArg + 1] : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE ?? '')) throw new Error(`--date must be YYYY-MM-DD, got ${DATE}`)

// ------------------------------------------------------------------ the loader and the model

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
      "export * as model from './src/modules/battle-frontier/tracker/model.ts'",
      "export { trackerDocument } from './src/modules/battle-frontier/tracker/trackerStore.ts'",
      "export { exportDocuments } from './src/store/documentStore.ts'",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'import' }) },
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
await api.initDataLayer()
const fd = await api.loadFrontierData(3)
if (!fd) throw new Error('the loader returned nothing for Gen 3')
const { model, trackerDocument, exportDocuments } = api

// ------------------------------------------------------------------ the sheet (the mockup's mapping)

const rows = readSheet(SRC)
const header = rows.findIndex((row) => row.cells.A === 'attempt')
const data = rows.slice(header + 1).filter((row) => /^\d+$/.test(row.cells.A ?? ''))
const gap = data.findIndex((row, i) => i > 0 && row.r !== data[i - 1].r + 1)
if (header < 0 || gap < 0) throw new Error('the sheet has no "attempt" header or no gap between the Dome and Factory blocks')

/** A species cell: "-" is Unknown (null); anything else must resolve in Gen 3. */
const sp = (cell, where) => {
  if (!cell || cell === '-') return null
  const id = fd.resolveSpecies(cell)
  if (id == null) throw new Error(`${where}: "${cell}" is not a Gen 3 species`)
  return id
}
const domeTeamCell = rows.find((row) => /^## dome/.test(row.cells.B ?? ''))?.cells.H
if (!domeTeamCell) throw new Error('no "## dome" row with the trio in column H')
const domeTeam = [...domeTeamCell.matchAll(/([ABC]) ([^,]+)/g)].map((m) => sp(m[2].trim(), 'Dome trio'))
if (domeTeam.length !== 3 || domeTeam.includes(null)) throw new Error(`the Dome trio must be three species: "${domeTeamCell}"`)

const runs = []
const battles = []
/** battle id -> the log's own Brain cell ("silver"/"gold"), to check the loader against. */
const logBrain = new Map()

function makeRuns(facility, block, extra) {
  const attempts = [...new Set(block.map((row) => row.cells.A))]
  attempts.forEach((a, i) => {
    const last = i === attempts.length - 1
    const run = {
      id: `imp-${facility}-${a}`,
      facility,
      format: 'singles',
      levelMode: 'lv50',
      startedAt: DATE,
      imported: true,
      outcome: last ? 'ongoing' : 'lost',
    }
    const own = block.filter((row) => row.cells.A === a)
    own.forEach((row, j) => {
      const n = Number(row.cells.B)
      const where = `${facility} run ${a} battle ${n}`
      const b = {
        id: `${run.id}-${n}`,
        runId: run.id,
        n,
        opponents: ['C', 'D', 'E'].map((c) => sp(row.cells[c], where)),
        result: !last && j === own.length - 1 ? 'L' : 'W',
      }
      Object.assign(b, extra(row, where, run))
      const cell = Object.values(row.cells).find((v) => v === 'silver' || v === 'gold')
      if (cell) logBrain.set(b.id, cell)
      battles.push(b)
    })
    runs.push(run)
  })
}

// The Dome: pair from the "duo" letters (column J), the opponent's slot that sat out from column I.
makeRuns('dome', data.slice(0, gap), (row, where, run) => {
  run.dome = { team: domeTeam }
  const pair = [...(row.cells.J ?? '')].map((c) => domeTeam['abc'.indexOf(c)])
  if (pair.length !== 2 || pair.some((p) => p == null)) throw new Error(`${where}: duo "${row.cells.J}" is not two of a/b/c`)
  const dropped = row.cells.I ? Number(row.cells.I) : null
  if (dropped != null && ![1, 2, 3].includes(dropped)) throw new Error(`${where}: dropped "${row.cells.I}" is not 1-3`)
  return { dome: { pair, dropped } }
})

// The Factory: rentals F-H. A draft at each set's start, a swap where one changed inside a set.
const factoryRows = new Map()
makeRuns('factory', data.slice(gap), (row, where, run) => {
  const rentals = ['F', 'G', 'H'].map((c) => sp(row.cells[c], `${where} rentals`))
  if (rentals.includes(null)) throw new Error(`${where}: a rental is missing`)
  factoryRows.set(`${run.id}-${row.cells.B}`, rentals)
  return {}
})
for (const run of runs.filter((r) => r.facility === 'factory')) {
  run.drafts = []
  run.swaps = []
  const own = battles.filter((b) => b.runId === run.id)
  own.forEach((b, i) => {
    const team = factoryRows.get(b.id)
    const prev = i > 0 ? factoryRows.get(own[i - 1].id) : null
    if ((b.n - 1) % 7 === 0) run.drafts.push({ atBattle: b.n, rentals: team.map((species) => ({ species })) })
    else if (prev && prev.join() !== team.join()) {
      const out = prev.filter((x) => !team.includes(x))
      const inn = team.filter((x) => !prev.includes(x))
      if (out.length !== inn.length || out.length === 0) throw new Error(`run ${run.id} battle ${b.n}: rentals reordered, not swapped`)
      out.forEach((o, k) => run.swaps.push({ atBattle: b.n, out: { species: o }, in: { species: inn[k] } }))
    }
  })
}

// ------------------------------------------------------------------ derived: Brains (checked) and BP

let doc = { schemaVersion: model.TRACKER_VERSION, runs, battles, symbols: {}, bp: { opening: 0, ledger: [] }, games: {} }
const view = model.deriveTracker(doc, fd)
for (const b of battles) {
  const brain = view.runs.get(b.runId).brains.get(b.id)
  const log = logBrain.get(b.id) ?? null
  if ((brain?.symbol ?? null) !== log) {
    throw new Error(`${b.id}: the loader says ${brain?.symbol ?? 'no Brain'}, the log says ${log ?? 'none'}`)
  }
}
const ledger = view.ordered.flatMap((v) => model.bpLinesForRun(fd, v, DATE, (set) => `imp-bp-${v.run.id}-${set}`))
doc = { ...doc, bp: { opening: 0, ledger } }
/** Key order aside, the document the app reads back must be this one exactly. */
const canon = (x) =>
  Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x
const normalised = model.normaliseTracker(doc)
if (JSON.stringify(canon(normalised)) !== JSON.stringify(canon(doc))) throw new Error('the built document does not survive normalise')
doc = normalised

trackerDocument.write(doc)
const json = exportDocuments(['frontier-tracker'], { exportedAt: `${DATE}T00:00:00.000Z` })
writeFileSync(OUT, `${json}\n`)

// ------------------------------------------------------------------ summary

const by = (f) => view.ordered.filter((v) => v.run.facility === f)
const sum = (lines) => lines.reduce((s, l) => s + l.delta, 0)
console.log(`wrote ${OUT.replace(ROOT, '').replace(/^[\\/]/, '')} (import date ${DATE})`)
for (const f of ['dome', 'factory']) {
  console.log(`  ${f}: ${by(f).length} run(s), battles ${by(f).map((v) => v.battles.length).join('/')}, outcomes ${by(f).map((v) => v.run.outcome).join('/')}`)
}
for (const v of view.ordered) for (const [id, b] of v.brains) console.log(`  Brain: ${id} (${b.symbol})`)
console.log(`  BP: ${sum(ledger)} (dome ${sum(ledger.filter((l) => l.runId.includes('dome')))}, factory ${sum(ledger.filter((l) => l.runId.includes('factory')))}) in ${ledger.length} lines`)
