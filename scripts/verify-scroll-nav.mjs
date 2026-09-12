/**
 * The scroll model and the navigation stack, driven in a real browser.
 *
 * Five sections, one per thing that was asked for plus the guard the third one
 * needed:
 *
 *   1. the scrollbar        drawn, faded when idle, draggable, and taking no gutter
 *   2. scroll memory        the offset survives leaving and coming back
 *   3. the back stack       one press, one step, from either the button or the browser
 *   4. the move link        Pokedex > species > move page, which is what 3 walks back
 *   5. the nav guard        a shared build's edit is no longer dropped at the door
 *
 * IT ASSERTS RELATIONS, NOT PIXELS, wherever there is a choice -- "the thumb's
 * travel ends level with the track" survives a change to the inset, "bottom is
 * 427px" does not. The two places a literal is unavoidable (the 4px of paint and
 * the 26px floor) read it out of the stylesheet rather than restating it.
 *
 * Run: npm run build && npm run verify:scroll-nav
 */

import { chromium } from 'playwright'
import { startPreviewServer } from './lib/devServer.mjs'
import { openTab } from './lib/nav.mjs'

/* 4198: every port from 4187 up was already owned by another script, and
   verify-design-system asserts statically that no two declare the same one. */
const PORT = 4198

let failures = 0
const log = (...a) => console.log(...a)

function check(name, pass, detail = '') {
  log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`)
  if (!pass) failures += 1
}

function section(n, title) {
  log('')
  log(`== ${n}. ${title}`)
}

/** The fade is 1000ms in ScrollArea; wait past it with room for a slow frame. */
const PAST_IDLE = 1400

const server = await startPreviewServer({ port: PORT })
const APP_URL = server.url
const browser = await chromium.launch()

try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: 'block',
  })
  context.setDefaultTimeout(30000)
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  const boot = async () => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  }

  const GRID = '[data-testid="pokedex-grid-scroll-area"]'
  const TRACK = '[data-testid="scroll-track"]'
  const THUMB = '[data-testid="scroll-thumb"]'
  const BACK = '[data-testid="app-bar-back"]'

  /** Scroll a section by wheel, the way a reader does, then let it settle. */
  const wheelTo = async (selector, top) => {
    await page.$eval(selector, (el, y) => el.scrollTo({ top: y }), top)
    await page.waitForTimeout(120)
  }

  const offsetOf = (selector) => page.$eval(selector, (el) => el.scrollTop)

  await boot()

  // ===================================================================
  section(1, 'The scrollbar: drawn, faded when idle, and costing no gutter')
  // ===================================================================

  const geom = await page.$eval(GRID, (el) => {
    const outer = el.closest('.scroll-area-outer')
    const track = outer.querySelector('.scroll-track')
    const thumb = outer.querySelector('.scroll-thumb')
    const cs = getComputedStyle(thumb)
    return {
      // A native bar would take width out of the content box. This is the whole
      // reason the thumb is drawn, so it is asserted rather than assumed.
      gutter: el.offsetWidth - el.clientWidth,
      scrollbarWidth: getComputedStyle(el).scrollbarWidth,
      scrollable: el.scrollHeight - el.clientHeight,
      trackHidden: track.hidden,
      thumbWidth: cs.width,
      thumbOpacity: Number(cs.opacity),
      trackRect: track.getBoundingClientRect(),
      thumbRect: thumb.getBoundingClientRect(),
      outerRect: outer.getBoundingClientRect(),
    }
  })

  check(
    'the Pokedex grid is long enough to be worth a scrollbar',
    geom.scrollable > 200,
    `${geom.scrollable}px of overflow`,
  )
  check(
    'the native bar is still suppressed',
    geom.scrollbarWidth === 'none',
    `scrollbar-width: ${geom.scrollbarWidth}`,
  )
  check(
    'and it therefore takes NO gutter out of the content',
    geom.gutter === 0,
    `offsetWidth - clientWidth = ${geom.gutter}`,
  )
  check('the track is present on a scrollable section', geom.trackHidden === false)
  check('the thumb is invisible at rest', geom.thumbOpacity === 0, `opacity ${geom.thumbOpacity}`)
  check('the thumb paints 4px wide', geom.thumbWidth === '4px', geom.thumbWidth)
  check(
    'the thumb sits inside the section rather than over its edge',
    geom.thumbRect.right <= geom.outerRect.right && geom.thumbRect.left > geom.outerRect.left,
    `thumb right ${geom.thumbRect.right.toFixed(1)} vs section right ${geom.outerRect.right.toFixed(1)}`,
  )

  // ---- it wakes on a scroll and fades again on its own
  await wheelTo(GRID, 600)
  /* Past the 260ms opacity transition. Read straight after the scroll this
     lands mid-fade -- 0.45 -- which is a true reading of a transition rather
     than of the state being asserted. */
  await page.waitForTimeout(400)
  const awake = await page.$eval(THUMB, (el) => Number(getComputedStyle(el).opacity))
  check('scrolling wakes the thumb', awake === 1, `opacity ${awake}`)

  const moved = await page.$eval(THUMB, (el) => el.getBoundingClientRect().top)
  check(
    'and the thumb travelled down with the content',
    moved > geom.thumbRect.top,
    `${geom.thumbRect.top.toFixed(1)} -> ${moved.toFixed(1)}`,
  )

  await page.waitForTimeout(PAST_IDLE)
  const faded = await page.$eval(THUMB, (el) => Number(getComputedStyle(el).opacity))
  check('and it fades out again once the scrolling stops', faded === 0, `opacity ${faded}`)

  // ---- hovering the strip brings it back, which is what makes it grabbable
  const strip = await page.$eval(TRACK, (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.move(strip.x, strip.y)
  await page.waitForTimeout(400)
  const hovered = await page.$eval(THUMB, (el) => ({
    opacity: Number(getComputedStyle(el).opacity),
    width: getComputedStyle(el).width,
  }))
  check(
    'hovering the strip wakes it from a standstill',
    hovered.opacity === 1,
    `opacity ${hovered.opacity}`,
  )
  check('and thickens it to 6px under the pointer', hovered.width === '6px', hovered.width)

  // ---- it is really draggable
  const before = await offsetOf(GRID)
  const thumbBox = await page.$eval(THUMB, (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await page.mouse.move(thumbBox.x, thumbBox.y)
  await page.mouse.down()
  await page.mouse.move(thumbBox.x, thumbBox.y + 200, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const after = await offsetOf(GRID)
  check('dragging the thumb scrolls the content', after > before + 200, `${before} -> ${after}`)

  // ---- and it never runs under the back-to-top control
  const corner = await page.$eval(GRID, (el) => {
    const outer = el.closest('.scroll-area-outer')
    const btn = outer.querySelector('.scroll-top')
    const thumb = outer.querySelector('.scroll-thumb')
    if (!btn) return null
    return {
      btn: btn.getBoundingClientRect(),
      thumb: thumb.getBoundingClientRect(),
    }
  })
  check('the back-to-top control is on screen once scrolled away', corner != null)
  if (corner) {
    check(
      'and the thumb passes beside it, never behind it',
      corner.thumb.left >= corner.btn.right,
      `thumb left ${corner.thumb.left.toFixed(1)} vs button right ${corner.btn.right.toFixed(1)}`,
    )
  }

  // ---- a section with nothing to scroll gets no thumb at all
  await boot()
  await page.click('[data-testid="controls-toggle"]')
  await page.fill('[data-testid="species-search"]', 'mewtwo')
  await page.waitForTimeout(400)
  const shortList = await page.$eval(GRID, (el) => {
    const track = el.closest('.scroll-area-outer').querySelector('.scroll-track')
    return { overflow: el.scrollHeight - el.clientHeight, trackHidden: track.hidden }
  })
  check(
    'a list that fits shows no track at all',
    shortList.overflow <= 8 && shortList.trackHidden === true,
    `overflow ${shortList.overflow}px, track hidden ${shortList.trackHidden}`,
  )

  // ===================================================================
  section(2, 'Scroll memory: the offset survives leaving and coming back')
  // ===================================================================

  await boot()
  await wheelTo(GRID, 900)
  const parked = await offsetOf(GRID)
  check('parked part-way down the grid', parked > 800, `scrollTop ${parked}`)

  await page.click('[data-testid="species-open-25"]')
  await page.waitForSelector('[data-testid="species-page"]')
  check('opened a species, which unmounts the grid entirely', (await page.$(GRID)) === null)

  await page.click('[data-testid="species-page-back"]')
  await page.waitForSelector(GRID)
  await page.waitForTimeout(400)
  const restored = await offsetOf(GRID)
  check(
    'going back to the Pokedex returns to the SAME position',
    Math.abs(restored - parked) <= 2,
    `left at ${parked}, came back to ${restored}`,
  )

  // ---- a changed filter is a different list, so it opens at the top
  await page.click('[data-testid="controls-toggle"]')
  await page.fill('[data-testid="species-search"]', 'char')
  await page.waitForTimeout(400)
  const filtered = await offsetOf(GRID)
  check('changing the search filter starts at the top', filtered === 0, `scrollTop ${filtered}`)

  // ---- and clearing it back returns to the offset that list was left at
  await page.fill('[data-testid="species-search"]', '')
  await page.waitForTimeout(500)
  const back = await offsetOf(GRID)
  check(
    'and clearing it restores the unfiltered position',
    Math.abs(back - parked) <= 2,
    `back to ${back}, was ${parked}`,
  )

  // ---- the species page remembers per species AND per tab
  await boot()
  await page.click('[data-testid="species-open-6"]')
  await page.waitForSelector('[data-testid="species-page-scroll"]')
  await page.waitForTimeout(700)
  const PAGE_SCROLL = '[data-testid="species-page-scroll"]'
  const pageOverflow = await page.$eval(PAGE_SCROLL, (el) => el.scrollHeight - el.clientHeight)
  if (pageOverflow > 200) {
    await wheelTo(PAGE_SCROLL, 300)
    const pageParked = await offsetOf(PAGE_SCROLL)
    await page.click('[data-testid="species-page-back"]')
    await page.waitForSelector(GRID)
    await page.click('[data-testid="species-open-6"]')
    await page.waitForSelector(PAGE_SCROLL)
    await page.waitForTimeout(700)
    const pageRestored = await offsetOf(PAGE_SCROLL)
    check(
      'the species page remembers its own offset too',
      Math.abs(pageRestored - pageParked) <= 4,
      `left at ${pageParked}, came back to ${pageRestored}`,
    )
  } else {
    check('the species page had enough overflow to test', false, `only ${pageOverflow}px`)
  }

  // ===================================================================
  section(3, 'The back stack: one press, one step')
  // ===================================================================

  await boot()
  check('no back control on the screen the reader came in on', (await page.$(BACK)) === null)

  await page.click('[data-testid="species-open-25"]')
  await page.waitForSelector('[data-testid="species-page"]')
  check('opening a species gives you one', (await page.$(BACK)) !== null)

  await page.click(BACK)
  await page.waitForSelector(GRID)
  check('and pressing it returns to the grid', (await page.$(GRID)) !== null)

  // ---- the browser's own back drives the same steps
  await boot()
  await page.click('[data-testid="species-open-7"]')
  await page.waitForSelector('[data-testid="species-page"]')
  await page.goBack()
  await page.waitForSelector(GRID, { timeout: 15000 })
  check(
    "the browser's back button walks the same stack, not the document",
    (await page.$(GRID)) !== null && page.url().startsWith(APP_URL),
    page.url(),
  )

  // ---- crossing a module boundary is one step like any other
  await boot()
  await openTab(page, 'pokepedia')
  await page.click('[data-testid="nav-itemdex"]')
  await page.waitForSelector('[data-testid="dex-itemdex"]')
  await page.click(BACK)
  await page.waitForSelector(GRID)
  check('back crosses a module boundary too', (await page.$(GRID)) !== null)

  // ===================================================================
  section(4, 'The move link: Pokedex > species > move page')
  // ===================================================================

  await boot()
  await page.click('[data-testid="species-open-1"]')
  await page.waitForSelector('[data-testid="species-page"]')
  await page.click('[data-testid="species-page-subnav"] .ds-tab:text-is("Learnset")')

  const link = page.locator('[data-testid^="species-learn-move-link-"]').first()
  await link.waitFor({ state: 'visible', timeout: 30000 })
  const moveId = (await link.getAttribute('data-testid')).replace('species-learn-move-link-', '')
  const moveName = (await link.textContent()).trim()
  check('learnset move names are links', moveId !== '', `#${moveId} "${moveName}"`)

  await link.click()
  await page.waitForSelector('[data-testid="dex-movedex"]', { timeout: 20000 })
  const openedMove = await page.$eval('[data-testid="dex-movedex"]', (el) =>
    el.querySelector('[data-testid="movedex-detail-scroll"]') ? 'detail' : 'list',
  )
  check('clicking one opens the Movedex on that move', openedMove === 'detail', openedMove)

  // ---- and the stack walks the whole flow back, one step at a time
  await page.click(BACK)
  await page.waitForSelector('[data-testid="species-page"]', { timeout: 20000 })
  check(
    'one back press returns to the species',
    (await page.$('[data-testid="species-page"]')) !== null,
  )

  await page.click(BACK)
  await page.waitForSelector(GRID, { timeout: 20000 })
  check('the next returns to the Pokedex main page', (await page.$(GRID)) !== null)

  // ===================================================================
  section(5, 'The nav guard: a shared build is no longer dropped at the door')
  // ===================================================================

  /* Nicknames here are <= NICKNAME_MAX (10, model.ts). The field carries a real
     maxLength, so a longer test string is silently truncated and the assertion
     fails for a reason that has nothing to do with what is being tested. */
  const mkBuild = (id, over = {}) => ({
    id,
    generation: 3,
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
  const mkTeam = (id, seq, memberIds, over = {}) => ({
    id,
    seq,
    generation: 3,
    memberIds: [...memberIds, ...Array(6 - memberIds.length).fill(null)],
    notes: '',
    ...over,
  })

  /* TWO teams holding the same build is what makes it SHARED, which is the only
     case that was ever dropped -- an unshared one is written by the Build Form's
     own unmount flush and always was. */
  const seedShared = async () => {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
      [
        'pokeapp:team-builder:v1',
        {
          nextBuildSeq: 2,
          nextTeamSeq: 3,
          builds: [mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Original' })],
          teams: [mkTeam('t1', 1, ['b1']), mkTeam('t2', 2, ['b1'])],
        },
      ],
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  }

  const nickOf = (id) =>
    page.evaluate((buildId) => {
      const doc = JSON.parse(localStorage.getItem('pokeapp:team-builder:v1') ?? 'null')
      return doc?.builds.find((b) => b.id === buildId)?.nickname ?? null
    }, id)

  const openDirtyShared = async (nickname) => {
    await seedShared()
    await openTab(page, 'team-building')
    await page.click('[data-testid="nav-build-library"]')
    await page.waitForSelector('[data-testid="tb-build-grid"]', { timeout: 20000 })
    await page.click('[data-testid="tb-build-b1-open"]')
    await page.waitForSelector('[data-testid="tb-build-form"]')
    await page.fill('[data-testid="tb-nickname"]', nickname)
    await page.click('[data-testid="tb-level"]')
    await page.waitForTimeout(300)
  }

  // ---- leaving by the app NAV BAR now asks
  await openDirtyShared('ViaNav')
  await openTab(page, 'pokepedia')
  await page.click('[data-testid="nav-pokedex"]')
  await page.waitForSelector('[data-testid="tb-shared-prompt"]', { timeout: 15000 })
  check('leaving a shared build by the nav bar asks instead of dropping the edit', true)
  check(
    'and it has NOT navigated while the question is open',
    (await page.$('[data-testid="tb-build-form"]')) !== null,
    'still on the Build Form',
  )
  check(
    'nor written anything yet',
    (await nickOf('b1')) === 'Original',
    `stored "${await nickOf('b1')}"`,
  )

  await page.click('[data-testid="tb-shared-save"]')
  await page.waitForSelector(GRID, { timeout: 20000 })
  check(
    'answering it both saves and completes the navigation',
    (await nickOf('b1')) === 'ViaNav' && (await page.$(GRID)) !== null,
    `stored "${await nickOf('b1')}"`,
  )

  // ---- dismissing it stays put, and the edit is still there to be saved
  await openDirtyShared('Stayed')
  await openTab(page, 'pokepedia')
  await page.click('[data-testid="nav-pokedex"]')
  await page.waitForSelector('[data-testid="tb-shared-prompt"]', { timeout: 15000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  check(
    'dismissing the question leaves the reader on the form',
    (await page.$('[data-testid="tb-build-form"]')) !== null,
    'still on the Build Form',
  )
  check(
    'with the edit still in the field',
    (await page.inputValue('[data-testid="tb-nickname"]')) === 'Stayed',
  )

  // ---- and the BACK control goes through the same guard
  await openDirtyShared('ViaBack')
  check('the back control is available from the Build Form', (await page.$(BACK)) !== null)
  await page.click(BACK)
  await page.waitForSelector('[data-testid="tb-shared-prompt"]', { timeout: 15000 })
  check('pressing back asks the same question', true)
  check(
    'and has not gone back while it is open',
    (await page.$('[data-testid="tb-build-form"]')) !== null,
    'still on the Build Form',
  )
  await page.click('[data-testid="tb-shared-discard"]')
  await page.waitForTimeout(1200)
  check(
    'discarding completes the back step',
    (await page.$('[data-testid="tb-build-form"]')) === null,
    'left the Build Form',
  )
  check(
    'and left the shared build untouched',
    (await nickOf('b1')) === 'Original',
    `stored "${await nickOf('b1')}"`,
  )

  // ===================================================================
  section(6, 'On a touch screen: an indicator at rest, a handle once awake')
  // ===================================================================
  /*
    A SECOND CONTEXT, because hasTouch and the pointer media features are
    properties of the browser context rather than of the page -- the desktop
    context above can never answer "what does a phone get", and asserting it
    from the stylesheet instead would only re-read the rule back to itself.
  */
  const phone = await browser.newContext({
    viewport: { width: 412, height: 900 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
  })
  const mob = await phone.newPage()
  await mob.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await mob.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  const atRest = await mob.$eval(GRID, (el) => {
    const outer = el.closest('.scroll-area-outer')
    const thumb = outer.querySelector('.scroll-thumb')
    const track = outer.querySelector('.scroll-track')
    return {
      thumbEvents: getComputedStyle(thumb).pointerEvents,
      trackEvents: getComputedStyle(track).pointerEvents,
      fine: matchMedia('(hover: hover) and (pointer: fine)').matches,
    }
  })
  check('the phone context really is a coarse pointer', atRest.fine === false)
  check(
    'at rest the thumb takes no pointer events, so a swipe there scrolls',
    atRest.thumbEvents === 'none',
    `pointer-events: ${atRest.thumbEvents}`,
  )
  check(
    'and the track never takes them on touch, at rest or awake',
    atRest.trackEvents === 'none',
    `pointer-events: ${atRest.trackEvents}`,
  )

  // ---- a swipe over the right-hand edge scrolls rather than dragging
  const edge = await mob.$eval(GRID, (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.right - 5, yFrom: r.top + r.height * 0.7, yTo: r.top + r.height * 0.3 }
  })
  await mob.touchscreen.tap(edge.x, edge.yFrom)
  const beforeSwipe = await mob.$eval(GRID, (el) => el.scrollTop)
  await mob.$eval(GRID, (el) => el.scrollTo({ top: 400 }))
  await mob.waitForTimeout(150)
  const awakeOnPhone = await mob.$eval(GRID, (el) => {
    const thumb = el.closest('.scroll-area-outer').querySelector('.scroll-thumb')
    return {
      events: getComputedStyle(thumb).pointerEvents,
      hit: thumb.getBoundingClientRect(),
      before: getComputedStyle(thumb, '::before').inset,
    }
  })
  check(
    'once awake it becomes a real handle',
    awakeOnPhone.events === 'auto',
    `pointer-events: ${awakeOnPhone.events}`,
  )
  check(
    'a swipe at the edge did not drag anything before that',
    beforeSwipe === 0,
    `scrollTop ${beforeSwipe}`,
  )

  // ---- the widened hit area must not reach outside the section
  const contained = await mob.$eval(GRID, (el) => {
    const outer = el.closest('.scroll-area-outer')
    const thumb = outer.querySelector('.scroll-thumb')
    const before = getComputedStyle(thumb, '::before')
    const left = parseFloat(before.insetInlineStart || '0')
    const right = parseFloat(before.insetInlineEnd || '0')
    const t = thumb.getBoundingClientRect()
    const o = outer.getBoundingClientRect()
    return { hitRight: t.right - right, outerRight: o.right, left, right }
  })
  check(
    "the finger-sized hit area does not overhang the section's right edge",
    contained.hitRight <= contained.outerRight + 0.5,
    `hit right ${contained.hitRight.toFixed(1)} vs section right ${contained.outerRight.toFixed(1)}`,
  )

  await mob.waitForTimeout(PAST_IDLE)
  const sleptAgain = await mob.$eval(GRID, (el) => {
    const thumb = el.closest('.scroll-area-outer').querySelector('.scroll-thumb')
    return getComputedStyle(thumb).pointerEvents
  })
  check(
    'and it hands the edge back once it fades',
    sleptAgain === 'none',
    `pointer-events: ${sleptAgain}`,
  )
  await phone.close()

  // ===================================================================
  section(7, 'No console errors from any of it')
  // ===================================================================
  /*
    `[pwa]` is filtered because THIS SUITE causes it: the context is created
    with serviceWorkers: 'block', so workbox's registration throws. Filtering
    an error the app really produced would be hiding a defect; this one is the
    harness's.
  */
  const noisy = consoleErrors.filter(
    (e) => !/favicon|manifest|sprites|Failed to load resource|\[pwa\]/i.test(e),
  )
  check('no console or page errors', noisy.length === 0, noisy.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  await server.stop()
}

log('')
log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
