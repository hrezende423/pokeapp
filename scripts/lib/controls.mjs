/**
 * Shared Playwright helpers for the app bar's controls panel.
 *
 * The simplification pass moved every persistent control -- the cross-dex
 * search, the species name filter, the type filter and the game selector --
 * behind one toggle at the bar's top right. Playwright reads (textContent,
 * $eval, inputValue) still work on hidden elements, but actions (click, fill,
 * selectOption, focus) require visibility, so any suite that drives a control
 * has to open the panel first.
 *
 * That logic lived inline in all eight verify scripts, which meant a UI change
 * of this shape rippled into eight files. It lives here now: one definition,
 * one place to fix.
 *
 * The panel is a disclosure, not a menu -- it stays open until its own button
 * closes it. `withControls` therefore restores whatever state it found rather
 * than assuming closed, so a suite that deliberately leaves the panel open
 * (verify-search's setTerm) is not fighting its own helper. Leaving it open
 * unconditionally is not an option either: the panel floats over the page and
 * would intercept clicks meant for the module underneath.
 */

const PANEL = '[data-testid="app-controls"]'
const TOGGLE = '[data-testid="controls-toggle"]'

/* vg-select is the one control present on every module, so its visibility is
   what "the panel is really open" means -- not the toggle's own state. */
const READY = '[data-testid="vg-select"]'

export const controlsOpen = (page) => page.$eval(PANEL, (el) => el.dataset.open === 'true')

export async function openControls(page) {
  if (await controlsOpen(page)) return
  await page.click(TOGGLE)
  await page.waitForSelector(READY, { state: 'visible', timeout: 15000 })
}

export async function closeControls(page) {
  if (!(await controlsOpen(page))) return
  await page.click(TOGGLE)
  await page.waitForTimeout(80)
}

/** Open if needed, run `fn`, then restore the panel to the state it was in. */
export async function withControlsOn(page, fn) {
  const wasOpen = await controlsOpen(page)
  await openControls(page)
  const out = await fn()
  if (!wasOpen) await closeControls(page)
  return out
}

/**
 * Bind every helper to one page, for the seven suites that drive a single page.
 * verify-eggmoves drives several and imports `withControlsOn` directly instead.
 */
export function controls(page) {
  return {
    controlsOpen: () => controlsOpen(page),
    openControls: () => openControls(page),
    closeControls: () => closeControls(page),
    withControls: (fn) => withControlsOn(page, fn),
  }
}

/* ------------------------------------------------------- per-dex controls */

/*
  EVERY DEX'S SEARCH IS IN THE APP BAR NOW. Each one used to carry its own
  ghost-button disclosure above its own list, and the Movedex an always-visible
  row; Pokepedia has ONE Search/Filter menu, so the per-dex openDexControls and
  closeDexControls helpers are deleted rather than shortened -- there is no
  second disclosure left for them to drive.

  WHAT HAS NOT CHANGED IS THE TEST ID: each dex's name filter is still
  `<dex>-search`, so every call site below reads exactly as it did. That was the
  point of letting a filter definition override its own id.

  OPEN, FILL, CLOSE -- in that order, and the close still matters twice over. The
  panel floats over the page, so leaving it open lets it intercept clicks meant
  for the list underneath; and the input stays MOUNTED while hidden (the panel is
  display: none, not unmounted), so the term it holds stays applied after
  closing. That is what makes "filter, then click a row" work at all.
*/

/**
 * Type into a dex's name filter, from wherever the page currently is.
 *
 * Returns to the LIST first if a detail page is open: these dexes are a list
 * page XOR a detail page, and a filter is only built while its dex is the active
 * module -- so asking to type from a detail page is a request to go back and
 * then type, and doing that here rather than at every call site is the point of
 * this module.
 */
export async function fillDexSearch(page, dexId, value) {
  const input = `[data-testid="${dexId}-search"]`
  if ((await page.$('[data-testid="entity-back"]')) != null) {
    await page.click('[data-testid="entity-back"]')
    await page.waitForSelector(`[data-testid="${dexId}-count"]`, { timeout: 15000 })
  }
  /*
    'attached', not the default 'visible': while the panel is closed the input is
    mounted but display: none, and waiting for it to be visible before opening
    the panel is a deadlock.
  */
  await page.waitForSelector(input, { state: 'attached', timeout: 30000 })
  await withControlsOn(page, () => page.fill(input, value))
  await page.waitForTimeout(80)
}
