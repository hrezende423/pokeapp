/**
 * verify:frontier-data -- the Battle Frontier data layer (src/modules/battle-frontier/data/)
 * and its rules bundle (public/data/frontier/emerald.json, scripts/frontier/build.mjs).
 *
 * Browser-free: the loader is bundled in memory by esbuild and run in Node over a
 * fetch that reads public/. Expected values are the decomp's (scripts/frontier/build.mjs
 * names each routine) or the owner's own log, docs/fixtures/bf-tracker.xlsx, parsed
 * here only (there is no import feature yet).
 *
 * The laziness check reads dist/: the gate builds it before any suite runs; run
 * `npx vite build` first when running this suite alone.
 */
import { build } from 'esbuild'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSheet } from './lib/xlsx.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

// ---------------------------------------------------------------- the loader in Node

const fetched = []
globalThis.fetch = async (url) => {
  const path = join(ROOT, 'public', String(url).replace(/^\//, ''))
  fetched.push(String(url))
  if (!existsSync(path)) return new Response('', { status: 404 })
  return new Response(readFileSync(path), { headers: { 'content-type': 'application/json' } })
}
const bundled = await build({
  stdin: {
    contents: [
      "export * from './src/modules/battle-frontier/data/index.ts'",
      "export { initDataLayer } from './src/data/index.ts'",
      "export { EAGER_DATA_FILES, PARTITION_DIRS } from './src/data/manifest.ts'",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'test' }) },
})
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)

hr('1. THE BUILD (scripts/frontier/build.mjs) AND THE BUNDLES IT CROSS-CHECKS')
const rules = json('public/data/frontier/emerald.json')
const trainerBundle = json('public/data/trainers/emerald.json')
const frontier = trainerBundle.facilities.find((f) => f.id === 'battle-frontier')
check('882 sets', rules.counts.sets === 882 && frontier.sets.length === 882)
check('300 regular trainers', rules.counts.trainers === 300 && frontier.trainers.filter((t) => !t.party).length === 300)
check(
  'gBattleFrontierHeldItems: 63 slots (slot 0 = none, 62 items)',
  rules.counts.held_item_slots === 63 && rules.held_items.length === 63 && rules.held_items[0] === null && rules.counts.held_items === 62,
)
check(
  '42 Brain Pokemon (7 facilities x 2 symbols x 3)',
  rules.counts.brain_pokemon === 42 && frontier.trainers.filter((t) => t.party).reduce((n, t) => n + t.party.length, 0) === 42,
)
// The build wrote these from the DECOMP side; here they meet the trainer bundle as it is now.
const regular = frontier.trainers.filter((t) => !t.party)
const samples = rules.checks.order_samples
const setDrift = Object.entries(samples.sets).filter(([i, k]) => frontier.sets[i]?.key !== k)
const trainerDrift = Object.entries(samples.trainers).filter(([i, n]) => regular[i]?.name?.toUpperCase() !== n)
check(
  `set order = decomp set index at ${Object.keys(samples.sets).length} sample indices, around every range edge`,
  Object.keys(samples.sets).length === 8 && setDrift.length === 0,
  setDrift.map(([i]) => i).join(),
)
check(
  `trainer order = decomp trainer id at ${Object.keys(samples.trainers).length} sample ids, around every ladder edge`,
  Object.keys(samples.trainers).length === 8 && trainerDrift.length === 0,
  trainerDrift.map(([i]) => i).join(),
)
const sortedJson = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v))
const fieldsOf = (s) => sortedJson({ key: s.key, species_id: s.species_id, moves: s.moves, item_id: s.item_id, nature_id: s.nature_id, evs: s.evs })
check(
  'named sets match the decomp field by field, EVs included (FRONTIER_MON_SUNKERN, FRONTIER_MON_SUICUNE_6)',
  same(rules.checks.named_sets.map((s) => s.key), ['FRONTIER_MON_SUNKERN', 'FRONTIER_MON_SUICUNE_6']) &&
    rules.checks.named_sets.every((s) => fieldsOf(frontier.sets[s.index]) === fieldsOf(s)),
)
check(
  'named trainers match the decomp field by field: class, name, set list (BRADY id 0, GRETEL id 299)',
  same(rules.checks.named_trainers.map((t) => t.id), [0, 299]) &&
    rules.checks.named_trainers.every((t) => {
      const b = regular[t.id]
      return b.class_id === t.class_id && b.name?.toUpperCase() === t.name && same(b.set_keys, t.set_keys)
    }),
)
check('pinned to the trainer build’s disassembly', rules.source === trainerBundle.sources.disassembly, rules.source)

hr('2. LAZY, PARTITIONED, GENERATION-SCOPED')
check('frontier/emerald.json is not an eager boot file', !api.EAGER_DATA_FILES.some((f) => f.includes('frontier')))
check('frontier is a partition directory (runtime CacheFirst)', api.PARTITION_DIRS.includes('frontier'))
const src = readdirSync(join(ROOT, 'src/modules/battle-frontier/data')).map((f) => readFileSync(join(ROOT, 'src/modules/battle-frontier/data', f), 'utf8'))
check('the loader imports no JSON statically', src.every((s) => !/from\s+['"][^'"]+\.json['"]/.test(s)))
const html = existsSync(join(ROOT, 'dist/index.html')) ? readFileSync(join(ROOT, 'dist/index.html'), 'utf8') : ''
const entry = /<script type="module"[^>]*src="[^"]*\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
check('dist/ is built (run `npx vite build`)', !!entry)
if (entry) {
  const code = readFileSync(join(ROOT, 'dist', entry), 'utf8')
  check('the entry chunk does not carry the Frontier loader', !code.includes('frontier/emerald.json'), entry)
  const sw = existsSync(join(ROOT, 'dist/sw.js')) ? readFileSync(join(ROOT, 'dist/sw.js'), 'utf8') : ''
  check('the service worker precaches data/frontier/emerald.json (offline before first view)', sw.includes('data/frontier/emerald.json'))
}
const frontierFetches = () => fetched.filter((u) => /\/data\/(frontier|trainers)\//.test(u))
check('importing the module fetches nothing', frontierFetches().length === 0)
check('isFrontierGeneration: 3 only', api.isFrontierGeneration(3) && ![1, 2, 4, 5, 9, null, undefined].some((g) => api.isFrontierGeneration(g)))
check('loadFrontierData(4) -> null, nothing fetched', (await api.loadFrontierData(4)) === null && frontierFetches().length === 0)
await api.initDataLayer()
const fd = await api.loadFrontierData(3)
check(
  'loadFrontierData(3) fetches the rules and the Emerald trainer partition, once',
  !!fd && same(frontierFetches().sort(), ['/data/frontier/emerald.json', '/data/trainers/emerald.json']),
  frontierFetches().join(' '),
)
check('a second call is served from memory', (await api.loadFrontierData(3)) === fd && frontierFetches().length === 2)
check('still null for another generation once loaded', (await api.loadFrontierData(9)) === null && api.peekFrontierData(9) === null)

hr('3. SETS AND TRAINERS')
const sets = fd.sets()
check('sets carry their decomp index', sets.length === 882 && sets.every((s, i) => s.index === i))
check('index > 849 is openOnly (32 sets); 849 is not', !sets[849].openOnly && sets[850].openOnly && sets.filter((s) => s.openOnly).length === 32)
const trainers = fd.trainers()
check('trainers carry id 0-299', trainers.length === 300 && trainers.every((t, i) => t.id === i) && trainers[0].name === 'Brady' && trainers[299].name === 'Gretel')
const withOpen = trainers.find((t) => t.setIndices.some((i) => i >= 850))
check(
  'an Open-only set is absent from the Lv50 pool and present at Open Level',
  !!withOpen &&
    fd.trainerSets(withOpen.id, 'lv50').every((s) => !s.openOnly) &&
    fd.trainerSets(withOpen.id, 'open').some((s) => s.openOnly) &&
    fd.trainerSets(withOpen.id, 'open').length === withOpen.setIndices.length,
  withOpen ? `trainer ${withOpen.id} ${withOpen.name}: ${fd.trainerSets(withOpen.id, 'lv50').length} Lv50 / ${fd.trainerSets(withOpen.id, 'open').length} Open sets` : '',
)

hr('4. TRAINER POOLS BY STREAK (GetRandomScaledFrontierTrainerId, GetFrontierTrainerFixedIvs)')
const pool = (facility, streak, extra = {}) => fd.trainerPoolForStreak({ facility, levelMode: 'lv50', streak, ...extra })
const r = (p) => `${p.idRange.from}-${p.idRange.to}`
let p = pool('tower', 0)
check('Tower streak 0 -> 0-99, IV 3', r(p) === '0-99' && !p.hard && p.ivBand.min === 3 && p.ivBand.max === 3)
p = pool('tower', 6)
check('streak 6 (7th battle of challenge 0) -> the Hard range 100-119, IV 6', r(p) === '100-119' && p.hard && p.ivBand.min === 6 && p.ivBand.max === 6)
p = pool('tower', 13)
check('streak 13 -> Hard row 1, 120-139, IV 9', r(p) === '120-139' && p.hard && p.ivBand.min === 9)
p = pool('tower', 49)
check(
  'streak 49 -> 200-299, ivBand 21 (21 for ids 200-219, 31 from 220)',
  r(p) === '200-299' && !p.hard && p.ivBand.min === 21 && p.ivBand.max === 31 && same(p.ivBand.byTrainerId, [{ from: 200, to: 219, iv: 21 }, { from: 220, to: 299, iv: 31 }]),
)
p = pool('tower', 62)
check('past challenge 7 the 7th battle stays on 200-299', r(p) === '200-299' && p.challenge === 8)
check('Palace and Arena use the Tower ladder', r(pool('palace', 6)) === '100-119' && r(pool('arena', 49)) === '200-299')
p = pool('dome', 0)
check(
  'Dome tournament 1: ten entrants from 0-99, five from 80-119',
  r(p) === '0-119' && same(p.draws.map((d) => [r(d), d.count]), [['0-99', 10], ['80-119', 5]]) && p.ivBand.min === 3 && p.ivBand.max === 6,
)
p = pool('pike', 0)
check('Pike challenge 1: 0-99, Hard Battle room 100-119', r(p) === '0-119' && same(p.draws.map((d) => [r(d), d.hard]), [['0-99', false], ['100-119', true]]))
check('Pike: the streak counts rooms (14 per challenge)', pool('pike', 14).challenge === 1 && pool('pike', 13).challenge === 0)
check('Pyramid floor 7 -> Hard row; floor 1 of challenge 2 -> 80-119', pool('pyramid', 6).hard && r(pool('pyramid', 6)) === '100-119' && r(pool('pyramid', 7)) === '80-119')
p = pool('factory', 20)
check('Factory battle 21 -> Hard 140-159, rental sets 267-371 at Lv50', p.hard && r(p) === '140-159' && same(p.factorySetRange, { from: 267, to: 371 }))
check('Factory Open Level challenge 2 -> rental sets 564-659', same(fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: 20 }).factorySetRange, { from: 564, to: 659 }))
check('Factory IVs read the Tower Lv50 streak: unknown -> the whole table', p.ivBand.rule === 'factory-table' && p.ivBand.readsTowerStreak && p.ivBand.max === 31)
check('Factory battle 1, Tower Lv50 streak 0 -> IV 3; battle 7 -> 6', pool('factory', 0, { towerLv50Streak: 0 }).ivBand.min === 3 && pool('factory', 6, { towerLv50Streak: 0 }).ivBand.min === 6)
check('Factory, Tower Lv50 challenge 8 -> the off-by-one row: random IVs', pool('factory', 0, { towerLv50Streak: 56 }).ivBand.random === true)
check('Factory, Tower Lv50 challenge 9 -> clamped to the last row, 31', pool('factory', 0, { towerLv50Streak: 63 }).ivBand.min === 31)
check(
  'levels: Lv50 = 50; Open = highest in party, at least 60',
  same(pool('tower', 0).level, { mode: 'lv50', level: 50 }) &&
    same(fd.trainerPoolForStreak({ facility: 'tower', levelMode: 'open', streak: 0 }).level, { mode: 'open', min: 60, max: 100, rule: 'highest-in-party' }),
)
check(
  'Factory Open Level: rentals are level 100, so opponents are 100',
  same(fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'open', streak: 0 }).level, { mode: 'open', min: 100, max: 100, rule: 'highest-in-party' }),
)
p = pool('tower', 1792)
check('the challenge is a u8: Tower streak 1792 reads as challenge 0 (0-99, IV 3)', p.challenge === 0 && r(p) === '0-99' && p.ivBand.max === 3)
check('Factory rental row wraps too: streak 1806 (challenge 258) -> row 2', same(pool('factory', 1806).factorySetRange, { from: 267, to: 371 }))
p = pool('tower', 34, { symbols: 0 })
check('Tower streak 34, no symbol: Anabel is due, the pool does not apply', p.brain?.battle === 35 && p.brain.symbol === 'silver' && /Anabel/.test(p.note ?? ''))
check('no `symbols`, or not due -> no brain flag', pool('tower', 34).brain === undefined && pool('tower', 33, { symbols: 0 }).brain === undefined)
p = pool('dome', 4, { symbols: 0 })
check('Dome, 4 tournaments won: Tucker is in this tournament', p.brain?.unitNumber === 5 && /Tucker/.test(p.note ?? ''))
check('doubles: no Brain is ever due', pool('tower', 34, { symbols: 0, format: 'doubles' }).brain === undefined)

hr('5. FRONTIER BRAINS (GetFrontierBrainStatus, sFrontierBrainStreakAppearances)')
const brain = (facility, symbols, streak = 0, format = 'singles') => fd.nextBrainAt({ facility, format, levelMode: 'lv50', streak, symbols })
const expected = {
  tower: ['battle', 35, 70],
  dome: ['tournament', 20, 40],
  palace: ['battle', 21, 42],
  arena: ['battle', 28, 56],
  factory: ['battle', 21, 42],
  pike: ['room', 28, 140],
  pyramid: ['floor', 21, 70],
}
for (const [facility, [unit, silver, gold]] of Object.entries(expected)) {
  const s = brain(facility, 0)
  const g = brain(facility, 1)
  check(`${facility}: Silver ${silver}, Gold ${gold} (${unit})`, s?.battle === silver && s.symbol === 'silver' && g?.battle === gold && g.symbol === 'gold' && s.unit === unit, `${s?.battle}/${g?.battle}`)
}
check('Dome: Silver in the 5th tournament, Gold in the 10th', brain('dome', 0).unitNumber === 5 && brain('dome', 1).unitNumber === 10)
check('the upcoming battle counts: Tower streak 34 -> 35; Pyramid streak 21 -> 21', brain('tower', 0, 34)?.battle === 35 && brain('pyramid', 0, 21)?.battle === 21)
check('past the Silver streak without it -> none this streak', brain('tower', 0, 40) === null)
check('both symbols: Silver again, then every 35 after 70', brain('tower', 2)?.symbol === 'silver' && brain('tower', 2, 70)?.battle === 105 && brain('tower', 2, 70)?.repeat)
check('Dome, both symbols, 10 tournaments won -> tournament 15 (battle 60)', brain('dome', 2, 10)?.unitNumber === 15 && brain('dome', 2, 10)?.battle === 60)
check('Brains are singles only', brain('tower', 0, 0, 'doubles') === null && brain('factory', 0, 0, 'doubles') === null)
const brains = fd.brains()
const ivs = Object.fromEntries(brains.map((b) => [b.facility, [b.ivs.silver, b.ivs.gold]]))
check(
  'Silver IVs: Tower 24, Dome 20, Arena 20, Palace/Pike/Pyramid 16; Gold 31',
  same(ivs, { tower: [24, 31], dome: [20, 31], palace: [16, 31], arena: [20, 31], factory: [15, 31], pike: [16, 31], pyramid: [16, 31] }),
  JSON.stringify(ivs),
)
const noland = brains.find((b) => b.facility === 'factory')
check('Noland: teamKind generated, no fixed team', noland.teamKind === 'generated' && noland.teams === null && !!noland.note)
check('the six other Brains: fixed teams of three', brains.filter((b) => b.facility !== 'factory').every((b) => b.teamKind === 'fixed' && b.teams.silver.length === 3 && b.teams.gold.length === 3))

hr('6. BATTLE POINTS AND THE EXCHANGE SERVICE CORNER')
check('Tower singles, first set -> 1 BP', fd.bpAward({ facility: 'tower', format: 'singles', completedSets: 1 })?.points === 1)
const anabel = fd.bpAward({ facility: 'tower', format: 'singles', completedSets: 5, brain: true })
check('a Brain win adds 10: Tower 5th set + Anabel -> 5 + 10', anabel?.base === 5 && anabel.brainBonus === 10 && anabel.points === 15)
check('Dome 5th tournament + Tucker -> 3 + 10', fd.bpAward({ facility: 'dome', format: 'singles', completedSets: 5, brain: true })?.points === 13)
check('rows clamp at the last', fd.bpAward({ facility: 'tower', format: 'singles', completedSets: 1000 })?.base === 15)
check('no Arena doubles', fd.bpAward({ facility: 'arena', format: 'doubles', completedSets: 1 }) === null)
check('balance cap 9999', fd.addBattlePoints(9990, 15) === 9999 && fd.addBattlePoints(9999, 1) === 9999 && fd.addBattlePoints(100, 5) === 105)
const key = (n) => n.toLowerCase().replace(/[^a-z]/g, '')
const holdPrices = Object.fromEntries(fd.bpShop().filter((e) => e.clerk === 'hold-items').map((e) => [key(e.name), e.price]))
check(
  'hold items: Leftovers/White Herb/Quick Claw/Mental Herb 48; Choice Band/King’s Rock/Focus Band/Scope Lens/Bright Powder 64',
  same(holdPrices, { leftovers: 48, whiteherb: 48, quickclaw: 48, mentalherb: 48, brightpowder: 64, choiceband: 64, kingsrock: 64, focusband: 64, scopelens: 64 }),
  JSON.stringify(holdPrices),
)
check('the shop: 30 entries over four clerks, every item resolved', fd.bpShop().length === 30 && fd.bpShop().every((e) => e.itemId != null || e.decor))
check('banned species: Mew, Mewtwo, Ho-Oh, Lugia, Celebi, Kyogre, Groudon, Rayquaza, Jirachi, Deoxys', same([...fd.bannedSpecies()].sort((a, b) => a - b), [150, 151, 249, 250, 251, 382, 383, 384, 385, 386]))

hr('7. SPECIES NAMES (resolveSpecies, Gen 3 scope)')
const names = { "farfetch'd": 83, 'Farfetch’d': 83, 'mr. mime': 122, 'Mr Mime': 122, 'ho-oh': 250, porygon2: 233, 'Nidoran♀': 29, 'nidoran f': 29, 'NIDORAN♂': 32, deoxys: 386, Swampert: 260 }
const wrong = Object.entries(names).filter(([n, id]) => fd.resolveSpecies(n) !== id)
check('lowercase, apostrophes, "mr. mime", gender signs', wrong.length === 0, wrong.map(([n]) => n).join(', '))
check('outside Gen 3 or not a species -> null', fd.resolveSpecies('lucario') === null && fd.resolveSpecies('missingno') === null && fd.resolveSpecies('-') === null)

hr('8. THE OWNER’S LOG (docs/fixtures/bf-tracker.xlsx)')
const rows = readSheet(join(ROOT, 'docs/fixtures/bf-tracker.xlsx'))
const header = rows.findIndex((row) => row.cells.A === 'attempt')
const data = rows.slice(header + 1).filter((row) => /^\d+$/.test(row.cells.A ?? ''))
const gap = data.findIndex((row, i) => i > 0 && row.r !== data[i - 1].r + 1)
const dome = data.slice(0, gap)
const factory = data.slice(gap)
check('two blocks: Dome 40 battles; Factory attempts of 6/3/7/40/7', dome.length === 40 && same(attemptLengths(factory), [6, 3, 7, 40, 7]), `${dome.length} / ${attemptLengths(factory)}`)
const speciesCells = [
  ...dome.flatMap((row) => ['C', 'D', 'E'].map((c) => row.cells[c])),
  ...factory.flatMap((row) => ['C', 'D', 'E', 'F', 'G', 'H'].map((c) => row.cells[c])),
  ...(/A ([^,]+), B ([^,]+), C (.+)$/.exec(rows.find((row) => /^## dome/.test(row.cells.B ?? ''))?.cells.H ?? '')?.slice(1) ?? []),
].filter((n) => n && n !== '-')
const unresolved = [...new Set(speciesCells.filter((n) => fd.resolveSpecies(n) == null))]
check('the log’s species cells were all read: 500 cells, 175 names', speciesCells.length === 500 && new Set(speciesCells).size === 175, `${speciesCells.length} / ${new Set(speciesCells).size}`)
check('every species in the log resolves', unresolved.length === 0, unresolved.join(', '))
const brainRows = (block) => block.filter((row) => Object.values(row.cells).some((v) => v === 'silver' || v === 'gold'))
const domeBrains = brainRows(dome)
const factoryBrains = brainRows(factory)
check(
  'Dome: Tucker at battles 20 (silver) and 40 (gold), as nextBrainAt says',
  same(domeBrains.map((row) => [Number(row.cells.B), row.cells.K]), [[brain('dome', 0).battle, 'silver'], [brain('dome', 1).battle, 'gold']]),
)
const ids = (row, cols) => cols.map((c) => fd.resolveSpecies(row.cells[c]))
const tucker = brains.find((b) => b.facility === 'dome')
check(
  'Dome: the log’s Tucker teams are the fixed teams',
  same(ids(domeBrains[0], ['C', 'D', 'E']), tucker.teams.silver.map((m) => m.species_id)) && same(ids(domeBrains[1], ['C', 'D', 'E']), tucker.teams.gold.map((m) => m.species_id)),
)
check('Factory: Noland at battle 21 (silver), as nextBrainAt says', same(factoryBrains.map((row) => [Number(row.cells.A), Number(row.cells.B), row.cells.I]), [[4, brain('factory', 0).battle, 'silver']]))
const fielded = ids(factoryBrains[0], ['C', 'D', 'E'])
const tableTeam = frontier.trainers.find((t) => t.key === 'brain-factory-silver').party.map((m) => m.species_id)
check('Factory: Noland’s logged team is not the sFrontierBrainsMons team', fielded.every((id) => !tableTeam.includes(id)), `${fielded} vs ${tableTeam}`)
// Evidence, not proof (the proof is FillFactoryBrainParty): the log does not say
// the level mode; its Noland team fits the Lv50 draw for his 21st battle.
const nolandPool = fd.trainerPoolForStreak({ facility: 'factory', levelMode: 'lv50', streak: 20 }).factorySetRange
const inPool = fielded.map((id) => sets.some((s) => s.species_id === id && s.index >= nolandPool.from && s.index <= nolandPool.to))
check(
  'Factory: each of Noland’s logged Pokemon has a set in the Lv50 challenge-3 rental range 267-371',
  same(nolandPool, { from: 267, to: 371 }) && inPool.every(Boolean),
  `${fielded} -> ${inPool}`,
)

console.log(`\n${failures.length ? `FAILED (${failures.length}):\n  - ${failures.join('\n  - ')}` : 'all passed'}`)
process.exit(failures.length ? 1 : 0)

// ---------------------------------------------------------------- helpers

function attemptLengths(block) {
  const out = []
  for (const row of block) {
    if (!out.length || row.cells.A !== block[block.indexOf(row) - 1]?.cells.A) out.push(0)
    out[out.length - 1] += 1
  }
  return out
}

