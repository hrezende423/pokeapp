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
import { importTs } from './lib/tsModule.mjs'

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

// ------------------------------------------------------------------ 0. browser-free (feature/frontier-speed)

hr('0. TRAINER HILL & TOWER TIMES (tracker/speed.ts, in Node): parseTime, formatTime, bestOf')
{
  const S = await importTs('src/modules/battle-frontier/tracker/speed.ts')
  const cs = (t) => S.parseTime(t).cs ?? null
  check('"12:03.45" -> 72,345 cs; "2:03.45" (m:ss.cs) -> 12,345 cs', cs('12:03.45') === 72345 && cs('2:03.45') === 12345, JSON.stringify([S.parseTime('12:03.45'), S.parseTime('2:03.45')]))
  check('"59:59.98" (the timer cap, 215,999 frames) -> 359,998 cs; "00:00.00" -> 0', cs('59:59.98') === 359998 && cs('00:00.00') === 0)
  const rejected = ['60:00.00', '59:59.99', '12:60.00', '12:03.4', '12:03', '123:03.45', '12.03.45', '', 'abc', '-1:00.00']
  const accepted = rejected.filter((t) => !('error' in S.parseTime(t)))
  check('rejected with a message: 60:00.00, 59:59.99, 12:60.00, 12:03.4, 12:03, 123:03.45, 12.03.45, empty, abc, -1:00.00', accepted.length === 0 && typeof S.parseTime('60:00.00').error === 'string' && S.parseTime('60:00.00').error.length > 0, accepted.join(','))
  check('formatTime: 72,345 -> "12:03.45"; 359,998 -> "59:59.98"; 5,000 -> "00:50.00"; 0 -> "00:00.00"', S.formatTime(72345) === '12:03.45' && S.formatTime(359998) === '59:59.98' && S.formatTime(5000) === '00:50.00' && S.formatTime(0) === '00:00.00')
  const at = '2026-11-22'
  const tries = [
    { id: 'a', at, floors: 4, timeCs: 78000 }, // cleared, 13:00.00
    { id: 'b', at, floors: 4, timeCs: 77999 }, // cleared, 12:59.99
    { id: 'c', at, floors: 2, timeCs: 60000 }, // not cleared, 10:00.00
  ]
  const best = S.bestOf(tries, 4)
  check('best of [cleared 13:00.00, cleared 12:59.99, not cleared 10:00.00] = 12:59.99', best?.kind === 'clear' && S.formatTime(best.attempt.timeCs) === '12:59.99' && best.attempt.id === 'b', JSON.stringify(best))
  check('no full clear -> "furthest": the most floors any attempt cleared (3)', JSON.stringify(S.bestOf([{ id: 'x', at, floors: 1, timeCs: 1 }, { id: 'y', at, floors: 3, timeCs: 2 }], 4)) === '{"kind":"furthest","floors":3}')
  check('no attempt -> null', S.bestOf([], 8) === null)
  check('the current run is the latest attempt by date (the last logged on a tie)', S.latestOf([{ id: 'p', at: '2026-11-21', floors: 4, timeCs: 1 }, { id: 'q', at: '2026-11-22', floors: 1, timeCs: 2 }, { id: 'r', at: '2026-11-22', floors: 2, timeCs: 3 }, { id: 's', at: '2026-11-20', floors: 3, timeCs: 4 }]).id === 'r')
}

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
  hr('1. THE TAB: between Team Building and Tools, opens Facilities, five entries')
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
  check('the dropdown lists Facilities, Brains, Challenge Tracker, Sets & Trainers, Trainer Hill & Tower', JSON.stringify(entries.map((e) => e.label)) === JSON.stringify(['Facilities', 'Brains', 'Challenge Tracker', 'Sets & Trainers', 'Trainer Hill & Tower']), entries.map((e) => e.label).join(','))
  const cur = entries.find((e) => e.current === 'page')
  const others = entries.filter((e) => e.current !== 'page')
  check('the current entry (Facilities) is marked by weight', cur?.label === 'Facilities' && Number(cur.weight) >= 600 && others.every((e) => Number(e.weight) < 600), JSON.stringify(cur))
  check('... and not by colour: it is the same colour as the others', others.every((e) => e.color === cur?.color), `${cur?.color} vs ${others.map((e) => e.color).join(',')}`)
  const navAccent = await accentUses(page)
  check('with the dropdown open on Facilities: accent within 2 uses', navAccent.length <= 2, navAccent.join(' | '))
  await page.screenshot({ path: shot('nav'), clip: { x: 0, y: 0, width: 1440, height: 320 } })
  await page.click(ENTRY('frontier-tracker'))
  await page.mouse.move(1300, 900)
  // Graduated on feature/frontier-tracker: its own screen (verify:frontier-tracker).
  check('Challenge Tracker opens its own screen (no stub)', (await page.waitForSelector('[data-testid="frontier-tracker"]', { timeout: 15000 }).catch(() => null)) != null && (await page.$('[data-testid="stub-frontier-tracker"]')) == null)

  // ================================================================ 2. OTHER GENERATION
  hr('2. ANY OTHER GENERATION: the notice only, and no Frontier data fetched')
  for (const gen of ['2', 'all']) {
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
      const want = gen === 'all' ? 'Pick a generation in the account menu. This tab covers Emerald, FireRed and LeafGreen, Platinum, and HeartGold and SoulSilver.' : 'No Battle Frontier in Gen 2. This tab covers Emerald, FireRed and LeafGreen, Platinum, and HeartGold and SoulSilver.'
      check(`[gen ${gen}] ${screen}: only the head and the notice`, s.status === 'other-generation' && s.notice === want && s.body.length === 2 && !s.scope, JSON.stringify(s))
      const areas = await page.$eval(`[data-testid="frontier-${screen}"] .bf-page`, (p) => getComputedStyle(p).gridTemplateAreas)
      check(`[gen ${gen}] ${screen}: no empty game track above the head`, !/game/.test(areas), areas)
    }
  }
  check('no Frontier data was requested under Gen 2 or All', frontierRequests.length === 0, frontierRequests.join(', '))
  await page.screenshot({ path: shot('notice') })

  // ================================================================ 2b. OTHER GAMES (feature/frontier-facility-reference)
  hr('2b. OTHER GAMES: Trainer Tower, the Gen 4 Frontier; Ruby/Sapphire and Diamond/Pearl are not offered')
  const facState = () =>
    page.$eval('[data-testid="frontier-facilities"]', (root) => ({
      status: root.dataset.status,
      game: root.dataset.game ?? null,
      notice: root.querySelector('[data-testid="frontier-notice"]')?.textContent ?? null,
      scope: root.querySelector('.bf-scope')?.textContent ?? null,
      row: [...root.querySelectorAll('[data-testid="frontier-game-row"] button')].map((b) => b.dataset.testid.replace('frontier-game-row-', '')),
      ids: [...root.querySelectorAll('[data-layout="facility"]')].map((e) => e.dataset.facility),
    }))
  const pickGame = async (vg) => {
    await page.click(`[data-testid="frontier-game-row-${vg}"]`)
    await page.waitForFunction((vg) => document.querySelector('.bf[data-game]')?.dataset.game === vg, vg)
  }
  const kvOf = (facility) =>
    page.$$eval(`[data-facility="${facility}"] .bf-kv > div`, (rows) => Object.fromEntries(rows.map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent])))
  await selectGeneration(page, 4)
  await openEntry(page, 'frontier-facilities')
  await ready(page, 'facilities')
  let fs4 = await facState()
  check('Gen 4: the game row offers Platinum and HeartGold/SoulSilver only (no Diamond/Pearl), and defaults to HeartGold/SoulSilver', JSON.stringify(fs4.row) === JSON.stringify(['platinum', 'heartgold-soulsilver']) && fs4.game === 'heartgold-soulsilver', JSON.stringify(fs4))
  const fallback = await page.evaluate(async () => {
    const g = await import('/pokeapp/src/modules/battle-frontier/reference/games.ts')
    const v = await import('/pokeapp/src/modules/version-group/games.ts')
    return {
      offered: ['ruby-sapphire', 'diamond-pearl'].filter(g.isFrontierTabGame),
      gen3: v.defaultGameOfGeneration(3, g.isFrontierTabGame)?.name,
      gen4: v.defaultGameOfGeneration(4, g.isFrontierTabGame)?.name,
      exportsNotice: 'NO_FRONTIER' in g,
    }
  })
  check('Ruby/Sapphire and Diamond/Pearl are never offered; their generation falls back to Emerald / HeartGold-SoulSilver; no dead "no Frontier" notice', fallback.offered.length === 0 && fallback.gen3 === 'emerald' && fallback.gen4 === 'heartgold-soulsilver' && !fallback.exportsNotice, JSON.stringify(fallback))
  check('HGSS: the five Gen 4 facilities, in order', JSON.stringify(fs4.ids) === JSON.stringify(['tower', 'factory', 'hall', 'castle', 'arcade']), fs4.ids.join(','))
  check('HGSS: the scope tag names the game', fs4.scope === 'HeartGold and SoulSilver · Gen 4', fs4.scope)
  const flag = await page.$eval('[data-testid="frontier-hgss-flag"]', (e) => e.textContent).catch(() => null)
  check('HGSS: the "reuses Platinum, unconfirmed" flag is shown', /rules are Platinum’s/.test(flag ?? '') && /unconfirmed/.test(flag ?? ''), flag)
  const hgssBanned = await page.$eval('[data-layout="frontier-banned"]', (e) => ({ head: e.querySelector('.bf-sec').textContent, links: e.querySelectorAll('.bf-link').length, text: e.textContent, names: [...e.querySelectorAll('.bf-link')].map((l) => l.textContent) }))
  check('Gen 4 banned species are named in Gen 4 (Dialga, Arceus), never "Species #"', hgssBanned.names.includes('Dialga') && hgssBanned.names.includes('Arceus') && !hgssBanned.names.some((n) => /#/.test(n)), hgssBanned.names.join(', '))
  check('HGSS: 18 banned species plus Spiky-eared Pichu (pokeheartgold IsPokemonBannedFromBattleFrontier)', hgssBanned.head === 'Banned species (19)' && hgssBanned.links === 18 && hgssBanned.text.includes('Spiky-eared Pichu'), JSON.stringify(hgssBanned))
  const tower4 = await kvOf('tower')
  const hall4 = await kvOf('hall')
  // Spot checks against pokeplatinum @ 485c400 (reference/gen4.ts header).
  check('Tower: Palmer at battles 21 and 49, Single only (battle_tower_trainers.c)', tower4['Silver Print'] === 'battle 21' && tower4['Gold Print'] === 'battle 49' && tower4.Brain === 'Tower Tycoon Palmer · Single Battle streaks only', JSON.stringify(tower4))
  check('Tower: party 3 / 4 / 2 / 3 by mode (BattleTower_GetPartySizeForChallengeMode)', tower4.Party === 'Single 3 · Double 4 · Multi 2 · Wi-Fi 3', tower4.Party)
  check('Tower: BP 3,3,4,4,5,5,7 for Single, Double and NPC Multi; 20 for Palmer’s set (BattleTower_GiveBattlePointsReward)', tower4['BP · Single, Double, Multi'] === 'Sets 1–2 → 3 · 3–4 → 4 · 5–6 → 5 · 7 on → 7; the set that beats Palmer pays 20 instead (Single only)', tower4['BP · Single, Double, Multi'])
  const factory4 = await kvOf('factory')
  const arcade4 = await kvOf('arcade')
  check('Factory: 5,5,5,5,7,7,8,9 (BattleFactory_GetEarnedBP), Thorton’s sets 20; Double party 3', factory4['BP · Single, Double'] === 'Sets 1–4 → 5 · 5–6 → 7 · 7 → 8 · 8 on → 9; sets 3 and 7 (Thorton) pay 20 instead (Single only)' && factory4.Party.startsWith('Single, Double: 3'), JSON.stringify(factory4))
  check('Hall: Single/Double 18-entry table ending 12; link Multi always 12 (BattleHall_GetEarnedBP)', /^Sets 1–3 → 1 · 4–6 → 2 · 7–9 → 3 · 10–11 → 4 · 12–13 → 6 · 14–15 → 8 · 16–17 → 10 · 18 on → 12; sets 5 and 17/.test(hall4['BP · Single, Double']) && hall4['BP · Multi'] === 'Always 12', JSON.stringify(hall4))
  check('Arcade: Multi 7,8,9,10,13,14,16,17 (BattleArcade_GetEarnedBP)', arcade4['BP · Multi'] === 'Sets 1 → 7 · 2 → 8 · 3 → 9 · 4 → 10 · 5 → 13 · 6 → 14 · 7 → 16 · 8 on → 17', arcade4['BP · Multi'])
  check('Hall: 10 battles per set, Argenta at 50 and 170 (HALL_BATTLES_PER_ROUND, HALL_STREAK_*)', hall4.Challenge.startsWith('10 battles per set') && hall4['Silver Print'] === 'battle 50' && hall4['Gold Print'] === 'battle 170', JSON.stringify(hall4))
  const hallRule = await page.$eval('[data-facility="hall"] .bf-rule', (e) => e.textContent)
  check('Hall: 17 type panels in Gen 4 (no Fairy): 17 × rank 10 = 170', /17 panels/.test(hallRule) && !/18/.test(hallRule), hallRule)
  const gap = await page.$eval('.bf-page', (p) => getComputedStyle(p).gridTemplateAreas)
  check('the page grid has a game track only when the row is shown', /game/.test(gap), gap)
  const untraced = await page.$$eval('[data-layout="facility"] dd', (dds) => dds.filter((d) => /not traced/i.test(d.textContent)).length)
  check('every Gen 4 BP table is traced: no "not traced" row left', untraced === 0, untraced)
  check('Gen 4: no Emerald Frontier data requested', frontierRequests.length === 0, frontierRequests.join(', '))
  await page.screenshot({ path: shot('s1-hgss-light'), fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: shot('s1-hgss-dark'), fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  await pickGame('platinum')
  fs4 = await facState()
  const ptBanned = await page.$eval('[data-layout="frontier-banned"] .bf-sec', (e) => e.textContent)
  check('Platinum: no HGSS flag, 18 banned species', (await page.$('[data-testid="frontier-hgss-flag"]')) == null && ptBanned === 'Banned species (18)' && fs4.scope === 'Platinum · Gen 4', `${ptBanned} ${fs4.scope}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const fit4 = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="frontier-scroll-area"]').getBoundingClientRect()
    return [...document.querySelectorAll('[data-layout="facility"], [data-layout="frontier-shared"]')].filter((e) => e.getBoundingClientRect().right > area.right + 1).length
  })
  check('390 px Platinum: no facility section runs past the scroll area', fit4 === 0, fit4)
  await page.screenshot({ path: shot('s1-platinum-narrow') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await pickGame('platinum')
  for (const [id, screen, title] of [['frontier-brains', 'brains', 'Brains'], ['frontier-sets', 'sets', 'Sets & Trainers']]) {
    await openEntry(page, id)
    await page.waitForSelector(`[data-testid="frontier-${screen}"][data-game="platinum"]`)
    const st = await page.$eval(`[data-testid="frontier-${screen}"]`, (r) => ({ status: r.dataset.status, notice: r.querySelector('[data-testid="frontier-notice"]')?.textContent }))
    if (screen === 'sets') check(`Platinum ${screen}: a notice, not a blank`, st.status === 'not-in-game' && st.notice === `${title} covers Emerald only.`, JSON.stringify(st))
    else check(`Platinum ${screen}: a screen or a notice, never a blank`, st.status === 'ready' || (st.status === 'not-in-game' && !!st.notice), JSON.stringify(st))
  }
  // ================================================================ 2c. GEN 4 BRAINS (feature/frontier-brains-gen4)
  hr('2c. GEN 4 BRAINS: Palmer, Thorton, Argenta, Darach, Dahlia, with their prints and the disassembly teams')
  await selectGeneration(page, 4)
  await openEntry(page, 'frontier-brains')
  await page.waitForSelector('[data-testid="frontier-brains"][data-game="platinum"][data-status="ready"]')
  await page.waitForSelector('[data-layout="brain-list"][data-game="platinum"]', { timeout: 60000 })
  const b4 = await page.$$eval('[data-layout="brain"]', (els) =>
    els.map((e) => ({
      id: e.dataset.facility,
      name: e.querySelector('.bf-name').textContent,
      when: e.querySelector('[data-layout="brain-appearances"]').textContent,
      prints: [...e.querySelectorAll('[data-layout="brain-print"]')].map((p) => [...p.querySelectorAll('[data-layout="brain-team"]')].map((t) => [...t.querySelectorAll('tbody tr')].map((r) => Number(r.dataset.speciesId)))),
      generated: e.querySelector('[data-layout="brain-generated"]')?.textContent ?? null,
    })),
  )
  const byId = Object.fromEntries(b4.map((b) => [b.id, b]))
  const b4Names = await page.$$eval('[data-layout="brain"][data-facility="tower"] tbody tr .bf-link', (els) => els.map((e) => e.textContent))
  check('Gen 4 Brain Pokémon are named in Gen 4 (Rhyperior, Heatran), never "Species #"', b4Names.includes('Rhyperior') && b4Names.includes('Heatran') && !b4Names.some((n) => /#/.test(n)), b4Names.join(', '))
  check('Platinum: the five Brains in facility order', JSON.stringify(b4.map((b) => b.id)) === JSON.stringify(['tower', 'factory', 'hall', 'castle', 'arcade']), b4.map((b) => b.name).join(', '))
  check('Palmer: Silver Print at battle 21, Gold at 49, Single only', byId.tower?.when === 'Silver Print at battle 21. Gold Print at battle 49. Single Battle streaks only.', byId.tower?.when)
  check('Argenta: Silver Print at 50, Gold at 170 (HALL_STREAK_*)', byId.hall?.when === 'Silver Print at battle 50. Gold Print at battle 170.', byId.hall?.when)
  // pokeplatinum frontier trainer data: T306 (Silver) and T307 (Gold), in the data's set order.
  check('Palmer’s teams: Silver Rhyperior, Milotic, Dragonite; Gold Heatran, Cresselia, Regigigas', JSON.stringify(byId.tower?.prints) === JSON.stringify([[[464, 350, 149]], [[485, 488, 486]]]), JSON.stringify(byId.tower?.prints))
  check('Darach: six sets per print, two per Pokémon (Silver Houndoom, Empoleon, Staraptor; Gold Entei, Empoleon, Gallade)', JSON.stringify(byId.castle?.prints.map((p) => p.map((t) => [...t].sort((a, b) => a - b)))) === JSON.stringify([[[229, 229, 395, 395, 398, 398]], [[244, 244, 395, 395, 475, 475]]]), JSON.stringify(byId.castle?.prints))
  check('Dahlia’s teams: Silver Medicham, Ludicolo, Dusknoir; Gold Blaziken, Togekiss, Zapdos', JSON.stringify(byId.arcade?.prints) === JSON.stringify([[[308, 272, 477]], [[257, 468, 145]]]), JSON.stringify(byId.arcade?.prints))
  check('Thorton and Argenta: no fixed team, said so', /no fixed team/.test(byId.factory?.generated ?? '') && /no fixed team/.test(byId.hall?.generated ?? '') && byId.factory.prints.length === 0 && byId.hall.prints.length === 0, JSON.stringify([byId.factory?.generated, byId.hall?.generated]))
  // The disassembly's sets and the Trainer Dex's Bulbapedia teams agree, species and moves, team by team.
  const agree = await page.evaluate(async () => {
    const { gen4BrainTeams } = await import('/pokeapp/src/modules/battle-frontier/reference/gen4Brains.ts')
    const p = await (await fetch('/pokeapp/data/trainers/platinum.json')).json()
    const f = p.facilities.find((x) => x.id === 'battle-frontier')
    const sig = (team) => team.map((m) => `${m.species_id}:${[...m.moves].sort((a, b) => a - b).join('.')}`).sort().join('|')
    const wiki = (key) => sig(f.trainers.find((t) => t.key === key).party)
    // Every Bulbapedia team of a print, pooled, is exactly that print's disassembly sets.
    const wikiPool = (keys) => sig(keys.flatMap((key) => f.trainers.find((t) => t.key === key).party))
    const out = []
    for (const [id, silver, gold] of [
      ['tower', ['brain-palmer-1'], ['brain-palmer-2']],
      ['arcade', ['brain-dahlia-1'], ['brain-dahlia-2']],
      ['castle', ['brain-darach-1-1', 'brain-darach-1-2'], ['brain-darach-2-1', 'brain-darach-2-2']],
    ]) {
      const t = gen4BrainTeams(f, id)
      out.push([`${id} silver`, sig(t.silver) === wikiPool(silver)], [`${id} gold`, sig(t.gold) === wikiPool(gold)])
    }
    void wiki
    return out
  })
  check('every print’s disassembly sets are exactly the Trainer Dex’s Bulbapedia team(s) for it (species and moves)', agree.length === 6 && agree.every(([, ok]) => ok), JSON.stringify(agree))
  await page.screenshot({ path: shot('s5-platinum-brains-light') })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: shot('s5-platinum-brains-dark') })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  await pickGame('heartgold-soulsilver')
  await page.waitForSelector('[data-layout="brain-list"][data-game="heartgold-soulsilver"]', { timeout: 60000 })
  const hgFlag = await page.$eval('[data-testid="frontier-brains"] [data-testid="frontier-hgss-flag"]', (e) => e.textContent).catch(() => null)
  check('HGSS Brains: the same five, flagged as Platinum’s', (await page.$$('[data-layout="brain"]')).length === 5 && /Platinum’s/.test(hgFlag ?? ''), hgFlag)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const fit5 = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="frontier-scroll-area"]').getBoundingClientRect()
    return [...document.querySelectorAll('[data-layout="brain"]')].filter((e) => e.getBoundingClientRect().right > area.right + 1).length
  })
  check('390 px HGSS Brains: no section runs past the scroll area', fit5 === 0, fit5)
  await page.screenshot({ path: shot('s5-hgss-brains-narrow') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await pickGame('platinum')

  await selectGeneration(page, 3)
  await openEntry(page, 'frontier-facilities')
  await ready(page, 'facilities')
  let fs3 = await facState()
  check('Gen 3: the row offers Emerald and FireRed/LeafGreen only (no Ruby/Sapphire, no Colosseum/XD) and defaults to Emerald', JSON.stringify(fs3.row) === JSON.stringify(['emerald', 'firered-leafgreen']) && fs3.game === 'emerald', JSON.stringify(fs3))
  // Empty the Frontier loader's cache: a FireRed/LeafGreen screen that called it would fetch again.
  const reset2b = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/battle-frontier/data/index.ts')
    const had = m.peekFrontierData(3) != null
    m.__resetFrontierCache()
    return { had, now: m.peekFrontierData(3) != null }
  })
  check('the app’s Frontier loader cache (it held Emerald’s data) is emptied before the other Gen 3 games', reset2b.had && !reset2b.now, JSON.stringify(reset2b))
  const requestsBeforeOtherGames = frontierRequests.filter((u) => u.includes('frontier/emerald')).length
  await pickGame('firered-leafgreen')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-facility="trainer-tower"] .bf-kv > div')].some((r) => r.querySelector('dt').textContent === 'Modes' && /floors/.test(r.querySelector('dd').textContent)))
  fs3 = await facState()
  const tt = await kvOf('trainer-tower')
  check('FireRed/LeafGreen: the Trainer Tower section only', JSON.stringify(fs3.ids) === JSON.stringify(['trainer-tower']) && fs3.scope === 'FireRed and LeafGreen · Gen 3', JSON.stringify(fs3))
  check('Trainer Tower modes from the Trainer Dex: 8 floors each, 63 trainers (Single 8, Double 16, Knockout 24, Mixed 15)', tt.Modes === 'Single (8 floors, 8 trainers) · Double (8 floors, 16 trainers) · Knockout (8 floors, 24 trainers) · Mixed (8 floors, 15 trainers)', tt.Modes)
  check('Trainer Tower prizes (trainer_tower_sets.c): Up-Grade, Dragon Scale, Metal Coat, King’s Rock; time is a record only', tt.Single === 'Up-Grade' && tt.Double === 'Dragon Scale' && tt.Knockout === 'Metal Coat' && tt.Mixed === 'King’s Rock' && /record only/.test(tt.Prize), JSON.stringify(tt))
  await page.screenshot({ path: shot('s1-frlg-light'), fullPage: true })
  for (const [id, screen] of [['frontier-brains', 'brains'], ['frontier-sets', 'sets']]) {
    await openEntry(page, id)
    await page.waitForSelector(`[data-testid="frontier-${screen}"][data-game="firered-leafgreen"]`)
    const st = await page.$eval(`[data-testid="frontier-${screen}"]`, (r) => ({ status: r.dataset.status, notice: r.querySelector('[data-testid="frontier-notice"]')?.textContent }))
    check(`FireRed/LeafGreen ${screen}: "no Battle Frontier" notice pointing at the Trainer Tower`, st.status === 'not-in-game' && /no Battle Frontier/.test(st.notice) && /Trainer Tower/.test(st.notice), JSON.stringify(st))
  }
  check('FireRed/LeafGreen: no Emerald Frontier data requested', frontierRequests.filter((u) => u.includes('frontier/emerald')).length === requestsBeforeOtherGames, frontierRequests.join(', '))
  await openEntry(page, 'frontier-facilities')
  await pickGame('emerald')

  // ================================================================ 2c. TRAINER HILL & TOWER (feature/frontier-speed)
  hr('2c. TRAINER HILL & TOWER: every mode\'s floors and fixed teams, the record, the notice elsewhere')
  const SPEED = '[data-testid="frontier-speed"]'
  const speedHead = () =>
    page.$eval(SPEED, (root) => ({
      status: root.dataset.status,
      game: root.dataset.game ?? null,
      title: root.querySelector('.bf-title')?.textContent ?? null,
      scope: root.querySelector('.bf-scope')?.textContent ?? null,
      notice: root.querySelector('[data-testid="frontier-notice"]')?.textContent ?? null,
      facility: root.querySelector('[data-layout="facility"]')?.dataset.facility ?? null,
    }))
  const speedTabs = () => page.$$eval('[data-layout="speed-views"] [role="tab"]', (ts) => ts.map((t) => t.textContent))
  const speedMode = () =>
    page.$eval('[data-layout="speed-mode"]', (m) => ({
      mode: m.dataset.mode,
      floors: [...m.querySelectorAll('[data-layout="speed-floor"]')].map((f) => ({
        floor: Number(f.dataset.floor),
        trainers: [...f.querySelectorAll('[data-layout="speed-trainer"]')].map((t) => ({
          key: t.dataset.trainerKey,
          name: t.querySelector('[data-testid="speed-trainer-name"]')?.textContent,
          species: [...t.querySelectorAll('tbody tr')].map((tr) => Number(tr.dataset.speciesId)),
          sprites: [...t.querySelectorAll('tbody tr img.bf-sprite')].map((i) => i.getAttribute('src')),
          dex: t.querySelector('[data-testid="speed-trainer-dex"]') != null,
        })),
      })),
    }))
  /**
   * Every <img> on the page, loaded: lazy ones are switched to eager and awaited.
   * Static only (owner, 2026-11-23): no animated asset (the sprites repo's WebP
   * releases, a GIF, an "animated" path) may be requested on this page.
   */
  const ANIMATED = /\.(webp|gif)(\?|$)|\/animated\/|pokeapp-sprites\/releases/
  const pageImages = () =>
    page.$eval(SPEED, async (root) => {
      const imgs = [...root.querySelectorAll('img')]
      await Promise.all(
        imgs.map((img) => {
          img.loading = 'eager'
          return img.complete && img.naturalWidth > 0
            ? null
            : new Promise((done) => {
                img.addEventListener('load', done, { once: true })
                img.addEventListener('error', done, { once: true })
                setTimeout(done, 20000)
              })
        }),
      )
      return imgs.map((img) => ({ src: img.currentSrc || img.src, w: img.naturalWidth }))
    })
  const walkModes = async () => {
    const out = {}
    for (const label of await speedTabs()) {
      await page.click(`[data-testid="speed-mode-${label.toLowerCase()}"]`)
      await page.waitForFunction((l) => document.querySelector('[data-layout="speed-mode"]')?.dataset.mode === l, label)
      out[label] = await speedMode()
      out[label].images = await pageImages()
    }
    return out
  }
  const imageCheck = (label, modes) => {
    const imgs = Object.values(modes).flatMap((m) => m.images)
    const broken = [...new Set(imgs.filter((i) => !(i.w > 0)).map((i) => i.src))]
    const animated = [...new Set(imgs.filter((i) => ANIMATED.test(i.src)).map((i) => i.src))]
    check(`${label}: every <img> on the page loads (naturalWidth > 0), every mode and floor`, imgs.length > 0 && broken.length === 0, `${imgs.length} images, ${broken.length} broken: ${broken.slice(0, 3).join(' ')}`)
    check(`${label}: no animated sprite requested`, animated.length === 0, animated.slice(0, 3).join(' '))
    return imgs
  }
  const bundleFacility = (vg, id) => JSON.parse(read(`public/data/trainers/${vg}.json`)).facilities.find((f) => f.id === id)
  const allTrainers = (modes) => Object.values(modes).flatMap((m) => m.floors.flatMap((f) => f.trainers))
  /** Literal parties from the bundle (pokeemerald / pokefirered via the Trainer Dex build), checked twice: literal and live bundle. */
  const spotCheck = (label, modes, vg, id, spots) => {
    const fac = bundleFacility(vg, id)
    const shown = new Map(allTrainers(modes).map((t) => [t.key, t]))
    for (const [key, species] of spots) {
      const inBundle = fac.trainers.find((t) => t.key === key)?.party.map((p) => p.species_id)
      check(`${label} ${key}: team species ${species.join(',')} (the bundle's)`, JSON.stringify(shown.get(key)?.species) === JSON.stringify(species) && JSON.stringify(inBundle) === JSON.stringify(species), JSON.stringify(shown.get(key)?.species))
    }
    const wrong = fac.trainers.filter((t) => JSON.stringify(shown.get(t.key)?.species) !== JSON.stringify(t.party.map((p) => p.species_id))).map((t) => t.key)
    check(`${label}: every trainer's team is the bundle's, in order`, wrong.length === 0, wrong.slice(0, 5).join(','))
  }

  await selectGeneration(page, 3)
  await openEntry(page, 'frontier-speed')
  await pickGame('emerald')
  await page.waitForSelector('[data-layout="speed-floor"]', { timeout: 60000 })
  let sh = await speedHead()
  check('Emerald: "Trainer Hill & Tower", Emerald · Gen 3, the Trainer Hill rules section', sh.status === 'ready' && sh.title === 'Trainer Hill & Tower' && sh.scope === 'Emerald · Gen 3' && sh.facility === 'trainer-hill' && sh.notice == null, JSON.stringify(sh))
  const hillModes = await walkModes()
  check('Emerald: 4 Hill modes, Normal / Variety / Unique / Expert', JSON.stringify(Object.keys(hillModes)) === '["Normal","Variety","Unique","Expert"]', Object.keys(hillModes).join(','))
  const hillShape = Object.values(hillModes).map((m) => m.floors.map((f) => `${f.floor}:${f.trainers.length}`).join(' '))
  check('... each 4 floors × 2 trainers', hillShape.every((s) => s === '1:2 2:2 3:2 4:2'), hillShape.join(' | '))
  const hillAll = allTrainers(hillModes)
  check('... 32 trainers, each with a 6-Pokémon team and a Trainer Dex link', hillAll.length === 32 && hillAll.every((t) => t.species.length === 6 && t.dex), hillAll.filter((t) => t.species.length !== 6 || !t.dex).map((t) => t.key).join(','))
  check('... every team sprite is Emerald\'s', hillAll.every((t) => t.sprites.length === 6 && t.sprites.every((s) => s.includes('/emerald/'))), hillAll.find((t) => !t.sprites.every((s) => s.includes('/emerald/')))?.sprites.join(','))
  imageCheck('Emerald Hill (4 modes × 4 floors)', hillModes)
  check('Hex Maniac Alaina leads Normal floor 1', hillModes.Normal.floors[0].trainers[0].name === 'Hex Maniac Alaina', hillModes.Normal.floors[0].trainers[0].name)
  spotCheck('Hill', hillModes, 'emerald', 'trainer-hill', [
    ['Normal-1-1', [200, 338, 344, 110, 337, 330]],
    ['Unique-2-2', [120, 52, 257, 104, 15, 20]],
    ['Expert-4-2', [373, 94, 130, 94, 356, 200]],
  ])
  const hillAccent = await accentUses(page)
  check('Emerald Hill: accent within 2 uses (the nav tab and the selected mode)', hillAccent.length <= 2, hillAccent.join(' | '))

  // The record: log three Normal attempts, then two bad times.
  await page.click('[data-testid="speed-mode-normal"]')
  const bestText = () => page.$eval('[data-testid="speed-record-normal"] [data-testid="speed-best"]', (e) => e.textContent.replace(/\s+/g, ' ').trim())
  const currentText = () => page.$eval('[data-testid="speed-record-normal"] [data-testid="speed-current"]', (e) => e.textContent.replace(/\s+/g, ' ').trim())
  check('before any attempt: "No attempt yet"', (await bestText()) === 'No attempt yet', await bestText())
  const logAttempt = async (floors, time) => {
    await page.fill('[data-testid="speed-floors"]', floors)
    await page.fill('[data-testid="speed-time"]', time)
    await page.click('[data-testid="speed-log-attempt"]')
    await page.waitForTimeout(150)
  }
  await logAttempt('2', '10:00.00')
  check('one attempt, 2 of 4 floors: best reads "Furthest: floor 2"', (await bestText()) === 'Furthest: floor 2', await bestText())
  await logAttempt('4', '13:00.00')
  await logAttempt('4', '12:59.99')
  await logAttempt('3', '05:00.00')
  const best = await bestText()
  const curr = await currentText()
  check('best of [cleared 13:00.00, cleared 12:59.99, not cleared 10:00.00 and 05:00.00] reads 12:59.99 with its date', /^12:59\.99 · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(best), best)
  check('current run: the last logged, "3 of 4 floors · 05:00.00"', curr.startsWith('3 of 4 floors · 05:00.00'), curr)
  const attempts = () => page.$$eval('[data-testid="speed-attempts"] tbody tr', (trs) => trs.length)
  check('4 attempts listed', (await attempts()) === 4, await attempts())
  await logAttempt('4', '60:00.00')
  const capErr = await page.$eval('[data-testid="speed-error"]', (e) => e.textContent).catch(() => null)
  check('"60:00.00" is refused with a message (the timer stops at 59:59.98), nothing logged', capErr === 'The timer stops at 59:59.98.' && (await attempts()) === 4, capErr)
  await logAttempt('4', '12:3.45')
  const fmtErr = await page.$eval('[data-testid="speed-error"]', (e) => e.textContent).catch(() => null)
  check('"12:3.45" is refused with the format message, nothing logged', /m:ss\.cs or mm:ss\.cs/.test(fmtErr ?? '') && (await attempts()) === 4, fmtErr)
  await logAttempt('5', '12:00.00')
  check('5 floors of 4 is refused', /from 0 to 4/.test((await page.$eval('[data-testid="speed-error"]', (e) => e.textContent).catch(() => '')) ?? '') && (await attempts()) === 4)
  await page.fill('[data-testid="speed-time"]', '')
  const variety = await page.$eval('[data-testid="speed-record-variety"] [data-testid="speed-best"]', (e) => e.textContent.trim())
  check('the other modes are untouched ("No attempt yet")', variety === 'No attempt yet', variety)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pokeapp:frontier-tracker:v1')))
  check('stored in the Challenge Tracker document: games.emerald.hill.Normal, 4 attempts, schemaVersion 2', stored?.schemaVersion === 2 && stored?.games?.emerald?.hill?.Normal?.attempts?.length === 4 && JSON.stringify(stored.games.emerald.hill.Normal.attempts.map((a) => a.timeCs)) === '[60000,78000,77999,30000]', JSON.stringify(stored?.games))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector(TRIGGER, { timeout: 180000 })
  await openEntry(page, 'frontier-speed')
  await page.waitForSelector('[data-testid="speed-record-normal"]', { timeout: 60000 })
  check('after a reload the record holds: best 12:59.99', (await bestText()).startsWith('12:59.99'), await bestText())
  await page.screenshot({ path: shot('s2-emerald-light'), fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: shot('s2-emerald-dark'), fullPage: true })
  const hillAccentDark = await accentUses(page)
  check('[dark] Emerald Hill: accent within 2 uses', hillAccentDark.length <= 2, hillAccentDark.join(' | '))
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const fitSpeed = await page.evaluate(() => {
    const sc = document.querySelector('[data-testid="frontier-scroll-area"]').getBoundingClientRect()
    const over = []
    for (const el of document.querySelectorAll('.bf-page *')) {
      if (el.closest('.bf-tw') && !el.matches('.bf-tw')) continue // a wide table scrolls inside its wrapper
      const r = el.getBoundingClientRect()
      if (r.width && r.right > sc.right + 1) over.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 40))
    }
    return { page: document.documentElement.scrollWidth <= innerWidth, over: over.slice(0, 5), n: over.length }
  })
  check('390 px Hill: nothing runs past the scroll area', fitSpeed.page && fitSpeed.n === 0, JSON.stringify(fitSpeed))
  await page.screenshot({ path: shot('s2-emerald-390-light') })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: shot('s2-emerald-390-dark') })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  await page.setViewportSize({ width: 1440, height: 1000 })

  // The Trainer Dex link opens the Trainer Dex (the page: the engine cannot open a facility entry).
  await page.click('[data-trainer-key="Normal-1-1"] [data-testid="speed-trainer-dex"]')
  check('a trainer\'s "Trainer Dex" link opens the Trainer Dex', (await page.waitForSelector('[data-testid="trainerdex-count"], [data-testid="trainerdex-rows"]', { timeout: 60000 }).catch(() => null)) != null)
  await page.goBack()
  check('back returns to Trainer Hill & Tower', (await page.waitForSelector(SPEED, { timeout: 30000 }).catch(() => null)) != null)

  await pickGame('firered-leafgreen')
  await page.waitForSelector('[data-layout="speed-floor"]', { timeout: 60000 })
  sh = await speedHead()
  check('FireRed/LeafGreen: the Trainer Tower', sh.status === 'ready' && sh.scope === 'FireRed and LeafGreen · Gen 3' && sh.facility === 'trainer-tower', JSON.stringify(sh))
  const towerModes = await walkModes()
  check('FireRed/LeafGreen: 4 Tower modes, Single / Double / Knockout / Mixed', JSON.stringify(Object.keys(towerModes)) === '["Single","Double","Knockout","Mixed"]', Object.keys(towerModes).join(','))
  check('... each 8 floors', Object.values(towerModes).every((m) => JSON.stringify(m.floors.map((f) => f.floor)) === '[1,2,3,4,5,6,7,8]'))
  const perMode = Object.values(towerModes).map((m) => m.floors.reduce((n, f) => n + f.trainers.length, 0))
  check('... 63 trainers: Single 8, Double 16, Knockout 24, Mixed 15', JSON.stringify(perMode) === '[8,16,24,15]', JSON.stringify(perMode))
  const towerAll = allTrainers(towerModes)
  // FireRed/LeafGreen draw their own sprites for Kanto only (#1-151); the rest fall back to Emerald's static sprite.
  const towerSpriteOk = (t) => t.sprites.length === t.species.length && t.species.every((id, k) => t.sprites[k].includes(id > 151 ? '/emerald/' : '/firered-leafgreen/'))
  check('... every Tower Pokémon has a static sprite: Kanto FireRed/LeafGreen\'s, the rest Emerald\'s', towerAll.every(towerSpriteOk), towerAll.find((t) => !towerSpriteOk(t))?.sprites.join(','))
  const towerImgs = imageCheck('FireRed/LeafGreen Tower (4 modes × 8 floors)', towerModes)
  // Gendered non-Kanto species were the broken ones (no unsuffixed animated file): Politoed, Heracross, Houndoom.
  const gendered = [186, 214, 229].map((id) => towerAll.flatMap((t) => t.sprites.filter((_, k) => t.species[k] === id))[0])
  check('Tower: gendered Johto species (Politoed, Heracross, Houndoom) load Emerald\'s static sprite', gendered.every((s) => s?.includes('/emerald/')) &&gendered.every((s) => towerImgs.some((i) => i.src === s && i.w > 0)), gendered.join(' '))
  spotCheck('Tower', towerModes, 'firered-leafgreen', 'trainer-tower', [
    ['Single-1-1', [160, 62, 115, 241, 55, 210]],
    ['Knockout-8-3', [230, 76, 149, 248, 181, 3]],
    ['Mixed-5-1', [215, 139, 87, 195, 222, 28]],
  ])
  const towerBest = await page.$eval('[data-testid="speed-record-single"] [data-testid="speed-best"]', (e) => e.textContent.trim())
  check('the Tower\'s record is its own (no Hill attempt shows)', towerBest === 'No attempt yet', towerBest)
  await page.screenshot({ path: shot('s2-frlg-light'), fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.screenshot({ path: shot('s2-frlg-dark'), fullPage: true })
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))

  await selectGeneration(page, 4)
  await openEntry(page, 'frontier-speed')
  await page.waitForSelector(SPEED)
  await pickGame('platinum')
  sh = await speedHead()
  check('Platinum: "Platinum has no Trainer Hill or Trainer Tower."', sh.status === 'not-in-game' && sh.notice === 'Platinum has no Trainer Hill or Trainer Tower.' && sh.facility == null, JSON.stringify(sh))
  await page.screenshot({ path: shot('s2-platinum-notice') })
  await selectGeneration(page, 2)
  await openEntry(page, 'frontier-speed')
  await page.waitForSelector(`${SPEED}[data-status="other-generation"]`)
  sh = await speedHead()
  check('Gen 2: the generation notice', sh.notice === 'No Battle Frontier in Gen 2. This tab covers Emerald, FireRed and LeafGreen, Platinum, and HeartGold and SoulSilver.', JSON.stringify(sh))
  // Leave Gen 3 on Emerald for the sections below.
  await selectGeneration(page, 3)
  await openEntry(page, 'frontier-facilities')
  await pickGame('emerald')

  await selectGeneration(page, 3)

  // ================================================================ 3. FACILITIES
  hr('3. FACILITIES: seven facility sections and the shared section, as the mockup')
  await openEntry(page, 'frontier-facilities')
  await ready(page, 'facilities')
  check('Gen 3: Frontier data was fetched (rules + the Emerald partition)', frontierRequests.some((u) => u.includes('frontier/emerald')) && frontierRequests.some((u) => u.includes('trainers/emerald')), frontierRequests.length)
  await openMock('frontier-facilities.html')
  const facIds = await page.$$eval('[data-layout="facility"]', (els) => els.map((e) => e.dataset.facility))
  check('7 facility sections in the mockup order, then Trainer Hill', JSON.stringify(facIds) === JSON.stringify(['tower', 'dome', 'factory', 'palace', 'arena', 'pike', 'pyramid', 'trainer-hill']), facIds.join(','))
  const appFac = await appTexts(page, '[data-layout="facility"]')
  const mockFac = await mockTexts(mock, 2, '[data-layout="facility"]')
  facIds.slice(0, 7).forEach((id, i) => same(`${id}: every fact as the mockup`, appFac[i], mockFac[i]))
  await page.waitForFunction(() => [...document.querySelectorAll('[data-facility="trainer-hill"] .bf-kv > div')].some((r) => r.querySelector('dt').textContent === 'Modes' && /floors/.test(r.querySelector('dd').textContent)))
  const hill = await page.$$eval('[data-facility="trainer-hill"] .bf-kv > div', (rows) => Object.fromEntries(rows.map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent])))
  check('Trainer Hill modes from the Trainer Dex: Normal, Variety, Unique, Expert, 4 floors and 8 trainers each', hill.Modes === 'Normal (4 floors, 8 trainers) · Variety (4 floors, 8 trainers) · Unique (4 floors, 8 trainers) · Expert (4 floors, 8 trainers)', hill.Modes)
  // pokeemerald src/trainer_hill.c GetPrizeItemId: minutes = timer / 3600.
  check('Trainer Hill prizes by time: <12 grand prize, 12 Ether, 13 Max Potion, 14–15 Revive, 16–17 Fluffy Tail, 18+ Great Ball', hill['12 min'] === 'Ether' && hill['13 min'] === 'Max Potion' && hill['14–15 min'] === 'Revive' && hill['16–17 min'] === 'Fluffy Tail' && hill['18 min or more'] === 'Great Ball' && /grand prize/.test(hill['Under 12 min']), JSON.stringify(hill))
  check('Trainer Hill: Double Battles against two trainers, timer stops at 59:59.98', hill.Format === 'Double Battle against two trainers' && hill.Timer === 'Stops at 59:59.98', JSON.stringify(hill))
  await page.screenshot({ path: shot('s1-emerald-light'), fullPage: true })
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

  // ================================================================ 10. BACK TO GEN 2
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
  await selectGeneration(page, 2)
  for (const [id, screen] of [['frontier-facilities', 'facilities'], ['frontier-brains', 'brains'], ['frontier-sets', 'sets']]) {
    await openEntry(page, id)
    const st = await page.$eval(`[data-testid="frontier-${screen}"]`, (r) => r.dataset.status)
    check(`[gen 2 again] ${screen}: the notice`, st === 'other-generation', st)
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
    // The game row is the Trainer Dex's in-generation pattern (root CLAUDE.md: not an exception): it picks a game, never a generation.
    `no generation selector of its own in any of the module's ${moduleFiles.length} files (no fifth exception); the game row is useGameInGeneration's`,
    moduleFiles.length >= 10 && !/setGeneration|gen-select|VersionGroupSelector/.test(moduleSrc) && /useGameInGeneration\('frontier'/.test(moduleSrc),
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
