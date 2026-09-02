/**
 * Resolves the DetailPage frame's type sizes from the real bundled fonts.
 *
 * Same method and same divisor as calibrate-scale.mjs, which resolved the
 * MainPage frames: a text node whose box is W raw units wide, drawn in a face
 * whose advance for that string is `a` em, was set at W/a raw px. Divide by the
 * frame scale (2.23, established there) to get the CSS size the design implies.
 *
 * WHY MEASURED AND NOT READ. get_metadata gives exact positions and box sizes but
 * carries no type properties; get_design_context does, and the Figma MCP hit its
 * Starter-plan call limit before those reads landed. Inverting the advance is not
 * a workaround for that -- it is strictly better for our purposes, because it
 * makes the RENDERED box match Figma's box in the real font, which is the thing
 * the layout depends on. A read fontSize in a face that metric-differs from ours
 * would not.
 *
 * ONLY AUTO-WIDTH NODES CAN BE INVERTED. A hand-sized box says nothing about its
 * type, so the grid cells (labels at a flat 187/254.5, stat values at a flat 65,
 * banner name at 408 beside a genus starting at 319) are excluded -- equal widths
 * for unequal strings is the tell. What is left is genuinely auto-width: the six
 * stat abbreviations, the four tab labels, the two type names, the left column's
 * three name lines and the watermark.
 *
 * Usage: node scripts/calibrate-detail.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4195
const APP_URL = `http://localhost:${PORT}/pokeapp/`

/** Established by calibrate-scale.mjs against the MainPage frames. */
const SCALE = 2.23

/**
 * DetailPage-Light (57:730). The frame draws Umbreon: #197, Johto, ブラッキー,
 * "Burakkī". Widths are raw Figma units from get_metadata.
 */
const NODES = [
  // --- left column (container-sprite 57:837), the FIX 1 subject
  { role: 'watermark', node: '57:842', text: '197', raw: 701, weights: [700] },
  { role: 'name-main', node: '57:838', text: 'Umbreon', raw: 284, weights: [600, 700] },
  { role: 'name-roma', node: '57:839', text: 'Burakkī', raw: 305, weights: [400], italic: true },
  { role: 'name-kata', node: '57:841', text: 'ブラッキー', raw: 557, weights: [400, 600] },
  { role: 'region', node: '57:840', text: 'Region: Johto', raw: 313, weights: [400], track: 0.08 },

  // --- banner (container-poke-name 57:733), the FIX 2 subject
  { role: 'banner-num', node: '57:744', text: '#0197', raw: 133, weights: [400] },
  { role: 'banner-type', node: '57:737', text: 'DARK', raw: 83, weights: [700], track: 0.05 },
  { role: 'banner-type', node: '57:736', text: 'ELECTRIC', raw: 153, weights: [700], track: 0.05 },

  // --- sub-nav (Tabs 139:644)
  { role: 'subnav', node: '139:646', text: 'Info', raw: 59, weights: [400, 600] },
  { role: 'subnav', node: '139:647', text: 'Learnset', raw: 133, weights: [400, 600] },
  { role: 'subnav', node: '139:648', text: 'Description', raw: 173, weights: [400, 600] },
  { role: 'subnav', node: '139:649', text: 'Sprites', raw: 107, weights: [400, 600] },

  // --- stat block (container-bs-chart 57:774): six abbreviations + BST + title
  { role: 'stat-label', node: '57:776', text: 'HP', raw: 32, weights: [400, 600] },
  { role: 'stat-label', node: '57:777', text: 'Atk', raw: 42, weights: [400, 600] },
  { role: 'stat-label', node: '57:778', text: 'Def', raw: 42, weights: [400, 600] },
  { role: 'stat-label', node: '57:779', text: 'SpA', raw: 48, weights: [400, 600] },
  { role: 'stat-label', node: '57:780', text: 'SpD', raw: 48, weights: [400, 600] },
  { role: 'stat-label', node: '57:781', text: 'Spe', raw: 46, weights: [400, 600] },
  { role: 'stat-label', node: '57:782', text: 'BST', raw: 48, weights: [400, 600] },
  { role: 'section', node: '57:775', text: 'Base stats', raw: 139, weights: [400, 600] },
  { role: 'section', node: '57:768', text: 'Gender ratio', raw: 170, weights: [400, 600] },
  { role: 'section', node: '57:749', text: 'Abilities', raw: 111, weights: [400, 600] },
]

const TOKEN_SIZES = [38, 20, 14, 11, 10]

async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let last = 'never attempted'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      last = `HTTP ${res.status}`
    } catch (err) {
      last = (err.cause && (err.cause.code || err.cause.message)) || err.message
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server never became ready at ${url} (last: ${last})`)
}

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
})
preview.stdout.on('data', () => {})
preview.stderr.on('data', () => {})
const killTree = () => {
  if (preview.pid) spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { shell: true })
}

const nearestToken = (px) =>
  TOKEN_SIZES.reduce((a, b) => (Math.abs(b - px) < Math.abs(a - px) ? b : a))

try {
  await waitForServer(APP_URL)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  for (const w of [400, 600, 700]) {
    await page.waitForFunction(
      (weight) => document.fonts.check(`${weight} 100px "IBM Plex Sans"`),
      w,
      { timeout: 30000 },
    )
  }

  const measured = await page.evaluate((nodes) => {
    const probe = document.createElement('span')
    document.body.appendChild(probe)

    const advance = (text, weight, { italic, track } = {}) => {
      probe.setAttribute(
        'style',
        'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0;' +
          `font-family:var(--font-body);font-size:100px;font-weight:${weight};` +
          `font-style:${italic ? 'italic' : 'normal'};` +
          `letter-spacing:${track ? track + 'em' : 'normal'};`,
      )
      probe.textContent = text
      return probe.getBoundingClientRect().width / 100
    }

    const out = nodes.map((n) => ({
      ...n,
      advances: n.weights.map((w) => ({
        weight: w,
        a: advance(n.text, w, { italic: n.italic, track: n.track }),
      })),
    }))
    probe.remove()
    return out
  }, NODES)

  const pad = (s, n) => String(s).padEnd(n)
  const rows = []
  for (const n of measured) {
    for (const { weight, a } of n.advances) {
      const rawSize = n.raw / a
      rows.push({ ...n, weight, a, rawSize, css: rawSize / SCALE })
    }
  }

  console.log('')
  console.log(`DetailPage-Light type, inverted from real advances. Frame scale ${SCALE}.`)
  console.log('"raw size" = node width / advance. "css" = raw size / scale.')
  console.log('')
  console.log(
    pad('role', 12) +
      pad('node', 10) +
      pad('string', 15) +
      pad('wt', 5) +
      pad('raw w', 7) +
      pad('advance', 9) +
      pad('raw size', 10) +
      pad('css px', 9) +
      pad('token', 7),
  )
  console.log('-'.repeat(84))
  for (const r of rows) {
    const t = nearestToken(r.css)
    console.log(
      pad(r.role, 12) +
        pad(r.node, 10) +
        pad(r.text, 15) +
        pad(r.weight, 5) +
        pad(r.raw, 7) +
        pad(r.a.toFixed(3), 9) +
        pad(r.rawSize.toFixed(1), 10) +
        pad(r.css.toFixed(2), 9) +
        pad(`${t} (${(r.css - t >= 0 ? '+' : '') + (r.css - t).toFixed(1)})`, 7),
    )
  }

  console.log('')
  console.log('Per-role summary. A role whose members agree is auto-width and trustworthy;')
  console.log('a wide spread means the boxes were hand-sized and the role cannot be inverted.')
  console.log('')
  console.log(
    pad('role', 12) +
      pad('wt', 5) +
      pad('n', 4) +
      pad('mean raw', 11) +
      pad('mean css', 11) +
      pad('spread', 9) +
      'token',
  )
  console.log('-'.repeat(70))
  for (const role of [...new Set(rows.map((r) => r.role))]) {
    for (const weight of [...new Set(rows.filter((r) => r.role === role).map((r) => r.weight))]) {
      const set = rows.filter((r) => r.role === role && r.weight === weight)
      const mean = set.reduce((s, r) => s + r.css, 0) / set.length
      const meanRaw = set.reduce((s, r) => s + r.rawSize, 0) / set.length
      const spread = Math.max(...set.map((r) => r.css)) - Math.min(...set.map((r) => r.css))
      console.log(
        pad(role, 12) +
          pad(weight, 5) +
          pad(set.length, 4) +
          pad(meanRaw.toFixed(1), 11) +
          pad(mean.toFixed(2), 11) +
          pad(spread.toFixed(2), 9) +
          nearestToken(mean),
      )
    }
  }
  console.log('')

  await browser.close()
} finally {
  killTree()
}
