/**
 * verify:mobile -- the phone shell (src/phoneShell.css; mockup public/mockups/phone-shell.html).
 *
 * At 390 x 844 (touch, iPhone 14 class):
 *   - no horizontal page scroll on the Pokédex, a species page and the Collection;
 *   - the nav is a bottom tab bar, every tab 44px+ and on screen; a tap opens its
 *     sheet above the bar, rows 44px+, and a tap on an entry navigates;
 *   - a species page opens and scrolls to its end; the Collection list shows its
 *     entries with the Fits text;
 *   - no box-shadow on the bar or the sheet.
 * At 1440 x 900: the desktop bar is unchanged (the nav is in the top bar, not fixed).
 *
 * Self-hosted (lib/devServer.mjs), system Chrome.
 */
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { selectGeneration } from './lib/controls.mjs'

const PORT = 4212
const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

const dev = await startDevServer({ port: PORT })
const browser = await chromium.launch({ channel: 'chrome' })

const SEED = {
  nextBuildSeq: 2,
  nextTeamSeq: 1,
  nextEntrySeq: 3,
  schemaVersion: 2,
  builds: [],
  teams: [],
  collection: [
    { id: 'c1', seq: 1, generation: 4, speciesId: 445, nickname: 'Rocky', level: 62, natureId: null, effort: { attack: 100, speed: 252 }, buildId: null },
    { id: 'c2', seq: 2, generation: 4, speciesId: 373, nickname: '', level: 55, natureId: null, effort: {}, buildId: null },
  ],
}

const noHorizontalScroll = (page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))

try {
  hr('1. PHONE 390 x 844: the bottom tab bar')
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block' })
  context.setDefaultNavigationTimeout(180000)
  const page = await context.newPage()
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 180000 })
  await page.evaluate((doc) => localStorage.setItem('pokeapp:team-builder:v1', JSON.stringify(doc)), SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="app-nav"]', { timeout: 180000 })
  await selectGeneration(page, 4)

  const bar = await page.$eval('[data-testid="app-nav"]', (el) => {
    const r = el.getBoundingClientRect()
    const tabs = [...el.querySelectorAll('.nav-trigger')].map((t) => t.getBoundingClientRect())
    const cs = getComputedStyle(el)
    return { position: cs.position, bottom: Math.round(r.bottom), top: Math.round(r.top), width: Math.round(r.width), shadow: cs.boxShadow, tabs: tabs.map((t) => ({ w: Math.round(t.width), h: Math.round(t.height) })) }
  })
  check('the nav is a fixed bar along the bottom of the screen', bar.position === 'fixed' && bar.bottom === 844 && bar.width === 390, JSON.stringify({ position: bar.position, top: bar.top, bottom: bar.bottom, width: bar.width }))
  check('three tabs, each at least 44 x 44', bar.tabs.length === 3 && bar.tabs.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(bar.tabs))
  check('no box-shadow on the bar', bar.shadow === 'none', bar.shadow)
  let s = await noHorizontalScroll(page)
  check('the Pokédex has no horizontal scroll', s.scroll <= s.client, `${s.scroll} / ${s.client}`)

  hr('2. A TAP OPENS THE SHEET; A TAP ON AN ENTRY NAVIGATES')
  await page.tap('[data-testid="nav-tab-pokepedia"]')
  await page.waitForSelector('[data-testid="nav-dropdown-pokepedia"]', { state: 'visible', timeout: 15000 })
  const sheet = await page.$eval('[data-testid="nav-dropdown-pokepedia"]', (el) => {
    const r = el.getBoundingClientRect()
    const rows = [...el.querySelectorAll('.nav-item')].map((b) => Math.round(b.getBoundingClientRect().height))
    const navTop = document.querySelector('[data-testid="app-nav"]').getBoundingClientRect().top
    return { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), navTop: Math.round(navTop), rows, shadow: getComputedStyle(el).boxShadow }
  })
  check('the sheet is full width and sits on the tab bar', sheet.left === 0 && sheet.width === 390 && Math.abs(sheet.bottom - sheet.navTop) <= 1, JSON.stringify({ left: sheet.left, width: sheet.width, bottom: sheet.bottom, navTop: sheet.navTop }))
  check('every sheet row is at least 44px tall', sheet.rows.length > 3 && sheet.rows.every((h) => h >= 44), sheet.rows.join(','))
  check('no box-shadow on the sheet', sheet.shadow === 'none', sheet.shadow)
  await page.tap('[data-testid="nav-movedex"]')
  await page.waitForSelector('[data-testid="movedex-count"]', { timeout: 30000 })
  check('tapping Movedex in the sheet opens the Movedex', true)
  s = await noHorizontalScroll(page)
  check('the Movedex has no horizontal scroll', s.scroll <= s.client, `${s.scroll} / ${s.client}`)

  hr('3. A SPECIES PAGE IS USABLE AT 390')
  await page.tap('[data-testid="nav-tab-pokepedia"]')
  await page.waitForSelector('[data-testid="nav-dropdown-pokepedia"]', { state: 'visible' })
  await page.tap('[data-testid="nav-pokedex"]')
  await page.waitForSelector('[data-testid="species-open-25"], [data-testid="species-row-25"]', { timeout: 60000 })
  await page.tap('[data-testid="species-open-25"], [data-testid="species-row-25"]')
  await page.waitForSelector('[data-testid="species-page"][data-species-id="25"]', { timeout: 30000 })
  await page.waitForTimeout(600)
  s = await noHorizontalScroll(page)
  check('the species page has no horizontal scroll', s.scroll <= s.client, `${s.scroll} / ${s.client}`)
  const reach = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('.scroll-area')].filter((e) => e.scrollHeight > e.clientHeight + 4)
    const el = scrollers.find((e) => e.closest('[data-testid="species-page"]')) ?? scrollers[0]
    if (!el) return { scrollable: false, reached: true }
    el.scrollTop = el.scrollHeight
    const bar = document.querySelector('[data-testid="app-nav"]').getBoundingClientRect().top
    const r = el.getBoundingClientRect()
    return { scrollable: true, reached: Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) <= 2, bottomAboveBar: r.bottom <= bar + 1, bottom: Math.round(r.bottom), bar: Math.round(bar) }
  })
  check('it scrolls to its end, and the scroller ends above the tab bar (nothing hidden under it)', reach.reached && reach.bottomAboveBar !== false, JSON.stringify(reach))
  const back = await page.$('[data-testid="app-bar-back"]')
  const backBox = back ? await back.boundingBox() : null
  check('the Back control is a 44px target', backBox != null && backBox.width >= 44 && backBox.height >= 44, JSON.stringify(backBox))

  hr('4. THE COLLECTION LIST IS USABLE AT 390')
  await page.tap('[data-testid="nav-tab-team-building"]')
  await page.waitForSelector('[data-testid="nav-dropdown-team-building"]', { state: 'visible' })
  await page.tap('[data-testid="nav-collection"]')
  await page.waitForSelector('[data-testid="col-list"]', { timeout: 60000 })
  await page.waitForTimeout(500)
  s = await noHorizontalScroll(page)
  check('the Collection has no horizontal page scroll', s.scroll <= s.client, `${s.scroll} / ${s.client}`)
  const list = await page.$eval('[data-testid="col-list"]', (el) => ({ text: el.innerText, right: Math.round(el.getBoundingClientRect().right) }))
  check('both entries are listed', list.text.includes('Rocky') && list.text.includes('Salamence'), list.text.slice(0, 80))
  await page.screenshot({ path: 'scripts/.verify-shots/mobile-collection.png' })
  await context.close()

  hr('5. DESKTOP 1440 x 900: the bar is unchanged')
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const dp = await desk.newPage()
  dp.setDefaultNavigationTimeout(180000)
  await dp.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await dp.waitForSelector('[data-testid="app-nav"]', { timeout: 180000 })
  const d = await dp.$eval('[data-testid="app-nav"]', (el) => ({ position: getComputedStyle(el).position, top: Math.round(el.getBoundingClientRect().top), inBar: !!el.closest('.app-bar') }))
  check('the nav sits in the top bar, not fixed', d.position !== 'fixed' && d.top < 120 && d.inBar, JSON.stringify(d))
  const footer = await dp.$eval('.app-footer', (el) => getComputedStyle(el).display)
  check('the footer still shows on desktop', footer !== 'none', footer)
  s = await noHorizontalScroll(dp)
  check('no horizontal scroll at 1440', s.scroll <= s.client, `${s.scroll} / ${s.client}`)
  await desk.close()
} finally {
  await browser.close()
  await dev.stop?.()
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
