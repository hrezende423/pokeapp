/**
 * Verification for the design-system integration.
 *
 * Expected values are read from design-system/design-tokens.json -- the stated
 * source of truth -- and asserted against what the browser actually computes, so
 * this fails if the CSS drifts from the tokens rather than comparing the CSS to a
 * copy of itself. Token references like "{color.primitive.ink.900}" are resolved
 * here the same way a token pipeline would.
 *
 * The three properties most worth protecting, because they were hard-won
 * decisions rather than defaults:
 *
 *   NO SHADOWS      every element the design system renders, in both themes, must
 *                   compute box-shadow: none. Elevation is the --surface /
 *                   --surface-raised tone-step and nothing else.
 *   NO FONT CDN     the page must make zero requests to fonts.googleapis.com or
 *                   fonts.gstatic.com, and IBM Plex Sans must still be the font
 *                   actually in use -- i.e. genuinely self-hosted, not silently
 *                   falling back to the system stack.
 *   LAYERING        the detail drawer keeps --surface-raised in both background
 *                   modes; only the shared layer behind it changes per species.
 *
 * Usage: node scripts/verify-design-system.mjs
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'
import { goToDex, openTab } from './lib/nav.mjs'
import { startPreviewServer } from './lib/devServer.mjs'

const PORT = 4192
const APP_URL = `http://localhost:${PORT}/pokeapp/`
// The design-system reference page has no nav tab any more -- it was an
// implementation aid, not a destination -- so it is reached by the query param
// that App.tsx checks. Still the real app, real data layer, real stylesheet.
const DS_URL = `${APP_URL}?ds=1`
const SHOTS = 'scripts/.verify-shots'

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

mkdirSync(SHOTS, { recursive: true })

// =====================================================================
// Expected values, resolved from design-tokens.json
// =====================================================================

const tokens = JSON.parse(readFileSync('design-system/design-tokens.json', 'utf8'))

/** Resolves "{color.primitive.ink.900}" style references to a literal value. */
function tokenValue(node, mode) {
  const raw = mode ? node?.[mode]?.$value : node?.$value
  if (typeof raw !== 'string') return raw
  const ref = /^\{([^}]+)\}$/.exec(raw)
  if (!ref) return raw
  let cur = tokens
  for (const part of ref[1].split('.')) cur = cur?.[part]
  return cur?.$value ?? tokenValue(cur, mode)
}

const semantic = tokens.color.semantic
const primitive = tokens.color.primitive
/*
  THE COMMUNITY PALETTE IS THE PALETTE NOW, in both themes.

  `type-color` (the muted custom set) is retired -- still in design-tokens.json
  for the record, referenced by nothing -- so the expected value of --type-<t> is
  built from `type-color-community` with each mode's override set applied on top.
  Neither mode uses all 17 raw community values, and for opposite reasons:

    dark   5 of 17 overridden (fighting, poison, ghost, dragon, dark) -- the
           mid-dark saturated ones did not clear 4:1 against #141414.
    light  12 of 17 overridden -- the bright pastels did not clear 4:1 against
           #fafafa, Electric worst at 1.43:1.

  Read from the JSON rather than restated here, so the CSS and the source of
  truth are compared to each other rather than both to a copy in this file.
*/
const TYPES = Object.keys(primitive['type-color-community']).filter((k) => !k.startsWith('$'))

const typeExpectations = (mode) => {
  const overrideKey = `type-color-community-${mode}-mode-override`
  const overrides = primitive[overrideKey] ?? {}
  return Object.fromEntries(
    TYPES.map((t) => [
      `--type-${t}`,
      (overrides[t] ?? primitive['type-color-community'][t]).$value,
    ]),
  )
}

/** The custom properties design-tokens.css is expected to expose, per theme. */
const EXPECTED = {
  light: {
    '--surface': tokenValue(semantic.surface, 'light'),
    '--surface-raised': tokenValue(semantic['surface-raised'], 'light'),
    '--surface-hover': tokenValue(semantic['surface-hover'], 'light'),
    '--text-primary': tokenValue(semantic['text-primary'], 'light'),
    '--text-secondary': tokenValue(semantic['text-secondary'], 'light'),
    '--hairline': tokenValue(semantic.hairline, 'light'),
    '--accent': tokenValue(semantic.accent, 'light'),
    '--button-primary-fill': tokenValue(semantic['button-primary-fill'], 'light'),
    '--button-primary-text': tokenValue(semantic['button-primary-text'], 'light'),
    '--ghost-watermark': tokenValue(semantic['ghost-watermark'], 'light'),
    ...typeExpectations('light'),
  },
  dark: {
    '--surface': tokenValue(semantic.surface, 'dark'),
    '--surface-raised': tokenValue(semantic['surface-raised'], 'dark'),
    '--surface-hover': tokenValue(semantic['surface-hover'], 'dark'),
    '--text-primary': tokenValue(semantic['text-primary'], 'dark'),
    '--text-secondary': tokenValue(semantic['text-secondary'], 'dark'),
    '--hairline': tokenValue(semantic.hairline, 'dark'),
    '--accent': tokenValue(semantic.accent, 'dark'),
    '--button-primary-fill': tokenValue(semantic['button-primary-fill'], 'dark'),
    '--button-primary-text': tokenValue(semantic['button-primary-text'], 'dark'),
    '--ghost-watermark': tokenValue(semantic['ghost-watermark'], 'dark'),
    ...typeExpectations('dark'),
  },
}

/**
 * Per-mode now: 0.09 light / 0.05 dark. 5% white on a near-black surface reads
 * far stronger than 5% black on a near-white one, so one value cannot match the
 * reference in both -- the same asymmetry the type-color dark overrides use.
 */
const GHOST_OPACITY = {
  light: String(tokenValue(tokens.opacity['ghost-watermark'], 'light')),
  dark: String(tokenValue(tokens.opacity['ghost-watermark'], 'dark')),
}

/** Mode-agnostic scales, expected identical in both themes. */
const SCALE = {
  '--font-size-display': tokens.typography['font-size'].display.$value,
  '--font-size-title': tokens.typography['font-size'].title.$value,
  '--font-size-body': tokens.typography['font-size'].body.$value,
  '--font-size-label': tokens.typography['font-size'].label.$value,
  '--font-size-caption': tokens.typography['font-size'].caption.$value,
  '--font-size-ghost-watermark': tokens.typography['font-size']['ghost-watermark'].$value,
  '--font-size-ghost-watermark-grid': tokens.typography['font-size']['ghost-watermark-grid'].$value,
  '--font-weight-regular': String(tokens.typography['font-weight'].regular.$value),
  '--font-weight-medium': String(tokens.typography['font-weight'].medium.$value),
  '--font-weight-bold': String(tokens.typography['font-weight'].bold.$value),
  '--radius-card': tokens.radius.card.$value,
  '--radius-drawer': tokens.radius.drawer.$value,
  '--radius-control': tokens.radius.control.$value,
  '--radius-pill': tokens.radius.pill.$value,
  '--radius-badge-square': tokens.radius['badge-square'].$value,
  '--space-card-padding': tokens.spacing['card-padding'].$value,
  '--space-drawer-padding': tokens.spacing['drawer-padding'].$value,
  '--space-row-padding-block': tokens.spacing['row-padding-block'].$value,
  '--space-gap-sm': tokens.spacing['gap-sm'].$value,
  '--space-gap-md': tokens.spacing['gap-md'].$value,
  '--space-gap-lg': tokens.spacing['gap-lg'].$value,
  '--space-gap-xl': tokens.spacing['gap-xl'].$value,
  '--icon-grid': tokens.icon.grid.$value,
  '--icon-stroke-width': tokens.icon['stroke-width'].$value,
}

/**
 * Same value, written differently: Prettier and the bundler shorten #ffffff to
 * #fff, drop the leading zero from 0.05, and normalise quote style. Compare
 * canonically so formatting is not reported as a token change.
 */
function canonical(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/g, '#$1$2$3')
    .replace(/(^|[\s,(])0\.(\d)/g, '$1.$2')
}

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const localTints = JSON.parse(readFileSync('design-system/species-background-colors.json', 'utf8'))

hr('EXPECTED VALUES — resolved from design-tokens.json')
log(`  ${TYPES.length} type colours, light + dark`)
log(`  light --surface ${EXPECTED.light['--surface']} / dark ${EXPECTED.dark['--surface']}`)
log(`  light --accent  ${EXPECTED.light['--accent']} / dark ${EXPECTED.dark['--accent']}`)
log(`  scale tokens: ${Object.keys(SCALE).length}`)
check('all 17 in-scope types have a light value', TYPES.length === 17, `(${TYPES.length})`)
check(
  'all 17 have a dark-mode value too',
  TYPES.every((t) => EXPECTED.dark[`--type-${t}`]),
)

// =====================================================================
// STATIC — the handoff files, the fixes applied to them, and the assets
// =====================================================================

hr('STATIC — what changed relative to the handoff copy, and why')
const handoffCss = readFileSync('design-system/design-tokens.css', 'utf8')
const appCss = readFileSync('src/design-tokens.css', 'utf8')

// The bug this integration had to fix: the field/ledger tokens existed only
// inside the dark rule in the handoff copy, so light mode had no values at all.
const darkBlock = /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(handoffCss)[1]
const FIELD_TOKENS = [
  '--field-focus-border',
  '--field-focus-border-width',
  '--field-disabled-opacity',
  '--field-error-border',
  '--ledger-num-opacity-caught',
  '--ledger-num-opacity-not-caught',
]
const wereDarkOnly = FIELD_TOKENS.every((t) => darkBlock.includes(t))
log(`  handoff copy defines the field/ledger tokens inside [data-theme="dark"]: ${wereDarkOnly}`)
check('the dark-only definition really was in the handoff file', wereDarkOnly)
// Either quote style: Prettier normalises the shipped copy's attribute selectors
// to single quotes, while the handoff copy uses double.
const appDark = /\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/.exec(appCss)[1]
check(
  'the shipped copy no longer defines them per-theme',
  FIELD_TOKENS.every((t) => !appDark.includes(t)),
)
check(
  'the shipped copy defines every one of them',
  FIELD_TOKENS.every((t) => appCss.includes(`${t}:`)),
)
check(
  '--radius-badge-square, missing from the handoff CSS, is present',
  appCss.includes('--radius-badge-square'),
)
check('it was genuinely absent before', !handoffCss.includes('--radius-badge-square'))

// Every value that exists in both files must be identical: this integration is
// not allowed to retune the tokens.
const decls = (css) =>
  Object.fromEntries(
    [...css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]),
  )
const handoffDecls = decls(handoffCss)
const appDecls = decls(appCss)
const changed = Object.keys(handoffDecls).filter(
  (k) => canonical(appDecls[k]) !== canonical(handoffDecls[k]),
)
log(`  declarations changed from the handoff copy: ${changed.length ? changed.join(', ') : 'none'}`)
check('no token value was altered', changed.length === 0, changed.join(','))

/*
  Fonts: self-hosted files, and no CDN URL left anywhere in the source.

  THE ITALIC PAIR IS IN THIS LIST NOW. It was missing entirely, and its absence
  was invisible: `font-style: italic` fell back to the Roman face and Chrome did
  not even synthesise an oblique, so three rules in the app asked for italic and
  drew upright text. A file list is the cheapest place to catch that -- the
  browser-side check below is what proves the face actually resolves.
*/
const fontFiles = [
  'ibm-plex-sans-latin.woff2',
  'ibm-plex-sans-latin-ext.woff2',
  'ibm-plex-sans-italic-latin.woff2',
  'ibm-plex-sans-italic-latin-ext.woff2',
]
for (const f of fontFiles) {
  const bytes = readFileSync(`src/assets/fonts/${f}`)
  const magic = bytes.subarray(0, 4).toString('latin1')
  log(`  src/assets/fonts/${f}: ${(bytes.length / 1024).toFixed(1)} KiB, magic "${magic}"`)
  check(`${f} exists and is a real woff2`, magic === 'wOF2')
  check(`${f} is referenced by @font-face`, appCss.includes(f))
}
/** Source with comments removed -- a rule mentioning something in prose is not a use of it. */
const withoutComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check(
  'the stylesheet references no font CDN',
  !/fonts\.(googleapis|gstatic)\.com/.test(withoutComments(appCss)),
)
const swJs = readFileSync('dist/sw.js', 'utf8')
check(
  'every font file is in the precache manifest',
  fontFiles.every((f) => new RegExp(f.replace('.woff2', '-[A-Za-z0-9_-]+\\.woff2')).test(swJs)),
  fontFiles
    .filter((f) => !new RegExp(f.replace('.woff2', '-[A-Za-z0-9_-]+\\.woff2')).test(swJs))
    .join(' '),
)
/*
  Both STYLES are declared, not just both subsets -- and this parses the @font-face
  blocks rather than counting `font-style: italic` anywhere in the file, because
  the three RULES that ask for italic match that string too. What was missing was
  a FACE, so a face is what gets counted.
*/
const faceBlocks = appCss.match(/@font-face\s*\{[^}]*\}/g) ?? []
const italicFaces = faceBlocks.filter(
  (b) => /font-style:\s*italic/.test(b) && /IBM Plex Sans/.test(b),
)
check(
  'the stylesheet declares italic Plex FACES, not only Roman ones',
  italicFaces.length === 2 &&
    italicFaces.every((b) => /ibm-plex-sans-italic-latin(-ext)?\.woff2/.test(b)),
  `${italicFaces.length} of ${faceBlocks.length} @font-face blocks`,
)

/*
  NO SHADOW, APP-WIDE IN SOURCE -- and this is a new check because the browser
  half of it had a hole. The DOM assertions below cover every element the
  DESIGN-SYSTEM REFERENCE PAGE renders, which is most of the system but not the
  whole app: `.egg-marker-note`, a popover on the species detail page's Learnset
  tab, carried `box-shadow: var(--shadow)` -- the legacy 10px/15px double drop
  shadow from index.css -- and no suite looked at it, because it does not appear
  on the reference page.

  So the source is scanned too. This is the one rule worth checking statically as
  well as dynamically: it is the system's hardest, it is a single property, and
  the failure mode is a rule violation on a screen no suite happens to visit.

  ONE NAMED EXCEPTION, and naming it is the point. `.toggle-knob` belongs to
  src/components/ToggleSwitch.tsx, which NOTHING IMPORTS -- the sanctioned toggle
  is components/ds/Toggle.tsx. It is dead code carrying a dead violation, so it
  renders nowhere; it is allow-listed rather than fixed so that this check can
  ship without deleting a component as a side effect, and it is listed here by
  name so the allowance cannot quietly cover anything else. Delete both when the
  file goes.
*/
const SHADOW_EXCEPTIONS = ['.toggle-knob']
/* Every tracked file under src/, filtered here rather than globbed by git: a
   pathspec glob that misses a directory would make this check silently pass. */
const cssFiles = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.css'))
const liveShadows = []
for (const file of cssFiles) {
  const text = readFileSync(file, 'utf8')
  // Strip comments first: several of them discuss the rule by name.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '')
  code.split('\n').forEach((line, i) => {
    if (!/box-shadow\s*:/.test(line)) return
    if (/box-shadow\s*:\s*none/.test(line)) return
    // Which selector is this inside? The nearest preceding one is enough here.
    const upto = code
      .split('\n')
      .slice(0, i + 1)
      .join('\n')
    const selector = [...upto.matchAll(/([^\s{};][^{};]*)\{/g)].pop()?.[1].trim() ?? '?'
    if (SHADOW_EXCEPTIONS.some((ex) => selector.includes(ex))) return
    liveShadows.push(`${file}:${i + 1} ${selector}`)
  })
}
log(`  CSS files scanned for box-shadow: ${cssFiles.length}`)
liveShadows.forEach((v) => log(`    VIOLATION ${v}`))
check(
  'no box-shadow declaration anywhere in the app CSS',
  liveShadows.length === 0,
  liveShadows.join(' | ') || `(${SHADOW_EXCEPTIONS.join(', ')} allow-listed as dead code)`,
)

// No shadow, in source as well as in the browser.
const dsSources = [
  'src/components/ds/ds.css',
  'src/components/ds/Button.tsx',
  'src/components/ds/Toggle.tsx',
  'src/components/ds/TextField.tsx',
  'src/components/ds/SelectField.tsx',
  'src/components/ds/Navigation.tsx',
  'src/components/ds/DataRows.tsx',
  'src/components/ds/LedgerRow.tsx',
  'src/components/ds/GhostWatermark.tsx',
  'src/components/ds/TypeLabel.tsx',
  'src/components/ds/SpeciesGridCard.tsx',
  'src/components/ds/HeroDetailCard.tsx',
  'src/components/ds/SpeciesDetailPanel.tsx',
  'src/modules/design-system/DesignSystemPage.tsx',
]
const withShadow = dsSources.filter((f) =>
  /box-shadow|boxShadow|drop-shadow/.test(withoutComments(readFileSync(f, 'utf8'))),
)
log(
  `  design-system sources that actually declare a shadow: ${withShadow.length ? withShadow.join(', ') : 'none'}`,
)
check('no design-system source declares a shadow', withShadow.length === 0)

// The icon library is the one the tokens name, and only that one.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const iconDeps = Object.keys(pkg.dependencies).filter((d) =>
  /icon|heroicon|lucide|feather|phosphor/i.test(d),
)
log(`  icon dependencies: ${iconDeps.join(', ')}`)
check('Tabler is installed', iconDeps.includes('@tabler/icons-react'))
check('no second icon library is installed', iconDeps.length === 1, iconDeps.join(','))

// The species tint table the app fetches must be the file that was published.
const remoteTints = await (
  await fetch(
    'https://raw.githubusercontent.com/hrezende423/pokeapp-sprites/main/species-background-colors.json',
  )
).json()
log(`  remote tint table: ${Object.keys(remoteTints).length} entries`)
check(
  'the published table matches the handoff file exactly',
  JSON.stringify(remoteTints) === JSON.stringify(localTints),
)

/*
  THE PREVIEW SERVER IS STARTED THROUGH lib/devServer.mjs, which spawns vite
  directly (no shell, so stop() actually stops it) and REFUSES to run against a
  server it did not start. Polling the URL until it answers was not enough: an
  orphaned vite on this port answers too, with a stale build, and the whole suite
  then silently checks previous code. See that file's header.
*/
const preview = await startPreviewServer({ port: PORT })

let browser
try {
  log('')
  log(`preview ready at ${APP_URL}`)
  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))

  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const requests = []
  const badResponses = []
  cdp.on('Network.requestWillBeSent', (e) => requests.push(e.request.url))
  cdp.on('Network.responseReceived', (e) => {
    if (e.response.status >= 400) badResponses.push(`${e.response.status} ${e.response.url}`)
  })

  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="app-nav"]', { timeout: 60000 })

  const { withControls } = controls(page)

  const setTheme = async (theme) => {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t
    }, theme)
    await page.waitForTimeout(80)
  }
  const rootVars = (names) =>
    page.evaluate((list) => {
      const cs = getComputedStyle(document.documentElement)
      return Object.fromEntries(list.map((n) => [n, cs.getPropertyValue(n).trim()]))
    }, names)

  // ---------------------------------------------------------- token layer
  hr('TOKENS — every custom property, resolved in the browser, per theme')
  for (const theme of ['light', 'dark']) {
    await setTheme(theme)
    const got = await rootVars(Object.keys(EXPECTED[theme]))
    const wrong = Object.entries(EXPECTED[theme]).filter(
      ([k, v]) => canonical(got[k]) !== canonical(v),
    )
    log(`  ${theme}: ${Object.keys(EXPECTED[theme]).length} tokens checked, ${wrong.length} wrong`)
    for (const [k, v] of wrong) log(`      ${k}: expected ${v}, got "${got[k]}"`)
    check(`every colour token matches design-tokens.json in ${theme}`, wrong.length === 0)
  }

  await setTheme('light')
  const scale = await rootVars(Object.keys(SCALE))
  const scaleWrong = Object.entries(SCALE).filter(([k, v]) => canonical(scale[k]) !== canonical(v))
  for (const [k, v] of scaleWrong) log(`      ${k}: expected ${v}, got "${scale[k]}"`)
  check('every size/radius/spacing/opacity token matches', scaleWrong.length === 0)

  // The fix: these must resolve in LIGHT mode, which is where they were missing.
  const fieldVals = await rootVars(FIELD_TOKENS)
  log(`  light-mode field/ledger tokens: ${JSON.stringify(fieldVals)}`)
  check(
    'the field/ledger tokens now resolve in light mode',
    FIELD_TOKENS.every((t) => fieldVals[t].length > 0),
  )
  check('the disabled step is 0.4', canonical(fieldVals['--field-disabled-opacity']) === '.4')
  check(
    'the not-caught step is 0.4',
    canonical(fieldVals['--ledger-num-opacity-not-caught']) === '.4',
  )
  check('the focus underline is 2px', fieldVals['--field-focus-border-width'] === '2px')

  // ------------------------------------------------------- theme contract
  hr('THEME — the data-theme contract, including on a subtree')
  const bootTheme = await page.evaluate(() => ({
    attr: document.documentElement.dataset.theme,
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  }))
  log(`  boot: data-theme="${bootTheme.attr}", OS prefers dark: ${bootTheme.prefersDark}`)
  check('the app sets data-theme at boot', ['light', 'dark'].includes(bootTheme.attr))
  check(
    'it follows the OS preference',
    bootTheme.attr === (bootTheme.prefersDark ? 'dark' : 'light'),
  )

  await page.goto(DS_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="dex-designsystem"]', { timeout: 30000 })
  // The reference page renders both themes at once via data-theme on a wrapper,
  // which is the contract the token file states ("on :root or any ancestor").
  const subtree = await page.evaluate(() => {
    const read = (theme) => {
      const el = document.querySelector(`[data-demo-theme="${theme}"]`)
      const cs = getComputedStyle(el)
      return {
        surface: cs.getPropertyValue('--surface').trim(),
        raised: cs.getPropertyValue('--surface-raised').trim(),
        accent: cs.getPropertyValue('--accent').trim(),
        background: cs.backgroundColor,
      }
    }
    return {
      light: read('light'),
      dark: read('dark'),
      htmlTheme: document.documentElement.dataset.theme,
    }
  })
  log(`  subtree light: ${JSON.stringify(subtree.light)}`)
  log(`  subtree dark : ${JSON.stringify(subtree.dark)}`)
  check(
    'a light subtree gets the light tokens',
    subtree.light.surface.toLowerCase() === EXPECTED.light['--surface'].toLowerCase(),
  )
  check(
    'a dark subtree gets the dark tokens in the same document',
    subtree.dark.surface.toLowerCase() === EXPECTED.dark['--surface'].toLowerCase(),
  )
  check(
    'and they really are different',
    subtree.light.background !== subtree.dark.background,
    `${subtree.light.background} vs ${subtree.dark.background}`,
  )
  await page.screenshot({ path: `${SHOTS}/ds-page.png`, fullPage: true })

  // ------------------------------------------------------------- fonts
  hr('FONTS — self-hosted, actually in use, and no CDN touched')
  const fontReqs = requests.filter((u) => /\.woff2?(\?|$)/.test(u))
  const cdnReqs = requests.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u))
  log(`  font requests: ${fontReqs.map((u) => u.split('/').pop()).join(', ') || 'none'}`)
  log(`  font-CDN requests: ${cdnReqs.length}`)
  check('at least one woff2 was fetched', fontReqs.length > 0)
  check(
    'every font request is same-origin',
    fontReqs.every((u) => u.startsWith(`http://localhost:${PORT}/pokeapp/`)),
    fontReqs.join(' '),
  )
  check('nothing was requested from a font CDN', cdnReqs.length === 0, cdnReqs.join(' '))

  const fontState = await page.evaluate(async () => {
    await document.fonts.ready
    const faces = [...document.fonts].filter((f) => f.family.includes('IBM Plex Sans'))
    // Does text actually render in Plex, or silently in the fallback? Compare the
    // measured width of the same string in --font-body against the fallback stack.
    const measure = (family) => {
      const s = document.createElement('span')
      s.textContent = 'Charizard Gengar 006'
      s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:38px;font-family:${family}`
      document.body.appendChild(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return w
    }
    const el = document.querySelector('[data-ds="hero-name"]')
    /*
      A REAL ITALIC FACE, PROVED BY ADVANCE WIDTHS. `font-style: italic` in a
      computed style says nothing about what rendered -- it read "italic" for
      months while the glyphs were upright, because only Roman faces were
      declared and Chrome did not synthesise a slant. A separate face has its own
      metrics, so a genuine italic measures DIFFERENTLY from the Roman at the same
      size; a synthesised oblique or a silent fallback measures identically.
    */
    const canvas = document.createElement('canvas').getContext('2d')
    const advance = (font) => {
      canvas.font = font
      return canvas.measureText('Charizard Gengar').width
    }
    return {
      faces: faces.map((f) => ({ style: f.style, weight: f.weight, status: f.status })),
      check14: document.fonts.check('14px "IBM Plex Sans"'),
      romanAdvance: advance('300 30px "IBM Plex Sans"'),
      italicAdvance: advance('italic 300 30px "IBM Plex Sans"'),
      plexWidth: measure('"IBM Plex Sans"'),
      fallbackWidth: measure('-apple-system, "Segoe UI", Roboto, sans-serif'),
      heroFontFamily: el ? getComputedStyle(el).fontFamily : null,
      heroFontSize: el ? getComputedStyle(el).fontSize : null,
      heroFontWeight: el ? getComputedStyle(el).fontWeight : null,
    }
  })
  log(`  loaded faces: ${JSON.stringify(fontState.faces)}`)
  log(
    `  width in Plex vs fallback at 38px: ${fontState.plexWidth.toFixed(1)} vs ${fontState.fallbackWidth.toFixed(1)}`,
  )
  log(`  hero name font-family: ${fontState.heroFontFamily}`)
  check('IBM Plex Sans faces are registered', fontState.faces.length > 0)
  check(
    'at least one is loaded',
    fontState.faces.some((f) => f.status === 'loaded'),
  )
  check('document.fonts.check passes for it', fontState.check14)
  log(
    `  advance at 300 30px: roman ${fontState.romanAdvance.toFixed(2)} vs italic ${fontState.italicAdvance.toFixed(2)}`,
  )
  check(
    'an italic face is registered, not just the Roman',
    fontState.faces.some((f) => f.style === 'italic'),
    fontState.faces.map((f) => `${f.style}/${f.status}`).join(' '),
  )
  /*
    NOT "and one of them is loaded". A face loads when something on the page uses
    it, and the design-system reference page has no italic text -- so `unloaded`
    here is correct rather than broken, and asserting otherwise would have forced
    italic content onto a page that has no reason to carry any. The species page
    DOES use it, and verify-species-page section N asserts the loaded, rendered
    face there. What matters here is that it is declared and measurable, which the
    two checks either side of this cover.
  */
  check(
    'italic really renders as its own face, not as an upright fallback',
    Math.abs(fontState.romanAdvance - fontState.italicAdvance) > 0.5,
    `roman ${fontState.romanAdvance.toFixed(2)} vs italic ${fontState.italicAdvance.toFixed(2)}`,
  )
  check(
    'text really renders in Plex, not the fallback stack',
    Math.abs(fontState.plexWidth - fontState.fallbackWidth) > 1,
    `(${fontState.plexWidth.toFixed(1)} vs ${fontState.fallbackWidth.toFixed(1)})`,
  )
  check(
    'the hero name uses --font-body',
    (fontState.heroFontFamily ?? '').startsWith('"IBM Plex Sans"') ||
      (fontState.heroFontFamily ?? '').startsWith('IBM Plex Sans'),
    fontState.heroFontFamily ?? '',
  )
  check(
    'at the display size and bold weight',
    fontState.heroFontSize === SCALE['--font-size-display'] &&
      fontState.heroFontWeight === SCALE['--font-weight-bold'],
    `${fontState.heroFontSize} / ${fontState.heroFontWeight}`,
  )

  // --font-numeric used to trail 'SF Mono', so on any machine with SF Mono the
  // numeric face resolved to an unbundled system font. It is now self-hosted and
  // leads the stack, which is what these three checks pin.
  const monoState = await page.evaluate(async () => {
    await document.fonts.ready
    const faces = [...document.fonts].filter((f) => f.family.includes('Martian Mono'))
    const measure = (family, weight = 400) => {
      const s = document.createElement('span')
      s.textContent = '0123456789'
      s.style.cssText =
        'position:absolute;visibility:hidden;white-space:pre;font-size:40px;' +
        `font-weight:${weight};font-family:${family}`
      document.body.appendChild(s)
      const w = s.getBoundingClientRect().width
      s.remove()
      return w
    }
    return {
      faces: faces.map((f) => ({ weight: f.weight, status: f.status })),
      check14: document.fonts.check('14px "Martian Mono"'),
      resolved: getComputedStyle(document.documentElement)
        .getPropertyValue('--font-numeric')
        .trim(),
      jbWidth: measure('"Martian Mono"'),
      genericMonoWidth: measure('monospace'),
    }
  })
  log(`  Martian Mono faces: ${JSON.stringify(monoState.faces)}`)
  log(`  --font-numeric resolves to: ${monoState.resolved}`)
  log(
    `  digits at 40px, Martian vs generic mono: ${monoState.jbWidth.toFixed(1)} vs ${monoState.genericMonoWidth.toFixed(1)}`,
  )
  check(
    'Martian Mono is registered and loaded, not just named',
    monoState.faces.length > 0 &&
      monoState.faces.some((f) => f.status === 'loaded') &&
      monoState.check14,
    JSON.stringify(monoState.faces),
  )
  check(
    'Martian Mono leads --font-numeric, so the bundled face is what resolves',
    /^'?"?Martian Mono/.test(monoState.resolved),
    monoState.resolved,
  )
  check(
    'with JetBrains Mono behind it as a second self-hosted fallback',
    /Martian Mono['"]?,\s*['"]?JetBrains Mono/.test(monoState.resolved),
    monoState.resolved,
  )
  check(
    'and its woff2 came from this origin, not a CDN',
    fontReqs.some((u) => /martian-mono/.test(u)) &&
      fontReqs
        .filter((u) => /martian-mono/.test(u))
        .every((u) => u.startsWith(`http://localhost:${PORT}/pokeapp/`)),
    fontReqs.filter((u) => /martian-mono/.test(u)).join(' ') || 'no martian-mono request',
  )

  // -------------------------------------------------------- no shadows
  hr('ELEVATION — no shadow on anything, in either theme')
  const shadows = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll(
      '[data-testid="dex-designsystem"], [data-testid="dex-designsystem"] *',
    )) {
      const cs = getComputedStyle(el)
      if (cs.boxShadow !== 'none' || cs.textShadow !== 'none') {
        out.push({
          el: el.tagName + (el.className ? `.${String(el.className).split(' ')[0]}` : ''),
          box: cs.boxShadow,
          text: cs.textShadow,
        })
      }
    }
    return {
      offenders: out,
      total: document.querySelectorAll('[data-testid="dex-designsystem"] *').length,
    }
  })
  log(`  elements checked: ${shadows.total}, with a shadow: ${shadows.offenders.length}`)
  shadows.offenders.slice(0, 5).forEach((o) => log(`      ${o.el}: box=${o.box} text=${o.text}`))
  check('no element renders a shadow', shadows.offenders.length === 0)
  check('and there were real elements to check', shadows.total > 100, `(${shadows.total})`)

  // ------------------------------------------------------- components
  hr('COMPONENTS — specs from §5 / §10, measured in the light panel')
  const comp = await page.evaluate(() => {
    // Any light panel, not just the first: each component has its own pair, so a
    // single panel does not contain them all.
    const inPanel = (sel) => document.querySelector(`[data-demo-theme="light"] ${sel}`)
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const all = (sel) => [...document.querySelectorAll(sel)]

    const primary = cs(inPanel('[data-ds="button-primary"]'))
    const secondary = cs(inPanel('[data-ds="button-secondary"]'))
    const toggle = document.querySelector('[data-ds="toggle"]')
    const track = cs(toggle?.querySelector('.ds-toggle-track'))
    const activeTab = cs(document.querySelector('[data-ds="tab"][aria-selected="true"]'))
    const idleTab = cs(document.querySelector('[data-ds="tab"][aria-selected="false"]'))

    const fieldByState = (state) => {
      const f = document.querySelector(`[data-ds="text-field"][data-state="${state}"]`)
      return {
        border: cs(f?.querySelector('.ds-field-control')).borderBottomWidth,
        color: cs(f?.querySelector('.ds-field-control')).borderBottomColor,
        labelOpacity: cs(f?.querySelector('.ds-field-label')).opacity,
        controlOpacity: cs(f?.querySelector('.ds-field-control')).opacity,
      }
    }

    const statValue = cs(inPanel('[data-ds="stat-row"] .ds-stat-value'))
    const ledgerCaught = document.querySelector('[data-ds="ledger-row"][data-caught="true"]')
    const ledgerNot = document.querySelector('[data-ds="ledger-row"][data-caught="false"]')
    const gridCard = inPanel('[data-ds="grid-card"]')
    const gridGhost = inPanel('[data-ds="ghost-watermark"][data-scale="grid"]')
    const heroCard = inPanel('[data-ds="hero-card"]')
    const heroGhost = inPanel('[data-ds="ghost-watermark"][data-scale="hero"]')
    const heroEra = inPanel('[data-ds="hero-era"]')
    const typeLabel = inPanel('[data-ds="type-label"]')

    return {
      primary: {
        background: primary.backgroundColor,
        color: primary.color,
        radius: primary.borderTopLeftRadius,
        borderWidth: primary.borderTopWidth,
      },
      secondary: {
        background: secondary.backgroundColor,
        borderWidth: secondary.borderTopWidth,
        borderColor: secondary.borderTopColor,
      },
      toggleOff: { background: track.backgroundColor, radius: track.borderTopLeftRadius },
      tabs: {
        activeColor: activeTab.color,
        activeUnderline: activeTab.borderBottomWidth,
        activeUnderlineColor: activeTab.borderBottomColor,
        activeWeight: activeTab.fontWeight,
        idleColor: idleTab.color,
        idleUnderline: idleTab.borderBottomColor,
      },
      fields: {
        default: fieldByState('default'),
        focus: fieldByState('focus'),
        disabled: fieldByState('disabled'),
        error: fieldByState('error'),
      },
      errorMsgColor: cs(document.querySelector('.ds-field-error')).color,
      successIcon: (() => {
        const svg = document.querySelector('[data-ds="field-success-icon"]')
        return svg
          ? {
              tag: svg.tagName.toLowerCase(),
              stroke: svg.getAttribute('stroke-width'),
              cls: svg.getAttribute('class'),
              color: getComputedStyle(svg).color,
            }
          : null
      })(),
      stat: { fontFamily: statValue.fontFamily, weight: statValue.fontWeight },
      barsInStatRows: all('[data-ds="stat-row"] progress, [data-ds="stat-row"] .stat-track').length,
      ledger: {
        caughtOpacity: cs(ledgerCaught?.querySelector('.ds-ledger-num')).opacity,
        notCaughtOpacity: cs(ledgerNot?.querySelector('.ds-ledger-num')).opacity,
        ruleWidth: cs(ledgerCaught?.querySelector('.ds-ledger-rule')).width,
        ruleColor: cs(ledgerCaught?.querySelector('.ds-ledger-rule')).backgroundColor,
        spriteRadius: cs(ledgerCaught?.querySelector('.ds-ledger-sprite')).borderTopLeftRadius,
        spriteBorder: cs(ledgerCaught?.querySelector('.ds-ledger-sprite')).borderTopWidth,
        numFont: cs(ledgerCaught?.querySelector('.ds-ledger-num')).fontFamily,
      },
      grid: {
        background: cs(gridCard).backgroundColor,
        borderWidth: cs(gridCard).borderTopWidth,
        radius: cs(gridCard).borderTopLeftRadius,
        ghostSize: cs(gridGhost).fontSize,
        ghostOpacity: cs(gridGhost).opacity,
        ghostColor: cs(gridGhost).color,
        ghostFont: cs(gridGhost).fontFamily,
      },
      hero: {
        radius: cs(heroCard).borderTopLeftRadius,
        padding: cs(heroCard).paddingTop,
        background: cs(heroCard).backgroundColor,
        borderWidth: cs(heroCard).borderTopWidth,
        ghostSize: cs(heroGhost).fontSize,
        ghostOpacity: cs(heroGhost).opacity,
        eraTransform: cs(heroEra).transform,
        eraSize: cs(heroEra).fontSize,
        badgeRadius: cs(inPanel('.ds-mini-badge')).borderTopLeftRadius,
        badgeBackground: cs(inPanel('.ds-mini-badge')).backgroundColor,
      },
      typeLabel: {
        text: typeLabel.textContent,
        type: typeLabel.dataset.type,
        color: cs(typeLabel).color,
        background: cs(typeLabel).backgroundColor,
        radius: cs(typeLabel).borderTopLeftRadius,
        transform: cs(typeLabel).textTransform,
        weight: cs(typeLabel).fontWeight,
      },
    }
  })

  const rgb = (hex) => hexToRgb(hex)
  log(`  primary button: ${JSON.stringify(comp.primary)}`)
  check(
    'primary button uses --button-primary-fill',
    comp.primary.background === rgb(EXPECTED.light['--button-primary-fill']),
    comp.primary.background,
  )
  check(
    'with --button-primary-text on it',
    comp.primary.color === rgb(EXPECTED.light['--button-primary-text']),
  )
  check('at --radius-control', comp.primary.radius === SCALE['--radius-control'])
  check('and no border', comp.primary.borderWidth === '0px')
  check('secondary button is transparent', comp.secondary.background === 'rgba(0, 0, 0, 0)')
  check(
    'with a 1px hairline border',
    comp.secondary.borderWidth === '1px' &&
      comp.secondary.borderColor === rgb(EXPECTED.light['--hairline']),
    `${comp.secondary.borderWidth} ${comp.secondary.borderColor}`,
  )

  log(`  toggle track: ${JSON.stringify(comp.toggleOff)}`)
  check('the toggle track uses --radius-pill', comp.toggleOff.radius === SCALE['--radius-pill'])

  // Toggling it on must move to --accent -- the accent's second sanctioned use.
  const toggleState = () =>
    page.evaluate(() => {
      const t = document.querySelector('[data-demo-theme="light"] [data-ds="toggle"]')
      return {
        pressed: t.getAttribute('aria-pressed'),
        background: getComputedStyle(t.querySelector('.ds-toggle-track')).backgroundColor,
        thumbLeft: getComputedStyle(t.querySelector('.ds-toggle-thumb')).left,
      }
    })
  const before = await toggleState()
  await page.click('[data-demo-theme="light"] [data-ds="toggle"]')
  await page.waitForTimeout(200)
  const after = await toggleState()
  log(`  toggle: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
  check('clicking it flips aria-pressed', before.pressed !== after.pressed)
  const [onState, offState] = before.pressed === 'true' ? [before, after] : [after, before]
  check(
    'the on state fills the track with --accent',
    onState.background === rgb(EXPECTED.light['--accent']),
    onState.background,
  )
  check(
    'the off state is --hairline',
    offState.background === rgb(EXPECTED.light['--hairline']),
    offState.background,
  )
  check(
    'and the thumb moves',
    onState.thumbLeft !== offState.thumbLeft,
    `${offState.thumbLeft} -> ${onState.thumbLeft}`,
  )
  await page.click('[data-demo-theme="light"] [data-ds="toggle"]')

  log(`  tabs: ${JSON.stringify(comp.tabs)}`)
  check(
    'the active tab is --accent',
    comp.tabs.activeColor === rgb(EXPECTED.light['--accent']),
    comp.tabs.activeColor,
  )
  check(
    'with a 2px accent underline',
    comp.tabs.activeUnderline === '2px' &&
      comp.tabs.activeUnderlineColor === rgb(EXPECTED.light['--accent']),
    `${comp.tabs.activeUnderline} ${comp.tabs.activeUnderlineColor}`,
  )
  check('and bold weight', comp.tabs.activeWeight === SCALE['--font-weight-bold'])
  check(
    'inactive tabs are --text-secondary with no underline',
    comp.tabs.idleColor === rgb(EXPECTED.light['--text-secondary']) &&
      comp.tabs.idleUnderline === 'rgba(0, 0, 0, 0)',
    `${comp.tabs.idleColor} ${comp.tabs.idleUnderline}`,
  )

  log(`  fields: ${JSON.stringify(comp.fields)}`)
  check(
    'default field: 1px hairline underline',
    comp.fields.default.border === '1px' &&
      comp.fields.default.color === rgb(EXPECTED.light['--hairline']),
    `${comp.fields.default.border} ${comp.fields.default.color}`,
  )
  check(
    'focus: 2px accent underline, reusing the active-tab language',
    comp.fields.focus.border === '2px' &&
      comp.fields.focus.color === rgb(EXPECTED.light['--accent']),
    `${comp.fields.focus.border} ${comp.fields.focus.color}`,
  )
  check(
    'disabled: label and value both at 40%',
    comp.fields.disabled.labelOpacity === '0.4' && comp.fields.disabled.controlOpacity === '0.4',
    `${comp.fields.disabled.labelOpacity} / ${comp.fields.disabled.controlOpacity}`,
  )
  check(
    'error: accent underline, still 1px',
    comp.fields.error.border === '1px' &&
      comp.fields.error.color === rgb(EXPECTED.light['--accent']),
    `${comp.fields.error.border} ${comp.fields.error.color}`,
  )
  check(
    'error message is in --accent',
    comp.errorMsgColor === rgb(EXPECTED.light['--accent']),
    comp.errorMsgColor,
  )
  log(`  success icon: ${JSON.stringify(comp.successIcon)}`)
  check('the success state is an icon, not a new colour', comp.successIcon?.tag === 'svg')
  check('it is a Tabler icon', /tabler/.test(comp.successIcon?.cls ?? ''), comp.successIcon?.cls)
  check(
    'at the locked 1.5 stroke width',
    comp.successIcon?.stroke === '1.5',
    String(comp.successIcon?.stroke),
  )
  check(
    'in --text-primary, not a status-green',
    comp.successIcon?.color === rgb(EXPECTED.light['--text-primary']),
    comp.successIcon?.color,
  )

  log(`  stat value: ${JSON.stringify(comp.stat)}, bars found: ${comp.barsInStatRows}`)
  check(
    'stat values use the numeric font',
    /SF Mono|JetBrains Mono|Consolas|monospace/.test(comp.stat.fontFamily),
  )
  check('and bold weight', comp.stat.weight === SCALE['--font-weight-bold'])
  check('no stat row contains a progress bar', comp.barsInStatRows === 0)

  log(`  ledger: ${JSON.stringify(comp.ledger)}`)
  check('a caught row shows the number at full opacity', comp.ledger.caughtOpacity === '1')
  check('a not-caught row dims it to 40%', comp.ledger.notCaughtOpacity === '0.4')
  check(
    'the number column has a 1px hairline rule beside it',
    comp.ledger.ruleWidth === '1px' && comp.ledger.ruleColor === rgb(EXPECTED.light['--hairline']),
    `${comp.ledger.ruleWidth} ${comp.ledger.ruleColor}`,
  )
  check(
    'the sprite is a circle with a visible outline',
    comp.ledger.spriteRadius === '50%' && parseFloat(comp.ledger.spriteBorder) > 0,
    `${comp.ledger.spriteRadius} ${comp.ledger.spriteBorder}`,
  )
  // Chrome rounds the used border-width to whole device pixels (1px at DPR 1), so
  // the authored value is checked in the source instead.
  check(
    'and it is authored at the 1.5px the spec asks for',
    /\.ds-ledger-sprite \{[^}]*border: 1\.5px solid var\(--hairline\)/s.test(
      readFileSync('src/components/ds/ds.css', 'utf8'),
    ),
  )
  check(
    'the dex number is monospace',
    /SF Mono|JetBrains Mono|Consolas|monospace/.test(comp.ledger.numFont),
  )

  log(`  grid card: ${JSON.stringify(comp.grid)}`)
  check('the grid card has no background fill', comp.grid.background === 'rgba(0, 0, 0, 0)')
  check('and no border', comp.grid.borderWidth === '0px')
  check(
    'its watermark is the grid-scale token',
    comp.grid.ghostSize === SCALE['--font-size-ghost-watermark-grid'],
    comp.grid.ghostSize,
  )
  check(
    "at light mode's ghost-watermark opacity",
    comp.grid.ghostOpacity === GHOST_OPACITY.light,
    comp.grid.ghostOpacity,
  )
  check(
    'in --ghost-watermark',
    comp.grid.ghostColor === rgb(EXPECTED.light['--ghost-watermark']),
    comp.grid.ghostColor,
  )
  // Display type, not tabular data: the watermark is the one number in the system
  // that takes --font-body. Every functional number keeps --font-numeric.
  check(
    'and the proportional display font, not the mono one',
    /^"?IBM Plex Sans"?/.test(comp.grid.ghostFont),
    comp.grid.ghostFont,
  )

  log(`  hero card: ${JSON.stringify(comp.hero)}`)
  check('hero card radius is --radius-card', comp.hero.radius === SCALE['--radius-card'])
  check('padding is --space-card-padding', comp.hero.padding === SCALE['--space-card-padding'])
  check(
    'background is --surface',
    comp.hero.background === rgb(EXPECTED.light['--surface']),
    comp.hero.background,
  )
  check('no border', comp.hero.borderWidth === '0px')
  check(
    'its watermark is the hero-scale token, same opacity as the grid',
    comp.hero.ghostSize === SCALE['--font-size-ghost-watermark'] &&
      comp.hero.ghostOpacity === comp.grid.ghostOpacity,
    `${comp.hero.ghostSize} / ${comp.hero.ghostOpacity}`,
  )
  // rotate(-90deg) is matrix(0, -1, 1, 0, ...)
  check(
    'the era micro-label is rotated -90deg',
    /^matrix\(0, -1, 1, 0/.test(comp.hero.eraTransform),
    comp.hero.eraTransform,
  )
  check('at caption size', comp.hero.eraSize === SCALE['--font-size-caption'])
  check('mini badges use --radius-pill', comp.hero.badgeRadius === SCALE['--radius-pill'])
  check(
    'and --mini-badge-fill',
    comp.hero.badgeBackground === 'rgba(0, 0, 0, 0.05)',
    comp.hero.badgeBackground,
  )

  log(`  type label: ${JSON.stringify(comp.typeLabel)}`)
  check(
    'the type label is coloured text with no fill',
    comp.typeLabel.background === 'rgba(0, 0, 0, 0)',
    comp.typeLabel.background,
  )
  check('and no badge radius', comp.typeLabel.radius === '0px', comp.typeLabel.radius)
  check(
    `its colour is the --type-${comp.typeLabel.type} token`,
    comp.typeLabel.color === rgb(EXPECTED.light[`--type-${comp.typeLabel.type}`]),
    `${comp.typeLabel.color} vs ${EXPECTED.light[`--type-${comp.typeLabel.type}`]}`,
  )
  check(
    'uppercase and bold',
    comp.typeLabel.transform === 'uppercase' &&
      comp.typeLabel.weight === SCALE['--font-weight-bold'],
  )

  // Every rendered type label must match its token, in both themes.
  for (const theme of ['light', 'dark']) {
    const mismatches = await page.evaluate(
      ([expected, demoTheme]) => {
        const out = []
        for (const el of document.querySelectorAll(
          `[data-demo-theme="${demoTheme}"] [data-ds="type-label"]`,
        )) {
          const want = expected[`--type-${el.dataset.type}`]
          const got = getComputedStyle(el).color
          out.push({ type: el.dataset.type, want, got })
        }
        return out
      },
      [EXPECTED[theme], theme],
    )
    const wrong = mismatches.filter((m) => m.got !== hexToRgb(m.want))
    log(`  ${theme}: ${mismatches.length} type labels rendered, ${wrong.length} off-token`)
    wrong.slice(0, 4).forEach((m) => log(`      ${m.type}: want ${m.want}, got ${m.got}`))
    check(
      `every type label matches its ${theme} token`,
      wrong.length === 0 && mismatches.length > 0,
    )
  }

  // ------------------------------------------------- detail page layering
  hr('DETAIL PAGE — layering rule and the two background modes')
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ds="detail-page"][data-mode="tinted"]').length > 0,
    { timeout: 30000 },
  )
  const detail = await page.evaluate(() => {
    const read = (el) => {
      const cs = getComputedStyle(el)
      const drawer = el.querySelector('[data-ds="detail-drawer"]')
      const art = el.querySelector('[data-ds="detail-art-panel"]')
      const dcs = getComputedStyle(drawer)
      return {
        dex: el.dataset.dex,
        mode: el.dataset.mode,
        theme: el.closest('[data-demo-theme]')?.dataset.demoTheme,
        background: cs.backgroundColor,
        drawerBackground: dcs.backgroundColor,
        drawerRadius: [
          dcs.borderTopLeftRadius,
          dcs.borderTopRightRadius,
          dcs.borderBottomRightRadius,
          dcs.borderBottomLeftRadius,
        ],
        drawerOverflowY: dcs.overflowY,
        drawerShadow: dcs.boxShadow,
        artBackground: getComputedStyle(art).backgroundColor,
        artOverflow: getComputedStyle(art).overflowY,
      }
    }
    return [...document.querySelectorAll('[data-ds="detail-page"]')].map(read)
  })
  for (const d of detail) {
    log(`  #${d.dex} ${d.mode}/${d.theme}: page ${d.background}, drawer ${d.drawerBackground}`)
  }
  const tinted = detail.filter((d) => d.mode === 'tinted')
  const standard = detail.filter((d) => d.mode === 'standard')
  check('both background modes are rendered', tinted.length > 0 && standard.length > 0)

  for (const d of detail) {
    const raised = EXPECTED[d.theme === 'dark' ? 'dark' : 'light']['--surface-raised']
    check(
      `#${d.dex} (${d.mode}, ${d.theme}): the drawer stays --surface-raised`,
      d.drawerBackground === hexToRgb(raised),
      `${d.drawerBackground} vs ${raised}`,
    )
    check(
      `#${d.dex} (${d.mode}, ${d.theme}): the drawer is rounded only on its exposed left side`,
      d.drawerRadius[0] === SCALE['--radius-drawer'] &&
        d.drawerRadius[3] === SCALE['--radius-drawer'] &&
        d.drawerRadius[1] === '0px' &&
        d.drawerRadius[2] === '0px',
      d.drawerRadius.join('/'),
    )
    check(
      `#${d.dex} (${d.mode}, ${d.theme}): the drawer scrolls internally, the artwork panel does not`,
      d.drawerOverflowY === 'auto' && d.artOverflow !== 'auto' && d.artOverflow !== 'scroll',
      `${d.drawerOverflowY} / ${d.artOverflow}`,
    )
    check(
      `#${d.dex} (${d.mode}, ${d.theme}): no shadow separates the drawer from the page`,
      d.drawerShadow === 'none',
    )
    check(
      `#${d.dex} (${d.mode}, ${d.theme}): the artwork panel is transparent, so the shared layer shows through`,
      d.artBackground === 'rgba(0, 0, 0, 0)',
      d.artBackground,
    )
  }

  // The tint must be the exact published pair for that species and theme.
  for (const d of tinted) {
    const pair = localTints[String(d.dex).padStart(3, '0')]
    const want = d.theme === 'dark' ? pair.bg_dark : pair.bg_light
    check(
      `#${d.dex} (${d.theme}) is tinted with the published ${d.theme} colour ${want}`,
      d.background === hexToRgb(want),
      `${d.background} vs ${hexToRgb(want)}`,
    )
  }
  for (const d of standard) {
    const want = EXPECTED[d.theme === 'dark' ? 'dark' : 'light']['--surface']
    check(
      `#${d.dex} (${d.theme}) standard mode is plain --surface`,
      d.background === hexToRgb(want),
      `${d.background} vs ${hexToRgb(want)}`,
    )
  }
  // The tint table is fetched from the sprites repo, not bundled.
  const tintReq = requests.filter((u) => u.includes('species-background-colors.json'))
  log(`  tint-table requests: ${tintReq.join(', ') || 'none'}`)
  check(
    'the tint table is fetched from the sprites repo rather than bundled',
    tintReq.length > 0 && tintReq.every((u) => u.includes('raw.githubusercontent.com')),
  )
  check(
    'and no copy of it was added to public/data',
    !requests.some((u) => u.includes('/pokeapp/data/species-background-colors.json')),
  )

  // ---------------------------------------------------- the shared shell
  //
  // Structure comes from the simplification pass, not the Figma frames: three nav
  // groups with dropdowns rather than a flat tab row, and every permanently
  // visible control moved behind one toggle. What still comes from the frames --
  // and is still asserted -- is the treatment: --surface bar, hairline rule under
  // the row, colour-only active state with no underline, and the token type scale.
  hr('SHELL — three nav groups, one controls toggle, no persistent controls')
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    await setTheme(theme)
    await page.goto(APP_URL, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
    // A hovered trigger repaints and a hovered group opens, so park the pointer.
    await page.mouse.move(1200, 900)
    const want = EXPECTED[theme]

    const shell = await page.evaluate(() => {
      const cs = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el) : null
      }
      const bar = cs('.app-bar')
      const brand = cs('[data-testid="app-brand"]')
      const active = cs('.nav-trigger-active')
      const idle = cs('.nav-trigger:not(.nav-trigger-active)')
      const shadows = []
      for (const el of document.querySelectorAll('.app-bar, .app-bar *')) {
        const s = getComputedStyle(el)
        if (s.boxShadow !== 'none' || s.textShadow !== 'none') {
          shadows.push(el.tagName + '.' + String(el.className).split(' ')[0] + ': ' + s.boxShadow)
        }
      }
      const brandEl = document.querySelector('[data-testid="app-brand"]')
      const triggers = [...document.querySelectorAll('.nav-trigger')]
      const visible = (el) => el != null && el.getClientRects().length > 0
      return {
        elements: document.querySelectorAll('.app-bar *').length,
        shadows,
        triggerLabels: triggers.map((t) => t.textContent.trim()),
        gapAfterBrand:
          triggers.length > 0
            ? triggers[0].getBoundingClientRect().left - brandEl.getBoundingClientRect().right
            : null,
        gapBetweenTriggers:
          triggers.length > 1
            ? triggers[1].getBoundingClientRect().left - triggers[0].getBoundingClientRect().right
            : null,
        // Item 1: the design-system reference must not appear in the nav at all.
        designSystemInNav:
          document.querySelector('[data-testid="nav-designsystem"]') != null ||
          [...document.querySelectorAll('.app-bar button, .app-bar a')].some((el) =>
            /design\s*system/i.test(el.textContent ?? ''),
          ),
        // Item 3: none of the three controls may be on screen by default.
        visibleByDefault: {
          speciesSearch: visible(document.querySelector('[data-testid="species-search"]')),
          typeFilterButtons: [...document.querySelectorAll('.tf')].filter(visible).length,
          gameSelect: visible(document.querySelector('[data-testid="vg-select"]')),
          globalSearch: visible(document.querySelector('[data-testid="global-search"]')),
        },
        // Item 4: one toggle, in the bar's top-right slot.
        toggle: (() => {
          const btn = document.querySelector('[data-testid="controls-toggle"]')
          if (!btn) return null
          const barBox = document.querySelector('.app-bar').getBoundingClientRect()
          const box = btn.getBoundingClientRect()
          return {
            expanded: btn.getAttribute('aria-expanded'),
            label: btn.getAttribute('aria-label'),
            color: getComputedStyle(btn).color,
            rightInset: Math.round(barBox.right - box.right),
            text: btn.textContent.trim(),
            svgCount: btn.querySelectorAll('svg').length,
            border: getComputedStyle(btn).borderTopWidth,
            background: getComputedStyle(btn).backgroundColor,
          }
        })(),
        panelOpen: visible(document.querySelector('[data-testid="controls-panel"]')),
        bar: {
          background: bar.backgroundColor,
          borderBottom: bar.borderBottomWidth + ' ' + bar.borderBottomColor,
          fontFamily: bar.fontFamily,
        },
        brand: {
          fontSize: brand.fontSize,
          weight: brand.fontWeight,
          color: brand.color,
          fontFamily: brand.fontFamily,
        },
        activeTrigger: {
          color: active.color,
          weight: active.fontWeight,
          fontSize: active.fontSize,
          borderBottomWidth: active.borderBottomWidth,
          background: active.backgroundColor,
          fontFamily: active.fontFamily,
        },
        idleTrigger: {
          color: idle.color,
          weight: idle.fontWeight,
          fontSize: idle.fontSize,
          borderBottomWidth: idle.borderBottomWidth,
          background: idle.backgroundColor,
        },
      }
    })
    log('  [' + theme + '] bar: ' + JSON.stringify(shell.bar))
    log('  [' + theme + '] triggers: ' + shell.triggerLabels.join(' | '))
    log('  [' + theme + '] active: ' + JSON.stringify(shell.activeTrigger))
    log('  [' + theme + '] idle: ' + JSON.stringify(shell.idleTrigger))
    log('  [' + theme + '] toggle: ' + JSON.stringify(shell.toggle))
    log('  [' + theme + '] visible by default: ' + JSON.stringify(shell.visibleByDefault))

    check(
      '[' + theme + '] the bar sits on --surface',
      shell.bar.background === hexToRgb(want['--surface']),
      shell.bar.background,
    )
    check(
      '[' + theme + '] with a 1px hairline rule under the row',
      shell.bar.borderBottom === '1px ' + hexToRgb(want['--hairline']),
      shell.bar.borderBottom,
    )
    check(
      '[' + theme + '] no shadow anywhere in the shell',
      shell.shadows.length === 0,
      shell.shadows.join(' | '),
    )
    check(
      '[' + theme + '] and there were real elements to check',
      shell.elements > 10,
      '(' + shell.elements + ')',
    )

    // ITEM 5: three groups, in this order, with Notes deliberately absent.
    check(
      '[' + theme + '] the nav is Poképedia / Team Building / Tools',
      JSON.stringify(shell.triggerLabels) ===
        JSON.stringify(['Poképedia', 'Team Building', 'Tools']),
      shell.triggerLabels.join(','),
    )
    check(
      '[' + theme + '] "Notes" is not in the nav',
      !shell.triggerLabels.some((l) => /notes/i.test(l)),
    )

    // ITEM 1: the design-system reference is gone from the nav entirely.
    check(
      '[' + theme + '] no Design system tab anywhere in the bar',
      shell.designSystemInNav === false,
    )

    // ITEM 3: nothing that was removed may render by default.
    check(
      '[' + theme + '] the species search is not on screen by default',
      shell.visibleByDefault.speciesSearch === false,
    )
    check(
      '[' + theme + '] no type-filter buttons are on screen by default',
      shell.visibleByDefault.typeFilterButtons === 0,
      '(' + shell.visibleByDefault.typeFilterButtons + ' visible)',
    )
    check(
      '[' + theme + '] the game selector is not on screen by default',
      shell.visibleByDefault.gameSelect === false,
    )
    check(
      '[' + theme + '] nor is the cross-dex search, which moved into the panel',
      shell.visibleByDefault.globalSearch === false,
    )
    check('[' + theme + '] and the panel itself starts closed', shell.panelOpen === false)

    // ITEM 4: the toggle, its icon, and where it sits.
    check(
      '[' + theme + "] there is one controls toggle at the bar's right edge",
      shell.toggle != null && Math.abs(shell.toggle.rightInset) <= 2,
      shell.toggle ? shell.toggle.rightInset + 'px inset' : 'missing',
    )
    check(
      '[' + theme + '] it is a text-only ghost button reading "Search/filter species"',
      shell.toggle?.text === 'Search/filter species' && shell.toggle.svgCount === 0,
      JSON.stringify(shell.toggle),
    )
    check(
      '[' + theme + '] with no border and no fill, per the ghost treatment',
      shell.toggle?.border === '0px' && /rgba\(0, 0, 0, 0\)/.test(shell.toggle.background ?? ''),
      shell.toggle?.border + ' / ' + shell.toggle?.background,
    )
    check(
      '[' + theme + '] in --text-secondary while closed, and it reports its state',
      shell.toggle?.color === hexToRgb(want['--text-secondary']) &&
        shell.toggle.expanded === 'false',
      shell.toggle?.color + ' / aria-expanded=' + shell.toggle?.expanded,
    )

    // Typography: unchanged from the Figma pass, on the renamed elements.
    for (const pair of [
      ['bar', shell.bar.fontFamily],
      ['brand', shell.brand.fontFamily],
      ['nav labels', shell.activeTrigger.fontFamily],
    ]) {
      check(
        '[' + theme + '] ' + pair[0] + ' resolves to IBM Plex Sans, not the system stack',
        /^"?IBM Plex Sans"?/.test(pair[1]),
        pair[1],
      )
    }
    check(
      '[' + theme + '] brand and nav labels share --font-size-body',
      shell.brand.fontSize === SCALE['--font-size-body'] &&
        shell.activeTrigger.fontSize === SCALE['--font-size-body'] &&
        shell.idleTrigger.fontSize === SCALE['--font-size-body'],
      shell.brand.fontSize + ' / ' + shell.activeTrigger.fontSize,
    )
    check(
      '[' + theme + '] all of them at --font-weight-medium; only colour separates them',
      shell.brand.weight === SCALE['--font-weight-medium'] &&
        shell.activeTrigger.weight === SCALE['--font-weight-medium'] &&
        shell.idleTrigger.weight === SCALE['--font-weight-medium'],
      shell.brand.weight + ' / ' + shell.activeTrigger.weight + ' / ' + shell.idleTrigger.weight,
    )
    check(
      '[' + theme + '] the brand is --text-primary',
      shell.brand.color === hexToRgb(want['--text-primary']),
      shell.brand.color,
    )
    check(
      '[' + theme + "] the brand-to-nav gap keeps Figma's 8.5px rhythm",
      Math.abs(shell.gapAfterBrand - 8.5) <= 0.6,
      '(' + shell.gapAfterBrand.toFixed(2) + 'px)',
    )
    check(
      '[' + theme + '] and so does the gap between nav groups',
      Math.abs(shell.gapBetweenTriggers - 8.5) <= 0.6,
      '(' + shell.gapBetweenTriggers.toFixed(2) + 'px)',
    )

    // Active state: colour only, still no underline and still no fill.
    check(
      '[' + theme + '] the active nav item is --accent',
      shell.activeTrigger.color === hexToRgb(want['--accent']),
      shell.activeTrigger.color,
    )
    check(
      '[' + theme + '] and carries NO underline (Figma has no such node)',
      shell.activeTrigger.borderBottomWidth === '0px',
      shell.activeTrigger.borderBottomWidth,
    )
    check(
      '[' + theme + '] inactive items are --text-secondary, also with no underline',
      shell.idleTrigger.color === hexToRgb(want['--text-secondary']) &&
        shell.idleTrigger.borderBottomWidth === '0px',
      shell.idleTrigger.color + ' / ' + shell.idleTrigger.borderBottomWidth,
    )
    check(
      '[' + theme + '] no nav item carries a background fill',
      shell.activeTrigger.background === 'rgba(0, 0, 0, 0)' &&
        shell.idleTrigger.background === 'rgba(0, 0, 0, 0)',
      shell.activeTrigger.background + ' / ' + shell.idleTrigger.background,
    )

    // ITEM 2: the cards must be on exactly the bar's ground. Ghost cards have no
    // fill of their own, so this compares the bar's painted colour against what
    // is actually painted behind a card -- the nearest ancestor with a
    // non-transparent background.
    const grounds = await page.evaluate(() => {
      const painted = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            return { color: bg, from: n.tagName + '.' + String(n.className).split(' ')[0] }
          }
        }
        return { color: null, from: null }
      }
      const card = document.querySelector('.species-card')
      return {
        bar: getComputedStyle(document.querySelector('.app-bar')).backgroundColor,
        cardOwn: getComputedStyle(card).backgroundColor,
        cardGround: painted(card),
      }
    })
    log('  [' + theme + '] grounds: ' + JSON.stringify(grounds))
    check(
      '[' + theme + '] the card itself has zero background fill',
      grounds.cardOwn === 'rgba(0, 0, 0, 0)',
      grounds.cardOwn,
    )
    check(
      '[' + theme + '] and the ground behind it is byte-identical to the nav bar',
      grounds.cardGround.color === grounds.bar,
      'card ground ' +
        grounds.cardGround.color +
        ' (' +
        grounds.cardGround.from +
        ') vs bar ' +
        grounds.bar,
    )
    check(
      '[' + theme + '] which is --surface, not --surface-raised or a species tint',
      grounds.bar === hexToRgb(want['--surface']),
      grounds.bar + ' vs --surface ' + hexToRgb(want['--surface']),
    )

    // The panel: full95 dropdown container, and it really does reveal the three.
    await page.click('[data-testid="controls-toggle"]')
    await page.waitForSelector('[data-testid="species-search"]', { timeout: 15000 })
    const opened = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="controls-panel"]')
      const cs = getComputedStyle(panel)
      const visible = (el) => el != null && el.getClientRects().length > 0
      return {
        background: cs.backgroundColor,
        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
        speciesSearch: visible(document.querySelector('[data-testid="species-search"]')),
        typeFilterButtons: [...document.querySelectorAll('.tf')].filter(visible).length,
        gameSelect: visible(document.querySelector('[data-testid="vg-select"]')),
        globalSearch: visible(document.querySelector('[data-testid="global-search"]')),
        insidePanel: ['species-search', 'vg-select', 'global-search'].every(
          (id) =>
            document
              .querySelector('[data-testid="' + id + '"]')
              ?.closest('[data-testid="controls-panel"]') != null,
        ),
        toggleColor: getComputedStyle(document.querySelector('[data-testid="controls-toggle"]'))
          .color,
        expanded: document
          .querySelector('[data-testid="controls-toggle"]')
          .getAttribute('aria-expanded'),
      }
    })
    log('  [' + theme + '] opened: ' + JSON.stringify(opened))
    check(
      '[' + theme + '] the toggle reveals all three controls, plus the cross-dex search',
      opened.speciesSearch &&
        opened.gameSelect &&
        opened.globalSearch &&
        opened.typeFilterButtons > 10,
      JSON.stringify(opened),
    )
    check('[' + theme + '] all of them inside the revealed panel', opened.insidePanel)
    check(
      '[' + theme + '] the panel is --surface-raised with a hairline border and no shadow',
      opened.background === hexToRgb(want['--surface-raised']) &&
        opened.border === '1px ' + hexToRgb(want['--hairline']) &&
        opened.shadow === 'none',
      opened.background + ' / ' + opened.border + ' / ' + opened.shadow,
    )
    check(
      '[' + theme + '] at --radius-control, per the full95 dropdown spec',
      opened.radius === SCALE['--radius-control'],
      opened.radius,
    )
    check(
      '[' + theme + '] and the toggle now reports expanded, in --accent',
      opened.expanded === 'true' && opened.toggleColor === hexToRgb(want['--accent']),
      opened.expanded + ' / ' + opened.toggleColor,
    )
    // The cross-dex search still works from in here.
    await page.fill('[data-testid="global-search"]', 'sand')
    await page.waitForSelector('[data-testid="global-search-results"]', { timeout: 15000 })
    const results = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-testid="global-search-results"]'))
      return {
        background: cs.backgroundColor,
        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
        shadow: cs.boxShadow,
        groups: document.querySelectorAll('[data-testid="global-search-results"] .gs-group').length,
      }
    })
    log('  [' + theme + '] results: ' + JSON.stringify(results))
    check(
      '[' + theme + '] the search still returns grouped results from inside the panel',
      results.groups > 0,
      '(' + results.groups + ' groups)',
    )
    check(
      '[' + theme + '] its results panel is still --surface-raised, hairline, no shadow',
      results.background === hexToRgb(want['--surface-raised']) &&
        results.border === '1px ' + hexToRgb(want['--hairline']) &&
        results.shadow === 'none',
      results.background + ' / ' + results.border + ' / ' + results.shadow,
    )
    await page.fill('[data-testid="global-search"]', '')
    await page.screenshot({ path: SHOTS + '/shell-' + theme + '-open.png' })
    // Closing again must genuinely remove them from view.
    await page.click('[data-testid="controls-toggle"]')
    await page.waitForTimeout(120)
    const closed = await page.evaluate(() => {
      const visible = (el) => el != null && el.getClientRects().length > 0
      return {
        speciesSearch: visible(document.querySelector('[data-testid="species-search"]')),
        gameSelect: visible(document.querySelector('[data-testid="vg-select"]')),
        globalSearch: visible(document.querySelector('[data-testid="global-search"]')),
      }
    })
    check(
      '[' + theme + '] clicking it again hides them all again',
      !closed.speciesSearch && !closed.gameSelect && !closed.globalSearch,
      JSON.stringify(closed),
    )
    await page.screenshot({ path: SHOTS + '/shell-' + theme + '.png' })
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await setTheme('light')

  // ------------------------------------------------- nav dropdown behaviour
  hr('NAV DROPDOWNS — hover, focus, and the full95 dropdown container')
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })
  await page.mouse.move(1200, 900)

  const dropdownClosed = await page.evaluate(() => {
    const visible = (el) => el != null && el.getClientRects().length > 0
    return {
      pokepedia: visible(document.querySelector('[data-testid="nav-dropdown-pokepedia"]')),
      team: visible(document.querySelector('[data-testid="nav-dropdown-team-building"]')),
      tools: visible(document.querySelector('[data-testid="nav-dropdown-tools"]')),
      // Still in the DOM, so the switcher stays a complete registry-ordered list.
      itemdexInDom: document.querySelector('[data-testid="nav-itemdex"]') != null,
      itemdexVisible: visible(document.querySelector('[data-testid="nav-itemdex"]')),
    }
  })
  log('  closed: ' + JSON.stringify(dropdownClosed))
  check(
    'every dropdown starts hidden',
    !dropdownClosed.pokepedia && !dropdownClosed.team && !dropdownClosed.tools,
    JSON.stringify(dropdownClosed),
  )
  check(
    'the other dexes stay in the DOM while hidden',
    dropdownClosed.itemdexInDom && !dropdownClosed.itemdexVisible,
  )

  // HOVER
  await openTab(page, 'pokepedia')
  await page.waitForTimeout(120)
  const hovered = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="nav-dropdown-pokepedia"]')
    const cs = getComputedStyle(panel)
    const items = [...panel.querySelectorAll('.nav-item')]
    const firstDivider = items[1] ? getComputedStyle(items[1]) : null
    return {
      visible: panel.getClientRects().length > 0,
      background: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow,
      items: items.map((el) => el.getAttribute('data-testid')),
      labels: items.map((el) => el.textContent.trim()),
      dividerTop: firstDivider
        ? firstDivider.borderTopWidth + ' ' + firstDivider.borderTopColor
        : null,
      expanded: document
        .querySelector('[data-testid="nav-tab-pokepedia"]')
        .getAttribute('aria-expanded'),
    }
  })
  log('  hovered: ' + JSON.stringify(hovered))
  check('hovering Poképedia opens its dropdown', hovered.visible)
  check('and the trigger reports it', hovered.expanded === 'true', String(hovered.expanded))
  // Six now, not five: Poképedia is the parent tab rather than the Pokedex
  // wearing two hats, so the Pokedex is an item like the rest.
  check(
    'it lists every registered dex, in registry order',
    JSON.stringify(hovered.items) ===
      JSON.stringify([
        'nav-pokedex',
        'nav-itemdex',
        'nav-abilitydex',
        'nav-naturedex',
        'nav-berrydex',
        'nav-movedex',
        'nav-breedingdex',
      ]),
    hovered.items.join(','),
  )
  check(
    'the panel is --surface-raised, hairline border, no shadow',
    hovered.background === hexToRgb(EXPECTED.light['--surface-raised']) &&
      hovered.border === '1px ' + hexToRgb(EXPECTED.light['--hairline']) &&
      hovered.shadow === 'none',
    hovered.background + ' / ' + hovered.border + ' / ' + hovered.shadow,
  )
  check(
    'with hairline dividers between items',
    hovered.dividerTop === '1px ' + hexToRgb(EXPECTED.light['--hairline']),
    String(hovered.dividerTop),
  )
  check('at --radius-control', hovered.radius === SCALE['--radius-control'], hovered.radius)
  await page.mouse.move(1200, 900)
  await page.waitForTimeout(150)
  check(
    'moving the pointer away closes it again',
    !(await page.evaluate(
      () =>
        document.querySelector('[data-testid="nav-dropdown-pokepedia"]').getClientRects().length >
        0,
    )),
  )

  // FOCUS — the correctness requirement: keyboard must reveal the same dropdown.
  for (const group of ['pokepedia', 'team-building', 'tools']) {
    const trigger = 'nav-tab-' + group
    await page.focus('[data-testid="' + trigger + '"]')
    await page.waitForTimeout(120)
    const focused = await page.evaluate((g) => {
      const panel = document.querySelector('[data-testid="nav-dropdown-' + g + '"]')
      return {
        visible: panel.getClientRects().length > 0,
        items: [...panel.querySelectorAll('.nav-item')].length,
      }
    }, group)
    log('  focus on ' + trigger + ': ' + JSON.stringify(focused))
    check(
      'keyboard focus alone opens the ' + group + ' dropdown, without any hover',
      focused.visible,
      JSON.stringify(focused),
    )
    // And Tab from the trigger must land inside it, not skip past.
    await page.keyboard.press('Tab')
    const landed = await page.evaluate(
      (g) =>
        document.activeElement?.closest('[data-testid="nav-dropdown-' + g + '"]') != null
          ? (document.activeElement.getAttribute('data-testid') ??
            document.activeElement.textContent.trim())
          : null,
      group,
    )
    log('  Tab from ' + trigger + ' lands on: ' + landed)
    check(
      'Tab from the trigger moves into the ' + group + ' dropdown',
      landed != null,
      String(landed),
    )
    // Escape closes it and returns focus to the trigger.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
    const afterEsc = await page.evaluate(
      (g) => ({
        visible:
          document.querySelector('[data-testid="nav-dropdown-' + g + '"]').getClientRects().length >
          0,
        focus: document.activeElement?.getAttribute('data-testid'),
      }),
      group,
    )
    check(
      'Escape closes the ' + group + ' dropdown and returns focus to its trigger',
      !afterEsc.visible && afterEsc.focus === trigger,
      JSON.stringify(afterEsc),
    )
  }

  // Team Building and Tools, both now full lists of real destinations.
  await page.hover('[data-testid="nav-tab-team-building"]')
  await page.waitForTimeout(120)
  const team = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="nav-dropdown-team-building"]')
    return {
      labels: [...panel.querySelectorAll('.nav-item')].map((el) => el.textContent.trim()),
      testids: [...panel.querySelectorAll('.nav-item')].map((el) => el.getAttribute('data-testid')),
      noneDisabled: [...panel.querySelectorAll('.nav-item')].every(
        (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true',
      ),
    }
  })
  log('  team items: ' + JSON.stringify(team))
  check(
    'Team Building lists its five destinations, in order',
    /* "Team Library" is now "My Teams": the stub graduated into a real screen and
       the nav label matches the screen's own name. The other four are unchanged. */
    JSON.stringify(team.labels) ===
      JSON.stringify(['New Team', 'New Build', 'My Teams', 'Build Library', 'Pokemon Collection']),
    team.labels.join(','),
  )
  // They lead to stub pages, but they are real destinations now, so nothing is
  // inert and nothing needs aria-disabled to stay keyboard-reachable.
  check(
    'all five are live destinations, none inert',
    team.noneDisabled,
    JSON.stringify(team.testids),
  )
  await page.hover('[data-testid="nav-tab-tools"]')
  await page.waitForTimeout(120)
  const tools = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="nav-dropdown-tools"]')
    return {
      visible: panel.getClientRects().length > 0,
      labels: [...panel.querySelectorAll('.nav-item')].map((el) => el.textContent.trim()),
    }
  })
  log('  tools: ' + JSON.stringify(tools))
  check(
    'Tools lists its five destinations, in order',
    tools.visible &&
      JSON.stringify(tools.labels) ===
        JSON.stringify([
          'Compare Pokemon',
          'Battle Simulator',
          'Training and Optimization',
          'Breeding Planner',
          'Calculators',
        ]),
    tools.labels.join(','),
  )
  await page.mouse.move(1200, 900)

  // ------------------------------------------------ underline scope guard
  hr('TABS — dropping the underline is scoped to the app nav, nothing else')
  // Two different components that both happen to be called tabs. The top-level
  // app nav (brand / Pokedex / Team / Notes / Tools) has no underline, because the
  // MainPage frames have no such node. The §5 Tabs component -- which the species
  // detail page's Stats / Moves / Evolution row will use -- keeps its 2px accent
  // underline. This guard exists so a future edit to one cannot silently take the
  // other with it.
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    await setTheme(theme)
    await page.goto(DS_URL, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid="dex-designsystem"]', { timeout: 30000 })
    await page.mouse.move(1200, 900)
    const tabs = await page.evaluate((mode) => {
      // The reference page renders every component twice, once per mode, so this
      // has to find the Tabs demo in THIS mode's panel. Selecting the panel by
      // data-demo-theme alone would land on the page's first light panel, which
      // belongs to some earlier component and has no tabs in it at all.
      const row = [...document.querySelectorAll('[data-ds="tabs"]')].find(
        (el) => el.closest('[data-demo-theme]')?.dataset.demoTheme === mode,
      )
      const selected = row?.querySelector('[data-ds="tab"][aria-selected="true"]') ?? null
      const idle = row?.querySelector('[data-ds="tab"][aria-selected="false"]') ?? null
      const navActive = document.querySelector('.nav-trigger-active')
      const cs = (el) => (el ? getComputedStyle(el) : null)
      const s = cs(selected)
      const i = cs(idle)
      const r = cs(row)
      const n = cs(navActive)
      return {
        found: selected != null && idle != null && row != null,
        selectedUnderline: s ? s.borderBottomWidth + ' ' + s.borderBottomColor : null,
        selectedColor: s ? s.color : null,
        idleUnderlineWidth: i ? i.borderBottomWidth : null,
        idleUnderlineColor: i ? i.borderBottomColor : null,
        rowRule: r ? r.borderBottomWidth + ' ' + r.borderBottomColor : null,
        navActiveUnderlineWidth: n ? n.borderBottomWidth : null,
      }
    }, theme)
    const want = EXPECTED[theme]
    log('  [' + theme + '] §5 Tabs: ' + JSON.stringify(tabs))
    check('[' + theme + '] the §5 Tabs component is on the page to check', tabs.found)
    check(
      '[' + theme + '] its selected tab KEEPS the 2px --accent underline',
      tabs.selectedUnderline === '2px ' + hexToRgb(want['--accent']) &&
        tabs.selectedColor === hexToRgb(want['--accent']),
      tabs.selectedUnderline + ' / ' + tabs.selectedColor,
    )
    check(
      '[' + theme + '] its unselected tabs keep the transparent 2px track',
      tabs.idleUnderlineWidth === '2px' && tabs.idleUnderlineColor === 'rgba(0, 0, 0, 0)',
      tabs.idleUnderlineWidth + ' ' + tabs.idleUnderlineColor,
    )
    check(
      '[' + theme + '] and the row keeps its hairline rule',
      tabs.rowRule === '1px ' + hexToRgb(want['--hairline']),
      tabs.rowRule,
    )
    check(
      '[' + theme + '] while the app nav item still has none -- the two are independent',
      tabs.navActiveUnderlineWidth === '0px',
      String(tabs.navActiveUnderlineWidth),
    )
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await setTheme('light')

  // ------------------------------------------------------- the browse grid
  hr('GRID — the Pokedex browse grid against MainPage-Light / MainPage-Dark')
  //
  // Figma raw geometry, card 9:173 inside container-dex-row 9:163:
  //   card           497 x 467
  //   shadow-number  x 68  y 0    w 370 h 198
  //   poke-artwork   x 156 y 98   199 x 199
  //   number-name    x 128 y 319  h 39
  //   Types          x 127 y 368  h 29
  //   Ability        x 128 y 407  h 29
  //   column pitch   518 (497 + 21) | row pitch 507 (467 + 40)
  //
  // Asserted as ratios of the rendered card, so the checks survive a re-scale.
  const FIG = {
    card: { w: 497, h: 467 },
    ghost: { x: 68, y: 0, w: 370, h: 198 },
    art: { x: 156, y: 98, w: 199, h: 199 },
    line: { x: 128, y: 319, h: 39 },
    types: { x: 127, y: 368 },
    ability: { x: 128, y: 407 },
    colPitch: 518,
    rowPitch: 507,
  }
  // Tolerances: 1.5% of the card box for positions derived from a 2.23x scale
  // read off glyph advances, and 2px absolute for gaps.
  const nearRatio = (got, want, span, tolPct = 1.5) =>
    Math.abs(got - want * span) <= (tolPct / 100) * span

  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme })
    // Back off ?ds=1: the reference page is chosen by the URL, so a nav click
    // alone would leave it rendered.
    await page.goto(APP_URL, { waitUntil: 'load' })
    await setTheme(theme)
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
    await page.waitForSelector('[data-testid="species-row-1"]', { timeout: 30000 })
    await page.mouse.move(1200, 900)
    const want = EXPECTED[theme]

    const grid = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.species-card')]
      const first = cards[0]
      const box = first.getBoundingClientRect()
      const rel = (sel) => {
        const el = first.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          x: r.left - box.left,
          y: r.top - box.top,
          w: r.width,
          h: r.height,
        }
      }
      const csOf = (sel) => {
        const el = first.querySelector(sel)
        return el ? getComputedStyle(el) : null
      }
      const ghostCs = csOf('.species-card-ghost')
      const numCs = csOf('.dex-no')
      const nameCs = csOf('.species-name')
      const abilityCs = csOf('.species-card-ability')

      // Shadows across every card in the grid, not just the first.
      const shadows = []
      for (const el of document.querySelectorAll('.pokedex-grid, .pokedex-grid *')) {
        const s = getComputedStyle(el)
        if (s.boxShadow !== 'none' || s.textShadow !== 'none') shadows.push(el.className)
      }

      // Column/row pitch from the first row's cards and the card below.
      const tops = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))].sort(
        (a, b) => a - b,
      )
      const firstRow = cards.filter((c) => Math.round(c.getBoundingClientRect().top) === tops[0])
      const colPitch =
        firstRow.length > 1
          ? firstRow[1].getBoundingClientRect().left - firstRow[0].getBoundingClientRect().left
          : null
      const rowPitch = tops.length > 1 ? tops[1] - tops[0] : null

      // Content order, read from the DOM as it actually renders.
      const order = [
        ...first.querySelectorAll(
          '.species-card-ghost, .species-card-art, .dex-no, .species-name, .species-card-types, .species-card-ability',
        ),
      ].map((el) => el.className.replace('species-card-', '').replace('ds-', ''))

      return {
        cardCount: cards.length,
        columnsInFirstRow: firstRow.length,
        card: { w: box.width, h: box.height },
        ghost: rel('.species-card-ghost'),
        art: rel('.species-card-art'),
        line: rel('.species-card-line'),
        num: rel('.dex-no'),
        nameBox: rel('.species-name'),
        types: rel('.species-card-types'),
        ability: rel('.species-card-ability'),
        colPitch,
        rowPitch,
        order,
        shadows,
        style: {
          cardBackground: getComputedStyle(first).backgroundColor,
          cardBorder: getComputedStyle(first).borderTopWidth,
          ghostColor: ghostCs.color,
          ghostOpacity: ghostCs.opacity,
          ghostFontSize: ghostCs.fontSize,
          ghostFontFamily: ghostCs.fontFamily,
          numColor: numCs.color,
          numFontSize: numCs.fontSize,
          numFontFamily: numCs.fontFamily,
          numText: first.querySelector('.dex-no').textContent,
          nameColor: nameCs.color,
          nameFontSize: nameCs.fontSize,
          nameWeight: nameCs.fontWeight,
          abilityColor: abilityCs ? abilityCs.color : null,
          abilityFontSize: abilityCs ? abilityCs.fontSize : null,
          typeFontSize: (() => {
            const t = first.querySelector('[data-ds="type-label"]')
            return t ? getComputedStyle(t).fontSize : null
          })(),
        },
        ghostText: first.querySelector('.species-card-ghost').textContent,
        typeText: first.querySelector('.species-card-types').textContent,
        abilityText: first.querySelector('.species-card-ability')?.textContent ?? null,
      }
    })

    log('  [' + theme + '] cards=' + grid.cardCount + ' columns=' + grid.columnsInFirstRow)
    log('  [' + theme + '] card box: ' + JSON.stringify(grid.card))
    log('  [' + theme + '] ghost: ' + JSON.stringify(grid.ghost))
    log('  [' + theme + '] art:   ' + JSON.stringify(grid.art))
    log('  [' + theme + '] line:  ' + JSON.stringify(grid.line))
    log('  [' + theme + '] types: ' + JSON.stringify(grid.types))
    log('  [' + theme + '] ability: ' + JSON.stringify(grid.ability))
    log('  [' + theme + '] pitch: col=' + grid.colPitch + ' row=' + grid.rowPitch)
    log('  [' + theme + '] style: ' + JSON.stringify(grid.style))

    check(
      '[' + theme + '] the grid lays out three columns, as the reference shows',
      grid.columnsInFirstRow === 3,
      '(' + grid.columnsInFirstRow + ')',
    )
    check(
      '[' + theme + "] the card keeps Figma's 497:467 aspect",
      nearRatio(grid.card.h, FIG.card.h / FIG.card.w, grid.card.w),
      grid.card.w +
        ' x ' +
        grid.card.h +
        ' (want h=' +
        ((FIG.card.h / FIG.card.w) * grid.card.w).toFixed(1) +
        ')',
    )

    // THE WATERMARK. The prose spec said "top-right, bleeding off the edge";
    // Figma puts it at x=68 y=0 in a 497-wide card -- centred, flush with the top,
    // and entirely inside the card. Both claims are asserted, including that it
    // does NOT overhang either edge.
    check(
      '[' + theme + '] the watermark is flush with the card top (Figma y=0)',
      Math.abs(grid.ghost.y) <= 2,
      'y=' + grid.ghost.y.toFixed(1),
    )
    check(
      '[' + theme + '] and horizontally centred, not pinned to a corner',
      Math.abs(grid.ghost.x + grid.ghost.w / 2 - grid.card.w / 2) <= 0.02 * grid.card.w,
      'centre=' +
        (grid.ghost.x + grid.ghost.w / 2).toFixed(1) +
        ' card centre=' +
        (grid.card.w / 2).toFixed(1),
    )
    check(
      '[' + theme + '] and does NOT bleed off either edge',
      grid.ghost.x >= -1 && grid.ghost.x + grid.ghost.w <= grid.card.w + 1,
      'spans ' +
        grid.ghost.x.toFixed(1) +
        '..' +
        (grid.ghost.x + grid.ghost.w).toFixed(1) +
        ' of ' +
        grid.card.w,
    )
    check(
      '[' + theme + "] its box matches Figma's 74.4% x 42.4% of the card",
      nearRatio(grid.ghost.w, FIG.ghost.w / FIG.card.w, grid.card.w, 2) &&
        nearRatio(grid.ghost.h, FIG.ghost.h / FIG.card.h, grid.card.h, 2),
      grid.ghost.w.toFixed(1) +
        ' x ' +
        grid.ghost.h.toFixed(1) +
        ' (want ' +
        ((FIG.ghost.w / FIG.card.w) * grid.card.w).toFixed(1) +
        ' x ' +
        ((FIG.ghost.h / FIG.card.h) * grid.card.h).toFixed(1) +
        ')',
    )
    check(
      '[' + theme + "] three digits, at the locked font-size and this mode's opacity",
      /^\d{3}$/.test(grid.ghostText.trim()) &&
        grid.style.ghostFontSize === SCALE['--font-size-ghost-watermark-grid'] &&
        grid.style.ghostOpacity === GHOST_OPACITY[theme],
      grid.ghostText.trim() +
        ' / ' +
        grid.style.ghostFontSize +
        ' / opacity ' +
        grid.style.ghostOpacity,
    )

    // The sprite: centred, overlapping the watermark's lower half.
    // Display type, not tabular data: the watermark is the one number that takes
    // --font-body while every functional number keeps --font-numeric.
    check(
      '[' + theme + '] the watermark is set in the proportional face, not the mono one',
      /^"?IBM Plex Sans"?/.test(grid.style.ghostFontFamily),
      grid.style.ghostFontFamily,
    )
    check(
      '[' + theme + '] while the dex number beside it stays mono',
      /Martian Mono/.test(grid.style.numFontFamily),
      grid.style.numFontFamily,
    )
    check(
      '[' + theme + '] the sprite is centred at 40% of the card width',
      nearRatio(grid.art.w, FIG.art.w / FIG.card.w, grid.card.w, 2) &&
        Math.abs(grid.art.x + grid.art.w / 2 - grid.card.w / 2) <= 0.02 * grid.card.w,
      'w=' + grid.art.w.toFixed(1) + ' x=' + grid.art.x.toFixed(1),
    )
    check(
      '[' + theme + "] at Figma's y=98/467 down the card",
      nearRatio(grid.art.y, FIG.art.y / FIG.card.h, grid.card.h),
      'y=' +
        grid.art.y.toFixed(1) +
        ' (want ' +
        ((FIG.art.y / FIG.card.h) * grid.card.h).toFixed(1) +
        ')',
    )
    check(
      '[' + theme + '] and overlaps the watermark rather than clearing it',
      grid.art.y < grid.ghost.y + grid.ghost.h,
      'sprite top ' +
        grid.art.y.toFixed(1) +
        ' vs watermark bottom ' +
        (grid.ghost.y + grid.ghost.h).toFixed(1),
    )

    // Text block: one left edge for all three lines, at Figma's x=128/497.
    check(
      '[' + theme + '] all three text lines share one left edge at 25.8% in',
      nearRatio(grid.line.x, FIG.line.x / FIG.card.w, grid.card.w) &&
        Math.abs(grid.line.x - grid.types.x) <= 1 &&
        (grid.ability == null || Math.abs(grid.line.x - grid.ability.x) <= 1),
      'line=' +
        grid.line.x.toFixed(1) +
        ' types=' +
        grid.types.x.toFixed(1) +
        ' ability=' +
        (grid.ability ? grid.ability.x.toFixed(1) : 'n/a') +
        ' (want ' +
        ((FIG.line.x / FIG.card.w) * grid.card.w).toFixed(1) +
        ')',
    )
    for (const [label, got, figY] of [
      ['number+name', grid.line.y, FIG.line.y],
      ['type row', grid.types.y, FIG.types.y],
      ['ability', grid.ability?.y, FIG.ability.y],
    ]) {
      if (got == null) continue
      check(
        '[' + theme + '] ' + label + " sits at Figma's y=" + figY + '/467',
        nearRatio(got, figY / FIG.card.h, grid.card.h),
        'y=' + got.toFixed(1) + ' (want ' + ((figY / FIG.card.h) * grid.card.h).toFixed(1) + ')',
      )
    }

    // Stacking order, straight off the reference: watermark+sprite, then dex
    // number and name on ONE line, then the type row, then the ability.
    check(
      '[' + theme + '] content stacks ghost, sprite, number+name, types, ability',
      JSON.stringify(grid.order) ===
        JSON.stringify(['ghost', 'art', 'dex-no', 'species-name', 'types', 'ability']),
      JSON.stringify(grid.order),
    )
    check(
      '[' + theme + '] the dex number and the name share one line, as the reference shows',
      Math.abs(grid.num.y - grid.nameBox.y) <= 1 &&
        grid.nameBox.x > grid.num.x &&
        nearRatio(grid.line.h, FIG.line.h / FIG.card.h, grid.card.h, 3),
      'number y=' +
        grid.num.y.toFixed(1) +
        ' name y=' +
        grid.nameBox.y.toFixed(1) +
        ' line height ' +
        grid.line.h.toFixed(1),
    )
    check(
      '[' + theme + '] the dex number is four digits, in --text-secondary',
      /^#\d{4}$/.test(grid.style.numText.trim()) &&
        grid.style.numColor === hexToRgb(want['--text-secondary']),
      grid.style.numText.trim() + ' / ' + grid.style.numColor,
    )
    // 600, not 700: across all six reference names the measured fit is 14.00px at
    // weight 600 against 13.82px at 700.
    check(
      '[' + theme + '] the name is --font-weight-medium --text-primary at --font-size-body',
      grid.style.nameColor === hexToRgb(want['--text-primary']) &&
        grid.style.nameFontSize === SCALE['--font-size-body'] &&
        grid.style.nameWeight === SCALE['--font-weight-medium'],
      grid.style.nameColor + ' / ' + grid.style.nameFontSize + ' / ' + grid.style.nameWeight,
    )
    // Measured off the two reference strings with no middot in them, so no
    // spacing ambiguity: PSYCHIC 9.92px and DARK 9.64px -- caption, not label.
    check(
      '[' + theme + '] the type row is --font-size-caption',
      grid.style.typeFontSize === SCALE['--font-size-caption'],
      String(grid.style.typeFontSize),
    )
    check(
      '[' + theme + '] the ability line is --font-size-label in --text-secondary',
      grid.style.abilityFontSize === SCALE['--font-size-label'] &&
        grid.style.abilityColor === hexToRgb(want['--text-secondary']),
      grid.style.abilityFontSize + ' / ' + grid.style.abilityColor,
    )

    // A ghost card: the artwork carries the colour, so no fill, no border, no
    // shadow anywhere in the grid.
    check(
      '[' + theme + '] cards have no fill and no border',
      grid.style.cardBackground === 'rgba(0, 0, 0, 0)' && grid.style.cardBorder === '0px',
      grid.style.cardBackground + ' / ' + grid.style.cardBorder,
    )
    check(
      '[' + theme + '] no shadow on anything in the grid',
      grid.shadows.length === 0,
      grid.shadows.join(' | '),
    )

    // Pitch: Figma's 21-raw column gap and 40-raw row gap.
    check(
      '[' + theme + "] column pitch matches Figma's 518:497",
      nearRatio(grid.colPitch, FIG.colPitch / FIG.card.w, grid.card.w, 2),
      grid.colPitch + ' (want ' + ((FIG.colPitch / FIG.card.w) * grid.card.w).toFixed(1) + ')',
    )
    check(
      '[' + theme + "] row pitch matches Figma's 507:467",
      nearRatio(grid.rowPitch, FIG.rowPitch / FIG.card.h, grid.card.h, 2),
      grid.rowPitch + ' (want ' + ((FIG.rowPitch / FIG.card.h) * grid.card.h).toFixed(1) + ')',
    )

    await page.screenshot({ path: SHOTS + '/grid-' + theme + '.png' })
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await setTheme('light')

  // The ability line is real data, not the mockup's text: non-hidden abilities
  // only, middot-separated, and absent entirely in the generations that had none.
  hr('GRID DATA — the ability slot carries real, generation-correct abilities')
  await goToDex(page, 'pokedex')
  await page.waitForSelector('[data-testid="species-row-1"]', { timeout: 30000 })
  const gridBaseline = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="species-row-1"]')
    const box = card.getBoundingClientRect()
    const line = card.querySelector('.species-card-line').getBoundingClientRect()
    const types = card.querySelector('.species-card-types').getBoundingClientRect()
    return {
      cardHeight: Math.round(box.height),
      lineY: Math.round(line.top - box.top),
      typesY: Math.round(types.top - box.top),
    }
  })
  log('  baseline (all): ' + JSON.stringify(gridBaseline))
  await withControls(() => page.selectOption('[data-testid="vg-select"]', 'platinum'))
  await page.waitForTimeout(300)
  const gen4 = await page.evaluate(() => ({
    bulbasaur:
      document.querySelector('[data-testid="species-card-ability-1"]')?.textContent ?? null,
    quagsire:
      document.querySelector('[data-testid="species-card-ability-195"]')?.textContent ?? null,
    espeon: document.querySelector('[data-testid="species-card-ability-196"]')?.textContent ?? null,
  }))
  log('  Gen 4 (platinum): ' + JSON.stringify(gen4))
  check(
    'Bulbasaur shows Overgrow and not its hidden Chlorophyll',
    gen4.bulbasaur === 'Overgrow',
    String(gen4.bulbasaur),
  )
  check(
    'Quagsire shows both non-hidden abilities, middot-separated',
    gen4.quagsire === 'Damp · Water Absorb',
    String(gen4.quagsire),
  )
  check(
    'Espeon shows Synchronize and not its hidden Magic Bounce',
    gen4.espeon === 'Synchronize',
    String(gen4.espeon),
  )
  // Gens 1-2 had no abilities at all: the slot must be absent, and the two lines
  // above it must not move.
  await withControls(() => page.selectOption('[data-testid="vg-select"]', 'red-blue'))
  await page.waitForTimeout(300)
  const gen1 = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="species-row-1"]')
    const box = card.getBoundingClientRect()
    const line = card.querySelector('.species-card-line').getBoundingClientRect()
    const types = card.querySelector('.species-card-types').getBoundingClientRect()
    return {
      ability: document.querySelector('[data-testid="species-card-ability-1"]') != null,
      cardHeight: Math.round(box.height),
      lineY: Math.round(line.top - box.top),
      typesY: Math.round(types.top - box.top),
    }
  })
  log('  Gen 1 (red-blue): ' + JSON.stringify(gen1))
  check('Gen 1 has no ability line at all', !gen1.ability)
  check(
    'and the lines above it did not move when it vanished',
    gen1.lineY === gridBaseline.lineY &&
      gen1.typesY === gridBaseline.typesY &&
      gen1.cardHeight === gridBaseline.cardHeight,
    JSON.stringify(gen1) + ' vs ' + JSON.stringify(gridBaseline),
  )
  await withControls(() => page.selectOption('[data-testid="vg-select"]', 'all'))
  await page.waitForTimeout(300)

  // The scroll-down affordance: Figma's "icon-scrolldown" instance, centred.
  hr('GRID — the scroll-down hint')
  const hint = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="grid-scroll-hint"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const gridBox = document.querySelector('.pokedex-grid').getBoundingClientRect()
    return {
      atEnd: el.getAttribute('data-at-end'),
      interactive: el.tagName.toLowerCase() === 'button' || el.querySelector('button') != null,
      ariaHidden: el.getAttribute('aria-hidden'),
      centreOffset: Math.round(r.left + r.width / 2 - (gridBox.left + gridBox.width / 2)),
      opacity: getComputedStyle(el).opacity,
    }
  })
  log('  hint: ' + JSON.stringify(hint))
  check('the scroll hint renders under the grid', hint != null)
  check(
    'centred on the grid, as Figma places it',
    hint != null && Math.abs(hint.centreOffset) <= 2,
    hint ? hint.centreOffset + 'px off centre' : '',
  )
  check(
    'decorative and non-interactive -- it is a scroll indicator, not a load-more',
    hint != null && !hint.interactive && hint.ariaHidden === 'true',
    hint ? 'interactive=' + hint.interactive + ' aria-hidden=' + hint.ariaHidden : '',
  )
  check('visible while there is more to scroll to', hint != null && hint.atEnd === 'false')
  // The other half of the scroll model: the indicator only means anything if the
  // page itself is NOT what moves.
  const scrollModel = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
    areas: document.querySelectorAll('.scroll-area').length,
    backToTop: document.querySelector('[data-testid="scroll-top"]') != null,
  }))
  log('  scroll model: ' + JSON.stringify(scrollModel))
  check(
    'the page itself does not scroll -- only the section does',
    scrollModel.page === 0 && scrollModel.body === 0 && scrollModel.areas >= 1,
    JSON.stringify(scrollModel),
  )
  check('and no back-to-top control is offered before scrolling', !scrollModel.backToTop)
  /*
    THE PAGE NO LONGER SCROLLS. The app is viewport-locked and the grid scrolls
    inside its own .scroll-area, so window.scrollTo is a no-op and the hint would
    never reach its at-end state. Driving the container is the same gesture the
    reader actually makes.
  */
  await page.$eval('.scroll-area', (el) => el.scrollTo(0, el.scrollHeight))
  await page.waitForTimeout(350)
  const hintAtEnd = await page.evaluate(() => ({
    atEnd: document.querySelector('[data-testid="grid-scroll-hint"]').getAttribute('data-at-end'),
    opacity: getComputedStyle(document.querySelector('[data-testid="grid-scroll-hint"]')).opacity,
  }))
  log('  at the bottom: ' + JSON.stringify(hintAtEnd))
  check(
    'a back-to-top control appears once the section is scrolled',
    (await page.$('[data-testid="scroll-top"]')) != null,
  )
  // It has to actually work, not just appear.
  await page.click('[data-testid="scroll-top"]')
  await page.waitForTimeout(700)
  const backAtTop = await page.$eval('.scroll-area', (el) => el.scrollTop)
  check('and returns the section to the top', backAtTop <= 8, 'scrollTop=' + backAtTop)
  check(
    'and hides once there is nothing further to scroll to',
    hintAtEnd.atEnd === 'true' && Number(hintAtEnd.opacity) < 0.5,
    JSON.stringify(hintAtEnd),
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)

  // ------------------------------------------------- Itemdex and Berrydex
  hr('SCOPE — the last two dexes, and what each was actually given')
  /*
    NOTHING IS UNTOUCHED ANY MORE. This was a scope guard: a list of dexes the
    current pass had not been near, asserted to carry no design-system component
    and no grid card, so a stray restyle would be caught. The refinement pass took
    the last two -- Itemdex and Berrydex -- so the list is empty and the guard has
    nothing left to guard.

    Deleting it outright would lose a real check, so it is replaced by the
    positive claim it becomes: each of those two now carries the specific
    treatment it was given, and both still inherit the app-wide Plex Sans.
  */
  await goToDex(page, 'itemdex')
  await page.waitForSelector('[data-testid="itemdex-rows"]', { timeout: 30000 })
  const itemRow = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="itemdex-row-1"]')
    if (!row) return null
    const name = row.querySelector('.species-name')
    const icon = row.querySelector('.row-icon')
    return {
      font: getComputedStyle(row).fontFamily,
      // Sprite AFTER the name: compare left edges rather than DOM order, since
      // what matters is where the reader sees it.
      iconAfterName:
        name != null &&
        icon != null &&
        icon.getBoundingClientRect().left > name.getBoundingClientRect().left,
      chevron: row.querySelector('.row-chevron') != null,
      sub: row.querySelector('.row-sub')?.textContent?.trim() ?? null,
      category: row.querySelector('[data-testid="itemdex-row-category-1"]')?.textContent?.trim(),
      pocket: row.querySelector('[data-testid="itemdex-row-pocket-1"]')?.textContent?.trim(),
      // The numeric face on the catalog number, which the base .dex-no rule was
      // missing until this pass -- it set tabular-nums without a font-family.
      dexNoFont: getComputedStyle(row.querySelector('.dex-no')).fontFamily,
    }
  })
  log(`  itemdex row: ${JSON.stringify(itemRow)}`)
  check('itemdex still inherits Plex Sans', /IBM Plex/.test(itemRow?.font ?? ''), itemRow?.font)
  check('itemdex puts the sprite AFTER the item name', itemRow?.iconAfterName === true)
  check('itemdex rows end in a chevron', itemRow?.chevron === true)
  check(
    'itemdex shows category AND pocket as two distinct fields',
    (itemRow?.category ?? '').length > 0 &&
      (itemRow?.pocket ?? '').length > 0 &&
      itemRow.category !== itemRow.pocket,
    `${itemRow?.category} / ${itemRow?.pocket}`,
  )
  check(
    'the catalog number is in --font-numeric, not just tabular-nums',
    /Martian Mono/.test(itemRow?.dexNoFont ?? ''),
    itemRow?.dexNoFont,
  )

  await goToDex(page, 'berrydex')
  await page.waitForSelector('[data-testid="berrydex-rows"]', { timeout: 30000 })
  const berryCard = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="berrydex-row-1"]')
    if (!card) return null
    const r = card.getBoundingClientRect()
    return {
      font: getComputedStyle(card).fontFamily,
      // The SHARED card chrome, by class, not a lookalike.
      isSpeciesCard: card.classList.contains('species-card'),
      ghost: card.querySelector('.species-card-ghost') != null,
      typeLabel: card.querySelector('[data-ds="type-label"]') != null,
      width: Math.round(r.width),
      height: Math.round(r.height),
      factLines: card.querySelectorAll('.berry-card-fact-line').length,
      clipped: [...card.querySelectorAll('.berry-card-fact-line')].filter(
        (el) => el.scrollWidth > el.clientWidth + 1,
      ).length,
      hasDetailPage: document.querySelector('[data-testid="berrydex-detail"]') != null,
      clickable: card.querySelector('.species-card-hit') != null,
    }
  })
  log(`  berrydex card: ${JSON.stringify(berryCard)}`)
  check(
    'berrydex still inherits Plex Sans',
    /IBM Plex/.test(berryCard?.font ?? ''),
    berryCard?.font,
  )
  check(
    'berrydex uses the SHARED species-card chrome, not its own card',
    berryCard?.isSpeciesCard === true && berryCard?.ghost === true,
    JSON.stringify(berryCard),
  )
  check(
    'at exactly the Pokedex card width, so the two grids share a column pitch',
    berryCard?.width === 212,
    `${berryCard?.width}x${berryCard?.height}`,
  )
  check(
    'taller than the species card, because it carries three fact lines',
    berryCard?.height > 199 && berryCard?.factLines === 3,
    `h=${berryCard?.height} lines=${berryCard?.factLines}`,
  )
  check('with nothing clipped on any of them', berryCard?.clipped === 0)
  check(
    'and no detail page at all -- every field is on the card',
    berryCard?.hasDetailPage === false && berryCard?.clickable === false,
  )

  // ------------------------------------------- the rebuilt dexes share the card
  hr('SHARED COMPONENTS — one species-card grid and one detail template')
  const SHARED = [
    { dex: 'movedex', open: 'movedex-row-1' },
    { dex: 'abilitydex', open: 'abilitydex-row-1' },
    { dex: 'breedingdex', open: 'breedingdex-row-1' },
  ]
  for (const { dex, open } of SHARED) {
    await goToDex(page, dex)
    await page.waitForSelector(`[data-testid="${dex}-count"]`, { timeout: 30000 })
    await page.waitForSelector(`[data-testid="${open}"]`, { timeout: 30000 })
    await page.click(`[data-testid="${open}"]`)
    await page.waitForSelector('[data-testid="entity-back"]', { timeout: 30000 })
    // The Movedex's sections wait on a learnset partition; the other two are
    // synchronous, so this is only ever a real wait for one of the three.
    await page.waitForSelector('[data-testid^="entity-grid-"]', { timeout: 60000 })
    const shape = await page.evaluate(() => ({
      // The shared template's own landmarks, not a per-dex lookalike.
      name: document.querySelector('[data-testid="entity-name"]') != null,
      back: document.querySelector('[data-testid="entity-back"]') != null,
      grids: document.querySelectorAll('[data-testid^="entity-grid-"]').length,
      cards: document.querySelectorAll('.entity-detail-section .species-card').length,
      cardGhosts: document.querySelectorAll('.entity-detail-section .species-card-ghost').length,
      typeLabels: document.querySelectorAll(
        '.entity-detail-section .species-card [data-ds="type-label"]',
      ).length,
    }))
    log(`  ${dex}: ${JSON.stringify(shape)}`)
    check(`${dex} detail renders the shared template`, shape.name && shape.back && shape.grids > 0)
    check(
      `${dex} detail renders the shared species card, not a lookalike`,
      shape.cards > 0 && shape.cardGhosts === shape.cards && shape.typeLabels > 0,
      JSON.stringify(shape),
    )
  }

  await goToDex(page, 'pokedex')
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
  const pokedex = await page.evaluate(() => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }))
  log(`  --accent seen by the old modules: ${pokedex.accent}`)
  // The one deliberate bleed-through, called out in the report rather than hidden.
  check(
    '--accent app-wide is the design system value (the token names collide)',
    pokedex.accent.toLowerCase() === EXPECTED.light['--accent'].toLowerCase() ||
      pokedex.accent.toLowerCase() === EXPECTED.dark['--accent'].toLowerCase(),
    pokedex.accent,
  )

  // ------------------------------------------------------------ errors
  hr('CONSOLE / PAGE / HTTP ERRORS')
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 8).forEach((e) => log(`    ${e}`))
  log(`  HTTP >=400     : ${badResponses.length}`)
  badResponses.slice(0, 8).forEach((e) => log(`    ${e}`))
  check('no console errors', consoleErrors.length === 0, `(${consoleErrors.length})`)
  check('no uncaught page errors', pageErrors.length === 0, `(${pageErrors.length})`)
  check('no failed HTTP responses', badResponses.length === 0, `(${badResponses.length})`)
} finally {
  if (browser) await browser.close()
  preview.stop()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
