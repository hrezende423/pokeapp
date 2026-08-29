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
