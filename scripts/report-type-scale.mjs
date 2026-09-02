/**
 * Print every font size the app uses, and where to change it.
 *
 * WHY THIS IS A SCRIPT. The app has two type systems and a list written by hand
 * would be wrong within a week:
 *
 *   the tokens        --font-size-* in src/design-tokens.css, fixed px, used by
 *                     every screen except one.
 *   the species page  a proportional reproduction of its Figma frame, where every
 *                     size is `raw units x --dp-u x --dp-s` and therefore depends
 *                     on how wide the page is. See the block comment above
 *                     .species-page in src/modules/pokedex/pokedex.css.
 *
 * So the tokens are read out of the stylesheet and the species page is MEASURED in
 * a real browser at a real width, which is the only way the second table means
 * anything. The RAW column is the number to edit; the px column is what it
 * currently draws at.
 *
 * Run against the dev or preview server:
 *   node scripts/report-type-scale.mjs [url]
 * Default: http://localhost:4183/pokeapp/ (the port the verify suites use).
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4183
const APP_URL = process.argv[2] ?? `http://localhost:${PORT}/pokeapp/`
const OWN_SERVER = process.argv[2] == null

/* ------------------------------------------------------------------ tokens */

const tokens = readFileSync('src/design-tokens.css', 'utf8')
console.log('')
console.log('APP-WIDE TYPE TOKENS — src/design-tokens.css, :root')
console.log('  ' + '-'.repeat(64))
for (const m of tokens.matchAll(/--font-size-([a-z-]+):\s*([^;]+);/g)) {
  console.log(`  --font-size-${m[1]}`.padEnd(38) + m[2].trim())
}
console.log('')
console.log('  Used at these sizes by every module except the species detail page.')

/* ------------------------------------------------- the species page, measured */

let preview = null
if (OWN_SERVER) {
  preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  const deadline = Date.now() + 60000
  for (;;) {
    try {
      if ((await fetch(APP_URL)).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('preview server never became ready')
    await new Promise((r) => setTimeout(r, 250))
  }
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  await page.click('[data-testid="species-row-1"]')
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 60000 })

  /*
    Each row is (label, selector, raw units, which container's unit).

    --dp-u is one raw unit of the PAGE and --hu one of the pinned COLUMN, and they
    come out IDENTICAL -- the column is exactly 737 of the frame's 1860, so
    (page x 737/1860) / 737 is page / 1860 either way. Worth knowing rather than
    worth removing: the two exist because an element cannot query its own
    container, not because the scales differ, so a raw number means the same size
    wherever it is written.
  */
  const ROWS = [
    ['watermark', '.species-hero-ghost', 389, 'hu'],
    ['katakana', '.species-hero-kana', 111, 'hu'],
    ['hero name', '.species-hero-name', 66, 'hu'],
    ['hero romanisation', '.species-hero-roma', 52, 'hu'],
    ['region label', '.species-hero-region', 43, 'hu'],
    ['banner dex number', '.species-banner-number', 43, 'dp'],
    ['banner name', '.species-banner-name', 66, 'dp'],
    ['banner genus', '.species-banner-genus', 40, 'dp'],
    ['banner type row', '.species-banner-types .ds-type', 26, 'dp'],
    ['sub-nav tab', '.species-page-subnav .ds-tab', 33, 'dp'],
    ['stat-row label', '.ds-stat-label', 26, 'dp'],
    ['stat-row value', '.ds-stat-value', 22, 'dp'],
    ['gender legend', '.species-gender-legend', 18, 'dp'],
    ['section heading', '.species-info-heading', 26, 'dp'],
    ['base-stat row', '.species-stat-bars li', 26, 'dp'],
    ['type-effectiveness row', '.type-matchup-tier', 26, 'dp'],
    ['caption / note', '.species-info-caption', 22, 'dp'],
    ['table header', '.data-table-sort', 26, 'dp'],
    ['table cell', '.data-table td', 30, 'dp'],
  ]

  const read = (rows) =>
    page.evaluate((r) => {
      const inner = getComputedStyle(document.querySelector('.species-page-inner'))
      const out = {
        pageWidth: Math.round(
          document.querySelector('.species-page').getBoundingClientRect().width,
        ),
        scale: inner.getPropertyValue('--dp-s').trim(),
        sizes: {},
      }
      for (const [label, sel] of r) {
        const el = document.querySelector(sel)
        out.sizes[label] = el ? Number(getComputedStyle(el).fontSize.replace('px', '')) : null
      }
      return out
    }, rows)

  /*
    TWO PASSES, because no single tab holds every role. The Info tab has the stat
    rows, the charts and the captions; the DataTable rows only exist on Learnset
    (and on Info once the locations section has been scrolled to, which is not
    worth waiting for here). One tab is mounted at a time, so this reads Info,
    then Learnset, and keeps whichever pass found each role.
  */
  const measured = await read(ROWS)
  await page.click('[data-testid="species-page-subnav"] .ds-tab:text-is("Learnset")')
  await page.waitForSelector('.data-table td', { timeout: 60000 })
  const onLearnset = await read(ROWS)
  for (const [label, px] of Object.entries(onLearnset.sizes)) {
    if (measured.sizes[label] == null) measured.sizes[label] = px
  }

  const dpu = measured.pageWidth / 1860

  console.log('')
  console.log('SPECIES DETAIL PAGE — src/modules/pokedex/pokedex.css')
  console.log(`  frame 1860 x 1172 raw units, drawn ${measured.pageWidth}px wide`)
  console.log(`  --dp-s (the one type knob) = ${measured.scale}`)
  console.log(
    `  1 raw unit = ${dpu.toFixed(4)}px of layout, ${(dpu * Number(measured.scale)).toFixed(4)}px of type`,
  )
  console.log('  ' + '-'.repeat(64))
  console.log('  ' + 'role'.padEnd(26) + 'RAW'.padStart(5) + '  unit'.padEnd(7) + '   px now')
  console.log('  ' + '-'.repeat(64))
  for (const [label, , raw, unit] of ROWS) {
    const px = measured.sizes[label]
    console.log(
      '  ' +
        label.padEnd(26) +
        String(raw).padStart(5) +
        '  ' +
        (unit === 'hu' ? 'column' : 'panel').padEnd(7) +
        (px == null ? '   (absent)' : `   ${px.toFixed(1)}`),
    )
  }
  console.log('  ' + '-'.repeat(64))
  console.log('  RAW is the number to edit. --dp-s scales all of them at once.')
  console.log('  The page also stops growing at 1400px, or sooner on a short window.')
  console.log('')
} finally {
  await browser.close()
  preview?.kill()
}
