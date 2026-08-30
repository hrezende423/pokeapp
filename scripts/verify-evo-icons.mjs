/**
 * Verification for the custom painted evolution-condition icon set.
 *
 * Checks the things that must be true for the set to be usable at all -- every
 * file is a real transparent PNG, the JSON manifest and the TypeScript key union
 * say the same thing, nothing is orphaned or missing -- and reports the two things
 * that are currently NOT true but are a judgement call rather than a defect: the
 * source dimensions are inconsistent, and the set is heavy for the precache.
 *
 * Those two are printed as an ATTENTION block rather than asserted, deliberately.
 * A suite that is red on purpose teaches people to ignore red, and the target
 * dimensions are the owner's decision, not this script's.
 *
 * Transparency is read through a real decode in Chrome rather than inferred from
 * the PNG colour type: colour type 6 only means an alpha channel exists, not that
 * any pixel uses it.
 *
 * Usage: node scripts/verify-evo-icons.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const ICON_DIR = 'public/evo-icons'
const MANIFEST = `${ICON_DIR}/evo-condition-icons.json`
const TS_MODULE = 'src/modules/pokedex/evoConditionIcons.ts'
const GENDER_MODULE = 'src/modules/pokedex/evoGenderIcon.ts'

/*
  The normalised geometry, and it must match scripts/normalize-evo-icons.mjs.
  Kept as plain numbers here rather than imported from the normaliser so this
  suite fails if someone changes the normaliser without re-running it -- an
  import would silently agree with whatever the normaliser now says.
*/
const CANVAS = 128
const TARGET_FILL_PCT = 79.7 // 102/128
/** Rounding to whole pixels moves fill by up to ~0.8pp on the shortest side. */
const FILL_TOLERANCE_PCT = 1
/** Ceiling, not a target: catches an unnormalised original dropped in later. */
const MAX_SET_KB = 400

const failures = []
const log = (...a) => console.log(...a)
const hr = (t) => {
  log('')
  log('='.repeat(78))
  log(t)
  log('='.repeat(78))
}
function check(label, ok, detail = '') {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

// ---------------------------------------------------------------- manifest
hr('MANIFEST — JSON against the TypeScript union')

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const jsonEntries = Object.entries(manifest.icons)
const jsonKeys = jsonEntries.map(([k]) => k)
const jsonFiles = jsonEntries.map(([, v]) => v.file)

const tsSource = readFileSync(TS_MODULE, 'utf8')
const tsBlock = tsSource.slice(
  tsSource.indexOf('EVO_CONDITION_ICON_FILES = {'),
  tsSource.indexOf('} as const'),
)
// Keys are quoted only when they need to be, so accept both forms.
const tsPairs = [...tsBlock.matchAll(/^\s+'?([a-z-]+)'?:\s*'([^']+)',$/gm)].map((m) => [m[1], m[2]])
const tsKeys = tsPairs.map(([k]) => k)

const genderSource = readFileSync(GENDER_MODULE, 'utf8')
const genderFiles = [...genderSource.matchAll(/'(icon-[a-z-]+\.png)'/g)].map((m) => m[1])

log(`  JSON keys   (${jsonKeys.length}): ${jsonKeys.join(', ')}`)
log(`  TS keys     (${tsKeys.length}): ${tsKeys.join(', ')}`)
log(`  gender-only (${genderFiles.length}): ${genderFiles.join(', ')}`)

const GENDER_KEYS = ['gender-male', 'gender-female']
const expectedTsKeys = jsonKeys.filter((k) => !GENDER_KEYS.includes(k))

check(
  'every non-gender manifest key is in the TypeScript union',
  expectedTsKeys.every((k) => tsKeys.includes(k)),
  `missing: ${expectedTsKeys.filter((k) => !tsKeys.includes(k)).join(', ') || 'none'}`,
)
check(
  'and the union carries nothing the manifest does not',
  tsKeys.every((k) => jsonKeys.includes(k)),
  `extra: ${tsKeys.filter((k) => !jsonKeys.includes(k)).join(', ') || 'none'}`,
)
check(
  'filenames agree between the two for every shared key',
  tsPairs.every(([k, f]) => manifest.icons[k]?.file === f),
  tsPairs
    .filter(([k, f]) => manifest.icons[k]?.file !== f)
    .map(([k, f]) => `${k}: ts=${f} json=${manifest.icons[k]?.file}`)
    .join('; ') || 'all match',
)

/*
  THE POINT OF THE SCOPING, asserted rather than trusted: the general condition
  module must not name the gender files at all, and the gender module must name
  both. If either drifts, the icons have started leaking.
*/
check(
  'the general condition module does NOT reference the gender files',
  !/icon-(male|female)\.png/.test(tsSource),
  'evoConditionIcons.ts must not name them',
)
check(
  'the gender module names exactly the two gender files',
  genderFiles.length === 2 &&
    genderFiles.includes('icon-male.png') &&
    genderFiles.includes('icon-female.png'),
  genderFiles.join(', '),
)
check(
  'and the two gender keys are in the JSON, flagged with their scope',
  GENDER_KEYS.every((k) =>
    /EVOLUTION CHART ONLY|see gender-male/i.test(manifest.icons[k]?.scope ?? ''),
  ),
)

// ---------------------------------------------------------------- files
hr('FILES — every manifest entry on disk, and nothing orphaned')

const onDisk = readdirSync(ICON_DIR)
  .filter((f) => f.endsWith('.png'))
  .sort()
const allManifestFiles = [...jsonFiles].sort()

log(`  on disk  (${onDisk.length}): ${onDisk.join(', ')}`)
check('the manifest lists 11 icons', allManifestFiles.length === 11, `(${allManifestFiles.length})`)
check(
  'every manifest filename exists on disk',
  allManifestFiles.every((f) => onDisk.includes(f)),
  allManifestFiles.filter((f) => !onDisk.includes(f)).join(', ') || 'all present',
)
check(
  'and no PNG on disk is missing from the manifest',
  onDisk.every((f) => allManifestFiles.includes(f)),
  onDisk.filter((f) => !allManifestFiles.includes(f)).join(', ') || 'none orphaned',
)
check('no empty-slot icon, which was cancelled', !onDisk.some((f) => /empty|slot|blank/i.test(f)))

// ---------------------------------------------------------------- pixels
hr('PIXELS — real PNG, real transparency, measured in Chrome')

const COLOR_TYPE = { 0: 'gray', 2: 'RGB', 3: 'palette', 4: 'gray+A', 6: 'RGBA' }
const headers = {}
for (const f of onDisk) {
  const b = readFileSync(`${ICON_DIR}/${f}`)
  headers[f] = {
    signature: b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    depth: b[24],
    colorType: b[25],
    bytes: b.length,
  }
}

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage()
  await page.goto('about:blank')

  const measured = {}
  for (const f of onDisk) {
    const b64 = readFileSync(`${ICON_DIR}/${f}`).toString('base64')
    measured[f] = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = 'data:image/png;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      let clear = 0
      let partial = 0
      let minX = c.width
      let minY = c.height
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = data[(y * c.width + x) * 4 + 3]
          if (a === 0) {
            clear++
            continue
          }
          if (a < 255) partial++
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      const cornerAlpha = [
        data[3],
        data[(c.width - 1) * 4 + 3],
        data[(c.height - 1) * c.width * 4 + 3],
        data[((c.height - 1) * c.width + c.width - 1) * 4 + 3],
      ]
      return {
        decoded: true,
        clear,
        partial,
        total: c.width * c.height,
        cornerAlpha,
        contentW: maxX - minX + 1,
        contentH: maxY - minY + 1,
      }
    }, b64)
  }

  log('  file                       WxH          type   clear%  corners  content     fill%')
  const fills = []
  for (const f of onDisk) {
    const h = headers[f]
    const m = measured[f]
    const clearPct = ((m.clear / m.total) * 100).toFixed(1)
    const fill = (Math.max(m.contentW, m.contentH) / Math.max(h.width, h.height)) * 100
    fills.push({ f, w: h.width, h: h.height, fill })
    log(
      `  ${f.padEnd(26)} ${`${h.width}x${h.height}`.padEnd(12)} ${(
        COLOR_TYPE[h.colorType] ?? '?'
      ).padEnd(
        6,
      )} ${(clearPct + '%').padEnd(7)} ${m.cornerAlpha.join('/').padEnd(8)} ${`${m.contentW}x${m.contentH}`.padEnd(11)} ${fill.toFixed(0)}%`,
    )
  }

  check(
    'all 11 carry a valid PNG signature',
    onDisk.every((f) => headers[f].signature),
    onDisk.filter((f) => !headers[f].signature).join(', ') || 'all valid',
  )
  check(
    'all 11 are 8-bit RGBA, so an alpha channel exists',
    onDisk.every((f) => headers[f].colorType === 6 && headers[f].depth === 8),
  )
  check(
    'all 11 decode in a real browser',
    onDisk.every((f) => measured[f].decoded),
  )
  check(
    'all 11 use that alpha -- genuinely transparent, not an opaque RGBA',
    onDisk.every((f) => measured[f].clear > 0),
    onDisk.filter((f) => measured[f].clear === 0).join(', ') || 'all transparent',
  )
  check(
    'all four corners are fully transparent on every icon',
    onDisk.every((f) => measured[f].cornerAlpha.every((a) => a === 0)),
    onDisk.filter((f) => measured[f].cornerAlpha.some((a) => a !== 0)).join(', ') || 'all clear',
  )
  check(
    'edges are antialiased rather than hard-keyed',
    onDisk.every((f) => measured[f].partial > 0),
  )

  // ------------------------------------------------------- geometry, gated
  /*
    THESE WERE AN UNGATED "ATTENTION" BLOCK until the set was normalised.

    The reason they were only reported is that the target canvas and fill were the
    owner's decision, not this script's, and a suite that is red on purpose trains
    people to ignore red. The decision is made -- 128x128, 80% fill, produced by
    scripts/normalize-evo-icons.mjs -- so they are now assertions, and their job
    flips from "tell someone" to "stop the next unnormalised drop-in".

    Fill is measured on the LONGEST content side, which is the axis the normaliser
    scales to. The shorter side is free to be smaller: icon-female is a tall narrow
    figure and forcing both axes to 80% would stretch it.
  */
  hr('GEOMETRY — one canvas, one fill ratio')

  const sizes = [...new Set(fills.map((x) => `${x.w}x${x.h}`))]
  const totalKB = onDisk.reduce((n, f) => n + headers[f].bytes, 0) / 1024
  const byFill = [...fills].sort((a, b) => a.fill - b.fill)
  const fillSpread = byFill[byFill.length - 1].fill - byFill[0].fill

  log(`  canvas sizes present: ${sizes.join(', ')}`)
  log(
    `  fill range: ${byFill[0].fill.toFixed(1)}% (${byFill[0].f}) to ${byFill[byFill.length - 1].fill.toFixed(1)}% (${byFill[byFill.length - 1].f})`,
  )
  log(`  total payload: ${totalKB.toFixed(0)} KB across ${onDisk.length} files`)

  check('every icon is on one shared canvas size', sizes.length === 1, sizes.join(', '))
  check(`and that canvas is ${CANVAS}x${CANVAS}`, sizes[0] === `${CANVAS}x${CANVAS}`, sizes[0])
  check(
    `longest content side is ${TARGET_FILL_PCT}% of the canvas on every icon`,
    fills.every((x) => Math.abs(x.fill - TARGET_FILL_PCT) <= FILL_TOLERANCE_PCT),
    `spread ${fillSpread.toFixed(2)}pp, tolerance ${FILL_TOLERANCE_PCT}pp`,
  )
  check(
    'so no icon draws visibly heavier than another at the same CSS size',
    fillSpread <= FILL_TOLERANCE_PCT,
    `${fillSpread.toFixed(2)}pp spread`,
  )
  /*
    A payload ceiling, not a target. The set is 176 KB normalised, against 3219 KB
    as delivered; 400 KB leaves room for a couple more icons while still catching
    a 1024x1024 original dropped in by mistake, which is the actual failure mode --
    the workbox png glob takes every one of these into the install payload, so an
    unnormalised file would inflate it silently.
  */
  check(
    `the whole set stays under ${MAX_SET_KB} KB, since workbox precaches all of it`,
    totalKB < MAX_SET_KB,
    `${totalKB.toFixed(0)} KB`,
  )
} finally {
  await browser.close()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILED:`)
  for (const f of failures) log(`   - ${f}`)
  process.exitCode = 1
}
