/**
 * The browser every suite drives: the SYSTEM Google Chrome, through Playwright's
 * `channel: 'chrome'`. Never Playwright's bundled browser, whose build number moves
 * with each Playwright upgrade (a missing one blocked seven suites on 2026-11-06).
 */
export const CHROME = { channel: 'chrome' }

/** null when Chrome starts; otherwise the first line of why it did not. */
export async function browserPreflight() {
  const { chromium } = await import('playwright')
  try {
    const browser = await chromium.launch(CHROME)
    await browser.close()
    return null
  } catch (e) {
    return String(e?.message ?? e).split('\n')[0]
  }
}

export const CHROME_HELP =
  "The verify suites drive the system Google Chrome (Playwright channel 'chrome').\n" +
  'Install it from https://www.google.com/chrome/ (or repair it), then rerun.\n' +
  "Nothing else needs installing: the suites never use Playwright's bundled browser."
