/**
 * The phone layout: every screen of the app, held upright.
 *
 * src/mobile.css is one media query, so the desktop is untouched by construction
 * -- section 1 checks that construction rather than trusting it. Everything after
 * runs in a touch context at phone sizes:
 *
 * 1. THE DESKTOP IS UNCHANGED -- no menu button, the three nav groups showing,
 *    none of the phone rules applied at 1280px.
 * 2. THE MENU -- one button opens every destination in NAV_TABS, each a 44px
 *    target, the open page marked; a choice navigates and closes the sheet.
 *    (The desktop groups cannot be opened by a tap: mouseover and focus open
 *    them and the click that follows toggles them shut. MobileNav.tsx.)
 * 3. THE BAR'S PANELS -- Search/Filter, Sort and the account menu open inside
 *    the window, not off its left edge.
 * 4. NOTHING RUNS PAST THE EDGE -- every destination, the species page's four
 *    tabs, a detail page in each dex, the Team Building screens with a real
 *    team, and all ten Team Matchup tabs with an opponent, at 390px and 360px.
 *    A wide table scrolling inside its own box is fine; an element hanging past
 *    the window with nothing to scroll it into view is not.
 * 5. THE SPECIES PAGE IS READABLE -- its labels were 3.8px before the phone
 *    unit, and its pinned hero left the Info tab a 170px window.
 * 6. SCREEN-BY-SCREEN SHAPES -- Team Matchup's ten tabs all on screen, the Build
 *    Form in one column, the Team Library's cards at their measured 127px, the
 *    hover-only controls shown to a finger.
 *
 * Tests the PRODUCTION build: run `npm run build` first.
 * Usage: npm run verify:mobile
 */

import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startPreviewServer } from './lib/devServer.mjs'

const PORT = 4204
const APP_URL = `http://localhost:${PORT}/pokeapp/`
const SHOTS = fileURLToPath(new URL('.verify-shots/mobile/', import.meta.url))
mkdirSync(SHOTS, { recursive: true })

let checks = 0
const failures = []
const log = (s) => console.log(s)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks += 1
  if (!ok) failures.push(`${label}${detail ? `  (${detail})` : ''}`)
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? `  ${detail}` : ''}`)
}

/* Move and item ids come from the bundle on disk, so nothing here hardcodes one. */
const moves = JSON.parse(readFileSync(new URL('../public/data/moves.json', import.meta.url)))
const items = JSON.parse(readFileSync(new URL('../public/data/items.json', import.meta.url)))
const moveId = (slug) => Object.values(moves).find((m) => m.name === slug)?.id ?? null
const itemId = (slug) => Object.values(items).find((i) => i.name === slug)?.id ?? null

const build = (id, over = {}) => ({
  id,
  generation: 4,
  speciesId: 1,
  pokemonId: 1,
  nickname: '',
  gender: 'male',
  shiny: false,
  level: 50,
  friendship: 70,
  itemId: null,
  abilityId: null,
  natureId: null,
  moveIds: [null, null, null, null],
  effort: {},
  individual: {},
  tags: [],
  notes: '',
  ...over,
})
const M = (...slugs) => slugs.map(moveId)
const TEAM_DOC = {
  nextBuildSeq: 7,
  nextTeamSeq: 3,
  builds: [
    build('b1', {
      speciesId: 6,
      pokemonId: 6,
      nickname: 'Blaze',
      itemId: itemId('leftovers'),
      moveIds: M('flamethrower', 'air-slash', 'dragon-pulse', 'focus-blast'),
      effort: { spa: 252, spe: 252, hp: 4 },
    }),
    build('b2', {
      speciesId: 9,
      pokemonId: 9,
      moveIds: M('hydro-pump', 'ice-beam', 'earthquake', 'rapid-spin'),
    }),
    build('b3', {
      speciesId: 3,
      pokemonId: 3,
      moveIds: M('sleep-powder', 'leech-seed', 'giga-drain', 'sludge-bomb'),
    }),
    build('b4', {
      speciesId: 65,
      pokemonId: 65,
      moveIds: M('psychic', 'focus-blast', 'shadow-ball', 'calm-mind'),
    }),
    build('b5', {
      speciesId: 107,
      pokemonId: 107,
      moveIds: M('high-jump-kick', 'close-combat', 'thunder-punch', 'ice-punch'),
    }),
    build('b6', {
      speciesId: 143,
      pokemonId: 143,
      moveIds: M('body-slam', 'rest', 'sleep-talk', 'curse'),
    }),
  ],
  teams: [
    {
      id: 't1',
      seq: 1,
      generation: 4,
      memberIds: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
      notes: '',
      name: 'Platinum run',
    },
    { id: 't2', seq: 2, generation: 4, memberIds: ['b1', 'b2', null, null, null, null], notes: '' },
  ],
}

/*
  WHAT COUNTS AS RUNNING PAST THE EDGE. An element whose box reaches beyond the
  window, unless an ancestor between it and the page lets a reader get to it: a
  sideways scroller that really scrolls (a wide table in its own box is the
  intended phone shape), or a line that ellipsizes on purpose. Clipping by
  `.panel` or a ScrollArea does NOT count as contained -- that clipping is
  exactly the failure, content cut off with no way to reach it. Decorative
  `aria-hidden` texture (the ghost numerals) may bleed.
*/
function edgeOffenders() {
  const vw = window.innerWidth
  const bad = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right <= vw + 1 && r.left >= -1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.position === 'fixed') continue
    if (el.closest('[aria-hidden="true"], .layout-overlay, .visually-hidden')) continue
    let reachable = false
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p)
      const scrolls =
        (ps.overflowX === 'auto' || ps.overflowX === 'scroll') && p.scrollWidth > p.clientWidth
      const ellipsis = ps.textOverflow === 'ellipsis' && ps.overflowX !== 'visible'
      if (p !== el && (scrolls || ellipsis)) {
        reachable = true
        break
      }
      if (p === el && ellipsis) {
        reachable = true
        break
      }
    }
    if (reachable) continue
    const cls = String(el.className.baseVal ?? el.className)
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .join('.')
    bad.push(
      `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} [${Math.round(r.left)}..${Math.round(r.right)}]`,
    )
  }
  return [...new Set(bad)].slice(0, 6)
}

let browser
const preview = await startPreviewServer({ port: PORT })
try {
  browser = await chromium.launch()

  // ===================================================================== 1
  hr('1. THE DESKTOP IS UNCHANGED')
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    })
    const page = await ctx.newPage()
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.app-info-trigger[data-testid="boot-status"]', { timeout: 60000 })
    const desk = await page.evaluate(() => ({
      toggle: document.querySelectorAll('[data-testid="mobile-nav-toggle"]').length,
      nav: getComputedStyle(document.querySelector('.app-nav')).display,
      barNav: getComputedStyle(document.querySelector('.app-bar-nav')).display,
      gutter: parseFloat(getComputedStyle(document.querySelector('.panel')).paddingLeft),
      /* App.css says 1.25rem, and the root is 18px above 1024px. */
      rem125: parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.25,
    }))
    check('no menu button is rendered at 1280px', desk.toggle === 0, JSON.stringify(desk))
    check(
      'the three nav groups show, in their own row',
      desk.nav === 'flex' && desk.barNav === 'flex',
      JSON.stringify(desk),
    )
    check(
      "and the panel keeps the desktop's 1.25rem gutter",
      desk.gutter === desk.rem125,
      JSON.stringify(desk),
    )
    await ctx.close()
  }

  const phone = async (width, height) => {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() === 'error' && !/\[pwa\]/.test(m.text())) errors.push(m.text())
    })
    const boot = async () => {
      await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.app-info-trigger[data-testid="boot-status"]', { timeout: 60000 })
    }
    await boot()
    /* Through the phone's own menu, which is the point: every screen below is
       reached the way a reader on a phone reaches it. */
    const go = async (id) => {
      await page.tap('[data-testid="mobile-nav-toggle"]')
      await page.waitForSelector('[data-testid="mobile-nav"]')
      await page.tap(`[data-testid="mobile-nav-${id}"]`)
      await page.waitForSelector('[data-testid="mobile-nav"]', { state: 'detached' })
      await page.waitForTimeout(500)
    }
    const seed = async (doc) => {
      await page.evaluate(
        (v) => localStorage.setItem('pokeapp:team-builder:v1', v),
        JSON.stringify(doc),
      )
      await boot()
    }
    return { ctx, page, errors, go, seed }
  }

  // ===================================================================== 2
  hr('2. THE MENU (390 x 844)')
  const P = await phone(390, 844)
  {
    const { page, go } = P
    const bar = await page.evaluate(() => {
      const box = (s) => document.querySelector(s)?.getBoundingClientRect()
      const brand = box('.app-brand')
      const menu = box('[data-testid="mobile-nav-toggle"]')
      const account = box('[data-testid="account"]')
      const search = box('[data-testid="controls-toggle"]')
      return {
        navShown: getComputedStyle(document.querySelector('.app-nav')).display !== 'none',
        rowOne: [brand, menu, account].every(
          (b) => b && Math.abs(b.top + b.height / 2 - (brand.top + brand.height / 2)) < 8,
        ),
        controlsBelow: search.top > brand.bottom,
        menuTarget: [Math.round(menu.width), Math.round(menu.height)],
        menuRight: Math.round(menu.right),
        vw: window.innerWidth,
      }
    })
    check('the hover groups are hidden on a phone', !bar.navShown)
    check(
      'brand, account and menu share the top row; the page controls sit under it',
      bar.rowOne && bar.controlsBelow,
      JSON.stringify(bar),
    )
    check(
      'the menu button is a 44px target',
      bar.menuTarget[0] >= 44 && bar.menuTarget[1] >= 44,
      JSON.stringify(bar.menuTarget),
    )
    check('and it is inside the window', bar.menuRight <= bar.vw, `${bar.menuRight} vs ${bar.vw}`)

    await page.tap('[data-testid="mobile-nav-toggle"]')
    await page.waitForSelector('[data-testid="mobile-nav"]')
    const sheet = await page.evaluate(() => {
      const desktopIds = [...document.querySelectorAll('.app-nav [data-testid^="nav-"]')]
        .map((e) => e.dataset.testid)
        .filter((t) => !/^nav-(tab|group|dropdown|subgroup|subdropdown)-/.test(t))
        .map((t) => t.slice(4))
      const items = [...document.querySelectorAll('[data-testid="mobile-nav"] .mobile-nav-item')]
      const ids = items.map((e) => e.dataset.testid.slice('mobile-nav-'.length))
      const r = document.querySelector('[data-testid="mobile-nav"]').getBoundingClientRect()
      return {
        missing: desktopIds.filter((id) => !ids.includes(id)),
        extra: ids.filter((id) => !desktopIds.includes(id)),
        count: ids.length,
        minHeight: Math.min(...items.map((e) => e.getBoundingClientRect().height)),
        current: items
          .filter((e) => e.getAttribute('aria-current') === 'page')
          .map((e) => e.textContent),
        covers: r.width === window.innerWidth && r.height === window.innerHeight,
        allOnScreen: items.every((e) => e.getBoundingClientRect().bottom <= window.innerHeight),
      }
    })
    check(
      `the sheet lists every nav destination, and only those (${sheet.count})`,
      sheet.missing.length === 0 && sheet.extra.length === 0 && sheet.count > 15,
      JSON.stringify(sheet),
    )
    check('every row is at least 44px tall', sheet.minHeight >= 44, String(sheet.minHeight))
    check(
      'the open page is marked, and only it',
      sheet.current.length === 1 && sheet.current[0] === 'Pokédex',
      JSON.stringify(sheet.current),
    )
    check(
      'the sheet covers the window and all of it fits without scrolling',
      sheet.covers && sheet.allOnScreen,
      JSON.stringify(sheet),
    )
    await page.screenshot({ path: `${SHOTS}menu.png` })

    await page.keyboard.press('Escape')
    check('Escape closes it', (await page.$('[data-testid="mobile-nav"]')) == null)

    await go('team-matchup')
    check(
      'a choice navigates and closes the sheet',
      (await page.$('[data-testid="team-matchup"]')) != null,
    )
    await page.goBack()
    await page.waitForSelector('[data-testid="species-rows"], [data-testid="dex-pokedex"]', {
      timeout: 15000,
    })
    check(
      'and the back gesture walks back to where it came from',
      (await page.$('[data-testid="team-matchup"]')) == null,
    )
  }

  // ===================================================================== 3
  hr("3. THE BAR'S PANELS OPEN INSIDE THE WINDOW")
  {
    const { page, go } = P
    await go('pokedex')
    for (const [toggle, panel] of [
      ['controls-toggle', 'controls-panel'],
      ['dex-sort-toggle', 'dex-sort-panel'],
      ['account-toggle', 'account-panel'],
    ]) {
      await page.tap(`[data-testid="${toggle}"]`)
      await page.waitForTimeout(250)
      const r = await page.$eval(`[data-testid="${panel}"]`, (e) => {
        const b = e.getBoundingClientRect()
        return {
          l: Math.round(b.left),
          r: Math.round(b.right),
          vw: window.innerWidth,
          shown: getComputedStyle(e).display !== 'none',
        }
      })
      check(
        `${panel} opens within the window`,
        r.shown && r.l >= 0 && r.r <= r.vw,
        JSON.stringify(r),
      )
      await page.tap(`[data-testid="${toggle}"]`)
      await page.waitForTimeout(150)
    }
  }

  // ===================================================================== 4
  const sweep = async (ctx, label) => {
    hr(`4. NOTHING RUNS PAST THE EDGE (${label})`)
    const { page, go, seed } = ctx
    const clean = async (name) => {
      await page.waitForTimeout(400)
      const bad = await page.evaluate(edgeOffenders)
      check(`${name}: nothing past the edge`, bad.length === 0, JSON.stringify(bad))
    }
    const tapTab = async (name) => {
      await page.locator('.ds-tab', { hasText: name }).first().tap()
      await page.waitForTimeout(500)
    }

    await seed(TEAM_DOC)
    for (const id of [
      'pokedex',
      'itemdex',
      'abilitydex',
      'naturedex',
      'berrydex',
      'movedex',
      'breedingdex',
      'trainerdex',
      'type-coverage',
      'my-teams',
      'build-library',
      'calculators',
      'damage-calculator',
      'compare-pokemon',
      'training-optimization',
      'breeding-planner',
    ]) {
      await go(id)
      await clean(id)
    }

    // The species page, all four tabs.
    await go('pokedex')
    await page.tap('[data-testid="species-open-25"]')
    await page.waitForSelector('[data-testid="species-page"]')
    for (const t of ['Info', 'Learnset', 'Description', 'Sprites']) {
      await tapTab(t)
      await clean(`species page, ${t}`)
    }

    // A detail page in each list dex.
    for (const id of [
      'itemdex',
      'abilitydex',
      'berrydex',
      'movedex',
      'trainerdex',
      'breedingdex',
    ]) {
      await go(id)
      await page.waitForTimeout(800)
      const opened = await page.evaluate(() => {
        const row = document.querySelector(
          '.ledger-list button, .data-table-row-clickable .data-table-open, .species-rows button, .species-card-hit',
        )
        row?.click()
        return !!row
      })
      if (opened) await clean(`${id} detail`)
    }

    // The four Type Coverage views and the four small calculators.
    await go('type-coverage')
    for (const t of ['Matrix', 'Flow', 'Against', 'Card']) {
      await tapTab(t)
      await clean(`type coverage, ${t}`)
    }
    await go('calculators')
    for (const t of ['Catch Rate', 'Stat', 'Experience', 'Speed']) {
      await tapTab(t)
      await clean(`calculators, ${t}`)
    }

    // Team Building with a real six-member team.
    await go('my-teams')
    await page.tap('[data-testid="tb-team-t1"]')
    await page.waitForSelector('[data-testid="tb-slot-grid"]')
    await clean('Team Display')
    await go('build-library')
    await page.tap('[data-testid="tb-build-b1-open"]')
    await page.waitForSelector('[data-testid="tb-build-form"]')
    await clean('Build Form')

    // Team Matchup, every tab, against a real opponent.
    await go('team-matchup')
    await page.waitForSelector('[data-testid="tm-team"]')
    await page.selectOption('[data-testid="tm-team"]', 't1')
    await page.tap('[data-testid="tm-trainer-input"]')
    await page.fill('[data-testid="tm-trainer-input"]', 'Champion Lance')
    await page.waitForSelector('[data-testid="tm-trainer-list"] [role="option"]')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const tabs = await page.$$eval('.tm-tabs .ds-tab', (els) =>
      els.map((e) => e.textContent.trim()),
    )
    for (const t of tabs) {
      await tapTab(t)
      await page.waitForTimeout(600)
      await clean(`team matchup, ${t}`)
    }
  }

  await sweep(P, '390 x 844')

  // ===================================================================== 5
  hr('5. THE SPECIES PAGE IS READABLE')
  {
    const { page, go } = P
    await go('pokedex')
    /* The Pokédex reopens the species it was last showing; the grid first. */
    if (await page.$('[data-testid="species-page"]'))
      await page.tap('[data-testid="species-page-back"]')
    await page.tap('[data-testid="species-open-6"]')
    await page.waitForSelector('[data-testid="species-page-panel-info"]')
    await page.waitForTimeout(400)
    const sp = await page.evaluate(() => {
      const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0)
      const label = document.querySelector(
        '.species-page-panel .ds-stat-label, .species-page-panel th, .species-page-panel dt',
      )
      const tab = document.querySelector('.species-page-subnav .ds-tab')
      const kana = document.querySelector('.species-hero-kana')
      const scroller = document
        .querySelector('[data-testid="species-page-scroll"]')
        .getBoundingClientRect()
      return {
        label: px(label),
        body: parseFloat(getComputedStyle(document.querySelector('.species-page-inner')).fontSize),
        tab: px(tab),
        kana: px(kana),
        scrollerShare: scroller.height / window.innerHeight,
      }
    })
    log(`  ${JSON.stringify(sp)}`)
    check('body type is the system body size, 14px', Math.abs(sp.body - 14) < 0.5, String(sp.body))
    check('labels are at least 10px (they were 3.8px)', sp.label >= 10, String(sp.label))
    check('the tabs are at least 14px', sp.tab >= 14, String(sp.tab))
    check('the katakana in the hero is readable (at least 11px)', sp.kana >= 11, String(sp.kana))
    check(
      'the content scroller has at least half the screen',
      sp.scrollerShare >= 0.5,
      sp.scrollerShare.toFixed(2),
    )
    await page.screenshot({ path: `${SHOTS}species-info.png` })
  }

  // ===================================================================== 6
  hr('6. SCREEN-BY-SCREEN SHAPES')
  {
    const { page, go } = P
    await go('team-matchup')
    await page.waitForSelector('.tm-tabs .ds-tab')
    const tm = await page.$$eval('.tm-tabs .ds-tab', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return r.left >= 0 && r.right <= window.innerWidth
      }),
    )
    check(
      `all ${tm.length} Team Matchup tabs are on screen`,
      tm.length === 10 && tm.every(Boolean),
      JSON.stringify(tm),
    )

    await go('build-library')
    await page.tap('[data-testid="tb-build-b1-open"]')
    await page.waitForSelector('[data-testid="tb-build-form"]')
    const bf = await page.evaluate(() => {
      const w = (s) => Math.round(document.querySelector(s).getBoundingClientRect().width)
      const grid = document.querySelector('.tb-form-grid').getBoundingClientRect().width
      return {
        grid: Math.round(grid),
        identity: w('[data-testid="tb-identity"]'),
        main: w('.tb-form-main'),
        rail: w('[data-testid="tb-rail"]'),
        fieldCols: getComputedStyle(
          document.querySelector('.tb-field-row'),
        ).gridTemplateColumns.split(' ').length,
        order: ['[data-testid="tb-rail"]', '[data-testid="tb-identity"]', '.tb-form-main'].map(
          (s) => Math.round(document.querySelector(s).getBoundingClientRect().top),
        ),
      }
    })
    check(
      'the Build Form is one column: rail, portrait and fields each the full width',
      [bf.identity, bf.main, bf.rail].every((x) => x >= bf.grid - 2),
      JSON.stringify(bf),
    )
    check(
      'stacked in that order',
      bf.order[0] < bf.order[1] && bf.order[1] < bf.order[2],
      JSON.stringify(bf.order),
    )
    check('with two fields to a row', bf.fieldCols === 2, String(bf.fieldCols))

    await go('my-teams')
    await page.waitForSelector('[data-testid="tb-team-rows"]')
    const lib = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="tb-team-t1"] .tb-card-compact')]
      const lane = document.querySelector('[data-testid="tb-team-t1"] .tb-team-members')
      return {
        n: cards.length,
        widths: [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().width)))],
        lane: Math.round(lane.getBoundingClientRect().width),
        scrolls: lane.scrollWidth > lane.clientWidth,
      }
    })
    check(
      'the Team Library keeps all six cards at the measured 127px',
      lib.n === 6 && lib.widths.length === 1 && lib.widths[0] === 127,
      JSON.stringify(lib),
    )
    check(
      'in a full-width lane that scrolls sideways',
      lib.scrolls && lib.lane >= 300,
      JSON.stringify(lib),
    )

    await page.tap('[data-testid="tb-team-t1"]')
    await page.waitForSelector('[data-testid="tb-slot-grid"]')
    const td = await page.evaluate(() => ({
      corner: getComputedStyle(document.querySelector('.tb-corner')).opacity,
      dock: getComputedStyle(document.querySelector('.tb-dock')).opacity,
      cardsInside: [...document.querySelectorAll('.tb-card-full')].every(
        (c) => c.getBoundingClientRect().right <= window.innerWidth,
      ),
    }))
    check(
      'the Team Display shows its hover-only controls to a finger',
      td.corner === '1' && td.dock === '1',
      JSON.stringify(td),
    )
    check('and every member card fits the window', td.cardsInside)
    await page.screenshot({ path: `${SHOTS}team-display.png` })

    check('no console errors at 390px', P.errors.length === 0, P.errors.slice(0, 3).join(' | '))
  }
  await P.ctx.close()

  // ===================================================================== 4 again, narrower
  const Q = await phone(360, 740)
  await sweep(Q, '360 x 740')
  check('no console errors at 360px', Q.errors.length === 0, Q.errors.slice(0, 3).join(' | '))
  await Q.ctx.close()
} finally {
  if (browser) await browser.close()
  await preview.stop()
}

log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
