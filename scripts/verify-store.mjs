/**
 * verify:store -- the generic document store (src/store/documentStore.ts), the Team
 * Builder document on it, and the sync's row routing. No server, no browser, no
 * network: the app's TypeScript is imported in Node (lib/tsModule.mjs) over an
 * in-memory localStorage.
 */
import { importTs, memoryStorage } from './lib/tsModule.mjs'

const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const json = (x) => JSON.stringify(x)

/** A memoryStorage that records every key written, to prove a read writes nothing. */
function countingStorage() {
  const base = memoryStorage()
  const writes = []
  return {
    writes,
    get length() {
      return base.length
    },
    key: (i) => base.key(i),
    getItem: (k) => base.getItem(k),
    setItem: (k, v) => {
      writes.push(k)
      base.setItem(k, v)
    },
    removeItem: (k) => base.removeItem(k),
    clear: () => base.clear(),
  }
}
const keysOf = (s) => Array.from({ length: s.length }, (_, i) => s.key(i)).sort()

let ls = countingStorage()
globalThis.localStorage = ls

const ds = await importTs('src/store/documentStore.ts')
const tb = await importTs('src/modules/team-builder/store.ts')
const targets = await importTs('src/sync/syncTargets.ts')

// ---------------------------------------------------------------------------
hr('1. FORWARD-ONLY MIGRATIONS (v1 -> v2 -> v3)')
const ran = []
const notes = ds.defineDocument({
  name: 'test-notes',
  key: 'test:notes',
  version: 3,
  empty: { items: [], schemaVersion: 3 },
  migrations: {
    1: (d) => (ran.push(1), { ...d, items: d.items.map((text) => ({ text })), schemaVersion: 2 }),
    2: (d) => (ran.push(2), { ...d, items: d.items.map((i) => ({ ...i, done: false })), schemaVersion: 3 }),
  },
})
{
  const v1 = '{"items":["a","b"]}'
  ls.setItem('test:notes', v1)
  ls.writes.length = 0
  notes.reset()
  const got = notes.read()
  check(
    'a v1 document reads as v3 through both steps',
    json(got) === '{"items":[{"text":"a","done":false},{"text":"b","done":false}],"schemaVersion":3}' && json(ran) === '[1,2]',
    json(got),
  )
  check('its status: stored v1, not newer', json(notes.status()) === '{"storedVersion":1,"newer":false}', json(notes.status()))
  check('reading never writes: the stored string is identical and nothing was set', ls.getItem('test:notes') === v1 && ls.writes.length === 0, json(ls.writes))

  ran.length = 0
  ls.setItem('test:notes', '{"items":[{"text":"c"}],"schemaVersion":2}')
  notes.reset()
  check('a v2 document runs only the v2 -> v3 step', json(notes.read()) === '{"items":[{"text":"c","done":false}],"schemaVersion":3}' && json(ran) === '[2]', json(ran))

  ran.length = 0
  const v4 = '{"items":[{"text":"x","done":true,"pinned":true}],"schemaVersion":4}'
  ls.setItem('test:notes', v4)
  ls.writes.length = 0
  notes.reset()
  check('a NEWER (v4) document is kept as is, no migration run', json(notes.read()) === v4 && ran.length === 0, json(notes.read()))
  check('...and flagged, never downgraded', json(notes.status()) === '{"storedVersion":4,"newer":true}' && ls.getItem('test:notes') === v4 && ls.writes.length === 0, json(notes.status()))

  let threw = ''
  try {
    ds.defineDocument({ name: 'test-gap', key: 'test:gap', version: 3, empty: {}, migrations: { 1: (d) => d } })
  } catch (e) {
    threw = e.message
  }
  check('a missing migration step is refused at definition', threw === 'defineDocument(test-gap): no migration from v2', threw)
}

hr('2. STORAGE THAT THROWS (Safari private mode)')
{
  const throwing = {
    get length() {
      throw new Error('denied')
    },
    key: () => {
      throw new Error('denied')
    },
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
    removeItem: () => {},
    clear: () => {},
  }
  globalThis.localStorage = throwing
  notes.reset()
  let ok
  let after
  try {
    const empty = notes.read()
    notes.write({ items: [{ text: 'mem', done: false }], schemaVersion: 3 })
    after = notes.read()
    ok = json(empty) === '{"items":[],"schemaVersion":3}'
  } catch (e) {
    ok = false
    after = e.message
  }
  check('reads as empty, and a write still works in memory', ok && json(after) === '{"items":[{"text":"mem","done":false}],"schemaVersion":3}', json(after))
  globalThis.localStorage = ls
}

// ---------------------------------------------------------------------------
hr('3. EXPORT AND IMPORT')
const prefs = ds.defineDocument({
  name: 'test-prefs',
  key: 'test:prefs',
  version: 1,
  empty: { tags: [], schemaVersion: 1 },
  migrations: {},
  merge: (base, added) => ({ ...base, ...added, tags: [...base.tags, ...added.tags] }),
})
{
  check('listDocuments() holds both test documents', json(ds.listDocuments().map((d) => d.name)) === '["test-notes","test-prefs"]', json(ds.listDocuments().map((d) => d.name)))

  ls.setItem('test:notes', '{"items":[{"text":"keep","done":true}],"schemaVersion":3}')
  ls.setItem('test:prefs', '{"tags":["red"],"theme":"dark","schemaVersion":1}')
  notes.reset()
  prefs.reset()
  const before = { n: ls.getItem('test:notes'), p: ls.getItem('test:prefs') }
  const at = '2026-11-07T12:00:00.000Z'
  const e1 = ds.exportDocuments(undefined, { exportedAt: at })
  const parsed = JSON.parse(e1)
  check(
    'the export file: app, format, exportedAt, { name: { version, data } }',
    json(parsed) ===
      '{"app":"pokeapp","format":1,"exportedAt":"2026-11-07T12:00:00.000Z","documents":{"test-notes":{"version":3,"data":{"items":[{"text":"keep","done":true}],"schemaVersion":3}},"test-prefs":{"version":1,"data":{"tags":["red"],"theme":"dark","schemaVersion":1}}}}',
    json(parsed),
  )
  check('exportDocuments(names) exports only those', json(Object.keys(JSON.parse(ds.exportDocuments(['test-prefs'])).documents)) === '["test-prefs"]')

  ls.removeItem('test:notes')
  ls.removeItem('test:prefs')
  notes.reset()
  prefs.reset()
  const heard = []
  const off = notes.onLocalWrite(() => heard.push('notes'))
  const r = ds.importDocuments(e1, { mode: 'replace' })
  off()
  check(
    'a replace import reports each document',
    json(r) === '{"ok":true,"documents":[{"name":"test-notes","result":"replaced","fromVersion":3,"toVersion":3},{"name":"test-prefs","result":"replaced","fromVersion":1,"toVersion":1}]}',
    json(r),
  )
  check('the stored strings are byte-identical to before the export', ls.getItem('test:notes') === before.n && ls.getItem('test:prefs') === before.p)
  check('a second export is byte-identical to the first', ds.exportDocuments(undefined, { exportedAt: at }) === e1)
  check('an import is a local write (the sync uploads it)', json(heard) === '["notes"]', json(heard))

  const older = json({ app: 'pokeapp', format: 1, exportedAt: at, documents: { 'test-notes': { version: 1, data: { items: ['q'] } } } })
  const ro = ds.importDocuments(older, { mode: 'replace' })
  check(
    'an older document is migrated forward on import',
    json(ro.documents) === '[{"name":"test-notes","result":"replaced","fromVersion":1,"toVersion":3}]' &&
      ls.getItem('test:notes') === '{"items":[{"text":"q","done":false}],"schemaVersion":3}',
    ls.getItem('test:notes'),
  )

  const merge = json({ app: 'pokeapp', format: 1, exportedAt: at, documents: { 'test-prefs': { version: 1, data: { tags: ['blue'], schemaVersion: 1 } }, 'test-notes': { version: 3, data: { items: [], schemaVersion: 3 } } } })
  const rm = ds.importDocuments(merge, { mode: 'merge' })
  check(
    "a merge import uses the document's merge, and replaces one without",
    json(rm.documents.map((d) => d.result)) === '["merged","replaced"]' &&
      ls.getItem('test:prefs') === '{"tags":["red","blue"],"theme":"dark","schemaVersion":1}' &&
      ls.getItem('test:notes') === '{"items":[],"schemaVersion":3}',
    ls.getItem('test:prefs'),
  )

  const snap = ls.getItem('test:notes')
  const newer = json({ app: 'pokeapp', format: 1, exportedAt: at, documents: { 'test-notes': { version: 4, data: { items: [] } }, 'no-such': { version: 1, data: {} } } })
  const rn = ds.importDocuments(newer, { mode: 'replace' })
  check(
    'a newer-than-supported document is refused with a reason; an unknown one skipped',
    json(rn) ===
      '{"ok":true,"documents":[{"name":"test-notes","result":"refused","reason":"Version 4 is newer than this app supports (3).","fromVersion":4},{"name":"no-such","result":"skipped","reason":"No such document in this version of the app."}]}' &&
      ls.getItem('test:notes') === snap,
    json(rn),
  )
  check('malformed JSON is refused', json(ds.importDocuments('{"app":"pokeapp",', { mode: 'replace' })) === '{"ok":false,"reason":"Not a JSON file.","documents":[]}')
  check(
    'a foreign app is refused',
    json(ds.importDocuments(json({ app: 'otherapp', format: 1, documents: {} }), { mode: 'replace' })) === '{"ok":false,"reason":"Not a pokeapp export.","documents":[]}',
  )
  check(
    'an unknown format is refused',
    json(ds.importDocuments(json({ app: 'pokeapp', format: 2, documents: {} }), { mode: 'replace' })) === '{"ok":false,"reason":"Unsupported export format: 2.","documents":[]}',
  )
}

// ---------------------------------------------------------------------------
hr('4. THE TEAM BUILDER DOCUMENT: v1 and v2 load exactly as normalise() reads them')
const KEY = 'pokeapp:team-builder:v1'
const v1Doc = {
  builds: [
    {
      id: 'b1', generation: 4, speciesId: 445, pokemonId: 445, nickname: 'Chompy', gender: 'male', shiny: false,
      level: 50, friendship: 70, itemId: 230, abilityId: 24, natureId: 4, moveIds: [337, 89, 200, null],
      effort: { hp: 4, attack: 252, speed: 252 }, individual: {}, tags: ['sweeper'], notes: 'v1 build',
    },
    {
      id: 'b2', generation: 4, speciesId: 373, pokemonId: 373, nickname: '', gender: null, shiny: false,
      level: 55, friendship: 70, itemId: null, abilityId: 22, natureId: null, moveIds: [337, null, null, null],
      effort: {}, individual: {}, tags: [], notes: '',
    },
  ],
  teams: [{ id: 't1', seq: 1, generation: 4, versionGroup: 'platinum', name: 'Main', memberIds: ['b1', 'b2', null, null, null, null], notes: 'v1 team' }],
  nextBuildSeq: 3,
  nextTeamSeq: 2,
  collection: [
    { id: 'c1', seq: 1, generation: 4, speciesId: 445, nickname: 'Rocky', level: 62, natureId: 3, effort: { attack: 100, speed: 252 }, buildId: 'b1' },
    { id: 'c2', seq: 2, generation: 4, speciesId: 373, nickname: '', level: 55, natureId: null, effort: {}, buildId: null },
  ],
  nextEntrySeq: 3,
}
const v2Doc = {
  builds: [
    {
      id: 'b1', generation: 3, speciesId: 6, pokemonId: 6, nickname: 'Blaze', gender: 'female', shiny: true,
      level: 100, friendship: 255, itemId: 12, abilityId: 66, natureId: 10, moveIds: [53, 19, null, null],
      effort: { 'special-attack': 252, speed: 252 }, individual: { hp: 31 }, tags: [], notes: '', name: 'Sun set',
    },
  ],
  teams: [{ id: 't4', seq: 4, generation: 3, memberIds: ['b1', null, null, null, null, null], notes: '', purpose: 'battle' }],
  nextBuildSeq: 2,
  nextTeamSeq: 5,
  collection: [
    {
      id: 'c7', seq: 7, generation: 3, speciesId: 6, nickname: 'Blaze', level: 80, natureId: 10,
      effort: { speed: 200 }, buildId: 'b1', pokemonId: 6, game: 'emerald', gender: 'female', shiny: true,
      abilityId: 66, individual: { hp: 31, speed: 30 }, itemId: 12, moveIds: [53, null, null, null],
      met: { location: 'Route 113', level: 5, date: null }, ot: { name: 'Hen', id: '12345', language: 'en' },
      acquired: { date: '2026-11-01', method: 'caught' }, pokerus: 'cured', ribbons: ['champion'],
    },
  ],
  nextEntrySeq: 8,
  schemaVersion: 2,
  laterField: 'kept',
}
const fieldsPresent = (fixture, got) =>
  ['builds', 'teams', 'collection'].flatMap((list) =>
    fixture[list].flatMap((rec, i) =>
      Object.keys(rec)
        .filter((k) => json(got[list]?.[i]?.[k]) !== json(rec[k]))
        .map((k) => `${list}[${i}].${k}`),
    ),
  )
for (const [label, fixture] of [['v1', v1Doc], ['v2', v2Doc]]) {
  ls.clear()
  const stored = json(fixture)
  ls.setItem(KEY, stored)
  ls.writes.length = 0
  tb.__resetStoreCache()
  const got = tb.readData()
  const today = tb.normalise(JSON.parse(stored))
  check(`${label}: the store reads byte-for-byte what normalise() returns`, json(got) === json(today))
  check(`${label}: the key and the stored string are untouched, nothing written`, json(keysOf(ls)) === `["${KEY}"]` && ls.getItem(KEY) === stored && ls.writes.length === 0, json(ls.writes))
  const missing = fieldsPresent(fixture, got)
  check(`${label}: every builds, teams and collection field of the fixture is present`, missing.length === 0, missing.join(', '))
  check(`${label}: read as schemaVersion 2, flagged as not newer`, got.schemaVersion === 2 && json(tb.teamBuilderDocument.status()) === `{"storedVersion":${label === 'v1' ? 1 : 2},"newer":false}`, json(tb.teamBuilderDocument.status()))
}
{
  ls.clear()
  ls.setItem(KEY, json(v1Doc))
  tb.__resetStoreCache()
  const c1 = tb.readData().collection[0] ?? {}
  check(
    'v1: a Collection entry gains its v2 defaults',
    json([c1.pokemonId, c1.game, c1.shiny, c1.moveIds, c1.met, c1.ot, c1.acquired, c1.pokerus, c1.ribbons]) ===
      '[null,null,false,[null,null,null,null],{"location":"","level":null,"date":null},{"name":"","id":"","language":null},{"date":null,"method":null},"none",[]]',
    json(c1),
  )
  ls.setItem(KEY, json(v2Doc))
  tb.__resetStoreCache()
  const d2 = tb.readData()
  check("v2: the v2 Collection fields and an unknown top-level field survive", json([d2.collection[0].met, d2.collection[0].pokerus, d2.laterField]) === '[{"location":"Route 113","level":5,"date":null},"cured","kept"]')

  ls.clear()
  tb.__resetStoreCache()
  check('absent: reads as the empty document', json(tb.readData()) === '{"builds":[],"teams":[],"nextBuildSeq":1,"nextTeamSeq":1,"collection":[],"nextEntrySeq":1,"schemaVersion":2}' && ls.length === 0)
  ls.setItem(KEY, '{not json')
  tb.__resetStoreCache()
  check('corrupt: reads as the empty document, the bad string left alone', tb.readData().builds.length === 0 && ls.getItem(KEY) === '{not json')

  ls.setItem(KEY, json({ ...v2Doc, schemaVersion: 3 }))
  tb.__resetStoreCache()
  const d3 = tb.readData()
  check('a v3 Team Builder document (a newer client) is flagged and keeps schemaVersion 3', d3.schemaVersion === 3 && tb.teamBuilderDocument.status().newer === true && d3.laterField === 'kept', json(tb.teamBuilderDocument.status()))

  ls.clear()
  tb.__resetStoreCache()
  const heard = []
  const off = tb.onLocalWrite(() => heard.push('write'))
  tb.replaceData(v1Doc)
  const afterReplace = ls.getItem(KEY)
  tb.createBuild({ ...v1Doc.builds[1], id: undefined, nickname: 'New' })
  off()
  check('replaceData stores normalise(doc) and is not a local write', afterReplace === json(tb.normalise(v1Doc)) && json(heard) === '["write"]', json(heard))
  check('a write persists at the same key', JSON.parse(ls.getItem(KEY)).builds.map((b) => b.id).join() === 'b1,b2,b3')
}

// ---------------------------------------------------------------------------
hr('5. SYNC ROW ROUTING (pure; no network)')
{
  check("'team-builder' -> team_builder_docs (doc column), as before", json(targets.syncTargetFor('team-builder')) === '{"table":"team_builder_docs","column":"doc","named":false}')
  check('any other document -> user_documents, by name', json(targets.syncTargetFor('notes')) === '{"table":"user_documents","column":"data","named":true}')
  check("the Team Builder keeps its sync bookkeeping key", targets.syncMetaKeyFor('team-builder') === 'pokeapp:team-builder:sync' && targets.syncMetaKeyFor('notes') === 'pokeapp:sync:notes')
  const cases = [
    [{ status: 404, code: '' }, true],
    [{ code: '42P01' }, true],
    [{ status: 404, code: 'PGRST205' }, true],
    [{ status: 401, code: '42501' }, false],
    [{ status: 500 }, false],
    [null, false],
  ]
  const wrong = cases.filter(([e, want]) => targets.isMissingTable(e) !== want)
  check('isMissingTable: 404, 42P01, PGRST205 yes; 401, 500, null no', wrong.length === 0, json(wrong))
  check('a missing user_documents table -> local-only', targets.syncErrorOutcome('notes', { status: 404, code: 'PGRST205' }) === 'local-only')
  check('a missing team_builder_docs is still an error', targets.syncErrorOutcome('team-builder', { status: 404, code: 'PGRST205' }) === 'error')
  check('any other failure on user_documents is an error', targets.syncErrorOutcome('notes', { status: 500, code: '' }) === 'error')
}

hr(failures.length ? `FAILED: ${failures.length}` : 'ALL PASS')
if (failures.length) {
  failures.forEach((f) => console.log(`  - ${f}`))
  process.exit(1)
}
