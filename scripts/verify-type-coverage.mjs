/**
 * Type Coverage, driven in a real browser.
 *
 * Nine sections, one per item on the request this module was built from. It
 * asserts RELATIONS and MEASURED values rather than pixels wherever it can --
 * "the dark row highlight differs from the page ground" survives a token change,
 * "#1c1c1e" does not.
 *
 * Run: node scripts/verify-type-coverage.mjs [baseUrl]
 */

import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5199/pokeapp/'
const results = []
let failures = 0

function check(section, name, pass, detail = '') {
  results.push({ section, name, pass, detail })
  if (!pass) failures += 1
  const mark = pass ? 'ok  ' : 'FAIL'
  console.log(`  ${mark} ${name}${detail ? ` -- ${detail}` : ''}`)
}

function section(n, title) {
  console.log(`\n== ${n}. ${title}`)
  return n
}

/** Opens Pokepedia's dropdown and clicks the Type Coverage entry. */
async function openModule(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="dex-switcher"], .nav-trigger, .panel', {
    timeout: 20000,
  })
  /* The dex entries live inside the Pokepedia tab's dropdown, which is closed on
     load -- so the trigger has to be opened before the entry is clickable. */
  const entry = page.locator('[data-testid="nav-type-coverage"]')
  if (!(await entry.isVisible().catch(() => false))) {
    /* The group opens on mouseenter (NavGroup), not on a trigger click -- the
       trigger click is reserved for the tab's own destination. */
    await page.locator('[data-testid="nav-group-pokepedia"]').hover()
    await entry.waitFor({ state: 'visible', timeout: 10000 })
  }
  await entry.click()
  /* Move the pointer off the nav, or the dropdown stays open (it closes on
     mouseleave) and covers the controls every later section clicks. */
  await page.mouse.move(1200, 700)
  await page.waitForSelector('.tc', { timeout: 20000 })
  await page.waitForSelector('[data-testid="tc-matrix-count"]')
}

const setTheme = (page, theme) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)

const tabNames = (page) =>
  page.$$eval('.tc-subnav .ds-tab', (els) => els.map((e) => e.textContent.trim()))

const rowCount = (page) => page.locator('[data-testid="tc-row"]').count()

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  await openModule(page)

  // ---------------------------------------------------------------- 1. By Type
  section(1, '"By type" is gone')
  const tabs = await tabNames(page)
  check(1, 'no tab is named "By type"', !tabs.some((t) => /by\s*type/i.test(t)), tabs.join(' | '))
  const bodyText = await page.locator('.tc').innerText()
  check(1, 'the phrase does not appear on the page', !/by\s+type/i.test(bodyText))

  // -------------------------------------------------------------- 2. Tab order
  section(2, 'tab order is Matrix | Flow | Against | Card')
  check(2, 'exact order', tabs.join('|') === 'Matrix|Flow|Against|Card', tabs.join(' | '))
  const activeTab = await page.locator('.tc-subnav .ds-tab[aria-selected="true"]').innerText()
  check(2, 'Matrix is the default tab', activeTab.trim() === 'Matrix', activeTab.trim())

  // --------------------------------------------------------------- 3. Standard
  section(3, 'Toggle A = Standard hides B, C and the filter')
  await page.locator('[data-testid="tc-toggle-layout-standard"]').click()
  check(
    3,
    'Toggle B hidden',
    (await page.locator('[data-testid="tc-toggle-depth"]').count()) === 0,
  )
  check(
    3,
    'Toggle C hidden',
    (await page.locator('[data-testid="tc-toggle-existence"]').count()) === 0,
  )
  check(3, 'type filter hidden', (await page.locator('[data-testid="tc-type-filter"]').count()) === 0)

  const stdRows = await rowCount(page)
  const stdCols = await page.locator('.tc-table thead th.tc-col-head').count()
  /* Attacking down the side: every row header is a type NAME, not a combo. */
  const stdRowHeads = await page.$$eval('.tc-table tbody th.tc-row-head', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    3,
    'rows are the 17 attacking types',
    stdRows === 17 && stdRowHeads.length === 17,
    `${stdRows} rows`,
  )
  /*
    THE FULL TYPE SYSTEM ON BOTH AXES, not the subset something happens to have
    mono-typed. Nothing in Gen 1-4 is pure Flying, so an existence-pruned
    "traditional" chart would be 16 columns here and 11 in Gen 1 -- see the note
    in TypeMatrixView for why that reading was rejected.
  */
  check(3, 'columns are the full 17 defending types', stdCols === 17, `${stdCols} cols`)
  const stdColNames = await page.$$eval('.tc-table thead th.tc-col-head', (els) =>
    els.map((e) => e.dataset.testid),
  )
  check(
    3,
    'Flying is a defending column despite no pure-Flying species existing',
    stdColNames.includes('tc-col-flying'),
  )
  check(
    3,
    'no row header is a dual-type combo',
    (await page.locator('.tc-table th.tc-row-head-combo').count()) === 0,
  )
  /* Existing-only: no row may be marked as a combination nothing has. */
  check(
    3,
    'no non-existing combination is shown',
    (await page.locator('.tc-table th[data-exists="false"]').count()) === 0,
  )

  // ----------------------------------------------------------------- 4. Custom
  section(4, 'Toggle A = Custom shows B, C and the filter, and resets on return')
  await page.locator('[data-testid="tc-toggle-layout-custom"]').click()
  check(4, 'Toggle B visible', (await page.locator('[data-testid="tc-toggle-depth"]').count()) === 1)
  check(
    4,
    'Toggle C visible',
    (await page.locator('[data-testid="tc-toggle-existence"]').count()) === 1,
  )
  check(4, 'type filter visible', (await page.locator('[data-testid="tc-type-filter"]').count()) === 1)

  const activeOf = (testId) =>
    page.getAttribute(`[data-testid="${testId}"]`, 'data-active').then((v) => v === 'true')
  check(4, 'B defaults to Full', await activeOf('tc-toggle-depth-full'))
  check(4, 'C defaults to Existing', await activeOf('tc-toggle-existence-existing'))

  /* Move both OFF their defaults, round-trip through Standard, and require the
     defaults back -- the explicit "do not preserve prior values" requirement. */
  await page.locator('[data-testid="tc-toggle-depth-single"]').click()
  await page.locator('[data-testid="tc-toggle-existence-all"]').click()
  await page.locator('[data-testid="tc-type-filter-water"]').click()
  check(4, 'B moved to Single before the round trip', await activeOf('tc-toggle-depth-single'))
  check(4, 'C moved to All before the round trip', await activeOf('tc-toggle-existence-all'))

  await page.locator('[data-testid="tc-toggle-layout-standard"]').click()
  await page.locator('[data-testid="tc-toggle-layout-custom"]').click()
  check(4, 'B is back to Full after the round trip', await activeOf('tc-toggle-depth-full'))
  check(4, 'C is back to Existing after the round trip', await activeOf('tc-toggle-existence-all') === false)
  check(
    4,
    'the type filter cleared with them',
    (await page.getAttribute('[data-testid="tc-type-filter-water"]', 'data-on')) === 'false',
  )

  // -------------------------------------------------------------- 5. Transpose
  section(5, 'Custom really is the transpose of Standard')
  /* One cell, read in both orientations. Ice attacking Ground must agree. */
  await page.locator('[data-testid="tc-toggle-layout-standard"]').click()
  const stdIceOnGround = await page.evaluate(() => {
    const row = document.querySelector('th[data-testid="tc-row-ice"]')?.parentElement
    const heads = [...document.querySelectorAll('.tc-table thead th.tc-col-head')]
    const i = heads.findIndex((h) => h.dataset.testid === 'tc-col-ground')
    const cells = [...row.querySelectorAll('td')]
    return { m: cells[i]?.dataset.m, title: cells[i]?.getAttribute('title') }
  })
  await page.locator('[data-testid="tc-toggle-layout-custom"]').click()
  await page.locator('[data-testid="tc-toggle-depth-single"]').click()
  const customIceOnGround = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.tc-table thead th.tc-col-head')]
    const i = heads.findIndex((h) => h.dataset.testid === 'tc-col-ice')
    const row = [...document.querySelectorAll('.tc-table tbody tr')].find((r) =>
      r.querySelector('th')?.textContent.trim().toLowerCase().startsWith('ground'),
    )
    const cells = [...row.querySelectorAll('td')]
    return { m: cells[i]?.dataset.m, title: cells[i]?.getAttribute('title') }
  })
  check(
    5,
    'Ice on Ground is 2x in Standard',
    stdIceOnGround.m === '2',
    `${stdIceOnGround.m} (${stdIceOnGround.title})`,
  )
  check(
    5,
    'Ice on Ground is 2x in Custom too',
    customIceOnGround.m === '2',
    `${customIceOnGround.m} (${customIceOnGround.title})`,
  )
  /* Axis labels must have swapped, which is what "transposed" means. */
  const customCols = await page.$$eval('.tc-table thead th.tc-col-head', (els) =>
    els.map((e) => e.dataset.testid),
  )
  check(
    5,
    'Custom columns are the attacking axis',
    customCols.includes('tc-col-ice') && customCols.length === 17,
  )
  const corner = await page.locator('.tc-corner').innerText()
  check(5, 'corner names the orientation', /defending/.test(corner) && /attacking/.test(corner), corner.trim())

  /* 4x and 1/4x exist only once a defender can hold two types. */
  await page.locator('[data-testid="tc-toggle-depth-full"]').click()
  const quad = await page.locator('.tc-table td[data-m="4"]').count()
  const quarter = await page.locator('.tc-table td[data-m="0.25"]').count()
  check(5, 'Full shows 4x cells', quad > 0, `${quad} cells at 4x`)
  check(5, 'Full shows 1/4x cells', quarter > 0, `${quarter} cells at 0.25x`)

  // ------------------------------------------------------------ 6. Dark hover
  section(6, 'dark theme row highlight')
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme)
    const row = page.locator('[data-testid="tc-row"]').first()
    const cell = row.locator('td').first()
    const ground = await page.$eval('.tc-matrix-scroll', (e) =>
      getComputedStyle(e).backgroundColor,
    )
    /* Park the pointer off the table first. Without this the previous theme's
       row.hover() is still in effect and "before" reads as already-highlighted,
       which hides a real regression behind a passing equality. */
    await page.mouse.move(4, 4)
    await page.waitForTimeout(60)
    const before = await cell.evaluate((e) => getComputedStyle(e).backgroundColor)
    await row.hover()
    const after = await cell.evaluate((e) => getComputedStyle(e).backgroundColor)
    check(
      6,
      `${theme}: hover changes the row`,
      before !== after,
      `${before} -> ${after}`,
    )
    /* The actual bug: painting a colour identical to the page is not a highlight. */
    check(6, `${theme}: highlight differs from the page ground`, after !== ground, `row ${after} vs page ${ground}`)

    /* ONE ROW ONLY -- the next row must stay unpainted. */
    const neighbour = await page
      .locator('[data-testid="tc-row"]')
      .nth(1)
      .locator('td')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor)
    check(6, `${theme}: the neighbouring row is untouched`, neighbour !== after, `neighbour ${neighbour}`)

    /* And it must be a grey, not a tinted colour: r == g == b within a hair. */
    const rgb = after.match(/\d+/g).map(Number)
    const grey = Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) <= 4
    check(6, `${theme}: the highlight is a grey`, grey, after)
    if (theme === 'dark') {
      const lum = rgb.slice(0, 3).reduce((a, b) => a + b, 0) / 3
      check(6, 'dark: the highlight is a DARK grey', lum < 90, `mean channel ${lum.toFixed(0)}`)
    }
  }
  await setTheme(page, 'light')

  // ------------------------------------------------------ 7. Frozen headers
  section(7, 'column headers freeze on vertical scroll')
  await page.locator('[data-testid="tc-toggle-existence-all"]').click()
  const fullRows = await rowCount(page)
  check(7, 'Custom + Full + All is a long matrix', fullRows === 153, `${fullRows} rows`)

  const box = await page.$('.tc-matrix-scroll')
  const scrollable = await box.evaluate((e) => e.scrollHeight - e.clientHeight)
  check(7, 'the matrix box is its own scroller', scrollable > 200, `${scrollable}px of overflow`)

  const headBefore = await page.$eval('.tc-table thead th.tc-col-head', (e) =>
    e.getBoundingClientRect().top,
  )
  await box.evaluate((e) => e.scrollTo({ top: 1200 }))
  await page.waitForTimeout(120)
  const headAfter = await page.$eval('.tc-table thead th.tc-col-head', (e) =>
    e.getBoundingClientRect().top,
  )
  const boxTop = await box.evaluate((e) => e.getBoundingClientRect().top)
  check(
    7,
    'the header row stays pinned while the rows scroll under it',
    Math.abs(headAfter - headBefore) <= 2 && Math.abs(headAfter - boxTop) <= 2,
    `top ${headBefore.toFixed(0)} -> ${headAfter.toFixed(0)}, box at ${boxTop.toFixed(0)}`,
  )
  /* The header must be painting over the rows, not letting them show through. */
  const headBg = await page.$eval('.tc-table thead th.tc-col-head', (e) =>
    getComputedStyle(e).backgroundColor,
  )
  check(7, 'the pinned header is opaque', !/rgba\(0, 0, 0, 0\)/.test(headBg), headBg)

  /* Row headers freeze on the horizontal axis -- kept deliberately, so asserted
     rather than left to chance. */
  const rowHeadBefore = await page.$eval('.tc-table tbody th.tc-row-head', (e) =>
    e.getBoundingClientRect().left,
  )
  await box.evaluate((e) => e.scrollTo({ left: 400 }))
  await page.waitForTimeout(120)
  const rowHeadAfter = await page.$eval('.tc-table tbody th.tc-row-head', (e) =>
    e.getBoundingClientRect().left,
  )
  check(
    7,
    'row headers stay put horizontally (deliberate, kept)',
    Math.abs(rowHeadAfter - rowHeadBefore) <= 2,
    `left ${rowHeadBefore.toFixed(0)} -> ${rowHeadAfter.toFixed(0)}`,
  )
  await box.evaluate((e) => e.scrollTo({ top: 0, left: 0 }))

  /* The count line and the legend must not state tautologies. */
  await page.locator('[data-testid="tc-toggle-existence-existing"]').click()
  const countExisting = await page.locator('[data-testid="tc-matrix-count"]').innerText()
  check(
    7,
    'under Existing the count does not say "of them exist"',
    !/of them exist/.test(countExisting),
    countExisting.trim(),
  )
  check(
    7,
    'under Existing the dimmed-row legend is absent',
    !/dimmed row/.test(await page.locator('.tc-legend').innerText()),
  )
  await page.locator('[data-testid="tc-toggle-existence-all"]').click()
  check(
    7,
    'under All it does say how many exist',
    /of them exist/.test(await page.locator('[data-testid="tc-matrix-count"]').innerText()),
  )
  check(
    7,
    'under All the dimmed-row legend is present',
    /dimmed row/.test(await page.locator('.tc-legend').innerText()),
  )

  // ---------------------------------------------------------- 8. Type filter
  section(8, 'the type filter narrows rows only')
  await page.locator('[data-testid="tc-toggle-existence-existing"]').click()
  const colsBefore = await page.locator('.tc-table thead th.tc-col-head').count()
  const rowsBefore = await rowCount(page)
  await page.locator('[data-testid="tc-type-filter-water"]').click()
  const rowsAfter = await rowCount(page)
  const colsAfter = await page.locator('.tc-table thead th.tc-col-head').count()
  check(8, 'rows are narrowed', rowsAfter < rowsBefore, `${rowsBefore} -> ${rowsAfter} rows`)
  check(8, 'columns are untouched', colsAfter === colsBefore, `${colsBefore} -> ${colsAfter} cols`)
  /* Every surviving row must carry the picked type, in either slot. */
  const offAxis = await page.$$eval('.tc-table tbody th.tc-row-head', (els) =>
    els.map((e) => e.textContent.toLowerCase()).filter((t) => !t.includes('water')).length,
  )
  check(8, 'every remaining row holds the picked type', offAxis === 0, `${offAxis} rows without it`)
  await page.locator('[data-testid="tc-type-filter-clear"]').click()
  check(8, 'clearing restores the rows', (await rowCount(page)) === rowsBefore)

  // ------------------------------------------------------- 9. Local generation
  section(9, 'the page generation selector is independent of the app selector')
  /* The app-wide game selector lives inside the app bar's controls disclosure,
     which is closed by default -- it has to be opened to be driven. */
  const appSelect = page.locator('[data-testid="vg-select"]')
  if (!(await appSelect.isVisible().catch(() => false))) {
    await page.locator('[data-testid="controls-toggle"]').click()
    await appSelect.waitFor({ state: 'visible', timeout: 10000 })
  }
  const appBefore = await appSelect.inputValue()

  /* Existing combos really change with THIS page's selector. */
  const gen4Rows = await rowCount(page)
  await page.locator('[data-testid="tc-generation-1"]').click()
  const gen1Rows = await rowCount(page)
  const gen1Cols = await page.locator('.tc-table thead th.tc-col-head').count()
  check(9, 'Gen 1 has 15 attacking types, not 17', gen1Cols === 15, `${gen1Cols} cols`)
  check(9, 'existing combinations change with the page selector', gen1Rows !== gen4Rows, `gen4 ${gen4Rows} rows -> gen1 ${gen1Rows} rows`)

  const appAfter = await appSelect.inputValue()
  check(9, 'the app selector did NOT move', appAfter === appBefore, `${appBefore} -> ${appAfter}`)

  /* And the reverse: moving the app selector must not move this page's. */
  const options = await appSelect.evaluate((el) =>
    [...el.options].map((o) => o.value).filter((v) => v && v !== 'all'),
  )
  const other = options.find((o) => o !== appBefore)
  if (other) {
    await appSelect.selectOption(other)
    await page.waitForTimeout(200)
    const stillGen1 = await page.getAttribute('[data-testid="tc-generation-1"]', 'data-active')
    check(9, 'the page stayed on Gen 1 when the app selector moved', stillGen1 === 'true', `app now ${other}`)
    /* Gen 1's chart is genuinely its own -- the page must still be showing it. */
    const cols = await page.locator('.tc-table thead th.tc-col-head').count()
    check(9, 'the page is still rendering the Gen 1 chart', cols === 15, `${cols} cols`)
  } else {
    check(9, 'a second app selection was available to test with', false, 'none found')
  }

  /* Close the disclosure again -- it overlays the module's own controls. */
  await page.locator('[data-testid="controls-toggle"]').click()
  await page.mouse.move(4, 4)

  /* Gen 1's own oddity, as a real era check: Ghost does nothing to Psychic. */
  await page.locator('[data-testid="tc-toggle-layout-standard"]').click()
  const ghostOnPsychic = await page.evaluate(() => {
    const row = document.querySelector('th[data-testid="tc-row-ghost"]')?.parentElement
    const heads = [...document.querySelectorAll('.tc-table thead th.tc-col-head')]
    const i = heads.findIndex((h) => h.dataset.testid === 'tc-col-psychic')
    return [...row.querySelectorAll('td')][i]?.dataset.m
  })
  check(9, 'Gen 1: Ghost does 0x to Psychic (the famous bug, faithfully)', ghostOnPsychic === '0', `${ghostOnPsychic}x`)

  // ----------------------------------------------------------- other tabs live
  section(10, 'the other three tabs still render')
  for (const [tab, selector, testId] of [
    ['Flow', '.tc-flow-row', 'tc-flow-normal'],
    ['Against', '.tc-against-table tbody tr', 'tc-against-normal'],
    ['Card', '.tc-card', 'tc-card-normal'],
  ]) {
    await page.locator('.tc-subnav .ds-tab', { hasText: tab }).click()
    await page.waitForSelector(selector)
    const n = await page.locator(selector).count()
    check(10, `${tab} renders its rows`, n === 15, `${n} rows in Gen 1`)
    check(10, `${tab} keeps its named row`, (await page.locator(`[data-testid="${testId}"]`).count()) === 1)
  }

  /*
    NO LABEL IN A CARD TILE MAY WRAP. "2x from" wrapped onto two lines on every
    tile once, because the label was set in Martian Mono -- which draws about a
    fifth wider than Plex Sans at the same px -- and overran its 46px track. A
    wrapped label pushes every row below it out of alignment, so this measures
    the rendered height against one line of the module's own leading.
  */
  const wrapped = await page.$$eval('.tc-card-line-label', (els) =>
    els.filter((e) => e.getBoundingClientRect().height > 20).length,
  )
  check(10, 'no Card tile label wraps to a second line', wrapped === 0, `${wrapped} wrapped`)

  // ---------------------------------------------------------------- app rules
  section(11, 'app-wide rules this module must not break')
  const shadows = await page.evaluate(() =>
    [...document.querySelectorAll('.tc, .tc *')].filter(
      (e) => getComputedStyle(e).boxShadow !== 'none',
    ).length,
  )
  check(11, 'no box-shadow anywhere in the module', shadows === 0, `${shadows} elements`)

  const reachable = await page.evaluate(() => {
    const sa = document.querySelector('[data-testid="tc-scroll-area"]')
    return !!sa
  })
  check(11, 'the module root contains a ScrollArea', reachable)

  const real = consoleErrors.filter((e) => !/favicon|raw\.githubusercontent|sprites/i.test(e))
  check(11, 'no console errors', real.length === 0, real.slice(0, 2).join(' | '))

  /*
    NOTHING MAY BE CLIPPED, at the widths this app is actually reviewed on.
    #root is pinned to the viewport and .panel clips, so an element past the
    right edge is UNREACHABLE rather than merely ugly -- neither the page nor
    the panel scrolls sideways to reach it. The generation segments ran 15px off
    a 360px viewport once, which put "Gen 4" outside the app with no way to
    press it. The matrix's own scroller is excluded: it is meant to scroll.
  */
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.waitForTimeout(150)
    const clipped = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelector('.tc').querySelectorAll('*')) {
        if (el.closest('.tc-matrix-scroll')) continue
        if (el.getBoundingClientRect().right > window.innerWidth + 1) out.push(el.className)
      }
      const last = document.querySelector('[data-testid="tc-generation-4"]').getBoundingClientRect()
      return { out: out.slice(0, 3), lastReachable: last.right <= window.innerWidth + 1 }
    })
    check(11, `nothing is clipped at ${width}px`, clipped.out.length === 0, clipped.out.join(', '))
    check(11, `the last generation option is reachable at ${width}px`, clipped.lastReachable)
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  await browser.close()

  console.log(
    `\n${results.length - failures}/${results.length} checks passed${
      failures ? ` -- ${failures} FAILED` : ''
    }`,
  )
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
