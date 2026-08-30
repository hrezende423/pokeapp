/**
 * Normalise the custom evolution-condition icons to one canvas and one fill.
 *
 * THE PROBLEM THIS SOLVES. The set arrived at four different canvas sizes (128 to
 * 1024) with content filling 69-97% of each canvas, so at a shared render box the
 * icons drew at visibly different weights -- icon-beauty ~40% larger than
 * icon-moss-rock despite the same CSS size. Canvas size alone was not the issue;
 * the content inside each canvas had to be measured and matched too.
 *
 * WHAT IT DOES, per icon:
 *   1. decode at native size and find the real content box from the ALPHA channel
 *      (any pixel with alpha > 0), not from the canvas bounds
 *   2. crop to that box, discarding the arbitrary padding each source carried
 *   3. scale so the longest content side is exactly TARGET_CONTENT px, aspect
 *      preserved -- this is what actually equalises visual weight
 *   4. centre it on a fresh transparent CANVAS x CANVAS px canvas
 *
 * Downscaling goes through createImageBitmap with resizeQuality 'high' rather than
 * a bare drawImage: a 1024 -> 102 reduction in one drawImage step drops detail
 * badly on the painted artwork, and stepwise halving is both slower and softer.
 *
 * IT REWRITES THE FILES IN PLACE. The originals are recoverable from git -- they
 * were committed unmodified in 5adc10d before this ran -- which is deliberately
 * the backup rather than a .orig copy nobody would ever prune.
 *
 * SAFE TO RE-RUN. An icon already at the target canvas with content within a pixel
 * of the target is skipped rather than resampled again, so running this twice does
 * not soften the set.
 *
 * Usage: node scripts/normalize-evo-icons.mjs [--dry-run]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const ICON_DIR = 'public/evo-icons'
const CANVAS = 128
/** 80% of the canvas: 102/128 = 79.7%. */
const TARGET_CONTENT = 102
const DRY_RUN = process.argv.includes('--dry-run')

const files = readdirSync(ICON_DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()

console.log(`normalising ${files.length} icons -> ${CANVAS}x${CANVAS}, content ${TARGET_CONTENT}px`)
console.log(`(${((TARGET_CONTENT / CANVAS) * 100).toFixed(1)}% fill)${DRY_RUN ? ' [DRY RUN]' : ''}`)
console.log('')

const browser = await chromium.launch({ channel: 'chrome' })
let changed = 0
let skipped = 0
let beforeBytes = 0
let afterBytes = 0

try {
  const page = await browser.newPage()
  await page.goto('about:blank')

  console.log(
    '  file                       before        content      scale   after         KB before -> after',
  )
  for (const f of files) {
    const input = readFileSync(`${ICON_DIR}/${f}`)
    beforeBytes += input.length

    const result = await page.evaluate(
      async ({ b64, CANVAS, TARGET_CONTENT }) => {
        const img = new Image()
        img.src = 'data:image/png;base64,' + b64
        await img.decode()

        const srcW = img.naturalWidth
        const srcH = img.naturalHeight
        const probe = document.createElement('canvas')
        probe.width = srcW
        probe.height = srcH
        const pctx = probe.getContext('2d', { willReadFrequently: true })
        pctx.drawImage(img, 0, 0)
        const { data } = pctx.getImageData(0, 0, srcW, srcH)

        // Content box from alpha. Any non-zero alpha counts, so antialiased
        // edges are inside the box rather than clipped off it.
        let minX = srcW
        let minY = srcH
        let maxX = -1
        let maxY = -1
        for (let y = 0; y < srcH; y++) {
          for (let x = 0; x < srcW; x++) {
            if (data[(y * srcW + x) * 4 + 3] === 0) continue
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        if (maxX < 0) return { error: 'fully transparent image' }

        const cw = maxX - minX + 1
        const ch = maxY - minY + 1

        // Already normalised? Leave it alone rather than resample again.
        if (
          srcW === CANVAS &&
          srcH === CANVAS &&
          Math.abs(Math.max(cw, ch) - TARGET_CONTENT) <= 1
        ) {
          return { skipped: true, srcW, srcH, cw, ch }
        }

        const scale = TARGET_CONTENT / Math.max(cw, ch)
        const dw = Math.max(1, Math.round(cw * scale))
        const dh = Math.max(1, Math.round(ch * scale))

        // Crop first, then let createImageBitmap do the reduction at high quality.
        const crop = document.createElement('canvas')
        crop.width = cw
        crop.height = ch
        crop.getContext('2d').drawImage(img, minX, minY, cw, ch, 0, 0, cw, ch)
        const cropBlob = await new Promise((r) => crop.toBlob(r, 'image/png'))
        const bmp = await createImageBitmap(cropBlob, {
          resizeWidth: dw,
          resizeHeight: dh,
          resizeQuality: 'high',
        })

        const out = document.createElement('canvas')
        out.width = CANVAS
        out.height = CANVAS
        const octx = out.getContext('2d')
        octx.imageSmoothingEnabled = true
        octx.imageSmoothingQuality = 'high'
        // Centred on both axes; the shorter side gets the larger margin.
        octx.drawImage(bmp, Math.round((CANVAS - dw) / 2), Math.round((CANVAS - dh) / 2), dw, dh)

        const dataUrl = out.toDataURL('image/png')
        return { srcW, srcH, cw, ch, scale, dw, dh, dataUrl }
      },
      { b64: input.toString('base64'), CANVAS, TARGET_CONTENT },
    )

    if (result.error) {
      console.log(`  ${f.padEnd(26)} ERROR: ${result.error}`)
      process.exitCode = 1
      continue
    }
    if (result.skipped) {
      skipped++
      afterBytes += input.length
      console.log(
        `  ${f.padEnd(26)} ${`${result.srcW}x${result.srcH}`.padEnd(13)} ${`${result.cw}x${result.ch}`.padEnd(12)} —       already normalised`,
      )
      continue
    }

    const output = Buffer.from(result.dataUrl.split(',')[1], 'base64')
    afterBytes += output.length
    if (!DRY_RUN) writeFileSync(`${ICON_DIR}/${f}`, output)
    changed++
    console.log(
      `  ${f.padEnd(26)} ${`${result.srcW}x${result.srcH}`.padEnd(13)} ${`${result.cw}x${result.ch}`.padEnd(12)} ${result.scale.toFixed(3).padStart(6)}  ${`${result.dw}x${result.dh}`.padEnd(13)} ${(input.length / 1024).toFixed(0)} -> ${(output.length / 1024).toFixed(0)}`,
    )
  }
} finally {
  await browser.close()
}

console.log('')
console.log(`  rewritten: ${changed}   skipped: ${skipped}`)
console.log(
  `  payload:   ${(beforeBytes / 1024).toFixed(0)} KB -> ${(afterBytes / 1024).toFixed(0)} KB` +
    `  (${(((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1)}% smaller)`,
)
if (DRY_RUN) console.log('  [DRY RUN] nothing was written')
