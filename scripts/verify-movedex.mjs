/**
 * Verification for the Movedex.
 *
 * Expected values are computed from the bundle here, then asserted against the
 * rendered DOM, so the suite fails if either drifts.
 *
 * The reverse lookup is recomputed from the raw learnset partitions rather than
 * trusted: it must agree row-for-row with what the Pokedex learnset card reads,
 * since both are meant to be the same data.
 *
 * The "same component, not a re-implementation" requirement is checked two ways:
 * statically (both modules import the same TypeFilter module, and neither holds a
 * private copy of the palette) and dynamically (the rendered buttons carry
 * identical classes and colours in both dexes).
 *
 * Usage: node scripts/verify-movedex.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4187
const APP_URL = `http://localhost:${PORT}/pokeapp/`
const SHOTS = 'scripts/.verify-shots'

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

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server never became ready at ${url}`)
}

mkdirSync(SHOTS, { recursive: true })

// =====================================================================
// Expected values from the bundle
// =====================================================================

const bundle = (n) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const movesById = bundle('moves')
const moves = Object.values(movesById)
const types = Object.values(bundle('types'))
const typeIdOf = (name) => types.find((t) => t.name === name).id

const moveCount = (g) => moves.filter((m) => (m.generation_id ?? 99) <= g).length

const partitionFiles = readdirSync('public/data/learnsets')
const partitionRows = new Map()
const rowsFor = (vg) => {
  if (!partitionRows.has(vg)) {
    partitionRows.set(vg, JSON.parse(readFileSync(`public/data/learnsets/${vg}.json`, 'utf8')))
  }
  return partitionRows.get(vg)
}

/** Species that learn a move in one group, with methods and lowest level. */
function learnersIn(moveId, vg) {
  const out = new Map()
  for (const r of rowsFor(vg)) {
    if (r.move_id !== moveId) continue
    if (!out.has(r.species_id)) out.set(r.species_id, { methods: new Set(), level: null })
    const a = out.get(r.species_id)
    a.methods.add(r.method)
    if (r.method === 'level-up' && r.level > 0) {
      a.level = a.level == null ? r.level : Math.min(a.level, r.level)
    }
  }
  return out
}

/** Species that learn a move in ANY group, deduplicated, with contributing games. */
function learnersAcross(moveId) {
  const out = new Map()
  for (const f of partitionFiles) {
    const vg = f.replace(/\.json$/, '')
    for (const [id] of learnersIn(moveId, vg)) {
      if (!out.has(id)) out.set(id, new Set())
      out.get(id).add(vg)
    }
  }
  return out
}

const GAMES = [
  { vg: 'red-blue', gen: 1 },
  { vg: 'gold-silver', gen: 2 },
  { vg: 'firered-leafgreen', gen: 3 },
  { vg: 'heartgold-soulsilver', gen: 4 },
]

const HEADBUTT = 29
const SURF = 57

hr('EXPECTED — computed from the bundle')
log(`  moves in bundle: ${moves.length}`)
GAMES.forEach((g) => log(`  gen ${g.gen} (${g.vg.padEnd(21)}): ${moveCount(g.gen)} moves`))
const headbuttHgss = learnersIn(HEADBUTT, 'heartgold-soulsilver')
const headbuttAll = learnersAcross(HEADBUTT)
const surfHgss = learnersIn(SURF, 'heartgold-soulsilver')
const surfAll = learnersAcross(SURF)
log(
  `  Headbutt: ${headbuttHgss.size} learners in HGSS, ${headbuttAll.size} across all games (deduped)`,
)
log(`  Surf    : ${surfHgss.size} learners in HGSS, ${surfAll.size} across all games (deduped)`)
log(
  `  Slowbro/Headbutt in HGSS: methods=${[...(headbuttHgss.get(80)?.methods ?? [])].join(',')} level=${headbuttHgss.get(80)?.level}`,
)

hr('STATIC — the type filter is the shared component, not a copy')
// The Pokedex's type filter moved out of SpeciesList and into the app bar's
// controls panel during the simplification pass, so that is where the import has
// to be. The point of the check is unchanged: one shared component, no copies.
const speciesListSrc = readFileSync('src/modules/pokedex/SpeciesList.tsx', 'utf8')
const controlsSrc = readFileSync('src/modules/nav/ControlsPanel.tsx', 'utf8')
const movedexSrc = readFileSync('src/modules/dex/Movedex.tsx', 'utf8')
const filterSrc = readFileSync('src/components/TypeFilter.tsx', 'utf8')
const importsFilter = (src) => /from '(\.\.\/)+components\/TypeFilter'/.test(src)
check("the Pokedex's controls panel imports the shared TypeFilter", importsFilter(controlsSrc))
check('Movedex imports the shared TypeFilter', importsFilter(movedexSrc))
check('and SpeciesList no longer renders a filter of its own', !importsFilter(speciesListSrc))
check(
  'no module re-implements the filter buttons',
  !/className=\{[^}]*'tf/.test(speciesListSrc) &&
    !/className=\{[^}]*'tf/.test(controlsSrc) &&
    !/className=\{[^}]*'tf/.test(movedexSrc),
)
check(
  'neither module holds its own palette',
  !/typeColors/.test(speciesListSrc) && !/typeColors/.test(movedexSrc),
)
check('the shared filter reads the cited palette', /from '\.\/typeColors'/.test(filterSrc))
check(
  'only one module defines the type-filter markup',
  /data-testid=\{`\$\{testIdPrefix\}-any`\}/.test(filterSrc),
)

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
)

let browser
try {
  await waitForServer(APP_URL)
  log('')
  log(`preview ready at ${APP_URL}`)
  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const bad = []
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.status >= 400) bad.push(`${e.response.status} ${e.response.url}`)
  })

  const goTo = async (id) => {
    await page.hover('[data-testid="nav-pokedex"]')
    await page.click(`[data-testid="nav-${id}"]`)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
  }
  const selectGame = async (vg) => {
    await withControls(() => page.selectOption('[data-testid="vg-select"]', vg))
    await page.waitForTimeout(150)
  }
  const countOf = async (dex) =>
    Number((await page.textContent(`[data-testid="${dex}-count"]`)).trim().split(' ')[0])

  await page.goto(APP_URL, { waitUntil: 'load' })

  // Every control moved behind the app bar's toggle in the simplification pass,
  // so an action on one has to open the panel first. Opened for the duration of
  // the interaction and closed again: the panel floats over the page, and leaving
  // it open would let it intercept clicks meant for the module underneath.
  const controlsOpen = () =>
    page.$eval('[data-testid="app-controls"]', (el) => el.dataset.open === 'true')
  const openControls = async () => {
    if (!(await controlsOpen())) {
      await page.click('[data-testid="controls-toggle"]')
      await page.waitForSelector('[data-testid="vg-select"]', { state: 'visible', timeout: 15000 })
    }
  }
  const closeControls = async () => {
    if (await controlsOpen()) {
      await page.click('[data-testid="controls-toggle"]')
      await page.waitForTimeout(80)
    }
  }
  const withControls = async (fn) => {
    await openControls()
    const out = await fn()
    await closeControls()
    return out
  }
  await page.waitForSelector('[data-testid="dex-switcher"]', { timeout: 60000 })

  // ------------------------------------------------------------ registration
  hr('NAVIGATION — Movedex is registered like the rest')
  const tabs = await page.$$eval('[data-testid="dex-switcher"] button', (els) =>
    els.map((e) => e.getAttribute('data-testid')),
  )
  log(`  tabs: ${tabs.join(', ')}`)
  // Derived from the registry rather than hardcoded: registering another module
  // must not break this assertion, which is the whole point of the array.
  const registryCount = [
    ...readFileSync('src/modules/nav/registry.ts', 'utf8').matchAll(/\{\s*id:\s*'([a-z]+)'/g),
  ].length
  check(
    `all ${registryCount} registered modules render as tabs`,
    tabs.length === registryCount,
    `(${tabs.length} tabs vs ${registryCount} registered)`,
  )
  check('Movedex has a tab', tabs.includes('nav-movedex'))
  await goTo('movedex')
  check('Movedex mounts', (await page.$$('[data-testid="dex-movedex"]')).length === 1)

  // ------------------------------------------------------------ item 1: list
  hr('ITEM 1 — list, search and generation gating')
  await selectGame('heartgold-soulsilver')
  let n = await countOf('movedex')
  log(`  gen 4: ${n} moves (expected ${moveCount(4)})`)
  check('lists every gen-4 move', n === moveCount(4), `(${n})`)

  for (const g of GAMES) {
    await selectGame(g.vg)
    const got = await countOf('movedex')
    log(`  ${g.vg.padEnd(21)} gen ${g.gen}: ${got} (expected ${moveCount(g.gen)})`)
    check(`gated correctly for ${g.vg}`, got === moveCount(g.gen), `(${got})`)
  }

  await selectGame('heartgold-soulsilver')
  await page.fill('[data-testid="movedex-search"]', 'head')
  await page.waitForTimeout(150)
  const headCount = await countOf('movedex')
  const expectedHead = moves.filter(
    (m) => (m.generation_id ?? 99) <= 4 && m.display_name.toLowerCase().includes('head'),
  ).length
  const headLabels = await page.$$eval('[data-testid="movedex-rows"] .species-name', (els) =>
    els.map((e) => e.textContent),
  )
  log(`  search "head": ${headCount} (expected ${expectedHead}) -> ${headLabels.join(', ')}`)
  check('search narrows correctly', headCount === expectedHead, `(${headCount})`)
  check(
    'every result contains the term',
    headLabels.every((l) => l.toLowerCase().includes('head')),
  )
  await page.fill('[data-testid="movedex-search"]', '')

  // ------------------------------------------------- type filter, same component
  hr('ITEM 1b — type filter reuses the Pokedex component and colours')
  const readFilter = (prefix) =>
    page.$$eval(`[data-testid^="${prefix}-"]`, (els) =>
      els.map((e) => ({
        testid: e.getAttribute('data-testid'),
        type: e.getAttribute('data-type'),
        color: e.getAttribute('data-color'),
        cls: e.className,
      })),
    )
  const moveFilter = await readFilter('movedex-type')
  await goTo('pokedex')
  const dexFilter = await readFilter('type-filter')
  await goTo('movedex')

  const norm = (rows, prefix) =>
    rows
      .filter((r) => r.type)
      .map((r) => `${r.type}:${r.color}`)
      .sort()
      .join('|') + `#any:${rows.some((r) => r.testid === `${prefix}-any`)}`
  log(`  Movedex filter buttons: ${moveFilter.length}, Pokedex: ${dexFilter.length}`)
  log(`  movedex sample: ${JSON.stringify(moveFilter.slice(0, 3))}`)
  check(
    'both filters render the same button count',
    moveFilter.length === dexFilter.length,
    `(${moveFilter.length} vs ${dexFilter.length})`,
  )
  check(
    'both filters map every type to the identical colour',
    norm(moveFilter, 'movedex-type') === norm(dexFilter, 'type-filter'),
  )
  check(
    'both offer an "Any" button',
    moveFilter.some((r) => r.testid === 'movedex-type-any') &&
      dexFilter.some((r) => r.testid === 'type-filter-any'),
  )
  check(
    'both use the same CSS classes',
    moveFilter.every((r) => /\btf\b/.test(r.cls)) && dexFilter.every((r) => /\btf\b/.test(r.cls)),
  )

  // Filtering actually works, and "Any" clears it.
  const waterId = typeIdOf('water')
  await page.click('[data-testid="movedex-type-water"]')
  await page.waitForTimeout(150)
  const waterCount = await countOf('movedex')
  const expectedWater = moves.filter(
    (m) => (m.generation_id ?? 99) <= 4 && m.type_id === waterId,
  ).length
  const waterSelected = await page.$eval('[data-testid="movedex-type-water"]', (e) => ({
    bg: getComputedStyle(e).backgroundColor,
    pressed: e.getAttribute('aria-pressed'),
  }))
  log(`  water filter: ${waterCount} moves (expected ${expectedWater}), bg=${waterSelected.bg}`)
  check('type filter narrows the list', waterCount === expectedWater, `(${waterCount})`)
  check(
    'selected button is colour-filled',
    waterSelected.bg === 'rgb(41, 128, 239)',
    waterSelected.bg,
  )
  await page.click('[data-testid="movedex-type-fire"]')
  await page.waitForTimeout(150)
  const bothCount = await countOf('movedex')
  const expectedBoth = moves.filter(
    (m) => (m.generation_id ?? 99) <= 4 && [waterId, typeIdOf('fire')].includes(m.type_id),
  ).length
  log(`  water + fire: ${bothCount} (expected ${expectedBoth}, OR semantics)`)
  check('two types are OR-ed', bothCount === expectedBoth, `(${bothCount})`)
  await page.click('[data-testid="movedex-type-any"]')
  await page.waitForTimeout(150)
  const clearedCount = await countOf('movedex')
  check('"Any" clears the type filter', clearedCount === moveCount(4), `(${clearedCount})`)
  await page.screenshot({ path: `${SHOTS}/movedex-list.png` })

  // ------------------------------------------------------------ item 2: detail
  hr('ITEM 2 — move detail, including the damage_class / meta.category distinction')
  await page.fill('[data-testid="movedex-search"]', 'headbutt')
  await page.waitForSelector(`[data-testid="movedex-row-${HEADBUTT}"]`, { timeout: 15000 })
  await page.click(`[data-testid="movedex-row-${HEADBUTT}"]`)
  await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 15000 })
  const detail = await page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null
    return {
      name: t('movedex-name'),
      type: document
        .querySelector('[data-testid="movedex-type"] [data-type]')
        ?.getAttribute('data-type'),
      damageClass: t('movedex-damage-class'),
      power: t('movedex-power'),
      accuracy: t('movedex-accuracy'),
      pp: t('movedex-pp'),
      category: t('movedex-category'),
      contestType: t('movedex-contest-type'),
      appeal: t('movedex-contest-appeal'),
      jam: t('movedex-contest-jam'),
      superAppeal: t('movedex-super-appeal'),
      effect: t('movedex-effect'),
      cards: document.querySelectorAll('[data-testid="movedex-detail"] .card').length,
    }
  })
  const hb = movesById[HEADBUTT]
  log(`  rendered: ${JSON.stringify(detail).slice(0, 400)}`)
  log(
    `  bundle  : type_id=${hb.type_id} damage_class=${hb.damage_class} power=${hb.power} acc=${hb.accuracy} pp=${hb.pp} contest=${hb.contest_type} appeal=${hb.contest_effect?.appeal} jam=${hb.contest_effect?.jam} super=${hb.super_contest_effect?.appeal}`,
  )
  check('name matches', detail.name === hb.display_name)
  check('type badge matches', detail.type === types.find((t) => t.id === hb.type_id).name)
  check('power matches', detail.power === String(hb.power))
  check('accuracy matches', detail.accuracy === `${hb.accuracy}%`)
  check('PP matches', detail.pp === String(hb.pp))
  check(
    'category is damage_class, not meta.category',
    detail.category.toLowerCase() === hb.damage_class,
    `${detail.category} vs damage_class=${hb.damage_class} (meta.category=${hb.meta.category})`,
  )
  check(
    'the two axes are not conflated',
    hb.damage_class !== hb.meta.category && detail.category.toLowerCase() !== hb.meta.category,
  )
  check('contest type matches', detail.contestType.toLowerCase() === hb.contest_type)
  check('contest appeal matches', detail.appeal === String(hb.contest_effect.appeal))
  check('contest jam matches', detail.jam === String(hb.contest_effect.jam))
  check(
    'super contest appeal matches',
    detail.superAppeal === String(hb.super_contest_effect.appeal),
  )
  check('effect text matches', detail.effect.startsWith(hb.effect.slice(0, 40)))
  check('detail is built from cards', detail.cards >= 5, `(${detail.cards})`)

  // A status move with no power, to prove the null path renders.
  await page.fill('[data-testid="movedex-search"]', 'growl')
  await page.waitForTimeout(200)
  const growl = moves.find((m) => m.name === 'growl')
  await page.click(`[data-testid="movedex-row-${growl.id}"]`)
  await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 15000 })
  const growlView = await page.evaluate(() => ({
    power: document.querySelector('[data-testid="movedex-power"]')?.textContent?.trim(),
    dc: document.querySelector('[data-testid="movedex-damage-class"]')?.textContent?.trim(),
    text: document.querySelector('[data-testid="movedex-detail"]')?.innerText ?? '',
  }))
  log(
    `  Growl: power=${growlView.power} damage_class=${growlView.dc} (bundle power=${growl.power})`,
  )
  check('a null power renders as a dash, not "null"', growlView.power === '—')
  check('status move labelled Status', growlView.dc === 'Status')
  check('no "undefined"/"NaN" in the detail', !/undefined|NaN/.test(growlView.text))
  await page.screenshot({ path: `${SHOTS}/movedex-detail.png` })

  // ------------------------------------------------------------ item 3
  hr('ITEM 3 — reverse lookup: which species learn this move')
  const readLearners = async () => {
    await page.waitForSelector('[data-testid="movedex-learners"]', { timeout: 120000 })
    return page.evaluate(() => ({
      count: Number(
        document
          .querySelector('[data-testid="movedex-learners"]')
          .getAttribute('data-learner-count'),
      ),
      rows: document.querySelectorAll('[data-testid="movedex-learner-list"] li').length,
      ids: [...document.querySelectorAll('[data-testid="movedex-learner-list"] li')].map((l) =>
        Number(l.getAttribute('data-species-id')),
      ),
      partial: document.querySelector('[data-testid="movedex-learners-partial"]') != null,
      thumbs: document.querySelectorAll('[data-testid="movedex-learner-list"] img').length,
    }))
  }
  const methodsFor = (id) =>
    page.$eval(
      `[data-testid="movedex-learner-list"] li[data-species-id="${id}"] .learner-methods`,
      (e) => ({ methods: e.getAttribute('data-methods'), text: e.textContent.trim() }),
    )

  await selectGame('heartgold-soulsilver')
  await page.fill('[data-testid="movedex-search"]', 'headbutt')
  await page.waitForTimeout(200)
  await page.click(`[data-testid="movedex-row-${HEADBUTT}"]`)
  let got = await readLearners()
  log(`  Headbutt / HGSS: ${got.count} species (expected ${headbuttHgss.size}), ${got.rows} rows`)
  check(
    'Headbutt HGSS learner count matches the partition',
    got.count === headbuttHgss.size,
    `(${got.count})`,
  )
  check('one row per species', got.rows === got.count)
  check('no duplicate species rows', new Set(got.ids).size === got.ids.length)
  check(
    'ids match the partition exactly',
    JSON.stringify(got.ids) === JSON.stringify([...headbuttHgss.keys()].sort((a, b) => a - b)),
  )
  check('Slowbro (#80) is listed', got.ids.includes(80))
  const slowbro = await methodsFor(80)
  const expSlowbro = headbuttHgss.get(80)
  log(
    `  Slowbro methods: ${JSON.stringify(slowbro)} | expected ${[...expSlowbro.methods].join(',')} lvl ${expSlowbro.level}`,
  )
  check(
    'Slowbro methods match the partition',
    slowbro.methods ===
      [...expSlowbro.methods]
        .sort(
          (a, b) =>
            ['level-up', 'machine', 'egg', 'tutor'].indexOf(a) -
            ['level-up', 'machine', 'egg', 'tutor'].indexOf(b),
        )
        .join(','),
    slowbro.methods,
  )
  check('Slowbro shows its level-up level (25)', /Level up 25/.test(slowbro.text), slowbro.text)
  check('artwork thumbnails render', got.thumbs > 0, `(${got.thumbs})`)

  // Second move: Surf.
  await page.fill('[data-testid="movedex-search"]', 'surf')
  await page.waitForTimeout(200)
  await page.click(`[data-testid="movedex-row-${SURF}"]`)
  got = await readLearners()
  log(`  Surf / HGSS: ${got.count} species (expected ${surfHgss.size})`)
  check('Surf HGSS learner count matches', got.count === surfHgss.size, `(${got.count})`)
  check('Lapras (#131) learns Surf', got.ids.includes(131))
  check('Slowbro (#80) learns Surf', got.ids.includes(80))
  check('Pikachu (#25) does NOT learn Surf in HGSS', !got.ids.includes(25))

  // Under "All": union across every group, deduplicated by species.
  hr('ITEM 3b — under "All", union across all games, deduplicated by species')
  await selectGame('all')
  await page.waitForTimeout(200)
  await page.fill('[data-testid="movedex-search"]', 'surf')
  await page.waitForTimeout(200)
  await page.click(`[data-testid="movedex-row-${SURF}"]`)
  const surfAllView = await readLearners()
  log(
    `  Surf / All: ${surfAllView.count} species (expected ${surfAll.size}), ${surfAllView.rows} rows`,
  )
  check(
    'All-games count matches the union',
    surfAllView.count === surfAll.size,
    `(${surfAllView.count})`,
  )
  check('deduplicated: one row per species', surfAllView.rows === surfAllView.count)
  check('no duplicate species ids', new Set(surfAllView.ids).size === surfAllView.ids.length)
  check(
    'not one row per game (would be far larger)',
    surfAllView.rows < surfHgss.size * 14,
    `(${surfAllView.rows} rows vs ${surfHgss.size * 14} if per-game)`,
  )
  check('union is at least the single-game count', surfAllView.count >= surfHgss.size)
  check('nothing reported as partial', surfAllView.partial === false)
  check(
    'ids match the computed union',
    JSON.stringify(surfAllView.ids) === JSON.stringify([...surfAll.keys()].sort((a, b) => a - b)),
  )
  const gameCounts = await page.$$eval(
    '[data-testid="movedex-learner-list"] [data-game-count]',
    (els) => els.map((e) => Number(e.getAttribute('data-game-count'))),
  )
  log(`  species learning it in fewer than all 14 games: ${gameCounts.length}`)
  check(
    'per-species game counts are surfaced',
    gameCounts.every((c) => c >= 1 && c <= 14),
  )
  await page.screenshot({ path: `${SHOTS}/movedex-learners-all.png` })

  // ------------------------------------------------------------ errors
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  HTTP >=400     : ${bad.length}`)
  bad.slice(0, 10).forEach((e) => log(`    ${e}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed HTTP responses', bad.length === 0, `(${bad.length})`)
} finally {
  if (browser) await browser.close()
  preview.kill()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
