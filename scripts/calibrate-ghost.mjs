/**
 * One-off calibration probe for the grid card's ghost watermark.
 *
 * Figma's shadow-number node is 370 x 198 raw inside a 497 x 467 card, i.e.
 * 74.45% of the card's width and 42.40% of its height. The locked 64px
 * font-size token renders "001" much narrower than that, so the width has to be
 * made up with letter-spacing and the height with line-height. Rather than
 * guessing those two numbers, this sweeps them in the real browser with the real
 * self-hosted font and reports which pair lands on Figma's ratios.
 *
 * Usage: node scripts/calibrate-ghost.mjs
 */

import { spawn, spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4193
const APP_URL = `http://localhost:${PORT}/pokeapp/`

// Figma raw geometry, MainPage-Light frame 9:143, card 9:173.
const CARD_W = 497
const CARD_H = 467
const GHOST_W = 370
const GHOST_H = 198
const WANT_W_RATIO = GHOST_W / CARD_W
const WANT_H_RATIO = GHOST_H / CARD_H

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
let serverLog = ''
preview.stdout.on('data', (d) => (serverLog += d))
preview.stderr.on('data', (d) => (serverLog += d))

const killTree = () => {
  if (preview.pid) spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { shell: true })
}

try {
  await waitForServer(APP_URL)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  await page.waitForFunction(() => document.fonts.check('700 64px "IBM Plex Sans"'), undefined, {
    timeout: 30000,
  })

  const cardWidth = await page.$eval('.species-card', (el) =>
    Math.round(el.getBoundingClientRect().width),
  )
  const cardHeight = await page.$eval('.species-card', (el) =>
    Math.round(el.getBoundingClientRect().height),
  )
  console.log(`card: ${cardWidth} x ${cardHeight}px`)
  console.log(
    `target ghost box: ${(WANT_W_RATIO * cardWidth).toFixed(1)} x ${(
      WANT_H_RATIO * cardHeight
    ).toFixed(1)}px  (${(WANT_W_RATIO * 100).toFixed(2)}% x ${(WANT_H_RATIO * 100).toFixed(2)}%)`,
  )

  // Sweep letter-spacing for the width, and line-height for the height. They are
  // independent: tracking does not change the line box, and line-height does not
  // change the advance width.
  const sweep = await page.evaluate(
    ({ wantW, wantH }) => {
      const el = document.querySelector('.species-card-ghost')
      const card = document.querySelector('.species-card')
      const cw = card.getBoundingClientRect().width
      const ch = card.getBoundingClientRect().height
      const targetW = wantW * cw
      const targetH = wantH * ch
      const measure = () => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      }
      const original = {
        ls: getComputedStyle(el).letterSpacing,
        lh: getComputedStyle(el).lineHeight,
        fs: getComputedStyle(el).fontSize,
      }

      const tracking = []
      for (let em = 0; em <= 0.4001; em += 0.005) {
        el.style.letterSpacing = `${em.toFixed(4)}em`
        tracking.push({ em: Number(em.toFixed(4)), w: measure().w })
      }
      el.style.letterSpacing = original.ls

      const leading = []
      for (let lh = 1.0; lh <= 1.8001; lh += 0.01) {
        el.style.lineHeight = String(lh.toFixed(3))
        leading.push({ lh: Number(lh.toFixed(3)), h: measure().h })
      }
      el.style.lineHeight = original.lh

      const bestEm = tracking.reduce((a, b) =>
        Math.abs(b.w - targetW) < Math.abs(a.w - targetW) ? b : a,
      )
      const bestLh = leading.reduce((a, b) =>
        Math.abs(b.h - targetH) < Math.abs(a.h - targetH) ? b : a,
      )
      return { original, targetW, targetH, bestEm, bestLh, current: measure() }
    },
    { wantW: WANT_W_RATIO, wantH: WANT_H_RATIO },
  )

  console.log('')
  console.log(
    `authored now : font-size=${sweep.original.fs} letter-spacing=${
      sweep.original.ls
    } line-height=${sweep.original.lh}`,
  )
  console.log(
    `renders now  : ${sweep.current.w.toFixed(2)} x ${sweep.current.h.toFixed(2)}px  ` +
      `(target ${sweep.targetW.toFixed(2)} x ${sweep.targetH.toFixed(2)})`,
  )
  console.log('')
  console.log(
    `BEST letter-spacing : ${sweep.bestEm.em}em -> width ${sweep.bestEm.w.toFixed(2)}px ` +
      `(off by ${(sweep.bestEm.w - sweep.targetW).toFixed(2)}px)`,
  )
  console.log(
    `BEST line-height    : ${sweep.bestLh.lh} -> height ${sweep.bestLh.h.toFixed(2)}px ` +
      `(off by ${(sweep.bestLh.h - sweep.targetH).toFixed(2)}px)`,
  )

  await browser.close()
} finally {
  killTree()
}
