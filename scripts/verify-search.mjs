/**
 * Verification for the persistent global search.
 *
 * The requirement this suite exists to prove is the leak one: the search must not
 * be a fresh index over the raw bundle, because a second derivation of the scoping
 * rules is exactly how the Abilitydex list once ended up clamped to 123 abilities
 * while its own search box still reached all 161. So this checks the property two
 * independent ways:
 *
 *   STATICALLY   each category's entry list has exactly ONE definition in the
 *                source tree, in dex/entrySources.ts, and both the dex module and
 *                the search import it. Neither the search nor its categories may
 *                mention a bundle list or a generation predicate at all.
 *
 *   DYNAMICALLY  for a battery of (game x term) pairs, the count the global search
 *                reports for a category must equal the count that dex's OWN list
 *                reports for the same term -- and both must equal the number
 *                computed from the bundle here. A leak in either path shows up as
 *                a mismatch rather than as a plausible-looking number.
 *
 * Every expected value below is computed from public/data in this file, so the
 * suite fails if the data or the UI drifts, not if a hardcoded guess goes stale.
 *
 * Usage: node scripts/verify-search.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'
import { goToDex } from './lib/nav.mjs'

// NOT 4190: that is on the WHATWG fetch spec's blocked-port list (ManageSieve),
// so vite serves it happily while every fetch() to it rejects with "bad port".
const PORT = 4191
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

// 120s, not 60: npx plus a cold vite preview can take well over a minute on a
// loaded machine, and a timeout that fires early leaves a server bound to the port
// that the next run then collides with.
async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let attempts = 0
  let last = 'never attempted'
  while (Date.now() < deadline) {
    attempts++
    try {
      const res = await fetch(url)
      if (res.ok) return
      last = 'HTTP ' + res.status
    } catch (err) {
      last = (err.cause && (err.cause.code || err.cause.message)) || err.message
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  // The reason matters: a stale server on the port and a server that never came
  // up look identical without it.
  throw new Error(
    'preview server never became ready at ' +
      url +
      ' after ' +
      attempts +
      ' attempts (last: ' +
      last +
      ')',
  )
}

mkdirSync(SHOTS, { recursive: true })

// =====================================================================
// Expected values, computed from the bundle
// =====================================================================

const bundle = (n) => JSON.parse(readFileSync(`public/data/${n}.json`, 'utf8'))
const species = Object.values(bundle('species'))
const moves = Object.values(bundle('moves'))
const items = Object.values(bundle('items'))
const abilities = Object.values(bundle('abilities'))

const genOfSpecies = (id) => (id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 : 4)

/** The Abilitydex list clamp: only abilities with a Gen 1-4 presence. */
const abilitiesListed = abilities.filter((a) => (a.generation_id ?? 99) <= 4)
const abilitiesHidden = abilities.filter((a) => (a.generation_id ?? 99) > 4)

/** Entries each category is expected to offer, per selection ('all' or a gen). */
function scopedEntries(key, sel) {
  const all = sel === 'all'
  switch (key) {
    case 'species':
      return species.filter((s) => all || genOfSpecies(s.id) <= sel).map((s) => s.display_name)
    case 'moves':
      return moves.filter((m) => all || (m.generation_id ?? 99) <= sel).map((m) => m.display_name)
    case 'items':
      return items.filter((i) => all || i.generation_ids.includes(sel)).map((i) => i.display_name)
    case 'abilities':
      return abilitiesListed
        .filter((a) => all || (a.generation_id ?? 99) <= sel)
        .map((a) => a.display_name)
    default:
      throw new Error(`unknown category ${key}`)
  }
}

const CATEGORIES = [
  { key: 'species', label: 'Species', moduleId: 'pokedex' },
  { key: 'moves', label: 'Moves', moduleId: 'movedex' },
  { key: 'items', label: 'Items', moduleId: 'itemdex' },
  { key: 'abilities', label: 'Abilities', moduleId: 'abilitydex' },
]

/** Expected match count per category for a term under a selection. */
function expectedCounts(term, sel) {
  const needle = term.trim().toLowerCase()
  const out = {}
  for (const c of CATEGORIES) {
    out[c.key] = scopedEntries(c.key, sel).filter((n) => n.toLowerCase().includes(needle)).length
  }
  return out
}

const GAMES = [
  { vg: 'red-blue', sel: 1 },
  { vg: 'gold-silver', sel: 2 },
  { vg: 'firered-leafgreen', sel: 3 },
  { vg: 'heartgold-soulsilver', sel: 4 },
  { vg: 'all', sel: 'all' },
]

/**
 * The leak probe: an ability genuinely introduced in Gen 3, so a Gen 1-2 search
 * for it must come up empty -- not because the search is broken, which the Gen 3-4
 * positive control rules out.
 */
const GEN3_ABILITY = abilities.find((a) => a.generation_id === 3 && a.name === 'overgrow')
const CURSED = abilities.find((a) => a.name === 'cursed-body')

hr('EXPECTED VALUES — computed from the bundle')
log(
  `  bundle: ${species.length} species, ${moves.length} moves, ${items.length} items, ${abilities.length} abilities`,
)
log(
  `  abilities the dex lists: ${abilitiesListed.length}; withheld (Gen 5+): ${abilitiesHidden.length}`,
)
log(
  `  Gen 3 leak probe: "${GEN3_ABILITY?.display_name}" generation_id=${GEN3_ABILITY?.generation_id}`,
)
log(`  clamp probe: "${CURSED?.display_name}" generation_id=${CURSED?.generation_id}`)
check('the Gen 3 leak probe really is a Generation 3 ability', GEN3_ABILITY?.generation_id === 3)
check(
  'Cursed Body is really in the bundle and really Gen 5',
  CURSED != null && CURSED.generation_id === 5,
)
for (const g of GAMES) {
  const e = expectedCounts('sand', g.sel)
  log(
    `  ${String(g.vg).padEnd(21)} "sand" -> species ${e.species}, moves ${e.moves}, items ${e.items}, abilities ${e.abilities}`,
  )
}

// =====================================================================
// STATIC — one definition per category, and no second derivation
// =====================================================================

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const srcFiles = walk('src')
const read = (p) => readFileSync(p, 'utf8')
const ENTRY_FNS = ['speciesEntries', 'moveEntries', 'itemEntries', 'abilityEntries']

hr('STATIC — the four lists have exactly one definition each')
for (const fn of ENTRY_FNS) {
  const defs = srcFiles.filter((f) => new RegExp(`export function ${fn}\\b`).test(read(f)))
  log(`  ${fn.padEnd(16)} defined in: ${defs.join(', ') || '(nowhere)'}`)
  check(`${fn} is defined exactly once`, defs.length === 1, `(${defs.length})`)
  check(
    `${fn} lives in dex/entrySources.ts`,
    defs.length === 1 && defs[0].replace(/\\/g, '/') === 'src/modules/dex/entrySources.ts',
  )
}

const searchCatsSrc = read('src/modules/search/searchCategories.ts')
const globalSearchSrc = read('src/modules/search/GlobalSearch.tsx')

log('')
log('  search side:')
for (const fn of ENTRY_FNS) {
  check(
    `searchCategories imports ${fn} from the dex's own source`,
    new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '\\.\\./dex/entrySources'`, 's').test(
      searchCatsSrc,
    ),
  )
}
// The whole point: the search must not be able to see the raw lists or restate a
// scoping rule, because that is what would let it disagree with a dex.
const FORBIDDEN = [
  'listSpecies',
  'listMoves',
  'listItems',
  'listAbilities',
  'ExistsInGeneration',
  'isSpeciesInGeneration',
  'generation_id',
  'generation_ids',
]
for (const src of [
  ['searchCategories.ts', searchCatsSrc],
  ['GlobalSearch.tsx', globalSearchSrc],
]) {
  const hits = FORBIDDEN.filter((f) => src[1].includes(f))
  log(`  ${src[0].padEnd(22)} raw-bundle / scoping references: ${hits.join(', ') || 'none'}`)
  check(`${src[0]} never queries the bundle or re-derives scope`, hits.length === 0, hits.join(','))
}

log('')
log('  dex side (each dex must consume the shared list, not filter locally):')
const CONSUMERS = [
  ['src/modules/pokedex/SpeciesList.tsx', 'speciesEntries', 'isSpeciesInGeneration'],
  ['src/modules/dex/Movedex.tsx', 'moveEntries', 'moveExistsInGeneration'],
  ['src/modules/dex/Itemdex.tsx', 'itemEntries', 'itemExistsInGeneration'],
  ['src/modules/dex/Abilitydex.tsx', 'abilityEntries', 'abilityExistsInGeneration'],
]
for (const [file, fn, localRule] of CONSUMERS) {
  const src = read(file)
  check(`${file.split('/').pop()} calls ${fn}`, src.includes(`${fn}(`))
  check(
    `${file.split('/').pop()} no longer filters by ${localRule} itself`,
    !src.includes(localRule),
  )
}

// A category pointing at an unregistered module would be a click that silently
// lands on the Pokedex, so the ids are cross-checked against the registry source.
const registrySrc = read('src/modules/nav/registry.ts')
const registryIds = [...registrySrc.matchAll(/\{\s*id:\s*'([a-z]+)'/g)].map((m) => m[1])
const catKeys = [...searchCatsSrc.matchAll(/key:\s*'([a-z]+)'/g)].map((m) => m[1])
const catModules = [...searchCatsSrc.matchAll(/moduleId:\s*'([a-z]+)'/g)].map((m) => m[1])
log('')
log(`  registry ids     : ${registryIds.join(', ')}`)
log(`  category keys    : ${catKeys.join(', ')}`)
log(`  category targets : ${catModules.join(', ')}`)
check('four categories are declared', catKeys.length === 4, `(${catKeys.length})`)
check(
  'the four categories are species, moves, items, abilities',
  JSON.stringify(catKeys) === JSON.stringify(['species', 'moves', 'items', 'abilities']),
)
check(
  'every category targets a registered module',
  catModules.length === 4 && catModules.every((m) => registryIds.includes(m)),
  catModules.filter((m) => !registryIds.includes(m)).join(',') || 'all registered',
)

// The preview server's own output is captured rather than discarded: when it
// fails to start (a port still held by an earlier run is the usual cause) the
// reason has to reach the log, or the failure reads as "the app is broken".
const previewLog = []
const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
)
preview.stdout.on('data', (d) => previewLog.push(String(d).trimEnd()))
preview.stderr.on('data', (d) => previewLog.push(String(d).trimEnd()))
preview.on('exit', (code) => previewLog.push('preview exited with code ' + code))

/**
 * Kill the whole tree, not just the shell wrapper: on Windows the npx.cmd shell is
 * the direct child and the node server is its grandchild, so preview.kill() alone
 * leaves the port bound after the suite exits.
 */
const stopPreview = () => {
  try {
    if (process.platform === 'win32' && preview.pid) {
      spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  } catch {
    /* best effort */
  }
  preview.kill()
}

let browser
try {
  try {
    await waitForServer(APP_URL)
  } catch (err) {
    log('')
    log('  preview server output:')
    previewLog.forEach((line) => log('    ' + line))
    throw err
  }
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
  const badResponses = []
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.status >= 400) badResponses.push(`${e.response.status} ${e.response.url}`)
  })

  await page.goto(APP_URL, { waitUntil: 'load' })

  const { openControls, withControls } = controls(page)
  await page.waitForSelector('[data-testid="app-nav"]', { timeout: 60000 })

  // ---------------------------------------------------------------- helpers
  // Closed by clicking outside, NOT with Escape: Chrome natively clears an
  // <input type="search"> when Escape is pressed in it, so using Escape between
  // steps would wipe the query the next step is about to inspect. Escape itself is
  // asserted separately, in the empty-state section.
  const closePanel = async () => {
    await page.click('.app-footer p')
    await page.waitForTimeout(60)
  }
  const goTo = async (id) => {
    await closePanel()
    await goToDex(page, id)
    await page.waitForSelector(`[data-testid="dex-${id}"], [data-testid="species-rows"]`, {
      timeout: 30000,
    })
  }
  const selectGame = async (vg) => {
    await closePanel()
    await withControls(() => page.selectOption('[data-testid="vg-select"]', vg))
    await page.waitForTimeout(180)
  }
  const setTerm = async (term) => {
    // The cross-dex search lives in the controls panel now, so it has to be open
    // to type into -- and stays open afterwards, because the results dropdown
    // this suite reads is nested inside that same panel.
    await openControls()
    await page.fill('[data-testid="global-search"]', term)
    await page.waitForTimeout(160)
  }
  const panel = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="global-search-results"]')
      if (!el) return { present: false }
      return {
        present: true,
        total: Number(el.getAttribute('data-total')),
        groupCount: Number(el.getAttribute('data-group-count')),
        emptyText:
          document.querySelector('[data-testid="global-search-empty"]')?.textContent?.trim() ??
          null,
        text: el.textContent.trim(),
        groups: [...el.querySelectorAll('.gs-group')].map((g) => ({
          key: g.getAttribute('data-testid').replace('gs-group-', ''),
          shown: Number(g.getAttribute('data-count')),
          total: Number(g.getAttribute('data-total')),
          head: g.querySelector('.gs-group-head')?.textContent?.trim(),
          hits: [...g.querySelectorAll('.gs-hit')].map((h) => ({
            id: Number(h.getAttribute('data-entry-id')),
            module: h.getAttribute('data-module'),
            name: h.querySelector('.gs-hit-name')?.textContent,
          })),
        })),
      }
    })
  /** What the dex's OWN list reports for the same term. */
  const dexCount = async (moduleId, term) => {
    await goTo(moduleId)
    const searchId = moduleId === 'pokedex' ? 'species-search' : `${moduleId}-search`
    await page.fill(`[data-testid="${searchId}"]`, term)
    await page.waitForTimeout(160)
    // The Pokedex lost its count label with the page header; the five other
    // dexes still render one, and they are outside this pass.
    let n
    if (moduleId === 'pokedex') {
      n = await page.$$eval('[data-testid="species-rows"] [data-species-id]', (e) => e.length)
    } else {
      const txt = (await page.textContent(`[data-testid="${moduleId}-count"]`)).trim()
      n = Number(txt.split(' ')[0])
    }
    await page.fill(`[data-testid="${searchId}"]`, '')
    return n
  }

  // ================================================================ item 1
  hr('ITEM 1 — one persistent input, reachable from every dex')
  const inputOutsideNav = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="global-search"]')
    const nav = document.querySelector('[data-testid="dex-switcher"]')
    return {
      exists: input != null,
      insideNav: nav != null && input != null && nav.contains(input),
      inAppBar: input?.closest('.app-bar') != null,
      label: input?.getAttribute('aria-label'),
      count: document.querySelectorAll('[data-testid="global-search"]').length,
    }
  })
  log(`  ${JSON.stringify(inputOutsideNav)}`)
  check('the search input exists', inputOutsideNav.exists)
  check('there is exactly one of it', inputOutsideNav.count === 1)
  check('it sits in the app bar, beside the switcher', inputOutsideNav.inAppBar)
  check('it is NOT inside the switcher nav', !inputOutsideNav.insideNav)
  check(
    'it names all four searchable categories to a screen reader',
    /species/i.test(inputOutsideNav.label ?? '') &&
      /abilit/i.test(inputOutsideNav.label ?? '') &&
      /move/i.test(inputOutsideNav.label ?? '') &&
      /item/i.test(inputOutsideNav.label ?? ''),
    inputOutsideNav.label,
  )

  await selectGame('heartgold-soulsilver')
  for (const id of registryIds) {
    await goTo(id)
    const present = (await page.$$('[data-testid="global-search"]')).length === 1
    check(`reachable with the ${id} tab active`, present)
  }

  // Persistent across tab switches: the term survives, so a search is not lost by
  // navigating to a result and coming back for the next one.
  await setTerm('sand')
  await goToDex(page, 'naturedex')
  await page.waitForSelector('[data-testid="dex-naturedex"]', { timeout: 30000 })
  const kept = await page.inputValue('[data-testid="global-search"]')
  check('the query survives a tab switch', kept === 'sand', `("${kept}")`)
  // The input is the same element throughout, not one per module: a remount would
  // lose the query, which is what the check above would catch.
  await setTerm('')

  // ================================================================ leak
  hr('LEAK PROOF A — a Gen 3 ability is invisible under Gen 1-2, in both paths')
  const probe = GEN3_ABILITY.display_name.toLowerCase()
  for (const g of [
    { vg: 'red-blue', gen: 1 },
    { vg: 'gold-silver', gen: 2 },
  ]) {
    await selectGame(g.vg)
    await setTerm(probe)
    const p = await panel()
    const own = await dexCount('abilitydex', probe)
    log(
      `  ${g.vg.padEnd(21)} global "${probe}": groups=${p.groupCount} total=${p.total} | Abilitydex own list: ${own}`,
    )
    check(`global search finds no "${probe}" in Gen ${g.gen}`, p.total === 0 && p.groupCount === 0)
    check(`it says so rather than showing a blank panel`, (p.emptyText ?? '').length > 0)
    check(`the Abilitydex list agrees (${own})`, own === 0)
    check(
      `both paths return the bundle-computed count`,
      p.total === expectedCounts(probe, g.gen).abilities &&
        own === expectedCounts(probe, g.gen).abilities,
      `(expected ${expectedCounts(probe, g.gen).abilities})`,
    )
  }
  // Positive control: the zero above is the clamp working, not the search failing.
  for (const g of [
    { vg: 'firered-leafgreen', gen: 3 },
    { vg: 'heartgold-soulsilver', gen: 4 },
  ]) {
    await selectGame(g.vg)
    await setTerm(probe)
    const p = await panel()
    const own = await dexCount('abilitydex', probe)
    const grp = p.groups.find((x) => x.key === 'abilities')
    log(
      `  ${g.vg.padEnd(21)} global "${probe}": abilities=${grp?.total ?? 0} | Abilitydex own list: ${own}`,
    )
    check(`"${probe}" IS found in Gen ${g.gen}`, grp?.total === 1 && own === 1)
    check(
      `the hit is the real ability id ${GEN3_ABILITY.id}`,
      grp?.hits[0]?.id === GEN3_ABILITY.id,
      String(grp?.hits[0]?.id),
    )
  }

  hr('LEAK PROOF B — "cursed" is empty in every in-scope selection, like the dex')
  for (const g of GAMES) {
    await selectGame(g.vg)
    await setTerm('cursed')
    const p = await panel()
    const own = await dexCount('abilitydex', 'cursed')
    log(
      `  ${String(g.vg).padEnd(21)} global: groups=${p.groupCount} total=${p.total} | Abilitydex own list: ${own}`,
    )
    check(`no results for "cursed" under ${g.vg}`, p.total === 0 && p.groupCount === 0)
    check(`the Abilitydex own search agrees under ${g.vg}`, own === 0)
  }
  check(
    'and Cursed Body is still in the bundle, so those zeroes are the clamp',
    abilities.some((a) => a.display_name === 'Cursed Body'),
  )
  await setTerm('')
  await page.screenshot({ path: `${SHOTS}/search-leak.png` })

  hr('LEAK PROOF C — every category agrees with its own dex, per game and term')
  const TERMS = ['sand', 'water', 'king']
  const PROBE_GAMES = [
    { vg: 'red-blue', sel: 1 },
    { vg: 'heartgold-soulsilver', sel: 4 },
    { vg: 'all', sel: 'all' },
  ]
  for (const g of PROBE_GAMES) {
    await selectGame(g.vg)
    for (const term of TERMS) {
      await setTerm(term)
      const p = await panel()
      const expected = expectedCounts(term, g.sel)
      const line = []
      for (const c of CATEGORIES) {
        const grp = p.groups.find((x) => x.key === c.key)
        const shownTotal = grp?.total ?? 0
        const own = await dexCount(c.moduleId, term)
        line.push(`${c.key}=${shownTotal}/${own}/${expected[c.key]}`)
        check(
          `${g.vg} "${term}" ${c.key}: search matches the dex list and the bundle`,
          shownTotal === own && own === expected[c.key],
          `(search ${shownTotal}, dex ${own}, bundle ${expected[c.key]})`,
        )
        // The global search must not be showing a category the dex is empty for.
        if (expected[c.key] === 0) {
          check(
            `${g.vg} "${term}" ${c.key}: no group at all when nothing matches`,
            grp == null,
            grp ? `group present with ${grp.total}` : '',
          )
        }
      }
      log(`  ${String(g.vg).padEnd(21)} "${term}"  search/dex/bundle  ${line.join('  ')}`)
      // Re-open the panel for the next term: reading a dex count closed it.
      await setTerm('')
    }
  }

  // ================================================================ grouping
  hr('ITEM 1b — grouped results, and only groups that have a match')
  await selectGame('heartgold-soulsilver')
  await setTerm('sand')
  let p = await panel()
  const sandExpected = expectedCounts('sand', 4)
  log(`  "sand" groups: ${p.groups.map((g) => `${g.key}(${g.total})`).join(', ')}`)
  check('all four categories match "sand"', p.groupCount === 4, `(${p.groupCount})`)
  check(
    'group order is Species, Moves, Items, Abilities',
    JSON.stringify(p.groups.map((g) => g.key)) ===
      JSON.stringify(['species', 'moves', 'items', 'abilities']),
  )
  for (const c of CATEGORIES) {
    const grp = p.groups.find((x) => x.key === c.key)
    check(
      `the ${c.key} group is headed "${c.label}" and totals ${sandExpected[c.key]}`,
      grp?.head?.startsWith(c.label) && grp?.total === sandExpected[c.key],
      `${grp?.head}`,
    )
    check(
      `every ${c.key} hit contains the term`,
      grp.hits.every((h) => h.name.toLowerCase().includes('sand')),
    )
    check(
      `every ${c.key} hit targets the ${c.moduleId}`,
      grp.hits.every((h) => h.module === c.moduleId),
    )
  }
  await page.screenshot({ path: `${SHOTS}/search-grouped.png` })

  // A term that matches two categories must render two headers, not four.
  await setTerm('lick')
  p = await panel()
  const lickExpected = expectedCounts('lick', 4)
  log(
    `  "lick" groups: ${p.groups.map((g) => `${g.key}(${g.total})`).join(', ')} | expected species ${lickExpected.species}, moves ${lickExpected.moves}, items ${lickExpected.items}, abilities ${lickExpected.abilities}`,
  )
  check('"lick" renders exactly two groups', p.groupCount === 2, `(${p.groupCount})`)
  check(
    'they are Species and Moves',
    JSON.stringify(p.groups.map((g) => g.key)) === JSON.stringify(['species', 'moves']),
  )
  check(
    'no empty Items or Abilities section is rendered',
    (await page.$$('[data-testid="gs-group-items"]')).length === 0 &&
      (await page.$$('[data-testid="gs-group-abilities"]')).length === 0,
  )

  // Ranking: a prefix match must survive the per-group cap, ahead of mid-word hits.
  await setTerm('water')
  p = await panel()
  const itemHits = p.groups.find((g) => g.key === 'items')?.hits ?? []
  log(`  "water" item hits in order: ${itemHits.map((h) => h.name).join(', ')}`)
  check(
    'a prefix match ranks above a mid-word match',
    itemHits[0]?.name?.toLowerCase().startsWith('water'),
    itemHits[0]?.name,
  )

  // The cap must be visible, not a silent truncation.
  await selectGame('all')
  await setTerm('a')
  p = await panel()
  const aExpected = expectedCounts('a', 'all')
  log(`  "a" under All: ${p.groups.map((g) => `${g.key} ${g.shown}/${g.total}`).join(', ')}`)
  for (const g of p.groups) {
    check(
      `${g.key} shows at most 8 rows`,
      g.shown <= 8 && g.hits.length === g.shown,
      `(${g.shown})`,
    )
    check(`${g.key} reports its true total ${aExpected[g.key]}`, g.total === aExpected[g.key])
    check(
      `${g.key} says the list is capped ("${g.shown} of ${g.total}")`,
      g.head.includes(`${g.shown} of ${g.total}`),
      g.head,
    )
  }

  // ================================================================ item 4
  hr('ITEM 4 — empty state')
  await setTerm('zzzqq')
  p = await panel()
  log(`  panel text: "${p.text}"`)
  check('the panel is still shown', p.present)
  check('no groups are rendered', p.groupCount === 0 && p.groups.length === 0)
  check('a real message is shown, not a blank panel', (p.emptyText ?? '').length > 20, p.emptyText)
  check('the message names the query', (p.emptyText ?? '').includes('zzzqq'))
  check(
    'the message names all four categories it searched',
    /species/i.test(p.emptyText) &&
      /move/i.test(p.emptyText) &&
      /item/i.test(p.emptyText) &&
      /abilit/i.test(p.emptyText),
  )
  await page.screenshot({ path: `${SHOTS}/search-empty.png` })
  // Escape closes it, so an open panel cannot sit over the dex the user is reading.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  check(
    'Escape closes the panel',
    (await page.$$('[data-testid="global-search-results"]')).length === 0,
  )
  // Chrome clears a search input on Escape natively. The controlled value follows
  // it, which is the conventional behaviour for a search field -- asserted so it
  // stays deliberate.
  check(
    'Escape also clears the query, as a search field should',
    (await page.inputValue('[data-testid="global-search"]')) === '',
  )

  // ================================================================ item 3
  hr('ITEM 3 — clicking a result opens that entry in its own dex')
  await selectGame('heartgold-soulsilver')
  const surf = moves.find((m) => m.name === 'surf')
  const levitate = abilities.find((a) => a.name === 'levitate')
  const lickitung = species.find((s) => s.name === 'lickitung')
  const masterBall = items.find((i) => i.name === 'master-ball')
  const NAV_CASES = [
    {
      key: 'species',
      term: 'lickitung',
      entry: lickitung,
      moduleId: 'pokedex',
      detail: 'species-detail',
      idAttr: 'data-species-id',
      nameId: 'detail-name',
    },
    {
      key: 'moves',
      term: 'surf',
      entry: surf,
      moduleId: 'movedex',
      detail: 'movedex-detail',
      idAttr: 'data-entry-id',
      nameId: 'movedex-name',
    },
    {
      key: 'items',
      term: 'master ball',
      entry: masterBall,
      moduleId: 'itemdex',
      detail: 'itemdex-detail',
      idAttr: 'data-entry-id',
      nameId: 'itemdex-name',
    },
    {
      key: 'abilities',
      term: 'levitate',
      entry: levitate,
      moduleId: 'abilitydex',
      detail: 'abilitydex-detail',
      idAttr: 'data-entry-id',
      nameId: 'abilitydex-name',
    },
  ]
  // Start from a tab that is none of the four targets, so every case is a real
  // tab switch rather than a click that happened to already be on the right dex.
  await goTo('naturedex')
  for (const c of NAV_CASES) {
    await setTerm(c.term)
    const hitSel = `[data-testid="gs-hit-${c.key}-${c.entry.id}"]`
    const exists = (await page.$$(hitSel)).length === 1
    check(`a ${c.key} hit for "${c.term}" is offered`, exists, hitSel)
    if (!exists) continue
    await page.click(hitSel)
    await page.waitForSelector(`[data-testid="${c.detail}"]`, { timeout: 20000 })
    const state = await page.evaluate(
      ([moduleId, detail, idAttr, nameId]) => ({
        tabCurrent:
          document
            .querySelector(`[data-testid="nav-${moduleId}"]`)
            ?.getAttribute('aria-current') === 'page',
        entryId: Number(document.querySelector(`[data-testid="${detail}"]`)?.getAttribute(idAttr)),
        name: document.querySelector(`[data-testid="${nameId}"]`)?.textContent?.trim(),
        panelOpen: document.querySelector('[data-testid="global-search-results"]') != null,
        termKept: document.querySelector('[data-testid="global-search"]')?.value,
      }),
      [c.moduleId, c.detail, c.idAttr, c.nameId],
    )
    log(
      `  ${c.key.padEnd(10)} -> ${c.moduleId.padEnd(11)} tab=${state.tabCurrent} id=${state.entryId} name="${state.name}"`,
    )
    check(`clicking it switches to the ${c.moduleId} tab`, state.tabCurrent)
    check(`it opens entry ${c.entry.id}`, state.entryId === c.entry.id, String(state.entryId))
    check(`the detail shows "${c.entry.display_name}"`, state.name === c.entry.display_name)
    check(`the panel closes after navigating`, !state.panelOpen)
    check(`the query is left in the box`, state.termKept === c.term, state.termKept)
    await page.screenshot({ path: `${SHOTS}/search-nav-${c.key}.png` })
  }

  // Lifted selection: each dex remembers what the search opened in it.
  hr('ITEM 3b — the four opened entries are all still open, per dex')
  for (const c of NAV_CASES) {
    await goTo(c.moduleId)
    const id = await page.getAttribute(`[data-testid="${c.detail}"]`, c.idAttr)
    check(`${c.moduleId} still shows entry ${c.entry.id}`, Number(id) === c.entry.id, String(id))
  }

  // The regression this guards: selection resolved against the search-filtered
  // rows instead of the full list, so a result the local box hid would not open.
  hr("ITEM 3c — a result opens even when the dex's own search box hides its row")
  await goTo('pokedex')
  await withControls(() => page.fill('[data-testid="species-search"]', 'zzzq'))
  await page.waitForTimeout(150)
  const emptyList = await page.$$eval('[data-testid="species-rows"] [data-species-id]', (e) =>
    e.map((x) => x.getAttribute('data-species-id')),
  )
  check('the local list is filtered to nothing', emptyList.length === 0, `(${emptyList.length})`)
  // Stays on this tab on purpose: the dex's own search box is module-local state,
  // so leaving and coming back would remount it and clear the term, dismantling
  // the very situation under test.
  await setTerm('slowbro')
  const slowbro = species.find((s) => s.name === 'slowbro')
  await page.click(`[data-testid="gs-hit-species-${slowbro.id}"]`)
  await page.waitForSelector('[data-testid="species-detail"]', { timeout: 20000 })
  const opened = await page.evaluate(() => ({
    id: Number(
      document.querySelector('[data-testid="species-detail"]')?.getAttribute('data-species-id'),
    ),
    name: document.querySelector('[data-testid="detail-name"]')?.textContent?.trim(),
    localTerm: document.querySelector('[data-testid="species-search"]')?.value,
    rows: document.querySelectorAll('[data-testid="species-rows"] [data-species-id]').length,
  }))
  log(`  ${JSON.stringify(opened)}`)
  check('the species detail opened anyway', opened.id === slowbro.id && opened.name === 'Slowbro')
  check("the dex's own search term was left alone", opened.localTerm === 'zzzq', opened.localTerm)
  check('its row is genuinely still filtered out', opened.rows === 0)
  await withControls(() => page.fill('[data-testid="species-search"]', ''))

  // ================================================================ errors
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  HTTP >=400     : ${badResponses.length}`)
  badResponses.slice(0, 10).forEach((e) => log(`    ${e}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed HTTP responses', badResponses.length === 0, `(${badResponses.length})`)
} finally {
  if (browser) await browser.close()
  stopPreview()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
