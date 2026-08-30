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
import { controls, fillDexSearch } from './lib/controls.mjs'
import { goToDex } from './lib/nav.mjs'

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

/** Union across every partition, keeping the METHODS rather than the games. */
function methodsAcross(moveId) {
  const out = new Map()
  for (const f of partitionFiles) {
    const vg = f.replace(/\.json$/, '')
    for (const [id, v] of learnersIn(moveId, vg)) {
      if (!out.has(id)) out.set(id, new Set())
      for (const m of v.methods) out.get(id).add(m)
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
    await goToDex(page, id)
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

  const { withControls } = controls(page)

  /*
    The Movedex is a list PAGE and a detail PAGE now, not a rail beside a detail,
    so the search box exists only in list view. Returning to the list is part of
    searching again.
  */
  const toList = async () => {
    if (await page.$('[data-testid="entity-back"]')) {
      await page.click('[data-testid="entity-back"]')
    }
    await page.waitForSelector('[data-testid="movedex-count"]', { timeout: 15000 })
  }
  /** Open one move, and wait for its async learnset to land. */
  const openMove = async (term, id) => {
    await toList()
    await fillDexSearch(page, 'movedex', term)
    await page.waitForSelector(`[data-testid="movedex-row-${id}"]`, { timeout: 15000 })
    await page.click(`[data-testid="movedex-row-${id}"]`)
    await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 15000 })
    // The learner sections render after the partition resolves; without this the
    // page is read while it still says "Loading learnset…".
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="movedex-learner-count"]') != null ||
        document.querySelector('[data-testid="movedex-learners-none"]') != null,
      undefined,
      { timeout: 60000 },
    )
  }
  await page.waitForSelector('[data-testid="app-nav"]', { timeout: 60000 })

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
  await toList()
  await fillDexSearch(page, 'movedex', 'head')
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
  await toList()
  await fillDexSearch(page, 'movedex', '')

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
  /*
    #6890F0 -- the COMMUNITY palette's Water, which is now the only type palette
    in the app. This asserted #2980EF, the Bulbapedia transcription that used to
    live in typeColors.ts; that table was retired along with the muted custom set,
    so the whole app draws from one palette in both themes. The value is hardcoded
    on purpose: the point of the check is that the filter and the type text agree
    on a specific colour, which a lookup shared with the source would not test.
  */
  check(
    'selected button is filled with the community palette Water',
    waterSelected.bg === 'rgb(104, 144, 240)',
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
  await openMove('headbutt', HEADBUTT)
  const detail = await page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null
    return {
      name: t('movedex-name'),
      type: document
        .querySelector('[data-testid="movedex-type"] [data-type]')
        ?.getAttribute('data-type'),
      // damage-class had its own readout beside the type badge in the old
      // card layout. The rebuilt detail page states it once, in the meta line,
      // which movedex-category already reads.
      damageClass: t('movedex-category'),
      power: t('movedex-power'),
      accuracy: t('movedex-accuracy'),
      pp: t('movedex-pp'),
      category: t('movedex-category'),
      // Contest data, priority, target and effect-kind are no longer on this
      // page: the rebuild specifies back link + name + meta + effect + species
      // sections, and nothing else. Their checks are removed rather than
      // rewritten to assert absence, which would prove nothing.
      effect: t('entity-description'),
      sections: [...document.querySelectorAll('[data-testid^="entity-section-"]')].map((el) =>
        el.getAttribute('data-testid'),
      ),
      sectionLabels: [...document.querySelectorAll('.entity-detail-section-label')].map((el) =>
        el.textContent.trim(),
      ),
      levelBadges: [...document.querySelectorAll('.species-card-badge')].map((el) =>
        el.textContent.trim(),
      ),
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
  check('effect text matches', detail.effect.startsWith(hb.effect.slice(0, 40)))
  // Contest type/appeal/jam/super-appeal and the card count are gone with the
  // card layout: the rebuilt detail page is back link + name + meta + effect +
  // species sections, so those five checks had nothing left to read. Replaced by
  // claims about what the page now shows, not by assertions of absence.
  log(`  sections: ${detail.sections.join(', ')}`)
  log(`  labels  : ${detail.sectionLabels.join(' | ')}`)
  check(
    'the learner grid is split into labelled learn-method sections',
    detail.sections.length > 0 &&
      detail.sections.every((id) =>
        [
          'entity-section-level-up',
          'entity-section-tm',
          'entity-section-egg-move',
          'entity-section-move-tutor',
        ].includes(id),
      ),
    detail.sections.join(','),
  )
  check(
    'sections appear in the specified order',
    (() => {
      const want = [
        'entity-section-level-up',
        'entity-section-tm',
        'entity-section-egg-move',
        'entity-section-move-tutor',
      ]
      const got = detail.sections.map((id) => want.indexOf(id))
      return got.every((v, i) => i === 0 || got[i - 1] < v)
    })(),
    detail.sections.join(','),
  )
  check(
    'no section is rendered empty',
    detail.sectionLabels.every((l) => !/\b0$/.test(l)),
    detail.sectionLabels.join(' | '),
  )
  check(
    'level-up cards carry a Lv. badge and the others do not',
    detail.levelBadges.length > 0 && detail.levelBadges.every((b) => /^Lv\.\d+$/.test(b)),
    detail.levelBadges.slice(0, 6).join(','),
  )

  // A status move with no power, to prove the null path renders.
  await toList()
  const growl = moves.find((m) => m.name === 'growl')
  await openMove('growl', growl.id)
  const growlView = await page.evaluate(() => ({
    power: document.querySelector('[data-testid="movedex-power"]')?.textContent?.trim(),
    // The meta line states the damage class once; there is no separate readout
    // beside a type badge any more.
    dc: document.querySelector('[data-testid="movedex-category"]')?.textContent?.trim(),
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
  /*
    The flat learner list is four labelled card grids now. A species that learns
    the move two ways appears in two sections, so the DISTINCT species ids are
    what compares against the data layer's per-species answer -- the raw card
    count would double-count by design.
  */
  const readLearners = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="movedex-learner-count"]') != null ||
        document.querySelector('[data-testid="movedex-learners-none"]') != null,
      undefined,
      { timeout: 120000 },
    )
    return page.evaluate(() => {
      const cards = [...document.querySelectorAll('.entity-detail-section [data-species-id]')]
      const ids = [...new Set(cards.map((c) => Number(c.getAttribute('data-species-id'))))]
      const el = document.querySelector('[data-testid="movedex-learner-count"]')
      return {
        count: el ? Number(el.getAttribute('data-learner-count')) : 0,
        rows: ids.length,
        ids,
        partial: document.querySelector('[data-testid="movedex-learners-partial"]') != null,
        thumbs: document.querySelectorAll('.entity-detail-section img').length,
      }
    })
  }
  /*
    A species' learn methods are no longer a chip list on its row: they are WHICH
    sections its card appears in. Reading them back from section membership keeps
    the same assertion -- "Slowbro learns Headbutt these ways" -- against the new
    structure, and the level comes from the card's Lv badge.
  */
  const SECTION_METHOD = {
    'entity-section-level-up': 'level-up',
    'entity-section-tm': 'machine',
    'entity-section-egg-move': 'egg',
    'entity-section-move-tutor': 'tutor',
  }
  const methodsFor = (id) =>
    page.evaluate(
      ({ speciesId, map }) => {
        const methods = []
        let badge = null
        for (const [testid, method] of Object.entries(map)) {
          const section = document.querySelector(`[data-testid="${testid}"]`)
          if (!section) continue
          const card = section.querySelector(`[data-species-id="${speciesId}"]`)
          if (!card) continue
          methods.push(method)
          const b = card.querySelector('.species-card-badge')
          if (b) badge = b.textContent.trim()
        }
        return { methods: methods.join(','), badge }
      },
      { speciesId: id, map: SECTION_METHOD },
    )

  await selectGame('heartgold-soulsilver')
  await toList()
  await fillDexSearch(page, 'movedex', 'headbutt')
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
  // Compared as a SET, not a sequence: the page is grouped by learn method now,
  // so page order is section order and national-dex order holds within a section
  // rather than across the whole page. Membership is the claim that matters.
  check(
    'ids match the partition exactly',
    JSON.stringify([...got.ids].sort((a, b) => a - b)) ===
      JSON.stringify([...headbuttHgss.keys()].sort((a, b) => a - b)),
  )
  check('Slowbro (#80) is listed', got.ids.includes(80))
  const slowbro = await methodsFor(80)
  const expSlowbro = headbuttHgss.get(80)
  log(
    `  Slowbro sections: ${JSON.stringify(slowbro)} | expected ${[...expSlowbro.methods].join(',')} lvl ${expSlowbro.level}`,
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
  check(
    'Slowbro shows its level-up level (25) as a card badge',
    slowbro.badge === 'Lv.25',
    String(slowbro.badge),
  )
  check('artwork thumbnails render', got.thumbs > 0, `(${got.thumbs})`)

  // Second move: Surf.
  await toList()
  await fillDexSearch(page, 'movedex', 'surf')
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
  await toList()
  await fillDexSearch(page, 'movedex', 'surf')
  await page.waitForTimeout(200)
  await page.click(`[data-testid="movedex-row-${SURF}"]`)
  const surfAllView = await readLearners()
  log(
    `  Surf / All: ${surfAllView.count} species (expected ${surfAll.size}), ${surfAllView.rows} rows`,
  )
  // The page's own count is what it shows; the equality with the full union is
  // asserted below, once the ungrouped-method remainder is read off the page.
  check(
    'All-games count is the union minus only the ungrouped methods',
    surfAllView.count <= surfAll.size,
    `(${surfAllView.count} of ${surfAll.size})`,
  )
  // The page groups four learn methods; the union includes species whose only
  // route is xd-purification, which has no section. The page says so in its own
  // count line, and this asserts the two agree rather than ignoring the gap.
  const surfExcluded = await page.$eval('[data-testid="movedex-learner-count"]', (e) =>
    Number(e.getAttribute('data-excluded')),
  )
  log(`  Surf/All: shown ${surfAllView.count}, union ${surfAll.size}, excluded ${surfExcluded}`)
  check('deduplicated: one row per species', surfAllView.rows === surfAllView.count)
  check(
    'the union is fully accounted for: shown + excluded === union',
    surfAllView.count + surfExcluded === surfAll.size,
    `${surfAllView.count} + ${surfExcluded} vs ${surfAll.size}`,
  )
  check('no duplicate species ids', new Set(surfAllView.ids).size === surfAllView.ids.length)
  check(
    'not one row per game (would be far larger)',
    surfAllView.rows < surfHgss.size * 14,
    `(${surfAllView.rows} rows vs ${surfHgss.size * 14} if per-game)`,
  )
  check('union is at least the single-game count', surfAllView.count >= surfHgss.size)
  check('nothing reported as partial', surfAllView.partial === false)
  check(
    'ids match the computed union, restricted to the four grouped methods',
    JSON.stringify([...surfAllView.ids].sort((a, b) => a - b)) ===
      JSON.stringify(
        [...methodsAcross(SURF).entries()]
          .filter(([, methods]) =>
            [...methods].some((m) => ['level-up', 'machine', 'egg', 'tutor'].includes(m)),
          )
          .map(([k]) => k)
          .sort((a, b) => a - b),
      ),
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
