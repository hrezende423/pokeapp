/**
 * Collection v2: the schema and its migration, the per-generation fields, search
 * and filters, the Fits / Exact flags, and the Collection as a source for the
 * Damage calculator, Team Matchup and #9. Acceptance for docs/SPEC.md slice C.
 *
 * The rules run against the real modules in the page, so they read the real
 * bundle. The screens run against a seeded document written as a stored one
 * would be: one entry v1-shaped, the others v2.
 */

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { selectGeneration, withControlsOn } from './lib/controls.mjs'
import { goToPage } from './lib/nav.mjs'

const PORT = 4205
const KEY = 'pokeapp:team-builder:v1'
const SHOTS = new URL('./.verify-shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => fileURLToPath(new URL(name, SHOTS))

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const dev = await startDevServer({ port: PORT })
let browser
try {
  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(180000)
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })
  await selectGeneration(page, 4)

  // ------------------------------------------------------------------ 1
  hr('1. THE SCHEMA: v1 in, v2 out, nothing lost')
  const s = await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const schema = await import('/pokeapp/src/modules/collection/collectionSchema.ts')
    const sync = await import('/pokeapp/src/sync/teamSync.ts')
    const v1Entry = {
      id: 'c1', seq: 1, generation: 4, speciesId: 445, nickname: 'Rocky', level: 62,
      natureId: 3, effort: { attack: 100, speed: 252 }, buildId: 'b1',
    }
    const v1Doc = {
      builds: [{ id: 'b1', moveIds: [null, null, null, null] }], teams: [], nextBuildSeq: 2, nextTeamSeq: 1,
      collection: [v1Entry, { id: 'c2', seq: 2, generation: 4, speciesId: 373, nickname: '', level: 55, natureId: null, effort: {}, buildId: null }],
      nextEntrySeq: 3,
    }
    const n = store.normalise(JSON.parse(JSON.stringify(v1Doc)))
    const e = n.collection[0]
    const v1Kept = Object.keys(v1Entry).every((k) => JSON.stringify(e[k]) === JSON.stringify(v1Entry[k]))
    const defaults = {
      pokemonId: null, game: null, gender: null, shiny: false, abilityId: null, individual: {}, itemId: null,
      moveIds: [null, null, null, null], met: { location: '', level: null, date: null },
      ot: { name: '', id: '', language: null }, acquired: { date: null, method: null }, pokerus: 'none', ribbons: [],
    }
    const defaulted = Object.entries(defaults).filter(([k, v]) => JSON.stringify(e[k]) !== JSON.stringify(v)).map(([k]) => k)
    const idempotent = JSON.stringify(store.normalise(n)) === JSON.stringify(n)
    const entryIdem = JSON.stringify(schema.migrateEntry(schema.migrateEntry(v1Entry))) === JSON.stringify(schema.migrateEntry(v1Entry))

    // Unknown fields, top level and per entry, from a newer client.
    const future = store.normalise({ ...v1Doc, futureTop: { a: 1 }, collection: [{ ...v1Entry, futureField: 'x', met: { location: 'Route 1', level: 5, date: null, region: 'Kanto' } }] })

    // A v2 document as this client writes it.
    const v2Entry = {
      ...schema.migrateEntry(v1Entry), id: 'c1', gender: 'male', shiny: false, abilityId: 8, individual: { hp: 31, attack: 31 },
      itemId: 287, moveIds: [89, 337, null, null], met: { location: 'Wayward Cave', level: 24, date: '2026-10-30' },
      ot: { name: 'Hen', id: '41029', language: 'en' }, acquired: { date: '2026-10-30', method: 'caught' }, pokerus: 'cured',
      ribbons: [], futureField: 'kept',
    }
    const v2Doc = store.normalise({ builds: [{ id: 'b1', moveIds: [null, null, null, null] }], teams: [], nextBuildSeq: 2, nextTeamSeq: 1, collection: [v2Entry], nextEntrySeq: 2 })

    // mergeDocs: the cloud is v2, the device v1. Both sets kept, device entries renumbered after
    // the cloud's and their build re-pointed through the build map.
    const merged = sync.mergeDocs(v2Doc, store.normalise(JSON.parse(JSON.stringify(v1Doc))))
    const cloudKept = JSON.stringify(merged.collection[0]) === JSON.stringify(v2Doc.collection[0])

    // An older client (the v1 normalise, verbatim): it keeps only the top-level fields it knows
    // and spreads each entry. Writing back through it and reading here must lose nothing.
    const oldNormalise = (raw) => ({
      builds: raw.builds, teams: raw.teams, nextBuildSeq: raw.nextBuildSeq, nextTeamSeq: raw.nextTeamSeq,
      collection: Array.isArray(raw.collection) ? raw.collection : [],
      nextEntrySeq: raw.nextEntrySeq ?? (Array.isArray(raw.collection) ? raw.collection.length : 0) + 1,
    })
    const oldWrote = JSON.parse(JSON.stringify(oldNormalise(v2Doc)))
    const back = store.normalise(oldWrote)
    return {
      v1Kept, defaulted, idempotent, entryIdem, schemaVersion: n.schemaVersion,
      futureTop: JSON.stringify(future.futureTop), futureField: future.collection[0].futureField,
      futureMet: JSON.stringify(future.collection[0].met),
      merged: merged.collection.map((c) => `${c.id}->${c.buildId}`), nextEntry: merged.nextEntrySeq, cloudKept,
      deviceDefaults: merged.collection[1].pokerus === 'none' && merged.collection[1].moveIds.length === 4,
      mergedVersion: merged.schemaVersion,
      oldDropped: !('schemaVersion' in oldWrote),
      oldBack: JSON.stringify(back.collection[0]) === JSON.stringify(v2Doc.collection[0]),
      oldBackVersion: back.schemaVersion,
    }
  })
  check('a v1 entry keeps every v1 field exactly', s.v1Kept)
  check('and gains every v2 default', s.defaulted.length === 0, s.defaulted.join())
  check('normalise(normalise(x)) equals normalise(x)', s.idempotent)
  check('migrateEntry is idempotent', s.entryIdem)
  check('the document is written as schema 2', s.schemaVersion === 2, String(s.schemaVersion))
  check('an unknown top-level field survives normalise', s.futureTop === '{"a":1}', s.futureTop)
  check('an unknown entry field survives, and so does one inside met', s.futureField === 'x' && s.futureMet.includes('Kanto'), s.futureMet)
  check('mergeDocs of v2 cloud + v1 device keeps both sets and re-points buildId', JSON.stringify(s.merged) === '["c1->b1","c2->b2","c3->null"]' && s.nextEntry === 4, JSON.stringify(s.merged))
  check('the cloud entry keeps its v2 fields through the merge', s.cloudKept)
  check('the device entries come out migrated, as schema 2', s.deviceDefaults && s.mergedVersion === 2)
  check('an older client drops schemaVersion (so nothing may gate on it)', s.oldDropped)
  check('an older client\'s write-back keeps every v2 field and the unknown one', s.oldBack && s.oldBackVersion === 2)

  // ------------------------------------------------------------------ seed
  /* The screens' document, stored as a client would leave it: c2 is v1-shaped
     (written before v2), the rest v2. */
  const ids = await page.evaluate(async (key) => {
    const d = await import('/pokeapp/src/data/index.ts')
    const move = (n) => d.listMoves().find((m) => m.name === n).id
    const ability = (n) => d.listAbilities().find((a) => a.name === n).id
    const item = (n) => d.listItems().find((i) => i.name === n).id
    const nature = (n) => d.listNatures().find((x) => x.name === n).id
    const sp = (n) => d.listSpecies().find((x) => x.name === n).id
    const six = (v) => ({ hp: v, attack: v, defense: v, 'special-attack': v, 'special-defense': v, speed: v })
    const build = (o) => ({
      nickname: '', gender: null, shiny: false, level: 100, friendship: 70, itemId: null, abilityId: null, natureId: null,
      moveIds: [null, null, null, null], effort: {}, individual: {}, tags: [], notes: '', ...o,
    })
    const v2 = (o) => ({
      nickname: '', natureId: null, effort: {}, buildId: null, pokemonId: null, game: null, gender: null, shiny: false,
      abilityId: null, individual: {}, itemId: null, moveIds: [null, null, null, null],
      met: { location: '', level: null, date: null }, ot: { name: '', id: '', language: null },
      acquired: { date: null, method: null }, pokerus: 'none', ribbons: [], ...o,
    })
    const out = {
      garchomp: sp('garchomp'), salamence: sp('salamence'), azelf: sp('azelf'), swampert: sp('swampert'), pikachu: sp('pikachu'),
      jolly: nature('jolly'), sandVeil: ability('sand-veil'), scarf: item('choice-scarf'),
      moves: [move('earthquake'), move('dragon-claw'), move('stone-edge'), move('fire-fang')],
    }
    const doc = {
      builds: [
        build({ id: 'b1', generation: 4, speciesId: out.garchomp, pokemonId: out.garchomp, name: 'Sandstorm Sweeper', gender: 'male',
          natureId: out.jolly, abilityId: out.sandVeil, individual: six(31), effort: { attack: 252, defense: 4, speed: 252 } }),
        build({ id: 'b2', generation: 4, speciesId: out.salamence, pokemonId: out.salamence, name: 'Dragon Dancer' }),
      ],
      teams: [],
      nextBuildSeq: 3,
      nextTeamSeq: 1,
      collection: [
        v2({ id: 'c1', seq: 1, generation: 4, speciesId: out.garchomp, nickname: 'Rocky', level: 62, natureId: out.jolly,
          effort: { attack: 100, speed: 252 }, buildId: 'b1', game: 'platinum', gender: 'male', abilityId: out.sandVeil,
          individual: six(31), itemId: out.scarf, moveIds: out.moves, met: { location: 'Wayward Cave', level: 24, date: '2026-10-30' },
          ot: { name: 'Hen', id: '41029', language: 'en' }, acquired: { date: '2026-10-30', method: 'caught' }, pokerus: 'cured' }),
        { id: 'c2', seq: 2, generation: 4, speciesId: out.salamence, nickname: '', level: 55, natureId: null, effort: {}, buildId: null },
        v2({ id: 'c3', seq: 3, generation: 4, speciesId: out.azelf, level: 50, shiny: true, ot: { name: 'Ann', id: '00042', language: 'ja' },
          acquired: { date: '2026-09-01', method: 'gift' }, pokerus: 'infected' }),
        v2({ id: 'c4', seq: 4, generation: 3, speciesId: out.swampert, nickname: 'Mudkip', level: 40 }),
        v2({ id: 'c5', seq: 5, generation: 2, speciesId: out.pikachu, nickname: 'Sparky', level: 40, effort: { hp: 1000, special: 40000 },
          individual: { attack: 10, defense: 10, speed: 10, special: 10 }, acquired: { date: null, method: 'hatched' } }),
      ],
      nextEntrySeq: 6,
    }
    localStorage.setItem(key, JSON.stringify(doc))
    return out
  }, KEY)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })

  // ------------------------------------------------------------------ 2
  hr('2. EACH GENERATION SHOWS EXACTLY ITS ROW OF THE FIELD TABLE')
  /* docs/SPEC.md slice C "Per-generation fields", written out as literals so a
     wrong table in the code cannot agree with itself. */
  const SPEC_FIELDS = (gen, game) => {
    const all = ['species', 'nickname', 'level', 'game', 'moves', 'individual', 'effort', 'otName', 'otId', 'acquiredDate', 'acquiredMethod', 'build']
    const rows = {
      1: [],
      2: ['gender', 'shiny', 'item', 'pokerus', ...(game === 'crystal' ? ['metLocation', 'metLevel'] : [])],
      3: ['gender', 'shiny', 'nature', 'ability', 'item', 'metLocation', 'metLevel', 'otLanguage', 'pokerus'],
      4: ['gender', 'shiny', 'nature', 'ability', 'item', 'metLocation', 'metLevel', 'metDate', 'otLanguage', 'pokerus'],
    }
    return [...all, ...rows[gen]].sort()
  }
  await selectGeneration(page, 4)
  await goToPage(page, 'team-building', 'collection')
  await page.waitForSelector('[data-testid="col-species"]', { timeout: 60000 })
  for (const [gen, game] of [[1, 'yellow'], [2, 'crystal'], [2, 'gold-silver'], [3, 'emerald'], [4, 'platinum']]) {
    await selectGeneration(page, gen)
    await page.waitForSelector(`[data-layout="col-form"][data-generation="${gen}"]`, { timeout: 60000 })
    await page.selectOption('[data-testid="col-game"]', game)
    await page.waitForTimeout(80)
    const got = await page.evaluate(async ([g, vg]) => {
      const schema = await import('/pokeapp/src/modules/collection/collectionSchema.ts')
      const shown = [...document.querySelectorAll('[data-layout="col-form"] [data-field]')].map((e) => e.dataset.field).sort()
      const code = Object.keys(schema.collectionFields(g, vg)).sort()
      return { shown, code, disabled: [...document.querySelectorAll('[data-layout="col-form"] [data-field] select:disabled')].map((e) => e.closest('[data-field]').dataset.field) }
    }, [gen, game])
    const want = SPEC_FIELDS(gen, game)
    check(`Gen ${gen} ${game}: the form's fields are the SPEC table's row`, JSON.stringify(got.shown) === JSON.stringify(want), `${got.shown.join(',')} vs ${want.join(',')}`)
    check(`Gen ${gen} ${game}: collectionFields() agrees with the spec table`, JSON.stringify(got.code) === JSON.stringify(want), `${got.code.join(',')} vs ${want.join(',')}`)
    if (gen === 2) check(`Gen 2 ${game}: gender and shiny are derived, shown read-only`, JSON.stringify(got.disabled.sort()) === '["gender","shiny"]', got.disabled.join())
    else check(`Gen ${gen}: nothing is disabled (an era's missing field is absent)`, got.disabled.length === 0, got.disabled.join())
  }
  await page.screenshot({ path: shot('collection-gen4.png'), fullPage: true })

  // ------------------------------------------------------------------ 3
  hr('3. SEARCH AND FILTERS (the generation\'s entries only)')
  const q = await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const cq = await import('/pokeapp/src/modules/collection/collectionQuery.ts')
    const dq = await import('/pokeapp/src/modules/dex/query/dexQuery.ts')
    const data = store.readData()
    const rows = cq.collectionRows(data, 4)
    const sections = cq.collectionFilterSections(rows, 4)
    const count = (values) => dq.applyFilters(rows, sections, values).length
    const g1 = cq.collectionFilterSections(cq.collectionRows(data, 1), 1).flatMap((x) => x.filters)
    const g2rows = cq.collectionRows(data, 2)
    return {
      ids: rows.map((r) => r.entry.id),
      nickname: count({ name: 'rocky' }), species: count({ name: 'salamence' }), otName: count({ name: 'hen' }),
      otId: count({ name: '00042' }), none: count({ name: 'zzz' }),
      caught: count({ method: ['caught'] }), gift: count({ method: ['gift'] }), both: count({ method: ['caught', 'gift'] }),
      cured: count({ pokerus: ['cured'] }), infected: count({ pokerus: ['infected'] }), clean: count({ pokerus: ['none'] }),
      shinyYes: count({ shiny: 'yes' }), shinyNo: count({ shiny: 'no' }),
      fits: count({ fits: 'fits' }), exact: count({ fits: 'exact' }),
      gen1Hidden: g1.filter((f) => f.hidden).map((f) => f.key).sort(),
      gen2Shiny: g2rows.map((r) => `${r.entry.id}:${r.shiny}`),
    }
  })
  check('Gen 4 lists only its own entries (the selector scopes it)', JSON.stringify(q.ids) === '["c1","c2","c3"]', JSON.stringify(q.ids))
  check('search by nickname', q.nickname === 1, String(q.nickname))
  check('search by species', q.species === 1, String(q.species))
  check('search by OT name and by OT ID', q.otName === 1 && q.otId === 1, `${q.otName} ${q.otId}`)
  check('a search with no match narrows to none', q.none === 0)
  check('filter by method (one, the other, both)', q.caught === 1 && q.gift === 1 && q.both === 2, `${q.caught} ${q.gift} ${q.both}`)
  check('filter by Pokérus', q.cured === 1 && q.infected === 1 && q.clean === 1, `${q.cured} ${q.infected} ${q.clean}`)
  check('filter by shiny', q.shinyYes === 1 && q.shinyNo === 2, `${q.shinyYes} ${q.shinyNo}`)
  check('filter by Fits: any Build, then Exact', q.fits === 2 && q.exact === 1, `${q.fits} ${q.exact}`)
  check('Gen 1 hides Pokérus and shiny', JSON.stringify(q.gen1Hidden) === '["pokerus","shiny"]', q.gen1Hidden.join())
  check('Gen 2 shininess comes from the DVs', JSON.stringify(q.gen2Shiny) === '["c5:true"]', q.gen2Shiny.join())

  await selectGeneration(page, 4)
  await page.waitForSelector('[data-layout="col-form"][data-generation="4"]', { timeout: 60000 })
  const listRows = () => page.$$eval('[data-testid="col-list"] tbody tr', (els) => els.map((e) => e.dataset.testid.replace('col-entry-', '')))
  const search = async (term) => {
    await withControlsOn(page, () => page.fill('[data-testid="col-search"]', term))
    await page.waitForTimeout(150)
    return (await listRows()).join()
  }
  check('the bar\'s search narrows the list by nickname', (await search('Rocky')) === 'c1')
  check('by species', (await search('azelf')) === 'c3')
  check('by OT', (await search('Hen')) === 'c1')
  check('cleared, the list is whole again', (await search('')) === 'c1,c2,c3')
  const fitsText = await page.evaluate(() =>
    ['c1', 'c2', 'c3'].map((id) => document.querySelector(`[data-testid="col-fits-${id}"]`)?.textContent),
  )
  check('the list says Exact / Fits / No build, with the Build\'s label', JSON.stringify(fitsText) === '["Exact: Sandstorm Sweeper","Fits: Dragon Dancer","No build"]', JSON.stringify(fitsText))
  const listText = await page.$eval('[data-testid="col-list"]', (e) => e.innerText)
  check('a row shows nickname (species), level, effort, OT', listText.includes('Rocky (Garchomp)') && listText.includes('100 Atk / 252 Spe') && listText.includes('Hen 41029'), listText.slice(0, 160))
  await page.screenshot({ path: shot('collection-list.png') })

  // ------------------------------------------------------------------ 4
  hr('4. FITS AND EXACT')
  const t = await page.evaluate(async (ids) => {
    const c = await import('/pokeapp/src/modules/collection/candidates.ts')
    const schema = await import('/pokeapp/src/modules/collection/collectionSchema.ts')
    const six = (v) => ({ hp: v, attack: v, defense: v, 'special-attack': v, 'special-defense': v, speed: v })
    const entry = schema.migrateEntry({
      id: 'e', seq: 1, generation: 4, speciesId: ids.garchomp, nickname: '', level: 50, natureId: ids.jolly, effort: {}, buildId: null,
      gender: 'male', abilityId: ids.sandVeil, individual: six(31),
    })
    const build = (o) => ({
      id: 'x', generation: 4, speciesId: ids.garchomp, pokemonId: ids.garchomp, nickname: '', gender: 'male', shiny: false, level: 50,
      friendship: 70, itemId: null, abilityId: ids.sandVeil, natureId: ids.jolly, moveIds: [null, null, null, null], effort: {},
      individual: six(31), tags: [], notes: '', ...o,
    })
    const empty = build({ gender: null, abilityId: null, natureId: null, individual: {} })
    const v1 = schema.migrateEntry({ id: 'v', seq: 1, generation: 4, speciesId: ids.garchomp, nickname: '', level: 50, natureId: null, effort: {}, buildId: null })
    const zeros = { ...entry, individual: six(0) }
    // Gen 2: Pikachu (gender_rate 4) is female iff its Attack DV is 7 or less.
    const g2 = (atk) => schema.migrateEntry({ id: 'g', seq: 1, generation: 2, speciesId: ids.pikachu, nickname: '', level: 50, natureId: null, effort: {}, buildId: null, individual: { attack: atk, defense: 1, speed: 1, special: 1 } })
    const g2build = (atk) => build({ generation: 2, speciesId: ids.pikachu, pokemonId: ids.pikachu, gender: null, abilityId: null, natureId: null, individual: { attack: atk, defense: 1, speed: 1, special: 1 } })
    const exactB = build({ id: 'b-exact', name: 'Exact one' })
    const fitsB = build({ id: 'b-fits', name: 'Fits one', individual: { ...six(31), speed: 30 } })
    return {
      match: c.candidate(entry, build({})),
      ivDiff: c.candidate(entry, build({ individual: { ...six(31), speed: 30 } })),
      gender: c.candidate(entry, build({ gender: 'female' })),
      nature: c.candidate(entry, build({ natureId: ids.jolly + 1 })),
      ability: c.candidate(entry, build({ abilityId: ids.sandVeil + 1 })),
      species: c.candidate(entry, build({ speciesId: ids.salamence })),
      gen: c.candidate(entry, build({ generation: 3 })),
      emptyBuild: c.candidate(entry, empty),
      emptyExact: c.candidate(zeros, empty),
      v1Empty: c.candidate(v1, empty),
      v1Full: c.candidate(v1, build({ gender: null, abilityId: null, natureId: null, individual: six(0) })),
      g2same: c.candidate(g2(15), g2build(15)),
      g2gender: c.candidate(g2(0), g2build(15)),
      g2unknown: c.candidate(schema.migrateEntry({ id: 'u', seq: 1, generation: 2, speciesId: ids.pikachu, nickname: '', level: 50, natureId: null, effort: {}, buildId: null }), g2build(15)),
      target: c.candidateText(c.bestCandidate({ ...entry, buildId: 'b-fits' }, [exactB, fitsB])),
      best: c.candidateText(c.bestCandidate(entry, [fitsB, exactB])),
      none: c.candidateText(c.bestCandidate(entry, [])),
    }
  }, ids)
  check('a matching Build with equal IVs is Exact', t.match === 'exact', String(t.match))
  check('an IV difference is Fits, not Exact', t.ivDiff === 'fits', String(t.ivDiff))
  check('a gender, nature or ability mismatch is no fit', t.gender === null && t.nature === null && t.ability === null, `${t.gender} ${t.nature} ${t.ability}`)
  check('another species or generation is no fit', t.species === null && t.gen === null)
  check('a Build with empty fields fits anything of its species', t.emptyBuild === 'fits', String(t.emptyBuild))
  check('and is Exact only when every IV is known and equal (unset reads 0)', t.emptyExact === 'exact', String(t.emptyExact))
  check('a migrated v1 entry is never Exact', t.v1Empty === 'fits' && t.v1Full === 'fits', `${t.v1Empty} ${t.v1Full}`)
  check('Gen 2: the same Attack DV fits; a DV that flips the gender does not', t.g2same === 'exact' && t.g2gender === null, `${t.g2same} ${t.g2gender}`)
  check('Gen 2: an entry with no Attack DV is not read as DV 0, so it still fits', t.g2unknown === 'fits', String(t.g2unknown))
  check('the entry\'s own target Build is shown first when it fits', t.target === 'Fits: Fits one', t.target)
  check('otherwise Exact before Fits', t.best === 'Exact: Exact one', t.best)
  check('no Build reads "No build"', t.none === 'No build', t.none)

  /* Editing an entry through the form keeps a nested field the form does not
     know (written by a newer client). */
  await selectGeneration(page, 4)
  await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const e = store.readData().collection.find((x) => x.id === 'c1')
    store.updateEntry('c1', { met: { ...e.met, region: 'Sinnoh' }, ot: { ...e.ot, future: 1 } })
  })
  await page.click('[data-testid="col-edit-c1"]')
  await page.click('[data-testid="col-save"]')
  const kept = await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const e = store.readData().collection.find((x) => x.id === 'c1')
    return { region: e.met.region, future: e.ot.future }
  })
  check('saving an edit keeps unknown nested fields', kept.region === 'Sinnoh' && kept.future === 1, JSON.stringify(kept))

  // ------------------------------------------------------------------ 5
  hr('5. A COLLECTION ENTRY IN THE DAMAGE CALCULATOR')
  const calc = await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const sets = await import('/pokeapp/src/modules/calculators/damageSets.ts')
    const st = await import('/pokeapp/src/modules/calculators/damageCalcState.ts')
    const dmg = await import('/pokeapp/src/modules/calculators/damage/index.ts')
    const sm = await import('/pokeapp/src/modules/team-builder/statMath.ts')
    const bf = await import('/pokeapp/src/modules/team-builder/buildFacts.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    // The document as the app read it from localStorage: c2 was v1-shaped.
    const data = store.readData()
    const cat4 = sets.setCatalog(sets.speciesPickerOptions(4), [], data, 4)
    const c1 = data.collection.find((c) => c.id === 'c1')
    const set = cat4.byKey.get('c:c1')
    const side = set.apply(st.newSide(c1.speciesId, 4), 4)
    const raw = dmg.computeRawStats(st.toCalcPokemon(side), 4)
    const species = d.getSpecies(c1.speciesId)
    const bases = new Map(d.resolveStatsForGeneration(species.varieties.find((v) => v.is_default), 4).map((x) => [x.stat, x.base_stat]))
    const ID = { hp: 'hp', atk: 'attack', def: 'defense', spa: 'special-attack', spd: 'special-defense', spe: 'speed' }
    const want = Object.fromEntries(Object.entries(ID).map(([id, key]) => [id, sm.computeStat({
      generation: 4, level: c1.level, base: bases.get(key), key, effort: c1.effort, individual: c1.individual, nature: bf.natureModsFor(c1.natureId),
    })]))
    const keys = cat4.options.map((o) => o.value)
    // Gen 2: the Special Stat Exp is stored as one `special`; the calculator must count it.
    const c5 = data.collection.find((c) => c.id === 'c5')
    const cat2 = sets.setCatalog(sets.speciesPickerOptions(2), [], data, 2)
    const side2 = cat2.byKey.get('c:c5').apply(st.newSide(c5.speciesId, 2), 2)
    const raw2 = dmg.computeRawStats(st.toCalcPokemon(side2), 2)
    const pika = d.getSpecies(c5.speciesId)
    const spaBase = d.resolveStatsForGeneration(pika.varieties.find((v) => v.is_default), 2).find((x) => x.stat === 'special-attack').base_stat
    const g2 = (statExp) => sm.computeStat({ generation: 2, level: 40, base: spaBase, key: 'special-attack', effort: { 'special-attack': statExp }, individual: c5.individual, nature: { increased: null, decreased: null } })
    return {
      label: set?.label, hint: set?.hint, source: set?.source,
      v1Listed: cat4.byKey.has('c:c2'), otherGen: cat4.byKey.has('c:c4') || cat4.byKey.has('c:c5'),
      raw: JSON.stringify(raw), want: JSON.stringify(want),
      moves: JSON.stringify(side.moves) === JSON.stringify(c1.moveIds), item: side.itemId === c1.itemId, ability: side.abilityId === c1.abilityId,
      level: side.level, nature: side.natureId === c1.natureId,
      order: keys.indexOf('b:b1') < keys.indexOf('c:c1'),
      special: side2.effort.special, spa: raw2.spa, spaWant: g2(40000), spaZero: g2(0),
    }
  })
  check('an entry is a set, labelled as the Collection', calc.label === 'Garchomp (Rocky | Collection)' && calc.source === 'collection' && calc.hint === 'Lv 62', `${calc.label} ${calc.hint}`)
  check('a v1-shaped stored entry is a set too', calc.v1Listed)
  check('another generation\'s entries are not offered', !calc.otherGen)
  check('the Builds come before the Collection', calc.order)
  check('loaded, its stats are computeStat\'s for its level, IVs, EVs and nature', calc.raw === calc.want && calc.level === 62 && calc.nature, `${calc.raw} vs ${calc.want}`)
  check('it carries its moves, item and ability', calc.moves && calc.item && calc.ability, `${calc.moves} ${calc.item} ${calc.ability}`)
  check('Gen 2: its Special Stat Exp reaches the stat (non-zero, counted)', calc.special === 40000 && calc.spa === calc.spaWant && calc.spa > calc.spaZero, `${calc.special} ${calc.spa} ${calc.spaWant} ${calc.spaZero}`)

  // ------------------------------------------------------------------ 6
  hr('6. TEAM MATCHUP FROM THE COLLECTION')
  const tm = await page.evaluate(async () => {
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const resolve = await import('/pokeapp/src/modules/team-matchup/resolve.ts')
    const model = await import('/pokeapp/src/modules/team-matchup/model.ts')
    const game = await import('/pokeapp/src/modules/battle/game.ts')
    const r = resolve.resolveSetup(game.gameContext('platinum'), { ...model.emptySetup(), mySource: 'collection', collectionIds: ['c1', 'c2', 'c4'] }, store.readData(), null)
    return {
      mine: r.mine.map((m) => `${m.source}:${m.origin?.entryId}:${m.label}`), ids: r.mineBuildIds,
      problems: r.problems, moves: r.mine[0]?.moves.length, item: r.mine[0]?.itemId, gender: r.mine[0]?.gender,
    }
  })
  check('picked entries resolve, in order, as Collection battlers', JSON.stringify(tm.mine) === '["collection:c1:Rocky","collection:c2:Salamence"]' && JSON.stringify(tm.ids) === '["c1","c2"]', JSON.stringify(tm.mine))
  check('an entry of another generation is a problem line, left out', tm.problems.some((p) => p.includes('Mudkip') && p.includes('Gen 3')), tm.problems.join(' | '))
  check('a battler carries the entry\'s moves, item and gender', tm.moves === 4 && tm.item != null && tm.gender === 'M', `${tm.moves} ${tm.item} ${tm.gender}`)

  await page.evaluate(() => document.querySelector('[data-testid="nav-team-matchup"]').click())
  await page.waitForSelector('[data-testid="team-matchup"]', { timeout: 120000 })
  await page.selectOption('[data-testid="tm-game"]', 'platinum')
  await page.waitForSelector('[data-testid="tm-source"]', { timeout: 120000 })
  await page.selectOption('[data-testid="tm-source"]', 'collection')
  await page.click('[data-testid="tm-col-0-input"]')
  await page.waitForSelector('[data-testid="tm-col-0-list"] [role="option"]')
  const offered = await page.$$eval('[data-testid="tm-col-0-list"] [role="option"]', (els) => els.map((e) => e.textContent))
  check('the picker offers the game\'s generation only', offered.some((o) => o.startsWith('Rocky')) && offered.some((o) => o.startsWith('Azelf')) && !offered.some((o) => o.includes('Mudkip') || o.includes('Sparky')), offered.join(' / '))
  await page.fill('[data-testid="tm-col-0-input"]', 'Rocky')
  await page.keyboard.press('Enter')
  await page.click('[data-testid="tm-col-1-input"]')
  await page.fill('[data-testid="tm-col-1-input"]', 'Azelf')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tm-mine-roster"] > li').length === 2, null, { timeout: 30000 })
  const roster = await page.$eval('[data-testid="tm-mine-roster"]', (e) => e.innerText)
  check('the matchup runs with the picked team', roster.includes('Rocky') && roster.includes('Azelf'), roster.slice(0, 120))
  const link = await page.evaluate(async () => {
    const ms = await import('/pokeapp/src/modules/team-matchup/store.ts')
    const sc = ms.saveScenario('platinum', 'From the Collection', ms.setupFor(ms.readDoc(), 'platinum'))
    return sc.links.collectionId
  })
  check('a saved scenario links the lead Collection entry', link === 'c1', String(link))
  const shifted = await page.evaluate(async () => {
    const ms = await import('/pokeapp/src/modules/team-matchup/store.ts')
    const setup = ms.setupFor(ms.readDoc(), 'platinum')
    return ms.saveScenario('platinum', 'Shifted', { ...setup, collectionIds: ['gone', 'c4', 'c2'], lead: 0 }).links.collectionId
  })
  check('the link follows the resolved lead, past a deleted or other-generation pick', shifted === 'c2', String(shifted))
  await page.screenshot({ path: shot('collection-matchup.png') })

  // ------------------------------------------------------------------ 7
  hr('7. #9 EV REMAINING FROM A v2 ENTRY')
  const rmTotal = await page.evaluate(async () => {
    const rm = await import('/pokeapp/src/modules/tools/ev-remaining/remainingMath.ts')
    const store = await import('/pokeapp/src/modules/team-builder/store.ts')
    const data = store.readData()
    const c1 = data.collection.find((c) => c.id === 'c1')
    const b1 = data.builds.find((b) => b.id === 'b1')
    const v1 = { attack: 100, speed: 252 }
    return [rm.remaining(4, c1.effort, b1.effort).totalLeft, rm.remaining(4, v1, b1.effort).totalLeft]
  })
  check('the total is the v1 entry\'s', rmTotal[0] === rmTotal[1] && rmTotal[0] === 156, JSON.stringify(rmTotal))
  await selectGeneration(page, 4)
  await goToPage(page, 'team-building', 'collection')
  await page.waitForSelector('[data-testid="col-remaining-c1"]', { timeout: 60000 })
  await page.click('[data-testid="col-remaining-c1"]')
  await page.waitForSelector('[data-testid="rem-total"]', { timeout: 60000 })
  const remText = await page.$eval('[data-testid="rem-total"]', (e) => e.innerText.trim())
  check('"What’s left to train" opens #9 on the v2 entry: 156 EVs to go', remText === '156 EVs to go', remText)

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  if (browser) await browser.close()
  await dev.stop()
}

log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
