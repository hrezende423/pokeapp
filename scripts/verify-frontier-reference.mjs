/**
 * verify:frontier-reference -- the Battle Frontier tab and its three read-only
 * reference screens (src/modules/battle-frontier/), against the APPROVED mockups.
 *
 * THE MOCKUPS ARE THE EXPECTED VALUES. public/mockups/frontier-*.html were generated
 * from the same frozen loader (scripts/mockups/frontier.mjs) and approved by the
 * owner, so this suite opens each mockup in the browser and compares the app's text
 * with the mockup's, region by region (whitespace collapsed). A literal is asserted
 * on top wherever the slice's "Done when" names one.
 *
 *   npm run verify:frontier-reference        (dev server, port 4206, system Chrome)
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { CHROME } from './lib/browser.mjs'
import { selectGeneration } from './lib/controls.mjs'
import { startDevServer } from './lib/devServer.mjs'

const PORT = 4206
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = new URL('./.verify-shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => fileURLToPath(new URL(`frontier-reference-${name}.png`, SHOTS))
const read = (p) => readFileSync(new URL(p, new URL('..', import.meta.url)), 'utf8')

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
/** Where two texts first differ, for a failing comparison. */
function diffAt(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return i >= a.length && i >= b.length ? '' : `@${i}: app "${a.slice(i, i + 50)}" vs mockup "${b.slice(i, i + 50)}"`
}
const same = (label, app, mock) => check(label, norm(app) === norm(mock) && norm(mock) !== '', diffAt(norm(app), norm(mock)))
const sameList = (label, app, mock) => {
  const a = app.map(norm)
  const m = mock.map(norm)
  const bad = m.findIndex((x, i) => x !== a[i])
  check(label, a.length === m.length && bad < 0 && m.length > 0, `app ${a.length} vs mockup ${m.length}${bad >= 0 ? ` · row ${bad}: ${diffAt(a[bad] ?? '', m[bad])}` : ''}`)
}

// ------------------------------------------------------------------ helpers in the page

const TRIGGER = '[data-testid="nav-tab-battle-frontier"]'
const DROPDOWN = '[data-testid="nav-dropdown-battle-frontier"]'
const ENTRY = (id) => `${DROPDOWN} [data-testid="nav-${id}"]`

async function openEntry(page, id) {
  await page.hover(TRIGGER)
  await page.waitForSelector(DROPDOWN, { state: 'visible', timeout: 15000 })
  await page.click(ENTRY(id))
  await page.mouse.move(1300, 900)
  await page.waitForSelector(DROPDOWN, { state: 'hidden', timeout: 5000 }).catch(() => {})
}
const ready = (page, screen) => page.waitForSelector(`[data-testid="frontier-${screen}"][data-status="ready"]`, { timeout: 60000 })

/** Accent uses on screen: elements drawn in the accent (text or a border), outermost only. */
const accentUses = (page) =>
  page.evaluate(() => {
    const probe = (v) => {
      const el = document.createElement('span')
      el.style.color = `var(${v})`
      document.body.appendChild(el)
      const c = getComputedStyle(el).color
      el.remove()
      return c
    }
    const accents = new Set([probe('--accent'), probe('--color-accent-default')])
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight
    }
    const hits = []
    const drawn = (s) =>
      ['Top', 'Right', 'Bottom', 'Left'].some(
        (k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none' && accents.has(s[`border${k}Color`]),
      ) ||
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && accents.has(s.outlineColor)) ||
      accents.has(s.backgroundColor) ||
      (s.textDecorationLine !== 'none' && accents.has(s.textDecorationColor))
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue
      const s = getComputedStyle(el)
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      const svg = el instanceof SVGElement && (accents.has(s.stroke) || accents.has(s.fill))
      const pseudo = ['::before', '::after'].some((p) => {
        const ps = getComputedStyle(el, p)
        return ps.content !== 'none' && ps.content !== 'normal' && (drawn(ps) || accents.has(ps.color))
      })
      if ((ownText && accents.has(s.color)) || drawn(s) || svg || pseudo) hits.push(el)
    }
    const outer = hits.filter((el) => !hits.some((o) => o !== el && o.contains(el)))
    return outer.map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''}:${el.textContent.trim().slice(0, 24)}`)
  })

/** The mockup's text for a selector, inside state n (1-based) of a mockup page. */
const mockTexts = (page, n, sel) =>
  page.evaluate(([n, sel]) => [...document.querySelectorAll('section.state')[n - 1].querySelectorAll(sel)].map((e) => e.textContent), [n, sel])
const appTexts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent), sel)

// ------------------------------------------------------------------ run

const dev = await startDevServer({ port: PORT })
let browser
const consoleErrors = []
const frontierRequests = []
try {
  browser = await chromium.launch(CHROME)
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
  context.setDefaultNavigationTimeout(180000)
  context.setDefaultTimeout(60000)
  const page = await context.newPage()
  const mock = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  page.on('request', (r) => {
    if (/\/data\/(frontier\/emerald|trainers\/emerald)\.json/.test(r.url())) frontierRequests.push(r.url())
  })
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(TRIGGER, { timeout: 180000 })
  const openMock = async (file) => {
    await mock.goto(`${dev.url}mockups/${file}`, { waitUntil: 'load' })
    // A background tab's frames are throttled to 1 fps: keep the app in front.
    await page.bringToFront()
  }

  // ================================================================ 1. NAV
  hr('1. THE TAB: between Team Building and Tools, opens Facilities, four entries')
  const triggers = await page.$$eval('.nav-trigger', (els) => els.map((e) => e.textContent.trim()))
  check('the tabs read Poképedia / Team Building / Battle Frontier / Tools', JSON.stringify(triggers) === JSON.stringify(['Poképedia', 'Team Building', 'Battle Frontier', 'Tools']), triggers.join(','))
  await page.click(TRIGGER)
  await page.waitForSelector('[data-testid="frontier-facilities"]', { timeout: 60000 })
  check('clicking the tab word opens Facilities', (await page.$('[data-testid="frontier-facilities"]')) != null)
  await page.hover(TRIGGER)
  await page.waitForSelector(DROPDOWN, { state: 'visible' })
  const entries = await page.$$eval(`${DROPDOWN} .nav-item`, (els) =>
    els.map((e) => ({ label: e.textContent.trim(), current: e.getAttribute('aria-current'), weight: getComputedStyle(e).fontWeight, color: getComputedStyle(e).color })),
  )
  check('the dropdown lists Facilities, Brains, Challenge Tracker, Sets & Trainers', JSON.stringify(entries.map((e) => e.label)) === JSON.stringify(['Facilities', 'Brains', 'Challenge Tracker', 'Sets & Trainers']), entries.map((e) => e.label).join(','))
  const cur = entries.find((e) => e.current === 'page')
  const others = entries.filter((e) => e.current !== 'page')
  check('the current entry (Facilities) is marked by weight', cur?.label === 'Facilities' && Number(cur.weight) >= 600 && others.every((e) => Number(e.weight) < 600), JSON.stringify(cur))
  check('... and not by colour: it is the same colour as the others', others.every((e) => e.color === cur?.color), `${cur?.color} vs ${others.map((e) => e.color).join(',')}`)
  const navAccent = await accentUses(page)
  check('with the dropdown open on Facilities: accent within 2 uses', navAccent.length <= 2, navAccent.join(' | '))
  await page.screenshot({ path: shot('nav'), clip: { x: 0, y: 0, width: 1440, height: 320 } })
  await page.click(ENTRY('frontier-tracker'))
  await page.mouse.move(1300, 900)
  check('Challenge Tracker is a stub placeholder', (await page.waitForSelector('[data-testid="stub-frontier-tracker"]', { timeout: 15000 }).catch(() => null)) != null)

  // ================================================================ 2. OTHER GENERATION
  hr('2. ANY OTHER GENERATION: the notice only, and no Frontier data fetched')
  for (const gen of ['4', 'all']) {
    await selectGeneration(page, gen)
    for (const [id, screen] of [['frontier-facilities', 'facilities'], ['frontier-brains', 'brains'], ['frontier-sets', 'sets']]) {
      await openEntry(page, id)
      await page.waitForSelector(`[data-testid="frontier-${screen}"]`)
      const s = await page.$eval(`[data-testid="frontier-${screen}"]`, (root) => ({
        status: root.dataset.status,
        notice: root.querySelector('[data-testid="frontier-notice"]')?.textContent ?? null,
        body: [...root.querySelector('.bf-page').children].map((c) => c.className),
        scope: root.querySelector('.bf-scope') != null,
      }))
      check(`[gen ${gen}] ${screen}: only the head and the notice`, s.status === 'other-generation' && s.notice === 'Battle Frontier data covers Emerald (Gen 3).' && s.body.length === 2 && !s.scope, JSON.stringify(s))
    }
  }
  check('no Frontier data was requested under Gen 4 or All', frontierRequests.length === 0, frontierRequests.join(', '))
  await page.screenshot({ path: shot('notice') })

  await selectGeneration(page, 3)

  // ================================================================ 3. FACILITIES
  hr('3. FACILITIES: seven facility sections and the shared section, as the mockup')
  await openEntry(page, 'frontier-facilities')
  await ready(page, 'facilities')
  check('Gen 3: Frontier data was fetched (rules + the Emerald partition)', frontierRequests.some((u) => u.includes('frontier/emerald')) && frontierRequests.some((u) => u.includes('trainers/emerald')), frontierRequests.length)
  await openMock('frontier-facilities.html')
  const facIds = await page.$$eval('[data-layout="facility"]', (els) => els.map((e) => e.dataset.facility))
  check('7 facility sections, in the mockup order', JSON.stringify(facIds) === JSON.stringify(['tower', 'dome', 'factory', 'palace', 'arena', 'pike', 'pyramid']), facIds.join(','))
  const appFac = await appTexts(page, '[data-layout="facility"]')
  const mockFac = await mockTexts(mock, 2, '[data-layout="facility"]')
  facIds.forEach((id, i) => same(`${id}: every fact as the mockup`, appFac[i], mockFac[i]))
  for (const region of ['frontier-symbols', 'frontier-levels', 'frontier-banned', 'frontier-bp-rules', 'frontier-bp-shop']) {
    same(`shared: ${region} as the mockup`, (await appTexts(page, `[data-layout="${region}"]`))[0], (await mockTexts(mock, 2, `[data-layout="${region}"]`))[0])
  }
  const shared = await page.evaluate(() => ({
    banned: document.querySelectorAll('[data-layout="frontier-banned"] .bf-link').length,
    clerks: [...document.querySelectorAll('[data-layout="bp-shop-clerk"]')].map((c) => c.querySelectorAll('tr').length),
    levels: document.querySelector('[data-layout="frontier-levels"]').textContent,
  }))
  check('10 banned species, each a link', shared.banned === 10, shared.banned)
  check('BP shop: 30 entries from 4 clerks (10 / 5 / 6 / 9)', JSON.stringify(shared.clerks) === '[10,5,6,9]', JSON.stringify(shared.clerks))
  check('levels: 32 Open-only sets #850-#881, Open Level at least 60, Factory 100', /32 sets from #850 to #881/.test(shared.levels) && /at least 60/.test(shared.levels) && /always 100/.test(shared.levels))
  const regionsFac = await page.$$eval('[data-layout]', (els) => [...new Set(els.map((e) => e.dataset.layout))])
  const wantFac = ['frontier-scroll', 'frontier-facilities', 'page-head', 'facility-grid', 'facility', 'facility-facts', 'frontier-shared', 'frontier-symbols', 'frontier-levels', 'frontier-banned', 'frontier-bp-rules', 'frontier-bp-shop', 'bp-shop-clerk']
  check('region names are the mockup\'s', wantFac.every((r) => regionsFac.includes(r)), wantFac.filter((r) => !regionsFac.includes(r)).join(','))

  // ================================================================ 4. BRAINS
  hr('4. BRAINS: seven Brains, Silver and Gold teams with sprites, Noland generated')
  await openEntry(page, 'frontier-brains')
  await ready(page, 'brains')
  await openMock('frontier-brains.html')
  const brains = await page.$$eval('[data-layout="brain"]', (els) =>
    els.map((b) => ({
      facility: b.dataset.facility,
      teams: b.querySelectorAll('[data-layout="brain-team"]').length,
      rows: b.querySelectorAll('[data-layout="brain-team"] tbody tr').length,
      sprites: [...b.querySelectorAll('[data-layout="brain-team"] tbody tr')].filter((tr) => tr.querySelector('img.bf-sprite')?.getAttribute('src')?.includes('/emerald/')).length,
      generated: b.querySelector('[data-layout="brain-generated"]') != null,
    })),
  )
  check('7 Brains', brains.length === 7, brains.length)
  const fixed = brains.filter((b) => !b.generated)
  check('6 Brains have a Silver and a Gold team, 3 rows each', fixed.length === 6 && fixed.every((b) => b.teams === 2 && b.rows === 6), JSON.stringify(fixed.map((b) => [b.facility, b.teams, b.rows])))
  check('every team row has its Emerald sprite (36)', fixed.reduce((n, b) => n + b.sprites, 0) === 36, JSON.stringify(fixed.map((b) => b.sprites)))
  const noland = brains.find((b) => b.facility === 'factory')
  check('Noland: the generated explanation and no team', noland?.generated && noland.teams === 0, JSON.stringify(noland))
  const appBrains = await appTexts(page, '[data-layout="brain"]')
  const mockBrains = await mockTexts(mock, 1, '[data-layout="brain"]')
  brains.forEach((b, i) => same(`${b.facility}: the Brain section's text as the mockup`, appBrains[i], mockBrains[i]))
  // Sprites decode (runtime-fetched from the sprites repo, never precached).
  const tall = await page.$eval('.bf-page', (el) => el.scrollHeight)
  await page.setViewportSize({ width: 1440, height: Math.min(tall + 200, 12000) })
  await page.waitForFunction(() => [...document.querySelectorAll('[data-layout="brain-team"] img.bf-sprite')].every((i) => i.complete), null, { timeout: 60000 }).catch(() => {})
  const decoded = await page.$$eval('[data-layout="brain-team"] img.bf-sprite', (imgs) => imgs.filter((i) => i.naturalWidth > 0).length)
  check('the 36 Brain sprites decode', decoded === 36, decoded)
  const regionsBrains = await page.$$eval('[data-layout]', (els) => [...new Set(els.map((e) => e.dataset.layout))])
  const wantBrains = ['frontier-scroll', 'frontier-brains', 'page-head', 'brain-list', 'brain', 'brain-head', 'brain-appearances', 'brain-team', 'brain-generated']
  check('Brains: region names are the mockup’s', wantBrains.every((r) => regionsBrains.includes(r)), wantBrains.filter((r) => !regionsBrains.includes(r)).join(','))
  await page.screenshot({ path: shot('brains-light') })
  await page.setViewportSize({ width: 1440, height: 1000 })

  // Links: no line at rest, a hairline on hover; one opens the Pokédex, back returns.
  const salamence = '[data-symbol="silver"] [data-species-id="373"].bf-link'
  await page.$eval(salamence, (el) => el.scrollIntoView({ block: 'center' }))
  const rest = await page.$eval(salamence, (el) => getComputedStyle(el).borderBottomColor)
  await page.hover(salamence)
  const hover = await page.$eval(salamence, (el) => ({
    c: getComputedStyle(el).borderBottomColor,
    w: parseFloat(getComputedStyle(el).borderBottomWidth),
    style: getComputedStyle(el).borderBottomStyle,
    strong: (() => {
      const p = document.createElement('span')
      p.style.color = 'var(--color-border-strong)'
      document.body.appendChild(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    })(),
  }))
  check('a link has no line at rest', /rgba\(.*, 0\)|transparent/.test(rest), rest)
  check('... and a hairline on hover (--color-border-strong, drawn)', hover.c === hover.strong && hover.w > 0 && hover.w <= 1.5 && hover.style === 'solid', JSON.stringify(hover))
  await page.click(salamence)
  const opened = await page.waitForSelector('[data-testid="species-page"][data-species-id="373"]', { timeout: 30000 }).catch(() => null)
  check('Salamence (Tucker\'s Silver team) opens its Pokédex page through the entity link', opened != null)
  await page.goBack()
  check('back returns to Brains', (await page.waitForSelector('[data-testid="frontier-brains"]', { timeout: 30000 }).catch(() => null)) != null)
  await page.mouse.move(1300, 900)

  // ================================================================ 5. SETS
  hr('5. SETS: 882 in one list; "salamence"; Open Level only')
  await openEntry(page, 'frontier-sets')
  await ready(page, 'sets')
  await openMock('frontier-sets.html')
  const t0 = Date.now()
  await page.waitForSelector('[data-testid="sets-list"] tbody tr')
  const rowsAll = await page.$$eval('[data-testid="sets-list"] tbody tr', (trs) => trs.length)
  check('882 sets, one list', rowsAll === 882 && (await page.textContent('[data-testid="sets-count"]')) === '882 sets', rowsAll)
  const regionsSets = await page.$$eval('[data-layout]', (els) => [...new Set(els.map((e) => e.dataset.layout))])
  const wantSets = ['frontier-scroll', 'frontier-sets', 'page-head', 'sets-body', 'sets-views', 'sets-controls', 'sets-count', 'sets-list']
  check('Sets: region names are the mockup’s', wantSets.every((r) => regionsSets.includes(r)), wantSets.filter((r) => !regionsSets.includes(r)).join(','))
  check('the views read "Sets 882" and "Trainers 300"', norm((await appTexts(page, '[data-layout="sets-views"] [role="tab"]')).slice(0, 2).join('|')) === 'Sets 882|Trainers 300')
  sameList('the first 30 set rows as the mockup', (await appTexts(page, '[data-testid="sets-list"] tbody tr')).slice(0, 30), await mockTexts(mock, 1, '[data-layout="sets-list"] tbody tr'))
  const spriteRows = await page.$$eval('[data-testid="sets-list"] tbody tr', (trs) => trs.filter((tr) => tr.querySelector('img.bf-sprite')?.getAttribute('src')?.includes('/emerald/')).length)
  check('every set row carries its Emerald sprite (lazy)', spriteRows === 882, spriteRows)
  const lazy = await page.$$eval('[data-testid="sets-list"] img.bf-sprite', (imgs) => imgs.every((i) => i.loading === 'lazy'))
  check('the 882 sprites are lazy (fetched as they scroll in, runtime-cached)', lazy)
  // Scroll the whole list and look for long frames.
  const scrollCost = await page.evaluate(async () => {
    const sc = document.querySelector('[data-testid="frontier-scroll-area"]')
    const gaps = []
    let last = performance.now()
    for (let y = 0; y < sc.scrollHeight; y += 600) {
      sc.scrollTop = y
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now()
      gaps.push(now - last)
      last = now
    }
    sc.scrollTop = 0
    gaps.sort((a, b) => a - b)
    return { frames: gaps.length, p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]), max: Math.round(gaps.at(-1)) }
  })
  log(`  (render ${Date.now() - t0} ms; scroll: ${JSON.stringify(scrollCost)})`)
  check('scrolling the 882 rows does not jank (95th-percentile frame under 50 ms)', scrollCost.p95 < 50, JSON.stringify(scrollCost))
  await page.fill('[data-testid="sets-search"]', 'salamence')
  const salCount = await page.textContent('[data-testid="sets-count"]')
  same('"salamence": the count as the mockup', salCount, (await mockTexts(mock, 2, '[data-layout="sets-count"]'))[0])
  sameList('"salamence": the rows as the mockup', await appTexts(page, '[data-testid="sets-list"] tbody tr'), await mockTexts(mock, 2, '[data-layout="sets-list"] tbody tr'))
  await page.fill('[data-testid="sets-search"]', 'lass')
  check('search reaches a trainer class too ("lass")', Number((await page.textContent('[data-testid="sets-count"]')).split(' ')[0]) > 0)
  await page.fill('[data-testid="sets-search"]', 'leftovers')
  check('... and a held item ("leftovers")', Number((await page.textContent('[data-testid="sets-count"]')).split(' ')[0]) > 0)
  await page.fill('[data-testid="sets-search"]', '')
  await page.click('[data-testid="sets-open-only"]')
  check('"Open Level only" shows 32', (await page.textContent('[data-testid="sets-count"]')) === '32 sets')
  sameList('Open Level only: the 32 rows as the mockup', await appTexts(page, '[data-testid="sets-list"] tbody tr'), await mockTexts(mock, 3, '[data-layout="sets-list"] tbody tr'))
  await page.screenshot({ path: shot('sets-open-light') })
  await page.click('[data-testid="sets-open-only"]')
  await page.screenshot({ path: shot('sets-light') })

  // ================================================================ 6. TRAINERS
  hr('6. TRAINERS: 300; Vince (#222) opens to his sets; module-local, not a back step')
  const histBefore = await page.evaluate(() => ({ n: history.length, s: JSON.stringify(history.state) }))
  await page.click('[data-testid="frontier-view-trainers"]')
  const trainerRows = await page.$$eval('[data-testid="trainers-list"] tbody tr', (trs) => trs.length)
  check('300 trainers', trainerRows === 300, trainerRows)
  const regionsTr = await page.$$eval('[data-layout]', (els) => [...new Set(els.map((e) => e.dataset.layout))])
  const wantTr = ['trainers-body', 'sets-views', 'trainers-search', 'trainers-list']
  check('Trainers: region names are the mockup’s', wantTr.every((r) => regionsTr.includes(r)), wantTr.filter((r) => !regionsTr.includes(r)).join(','))
  const mockTrainerRows = await mockTexts(mock, 4, '[data-layout="trainers-list"] tbody tr')
  sameList('the first 25 trainer rows as the mockup', (await appTexts(page, '[data-testid="trainers-list"] tbody tr')).slice(0, 25), mockTrainerRows.slice(0, 25))
  same('Vince\'s row (#222) as the mockup', (await appTexts(page, '[data-trainer-id="222"]'))[0], mockTrainerRows[25])
  await page.fill('[data-testid="trainers-search"]', 'Vince')
  check('searching "Vince" finds one trainer', (await page.$$eval('[data-testid="trainers-list"] tbody tr', (trs) => trs.length)) === 1)
  await page.click('[data-testid="trainer-open-222"]')
  await page.waitForSelector('[data-testid="trainer-sets-222"]')
  const vince = await page.$eval('[data-testid="trainer-sets-222"]', (el) => ({
    cap: el.querySelector('.bf-cap').textContent,
    rows: [...el.querySelectorAll(':scope table tbody tr')].map((tr) => tr.textContent),
  }))
  check('Vince opens to his 100 sets (20 Open Level only)', vince.cap === 'Vince’s 100 sets (20 Open Level only)' && vince.rows.length === 100, `${vince.cap} · ${vince.rows.length}`)
  const mockVince = mockTrainerRows.slice(26, 26 + 1)[0] ?? ''
  const mockVinceSets = await mock.evaluate(() => [...document.querySelectorAll('section.state')[3].querySelectorAll('[data-layout="trainers-list"] table table tbody tr')].map((tr) => tr.textContent))
  sameList('his first 8 sets as the mockup', vince.rows.slice(0, 8), mockVinceSets)
  check('(the mockup had his opened row)', norm(mockVince).startsWith('Vince’s 100 sets'), norm(mockVince).slice(0, 30))
  await page.screenshot({ path: shot('trainers-light') })
  const histAfter = await page.evaluate(() => ({ n: history.length, s: JSON.stringify(history.state) }))
  check('switching view and opening a trainer push no back-stack step', JSON.stringify(histBefore) === JSON.stringify(histAfter), `${JSON.stringify(histBefore)} -> ${JSON.stringify(histAfter)}`)

  // ================================================================ 7. STREAK LOOKUP
  hr('7. STREAK LOOKUP: the owner\'s three cases, as the mockup answers them')
  await page.click('[data-testid="frontier-view-lookup"]')
  await page.waitForSelector('[data-testid="streak-lookup"]')
  const mockCases = await mock.evaluate(() =>
    [...document.querySelectorAll('section.state')[4].querySelectorAll('[data-layout="streak-lookup-result"] dl')].map((d) => d.textContent),
  )
  const lookup = async ({ facility, level, battle, symbols, tower, format = 'singles' }) => {
    await page.selectOption('[data-testid="lookup-facility"]', facility)
    await page.selectOption('[data-testid="lookup-format"]', format)
    await page.selectOption('[data-testid="lookup-level"]', level)
    await page.fill('[data-testid="lookup-battle"]', String(battle))
    await page.selectOption('[data-testid="lookup-symbols"]', String(symbols))
    if (tower != null) await page.fill('[data-testid="lookup-tower-streak"]', String(tower))
    return norm(await page.textContent('[data-testid="streak-lookup-result"]'))
  }
  const dome = await lookup({ facility: 'dome', level: 'lv50', battle: 20, symbols: 0 })
  same('Dome battle 20: as the mockup', dome, mockCases[0])
  check('... tournament 5 final; IDs 140–199 (10 from 140–179, 5 from 160–199); Tucker Silver due', /20 · Tournament 5 · Final/.test(dome) && /140–199/.test(dome) && /10 from 140–179/.test(dome) && /5 from 160–199/.test(dome) && /Tucker \(Silver\)/.test(dome))
  await page.screenshot({ path: shot('lookup-dome-light') })
  const factory = await lookup({ facility: 'factory', level: 'lv50', battle: 21, symbols: 0, tower: 0 })
  same('Factory battle 21: as the mockup', factory, mockCases[1])
  check('... Hard ladder 140–159, sets #267–#371, Noland Silver due with a generated team', /140–159/.test(factory) && /Hard 7th battleYes/.test(factory) && /#267–#371/.test(factory) && /Noland \(Silver\) is this battle’s opponent, with a generated team/.test(factory))
  const tower = await lookup({ facility: 'tower', level: 'lv50', battle: 50, symbols: 1 })
  same('Tower streak 49 (battle 50): as the mockup', tower, mockCases[2])
  check('... IDs 200–299, not Hard, IV 21 for 200–219 and 31 for 220–299, next Gold at battle 70', /200–299/.test(tower) && /Hard 7th battleNo/.test(tower) && /21 for IDs 200–219, 31 for IDs 220–299/.test(tower) && /Next: Gold at battle 70/.test(tower))
  const regionsLk = await page.$$eval('[data-layout]', (els) => [...new Set(els.map((e) => e.dataset.layout))])
  const wantLk = ['streak-lookup', 'streak-lookup-form', 'streak-lookup-result']
  check('Lookup: region names are the mockup’s', wantLk.every((r) => regionsLk.includes(r)), wantLk.filter((r) => !regionsLk.includes(r)).join(','))

  // Beyond the mockup: Brains are Singles only, and the Pyramid's waits at the top after floor 7.
  const anabel = await lookup({ facility: 'tower', level: 'lv50', battle: 35, symbols: 0 })
  check('Tower battle 35, Singles: Anabel (Silver) is the opponent', /Anabel \(Silver\) is this battle’s opponent/.test(anabel), anabel.slice(-90))
  const doubles = await lookup({ facility: 'tower', level: 'lv50', battle: 35, symbols: 0, format: 'doubles' })
  check('... in Doubles: no Brain (Singles only)', /BrainNone: Frontier Brains appear in Singles only\./.test(doubles) && !/Anabel/.test(doubles), doubles.slice(-90))
  const floor21 = await lookup({ facility: 'pyramid', level: 'lv50', battle: 21, symbols: 0 })
  check('Pyramid floor 21 (challenge 3, floor 7): Brandon (Silver) waits at the top after it', /21 · Challenge 3 · floor 7/.test(floor21) && /Brandon \(Silver\) waits at the top, after this floor\./.test(floor21), floor21.slice(-90))
  const floor22 = await lookup({ facility: 'pyramid', level: 'lv50', battle: 22, symbols: 1 })
  check('Pyramid floor 22 (challenge 4, floor 1): no Brain on it; next Gold after floor 70', /22 · Challenge 4 · floor 1/.test(floor22) && !/Brandon/.test(floor22) && /Next: Gold at the top, after floor 70/.test(floor22), floor22.slice(-90))

  // The reusable component, mounted on its own with initial inputs, as the tracker will.
  const seeded = await page.evaluate(async () => {
    const base = '/pokeapp/'
    const main = await (await fetch(`${base}src/main.tsx`)).text()
    const domUrl = /["']([^"']*\/deps\/react-dom_client\.js[^"']*)["']/.exec(main)?.[1]
    const own = await (await fetch(`${base}src/modules/battle-frontier/StreakLookup.tsx`)).text()
    const reactUrl = /["']([^"']*\/deps\/react\.js[^"']*)["']/.exec(own)?.[1]
    if (!domUrl || !reactUrl) return { error: `no dep urls: ${domUrl} / ${reactUrl}` }
    const reactMod = await import(reactUrl)
    const React = reactMod.default ?? reactMod
    const dom = await import(domUrl)
    const createRoot = dom.createRoot ?? dom.default.createRoot
    const { SetsTrainers } = await import(`${base}src/modules/battle-frontier/SetsTrainers.tsx`)
    const { loadFrontierData } = await import(`${base}src/modules/battle-frontier/data/index.ts`)
    const data = await loadFrontierData(3)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(
      React.createElement(SetsTrainers, {
        data,
        lookup: { facility: 'factory', levelMode: 'open', streak: 20, format: 'doubles', symbols: 1, towerLv50Streak: 7 },
      }),
    )
    await new Promise((r) => setTimeout(r, 400))
    const v = (id) => host.querySelector(`[data-testid="${id}"]`)?.value
    const out = {
      tab: host.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      facility: v('lookup-facility'),
      format: v('lookup-format'),
      level: v('lookup-level'),
      battle: v('lookup-battle'),
      symbols: v('lookup-symbols'),
      tower: v('lookup-tower-streak'),
      result: host.querySelector('[data-testid="streak-lookup-result"]')?.textContent ?? '',
    }
    root.unmount()
    host.remove()
    return out
  })
  check(
    'Sets & Trainers with { facility, levelMode, streak, … } opens on the lookup, seeded',
    seeded.tab === 'Streak lookup' && seeded.facility === 'factory' && seeded.format === 'doubles' && seeded.level === 'open' && seeded.battle === '21' && seeded.symbols === '1' && seeded.tower === '7',
    JSON.stringify({ ...seeded, result: undefined }),
  )
  check('... and answers for those inputs (battle 21, Open Level, Doubles: no Brain)', /21 · Set 3 · battle 7/.test(seeded.result ?? '') && /at least 100/.test(seeded.result ?? '') && /Singles only/.test(seeded.result ?? ''), norm(seeded.result).slice(0, 120))

  // ================================================================ 8. THEMES
  hr('8. BOTH THEMES: tokens only, accent within 2 per screen, no shadow')
  const css = read('src/modules/battle-frontier/frontier.css') + read('src/modules/battle-frontier/nav.css')
  check('no hard-coded colour in the module CSS', !/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')))
  check('no primitive colour token (semantic tokens only)', !/--color-(accent|neutral|white|black)-\d|--color-white|--color-black/.test(css))
  check('no box-shadow', !/box-shadow/.test(css))
  const setTheme = (t) => page.evaluate((t) => (document.documentElement.dataset.theme = t), t)
  const colours = {}
  for (const theme of ['light', 'dark']) {
    await setTheme(theme)
    for (const [id, screen, view] of [['frontier-facilities', 'facilities'], ['frontier-brains', 'brains'], ['frontier-sets', 'sets', 'sets'], ['frontier-sets', 'sets', 'trainers'], ['frontier-sets', 'sets', 'lookup']]) {
      await openEntry(page, id)
      await ready(page, screen)
      if (view) await page.click(`[data-testid="frontier-view-${view}"]`)
      await page.waitForTimeout(150)
      const uses = await accentUses(page)
      check(`[${theme}] ${screen}${view ? `/${view}` : ''}: accent within 2 uses`, uses.length <= 2, uses.join(' | '))
      const shadows = await page.$$eval('.bf, .bf *', (els) => els.filter((e) => getComputedStyle(e).boxShadow !== 'none').length)
      check(`[${theme}] ${screen}${view ? `/${view}` : ''}: no shadow`, shadows === 0, shadows)
      const selects = await page.$$eval('.bf select', (els) => els.map((e) => e.dataset.testid))
      check(`[${theme}] ${screen}${view ? `/${view}` : ''}: no select but the lookup's own fields (no generation or game select)`, selects.every((t) => ['lookup-facility', 'lookup-format', 'lookup-level', 'lookup-symbols'].includes(t)), selects.join(','))
    }
    colours[theme] = await page.evaluate(() => {
      const probe = (v) => {
        const el = document.createElement('span')
        el.style.color = `var(${v})`
        document.querySelector('.bf').appendChild(el)
        const c = getComputedStyle(el).color
        el.remove()
        return c
      }
      return { text: getComputedStyle(document.querySelector('.bf')).color, token: probe('--color-text-default'), muted: getComputedStyle(document.querySelector('.bf-cap')).color, mutedToken: probe('--color-text-muted') }
    })
    check(`[${theme}] text and muted text are the theme's tokens`, colours[theme].text === colours[theme].token && colours[theme].muted === colours[theme].mutedToken, JSON.stringify(colours[theme]))
    await openEntry(page, 'frontier-facilities')
    await ready(page, 'facilities')
    const h = await page.$eval('.bf-page', (el) => el.scrollHeight)
    await page.setViewportSize({ width: 1440, height: Math.min(h + 200, 12000) })
    await page.waitForTimeout(300)
    await page.screenshot({ path: shot(`facilities-${theme}`) })
    await page.setViewportSize({ width: 1440, height: 1000 })
    if (theme === 'dark') {
      for (const [id, screen, view] of [['frontier-brains', 'brains'], ['frontier-sets', 'sets', 'sets'], ['frontier-sets', 'sets', 'lookup']]) {
        await openEntry(page, id)
        await ready(page, screen)
        if (view) await page.click(`[data-testid="frontier-view-${view}"]`)
        await page.waitForTimeout(500)
        await page.screenshot({ path: shot(`${view ?? screen}-dark`) })
      }
    }
  }
  check('the text colour changes with the theme (dark is not the light page)', colours.light.text !== colours.dark.text, `${colours.light.text} / ${colours.dark.text}`)
  await setTheme('light')

  // ================================================================ 9. NARROW
  hr('9. NARROW (390 px): nothing clips (phone layout stays parked)')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [id, screen, view] of [['frontier-facilities', 'facilities'], ['frontier-brains', 'brains'], ['frontier-sets', 'sets', 'sets'], ['frontier-sets', 'sets', 'trainers'], ['frontier-sets', 'sets', 'lookup']]) {
    await page.evaluate(() => window.scrollTo(0, 0))
    const reach = await page.$(`[data-testid="frontier-${screen}"]`)
    if (!reach) {
      // The phone shell opens the tab as a sheet: go through it.
      await page.click(TRIGGER)
      await page.click(ENTRY(id)).catch(() => {})
    } else {
      await page.click(TRIGGER).catch(() => {})
      await page.click(ENTRY(id)).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await ready(page, screen)
    if (view) await page.click(`[data-testid="frontier-view-${view}"]`)
    await page.waitForTimeout(200)
    const fit = await page.evaluate(() => {
      const sc = document.querySelector('[data-testid="frontier-scroll-area"]').getBoundingClientRect()
      const over = []
      for (const el of document.querySelectorAll('.bf-page *')) {
        if (el.closest('.bf-tw') && !el.matches('.bf-tw')) continue // a wide table scrolls inside its wrapper
        const r = el.getBoundingClientRect()
        if (r.width && r.right > sc.right + 1) over.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40))
      }
      const bar = document.querySelector('[data-testid="app-nav"]').getBoundingClientRect()
      const tabs = new Set([...document.querySelectorAll('.nav-trigger')].map((t) => Math.round(t.getBoundingClientRect().top)))
      return { page: document.documentElement.scrollWidth <= innerWidth, over: over.slice(0, 5), n: over.length, aboveBar: sc.bottom <= bar.top + 1, tabRows: tabs.size }
    })
    check(`390 px ${screen}${view ? `/${view}` : ''}: no region runs past the scroll area`, fit.page && fit.n === 0, JSON.stringify(fit))
    check(`390 px ${screen}${view ? `/${view}` : ''}: the four tabs stay one row and the scroller ends above them`, fit.aboveBar && fit.tabRows === 1, JSON.stringify(fit))
    if (screen === 'facilities' || view === 'lookup') await page.screenshot({ path: shot(`narrow-${view ?? screen}`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  // ================================================================ 10. BACK TO GEN 4
  hr('10. BACK TO ANOTHER GENERATION: the notice again, nothing new fetched')
  // Empty the loader's in-memory cache first, or a screen that ignored the
  // generation would still fetch nothing and this would prove nothing.
  const reset = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/battle-frontier/data/index.ts')
    const had = m.peekFrontierData(3) != null
    m.__resetFrontierCache()
    return { had, now: m.peekFrontierData(3) != null }
  })
  check('the app’s loader cache (it held the data) is emptied first', reset.had && !reset.now, JSON.stringify(reset))
  const fetchedBefore = frontierRequests.length
  await selectGeneration(page, 4)
  for (const [id, screen] of [['frontier-facilities', 'facilities'], ['frontier-brains', 'brains'], ['frontier-sets', 'sets']]) {
    await openEntry(page, id)
    const st = await page.$eval(`[data-testid="frontier-${screen}"]`, (r) => r.dataset.status)
    check(`[gen 4 again] ${screen}: the notice`, st === 'other-generation', st)
  }
  check('no request after leaving Gen 3', frontierRequests.length === fetchedBefore, `${fetchedBefore} -> ${frontierRequests.length}`)

  // ================================================================ 11. UNTOUCHED
  hr('11. FROZEN: the loader and the Trainer Dex are untouched; no fifth selector')
  let base = 'main'
  try {
    execFileSync('git', ['rev-parse', '--verify', 'main'], { cwd: ROOT, stdio: 'ignore' })
  } catch {
    base = 'origin/main'
  }
  const fork = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const changed = execFileSync('git', ['diff', '--name-only', fork], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  const frozen = changed.filter((f) => f.startsWith('src/modules/battle-frontier/data/') || /^src\/modules\/dex\/(Trainerdex|trainerdex|trainerEntries)/.test(f) || f.startsWith('scripts/trainers/') || f === 'src/data/trainers.ts')
  check(`git diff from where the branch left ${base}: no change to the frozen loader or the Trainer Dex`, frozen.length === 0, frozen.join(', '))
  const moduleFiles = readdirSync(new URL('../src/modules/battle-frontier/', import.meta.url)).filter((f) => /\.(tsx?|css)$/.test(f))
  const moduleSrc = moduleFiles.map((f) => read(`src/modules/battle-frontier/${f}`)).join('\n')
  check(
    `no generation or game selector of its own in any of the module's ${moduleFiles.length} files (no fifth exception)`,
    moduleFiles.length >= 10 && !/setGeneration|gen-select|useGameInGeneration|GameRow|VersionGroupSelector|setVersionGroup/.test(moduleSrc),
  )

  hr('CONSOLE')
  const appErrors = consoleErrors.filter((e) => !/raw\.githubusercontent|github\.com|objects\.githubusercontent|Failed to load resource/.test(e))
  check('no console errors from the app', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
} finally {
  await browser?.close()
  await dev.stop()
}

hr('SUMMARY')
log(`  ${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`  FAILED: ${failures.length}`)
  for (const f of failures) log(`    - ${f}`)
  process.exit(1)
}
