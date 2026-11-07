/**
 * verify:offline -- the data partitions work offline BEFORE FIRST VIEW.
 *
 * Against the production build (vite preview of dist/, with its real service worker):
 *   1. install: the worker activates, and its precache holds the Gen 1-4 partitions
 *      (learnsets, encounters, trainers, battle) and NO sprite;
 *   2. the background warm-up fetches the 18 Gen 5+ learnsets into the runtime cache;
 *   3. with the network BLOCKED, never having viewed them online: a species page and
 *      its learnset, a move page and its learners, and the Trainer Dex all open;
 *   4. it reports the install size: what the precache stores, and the partitions' share.
 *
 * Self-hosted through lib/devServer.mjs on its own port. Needs `npm run build` first
 * (npm run check builds before any suite).
 */
import { chromium } from 'playwright'
import { startPreviewServer } from './lib/devServer.mjs'
import { fillDexSearch, selectGeneration } from './lib/controls.mjs'
import { goToDex } from './lib/nav.mjs'

const PORT = 4211
const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const preview = await startPreviewServer({ port: PORT })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  context.setDefaultNavigationTimeout(180000)
  const page = await context.newPage()
  const failed = []
  page.on('requestfailed', (r) => failed.push(r.url()))
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  hr('1. INSTALL: the worker precaches the Gen 1-4 partitions, and no sprite')
  await page.goto(preview.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 180000 })
  const sw = await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }))
    }
    const names = await caches.keys()
    const precache = names.find((n) => n.includes('precache'))
    const keys = precache ? (await (await caches.open(precache)).keys()).map((r) => new URL(r.url).pathname) : []
    let bytes = 0
    let partitionBytes = 0
    if (precache) {
      const cache = await caches.open(precache)
      for (const req of await cache.keys()) {
        const size = (await (await cache.match(req)).blob()).size
        bytes += size
        if (/\/data\/(learnsets|encounters|trainers|battle)\//.test(req.url)) partitionBytes += size
      }
    }
    return { controlled: !!navigator.serviceWorker.controller, names, keys, bytes, partitionBytes }
  })
  check('the service worker controls the page', sw.controlled)
  const has = (p) => sw.keys.some((k) => k.endsWith(p))
  for (const p of ['learnsets/red-blue.json', 'learnsets/platinum.json', 'learnsets/heartgold-soulsilver.json', 'encounters/platinum.json', 'trainers/platinum.json', 'battle/platinum.json']) {
    check(`precached: ${p}`, has(p))
  }
  const learnsets = sw.keys.filter((k) => k.includes('/data/learnsets/'))
  check('exactly the 14 Gen 1-4 learnsets are precached, no Gen 5+', learnsets.length === 14 && !has('learnsets/scarlet-violet.json'), `${learnsets.length}`)
  check('no sprite or artwork is precached', !sw.keys.some((k) => /sprites|artwork|\.webp$|\.gif$/.test(k)))
  const mib = (b) => `${(b / 1048576).toFixed(1)} MiB`
  console.log(`  install size: precache ${mib(sw.bytes)} (${sw.keys.length} entries), of which partitions ${mib(sw.partitionBytes)}`)

  hr('2. WARM-UP: the Gen 5+ learnsets are fetched in the background')
  const warm = await page.evaluate(
    () =>
      new Promise((ok) => {
        window.addEventListener('pokeapp:offline-warmup', (e) => ok(e.detail), { once: true })
        setTimeout(() => ok(null), 170000)
      }),
  )
  check('the warm-up ran to the end', warm != null && warm.skipped === null, JSON.stringify(warm))
  check('and covered all 18 Gen 5+ learnsets', warm != null && warm.fetched + warm.alreadyCached === 18, JSON.stringify(warm))
  const gen9 = await page.evaluate(async () => !!(await caches.match('/pokeapp/data/learnsets/scarlet-violet.json')))
  check('a Gen 9 learnset is in the runtime cache', gen9)

  hr('3. OFFLINE: pages never viewed online open with the network blocked')
  await context.setOffline(true)
  failed.length = 0
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  check('the app boots offline from the precache', true)
  await selectGeneration(page, 4)

  await goToDex(page, 'pokedex')
  await page.waitForSelector('[data-testid="species-open-25"], [data-testid="species-row-25"]', { timeout: 60000 })
  await page.click('[data-testid="species-open-25"], [data-testid="species-row-25"]')
  await page.waitForSelector('[data-testid="species-page"][data-species-id="25"]', { timeout: 30000 })
  await page.click('[data-testid="species-page-subnav"] .ds-tab:text-is("Learnset")')
  await page.waitForSelector('[data-testid="species-learnset"]', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), null, { timeout: 60000 })
  const learnRows = await page.$$eval('[data-testid="species-learnset"] tr', (rows) => rows.length)
  check('a species page and its learnset open offline (Pikachu, Gen 4)', learnRows > 5, `${learnRows} rows`)

  await goToDex(page, 'movedex')
  await fillDexSearch(page, 'movedex', 'thunderbolt')
  await page.waitForSelector('[data-testid^="movedex-row-"]', { timeout: 30000 })
  await page.click('[data-testid="movedex-row-85"]')
  await page.waitForSelector('[data-testid="movedex-detail"]', { timeout: 30000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="movedex-learner-count"]') != null || document.querySelector('[data-testid="movedex-learners-none"]') != null,
    null,
    { timeout: 60000 },
  )
  const learners = (await page.textContent('[data-testid="movedex-learner-count"]').catch(() => '')) ?? ''
  check('a move page and its learners open offline (Thunderbolt)', /\d/.test(learners), learners.trim())

  await page.evaluate(() => document.querySelector('[data-testid="nav-trainerdex"]').click())
  await page.waitForSelector('[data-testid="trainerdex-rows"]', { timeout: 60000 })
  const trainers = (await page.textContent('[data-testid="trainerdex-count"]')).replace(/\D/g, '')
  check('the Trainer Dex opens offline with its trainers', Number(trainers) > 0, `${trainers} trainers`)

  const dataFailures = failed.filter((u) => u.includes('/data/'))
  check('no data request failed while offline', dataFailures.length === 0, dataFailures.slice(0, 3).join(', '))
  check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  await context.close()
} finally {
  await browser.close()
  await preview.stop?.()
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
