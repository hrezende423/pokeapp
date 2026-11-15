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
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
check('normalise drops junk and keeps the shape', json(M.normaliseTracker({ runs: [{ id: 'a' }, 5], battles: [{ id: 'b', runId: 'zz', n: 1, opponents: [1, 2, 3], result: 'W' }], bp: { opening: -3, ledger: [{ id: 'l', at: 'x', delta: 'no' }] } })) === json(M.EMPTY_TRACKER))
check('a merge keeps base runs first and appends the new ones', json(M.mergeTracker(F, D).runs.map((r) => r.id)) === json(F.runs.map((r) => r.id)) && M.mergeTracker(M.EMPTY_TRACKER, D).runs.length === 6)

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
check('the tracker store module imports no loader code (it is eager)', !/from '\.\.\/data'|from '\.\.\/data\/index'/.test(read('src/modules/battle-frontier/tracker/trackerStore.ts')) && !/^import (?!type)[^\n]*from '\.\.\/data'/m.test(read('src/modules/battle-frontier/tracker/model.ts')))

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
  check('the report says the tracker was merged', report === 'frontier-tracker: merged', report)
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
  check('Won stays disabled until the set\'s rentals are drafted', await page.$eval('[data-testid="log-won"]', (e) => e.disabled))
  await pickSpecies('log-opponent-2', 'mag', sp('magneton'))
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
  check('home lists it with today\'s date, not "(imported)"', /^Run 1 \| Singles \| Open Level \| \d{1,2} [A-Z][a-z]{2} \d{4} \| 0 \| Ongoing · 0 won$/.test(arenaRow), arenaRow)

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
      if (theme === 'dark' || name === 'logging') await page.screenshot({ path: shot(`${name}-${theme}`) })
      if (name === 'logging') await page.keyboard.press('Escape')
    }
  }
  await setTheme('light')

  // ---------------------------------------------------------------- narrow
  hr('B11. NARROW (390 px): nothing clips (phone layout stays parked)')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, testId] of [['home', null], ['dome', 'tracker-run-imp-dome-1'], ['factory5', 'tracker-run-imp-factory-5']]) {
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
