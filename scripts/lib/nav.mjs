/**
 * Shared Playwright helpers for the top-level nav.
 *
 * The nav is three tabs, each opening a dropdown: Poképedia (the six dex
 * modules), Team Building and Tools. A dex is therefore never a top-level
 * button -- reaching one means opening its tab first, and its item is
 * `display: none` until then, so a direct click cannot work.
 *
 * Defined once here rather than inline per suite: the tab structure is expected
 * to keep changing, and last time it changed the same hover-then-click dance had
 * to be edited in eight files.
 */

/** Tab trigger test ids, keyed by the tab slug in navConfig.ts. */
export const TAB = {
  pokepedia: '[data-testid="nav-tab-pokepedia"]',
  teamBuilding: '[data-testid="nav-tab-team-building"]',
  tools: '[data-testid="nav-tab-tools"]',
}

/** Open one tab's dropdown and wait for it to actually be on screen. */
export async function openTab(page, slug) {
  await page.hover(`[data-testid="nav-tab-${slug}"]`)
  await page.waitForSelector(`[data-testid="nav-dropdown-${slug}"]`, {
    state: 'visible',
    timeout: 15000,
  })
}

/** Navigate to a dex module by its registry id. */
export async function goToDex(page, id) {
  await openTab(page, 'pokepedia')
  await page.click(`[data-testid="nav-${id}"]`)
}

/** Navigate to any nav destination: dex module or stub page. */
export async function goToPage(page, slug, id) {
  await openTab(page, slug)
  await page.click(`[data-testid="nav-${id}"]`)
}
