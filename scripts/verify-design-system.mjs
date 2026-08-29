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

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4192
const APP_URL = `http://localhost:${PORT}/pokeapp/`
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
const TYPES = Object.keys(primitive['type-color']).filter((k) => !k.startsWith('$'))

/** The custom properties design-tokens.css is expected to expose, per theme. */
const EXPECTED = {
  light: {
    '--surface': tokenValue(semantic.surface, 'light'),
    '--surface-raised': tokenValue(semantic['surface-raised'], 'light'),
    '--text-primary': tokenValue(semantic['text-primary'], 'light'),
    '--text-secondary': tokenValue(semantic['text-secondary'], 'light'),
    '--hairline': tokenValue(semantic.hairline, 'light'),
    '--accent': tokenValue(semantic.accent, 'light'),
    '--button-primary-fill': tokenValue(semantic['button-primary-fill'], 'light'),
    '--button-primary-text': tokenValue(semantic['button-primary-text'], 'light'),
    '--ghost-watermark': tokenValue(semantic['ghost-watermark'], 'light'),
    ...Object.fromEntries(TYPES.map((t) => [`--type-${t}`, primitive['type-color'][t].$value])),
  },
  dark: {
    '--surface': tokenValue(semantic.surface, 'dark'),
    '--surface-raised': tokenValue(semantic['surface-raised'], 'dark'),
    '--text-primary': tokenValue(semantic['text-primary'], 'dark'),
    '--text-secondary': tokenValue(semantic['text-secondary'], 'dark'),
    '--hairline': tokenValue(semantic.hairline, 'dark'),
    '--accent': tokenValue(semantic.accent, 'dark'),
    '--button-primary-fill': tokenValue(semantic['button-primary-fill'], 'dark'),
    '--button-primary-text': tokenValue(semantic['button-primary-text'], 'dark'),
    '--ghost-watermark': tokenValue(semantic['ghost-watermark'], 'dark'),
    ...Object.fromEntries(
      TYPES.map((t) => [`--type-${t}`, primitive['type-color-dark-mode-override'][t].$value]),
    ),
  },
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
  '--ghost-watermark-opacity': String(tokens.opacity['ghost-watermark'].$value),
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

// Fonts: self-hosted files, and no CDN URL left anywhere in the source.
const fontFiles = ['ibm-plex-sans-latin.woff2', 'ibm-plex-sans-latin-ext.woff2']
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
  'both font files are in the precache manifest',
  fontFiles.every((f) => new RegExp(f.replace('.woff2', '-[A-Za-z0-9_-]+\\.woff2')).test(swJs)),
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

const previewLog = []
const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
)
preview.stdout.on('data', (d) => previewLog.push(String(d).trimEnd()))
preview.stderr.on('data', (d) => previewLog.push(String(d).trimEnd()))

const stopPreview = () => {
  try {
    if (process.platform === 'win32' && preview.pid) {
      spawnSync('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  } catch {
    /* best effort */
  }
  preview.kill()
}

let browser
try {
  try {
    await waitForServer(APP_URL)
  } catch (err) {
    log('')
    previewLog.forEach((l) => log(`    ${l}`))
    throw err
  }
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
  await page.waitForSelector('[data-testid="dex-switcher"]', { timeout: 60000 })

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

  await page.click('[data-testid="nav-designsystem"]')
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
    return {
      faces: faces.map((f) => ({ weight: f.weight, status: f.status })),
      check14: document.fonts.check('14px "IBM Plex Sans"'),
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
    'at the constant 5% opacity',
    comp.grid.ghostOpacity === SCALE['--ghost-watermark-opacity'],
    comp.grid.ghostOpacity,
  )
  check(
    'in --ghost-watermark',
    comp.grid.ghostColor === rgb(EXPECTED.light['--ghost-watermark']),
    comp.grid.ghostColor,
  )
  check(
    'and the numeric font',
    /SF Mono|JetBrains Mono|Consolas|monospace/.test(comp.grid.ghostFont),
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
  // Expected values here come from the Figma frames MainPage-Light (9:143) and
  // MainPage-Dark (12:248), whose geometry is byte-identical, read out of
  // get_metadata. Where those frames contradict the prose component specs, the
  // frames win -- so the §5 Tabs underline and the full95 bordered search box are
  // both asserted ABSENT below.
  //
  // Figma raw -> CSS uses 2.23, the scale at which the frames' text widths land on
  // the locked token type sizes (card name 14.4px and dex number 14.3px against
  // --font-size-body 14px; type and ability rows near 11px against
  // --font-size-label). Ratios rather than raw px are asserted wherever a ratio is
  // what the design actually fixes.
  hr('SHELL — the app bar against MainPage: tabs, borderless search, type')
  // Measured in both themes, because the bar is the one piece of chrome every
  // module sits under and a token that only resolved in one mode would show here.
  for (const theme of ['light', 'dark']) {
    // Both halves of the theme, not just the attribute: index.css still paints the
    // page from its own prefers-color-scheme block, so forcing data-theme alone
    // would screenshot a dark bar on a light page -- a state no real user is in.
    await page.emulateMedia({ colorScheme: theme })
    await setTheme(theme)
    await page.click('[data-testid="nav-pokedex"]')
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
    // A hovered tab repaints, so park the pointer clear of the bar first.
    await page.mouse.move(1200, 900)
    const want = EXPECTED[theme]
    const shell = await page.evaluate(() => {
      const cs = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el) : null
      }
      const bar = cs('.app-bar')
      const brand = cs('[data-testid="app-brand"]')
      const active = cs('.dex-tab-active')
      const idle = cs('.dex-tab:not(.dex-tab-active)')
      const input = cs('[data-testid="global-search"]')
      const shadows = []
      for (const el of document.querySelectorAll('.app-bar, .app-bar *')) {
        const s = getComputedStyle(el)
        if (s.boxShadow !== 'none' || s.textShadow !== 'none') {
          shadows.push(el.tagName + '.' + String(el.className).split(' ')[0] + ': ' + s.boxShadow)
        }
      }
      // Gap between the brand and the first tab, and between two tabs, measured
      // from the rendered boxes rather than read off the stylesheet.
      const brandEl = document.querySelector('[data-testid="app-brand"]')
      const tabs = [...document.querySelectorAll('.dex-tab')]
      const gapAfterBrand =
        tabs.length > 0
          ? Math.round(tabs[0].getBoundingClientRect().left - brandEl.getBoundingClientRect().right)
          : null
      const gapBetweenTabs =
        tabs.length > 1
          ? Math.round(tabs[1].getBoundingClientRect().left - tabs[0].getBoundingClientRect().right)
          : null
      return {
        elements: document.querySelectorAll('.app-bar *').length,
        shadows,
        gapAfterBrand,
        gapBetweenTabs,
        iconPresent: document.querySelector('[data-testid="global-search-icon"]') != null,
        anyBarSvg: document.querySelectorAll('.app-bar svg').length,
        bar: {
          background: bar.backgroundColor,
          borderBottom: bar.borderBottomWidth + ' ' + bar.borderBottomColor,
          fontFamily: bar.fontFamily,
          textAlign: bar.textAlign,
        },
        brand: {
          fontSize: brand.fontSize,
          weight: brand.fontWeight,
          color: brand.color,
          fontFamily: brand.fontFamily,
        },
        activeTab: {
          color: active.color,
          weight: active.fontWeight,
          fontSize: active.fontSize,
          borderBottomWidth: active.borderBottomWidth,
          borderTopWidth: active.borderTopWidth,
          background: active.backgroundColor,
          fontFamily: active.fontFamily,
        },
        idleTab: {
          color: idle.color,
          fontSize: idle.fontSize,
          borderBottomWidth: idle.borderBottomWidth,
          background: idle.backgroundColor,
        },
        input: {
          borderTopWidth: input.borderTopWidth,
          borderRightWidth: input.borderRightWidth,
          borderLeftWidth: input.borderLeftWidth,
          borderBottomWidth: input.borderBottomWidth,
          borderBottomColor: input.borderBottomColor,
          background: input.backgroundColor,
          color: input.color,
          textAlign: input.textAlign,
          fontFamily: input.fontFamily,
          fontSize: input.fontSize,
          height: Math.round(
            document.querySelector('[data-testid="global-search"]').getBoundingClientRect().height,
          ),
        },
      }
    })
    log('  [' + theme + '] bar: ' + JSON.stringify(shell.bar))
    log('  [' + theme + '] active tab: ' + JSON.stringify(shell.activeTab))
    log('  [' + theme + '] idle tab: ' + JSON.stringify(shell.idleTab))
    log('  [' + theme + '] search: ' + JSON.stringify(shell.input))
    log(
      '  [' +
        theme +
        '] gaps: brand->tab ' +
        shell.gapAfterBrand +
        'px, tab->tab ' +
        shell.gapBetweenTabs +
        'px',
    )

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

    // Typography: the shell inherits system-ui from index.css, so this is what
    // proves the bundled font is not being shadowed.
    for (const pair of [
      ['bar', shell.bar.fontFamily],
      ['brand', shell.brand.fontFamily],
      ['tab labels', shell.activeTab.fontFamily],
      ['search input', shell.input.fontFamily],
    ]) {
      check(
        '[' + theme + '] ' + pair[0] + ' resolves to IBM Plex Sans, not the system stack',
        /^"?IBM Plex Sans"?/.test(pair[1]),
        pair[1],
      )
    }

    // FIGMA: all five nav labels imply the same size -- 14.2-14.5px by glyph
    // advance -- so brand and tabs share --font-size-body and differ by colour.
    check(
      '[' + theme + '] brand and tabs share --font-size-body',
      shell.brand.fontSize === SCALE['--font-size-body'] &&
        shell.activeTab.fontSize === SCALE['--font-size-body'] &&
        shell.idleTab.fontSize === SCALE['--font-size-body'],
      shell.brand.fontSize + ' / ' + shell.activeTab.fontSize + ' / ' + shell.idleTab.fontSize,
    )
    check(
      '[' + theme + '] the brand is --text-primary',
      shell.brand.color === hexToRgb(want['--text-primary']),
      shell.brand.color,
    )

    // FIGMA: tab gaps are a uniform 20 raw (9px at 2.23), and the brand sits in
    // the same rhythm -- 154-134 for brand->tab, 306-286 / 409-389 / 519-499
    // between tabs.
    check(
      '[' + theme + "] the brand-to-tab gap is Figma's 9px",
      shell.gapAfterBrand === 9,
      '(' + shell.gapAfterBrand + 'px)',
    )
    check(
      '[' + theme + '] and so is the gap between tabs',
      shell.gapBetweenTabs === 9,
      '(' + shell.gapBetweenTabs + 'px)',
    )

    // FIGMA, against the §5 Tabs spec: the nav-bar frame holds a Tabs frame of
    // five bare text nodes plus the search text, and nothing else -- no
    // rectangle, line or vector -- so the active tab carries no underline.
    check(
      '[' + theme + '] the active tab is --accent',
      shell.activeTab.color === hexToRgb(want['--accent']),
      shell.activeTab.color,
    )
    check(
      '[' + theme + '] and carries NO underline (Figma has no such node)',
      shell.activeTab.borderBottomWidth === '0px' && shell.activeTab.borderTopWidth === '0px',
      'bottom=' + shell.activeTab.borderBottomWidth + ' top=' + shell.activeTab.borderTopWidth,
    )
    check(
      '[' + theme + '] inactive tabs are --text-secondary, also with no underline',
      shell.idleTab.color === hexToRgb(want['--text-secondary']) &&
        shell.idleTab.borderBottomWidth === '0px',
      shell.idleTab.color + ' / ' + shell.idleTab.borderBottomWidth,
    )
    check(
      '[' + theme + '] no tab carries a background fill',
      shell.activeTab.background === 'rgba(0, 0, 0, 0)' &&
        shell.idleTab.background === 'rgba(0, 0, 0, 0)',
      shell.activeTab.background + ' / ' + shell.idleTab.background,
    )

    // FIGMA, against the full95 "Global search bar": the search is a bare text
    // node, right-aligned, with no rect, no stroke, no fill and no icon.
    check(
      '[' + theme + '] the search field has no border box at rest',
      shell.input.borderTopWidth === '0px' &&
        shell.input.borderRightWidth === '0px' &&
        shell.input.borderLeftWidth === '0px',
      'top=' +
        shell.input.borderTopWidth +
        ' right=' +
        shell.input.borderRightWidth +
        ' left=' +
        shell.input.borderLeftWidth,
    )
    check(
      '[' + theme + '] and no fill of its own',
      shell.input.background === 'rgba(0, 0, 0, 0)',
      shell.input.background,
    )
    check(
      '[' + theme + '] its text is right-aligned, as the reference shows',
      shell.input.textAlign === 'right',
      shell.input.textAlign,
    )
    check(
      '[' + theme + '] the Tabler magnifier is gone (no icon node in either frame)',
      !shell.iconPresent && shell.anyBarSvg === 0,
      'icon=' + shell.iconPresent + ' svgs=' + shell.anyBarSvg,
    )

    // Focus: Figma has no focus state for a borderless field, so the accent lands
    // on the hairline underline every full95 input already uses. The underline is
    // present-but-transparent at rest, so nothing shifts.
    await page.focus('[data-testid="global-search"]')
    await page.waitForTimeout(120)
    const focused = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-testid="global-search"]'))
      return {
        borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor,
        outline: cs.outlineStyle,
        boxHeight: Math.round(
          document.querySelector('[data-testid="global-search"]').getBoundingClientRect().height,
        ),
      }
    })
    log('  [' + theme + '] focused search: ' + JSON.stringify(focused))
    check(
      '[' + theme + '] focus turns the underline --accent',
      focused.borderBottom === '1px ' + hexToRgb(want['--accent']),
      focused.borderBottom,
    )
    check(
      '[' + theme + '] and drops the default outline',
      focused.outline === 'none',
      focused.outline,
    )
    check(
      '[' + theme + '] focusing does not resize the field',
      focused.boxHeight === shell.input.height,
      'rest=' + shell.input.height + ' focused=' + focused.boxHeight,
    )

    // The dropdown is a floating panel: --surface-raised, hairline, no shadow.
    await page.fill('[data-testid="global-search"]', 'sand')
    await page.waitForSelector('[data-testid="global-search-results"]', { timeout: 15000 })
    const panel = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-testid="global-search-results"]'))
      return {
        background: cs.backgroundColor,
        border: cs.borderTopWidth + ' ' + cs.borderTopColor,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
      }
    })
    log('  [' + theme + '] results panel: ' + JSON.stringify(panel))
    check(
      '[' + theme + '] the results panel floats on --surface-raised',
      panel.background === hexToRgb(want['--surface-raised']),
      panel.background,
    )
    check(
      '[' + theme + '] with a hairline border and no shadow',
      panel.border === '1px ' + hexToRgb(want['--hairline']) && panel.shadow === 'none',
      panel.border + ' / ' + panel.shadow,
    )
    await page.screenshot({ path: SHOTS + '/shell-' + theme + '.png' })
    await page.fill('[data-testid="global-search"]', '')
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
  const GHOST_OPACITY = tokens.opacity['ghost-watermark'].$value
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
    await setTheme(theme)
    await page.click('[data-testid="nav-pokedex"]')
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
          numText: first.querySelector('.dex-no').textContent,
          nameColor: nameCs.color,
          nameFontSize: nameCs.fontSize,
          nameWeight: nameCs.fontWeight,
          abilityColor: abilityCs ? abilityCs.color : null,
          abilityFontSize: abilityCs ? abilityCs.fontSize : null,
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
      '[' + theme + '] three digits, at the locked font-size and 5% opacity',
      /^\d{3}$/.test(grid.ghostText.trim()) &&
        grid.style.ghostFontSize === SCALE['--font-size-ghost-watermark-grid'] &&
        Number(grid.style.ghostOpacity) === GHOST_OPACITY,
      grid.ghostText.trim() +
        ' / ' +
        grid.style.ghostFontSize +
        ' / opacity ' +
        grid.style.ghostOpacity,
    )

    // The sprite: centred, overlapping the watermark's lower half.
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
    check(
      '[' + theme + '] the name is bold --text-primary at --font-size-body',
      grid.style.nameColor === hexToRgb(want['--text-primary']) &&
        grid.style.nameFontSize === SCALE['--font-size-body'] &&
        grid.style.nameWeight === SCALE['--font-weight-bold'],
      grid.style.nameColor + ' / ' + grid.style.nameFontSize + ' / ' + grid.style.nameWeight,
    )
    check(
      '[' + theme + '] the ability line is --text-secondary',
      grid.style.abilityColor === hexToRgb(want['--text-secondary']),
      String(grid.style.abilityColor),
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
  await page.click('[data-testid="nav-pokedex"]')
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
  await page.selectOption('[data-testid="vg-select"]', 'platinum')
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
  await page.selectOption('[data-testid="vg-select"]', 'red-blue')
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
  await page.selectOption('[data-testid="vg-select"]', 'all')
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
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)
  const hintAtEnd = await page.evaluate(() => ({
    atEnd: document.querySelector('[data-testid="grid-scroll-hint"]').getAttribute('data-at-end'),
    opacity: getComputedStyle(document.querySelector('[data-testid="grid-scroll-hint"]')).opacity,
  }))
  log('  at the bottom: ' + JSON.stringify(hintAtEnd))
  check(
    'and hides once there is nothing further to scroll to',
    hintAtEnd.atEnd === 'true' && Number(hintAtEnd.opacity) < 0.5,
    JSON.stringify(hintAtEnd),
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)

  // ------------------------------------------- existing modules untouched
  hr('SCOPE — the five modules outside this pass are still not restyled')
  // The Pokedex has deliberately moved -- it is what this pass retrofits -- so the
  // guard now covers the five that have not, and asserts the Pokedex is the only
  // module the design system has reached.
  const UNTOUCHED = ['movedex', 'itemdex', 'abilitydex', 'naturedex', 'berrydex']
  for (const id of UNTOUCHED) {
    await page.click(`[data-testid="nav-${id}"]`)
    await page.waitForSelector(`[data-testid="${id}-rows"]`, { timeout: 30000 })
    const mod = await page.evaluate((dexId) => {
      const row = document.querySelector(`[data-testid^="${dexId}-row-"]`)
      const root = document.querySelector(`[data-testid="dex-${dexId}"]`)
      return {
        fontFamily: row ? getComputedStyle(row).fontFamily : null,
        rows: document.querySelectorAll(`[data-testid^="${dexId}-row-"]`).length,
        dsClasses: root ? root.querySelectorAll('[class^="ds-"]').length : -1,
        cards: root ? root.querySelectorAll('.species-card').length : -1,
      }
    }, id)
    log(`  ${id}: ${mod.rows} rows, font ${mod.fontFamily}`)
    check(
      `${id} still uses the app shell font, not --font-body`,
      mod.fontFamily != null && !/IBM Plex/.test(mod.fontFamily),
      String(mod.fontFamily),
    )
    check(
      `${id} has no design-system component and no grid card`,
      mod.dsClasses === 0 && mod.cards === 0,
      `ds=${mod.dsClasses} cards=${mod.cards}`,
    )
  }
  await page.click('[data-testid="nav-pokedex"]')
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
  stopPreview()
}

hr('SUMMARY')
if (failures.length === 0) {
  log('  ALL CHECKS PASSED')
} else {
  log(`  ${failures.length} FAILURE(S):`)
  failures.forEach((f) => log(`    - ${f}`))
}
process.exit(failures.length === 0 ? 0 : 1)
