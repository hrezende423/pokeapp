/**
 * Verification for the Tools project (docs/tools/PLAN.md): the Tools index, the
 * shared tool page frame, and every tool built from the brief.
 *
 * DEV SERVER, not preview: the math sections import the tools' pure modules into
 * the page (`/pokeapp/src/...`) and check them against cited reference values,
 * the way verify-damage-calc checks its engine. The UI sections then drive the
 * real screens.
 *
 * Each tool adds its own section on the branch that builds it. What every tool
 * must satisfy (the brief's "Done when"):
 *   1. it opens from the Tools index and answers a valid input, no console errors;
 *   2. mechanics tools carry fixtures against published values, one per supported
 *      generation, Gen 1 included where the tool exists there;
 *   3. switching the generation (or the tool's game row) changes the answer;
 *   4. `npm run check` passes.
 *
 * Usage: node scripts/verify-tools.mjs
 */

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { selectGeneration } from './lib/controls.mjs'

const PORT = 4203
const SHOTS = new URL('./.verify-shots/', import.meta.url)
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => fileURLToPath(new URL(name, SHOTS))

const failures = []
let checks = 0
const log = (...a) => console.log(...a)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks++
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

/** Where each registry target lands: the selector its page renders. */
const LANDING = {
  calculator: (tab) => `[data-testid="calc-panel-${tab.toLowerCase().replace(/\s+/g, '-')}"]`,
  'damage-calculator': '[data-testid="calc-damage"]',
  'type-coverage': '[data-testid^="tc-panel-"]',
  'team-matchup': '[data-testid="team-matchup"]',
}
const landingFor = (target) =>
  target.kind === 'calculator' ? LANDING.calculator(target.tab) : LANDING[target.id] ?? `[data-testid="tool-page-${target.id}"]`

const openIndex = async (page) => {
  await page.click('[data-testid="nav-tab-tools"]')
  await page.waitForSelector('[data-testid="tools-index"]', { timeout: 30000 })
  // Off the tab, or its hover dropdown stays open over the page.
  await page.mouse.move(1200, 700)
  await page.waitForSelector('[data-testid="nav-dropdown-tools"]', { state: 'hidden', timeout: 5000 }).catch(() => {})
}

const dev = await startDevServer({ port: PORT })
let browser
const consoleErrors = []
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
  context.setDefaultNavigationTimeout(180000)
  const page = await context.newPage()
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })
  await selectGeneration(page, 4)

  const registry = await page.evaluate(async () => {
    const r = await import('/pokeapp/src/modules/tools/registry.ts')
    return { tools: r.TOOLS, groups: r.TOOL_GROUPS }
  })

  // ------------------------------------------------------------------ 1
  hr('1. THE INDEX -- the Tools tab opens it; every registered tool is listed and opens')
  await openIndex(page)
  const index = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="tools-index"]')
    const cs = getComputedStyle(root)
    return {
      layout: root.dataset.layout,
      areas: cs.gridTemplateAreas,
      items: [...document.querySelectorAll('[data-testid^="tools-item-"]')].map((el) =>
        el.dataset.testid.replace('tools-item-', ''),
      ),
      groups: [...document.querySelectorAll('[data-testid^="tools-group-"]')].map((el) =>
        el.dataset.testid.replace('tools-group-', ''),
      ),
    }
  })
  check('clicking the Tools tab opens the index', index.layout === 'tools-index')
  check(
    'the index is laid out by named areas: title, groups',
    index.areas.includes('title') && index.areas.includes('groups'),
    index.areas,
  )
  check(
    'every registry entry is listed, in registry order',
    JSON.stringify(index.items) === JSON.stringify(registry.tools.map((t) => t.key)),
    `${index.items.length} listed / ${registry.tools.length} registered`,
  )
  const usedGroups = registry.groups.map((g) => g.id).filter((id) => registry.tools.some((t) => t.group === id))
  check('only groups with tools are drawn, in group order', JSON.stringify(index.groups) === JSON.stringify(usedGroups), index.groups.join(','))

  // The dropdown is unchanged: Calculators still leads it.
  await page.hover('[data-testid="nav-tab-tools"]')
  await page.waitForSelector('[data-testid="nav-dropdown-tools"]', { state: 'visible', timeout: 15000 })
  const dropdownFirst = await page.$eval('[data-testid="nav-dropdown-tools"] .nav-item', (el) => el.textContent.trim())
  check('the Tools dropdown still opens, Calculators first', dropdownFirst.startsWith('Calculators'), dropdownFirst)
  await page.mouse.move(700, 900)

  for (const tool of registry.tools) {
    await openIndex(page)
    await page.click(`[data-testid="tool-link-${tool.key}"]`)
    const landing = landingFor(tool.target)
    const landed = await page
      .waitForSelector(landing, { timeout: 60000 })
      .then(() => true)
      .catch(() => false)
    check(`"${tool.label}" opens where it lives`, landed, landing)
  }

  // ------------------------------------------------------------------ 2
  hr('2. GATES -- a tool that cannot answer stays listed, disabled, with the reason')
  await selectGeneration(page, 5)
  await openIndex(page)
  const gen5 = await page.evaluate((tools) =>
    tools.map((t) => ({
      key: t.key,
      gated: Boolean(t.gate),
      disabled: document.querySelector(`[data-testid="tool-link-${t.key}"]`)?.disabled,
      reason: document.querySelector(`[data-testid="tool-reason-${t.key}"]`)?.textContent ?? null,
    })),
  registry.tools)
  check(
    'on Gen 5 every gated tool is disabled and says "Gen 1–4 only"',
    gen5.filter((t) => t.gated).every((t) => t.disabled && t.reason?.startsWith('Gen 1–4 only')),
    gen5.filter((t) => t.gated).map((t) => `${t.key}:${t.disabled}`).join(' '),
  )
  check(
    'tools that own their scope stay open on Gen 5 (Damage, Type Coverage, Team Matchup)',
    gen5.filter((t) => !t.gated).every((t) => t.disabled === false && t.reason == null),
    gen5.filter((t) => !t.gated).map((t) => t.key).join(' '),
  )
  await selectGeneration(page, 'all')
  await openIndex(page)
  const allReason = await page.$eval('[data-testid="tool-reason-1"]', (el) => el.textContent)
  check('under "All" a gated tool asks for a generation', allReason.startsWith('Pick a generation'), allReason)
  await selectGeneration(page, 1)
  await openIndex(page)
  const gen1Disabled = await page.$$eval('[data-testid^="tool-link-"]:disabled', (els) => els.length)
  check('on Gen 1 nothing built so far is disabled', gen1Disabled === 0, `${gen1Disabled} disabled`)

  // Both themes photographed (MODULE-PATTERNS §9), on Gen 4 so nothing is greyed.
  await selectGeneration(page, 4)
  await openIndex(page)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.screenshot({ path: shot(`tools-index-${theme}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

  // ------------------------------------------------------------------ 3
  hr('3. PHONE WIDTH -- no sideways scroll on the index')
  await page.setViewportSize({ width: 390, height: 844 })
  await openIndex(page)
  const narrow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  check('no sideways overflow at phone width', narrow.scroll <= narrow.client + 1, JSON.stringify(narrow))
  await page.setViewportSize({ width: 1440, height: 1000 })

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  if (browser) await browser.close()
  await dev.stop()
}

log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
