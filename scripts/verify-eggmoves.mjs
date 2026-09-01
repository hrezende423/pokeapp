/**
 * Verification for the egg-move regression and its root cause.
 *
 * The reported symptom was "the egg-move section stopped rendering entirely".
 * The cause was not in the egg-move code: a transient HTTP 503 on the *encounters*
 * partition (GitHub Pages throttling a 2.8 MiB file) took the whole learnset down,
 * because
 *
 *   1. loadVersionGroupData fetched both partitions as one Promise.all and cached
 *      only on joint success, discarding good learnset rows;
 *   2. SpeciesDetail kept one shared `loaded`/`failure` pair for both datasets; and
 *   3. on failure the learnset still rendered <Learnset rows={[]}/>, whose empty
 *      state reads "No learnset data for this species in <game>" -- a failed fetch
 *      presented as confirmed absence, with no error shown in that card at all.
 *
 * So this suite checks two things: that egg moves render normally, and that a
 * failure in one partition can no longer damage the other or masquerade as "no
 * data". The failure is injected with the service worker blocked, because the SW
 * would otherwise satisfy the request from its CacheFirst store and the route would
 * never fire (which is exactly why this went unnoticed).
 *
 * Usage: node scripts/verify-eggmoves.mjs
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { withControlsOn } from './lib/controls.mjs'

const PORT = 4183
const APP_URL = `http://localhost:${PORT}/pokeapp/`

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

// ---------------------------------------------------------------- data census
hr('DATA — egg rows present in the partitions for the species under test')

const species = JSON.parse(readFileSync('public/data/species.json', 'utf8'))
const CASES = [
  { id: 133, name: 'Eevee', vg: 'heartgold-soulsilver' },
  { id: 1, name: 'Bulbasaur', vg: 'heartgold-soulsilver' },
  { id: 172, name: 'Pichu', vg: 'platinum' },
]
const partitions = new Map()
const rowsFor = (vg) => {
  if (!partitions.has(vg)) {
    partitions.set(vg, JSON.parse(readFileSync(`public/data/learnsets/${vg}.json`, 'utf8')))
  }
  return partitions.get(vg)
}
for (const c of CASES) {
  const pid = (species[c.id].varieties.find((v) => v.is_default) ?? species[c.id].varieties[0])
    .pokemon_id
  c.eggRows = rowsFor(c.vg).filter(
    (r) => r.species_id === c.id && r.pokemon_id === pid && r.method === 'egg',
  ).length
  log(
    `  #${String(c.id).padStart(3, '0')} ${c.name.padEnd(10)} ${c.vg.padEnd(22)} egg rows: ${c.eggRows}`,
  )
  check(`${c.name} has egg moves in the ${c.vg} partition`, c.eggRows > 0, `(${c.eggRows})`)
}
check('Eevee/heartgold-soulsilver still has exactly 10 egg rows', CASES[0].eggRows === 10)

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

  /*
    THE LEARNSET AND THE ENCOUNTERS ARE ON SEPARATE TABS NOW, and the isolation
    this suite exists to prove got STRONGER for it: the two datasets are no longer
    even mounted at the same time, so "a failing encounters partition must not
    touch the learnset" is checked by looking at each in turn rather than at both
    in one DOM. Every assertion below says which tab it is reading.

    The version group is still set through the app selector, because the page's own
    game scope seeds from it -- so `openDetail(page, 133, 'heartgold-soulsilver')`
    still lands on the HGSS learnset.
  */
  const openDetail = async (page, id, vg, name) => {
    if (await page.$('[data-testid="species-page-back"]')) {
      await page.click('[data-testid="species-page-back"]')
      await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
    }
    await withControlsOn(page, () => page.selectOption('[data-testid="vg-select"]', vg))
    await withControlsOn(page, () =>
      page.fill('[data-testid="species-search"]', name.toLowerCase()),
    )
    await page.waitForSelector(`[data-testid="species-row-${id}"]`, { timeout: 20000 })
    await page.click(`[data-testid="species-row-${id}"]`)
    await page.waitForSelector(`[data-testid="species-page"][data-species-id="${id}"]`, {
      timeout: 30000,
    })
  }

  const openTab = async (page, tab) => {
    await page.click(`[data-testid="species-page-subnav"] .ds-tab:text-is("${tab}")`)
    await page.waitForSelector(`[data-testid="species-page-panel-${tab.toLowerCase()}"]`, {
      timeout: 30000,
    })
  }

  // ============================================================ happy path
  hr('EGG MOVES — render for every species under test')
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(APP_URL, { waitUntil: 'load' })

  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  for (const c of CASES) {
    await openDetail(page, c.id, c.vg, c.name)
    await openTab(page, 'Learnset')
    await page.waitForSelector('[data-testid="species-learn-egg"]', { timeout: 60000 })
    const got = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="species-learn-egg"]')
      const rows = [...s.querySelectorAll('tbody tr')]
      return {
        heading: s.querySelector('h3')?.textContent.trim(),
        rows: rows.length,
        icons: s.querySelectorAll('svg[data-icon="IconEgg"]').length,
        buttons: s.querySelectorAll('button[data-testid^="egg-move-marker-"]').length,
        groups: [...document.querySelectorAll('.species-learn-group')].map((g) =>
          g.getAttribute('data-testid'),
        ),
        firstMove: rows[0]?.children[1]?.textContent.trim(),
      }
    })
    log(`  ${c.name} / ${c.vg}: ${JSON.stringify(got)}`)
    check(`${c.name}: egg section renders`, got.rows === c.eggRows, `(${got.rows}/${c.eggRows})`)
    check(`${c.name}: every egg row has an IconEgg`, got.icons === got.rows)
    check(`${c.name}: every egg row marker is a real button`, got.buttons === got.rows)
    check(
      `${c.name}: no egg icon leaks into other methods`,
      (await page.$$('svg[data-icon="IconEgg"]')).length === got.rows,
    )
  }

  // ============================================================ item 4: target
  hr('EGG MARKER — hover title and click popover respond')
  await openDetail(page, 133, 'heartgold-soulsilver', 'Eevee')
  await openTab(page, 'Learnset')
  await page.waitForSelector('[data-testid="species-learn-egg"]', { timeout: 60000 })
  const firstMarker = await page.$eval(
    '[data-testid="species-learn-egg"] button[data-testid^="egg-move-marker-"]',
    (el) => ({
      testid: el.getAttribute('data-testid'),
      title: el.getAttribute('title'),
      label: el.getAttribute('aria-label'),
      expanded: el.getAttribute('aria-expanded'),
      tag: el.tagName,
    }),
  )
  log(`  first marker: ${JSON.stringify(firstMarker)}`)
  check('marker is a <button>', firstMarker.tag === 'BUTTON')
  check(
    'marker carries a hover tooltip',
    (firstMarker.title ?? '').includes('breeding details coming soon'),
    JSON.stringify(firstMarker.title),
  )
  check('marker has an accessible name naming the move', /Charm/.test(firstMarker.label ?? ''))
  check('marker starts collapsed', firstMarker.expanded === 'false')

  const markerSel = `[data-testid="${firstMarker.testid}"]`
  const noteId = firstMarker.testid.replace('marker', 'note')
  await page.click(markerSel)
  await page.waitForSelector(`[data-testid="${noteId}"]`, { timeout: 10000 })
  const opened = await page.evaluate((id) => {
    const n = document.querySelector(`[data-testid="${id}"]`)
    const r = n.getBoundingClientRect()
    return {
      text: n.textContent.trim(),
      role: n.getAttribute('role'),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }
  }, noteId)
  log(`  popover: ${JSON.stringify(opened)}`)
  check('click opens a popover', opened.w > 0 && opened.h > 0)
  check(
    'popover says what it says on the tin',
    opened.text === 'Egg move — breeding details coming soon',
    JSON.stringify(opened.text),
  )
  check('popover is announced as a note', opened.role === 'note')
  check('button reports expanded', (await page.getAttribute(markerSel, 'aria-expanded')) === 'true')

  await page.keyboard.press('Escape')
  await page.waitForSelector(`[data-testid="${noteId}"]`, { state: 'detached', timeout: 10000 })
  check('Escape closes the popover', (await page.$$(`[data-testid="${noteId}"]`)).length === 0)
  await page.click(markerSel)
  await page.waitForSelector(`[data-testid="${noteId}"]`, { timeout: 10000 })
  // Somewhere outside the popover but on this tab -- the stats card it used to
  // click lives on Info, which would unmount the marker along with the popover.
  await page.click('[data-testid="species-learn-egg"] h3')
  await page.waitForSelector(`[data-testid="${noteId}"]`, { state: 'detached', timeout: 10000 })
  check('clicking elsewhere closes the popover', true)
  check(
    'no console errors on the happy path',
    consoleErrors.length === 0,
    consoleErrors.join(' | '),
  )
  check('no page errors on the happy path', pageErrors.length === 0, pageErrors.join(' | '))
  await ctx.close()

  // ============================================================ root cause
  hr('ROOT CAUSE — a failing encounters partition must not touch the learnset')
  // serviceWorkers: 'block' so the route actually sees the request. With the SW
  // running it would serve the file from CacheFirst and the failure would not
  // reproduce -- which is how this survived the earlier suites.
  const brokenCtx = await browser.newContext({ serviceWorkers: 'block' })
  const broken = await brokenCtx.newPage()
  let encounterAttempts = 0
  await broken.route('**/data/encounters/*.json', (route) => {
    encounterAttempts += 1
    return route.fulfill({ status: 503, body: 'throttled' })
  })
  await broken.goto(APP_URL, { waitUntil: 'load' })
  await broken.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  await openDetail(broken, 133, 'heartgold-soulsilver', 'Eevee')

  // The Description tab is what asks for the encounters file, so that is where
  // the 503 surfaces.
  await openTab(broken, 'Description')
  await broken.waitForSelector('[data-testid="locations-error"]', { timeout: 60000 })
  const failedSide = await broken.evaluate(() => ({
    encountersErrorShown: document.querySelector('[data-testid="locations-error"]') != null,
    encountersEmptyShown: document.querySelector('[data-testid="locations-empty"]') != null,
    encountersAlert:
      document
        .querySelector('[data-testid="species-locations"] [role="alert"]')
        ?.textContent.trim() ?? null,
    retryOffered: document.querySelector('[data-testid="locations-retry"]') != null,
    // The flavour text on the same tab comes from the eager bundle and must be
    // unaffected -- a failed partition may not blank its neighbours either.
    flavourEntries: document.querySelectorAll('[data-testid^="species-flavor-"]').length,
  }))

  // And the learnset, one tab over, must be untouched by it.
  await openTab(broken, 'Learnset')
  await broken.waitForSelector('[data-testid="species-learn-egg"]', { timeout: 60000 })
  const learnSide = await broken.evaluate(() => ({
    learnGroups: [...document.querySelectorAll('.species-learn-group')].map((g) =>
      g.getAttribute('data-testid'),
    ),
    eggRows: document.querySelectorAll('[data-testid="species-learn-egg"] tbody tr').length,
    eggIcons: document.querySelectorAll('svg[data-icon="IconEgg"]').length,
    learnsetEmptyShown: document.querySelector('[data-testid="learnset-empty"]') != null,
    learnsetErrorShown: document.querySelector('[data-testid="learnset-error"]') != null,
  }))
  const underFailure = { ...failedSide, ...learnSide }
  log(`  ${JSON.stringify(underFailure, null, 2).replace(/\n/g, '\n  ')}`)
  check(
    'the flavour text beside the failure still renders',
    underFailure.flavourEntries > 0,
    `(${underFailure.flavourEntries})`,
  )
  check('learnset still renders all four method groups', underFailure.learnGroups.length === 4)
  check(
    'egg-move section survives the encounters failure',
    underFailure.eggRows === 10,
    `(${underFailure.eggRows})`,
  )
  check('egg markers survive too', underFailure.eggIcons === 10, `(${underFailure.eggIcons})`)
  check('learnset does NOT claim "no data"', underFailure.learnsetEmptyShown === false)
  check('learnset shows no error of its own', underFailure.learnsetErrorShown === false)
  check('encounters reports the failure', underFailure.encountersErrorShown === true)
  check(
    'encounters does NOT claim "not found in the wild"',
    underFailure.encountersEmptyShown === false,
  )
  check('the failure is announced via role="alert"', underFailure.encountersAlert != null)
  check('a retry is offered', underFailure.retryOffered === true)

  // Retry must be able to succeed, i.e. the rejection was not cached, and only the
  // failed file is re-requested.
  hr('RETRY — after the route recovers, only the failed partition is re-fetched')
  const attemptsBeforeRetry = encounterAttempts
  const learnsetRequests = []
  broken.on('request', (r) => {
    if (r.url().includes('/data/learnsets/')) learnsetRequests.push(r.url())
  })
  /*
    ORDER MATTERS HERE. Come back to the failing tab FIRST, while the route is
    still returning 503, so the error and its retry are on screen -- then lift the
    route and click. Unrouting first would make the tab's own remount succeed on
    its way in, and there would be no retry left to test. (Which is itself worth
    knowing: leaving and re-entering the tab is a second, implicit retry path.)
  */
  await openTab(broken, 'Description')
  await broken.waitForSelector('[data-testid="locations-error"]', { timeout: 60000 })
  await broken.unroute('**/data/encounters/*.json')
  await broken.click('[data-testid="locations-retry"]')
  await broken.waitForSelector(
    '[data-testid="species-locations-rows"], [data-testid="locations-empty"]',
    { timeout: 60000 },
  )
  const retried = await broken.evaluate(() => ({
    encounterRows: document.querySelectorAll('[data-testid="species-locations-rows"] tbody tr')
      .length,
    errorGone: document.querySelector('[data-testid="locations-error"]') == null,
  }))
  await openTab(broken, 'Learnset')
  await broken.waitForSelector('[data-testid="species-learn-egg"]', { timeout: 60000 })
  const afterRetry = {
    ...retried,
    eggRows: await broken.$$eval('[data-testid="species-learn-egg"] tbody tr', (els) => els.length),
  }
  log(`  encounter fetch attempts while failing: ${attemptsBeforeRetry}`)
  log(`  after retry: ${JSON.stringify(afterRetry)}`)
  log(`  learnset re-requests during retry: ${learnsetRequests.length}`)
  check('retry clears the error', afterRetry.errorGone === true)
  check(
    'retry loads real encounter rows',
    Number(afterRetry.encounterRows) > 0,
    String(afterRetry.encounterRows),
  )
  check('egg moves untouched throughout', afterRetry.eggRows === 10)
  check(
    'the 4.2 MiB learnset file was NOT re-downloaded',
    learnsetRequests.length === 0,
    `(${learnsetRequests.length} request(s))`,
  )
  await brokenCtx.close()

  // ============================================================ inverse
  hr('INVERSE — a failing learnset partition must not touch encounters')
  const inverseCtx = await browser.newContext({ serviceWorkers: 'block' })
  const inverse = await inverseCtx.newPage()
  await inverse.route('**/data/learnsets/*.json', (r) => r.fulfill({ status: 503, body: 'nope' }))
  await inverse.goto(APP_URL, { waitUntil: 'load' })
  await inverse.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  await openDetail(inverse, 133, 'heartgold-soulsilver', 'Eevee')
  await openTab(inverse, 'Learnset')
  await inverse.waitForSelector('[data-testid="learnset-error"]', { timeout: 60000 })
  const invLearn = await inverse.evaluate(() => ({
    learnsetErrorShown: document.querySelector('[data-testid="learnset-error"]') != null,
    learnsetEmptyShown: document.querySelector('[data-testid="learnset-empty"]') != null,
    retryOffered: document.querySelector('[data-testid="learnset-retry"]') != null,
  }))
  // The encounters file is 2.8 MiB and the learnset 503 fails fast, so settle the
  // other tab before judging it -- otherwise the assertion races the download it
  // is meant to prove is unaffected.
  await openTab(inverse, 'Description')
  await inverse.waitForSelector(
    '[data-testid="species-locations-rows"], [data-testid="locations-empty"], [data-testid="locations-error"]',
    { timeout: 60000 },
  )
  const inv = {
    ...invLearn,
    encounterRows: await inverse.$$eval(
      '[data-testid="species-locations-rows"] tbody tr',
      (els) => els.length,
    ),
    encountersErrorShown: (await inverse.$('[data-testid="locations-error"]')) != null,
  }
  log(`  ${JSON.stringify(inv)}`)
  check('learnset reports its own failure', inv.learnsetErrorShown === true)
  check('learnset does not claim "no data"', inv.learnsetEmptyShown === false)
  check('encounters loaded normally', Number(inv.encounterRows) > 0, String(inv.encounterRows))
  check('encounters shows no error', inv.encountersErrorShown === false)
  check('learnset offers a retry', inv.retryOffered === true)
  await inverseCtx.close()
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
