/**
 * verify:frontier-tracker -- the Challenge Tracker (src/modules/battle-frontier/tracker/),
 * its saved document, and the one-time import of the owner's log.
 *
 * PART A IS BROWSER-FREE: the import script is re-run to a temp file (and must
 * reproduce the committed docs/fixtures/bf-tracker.import.json), then the app's own
 * model is imported in Node over the real loader and an in-memory localStorage.
 * Every Brain, symbol and BP value is asserted as a literal; none is typed in the file.
 *
 * PART B DRIVES THE APP (dev server, port 4207, system Chrome) against the APPROVED
 * mockup, public/mockups/frontier-tracker.html, opened in the same browser: the
 * app's text is compared with the mockup's, region by region (whitespace collapsed).
 *
 *   npm run verify:frontier-tracker
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { CHROME } from './lib/browser.mjs'
import { selectGeneration } from './lib/controls.mjs'
import { startDevServer } from './lib/devServer.mjs'
import { memoryStorage } from './lib/tsModule.mjs'

const PORT = 4207
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = new URL('./.verify-shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => fileURLToPath(new URL(`frontier-tracker-${name}.png`, SHOTS))
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const FIXTURE = 'docs/fixtures/bf-tracker.import.json'

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const json = (x) => JSON.stringify(x)
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
function diffAt(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return i >= a.length && i >= b.length ? '' : `@${i}: app "${a.slice(i, i + 60)}" vs mockup "${b.slice(i, i + 60)}"`
}
const same = (label, app, mock) => check(label, norm(app) === norm(mock) && norm(mock) !== '', diffAt(norm(app), norm(mock)))
const sameList = (label, app, mock) => {
  const a = app.map(norm)
  const m = mock.map(norm)
  const bad = m.findIndex((x, i) => x !== a[i])
  check(label, a.length === m.length && bad < 0 && m.length > 0, `app ${a.length} vs mockup ${m.length}${bad >= 0 ? ` · row ${bad}: ${diffAt(a[bad] ?? '', m[bad])}` : ''}`)
}

// ================================================================== PART A
hr('A1. THE IMPORT SCRIPT: reproducible, in the document\'s own export format')
const tmp = join(tmpdir(), `bf-import-${process.pid}.json`)
const out = execFileSync(process.execPath, ['scripts/frontier/import-bf-xlsx.mjs', '--date', '2026-11-14', '--out', tmp], { cwd: ROOT, encoding: 'utf8' })
const regenerated = readFileSync(tmp, 'utf8')
rmSync(tmp, { force: true })
const committed = read(FIXTURE)
const lf = (t) => t.replace(/\r\n/g, '\n') // a checkout may turn the committed file's line ends to CRLF
check('re-running the script reproduces the committed import file exactly (line ends aside)', lf(regenerated) === lf(committed), `${regenerated.length} vs ${committed.length} bytes`)
log(out.trim().split('\n').map((l) => `      ${l}`).join('\n'))
const file = JSON.parse(committed)
check('an export file: app pokeapp, format 1, one document "frontier-tracker" at version 1', file.app === 'pokeapp' && file.format === 1 && json(Object.keys(file.documents)) === '["frontier-tracker"]' && file.documents['frontier-tracker'].version === 1)
const imported = file.documents['frontier-tracker'].data
const runsOf = (f) => imported.runs.filter((r) => r.facility === f)
const battlesOf = (r) => imported.battles.filter((b) => b.runId === r.id)
check('exactly 1 Dome run, 40 battles', runsOf('dome').length === 1 && battlesOf(runsOf('dome')[0]).length === 40)
check('exactly 5 Factory runs, 6/3/7/40/7 battles', json(runsOf('factory').map((r) => battlesOf(r).length)) === '[6,3,7,40,7]', json(runsOf('factory').map((r) => battlesOf(r).length)))
check('every run Singles, Lv50, imported, dated the import date', imported.runs.every((r) => r.format === 'singles' && r.levelMode === 'lv50' && r.imported === true && r.startedAt === '2026-11-14'))
check('outcomes: Dome ongoing; Factory runs 1-4 lost, 5 ongoing', json(imported.runs.map((r) => r.outcome)) === '["ongoing","lost","lost","lost","lost","ongoing"]')
const losses = imported.battles.filter((b) => b.result === 'L').map((b) => b.id)
check('the only losses are the last battles of Factory runs 1-4', json(losses) === '["imp-factory-1-6","imp-factory-2-3","imp-factory-3-7","imp-factory-4-40"]', json(losses))
const allowed = new Set(['id', 'runId', 'n', 'opponents', 'result', 'dome', 'note'])
check('no Brain or symbol is typed in the file: battles carry only id, run, n, opponents, result, dome', imported.battles.every((b) => Object.keys(b).every((k) => allowed.has(k))) && !/"(brain|symbol|silver|gold)"/.test(committed) && json(imported.symbols) === '{}')

// ------------------------------------------------------------------ the model over the loader
const realFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  const { existsSync } = await import('node:fs')
  const path = join(ROOT, 'public', String(url).replace(/^\//, ''))
  return existsSync(path) ? new Response(readFileSync(path)) : new Response('', { status: 404 })
}
globalThis.localStorage = memoryStorage()
const bundled = await build({
  stdin: {
    contents: [
      "export * from './src/modules/battle-frontier/data/index.ts'",
      "export { initDataLayer, getSpecies } from './src/data/index.ts'",
      "export * as model from './src/modules/battle-frontier/tracker/model.ts'",
      "export * as pyramid from './src/modules/battle-frontier/tracker/pyramid.ts'",
      "export * as pyramidData from './src/modules/battle-frontier/tracker/pyramidData.ts'",
      "export { itemEntries, speciesEntries } from './src/modules/dex/entrySources.ts'",
      "export { trackerDocument } from './src/modules/battle-frontier/tracker/trackerStore.ts'",
      "export { exportDocuments, importDocuments } from './src/store/documentStore.ts'",
      "export { syncTargetFor } from './src/sync/syncTargets.ts'",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'verify' }) },
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
await api.initDataLayer()
const fd = await api.loadFrontierData(3)
const { model: M, trackerDocument: doc } = api
const sp = (name) => fd.resolveSpecies(name)
const D = M.normaliseTracker(imported)
const view = M.deriveTracker(D, fd)

hr('A2. THE LOADER BOUNDARY: a logged battle reaches the loader\'s unit in one place')
const dome = view.runs.get('imp-dome-1')
const f4 = view.runs.get('imp-factory-4')
const args20 = M.poolArgsAt(dome.run, 20, 0)
check('Dome battle 20 -> the loader call carries streak 4 (tournaments won before it)', args20.streak === 4 && args20.facility === 'dome', json(args20))
const pool20 = fd.trainerPoolForStreak(args20)
check('... and the loader answers Tucker (Silver) due', pool20.brain?.symbol === 'silver' && M.brainAt(fd, dome.run, 20, 0)?.symbol === 'silver', json(pool20.brain))
check('Dome battle 19 (same streak 4, a semifinal): no Brain on that row', M.brainAt(fd, dome.run, 19, 0) == null)
check('Dome battle 40 -> streak 9, with Silver held: Tucker (Gold)', M.poolArgsAt(dome.run, 40, 1).streak === 9 && M.brainAt(fd, dome.run, 40, 1)?.symbol === 'gold')
check('Factory battle 21 -> streak 20, nothing held: Noland (Silver)', M.poolArgsAt(f4.run, 21, 0).streak === 20 && M.brainAt(fd, f4.run, 21, 0)?.symbol === 'silver')
check('the model stores the logged number, never the loader streak (battle n is 20, not 4)', dome.battles.find((b) => b.id === 'imp-dome-1-20').n === 20)

hr('A3. DERIVED FROM THE LOG: Brain rows, symbols, stats')
const brainRows = view.ordered.flatMap((v) => [...v.brains].map(([id, b]) => `${id}:${b.symbol}`))
check('Brain rows from the loader: Dome 20 (Silver), Dome 40 (Gold), Factory run 4 battle 21 (Silver), no other', json(brainRows) === '["imp-dome-1-20:silver","imp-dome-1-40:gold","imp-factory-4-21:silver"]', json(brainRows))
const kDome = view.keys.get('dome|singles|lv50')
const kFac = view.keys.get('factory|singles|lv50')
check('Dome Singles Lv50: Silver and Gold held, from the log', kDome.held.silver && kDome.held.gold && kDome.level === 2 && kDome.fromLog.gold)
check('Factory Singles Lv50: Silver held, Gold not', kFac.held.silver && !kFac.held.gold && kFac.level === 1)
check('symbols held going into each Brain battle: Dome 20 none, Dome 40 Silver, Factory 21 none', dome.heldAt.get('imp-dome-1-20') === 0 && dome.heldAt.get('imp-dome-1-40') === 1 && f4.heldAt.get('imp-factory-4-21') === 0)
check('current streak: Dome 40 (run 1, 10 tournaments); Factory 7 (run 5)', kDome.current.wins === 40 && kDome.current.number === 1 && kDome.current.setsCompleted === 10 && kFac.current.wins === 7 && kFac.current.number === 5)
check('best streak: Dome 40, Factory 39', kDome.best === 40 && kFac.best === 39)
const nD = M.nextBrainFor(fd, kDome)
const nF = M.nextBrainFor(fd, kFac)
check('next Brain: Tucker Gold at tournament 15 (battle 60); Noland Gold at battle 42', nD.symbol === 'gold' && nD.battle === 60 && nD.unitNumber === 15 && nF.symbol === 'gold' && nF.battle === 42, `${json(nD)} ${json(nF)}`)
check('outcome texts as the mockup', M.outcomeText(dome) === 'Ongoing · 40 won' && M.outcomeText(f4) === 'Lost battle 40 · 39 won')
check('run numbers are per facility, in order: Factory 1..5', json(view.ordered.filter((v) => v.run.facility === 'factory').map((v) => v.number)) === '[1,2,3,4,5]')

hr('A4. THE DOME AND THE FACTORY AS LOGGED')
const b1 = D.battles.find((b) => b.id === 'imp-dome-1-1')
check('Dome trio A Swampert, B Metagross, C Latios', json(dome.run.dome.team) === json([sp('swampert'), sp('metagross'), sp('latios')]))
check('Dome battle 1: pair "bc" = Metagross + Latios, dropped = opponent slot 1 (Slowpoke)', json(b1.dome) === json({ pair: [sp('metagross'), sp('latios')], dropped: 1 }) && b1.opponents[0] === sp('slowpoke'))
check('Factory run 4 drafts at 1, 8, 15, 22, 29, 36 (never one per row)', json(f4.run.drafts.map((d) => d.atBattle)) === '[1,8,15,22,29,36]')
const d29 = f4.run.drafts.find((d) => d.atBattle === 29).rentals.map((r) => r.species)
check('Factory run 4 battle 29: a new set\'s draft keeping Espeon and Heracross, species as logged', json(d29) === json([sp('espeon'), sp('heracross'), sp('milotic')]))
const swaps = view.ordered.filter((v) => v.run.facility === 'factory').flatMap((v) => (v.run.swaps ?? []).map((s) => `${v.number}@${s.atBattle}:${s.out.species}>${s.in.species}`))
check('swaps where a rental changed inside a set: run 2 @3, run 3 @7, run 4 @6', json(swaps) === json([`2@3:${sp('grovyle')}>${sp('elekid')}`, `3@7:${sp('grovyle')}>${sp('roselia')}`, `4@6:${sp('beautifly')}>${sp('roselia')}`]), json(swaps))
check('rentals going into run 4 battle 6: Charmeleon, Wailmer, Roselia', json(M.rentalsAt(f4.run, 6).map((r) => r.species)) === json([sp('charmeleon'), sp('wailmer'), sp('roselia')]))
check('Factory run 2 battle 3: Parasect, Luvdisc, Unknown (the log\'s "-")', json(D.battles.find((b) => b.id === 'imp-factory-2-3').opponents) === json([sp('parasect'), sp('luvdisc'), null]))

hr('A5. BATTLE POINTS from bpAward')
const total = (ls) => ls.reduce((s, l) => s + l.delta, 0)
const ledger = D.bp.ledger
check('the ledger totals 82: Dome 50, Factory 32', total(ledger) === 82 && total(ledger.filter((l) => l.runId === 'imp-dome-1')) === 50 && total(ledger.filter((l) => l.runId.startsWith('imp-factory'))) === 32, `${total(ledger)}`)
const recomputed = ledger.every((l) => {
  const v = view.runs.get(l.runId)
  const b = v.battles.find((x) => x.n === l.set * v.perSet)
  const a = fd.bpAward({ facility: v.run.facility, format: v.run.format, completedSets: l.set, brain: v.brains.has(b.id) })
  return a.points === l.delta && (a.brainBonus || undefined) === l.brainBonus
})
// Literals from emerald.json's award rows (Dome singles 1,1,2,2,3,3,4,4,5,5; Factory singles 3,3,4,4,5), Brain +10.
check('the 16 lines, in order: Dome 1,1,2,2,13,3,4,4,5,15; Factory run 4 3,3,14,4,5; run 5 3', json(ledger.map((l) => l.delta)) === '[1,1,2,2,13,3,4,4,5,15,3,3,14,4,5,3]', json(ledger.map((l) => l.delta)))
check('every line is bpAward for its set (Brain +10 on the Brain win)', recomputed && ledger.filter((l) => l.brainBonus === 10).map((l) => l.reason).join('|') === 'Dome run 1, tournament 5|Dome run 1, tournament 10|Factory run 4, set 3')
check('balance after the last line: 82 of a 9,999 cap', M.bpBalance(fd, D) === 82 && fd.addBattlePoints(9990, 82) === 9999)
check('an opening balance carries every line: opening 100 -> 182', M.bpBalance(fd, M.setOpening(D, 100)) === 182)
const spent = M.addLine(D, { id: 'x', at: '2026-11-15', delta: -48, reason: 'Leftovers' })
check('shop spending is a negative line: 82 - 48 = 34; edit to -64 -> 18; delete -> 82', M.bpBalance(fd, spent) === 34 && M.bpBalance(fd, M.editLine(spent, 'x', { delta: -64 })) === 18 && M.bpBalance(fd, M.deleteLine(spent, 'x')) === 82)

hr('A6. LOGGING: a battle, a set\'s line, a loss, undo, drafts and swaps')
const ids = (k) => ({ battle: `t-b${k}`, line: `t-l${k}` })
let L = D
const opp = [sp('slowpoke'), null, sp('mudkip')]
for (let k = 41; k <= 44; k++) L = M.logBattle(L, fd, 'imp-dome-1', { opponents: opp, result: 'W', dome: { pair: [sp('swampert'), sp('latios')], dropped: 2 } }, '2026-11-15', ids(k))
const v44 = M.deriveTracker(L, fd).runs.get('imp-dome-1')
check('four Dome wins: battles 41-44 logged as numbered (41..44), Unknown kept as null', json(v44.battles.slice(-4).map((b) => b.n)) === '[41,42,43,44]' && v44.battles.at(-1).opponents[1] === null)
const l44 = L.bp.ledger.at(-1)
check('battle 44 completes tournament 11: a proposed line, bpAward(11) = 6, no Brain', L.bp.ledger.length === 17 && l44.reason === 'Dome run 1, tournament 11' && l44.delta === 6 && l44.brainBonus == null, json(l44))
check('no line for a battle that completes nothing (41-43)', L.bp.ledger.filter((l) => l.id.startsWith('t-l')).length === 1)
L = M.logBattle(L, fd, 'imp-dome-1', { opponents: opp, result: 'L', dome: { pair: [sp('swampert'), sp('metagross')], dropped: null } }, '2026-11-16', ids(45))
check('a loss ends the run: lost, ended that day', L.runs[0].outcome === 'lost' && L.runs[0].endedAt === '2026-11-16')
check('an ended run takes no more battles', M.logBattle(L, fd, 'imp-dome-1', { opponents: opp, result: 'W' }, '2026-11-16', ids(46)) === L)
L = M.undoLastBattle(L, 'imp-dome-1', 4)
check('undo the loss: ongoing again, no end date', L.runs[0].outcome === 'ongoing' && L.runs[0].endedAt == null && M.deriveTracker(L, fd).runs.get('imp-dome-1').battles.length === 44)
L = M.undoLastBattle(L, 'imp-dome-1', 4)
check('undo battle 44: its tournament\'s line goes with it', L.bp.ledger.length === 16)
let F = M.logBattle(D, fd, 'imp-factory-5', { opponents: [null, null, null], result: 'W', draft: [{ species: sp('espeon'), setIndex: 300 }, { species: sp('heracross') }, { species: sp('milotic') }] }, '2026-11-15', ids(8))
F = M.logBattle(F, fd, 'imp-factory-5', { opponents: [sp('eevee'), null, null], result: 'W', swap: { out: { species: sp('espeon'), setIndex: 300 }, in: { species: sp('espeon'), setIndex: 301 } } }, '2026-11-15', ids(9))
const r5 = F.runs.find((r) => r.id === 'imp-factory-5')
check('Factory run 5 battle 8 opens set 2: the draft is stored once, at 8, with its set index', r5.drafts.at(-1).atBattle === 8 && r5.drafts.at(-1).rentals[0].setIndex === 300)
check('a same-species swap is valid: Espeon #300 out, Espeon #301 in, before battle 9', json(M.rentalsAt(r5, 9)) === json([{ species: sp('espeon'), setIndex: 301 }, { species: sp('heracross') }, { species: sp('milotic') }]))
const S = M.startRun(D, { facility: 'arena', format: 'singles', levelMode: 'open' }, '2026-11-15', 'r-new')
check('a new run: ongoing, dated the day it starts, numbered 1 in its facility', S.runs.at(-1).startedAt === '2026-11-15' && S.runs.at(-1).outcome === 'ongoing' && M.deriveTracker(S, fd).runs.get('r-new').number === 1)

hr('A7. SYMBOLS: manual toggle, set by a Brain win, manual override')
let Y = M.toggleSymbol(D, kFac, 'gold')
let kY = M.deriveTracker(Y, fd).keys.get('factory|singles|lv50')
const nY = M.nextBrainFor(fd, kY)
// With both symbols held the loader brings Noland back at his Silver streak too (battle 21).
check('toggling Factory Gold on (won before the app): held, stored as an override; next Brain: the loader’s Silver rematch at 21', kY.held.gold && json(Y.symbols) === '{"factory|singles|lv50":{"gold":true}}' && nY.symbol === 'silver' && nY.battle === 21, json(nY))
Y = M.toggleSymbol(Y, kY, 'gold')
check('toggling it back to the log\'s answer removes the override', json(Y.symbols) === '{}')
// Silver won before the app, then a Tower run reaches battle 35: with Silver held the game has no Brain there.
let T = M.startRun(M.EMPTY_TRACKER, { facility: 'tower', format: 'singles', levelMode: 'lv50' }, '2026-11-15', 'r-tower')
const kT0 = M.keyViewFor(M.deriveTracker(T, fd), { facility: 'tower', format: 'singles', levelMode: 'lv50' })
T = M.toggleSymbol(T, kT0, 'silver')
for (let k = 1; k <= 35; k++) T = M.logBattle(T, fd, 'r-tower', { opponents: [null, null, null], result: 'W' }, '2026-11-15', ids(`t${k}`))
const vT = M.deriveTracker(T, fd)
const kT = vT.keys.get('tower|singles|lv50')
check('Silver marked before the app stays held after the log passes battle 35: no Brain on 35, next Gold at 70', vT.runs.get('r-tower').brains.size === 0 && kT.held.silver && M.nextBrainFor(fd, kT).battle === 70 && M.nextBrainFor(fd, kT).symbol === 'gold')
check('... and set 5\'s line (battle 35) carries no Brain bonus: bpAward(5) = 5', T.bp.ledger.at(-1).set === 5 && T.bp.ledger.at(-1).delta === 5 && T.bp.ledger.at(-1).brainBonus == null, json(T.bp.ledger.at(-1)))
Y = M.toggleSymbol(D, kDome, 'gold')
kY = M.deriveTracker(Y, fd).keys.get('dome|singles|lv50')
check('overriding a symbol the log earned (Dome Gold off): Silver only held, the log still flags its Brains', !kY.held.gold && kY.held.silver && kY.level === 1 && M.deriveTracker(Y, fd).runs.get('imp-dome-1').brains.size === 2)

hr('A8. THE DOCUMENT: key, sync, export -> import lossless, merge, normalise')
check('name "frontier-tracker", key pokeapp:frontier-tracker:v1, version 1, sync on', doc.name === 'frontier-tracker' && doc.key === 'pokeapp:frontier-tracker:v1' && doc.version === 1 && doc.sync === true)
check('sync with no schema change of its own: routed to the generic user_documents rows', json(api.syncTargetFor('frontier-tracker')) === '{"table":"user_documents","column":"data","named":true}')
doc.reset()
check('nothing stored reads as the empty tracker', json(doc.read()) === json(M.EMPTY_TRACKER))
const rep = api.importDocuments(committed, { mode: 'merge' })
check('the store\'s own import loads the file: merged', rep.ok && rep.documents[0].result === 'merged', json(rep))
check('what it holds is the file\'s document exactly', json(doc.read()) === json(D))
const again = api.importDocuments(committed, { mode: 'merge' })
check('importing the same file again adds nothing (merge by id)', again.ok && doc.read().runs.length === 6 && doc.read().battles.length === 103 && doc.read().bp.ledger.length === 16)
doc.write(F)
const exported = api.exportDocuments(['frontier-tracker'])
localStorage.clear()
doc.reset()
check('after clearing storage the tracker is empty', doc.read().runs.length === 0)
api.importDocuments(exported, { mode: 'replace' })
doc.reset()
check('export -> import is lossless (drafts, set indexes, swaps, Unknowns, ledger)', json(doc.read()) === json(F) && json(JSON.parse(localStorage.getItem('pokeapp:frontier-tracker:v1'))) === json(F))
const canon = (x) => (Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x)
check('normalise drops junk and keeps the shape', json(canon(M.normaliseTracker({ runs: [{ id: 'a' }, 5], battles: [{ id: 'b', runId: 'zz', n: 1, opponents: [1, 2, 3], result: 'W' }], bp: { opening: -3, ledger: [{ id: 'l', at: 'x', delta: 'no' }] } }))) === json(canon(M.EMPTY_TRACKER)))
const future = M.normaliseTracker({ ...imported, extra: 1, runs: imported.runs.map((r, i) => (i ? r : { ...r, later: 'x' })), battles: imported.battles.map((b, i) => (i ? b : { ...b, later: 2 })), bp: { ...imported.bp, later: true, ledger: imported.bp.ledger.map((l, i) => (i ? l : { ...l, later: 3 })) } })
check('a field a newer client added survives this client\'s normalise (it syncs)', future.extra === 1 && future.runs[0].later === 'x' && future.battles[0].later === 2 && future.bp.later === true && future.bp.ledger[0].later === 3)
check('merge into an empty tracker: everything; into itself: nothing new', M.mergeTracker(M.EMPTY_TRACKER, D).runs.length === 6 && json(M.mergeTracker(D, D)) === json(D))
// Device A logged more of a shared run (battle 8 won with a draft, 9 lost); device B merges A's copy.
let A = M.logBattle(D, fd, 'imp-factory-5', { opponents: [null, null, null], result: 'W', draft: [{ species: sp('espeon') }, { species: sp('heracross') }, { species: sp('milotic') }] }, '2026-11-15', ids('a8'))
A = M.logBattle(A, fd, 'imp-factory-5', { opponents: [null, null, null], result: 'L' }, '2026-11-15', ids('a9'))
const B = M.mergeTracker(D, A)
const b5 = B.runs.find((r) => r.id === 'imp-factory-5')
check('a shared run comes whole from the side that logged more: lost, its set 2 draft, battles 8 and 9 once each', b5.outcome === 'lost' && b5.drafts.at(-1).atBattle === 8 && B.battles.filter((b) => b.runId === 'imp-factory-5').length === 9)
// Ordering: a newer run started on this device, then the old log merged in.
let N = M.startRun(M.EMPTY_TRACKER, { facility: 'factory', format: 'singles', levelMode: 'lv50' }, '2026-11-15', 'r-newer')
for (let k = 1; k <= 21; k++) N = M.logBattle(N, fd, 'r-newer', { opponents: [null, null, null], result: 'W' }, '2026-11-15', ids(`n${k}`))
const NM = M.deriveTracker(M.mergeTracker(N, D), fd)
check('the imported log merged after a newer run: the newer run is Factory run 6, imported run 4 keeps its Brain at 21, current is the newer run', NM.runs.get('r-newer').number === 6 && NM.runs.get('imp-factory-4').brains.has('imp-factory-4-21') && NM.keys.get('factory|singles|lv50').current.run.id === 'r-newer')

hr('A9. FROZEN: no change to the loader API, the Trainer Dex or the reference screens')
let base = 'main'
try {
  execFileSync('git', ['rev-parse', '--verify', 'main'], { cwd: ROOT, stdio: 'ignore' })
} catch {
  base = 'origin/main'
}
const fork = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
const changed = execFileSync('git', ['diff', '--name-only', fork], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
const frozen = changed.filter(
  (f) =>
    f.startsWith('src/modules/battle-frontier/data/') ||
    /^src\/modules\/battle-frontier\/(Facilities|Brains|SetsTrainers|StreakLookup|FrontierScreens|parts|format|names|useFrontierData)\.tsx?$/.test(f) ||
    /^src\/modules\/battle-frontier\/frontier\.css$/.test(f) ||
    /^src\/modules\/dex\/(Trainerdex|trainerdex|trainerEntries)/.test(f) ||
    f.startsWith('scripts/trainers/') ||
    f === 'src/data/trainers.ts' ||
    f.startsWith('supabase/') ||
    f === 'scripts/mockups/frontier.mjs' ||
    f.startsWith('public/mockups/'),
)
check(`git diff since ${base}: no change to the loader, the reference screens, the Trainer Dex, the mockup or Supabase`, frozen.length === 0, frozen.join(', '))
const css = read('src/modules/battle-frontier/tracker/tracker.css')
check('tracker CSS: no hard-coded colour, no primitive token, no box-shadow', !/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) && !/--color-(accent|neutral)-\d/.test(css) && !/box-shadow/.test(css))
check('tracker CSS: no accent at all (the nav tab is the screen\'s one use)', !/accent/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')))
const storeBundle = await build({ entryPoints: [join(ROOT, 'src/modules/battle-frontier/tracker/trackerStore.ts')], bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', logLevel: 'silent' })
const pulled = Object.keys(storeBundle.metafile.inputs).filter((f) => /battle-frontier\/data\/|src\/data\/|entrySources/.test(f.replace(/\\/g, '/')))
check('the eager tracker store bundles no loader or data-layer code', pulled.length === 0, pulled.join(', '))

hr('A10. THE BATTLE PYRAMID: the fixtures, the floor log, Brandon, BP, totals, the document')
const { pyramid: P, pyramidData: PD } = api
const tmpPyr = join(tmpdir(), `pyramid-data-${process.pid}.ts`)
log(
  execFileSync(process.execPath, ['scripts/frontier/build-pyramid.mjs', '--out', tmpPyr], { cwd: ROOT, encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n'),
)
check('re-running build-pyramid reproduces the committed pyramidData.ts (line ends aside)', lf(readFileSync(tmpPyr, 'utf8')) === lf(read('src/modules/battle-frontier/tracker/pyramidData.ts')))
rmSync(tmpPyr, { force: true })
const { parseWild, parseItems, itemKey } = await import(pathToFileURL(join(ROOT, 'scripts/frontier/build-pyramid.mjs')).href)
const wildFx = parseWild(read('docs/fixtures/pyramid-wild-categories.tsv'))
const itemsFx = parseItems(read('docs/fixtures/pyramid-items-by-round.tsv'))
const gen3 = new Set(api.speciesEntries({ generation: 3, isAll: false }).map((s) => s.id))
const wildNames = wildFx.flatMap((c) => c.species)
check('the wild fixture: 20 categories, 157 entries (category 6 lists 5 species, every other one 8)', wildFx.length === 20 && wildNames.length === 157 && json(wildFx.map((c) => c.species.length)) === json([8, 8, 8, 8, 8, 5, ...Array(14).fill(8)]), json(wildFx.map((c) => c.species.length)))
const badWild = wildNames.filter((n) => !gen3.has(sp(n)))
check('every wild entry of the fixture resolves to a Gen 3 species (#1-386), no alias', badWild.length === 0 && gen3.size === 386, badWild.join(', '))
check('... and pyramidData holds exactly those ids, in order, with each hint and tactic', json(PD.PYRAMID_CATEGORIES.map((c) => [c.id, c.hint, c.tactic, c.species])) === json(wildFx.map((c) => [c.id, c.hint, c.tactic, c.species.map(sp)])))
const itemIdx = new Map()
for (const i of api.itemEntries({ generation: 3, isAll: false })) {
  itemIdx.set(itemKey(i.name), i.id)
  itemIdx.set(itemKey(i.display_name), i.id)
}
const it = (name) => itemIdx.get(itemKey(name))
const itemNamesFx = itemsFx.flatMap((r) => r.items)
check('the item fixture: rounds 1-40, ten slots each', itemsFx.length === 40 && itemsFx.every((r, i) => r.round === i + 1 && r.items.length === 10))
const badItems = [...new Set(itemNamesFx.filter((n) => it(n) == null))]
check('every item name of the fixture resolves to a Gen 3 item (the Itemdex list), no alias', badItems.length === 0, badItems.join(', '))
check('... and pyramidData holds exactly those ids in slot order', json(PD.PYRAMID_ITEMS_BY_ROUND) === json(itemsFx.map((r) => r.items.map(it))))
const R1 = ['Hyper Potion', 'Fluffy Tail', 'Cheri Berry', 'Ether', 'Lum Berry', 'Revive', 'Bright Powder', 'Shell Bell', 'Max Revive', 'Sacred Ash'].map(it)
check('round 1 chips: its ten distinct items in slot order', json(P.roundItems(1)) === json(R1))
check('round 7 lists Lum Berry twice: one chip, nine in slot order', json(P.roundItems(7)) === json(['Hyper Potion', 'X Sp. Atk', 'Lum Berry', 'Ether', 'Revive', 'Scope Lens', 'Focus Band', 'Max Revive', 'Sacred Ash'].map(it)))
check('round 41 and past: no chips (search only)', P.roundItems(41).length === 0 && P.roundItems(60).length === 0)
check('round = ceil(floor / 7): floors 1, 7, 8, 280, 281 -> 1, 1, 2, 40, 41; floor 21 reads "Round 3 · floor 7 of 7"', json([1, 7, 8, 280, 281].map((n) => P.roundOf(n, 7))) === '[1,1,2,40,41]' && P.floorLabel(21, 7) === 'Round 3 · floor 7 of 7')

const PK = { facility: 'pyramid', format: 'singles', levelMode: 'lv50' }
check('a floor\'s trainers are drawn at the floors cleared before it: floor 1 -> loader streak 0, floor 8 -> 7', M.floorPoolArgs(PK, 1).streak === 0 && M.floorPoolArgs(PK, 8).streak === 7)
check('floor 7 reads the loader\'s Hard row, floor 1 the normal one', fd.trainerPoolForStreak(M.floorPoolArgs(PK, 7)).hard === true && fd.trainerPoolForStreak(M.floorPoolArgs(PK, 1)).hard === false)
const pyrFac = fd.facilities().find((f) => f.id === 'pyramid')
check('the loader\'s Pyramid party size is 3: the PLAYER\'s (and Brandon\'s); it has none for a regular trainer, built to the owner\'s rule of one', pyrFac.formats.length === 1 && pyrFac.formats[0].partySize === 3)
const twoSpecies = M.normaliseTracker({
  runs: [{ id: 'p', facility: 'pyramid', format: 'singles', levelMode: 'lv50', startedAt: '2026-11-15', outcome: 'ongoing' }],
  battles: [{ id: 'pb', runId: 'p', n: 1, opponents: [null, null, null], result: 'W', pyramid: { trainers: [{ species: [sp('gengar'), sp('haunter')], result: 'W' }, { species: sp('gengar'), result: 'W' }, { species: null, result: 'W' }, { result: 'W' }], wild: [], items: [] } }],
})
check('model: a trainer entry with two species (or none) is not a Pyramid trainer and is dropped on read; one species or Unknown stays', json(twoSpecies.battles[0].pyramid.trainers) === json([{ species: sp('gengar'), result: 'W' }, { species: null, result: 'W' }]), json(twoSpecies.battles[0].pyramid.trainers))
let threw = false
try {
  P.addTrainer(P.EMPTY_FLOOR, [sp('gengar'), sp('haunter')])
} catch {
  threw = true
}
check('model: adding a trainer with two species throws', threw)

const at = '2026-11-15'
const edOpen = (d, runId, fn) => P.editOpenFloor(d, runId, (o) => ({ ...o, pyramid: fn(o.pyramid) }))
let Q = M.startRun(M.EMPTY_TRACKER, PK, at, 'pyr')
Q = edOpen(Q, 'pyr', (f) => P.setCategory(f, 1))
for (let k = 0; k < 3; k++) Q = edOpen(Q, 'pyr', (f) => P.addWild(f, sp('pikachu')))
Q = edOpen(Q, 'pyr', (f) => P.addTrainer(f, sp('gengar')))
Q = edOpen(Q, 'pyr', (f) => P.addTrainer(f, null))
Q = edOpen(Q, 'pyr', (f) => P.addItem(f, R1[0]))
Q = edOpen(Q, 'pyr', (f) => P.addItem(f, R1[4]))
const open1 = Q.runs[0].openFloor
check('every edit saves the open floor on the run: floor 1, Pikachu x3, Gengar and Unknown, two items', open1.n === 1 && json(open1.pyramid.wild) === json([{ species: sp('pikachu'), count: 3 }]) && json(open1.pyramid.trainers.map((t) => t.species)) === json([sp('gengar'), null]) && json(open1.pyramid.items) === json([{ itemId: R1[0], qty: 1 }, { itemId: R1[4], qty: 1 }]))
Q = P.closeFloor(Q, fd, 'pyr', 'W', at, ids('p1'))
const f1 = Q.battles.find((b) => b.runId === 'pyr' && b.n === 1)
check('Next floor: floor 1 is a battle (n 1, W, three Unknown opponents) holding its lists; the open floor is gone', f1?.result === 'W' && json(f1.opponents) === '[null,null,null]' && f1.pyramid.trainers.length === 2 && f1.pyramid.wild[0].count === 3 && f1.pyramid.items.length === 2 && f1.pyramid.wildCategory === 1 && Q.runs[0].openFloor == null)
const vQ = (d) => M.deriveTracker(d, fd).runs.get('pyr')
check('the category is remembered for the round: floor 2 uses category 1 with no pick', P.categoryAt(Q.runs[0], vQ(Q).battles, 2, 7) === 1)
for (let n = 2; n <= 7; n++) Q = P.closeFloor(Q, fd, 'pyr', 'W', at, ids(`p${n}`))
check('... floor 2 closed with it stored; floor 8 opens round 2 with none', Q.battles.find((b) => b.runId === 'pyr' && b.n === 2).pyramid.wildCategory === 1 && P.categoryAt(Q.runs[0], vQ(Q).battles, 8, 7) === undefined)
const l7 = Q.bp.ledger.at(-1)
check('floor 7 completes challenge 1: bpAward\'s line, 5 BP, "Pyramid run 1, challenge 1"', Q.bp.ledger.length === 1 && l7.set === 1 && l7.delta === fd.bpAward({ facility: 'pyramid', format: 'singles', completedSets: 1 }).points && l7.delta === 5 && l7.reason === 'Pyramid run 1, challenge 1', json(l7))
Q = edOpen(Q, 'pyr', (f) => P.addWild(f, sp('haunter')))
const U = M.undoLastBattle(Q, 'pyr', 7)
check('undo floor 7: the floor, its lists and its BP line go; the next floor\'s open entries with it', !U.battles.some((b) => b.runId === 'pyr' && b.n === 7) && U.bp.ledger.length === 0 && U.runs[0].openFloor == null && U.battles.filter((b) => b.runId === 'pyr').length === 6)
let BB = U
const brandon = fd.brains().find((b) => b.facility === 'pyramid')
const silverTeam = brandon.teams.silver.map((m) => m.species_id)
for (let n = 7; n <= 70; n++) {
  if (n === 21) BB = P.editOpenFloor(BB, 'pyr', (o) => ({ ...o, opponents: silverTeam }))
  BB = P.closeFloor(BB, fd, 'pyr', 'W', at, ids(`b${n}`))
}
const vB = vQ(BB)
const brainFloors = vB.battles.filter((b) => vB.brains.has(b.id)).map((b) => `${b.n}:${vB.brains.get(b.id).symbol}`)
check('Brandon from the loader after floors 21 (Silver) and 70 (Gold), on no other floor', json(brainFloors) === '["21:silver","70:gold"]', json(brainFloors))
check('floor 21 holds his three as picked; every other floor keeps three Unknowns', json(vB.battles.find((b) => b.n === 21).opponents) === json(silverTeam) && vB.battles.filter((b) => b.n !== 21).every((b) => json(b.opponents) === '[null,null,null]'))
check('his win carries the Brain bonus on challenge 3\'s line', BB.bp.ledger.find((l) => l.runId === 'pyr' && l.set === 3)?.brainBonus === 10)
check('run totals: 70 floors, 2 trainers, 3 wild defeated, 2 items', json(P.pyramidTotals(vB)) === json({ floors: 70, trainers: 2, wild: 3, items: 2 }), json(P.pyramidTotals(vB)))
let I = M.startRun(BB, PK, at, 'pyr2')
I = edOpen(I, 'pyr2', (f) => P.addWild(P.addWild(P.addWild(f, sp('pikachu')), sp('haunter')), sp('haunter')))
I = edOpen(I, 'pyr2', (f) => P.addItem(P.addTrainer(f, sp('gengar')), R1[4]))
const byId = (l) => json(l.slice().sort((a, b) => a[0] - b[0]))
const ins = P.pyramidInsights(M.deriveTracker(I, fd), { species: String, item: String })
check('insights across runs, open floors included: wild Pikachu 4, Haunter 2; items Lum Berry 2, Hyper Potion 1; trainers Gengar 2 (Unknown not counted)', byId(ins.wild) === byId([[sp('pikachu'), 4], [sp('haunter'), 2]]) && json(ins.items) === json([[R1[4], 2], [R1[0], 1]]) && json(ins.trainers) === json([[sp('gengar'), 2]]), json(ins))
I = edOpen(I, 'pyr2', (f) => P.addTrainer(f, sp('dusclops')))
const Lz = P.loseToTrainer(I, fd, 'pyr2', 1, at, ids('lz'))
const lzFloor = Lz.battles.find((b) => b.runId === 'pyr2')
check('Lost to a trainer: that trainer is the loss, floor 1 closes L, the run ends, no BP line', Lz.runs.find((r) => r.id === 'pyr2').outcome === 'lost' && lzFloor.result === 'L' && json(lzFloor.pyramid.trainers.map((t) => t.result)) === '["W","L"]' && Lz.bp.ledger.length === BB.bp.ledger.length)
const withOpen = edOpen(Lz, 'pyr', (f) => P.addItem(f, R1[9]))
doc.write(withOpen)
const exP = api.exportDocuments(['frontier-tracker'])
localStorage.clear()
doc.reset()
api.importDocuments(exP, { mode: 'replace' })
doc.reset()
check('export -> import is lossless with floors, Brandon\'s three, a loss and an open floor', json(doc.read()) === json(withOpen))
const laterP = M.normaliseTracker({
  ...withOpen,
  runs: withOpen.runs.map((r) => (r.id === 'pyr' ? { ...r, openFloor: { ...r.openFloor, later: 1, pyramid: { ...r.openFloor.pyramid, later: 2 } } } : r)),
  battles: withOpen.battles.map((b) => (b.id === f1.id ? { ...b, pyramid: { ...b.pyramid, later: 3, trainers: b.pyramid.trainers.map((t, i) => (i ? t : { ...t, later: 4 })) } } : b)),
})
const lf1 = laterP.battles.find((b) => b.id === f1.id).pyramid
const lo = laterP.runs.find((r) => r.id === 'pyr').openFloor
check('fields a newer client adds to a floor, a trainer or the open floor survive (it syncs)', lo.later === 1 && lo.pyramid.later === 2 && lf1.later === 3 && lf1.trainers[0].later === 4)
check('bf-tracker.import.json still loads unchanged: normalising it gives it back exactly', json(canon(M.normaliseTracker(imported))) === json(canon(imported)))
check('the document stays version 1 (the change is additive)', doc.version === 1 && M.TRACKER_VERSION === 1)
let RT = M.startRun(M.EMPTY_TRACKER, PK, at, 'pyr-rt')
RT = edOpen(RT, 'pyr-rt', (f) => P.addItem(P.addWild(f, sp('pikachu')), R1[0]))
RT = M.endRun(RT, 'pyr-rt', 'retired', at)
check('retired mid-floor: that floor\'s entries still count in the totals and the insights', json(P.pyramidTotals(M.deriveTracker(RT, fd).runs.get('pyr-rt'))) === json({ floors: 0, trainers: 0, wild: 1, items: 1 }) && json(P.pyramidInsights(M.deriveTracker(RT, fd), { species: String, item: String }).wild) === json([[sp('pikachu'), 1]]))
const noted = P.editLoggedBattle(BB, vB.battles.find((b) => b.n === 70).id, (b) => ({ ...b, note: 'top', opponents: [sp('arcanine'), null, null] }))
check('a saved floor\'s note and Brandon\'s three can be edited later', noted.battles.find((b) => b.runId === 'pyr' && b.n === 70).note === 'top' && noted.battles.find((b) => b.runId === 'pyr' && b.n === 70).opponents[0] === sp('arcanine'))

// ================================================================== PART B
const TRIGGER = '[data-testid="nav-tab-battle-frontier"]'
const DROPDOWN = '[data-testid="nav-dropdown-battle-frontier"]'
async function openTracker(page) {
  await page.hover(TRIGGER)
  await page.waitForSelector(DROPDOWN, { state: 'visible', timeout: 15000 })
  await page.click(`${DROPDOWN} [data-testid="nav-frontier-tracker"]`)
  await page.mouse.move(1300, 900)
  await page.waitForSelector(DROPDOWN, { state: 'hidden', timeout: 5000 }).catch(() => {})
}
const ROOT_SEL = '[data-testid="frontier-tracker"]'
const ready = (page) => page.waitForSelector(`${ROOT_SEL}[data-status="ready"]`, { timeout: 60000 })
const mockTexts = (page, n, sel) => page.evaluate(([n, sel]) => [...document.querySelectorAll('section.state')[n - 1].querySelectorAll(sel)].map((e) => e.textContent), [n, sel])
const appTexts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent), sel)
const appText = async (page, sel) => (await appTexts(page, sel))[0] ?? ''
/** A table row's cells, ' | '-joined (textContent runs cells together). */
const cells = (page, sel) => page.$eval(sel, (tr) => [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()).join(' | ').trim())
const mockText = async (page, n, sel) => (await mockTexts(page, n, sel))[0] ?? ''
/** Region names the mockup state declares (its frame only), minus the mockup's own scaffolding. */
const SCAFFOLD = new Set(['mockup', 'state', 'app-bar', 'nav-tabs', 'nav-dropdown', 'log-add-state'])
const mockRegions = (page, n) => page.evaluate((n) => [...new Set([...document.querySelectorAll('section.state')[n - 1].querySelectorAll('.frame [data-layout]')].map((e) => e.dataset.layout))], n).then((l) => l.filter((x) => !SCAFFOLD.has(x)))
const appRegions = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-testid="frontier-tracker"] [data-layout]')].map((e) => e.dataset.layout))])
async function regionsMatch(label, page, mock, n) {
  const want = await mockRegions(mock, n)
  const have = new Set(await appRegions(page))
  const missing = want.filter((r) => !have.has(r))
  check(`${label}: every region the mockup names is in the app (?layout=1)`, want.length > 0 && missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : want.join(', '))
}

/** Accent uses on screen (the reference suite's probe): text, borders, outlines, fills, SVG, pseudo-elements. */
const accentUses = (page) =>
  page.evaluate(() => {
    const probe = (v) => {
      const el = document.createElement('span')
      el.style.color = `var(${v})`
      document.body.appendChild(el)
      const c = getComputedStyle(el).color
      el.remove()
      return c
    }
    const accents = new Set([probe('--accent'), probe('--color-accent-default')])
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight
    }
    const hits = []
    const drawn = (s) =>
      ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none' && accents.has(s[`border${k}Color`])) ||
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && accents.has(s.outlineColor)) ||
      accents.has(s.backgroundColor) ||
      (s.textDecorationLine !== 'none' && accents.has(s.textDecorationColor))
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue
      const s = getComputedStyle(el)
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      const svg = el instanceof SVGElement && (accents.has(s.stroke) || accents.has(s.fill))
      const pseudo = ['::before', '::after'].some((p) => {
        const ps = getComputedStyle(el, p)
        return ps.content !== 'none' && ps.content !== 'normal' && (drawn(ps) || accents.has(ps.color))
      })
      if ((ownText && accents.has(s.color)) || drawn(s) || svg || pseudo) hits.push(el)
    }
    const outer = hits.filter((el) => !hits.some((o) => o !== el && o.contains(el)))
    return outer.map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}:${el.textContent.trim().slice(0, 24)}`)
  })

/** No badge: nothing inside the tracker has a fill AND a radius (a pill or chip), nor a shadow. */
const badgesAndShadows = (page) =>
  page.evaluate(() => {
    const out = { badges: [], shadows: 0 }
    const pageBg = getComputedStyle(document.body).backgroundColor
    // The page's own content: the shared ScrollArea's drawn thumb is not the tracker's.
    for (const el of document.querySelectorAll('[data-testid="frontier-tracker"] .bf-page *')) {
      const s = getComputedStyle(el)
      if (s.boxShadow !== 'none') out.shadows++
      const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent' && s.backgroundColor !== pageBg
      if (filled && parseFloat(s.borderTopLeftRadius) > 0 && !el.matches('.bf-picker-list')) out.badges.push(`${el.tagName}.${el.className}`.slice(0, 40))
    }
    return out
  })

globalThis.fetch = realFetch // the loader is in memory now; the dev server is polled over HTTP
const dev = await startDevServer({ port: PORT })
let browser
const consoleErrors = []
try {
  browser = await chromium.launch(CHROME)
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  context.setDefaultNavigationTimeout(240000)
  context.setDefaultTimeout(60000)
  const page = await context.newPage()
  const mock = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await mock.goto(`${dev.url}mockups/frontier-tracker.html`, { waitUntil: 'load' })
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(TRIGGER, { timeout: 180000 })
  await page.bringToFront()
  const full = async (name) => {
    const h = await page.$eval('.bf-page', (el) => el.scrollHeight)
    await page.setViewportSize({ width: 1440, height: Math.min(h + 220, 8000) })
    await page.waitForTimeout(500)
    await page.screenshot({ path: shot(name) })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  // ---------------------------------------------------------------- nav + other generation
  hr('B1. THE TAB: Challenge Tracker is a real screen now; other generations get the notice')
  await selectGeneration(page, 4)
  await openTracker(page)
  await page.waitForSelector(ROOT_SEL)
  check('the dropdown entry opens the tracker, not a stub', (await page.$('[data-testid="stub-frontier-tracker"]')) == null && (await page.$(ROOT_SEL)) != null)
  check('Gen 4: the page is the one notice', (await page.$eval(ROOT_SEL, (r) => r.dataset.status)) === 'other-generation')
  same('state 7 (other generation): page head', await appText(page, '[data-layout="page-head"]'), await mockText(mock, 7, '[data-layout="page-head"]'))
  same('state 7: the notice', await appText(page, '[data-layout="frontier-notice"]'), await mockText(mock, 7, '[data-layout="frontier-notice"]'))
  await page.screenshot({ path: shot('other-generation') })

  // ---------------------------------------------------------------- empty
  hr('B2. EMPTY: no runs yet')
  await selectGeneration(page, 3)
  await ready(page)
  same('state 6 (empty): page head with New run', await appText(page, '[data-layout="page-head"]'), await mockText(mock, 6, '[data-layout="page-head"]'))
  same('state 6: the empty notice', await appText(page, '[data-layout="tracker-empty"]'), await mockText(mock, 6, '[data-layout="tracker-empty"]'))
  await regionsMatch('state 6', page, mock, 6)
  await page.screenshot({ path: shot('empty') })

  // ---------------------------------------------------------------- import through the app
  hr('B3. IMPORT: the account menu\'s Saved documents -> Import loads the JSON')
  await page.click('[data-testid="account-toggle"]')
  await page.waitForSelector('[data-testid="saved-documents"]', { state: 'visible' })
  check('the account menu has Saved documents: Export and Import…', json(await appTexts(page, '[data-testid="saved-documents"] :is(.app-controls-label, button)')) === '["Saved documents","Export","Import…"]')
  await page.setInputFiles('[data-testid="documents-file"]', join(ROOT, FIXTURE))
  const report = await page.waitForSelector('[data-testid="documents-report"]').then((e) => e.textContent())
  check('into an empty tracker it imports without asking: replaced', report === 'frontier-tracker: replaced' && (await page.$('[data-testid="documents-confirm"]')) == null, report)
  await page.screenshot({ path: shot('account-import') })
  await page.click('[data-testid="account-toggle"]')
  await page.waitForSelector('[data-testid="tracker-runs"]')
  await page.waitForTimeout(400)

  // ---------------------------------------------------------------- home
  hr('B4. HOME AFTER THE IMPORT (state 1)')
  same('page head', await appText(page, '[data-layout="page-head"]'), await mockText(mock, 1, '[data-layout="page-head"]'))
  sameList('runs, newest first: every row', await appTexts(page, '[data-layout="tracker-runs"] tr'), await mockTexts(mock, 1, '[data-layout="tracker-runs"] tr'))
  sameList('run history', await appTexts(page, '[data-layout="insight-history"] tr'), await mockTexts(mock, 1, '[data-layout="insight-history"] tr'))
  sameList('most-seen opponents', await appTexts(page, '[data-layout="insight-species"] tr'), await mockTexts(mock, 1, '[data-layout="insight-species"] tr'))
  sameList('Dome: win rate per pair', await appTexts(page, '[data-layout="insight-dome-pairs"] tr'), await mockTexts(mock, 1, '[data-layout="insight-dome-pairs"] tr'))
  same('BP balance', await appText(page, '[data-testid="bp-balance"]'), (await mockTexts(mock, 1, '[data-layout="tracker-bp"] > p'))[1])
  sameList('BP ledger: the 12 newest lines', await appTexts(page, '[data-testid="bp-ledger"] tr'), await mockTexts(mock, 1, '[data-layout="tracker-bp"] tr'))
  same('BP caption', (await appTexts(page, '[data-layout="tracker-bp"] > p.bf-cap'))[0], (await mockTexts(mock, 1, '[data-layout="tracker-bp"] > p.cap'))[0])
  same('opening balance field', await page.$eval('[data-testid="bp-opening"]', (e) => e.value), '0')
  await regionsMatch('state 1', page, mock, 1)
  await full('home-light')

  // ---------------------------------------------------------------- Dome run
  hr('B5. DOME RUN 1 (state 2)')
  await page.click('[data-testid="tracker-run-imp-dome-1"]')
  await page.waitForSelector('[data-testid="run-log"]')
  check('the run detail is a screen inside the module: no back-stack step', (await page.$eval(ROOT_SEL, (r) => r.dataset.screen)) === 'run')
  same('run head', await appText(page, '[data-layout="run-head"]'), await mockText(mock, 2, '[data-layout="run-head"]'))
  same('your three', await appText(page, '[data-layout="run-team"]'), await mockText(mock, 2, '[data-layout="run-team"]'))
  const fitsDome = await page.$eval('[data-testid="run-log"] .bf-tw', (e) => ({ scroll: e.scrollWidth, client: e.clientWidth }))
  check('at 1440 the Dome log fits its column: no sideways scroll, nothing cut', fitsDome.scroll <= fitsDome.client, json(fitsDome))
  sameList('the 40 log rows (Dropped, pair, Brain and its known team)', await appTexts(page, '[data-testid="run-log"] tr:not(.bf-lookup-row)'), await mockTexts(mock, 2, '[data-layout="run-log"] tr'))
  same('stats: streaks, Tactics Symbol, next Brain', await appText(page, '[data-layout="tracker-stats"]'), await mockText(mock, 2, '[data-layout="tracker-stats"]'))
  sameList('BP: the 4 newest lines', await appTexts(page, '[data-testid="bp-ledger"] tr'), await mockTexts(mock, 2, '[data-layout="tracker-bp"] tr'))
  const flagged = await page.$$eval('[data-testid="run-log"] tr[data-brain]', (r) => r.map((x) => x.dataset.battleN))
  check('Brain rows flagged (by the loader) at Dome 20 and 40 only', json(flagged) === '["20","40"]', json(flagged))
  const sprites = await page.$$eval('[data-testid="run-log"] tr[data-battle-n="1"] img.bf-sprite', (els) => els.length)
  check('log rows carry the opponents\' sprites (3 on battle 1)', sprites === 3, sprites)
  check('symbols: Silver and Gold pressed, a checkbox icon, semibold label, no accent', (await page.$$eval('[data-testid^="symbol-dome-"]', (els) => els.map((e) => `${e.getAttribute('aria-pressed')}:${e.querySelector('svg') != null}:${getComputedStyle(e).fontWeight}`))).join() === 'true:true:600,true:true:600')
  await regionsMatch('state 2', page, mock, 2)
  // The lookup, prefilled for the battle.
  await page.click('[data-testid="battle-20-lookup"]')
  await page.waitForSelector('[data-testid="battle-20-lookup-row"] [data-testid="streak-lookup"]')
  const lk = await page.$eval('[data-testid="battle-20-lookup-row"]', (r) => ({
    facility: r.querySelector('[data-testid="lookup-facility"]').value,
    level: r.querySelector('[data-testid="lookup-level"]').value,
    battle: r.querySelector('[data-testid="lookup-battle"]').value,
    symbols: r.querySelector('[data-testid="lookup-symbols"]').value,
    result: r.querySelector('[data-testid="streak-lookup-result"]').textContent,
  }))
  check('battle 20 opens the Streak lookup prefilled: Dome, Lv50, battle 20 as logged, no symbols yet', lk.facility === 'dome' && lk.level === 'lv50' && lk.battle === '20' && lk.symbols === '0', json({ ...lk, result: undefined }))
  check('... and it answers with Tucker (Silver) due in tournament 5\'s final', /20 · Tournament 5 · Final/.test(lk.result) && /Tucker \(Silver\) takes one entrant’s place/.test(lk.result), norm(lk.result).slice(-120))
  await page.click('[data-testid="battle-40-lookup"]')
  const lk40 = await page.$eval('[data-testid="battle-40-lookup-row"] [data-testid="lookup-symbols"]', (e) => e.value)
  check('battle 40 opens with Silver held (won at 20), so Gold is due', lk40 === '1' && /Tucker \(Gold\)/.test(await appText(page, '[data-testid="battle-40-lookup-row"] [data-testid="streak-lookup-result"]')))
  await page.click('[data-testid="battle-40-lookup"]')
  await page.click('[data-testid="battle-20-lookup"]')
  await full('dome-light')

  // ---------------------------------------------------------------- Factory run 4
  hr('B6. FACTORY RUN 4 (state 3)')
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-imp-factory-4"]')
  await page.waitForSelector('[data-testid="run-log"]')
  same('run head', await appText(page, '[data-layout="run-head"]'), await mockText(mock, 3, '[data-layout="run-head"]'))
  sameList('the log: a draft line at each set, a swap line, 40 battles, Noland at 21', await appTexts(page, '[data-testid="run-log"] tr'), await mockTexts(mock, 3, '[data-layout="run-log"] tr'))
  same('stats: Knowledge Symbol, next Brain', await appText(page, '[data-layout="tracker-stats"]'), await mockText(mock, 3, '[data-layout="tracker-stats"]'))
  const fFlag = await page.$$eval('[data-testid="run-log"] tr[data-brain]', (r) => r.map((x) => x.dataset.battleN))
  check('the Brain row is flagged at battle 21 only', json(fFlag) === '["21"]', json(fFlag))
  const fitsF = await page.$eval('[data-testid="run-log"] .bf-tw', (e) => ({ scroll: e.scrollWidth, client: e.clientWidth }))
  check('at 1440 the Factory log fits its column', fitsF.scroll <= fitsF.client, json(fitsF))
  check('rentals carry sprites (the set 1 draft line: 3)', (await page.$$eval('[data-draft-at="1"] img.bf-sprite', (e) => e.length)) === 3)
  check('no undo-able loss hides: the ended run has no logging row', (await page.$('[data-testid="log-add"]')) == null)
  await regionsMatch('state 3', page, mock, 3)
  await full('factory4-light')

  // ---------------------------------------------------------------- Unknown, as imported
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-imp-factory-2"]')
  await page.waitForSelector('[data-testid="run-log"]')
  const unk = await appText(page, '[data-testid="run-log"] tr[data-battle-n="3"]')
  const mockUnk = norm(await mockText(mock, 4, '[data-layout="run-log"] tbody tr')).replace(' (run 2)', '')
  same('an imported Unknown (Factory run 2 battle 3) reads as the mockup\'s example', unk, mockUnk)

  // ---------------------------------------------------------------- logging
  hr('B7. LOGGING A BATTLE (state 4): the picker, an Unknown, persistence')
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-imp-factory-5"]')
  await page.waitForSelector('[data-testid="log-add"]')
  same('the next battle: 8, Set 2 · battle 1', norm(await appText(page, '[data-testid="log-add-n"]')) + ' ' + norm(await page.$eval('[data-testid="log-add-n"] + span', (e) => e.textContent)), '8 Set 2 · battle 1')
  await page.click('[data-testid="log-opponent-0"]')
  await page.keyboard.type('ma')
  await page.waitForSelector('[data-testid="log-opponent-0-list"]')
  sameList('typing "ma": Unknown first, then Gen 3 matches in Pokédex order', await appTexts(page, '[data-testid="log-opponent-0-list"] li'), await mockTexts(mock, 4, '[data-layout="species-picker"] li'))
  check('the first option is the active one (semibold)', (await page.$eval('[data-testid="log-opponent-0-list"] li', (e) => `${e.getAttribute('aria-selected')}:${getComputedStyle(e).fontWeight}`)) === 'true:600')
  await regionsMatch('state 4', page, mock, 4)
  await page.screenshot({ path: shot('logging-picker-light') })
  const caps = await appTexts(page, '[data-testid="log-add"] .bf-cap')
  const wantCaps = await mockTexts(mock, 4, '[data-layout="log-add"] .cap')
  check('the mockup\'s fields are all there (Opponent 1-3, Note), plus the set\'s rentals', wantCaps.every((c) => caps.map(norm).includes(norm(c))) && caps.some((c) => /Set 2 rental 1/.test(c)), caps.join(' | '))
  await page.keyboard.press('Enter') // Unknown
  check('Enter takes the active option: Unknown', (await page.$eval('[data-testid="log-opponent-0"]', (e) => e.value)) === 'Unknown')
  const pickSpecies = async (testId, text, id) => {
    await page.click(`[data-testid="${testId}"]`)
    await page.keyboard.type(text)
    await page.click(`[data-testid="${testId}-list"] li[data-species-id="${id}"]`)
  }
  await pickSpecies('log-opponent-1', 'mach', sp('machamp'))
  await pickSpecies('log-opponent-2', 'mag', sp('magneton'))
  check('with the three opponents chosen, Won stays disabled until the set\'s rentals are drafted', await page.$eval('[data-testid="log-won"]', (e) => e.disabled))
  await pickSpecies('log-rental-0', 'esp', sp('espeon'))
  const setOpts = await page.$$eval('[data-testid="log-rental-0-set"] option', (o) => o.map((x) => x.value))
  check('a rental\'s set is optional: "Any of its sets", then Espeon\'s Lv50 Frontier sets', setOpts[0] === '' && setOpts.length > 1, setOpts.slice(0, 4).join(','))
  await page.selectOption('[data-testid="log-rental-0-set"]', setOpts[1])
  await pickSpecies('log-rental-1', 'hera', sp('heracross'))
  await pickSpecies('log-rental-2', 'milo', sp('milotic'))
  await page.fill('[data-testid="log-note"]', 'a test note')
  check('with everything filled, Won is enabled', !(await page.$eval('[data-testid="log-won"]', (e) => e.disabled)))
  await page.click('[data-testid="log-won"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="8"]')
  const row8 = await cells(page, '[data-testid="run-log"] tr[data-battle-n="8"]')
  check('battle 8 logged: Unknown, Machamp, Magneton, the note, Won', row8 === '8 | Set 2 · battle 1 | Unknown · Machamp · Magnetona test note | Won |', row8)
  check('its draft line: Set 2 rentals with the chosen set index', norm(await appText(page, '[data-draft-at="8"]')) === `Set 2 rentals: Espeon#${setOpts[1]}, Heracross, Milotic`, norm(await appText(page, '[data-draft-at="8"]')))
  check('the next row is 9, inside the set: a swap, not a draft', norm(await appText(page, '[data-testid="log-add-n"]')) === '9' && (await page.$('[data-testid="log-swap-out"]')) != null && (await page.$('[data-testid="log-rental-0"]')) == null)
  // A same-species swap: Espeon (its set) out, Espeon on another set in.
  await page.selectOption('[data-testid="log-swap-out"]', '0')
  await pickSpecies('log-swap-in', 'esp', sp('espeon'))
  await page.selectOption('[data-testid="log-swap-in-set"]', setOpts[2])
  for (const i of [0, 1, 2]) {
    await page.click(`[data-testid="log-opponent-${i}"]`)
    await page.click(`[data-testid="log-opponent-${i}-list"] li[data-species-id="unknown"]`)
  }
  await page.click('[data-testid="log-won"]')
  await page.waitForSelector('[data-swap-at="9"]')
  const swapRow = norm(await appText(page, '[data-swap-at="9"]'))
  check('battle 9 with a same-species swap: one swap line, never a draft', swapRow === `Swap before battle 9: Espeon out, Espeon#${setOpts[2]} in` && (await page.$('[data-draft-at="9"]')) == null, swapRow)
  await page.click('[data-testid="run-undo"]')
  check('Undo battle 9 removes the battle and its swap', (await page.$('[data-swap-at="9"]')) == null && (await page.$('[data-testid="run-log"] tr[data-battle-n="9"]')) == null)

  // The Dome: pair + dropped.
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-imp-dome-1"]')
  await page.waitForSelector('[data-testid="log-add"]')
  await pickSpecies('log-opponent-0', 'slow', sp('slowpoke'))
  await pickSpecies('log-opponent-1', 'mud', sp('mudkip'))
  await page.click('[data-testid="log-opponent-2"]')
  await page.click('[data-testid="log-opponent-2-list"] li[data-species-id="unknown"]')
  await page.click('[data-testid="log-pair-0"]')
  check('one of the pair is not enough', await page.$eval('[data-testid="log-won"]', (e) => e.disabled))
  await page.click('[data-testid="log-pair-2"]')
  await page.click('[data-testid="log-pair-1"]')
  check('a third pick is refused: the pair stays Swampert + Latios', json(await page.$$eval('[data-testid^="log-pair-"]', (e) => e.map((x) => x.getAttribute('aria-pressed')))) === '["true","false","true"]')
  await page.selectOption('[data-testid="log-dropped"]', '2')
  await page.click('[data-testid="log-won"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="41"]')
  const row41 = await cells(page, '[data-testid="run-log"] tr[data-battle-n="41"]')
  check('Dome battle 41: Tournament 11 · Round 1, dropped 2 Mudkip, Swampert + Latios', row41 === '41 | Tournament 11 · Round 1 | Slowpoke · Mudkip · Unknown | 2 Mudkip | Swampert + Latios | Won |', row41)

  // Reload: both persist.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(TRIGGER, { timeout: 180000 })
  await selectGeneration(page, 3) // the app does not keep the generation across a reload
  await openTracker(page)
  await ready(page)
  await page.click('[data-testid="tracker-run-imp-dome-1"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="41"]')
  check('after a reload Dome battle 41 is still there', (await cells(page, '[data-testid="run-log"] tr[data-battle-n="41"]')) === row41)
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-imp-factory-5"]')
  check('after a reload Factory run 5 battle 8 is still there', (await cells(page, '[data-testid="run-log"] tr[data-battle-n="8"]')) === row8)
  // Undo, then the BP editor.
  await page.click('[data-testid="run-undo"]')
  check('Undo battle 8 removes it and its draft', (await page.$('[data-testid="run-log"] tr[data-battle-n="8"]')) == null && (await page.$('[data-draft-at="8"]')) == null)
  await page.click('[data-testid="bp-add-line"]')
  await page.fill('[data-testid="bp-editor-reason"]', 'Leftovers')
  await page.fill('[data-testid="bp-editor-delta"]', '-48')
  await page.click('[data-testid="bp-editor-save"]')
  const bal = norm(await appText(page, '[data-testid="bp-balance"]'))
  check('a spending line: 82 - 48 = 34 BP', bal === '34 BP of 9,999 max', bal)
  await page.click('[data-testid="bp-ledger"] tbody tr button.bf-link')
  await page.click('[data-testid="bp-editor-delete"]')
  check('deleting it: back to 82', norm(await appText(page, '[data-testid="bp-balance"]')) === '82 BP of 9,999 max')

  // ---------------------------------------------------------------- export -> import, through the UI
  hr('B8. EXPORT -> IMPORT through the account menu is lossless')
  const stored = await page.evaluate(() => localStorage.getItem('pokeapp:frontier-tracker:v1'))
  await page.click('[data-testid="account-toggle"]')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="documents-export"]')])
  const exportPath = join(tmpdir(), `bf-export-${process.pid}.json`)
  await download.saveAs(exportPath)
  const exportedFile = JSON.parse(readFileSync(exportPath, 'utf8'))
  check('the export holds the tracker exactly as stored', json(exportedFile.documents['frontier-tracker'].data) === json(JSON.parse(stored)))
  await page.evaluate(() => localStorage.removeItem('pokeapp:frontier-tracker:v1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(TRIGGER, { timeout: 180000 })
  await selectGeneration(page, 3) // the app does not keep the generation across a reload
  await openTracker(page)
  await ready(page)
  check('with the tracker removed, the page is empty again', (await page.$('[data-testid="tracker-empty"]')) != null)
  await page.click('[data-testid="account-toggle"]')
  await page.setInputFiles('[data-testid="documents-file"]', exportPath)
  await page.waitForSelector('[data-testid="documents-report"]')
  await page.click('[data-testid="account-toggle"]')
  rmSync(exportPath, { force: true })
  check('importing the export restores the identical document', (await page.evaluate(() => localStorage.getItem('pokeapp:frontier-tracker:v1'))) === stored)
  // Over data: it asks first, Cancel writes nothing, Replace gives back exactly the file (no merge, no copies).
  const exportAgain = join(tmpdir(), `bf-export2-${process.pid}.json`)
  writeFileSync(exportAgain, JSON.stringify(exportedFile))
  await page.waitForSelector('[data-testid="bp-add-line"]')
  await page.click('[data-testid="bp-add-line"]')
  await page.fill('[data-testid="bp-editor-reason"]', 'Leftovers')
  await page.fill('[data-testid="bp-editor-delta"]', '-48')
  await page.click('[data-testid="bp-editor-save"]')
  const withLine = await page.evaluate(() => localStorage.getItem('pokeapp:frontier-tracker:v1'))
  await page.click('[data-testid="account-toggle"]')
  await page.setInputFiles('[data-testid="documents-file"]', exportAgain)
  const ask = norm(await page.waitForSelector('[data-testid="documents-confirm"]').then((e) => e.textContent()))
  check('importing over data asks first, naming the document', /This replaces what this device holds for: .*frontier-tracker/.test(ask), ask)
  await page.click('[data-testid="documents-cancel"]')
  check('Cancel writes nothing', (await page.evaluate(() => localStorage.getItem('pokeapp:frontier-tracker:v1'))) === withLine)
  await page.setInputFiles('[data-testid="documents-file"]', exportAgain)
  await page.click('[data-testid="documents-replace"]')
  await page.waitForSelector('[data-testid="documents-report"]')
  check('Replace gives back exactly the file: the new line is gone, nothing doubled', (await page.evaluate(() => localStorage.getItem('pokeapp:frontier-tracker:v1'))) === stored)
  await page.click('[data-testid="account-toggle"]')
  rmSync(exportAgain, { force: true })

  // ---------------------------------------------------------------- new run
  hr('B9. NEW RUN (state 5)')
  await page.waitForSelector('[data-testid="tracker-new-run"]')
  await page.click('[data-testid="tracker-new-run"]')
  await page.waitForSelector('[data-layout="new-run-form"]')
  same('page head (no action)', await appText(page, '[data-layout="page-head"]'), await mockText(mock, 5, '[data-layout="page-head"]'))
  sameList('the form: Facility (Battle Dome chosen), only the Dome\'s formats, the level', await appTexts(page, '[data-layout="new-run-form"] label'), await mockTexts(mock, 5, '[data-layout="new-run-form"] label'))
  check('Battle Dome is chosen, as the mockup', (await page.$eval('[data-testid="new-run-facility"]', (e) => e.value)) === 'dome')
  await regionsMatch('state 5', page, mock, 5)
  await page.screenshot({ path: shot('new-run-light') })
  await page.selectOption('[data-testid="new-run-facility"]', 'arena')
  check('the Arena has Singles only', json(await page.$$eval('[data-testid="new-run-format"] option', (o) => o.map((x) => x.textContent))) === '["Singles"]')
  await page.selectOption('[data-testid="new-run-level"]', 'open')
  await page.click('[data-testid="tracker-start-run"]')
  await page.waitForSelector('[data-testid="run-facts"]')
  check('Start run opens the new run: Battle Arena run 1, Open Level, ongoing, dated today', /^Battle Arena · run 1$/.test(norm(await appText(page, '.bf-run-head .bf-title'))) && norm(await appText(page, '[data-testid="run-facts"]')).startsWith('Singles · Open Level · Ongoing · 0 won'))
  await page.click('[data-testid="tracker-all-runs"]')
  const arenaRow = await cells(page, '[data-testid="tracker-runs"] tr[data-run-id^="run-"]')
  const now = new Date()
  const todayText = `${now.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]} ${now.getFullYear()}`
  check('home lists it with today\'s date, not "(imported)"', arenaRow === `Run 1 | Singles | Open Level | ${todayText} | 0 | Ongoing · 0 won`, arenaRow)

  // ---------------------------------------------------------------- the Pyramid
  hr('B12. THE BATTLE PYRAMID: the floor strip, the floor log, Brandon, totals, insights')
  const readDoc = () => page.evaluate(() => JSON.parse(localStorage.getItem('pokeapp:frontier-tracker:v1')))
  const reopen = async (runId) => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector(TRIGGER, { timeout: 180000 })
    await selectGeneration(page, 3) // the app does not keep the generation across a reload
    await openTracker(page)
    await ready(page)
    await page.click(`[data-testid="tracker-run-${runId}"]`)
  }
  const seen = new Set()
  const collect = async () => (await appRegions(page)).forEach((r) => seen.add(r))
  const openOf = async (runId) => (await readDoc()).runs.find((r) => r.id === runId).openFloor
  const floorN = () => appText(page, '[data-testid="pyramid-floor-n"]').then(norm)
  const pickTrainer = async (text, id) => {
    await page.click('[data-testid="pyramid-trainer-species"]')
    await page.keyboard.type(text)
    await page.click(`[data-testid="pyramid-trainer-species-list"] li[data-species-id="${id}"]`)
  }
  await page.click('[data-testid="tracker-new-run"]')
  await page.waitForSelector('[data-layout="new-run-form"]')
  await page.selectOption('[data-testid="new-run-facility"]', 'pyramid')
  await page.click('[data-testid="tracker-start-run"]')
  await page.waitForSelector('[data-testid="pyramid-add"]')
  const pyrId = (await readDoc()).runs.find((r) => r.facility === 'pyramid').id
  check('a Pyramid run opens on its floor strip, not the battle row: floor 1, "Round 1 · floor 1 of 7"', (await page.$('[data-testid="log-add"]')) == null && (await floorN()) === '1' && norm(await appText(page, '[data-testid="pyramid-floor-label"]')) === 'Round 1 · floor 1 of 7')
  check('three big buttons, Wild chosen by default', json(await page.$$eval('[data-layout="pyramid-modes"] button', (b) => b.map((x) => `${x.textContent}:${x.getAttribute('aria-pressed')}`))) === '["Wild:true","Trainer:false","Item:false"]')
  const catTexts = await page.$$eval('[data-testid="pyramid-categories"] button', (b) => b.map((x) => [...x.children].map((c) => c.textContent)))
  check('the category chooser: 20 entries, each the hint\'s first line and the tactic', catTexts.length === 20 && catTexts.every((c, i) => c[0] === PD.PYRAMID_CATEGORIES[i].hint[0] && c[1] === PD.PYRAMID_CATEGORIES[i].tactic), json(catTexts[0]))
  await collect()

  // The common floor, every tap counted, every key counted.
  await page.evaluate(() => {
    window.__keys = 0
    document.addEventListener('keydown', () => (window.__keys += 1), true)
  })
  let taps = 0
  const tap = async (sel) => {
    taps += 1
    await page.click(sel)
  }
  await tap('[data-testid="pyramid-category-1"]')
  check('a category shows its species as one-tap sprite buttons', json(await page.$$eval('[data-testid="pyramid-wild-picks"] button', (b) => b.map((x) => Number(x.dataset.speciesId)))) === json(PD.PYRAMID_CATEGORIES[0].species) && (await page.$$eval('[data-testid="pyramid-wild-picks"] img.bf-sprite', (e) => e.length)) === 8)
  await collect()
  for (let k = 0; k < 3; k++) await tap(`[data-testid="pyramid-wild-${sp('pikachu')}"]`)
  await tap('[data-testid="pyramid-mode-item"]')
  const chipIds = await page.$$eval('[data-testid="pyramid-item-picks"] button', (b) => b.map((x) => Number(x.dataset.itemId)))
  const chipNames = await page.$$eval('[data-testid="pyramid-item-picks"] button', (b) => b.map((x) => x.textContent))
  check('Item: round 1\'s chips are exactly its distinct items in slot order, by name', json(chipIds) === json(R1) && json(chipNames) === json(itemsFx[0].items), json(chipNames))
  await collect()
  await tap(`[data-testid="pyramid-item-${R1[0]}"]`)
  await tap(`[data-testid="pyramid-item-${R1[4]}"]`)
  await tap('[data-testid="pyramid-mode-trainer"]')
  await page.waitForSelector('[data-testid="pyramid-trainer-species-list"]')
  check('Trainer: its one species picker opens at once, Unknown (not seen) first', norm(await appText(page, '[data-testid="pyramid-trainer-species-list"] li')) === 'Unknown (not seen)')
  await tap(`[data-testid="pyramid-trainer-species-list"] li[data-species-id="${sp('bulbasaur')}"]`)
  await page.waitForSelector('[data-testid="pyramid-trainer-0"]')
  await tap('[data-testid="pyramid-next-floor"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="1"]')
  const keys = await page.evaluate(() => window.__keys)
  check('the common floor (the round\'s category once, 3 species, 2 item chips, 1 trainer, Next floor): 10 taps, no typing', taps === 10 && keys === 0, `${taps} taps, ${keys} keys`)
  const row1 = await cells(page, '[data-testid="run-log"] tr[data-battle-n="1"]')
  check('floor 1 in the log: label, counts 1 / 3 / 2, the three lists with sprites, Cleared', row1.startsWith('1 | Round 1 · floor 1 of 7 | 1 / 3 / 2 |') && /Trainers\s*Bulbasaur/.test(row1) && /Wild\s*Pikachu×3/.test(row1) && /Items.*Hyper Potion×1.*Lum Berry×1/.test(row1) && row1.endsWith('| Cleared | Edit') && (await page.$$eval('[data-testid="run-log"] tr[data-battle-n="1"] img.bf-sprite', (e) => e.length)) === 4, row1)

  // Floor 2: two trainers, a species three times, two items; persists across reload.
  check('floor 2 opens with the round\'s category already chosen', (await floorN()) === '2' && /I see a shower of sparks/.test(await appText(page, '[data-testid="pyramid-category"]')))
  for (let k = 0; k < 3; k++) await page.click(`[data-testid="pyramid-wild-${sp('pikachu')}"]`)
  await page.click('[data-testid="pyramid-mode-trainer"]')
  await pickTrainer('geng', sp('gengar'))
  await page.click('[data-testid="pyramid-trainer-species"]')
  check('a second tap on the trainer field reopens its list for the next trainer, no typing', (await page.$('[data-testid="pyramid-trainer-species-list"]')) != null)
  await page.keyboard.type('dusc')
  await page.keyboard.press('Enter')
  check('... and with text typed, Enter adds the first match (Dusclops), not Unknown', json((await openOf(pyrId)).pyramid.trainers.map((t) => t.species)) === json([sp('gengar'), sp('dusclops')]))
  await page.click('[data-testid="pyramid-mode-item"]')
  await page.click(`[data-testid="pyramid-item-${R1[1]}"]`)
  await page.click(`[data-testid="pyramid-item-${R1[5]}"]`)
  const want2 = { n: 2, pyramid: { trainers: [{ species: sp('gengar'), result: 'W' }, { species: sp('dusclops'), result: 'W' }], wild: [{ species: sp('pikachu'), count: 3 }], items: [{ itemId: R1[1], qty: 1 }, { itemId: R1[5], qty: 1 }] } }
  check('every tap saved at once: the open floor 2 is in storage (2 trainers, one species each; Pikachu x3; 2 items)', json(await openOf(pyrId)) === json(want2), json(await openOf(pyrId)))
  await reopen(pyrId)
  await page.waitForSelector('[data-testid="pyramid-add"]')
  check('after a reload the open floor 2 is intact: the strip says floor 2, five entries', json(await openOf(pyrId)) === json(want2) && (await floorN()) === '2' && (await page.$$eval('[data-testid="pyramid-entries"] .bf-pyr-entry', (e) => e.length)) === 5)
  await page.keyboard.press('Control+Shift+L')
  await page.waitForTimeout(400)
  await page.screenshot({ path: shot('pyramid-layout'), fullPage: false })
  await page.keyboard.press('Control+Shift+L')
  // More reaches every trainer of the floor, the latest by default.
  await page.click('[data-testid="pyramid-mode-trainer"]')
  await page.click('[data-testid="pyramid-trainer-more"]')
  check('More with two trainers: a "For" list, Dusclops (the latest) chosen', json(await page.$$eval('[data-testid="pyramid-trainer-which"] option', (o) => o.map((x) => x.textContent))) === '["Trainer 1 · Gengar","Trainer 2 · Dusclops"]' && (await page.$eval('[data-testid="pyramid-trainer-which"]', (e) => e.value)) === '1')
  await page.selectOption('[data-testid="pyramid-trainer-which"]', '0')
  const first2 = fd.trainerPoolForStreak(M.floorPoolArgs(PK, 2)).idRange.from
  await page.selectOption('[data-testid="pyramid-trainer-id"]', String(first2))
  check('... choosing Gengar there sets Gengar\'s trainer, not Dusclops\'s', json((await openOf(pyrId)).pyramid.trainers.map((t) => t.trainerId ?? null)) === json([first2, null]))
  await page.click('[data-testid="pyramid-next-floor"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="2"]')
  const row2 = await cells(page, '[data-testid="run-log"] tr[data-battle-n="2"]')
  check('floor 2 closed: 2 / 3 / 2, Gengar (with its trainer) and Dusclops, Pikachu x3, Fluffy Tail, Revive', row2.startsWith('2 | Round 1 · floor 2 of 7 | 2 / 3 / 2 |') && /Trainers\s*Gengar.+Dusclops/.test(row2) && /Fluffy Tail×1.*Revive×1/.test(row2), row2)
  await reopen(pyrId)
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="2"]')
  check('after a reload floor 2 is still there, exactly', (await cells(page, '[data-testid="run-log"] tr[data-battle-n="2"]')) === row2)
  const totalsText = (t) => `${t.floors} floor${t.floors === 1 ? '' : 's'} · ${t.trainers} trainer${t.trainers === 1 ? '' : 's'} · ${t.wild} wild defeated · ${t.items} item${t.items === 1 ? '' : 's'}`
  const modelTotals = async () => P.pyramidTotals(M.deriveTracker(M.normaliseTracker(await readDoc()), fd).runs.get(pyrId))
  check('run head totals match the logged data: 2 floors · 3 trainers · 6 wild defeated · 4 items', norm(await appText(page, '[data-testid="run-totals"]')) === totalsText(await modelTotals()) && totalsText(await modelTotals()) === '2 floors · 3 trainers · 6 wild defeated · 4 items', norm(await appText(page, '[data-testid="run-totals"]')))

  // A saved floor reopened and edited.
  await page.click('[data-testid="floor-2-edit"]')
  await page.waitForSelector('[data-testid="floor-2-editor"]')
  await page.click('[data-testid="floor-2-mode-item"]')
  await page.click(`[data-testid="floor-2-item-${R1[2]}"]`)
  await page.click(`[data-testid="floor-2-item-${R1[2]}"]`)
  await page.click(`[data-testid="floor-2-item-entry-${R1[2]}-minus"]`)
  const f2 = () => readDoc().then((d) => d.battles.find((b) => b.runId === pyrId && b.n === 2))
  check('a saved floor reopens and edits in place: Cheri Berry +2 -1 -> 2 / 3 / 3, still Cleared', norm(await appText(page, '[data-testid="floor-2-counts"]')) === '2 / 3 / 3' && (await f2()).pyramid.items.at(-1).qty === 1 && (await f2()).result === 'W')
  await collect()
  await page.click(`[data-testid="floor-2-item-entry-${R1[2]}-remove"]`)
  check('... and remove takes it out again: 2 / 3 / 2', norm(await appText(page, '[data-testid="floor-2-counts"]')) === '2 / 3 / 2')
  await page.click('[data-testid="floor-2-edit"]')

  // Floor 3: - / + / remove, the wild search, the trainer's More.
  await page.click(`[data-testid="pyramid-wild-${sp('pikachu')}"]`)
  await page.click(`[data-testid="pyramid-wild-${sp('pikachu')}"]`)
  await page.click(`[data-testid="pyramid-wild-entry-${sp('pikachu')}-minus"]`)
  await page.click(`[data-testid="pyramid-wild-entry-${sp('pikachu')}-plus"]`)
  await page.click(`[data-testid="pyramid-wild-entry-${sp('pikachu')}-plus"]`)
  check('- / + on an entry: Pikachu 2, -1, +2 -> x3', (await openOf(pyrId)).pyramid.wild[0].count === 3)
  const stepBoxes = await page.$$eval('[data-testid="pyramid-entries"] .bf-pyr-step', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('every - / + / remove button has at least a 44 px hit area', stepBoxes.length >= 3 && stepBoxes.every(([w, h]) => w >= 44 && h >= 44), json(stepBoxes))
  await page.click(`[data-testid="pyramid-wild-entry-${sp('pikachu')}-remove"]`)
  check('remove: no wild entry left on floor 3', (await openOf(pyrId)).pyramid.wild.length === 0)
  await page.click('[data-testid="pyramid-wild-search"]')
  await page.waitForSelector('[data-testid="pyramid-wild-search-list"]')
  check('the wild search reaches any Gen 3 species, Unknown (not seen) first', norm(await appText(page, '[data-testid="pyramid-wild-search-list"] li')) === 'Unknown (not seen)')
  await page.keyboard.type('sabley')
  await page.click(`[data-testid="pyramid-wild-search-list"] li[data-species-id="${sp('sableye')}"]`)
  check('... a pick adds one: Sableye x1', json((await openOf(pyrId)).pyramid.wild) === json([{ species: sp('sableye'), count: 1 }]))
  await page.click('[data-testid="pyramid-mode-trainer"]')
  await pickTrainer('mach', sp('machamp'))
  await page.click('[data-testid="pyramid-trainer-more"]')
  const range3 = fd.trainerPoolForStreak(M.floorPoolArgs(PK, 3)).idRange
  const want3 = fd.trainers().filter((t) => t.id >= range3.from && t.id <= range3.to).map((t) => t.id)
  const opts3 = (await page.$$eval('[data-testid="pyramid-trainer-id"] option', (o) => o.map((x) => x.value))).filter(Boolean).map(Number)
  check(`More: the trainer picker offers only the loader's range for floor 3 (#${range3.from}-#${range3.to}, ${want3.length} trainers)`, opts3.length > 0 && json(opts3) === json(want3), `${opts3.length} options`)
  await page.selectOption('[data-testid="pyramid-trainer-id"]', String(want3[0]))
  const setOpts3 = (await page.$$eval('[data-testid="pyramid-trainer-set"] option', (o) => o.map((x) => x.value))).filter(Boolean)
  const machSets = fd.sets().filter((s) => s.species_id === sp('machamp') && !s.openOnly).map((s) => String(s.index))
  check('... and the set among that species\' Frontier sets (Lv50)', setOpts3.length > 0 && json(setOpts3) === json(machSets), json(setOpts3))
  await page.selectOption('[data-testid="pyramid-trainer-set"]', setOpts3[0])
  const t3 = (await openOf(pyrId)).pyramid.trainers[0]
  check('the trainer entry keeps its ONE species, the trainer id and the set', json(t3) === json({ species: sp('machamp'), result: 'W', trainerId: want3[0], setIndex: Number(setOpts3[0]) }), json(t3))
  await collect()

  // Floor 7: the BP line; Undo floor 7.
  for (let n = 3; n <= 7; n++) {
    await page.click('[data-testid="pyramid-next-floor"]')
    await page.waitForSelector(`[data-testid="run-log"] tr[data-battle-n="${n}"]`)
  }
  check('floor 7 completes challenge 1: its BP line, +5', /^Pyramid run 1, challenge 1\s*\+5/.test(norm(await appText(page, '[data-testid="bp-ledger"] tbody tr'))) && norm(await appText(page, '[data-testid="run-undo"]')) === 'Undo floor 7', norm(await appText(page, '[data-testid="bp-ledger"] tbody tr')))
  await page.click('[data-testid="run-undo"]')
  check('Undo floor 7 removes the floor, its lists and its BP line', (await page.$('[data-testid="run-log"] tr[data-battle-n="7"]')) == null && !(await appTexts(page, '[data-testid="bp-ledger"] tbody tr')).some((t) => /Pyramid run 1/.test(t)) && !(await readDoc()).battles.some((b) => b.runId === pyrId && b.n === 7) && (await floorN()) === '7')

  // Lost: the run ends on floor 7.
  await page.click('[data-testid="pyramid-mode-trainer"]')
  await pickTrainer('golem', sp('golem'))
  check('the Lost button names the trainer just saved; "Lost to another" is beside it for an unseen one', norm(await appText(page, '[data-testid="pyramid-trainer-lost"]')) === 'Lost to Golem' && norm(await appText(page, '[data-testid="pyramid-trainer-lost-other"]')) === 'Lost to another')
  await page.click('[data-testid="pyramid-trainer-lost"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="7"]')
  const row7 = await cells(page, '[data-testid="run-log"] tr[data-battle-n="7"]')
  check('Lost ends the run on floor 7: no strip, the row reads Golem (lost) and Lost', (await page.$('[data-testid="pyramid-add"]')) == null && /Golem\(lost\)/.test(row7) && row7.endsWith('| Lost | Edit') && (await readDoc()).runs.find((r) => r.id === pyrId).outcome === 'lost', row7)
  check('run head totals still match the logged data', norm(await appText(page, '[data-testid="run-totals"]')) === totalsText(await modelTotals()), norm(await appText(page, '[data-testid="run-totals"]')))
  await full('pyramid-log-full')

  // Home: the Pyramid insights.
  await page.click('[data-testid="tracker-all-runs"]')
  await page.waitForSelector('[data-testid="insight-pyramid"]')
  const insUi = await page.evaluate(() => Object.fromEntries(['wild', 'items', 'trainers'].map((k) => [k, [...document.querySelectorAll(`[data-testid="insight-pyramid-${k}"] tr`)].map((tr) => [Number(tr.dataset.id), Number(tr.lastElementChild.textContent)])])))
  const insModel = P.pyramidInsights(M.deriveTracker(M.normaliseTracker(await readDoc()), fd), { species: String, item: String })
  const desc = (l) => l.every((r, i) => i === 0 || l[i - 1][1] >= r[1])
  check('home: the Pyramid insights match the logged data (wild, items, trainers\' Pokémon; Unknown not counted), most first', ['wild', 'items', 'trainers'].every((k) => byId(insUi[k]) === byId(insModel[k]) && desc(insUi[k])) && byId(insUi.wild) === byId([[sp('pikachu'), 6], [sp('sableye'), 1]]) && insUi.trainers.length === 5, json(insUi))
  await collect()
  await full('pyramid-home-light')

  // Brandon, and round 41: three long runs written to storage with the app's own model.
  let J = M.normaliseTracker(await readDoc())
  J = M.startRun(J, PK, at, 'pyr-70')
  for (let n = 1; n <= 70; n++) {
    if (n === 21) J = P.editOpenFloor(J, 'pyr-70', (o) => ({ ...o, opponents: silverTeam }))
    J = P.closeFloor(J, fd, 'pyr-70', 'W', at, ids(`j${n}`))
  }
  const OPEN = { facility: 'pyramid', format: 'singles', levelMode: 'open' }
  J = M.startRun(J, OPEN, at, 'pyr-20')
  for (let n = 1; n <= 20; n++) J = P.closeFloor(J, fd, 'pyr-20', 'W', at, ids(`k${n}`))
  J = M.startRun(J, OPEN, at, 'pyr-280')
  for (let n = 1; n <= 280; n++) J = P.closeFloor(J, fd, 'pyr-280', 'W', at, ids(`m${n}`))
  await page.evaluate((d) => localStorage.setItem('pokeapp:frontier-tracker:v1', JSON.stringify(d)), J)
  await reopen('pyr-70')
  await page.waitForSelector('[data-testid="run-log"] tr[data-battle-n="70"]')
  const brainRows = await page.$$eval('[data-testid="run-log"] tr[data-brain]', (r) => r.map((x) => `${x.dataset.brainAfter}:${x.dataset.brain}`))
  check('Brandon\'s Brain rows after floors 21 (Silver) and 70 (Gold) only; no floor row carries one', json(brainRows) === '["21:silver","70:gold"]' && (await page.$$('[data-testid="run-log"] tr[data-battle-n][data-brain]')).length === 0, json(brainRows))
  const b21 = await cells(page, '[data-testid="run-log"] tr[data-brain-after="21"]')
  const b70 = await cells(page, '[data-testid="run-log"] tr[data-brain-after="70"]')
  check('... each with the 3-species team comparison: 21 his known Silver team, matches; 70 three Unknowns, differs', /Brandon · Silver.*Known team: .*· matches/.test(b21) && /\| Won \|/.test(b21) && (await page.$$eval('[data-testid="run-log"] tr[data-brain-after="21"] img.bf-sprite', (e) => e.length)) === 3 && /Brandon · Gold.*· differs/.test(b70), `${b21} // ${b70}`)
  await full('pyramid-brain-rows')
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-pyr-20"]')
  await page.waitForSelector('[data-testid="pyramid-brain"]')
  check('floor 21 of a run with no symbol: Brandon\'s three are picked in the strip', (await floorN()) === '21' && /Brandon · Silver · at the top, after this floor/.test(norm(await appText(page, '[data-testid="pyramid-brain"]'))))
  await collect()
  await full('pyramid-brain-floor-light')
  for (const i of [0, 1, 2]) {
    await page.click(`[data-testid="pyramid-brain-${i}"]`)
    await page.click(`[data-testid="pyramid-brain-${i}-list"] li[data-species-id="unknown"]`)
  }
  await page.click('[data-testid="pyramid-next-floor"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-brain-after="21"]')
  check('Next floor records the win over him: his row after floor 21, Won', /\| Won \|/.test(await cells(page, '[data-testid="run-log"] tr[data-brain-after="21"]')))
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-pyr-280"]')
  await page.waitForSelector('[data-testid="pyramid-add"]')
  check('floor 281 is round 41', norm(await appText(page, '[data-testid="pyramid-floor-label"]')) === 'Round 41 · floor 1 of 7')
  await page.click('[data-testid="pyramid-mode-item"]')
  check('round 41: no item chips, the search only', (await page.$('[data-testid="pyramid-item-picks"]')) == null && (await page.$('[data-testid="pyramid-item-none"]')) != null && (await page.$('[data-testid="pyramid-item-search"]')) != null)
  await page.click('[data-testid="pyramid-item-search"]')
  await page.keyboard.type('leftov')
  await page.click(`[data-testid="pyramid-item-search-list"] li[data-item-id="${it('Leftovers')}"]`)
  check('the item search reaches any Gen 3 item: Leftovers x1 on floor 281', json((await openOf('pyr-280')).pyramid.items) === json([{ itemId: it('Leftovers'), qty: 1 }]))
  await page.click('[data-testid="run-retire"]')
  await page.click('[data-testid="run-retire"]')
  await page.waitForSelector('[data-testid="run-log"] tr[data-retired-floor="281"]')
  const retiredRow = await cells(page, '[data-testid="run-log"] tr[data-retired-floor="281"]')
  check('retired mid-floor: floor 281 stays in the log with its Leftovers, "Retired", and in the totals', /Leftovers×1/.test(retiredRow) && retiredRow.endsWith('| Retired |') && / · 1 item$/.test(norm(await appText(page, '[data-testid="run-totals"]'))), `${retiredRow} // ${norm(await appText(page, '[data-testid="run-totals"]'))}`)
  // A saved Brain floor reopened: his three and the note.
  await page.click('[data-testid="tracker-all-runs"]')
  await page.click('[data-testid="tracker-run-pyr-70"]')
  await page.click('[data-testid="floor-70-edit"]')
  await page.waitForSelector('[data-testid="floor-70-editor"]')
  await page.click('[data-testid="floor-70-brain-0"]')
  await page.keyboard.type('arca')
  await page.click(`[data-testid="floor-70-brain-0-list"] li[data-species-id="${sp('arcanine')}"]`)
  await page.fill('[data-testid="floor-70-note"]', 'top')
  const b70d = (await readDoc()).battles.find((b) => b.runId === 'pyr-70' && b.n === 70)
  check('a reopened floor edits Brandon\'s three and its note', b70d.opponents[0] === sp('arcanine') && b70d.note === 'top' && /Arcanine/.test(await cells(page, '[data-testid="run-log"] tr[data-brain-after="70"]')))
  await collect()
  await page.click('[data-testid="floor-70-edit"]')
  await collect()
  const wantRegions = ['run-totals', 'pyramid-categories', 'floor-lists', 'pyramid-add', 'pyramid-head', 'pyramid-strip', 'pyramid-modes', 'pyramid-wild', 'pyramid-category', 'pyramid-wild-picks', 'pyramid-wild-search', 'pyramid-item', 'pyramid-item-picks', 'pyramid-item-search', 'pyramid-trainer', 'pyramid-trainer-more', 'pyramid-trainer-more-fields', 'pyramid-brain', 'pyramid-entries', 'pyramid-entries-trainers', 'pyramid-entries-wild', 'pyramid-entries-items', 'pyramid-floor-actions', 'floor-edit', 'floor-edit-brain', 'insight-pyramid', 'insight-pyramid-wild', 'insight-pyramid-items', 'insight-pyramid-trainers']
  const missingRegions = wantRegions.filter((r) => !seen.has(r))
  check('every new region is named for ?layout=1', missingRegions.length === 0, missingRegions.join(', '))
  await page.click('[data-testid="tracker-all-runs"]')

  // ---------------------------------------------------------------- themes
  hr('B10. BOTH THEMES: tokens only, accent within 2, no badge, no shadow')
  const setTheme = (t) => page.evaluate((t) => (document.documentElement.dataset.theme = t), t)
  for (const theme of ['light', 'dark']) {
    await setTheme(theme)
    const screens = [
      ['home', async () => page.click('[data-testid="tracker-all-runs"]').catch(() => {})],
      ['dome', async () => page.click('[data-testid="tracker-run-imp-dome-1"]')],
      ['factory4', async () => (await page.click('[data-testid="tracker-all-runs"]'), page.click('[data-testid="tracker-run-imp-factory-4"]'))],
      ['logging', async () => {
        await page.click('[data-testid="tracker-all-runs"]')
        await page.click('[data-testid="tracker-run-imp-factory-5"]')
        await page.click('[data-testid="log-opponent-0"]')
        await page.keyboard.type('ma')
      }],
      ['pyramid-log', async () => (await page.click('[data-testid="tracker-all-runs"]'), page.click(`[data-testid="tracker-run-${pyrId}"]`))],
      ['pyramid-brain', async () => (await page.click('[data-testid="tracker-all-runs"]'), page.click('[data-testid="tracker-run-pyr-70"]'))],
      ['pyramid-open', async () => {
        await page.click('[data-testid="tracker-all-runs"]')
        await page.click('[data-testid="tracker-run-pyr-20"]')
        // The second theme finds the category already picked on this floor.
        if (await page.$('[data-testid="pyramid-category-14"]')) await page.click('[data-testid="pyramid-category-14"]')
        await page.click(`[data-testid="pyramid-wild-${sp('sableye')}"]`)
        await page.click(`[data-testid="pyramid-wild-${sp('absol')}"]`)
      }],
    ]
    for (const [name, go] of screens) {
      await go()
      await page.waitForTimeout(250)
      const uses = await accentUses(page)
      check(`[${theme}] ${name}: accent within 2 uses`, uses.length <= 2, uses.join(' | '))
      const bs = await badgesAndShadows(page)
      check(`[${theme}] ${name}: no badge, no shadow`, bs.badges.length === 0 && bs.shadows === 0, json(bs).slice(0, 160))
      const colours = await page.evaluate(() => {
        const probe = (v) => {
          const el = document.createElement('span')
          el.style.color = `var(${v})`
          document.querySelector('.bf').appendChild(el)
          const c = getComputedStyle(el).color
          el.remove()
          return c
        }
        return { text: getComputedStyle(document.querySelector('.bf')).color, token: probe('--color-text-default'), muted: getComputedStyle(document.querySelector('.bf-cap')).color, mutedToken: probe('--color-text-muted') }
      })
      check(`[${theme}] ${name}: text and muted text are the theme's tokens`, colours.text === colours.token && colours.muted === colours.mutedToken, json(colours))
      if (theme === 'dark' || name === 'logging' || name.startsWith('pyramid')) await page.screenshot({ path: shot(`${name}-${theme}`) })
      if (name === 'logging') await page.keyboard.press('Escape')
    }
  }
  await setTheme('light')

  // ---------------------------------------------------------------- narrow
  hr('B11. NARROW (390 px): nothing clips (phone layout stays parked)')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, testId] of [['home', null], ['dome', 'tracker-run-imp-dome-1'], ['factory5', 'tracker-run-imp-factory-5'], ['pyramid-log', `tracker-run-${pyrId}`], ['pyramid-open', 'tracker-run-pyr-20']]) {
    await page.click('[data-testid="tracker-all-runs"]').catch(() => {})
    if (testId) await page.click(`[data-testid="${testId}"]`)
    await page.waitForTimeout(250)
    const fit = await page.evaluate(() => {
      const sc = document.querySelector('[data-testid="frontier-scroll-area"]').getBoundingClientRect()
      const over = []
      for (const el of document.querySelectorAll('.bf-page *')) {
        if (el.closest('.bf-tw') && !el.matches('.bf-tw')) continue // a wide table scrolls inside its wrapper
        const r = el.getBoundingClientRect()
        if (r.width && r.right > sc.right + 1) over.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40))
      }
      return { page: document.documentElement.scrollWidth <= innerWidth, n: over.length, over: over.slice(0, 4) }
    })
    check(`390 px ${name}: no region runs past the scroll area`, fit.page && fit.n === 0, json(fit))
    await page.screenshot({ path: shot(`narrow-${name}`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  hr('CONSOLE')
  const appErrors = consoleErrors.filter((e) => !/raw\.githubusercontent|github\.com|objects\.githubusercontent|Failed to load resource/.test(e))
  check('no console errors from the app', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
} finally {
  await browser?.close()
  await dev.stop()
}

hr('SUMMARY')
log(`  ${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`  FAILED: ${failures.length}`)
  for (const f of failures) log(`    - ${f}`)
  process.exit(1)
}
