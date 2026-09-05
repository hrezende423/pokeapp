/**
 * Verification for the Team Building legal-moveset function.
 *
 * `src/modules/team-builder/legalMoveset.ts` is a data-layer function with no UI
 * yet, so there is no screen to drive -- but "reported done" still is not
 * "verified", and type-checking is not verification. This suite therefore runs the
 * REAL module against the REAL bundle in a REAL browser: it starts the Vite dev
 * server, opens the app so the eager bundle boots exactly as it does for a user,
 * then dynamically imports the module by its dev-server URL and calls it.
 *
 * WHY THE DEV SERVER AND NOT `vite preview`, which every other suite uses: the
 * function is not reachable from any rendered screen yet, so the suite has to
 * import it directly, and only the dev server serves `/src/**` as transformable
 * modules. Because Vite keys modules by URL, `/src/data/index.ts` imported here is
 * the SAME instance the app booted -- so `initDataLayer()` has already run and the
 * partitions load through the same on-demand loader the species Learnset tab uses.
 * Nothing is stubbed and no data is re-read from disk.
 *
 * It prints every move list in full rather than only asserting over them. The
 * point of the exercise is the actual output, and a suite that only says PASS
 * cannot be checked by eye against Bulbapedia.
 *
 * Usage: node scripts/verify-legal-moveset.mjs
 */

import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'

const PORT = 4189
const MODULE_URL = '/pokeapp/src/modules/team-builder/index.ts'
/* The era-correct move-type resolver lives in the DATA LAYER, not in this module --
   reached at its own path so the suite proves where it actually is. */
const MOVE_ERA_URL = '/pokeapp/src/data/moveEra.ts'

const failures = []
const log = (...a) => console.log(...a)
const hr = (t) => {
  log('')
  log('='.repeat(78))
  log(t)
  log('='.repeat(78))
}
function check(label, ok, detail = '') {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Print a move list the way a reviewer can diff it against a wiki page. */
function printMoves(moves, { withLevel = false } = {}) {
  const width = 78
  let line = '   '
  for (const m of moves) {
    const lvl = withLevel && m.min_level != null ? `@${m.min_level}` : ''
    const tag = `${m.name}${lvl}${m.is_event ? '*' : ''} [${m.sources.join(',')}]`
    if (line.length + tag.length + 2 > width) {
      log(line)
      line = '   '
    }
    line += `${tag}, `
  }
  if (line.trim()) log(line.replace(/, $/, ''))
}

/*
  Started through lib/devServer.mjs so an orphaned server on this port is a loud
  failure rather than a silent stale-build run -- see that file's header.
*/
const dev = await startDevServer({ port: PORT })
const APP_URL = dev.url

let browser
try {
  log(`dev server ready at ${APP_URL}`)

  browser = await chromium.launch()
  /* The PWA service worker would otherwise answer bundle requests from a previous
     build's precache, which is the same stale-code hazard from the other end. */
  const context = await browser.newContext({ serviceWorkers: 'block' })
  /* A cold dev server transforms every module on the first request, which takes
     longer than Playwright's 30s default -- and much longer than `vite preview`. */
  context.setDefaultNavigationTimeout(120000)
  const page = await context.newPage()
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })

  /*
    The eager bundle is what every accessor in the module depends on, so wait on
    the data layer itself rather than on a rendered element -- a species grid on
    screen would be a proxy for the same fact, and a slower one.
  */
  await page.waitForFunction(
    async (url) => {
      const data = await import(url)
      return data.isDataLayerReady()
    },
    '/pokeapp/src/data/index.ts',
    { timeout: 60000 },
  )
  log('eager data bundle indexed')

  /** Call getLegalMoveset in the page and bring the plain result back. */
  const moveset = (query) =>
    page.evaluate(
      async ([url, q]) => {
        const tb = await import(url)
        return await tb.getLegalMoveset(q)
      },
      [MODULE_URL, query],
    )

  /**
   * Every move name reachable by a set of species through a set of methods, read
   * straight from the partitions.
   *
   * This is the INDEPENDENT side of each assertion: it goes to the raw learnset
   * rows rather than calling the module, so "Torchic's result excludes
   * Combusken-only moves" is checked against the data and not against the same
   * code that produced the answer.
   */
  const rawNames = (speciesIds, generations, methods) =>
    page.evaluate(
      async ([url, ids, gens, ms]) => {
        const data = await import(url)
        const groups = data
          .listVersionGroups()
          .filter((vg) => gens.includes(vg.generation_id))
          .map((vg) => vg.name)
        const names = new Set()
        for (const group of groups) {
          for (const id of ids) {
            for (const row of await data.getLearnsetsForSpecies(id, group)) {
              if (ms.length && !ms.includes(row.method)) continue
              const species = data.getSpecies(row.species_id)
              const variety = species?.varieties.find((v) => v.is_default) ?? species?.varieties[0]
              if (variety && row.pokemon_id !== variety.pokemon_id) continue
              names.add(data.getMove(row.move_id)?.display_name ?? `#${row.move_id}`)
            }
          }
        }
        return [...names]
      },
      ['/pokeapp/src/data/index.ts', speciesIds, generations, methods],
    )

  const blockGroups = await page.evaluate(
    async ([url]) => {
      const tb = await import(url)
      return { a: tb.versionGroupNamesInBlock(2), b: tb.versionGroupNamesInBlock(3) }
    },
    [MODULE_URL],
  )

  // ------------------------------------------------------------------ blocks
  hr('TRADE BLOCKS — the two unions the whole function is scoped by')
  log(`  Block A (Gen 1-2): ${blockGroups.a.join(', ')}`)
  log(`  Block B (Gen 3-4): ${blockGroups.b.join(', ')}`)
  const overlap = blockGroups.a.filter((n) => blockGroups.b.includes(n))
  check('the two blocks share no version group', overlap.length === 0, `overlap=[${overlap}]`)
  check(
    'every one of the bundle’s 14 version groups lands in exactly one block',
    blockGroups.a.length + blockGroups.b.length === 14,
    `${blockGroups.a.length} + ${blockGroups.b.length}`,
  )
  check(
    'a generation outside 1-4 throws rather than guessing a block',
    await page.evaluate(
      async ([url]) => {
        const tb = await import(url)
        try {
          tb.versionGroupNamesInBlock(5)
          return false
        } catch {
          return true
        }
      },
      [MODULE_URL],
    ),
  )

  // ----------------------------------------------------------------- case (a)
  hr('(a) GEN 3 BULBASAUR, LEVEL 12 — the breeding backdoor')
  const a = await moveset({ speciesId: 1, level: 12, generation: 3 })
  log(`  lineage=${JSON.stringify(a.lineage)}  block=${a.tradeBlock.id}  moves=${a.moves.length}`)
  printMoves(a.moves, { withLevel: true })
  const aNames = new Set(a.moves.map((m) => m.name))

  // Level-up moves this build could not have reached by grinding to 12, and that
  // no TM/tutor/egg route supplies either -- so they are in the list ONLY because
  // Gen 2-4 level-up moves are not level-gated. That is the rule under test.
  const aLateOnly = a.moves.filter(
    (m) => m.min_level != null && m.min_level > 12 && m.sources.length === 1,
  )
  log('')
  log(`  level-up moves above level 12, reachable no other way: ${aLateOnly.length}`)
  log(`   ${aLateOnly.map((m) => `${m.name}@${m.min_level}`).join(', ')}`)
  check('level-up moves are NOT level-gated in Gen 3', aLateOnly.length > 0)

  // The named half of the case: a move that is BOTH a high-level level-up move and
  // an egg or TM/tutor move must be present.
  const aBackdoor = a.moves.filter(
    (m) =>
      m.min_level != null &&
      m.min_level > 12 &&
      (m.sources.includes('egg') || m.sources.includes('machine') || m.sources.includes('tutor')),
  )
  log('')
  log('  high-level level-up moves that ALSO have an egg/TM/tutor route:')
  log(`   ${aBackdoor.map((m) => `${m.name}@${m.min_level} [${m.sources.join(',')}]`).join(', ')}`)
  check('the egg/TM/tutor backdoor moves are present', aBackdoor.length > 0)
  check('Solar Beam (level 46 in Ruby/Sapphire) is present at level 12', aNames.has('Solar Beam'))
  check('Charm (a Bulbasaur egg move) is present', aNames.has('Charm'))
  check(
    'every move appears exactly once however many sources reach it',
    new Set(a.moves.map((m) => m.move_id)).size === a.moves.length,
  )
  check('no partition failed', a.failed.length === 0, `failed=[${a.failed}]`)

  // ----------------------------------------------------------------- case (b)
  hr('(b) GEN 3 TORCHIC — nothing from a later stage')
  const b = await moveset({ speciesId: 255, level: 50, generation: 3 })
  log(`  lineage=${JSON.stringify(b.lineage)}  block=${b.tradeBlock.id}  moves=${b.moves.length}`)
  printMoves(b.moves, { withLevel: true })
  const bNames = new Set(b.moves.map((m) => m.name))

  const torchicAny = new Set(await rawNames([255], [3, 4], []))
  const combLevel = await rawNames([256], [3, 4], ['level-up'])
  const blazLevel = await rawNames([257], [3, 4], ['level-up'])
  const laterOnly = [...new Set([...combLevel, ...blazLevel])].filter((n) => !torchicAny.has(n))
  log('')
  log('  Combusken/Blaziken level-up moves Torchic cannot reach by ANY of its own routes:')
  log(`   ${laterOnly.join(', ')}`)
  const leaked = laterOnly.filter((n) => bNames.has(n))
  check(
    'no move exclusive to a later stage’s level-up learnset leaked in',
    leaked.length === 0,
    `leaked=[${leaked}]`,
  )
  check('the list is not empty (the exclusion is not just an empty result)', b.moves.length > 50)
  check(
    'the lineage stops at the build’s stage',
    JSON.stringify(b.lineage) === '[255]',
    JSON.stringify(b.lineage),
  )

  // ----------------------------------------------------------------- case (c)
  hr('(c) IVYSAUR — inherits Bulbasaur, excludes Venusaur')
  const c = await moveset({ speciesId: 2, level: 40, generation: 3 })
  log(`  lineage=${JSON.stringify(c.lineage)}  block=${c.tradeBlock.id}  moves=${c.moves.length}`)
  printMoves(c.moves, { withLevel: true })
  const cNames = new Set(c.moves.map((m) => m.name))

  const bulbaEgg = await rawNames([1], [3, 4], ['egg'])
  const missingEgg = bulbaEgg.filter((n) => !cNames.has(n))
  log('')
  log(`  Bulbasaur egg moves (${bulbaEgg.length}): ${bulbaEgg.join(', ')}`)
  check(
    'every Bulbasaur egg move is present on the Ivysaur build',
    missingEgg.length === 0,
    `missing=[${missingEgg}]`,
  )

  const lowerAny = new Set(await rawNames([1, 2], [3, 4], []))
  const venuAny = await rawNames([3], [3, 4], [])
  const venuExclusive = venuAny.filter((n) => !lowerAny.has(n))
  log(`  Venusaur moves unreachable by Bulbasaur/Ivysaur: ${venuExclusive.join(', ')}`)
  const venuLeaked = venuExclusive.filter((n) => cNames.has(n))
  check('no Venusaur-exclusive move leaked in', venuLeaked.length === 0, `leaked=[${venuLeaked}]`)
  check('Frenzy Plant (Venusaur’s tutor move) is absent', !cNames.has('Frenzy Plant'))
  check(
    'Petal Dance IS present — Venusaur-only by level-up, but a Bulbasaur EGG move',
    cNames.has('Petal Dance'),
  )

  // ----------------------------------------------------------------- case (d)
  hr('(d) GEN 3 JOLTEON — inherits Eevee across a branch')
  const d = await moveset({ speciesId: 135, level: 50, generation: 3 })
  log(`  lineage=${JSON.stringify(d.lineage)}  block=${d.tradeBlock.id}  moves=${d.moves.length}`)
  printMoves(d.moves, { withLevel: true })
  const dNames = new Set(d.moves.map((m) => m.name))

  const eeveeLevel = await rawNames([133], [3, 4], ['level-up'])
  const jolteonLevel = new Set(await rawNames([135], [3, 4], ['level-up']))
  const inherited = eeveeLevel.filter((n) => !jolteonLevel.has(n))
  log('')
  log(`  Eevee level-up moves Jolteon does not relist: ${inherited.join(', ')}`)
  const missingInherited = inherited.filter((n) => !dNames.has(n))
  check(
    'all of them are present on the Jolteon build',
    missingInherited.length === 0,
    `missing=[${missingInherited}]`,
  )

  // The branch check: Eevee's chain forks eight ways, so taking the subtree instead
  // of the path would hand Jolteon its siblings' moves.
  const vaporeonAny = await rawNames([134], [3, 4], [])
  const eeveeAny = new Set(await rawNames([133], [3, 4], []))
  const jolteonAny = new Set(await rawNames([135], [3, 4], []))
  const vaporeonOnly = vaporeonAny.filter((n) => !eeveeAny.has(n) && !jolteonAny.has(n))
  log(`  Vaporeon-only moves (sibling branch): ${vaporeonOnly.join(', ')}`)
  const sibLeaked = vaporeonOnly.filter((n) => dNames.has(n))
  check(
    'no sibling-branch (Vaporeon) move leaked in',
    sibLeaked.length === 0,
    `leaked=[${sibLeaked}]`,
  )

  // ----------------------------------------------------------------- case (e)
  hr('(e) GEN 1 BULBASAUR, LEVEL 12 — the level gate IS real here')
  const e = await moveset({ speciesId: 1, level: 12, generation: 1 })
  log(`  lineage=${JSON.stringify(e.lineage)}  block=${e.tradeBlock.id}  moves=${e.moves.length}`)
  printMoves(e.moves, { withLevel: true })

  const eLevelUp = e.moves.filter((m) => m.sources.includes('level-up'))
  log('')
  log(`  level-up moves: ${eLevelUp.map((m) => `${m.name}@${m.min_level}`).join(', ')}`)
  const overLevel = eLevelUp.filter((m) => m.min_level != null && m.min_level > 12)
  check(
    'every level-up move is at level <= 12',
    overLevel.length === 0,
    `over=[${overLevel.map((m) => `${m.name}@${m.min_level}`)}]`,
  )

  const gen1AllLevel = await moveset({ speciesId: 1, level: 100, generation: 1 })
  const excluded = gen1AllLevel.moves
    .filter((m) => m.sources.includes('level-up') && m.min_level != null && m.min_level > 12)
    .map((m) => `${m.name}@${m.min_level}`)
  log(`  level-up moves the gate excluded: ${excluded.join(', ')}`)
  check('the gate actually excluded something', excluded.length > 0)
  check(
    'Vine Whip is in (level 13 in Red/Blue, level 10 in Gold/Silver — the block union)',
    e.moves.some((m) => m.name === 'Vine Whip' && m.min_level === 10),
  )
  check(
    'no egg moves in Gen 1 — breeding does not exist yet',
    e.moves.every((m) => !m.sources.includes('egg')),
  )
  check(
    'and the same build in Gen 2 DOES get egg moves',
    (await moveset({ speciesId: 1, level: 12, generation: 2 })).moves.some((m) =>
      m.sources.includes('egg'),
    ),
  )
  check(
    'the Gen 2 build at level 12 is NOT level-gated',
    (await moveset({ speciesId: 1, level: 12, generation: 2 })).moves.some(
      (m) => m.min_level != null && m.min_level > 12,
    ),
  )

  // ----------------------------------------------------------------- case (f)
  hr('(f) GEN 2 vs GEN 3 IVYSAUR — the two blocks never cross')
  const f2 = await moveset({ speciesId: 2, level: 40, generation: 2 })
  const f3 = await moveset({ speciesId: 2, level: 40, generation: 3 })

  const tmTutor = (r) =>
    r.moves.filter((m) => m.sources.includes('machine') || m.sources.includes('tutor'))
  const vgOf = (rows) => [...new Set(rows.flatMap((m) => m.version_groups))].sort()

  log(`  Gen 2 build: block=${f2.tradeBlock.id}  groups=${f2.versionGroups.join(', ')}`)
  log(`  Gen 2 TM/tutor moves (${tmTutor(f2).length}):`)
  printMoves(tmTutor(f2))
  log(`    version groups actually cited: ${vgOf(tmTutor(f2)).join(', ')}`)
  log('')
  log(`  Gen 3 build: block=${f3.tradeBlock.id}  groups=${f3.versionGroups.join(', ')}`)
  log(`  Gen 3 TM/tutor moves (${tmTutor(f3).length}):`)
  printMoves(tmTutor(f3))
  log(`    version groups actually cited: ${vgOf(tmTutor(f3)).join(', ')}`)

  const cited2 = vgOf(tmTutor(f2))
  const cited3 = vgOf(tmTutor(f3))
  check(
    'the Gen 2 build cites Gen 1-2 version groups only',
    cited2.every((n) => blockGroups.a.includes(n)),
    cited2.join(', '),
  )
  check(
    'the Gen 3 build cites Gen 3-4 version groups only',
    cited3.every((n) => blockGroups.b.includes(n)),
    cited3.join(', '),
  )
  check(
    'the two builds cite no version group in common',
    cited2.filter((n) => cited3.includes(n)).length === 0,
  )
  check(
    'the Gen 2 union spans MORE than the one group its generation names',
    cited2.length > 1,
    `${cited2.length} groups`,
  )
  check(
    'the Gen 3 union spans MORE than the one group its generation names',
    cited3.length > 1,
    `${cited3.length} groups`,
  )

  const only2 = tmTutor(f2)
    .map((m) => m.name)
    .filter((n) => !tmTutor(f3).some((m) => m.name === n))
  const only3 = tmTutor(f3)
    .map((m) => m.name)
    .filter((n) => !tmTutor(f2).some((m) => m.name === n))
  log('')
  log(`  TM/tutor only in the Gen 2 build: ${only2.join(', ')}`)
  log(`  TM/tutor only in the Gen 3 build: ${only3.join(', ')}`)
  check('the two TM/tutor sets genuinely differ', only2.length > 0 && only3.length > 0)

  // ------------------------------------------------------------ event moves
  hr('EVENT MOVES — included, and flagged for the asterisk')
  const pika1 = await moveset({ speciesId: 25, level: 100, generation: 1 })
  const pika3 = await moveset({ speciesId: 25, level: 100, generation: 3 })
  const ev = (r) => r.moves.filter((m) => m.is_event)
  log(
    `  Gen 1 Pikachu: ${ev(pika1)
      .map((m) => `${m.name}* [${m.methods.join(',')}]`)
      .join(', ')}`,
  )
  log(
    `  Gen 3 Pikachu: ${ev(pika3)
      .map((m) => `${m.name}* [${m.methods.join(',')}]`)
      .join(', ')}`,
  )
  check(
    'Surf is present and flagged on a Gen 1 Pikachu (Pokemon Stadium)',
    ev(pika1).some((m) => m.name === 'Surf'),
  )
  check(
    'Volt Tackle is present and flagged on a Gen 3 Pikachu (Light Ball, via Pichu)',
    ev(pika3).some((m) => m.name === 'Volt Tackle'),
  )
  check(
    'Volt Tackle is credited to Pichu, the lineage stage that supplies it',
    ev(pika3)
      .find((m) => m.name === 'Volt Tackle')
      ?.species_ids.includes(172) === true,
  )
  check(
    'a move with an ordinary route as well is NOT flagged',
    pika3.moves.filter((m) => m.methods.length > 1 && m.is_event).length === 0,
  )

  // -------------------------------------------------------------- move type
  hr('MOVE TYPE — resolved for the build’s era, not read raw')
  const charm3 = c.moves.find((m) => m.name === 'Charm')
  const raw = await page.evaluate(
    async ([url]) => {
      const data = await import(url)
      const move = data.listMoves().find((m) => m.display_name === 'Charm')
      return data.getType(move.type_id)?.name
    },
    ['/pokeapp/src/data/index.ts'],
  )
  log(`  Charm: bundle type_id resolves to "${raw}"; this module reports "${charm3?.type}"`)
  check('Charm is Normal on a Gen 3 build, not Fairy', charm3?.type === 'normal', `${charm3?.type}`)
  check(
    'the move rows carry a category for the UI',
    charm3?.category != null,
    `${charm3?.category}`,
  )
  const typed = c.moves.filter((m) => m.type != null && m.category != null).length
  check(
    'every move row carries name, type and category',
    typed === c.moves.length,
    `${typed}/${c.moves.length}`,
  )

  /*
    The second past_values shape, and the one that proves the resolver is reading
    the axis rather than pattern-matching three known names: Curse's entry names
    `black-white` (Generation 5), which IS a name the bundle omits, and its past
    value is the ??? pseudo-type rather than a real one. A Gen 2 build must read
    ???, and a Gen 4 build must too, since the change lands in Gen 5.
  */
  const curse2 = f2.moves.find((m) => m.name === 'Curse')
  const curse4 = (await moveset({ speciesId: 2, level: 40, generation: 4 })).moves.find(
    (m) => m.name === 'Curse',
  )
  log(`  Curse: Gen 2 build reports "${curse2?.type}", Gen 4 build reports "${curse4?.type}"`)
  check('Curse is ??? in Gen 2, not Ghost (retyped in Gen 5)', curse2?.type === 'unknown')
  check('Curse is still ??? in Gen 4', curse4?.type === 'unknown')

  /*
    And the third shape: a past entry whose version group the bundle DOES carry, so
    the comparison is a real one on both sides. Karate Chop became Fighting in
    Gold/Silver, so Gen 1 reads Normal and Gen 2 reads Fighting -- the one case
    where the same move answers differently INSIDE a single trade block.
  */
  const kc = await page.evaluate(
    async ([url]) => {
      const era = await import(url)
      const data = await import('/pokeapp/src/data/index.ts')
      const move = data.listMoves().find((m) => m.display_name === 'Karate Chop')
      return [1, 2, 3, 4].map((gen) => era.resolveMoveTypeNameForGeneration(move, gen))
    },
    [MOVE_ERA_URL],
  )
  log(`  Karate Chop by generation 1..4: ${kc.join(', ')}`)
  check(
    'Karate Chop is Normal in Gen 1 and Fighting from Gen 2',
    JSON.stringify(kc) === JSON.stringify(['normal', 'fighting', 'fighting', 'fighting']),
    kc.join(', '),
  )

  // -------------------------------------------------------------------- done
  hr(failures.length ? `FAILED — ${failures.length} check(s)` : 'ALL CHECKS PASSED')
  for (const f of failures) log(`  - ${f}`)
} finally {
  if (browser) await browser.close()
  dev.stop()
}

process.exit(failures.length ? 1 : 0)
