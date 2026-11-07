/**
 * Pixel comparison of the SIGNED-OFF screens, for any change that could reach them
 * through a global value (tokens, fonts, base CSS).
 *
 *   node scripts/compare-frozen.mjs capture <dir>      screenshots, light and dark
 *   node scripts/compare-frozen.mjs compare <a> <b>    exit 1 if any pixel differs
 *
 * Capture on the base, capture on the change, compare. The screens are the Team
 * Display, the Team Library and the Build Form, each from the same seeded document
 * (three Gen 4 Builds with moves, items and abilities, in one team), at a fixed
 * 1600x1100 viewport, in each colour scheme. A difference reports its pixel count and
 * bounding box per screen. CLAUDE.md: a frozen screen may not change by one pixel
 * without the owner asking.
 */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'

const PORT = 4210
const [cmd, a, b] = process.argv.slice(2)
const SCREENS = ['team-display', 'team-library', 'build-form']
const THEMES = ['light', 'dark']

async function capture(dir) {
  mkdirSync(dir, { recursive: true })
  const dev = await startDevServer({ port: PORT })
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block', colorScheme: theme })
      context.setDefaultNavigationTimeout(180000)
      const page = await context.newPage()
      await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="boot-status"]', { timeout: 180000 })
      // A cold dev server can reload once while it optimises dependencies: wait until
      // the data layer answers before reading it.
      await page.waitForFunction(
        async () => {
          try {
            const data = await import('/pokeapp/src/data/index.ts')
            return data.listMoves().length > 0
          } catch {
            return false
          }
        },
        null,
        { timeout: 180000, polling: 1000 },
      )
      const ids = await page.evaluate(async () => {
        const data = await import('/pokeapp/src/data/index.ts')
        const move = Object.fromEntries(data.listMoves().map((m) => [m.name, m.id]))
        const item = Object.fromEntries(data.listItems().map((i) => [i.name, i.id]))
        return {
          moves: [move['earthquake'], move['dragon-claw'], move['swords-dance'], move['stone-edge']],
          moves2: [move['thunderbolt'], move['volt-tackle'], move['quick-attack'], move['iron-tail']],
          moves3: [move['shadow-ball'], move['focus-blast'], move['sludge-bomb'], move['thunderbolt']],
          item: item['choice-scarf'] ?? null,
          item2: item['light-ball'] ?? null,
          item3: item['life-orb'] ?? null,
        }
      })
      const build = (id, speciesId, moveIds, itemId, nickname) => ({
        id, generation: 4, speciesId, pokemonId: speciesId, nickname, gender: 'male', shiny: false, level: 50,
        friendship: 70, itemId, abilityId: null, natureId: null, moveIds, effort: { attack: 252, speed: 252, hp: 4 },
        individual: { hp: 31, attack: 31, defense: 31, 'special-attack': 31, 'special-defense': 31, speed: 31 }, tags: [], notes: '',
      })
      await page.evaluate((doc) => {
        localStorage.setItem('pokeapp:team-builder:v1', JSON.stringify(doc))
        localStorage.removeItem('pokeapp:theme')
      }, {
        nextBuildSeq: 4,
        nextTeamSeq: 2,
        builds: [
          build('b1', 445, ids.moves, ids.item, 'Chomp'),
          build('b2', 25, ids.moves2, ids.item2, ''),
          build('b3', 94, ids.moves3, ids.item3, 'Ghost'),
        ],
        teams: [{ id: 't1', seq: 1, generation: 4, versionGroup: 'platinum', name: 'Frozen check', memberIds: ['b1', 'b2', 'b3', null, null, null], notes: '' }],
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('[data-testid="boot-status"]', { timeout: 180000 })
      const nav = async (id) => {
        await page.hover('[data-testid="nav-tab-team-building"]')
        await page.waitForSelector('[data-testid="nav-dropdown-team-building"]', { state: 'visible' })
        await page.click(`[data-testid="nav-${id}"]`)
        await page.mouse.move(2, 1090)
      }
      const shot = async (name, selector) => {
        const el = await page.waitForSelector(selector)
        await page.evaluate(() => document.fonts.ready)
        /* IMAGES ARE HIDDEN, in both captures. A control (the same code captured
           twice) differed by up to 65,892 pixels on the Team Display: animated
           sprites change frame. visibility: hidden keeps every image's box, so the
           layout is still compared exactly; only the bitmaps are left out, and no
           token or CSS change can alter a sprite's pixels anyway. */
        await page.addStyleTag({ content: `${selector} img, ${selector} picture, ${selector} canvas, ${selector} video { visibility: hidden !important; }` })
        await page.waitForTimeout(1500)
        await el.screenshot({ path: join(dir, `${name}-${theme}.png`), animations: 'disabled' })
      }
      await nav('my-teams')
      await shot('team-library', '[data-testid="tb-my-teams"]')
      await page.click('[data-testid="tb-team-t1-open"]')
      await shot('team-display', '[data-testid="tb-team-viewer"]')
      await nav('build-library')
      await page.waitForSelector('[data-testid="tb-build-grid"]')
      await page.click('[data-testid="tb-build-b1-open"]')
      await shot('build-form', '[data-testid="tb-build-form"]')
      await context.close()
    }
    console.log(`captured ${SCREENS.length * THEMES.length} screenshots in ${dir}`)
  } finally {
    await browser.close()
    await dev.stop?.()
  }
}

async function compare(dirA, dirB) {
  const browser = await chromium.launch({ channel: 'chrome' })
  let changed = 0
  try {
    const page = await browser.newPage()
    for (const file of readdirSync(dirA).filter((f) => f.endsWith('.png')).sort()) {
      const [x, y] = [dirA, dirB].map((d) => `data:image/png;base64,${readFileSync(join(d, file)).toString('base64')}`)
      const r = await page.evaluate(async ([x, y]) => {
        const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })
        const [ia, ib] = await Promise.all([load(x), load(y)])
        if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` }
        const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data }
        const [pa, pb] = [px(ia), px(ib)]
        let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
        for (let i = 0; i < pa.length; i += 4) {
          if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
            n++
            const p = i / 4, px_ = p % ia.width, py = Math.floor(p / ia.width)
            x0 = Math.min(x0, px_); y0 = Math.min(y0, py); x1 = Math.max(x1, px_); y1 = Math.max(y1, py)
          }
        }
        return { n, box: n ? `${x0},${y0} to ${x1},${y1}` : '', size: `${ia.width}x${ia.height}` }
      }, [x, y])
      const same = r.n === 0
      if (!same) changed++
      console.log(`  ${same ? 'SAME' : 'DIFF'}  ${file}  ${r.size}${r.n ? `  ${r.n} pixels, ${r.box}` : ''}`)
    }
  } finally {
    await browser.close()
  }
  console.log(changed ? `${changed} screenshot(s) differ` : 'every frozen screen is pixel-identical')
  process.exit(changed ? 1 : 0)
}

if (cmd === 'capture' && a) await capture(a)
else if (cmd === 'compare' && a && b) await compare(a, b)
else {
  console.error('usage: node scripts/compare-frozen.mjs capture <dir> | compare <dirA> <dirB>')
  process.exit(1)
}
