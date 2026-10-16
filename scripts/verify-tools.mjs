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
import { goToPage } from './lib/nav.mjs'

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
const landingFor = (tool) =>
  tool.target.kind === 'calculator'
    ? LANDING.calculator(tool.target.tab)
    : LANDING[tool.target.id] ?? `[data-testid="tool-page-${tool.key}"]`

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
    const landing = landingFor(tool)
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
  check('on Gen 1 only Hidden Power (Gen 2–4) is disabled', gen1Disabled === 1, `${gen1Disabled} disabled`)

  // ------------------------------------------------------------------ #1
  hr('#1 STAT CALCULATOR -- Bulbapedia "Stat" worked examples, every generation')
  /*
    Read in a real browser 2026-10-15 (Bulbapedia 403s scripts), "Stat" →
    Formula → Example:
      Gen I/II: level 81 Pikachu, DVs Atk 8 Def 13 Spe 5 Spc 9 (HP DV 7), Stat Exp
        HP 22850 Atk 23140 Def 17280 Spc 19625 Spe 24795 -> 189 / 137 / 101 /
        Sp.Atk 128 / Sp.Def 112 / 190; Gen I's Special (base 50) is the 128.
      Gen III on: level 78 Adamant Garchomp, IVs 24/12/30/16/23/5, EVs
        74/190/91/48/84/23 -> 289 / 278 / 193 / 135 / 171 / 171. The formula is
        "Generation III onward", so Gen 3 is checked with the same numbers.
  */
  const statFixtures = await page.evaluate(async () => {
    const s = await import('/pokeapp/src/modules/team-builder/statMath.ts')
    const neutral = { increased: null, decreased: null }
    const adamant = { increased: 'attack', decreased: 'special-attack' }
    const pikaDv = { attack: 8, defense: 13, speed: 5, special: 9 }
    const pikaExp = { hp: 22850, attack: 23140, defense: 17280, special: 19625, speed: 24795 }
    const pika = (generation, key, base, effortKey = key) =>
      s.computeStat({
        generation, level: 81, base, key: effortKey, nature: neutral,
        effort: pikaExp, individual: pikaDv,
      })
    const chompIv = { hp: 24, attack: 12, defense: 30, 'special-attack': 16, 'special-defense': 23, speed: 5 }
    const chompEv = { hp: 74, attack: 190, defense: 91, 'special-attack': 48, 'special-defense': 84, speed: 23 }
    const chompBase = { hp: 108, attack: 130, defense: 95, 'special-attack': 80, 'special-defense': 85, speed: 102 }
    const chomp = (generation) =>
      Object.keys(chompBase).map((key) =>
        s.computeStat({ generation, level: 78, base: chompBase[key], key, effort: chompEv, individual: chompIv, nature: adamant }),
      )
    return {
      gen1: [pika(1, 'hp', 35), pika(1, 'attack', 55), pika(1, 'defense', 30), pika(1, 'special', 50), pika(1, 'speed', 90)],
      // Gen 2 split Special into two BASE stats; the DV and Stat Exp stay the Special ones.
      gen2: [pika(2, 'hp', 35), pika(2, 'attack', 55), pika(2, 'defense', 30), pika(2, 'special', 50), pika(2, 'special', 40), pika(2, 'speed', 90)],
      hpDv: s.hpDvFrom(pikaDv),
      gen3: chomp(3),
      gen4: chomp(4),
    }
  })
  check('Gen 1: level 81 Pikachu is 189 / 137 / 101 / Special 128 / 190', JSON.stringify(statFixtures.gen1) === '[189,137,101,128,190]', JSON.stringify(statFixtures.gen1))
  check('Gen 2: the same Pikachu is 189 / 137 / 101 / 128 / 112 / 190', JSON.stringify(statFixtures.gen2) === '[189,137,101,128,112,190]', JSON.stringify(statFixtures.gen2))
  check('its HP DV is 7, packed from the other four', statFixtures.hpDv === 7, String(statFixtures.hpDv))
  check('Gen 3: level 78 Adamant Garchomp is 289 / 278 / 193 / 135 / 171 / 171', JSON.stringify(statFixtures.gen3) === '[289,278,193,135,171,171]', JSON.stringify(statFixtures.gen3))
  check('Gen 4: the same Garchomp, same numbers', JSON.stringify(statFixtures.gen4) === '[289,278,193,135,171,171]', JSON.stringify(statFixtures.gen4))

  // The screen: the generation switches the formula and the stat list; Gen 5 says why it cannot answer.
  const statLabels = async (gen) => {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-1"]')
    await page.waitForSelector('[data-testid="calc-panel-stat"]', { timeout: 30000 })
    return page.$$eval('[data-testid="calc-stat-result"] .ds-stat-label', (els) => els.map((e) => e.textContent.trim()))
  }
  const g1 = await statLabels(1)
  const g3 = await statLabels(3)
  check('Gen 1 lists the unsplit Special', g1.includes('Special') && !g1.includes('Sp. Atk'), g1.join(','))
  check('Gen 3 lists Sp. Atk and Sp. Def instead', g3.includes('Sp. Atk') && g3.includes('Sp. Def') && !g3.includes('Special'), g3.join(','))
  await selectGeneration(page, 5)
  // The index link is disabled on Gen 5, so through the dropdown.
  await goToPage(page, 'tools', 'calculators')
  await page.waitForSelector('[data-testid="calc-scroll-area"]', { timeout: 30000 })
  await page.click('.calc-subnav [role="tab"]:text-is("Stat")')
  const gen5Stat = await page.$eval('[data-testid="calc-panel-stat"]', (el) => ({
    reason: el.querySelector('[data-testid="tool-reason"]')?.textContent ?? null,
    form: Boolean(el.querySelector('[data-testid="calc-stat"]')),
  }))
  check('on Gen 5 the Stat tab says "Gen 1–4 only" instead of a form', gen5Stat.reason?.startsWith('Gen 1–4 only') && !gen5Stat.form, JSON.stringify(gen5Stat))
  await page.mouse.move(1200, 700)

  // ------------------------------------------------------------------ #2
  hr('#2 HIDDEN POWER -- against the games\' own routines')
  /*
    Bulbapedia did not load in the browser on 2026-10-15, so per the plan's
    fallback the expectations are worked by hand from the pinned routines:
      Gen 2: pokecrystal engine/battle/hidden_power.asm (HiddenPowerDamage) --
        power = ((top bits Atk,Def,Spe,Spc as 8,4,2,1) * 5 + (Spc & 3)) / 2 + 31;
        type = ((Atk & 3) << 2 | (Def & 3)), from Fighting, skipping Bird/unused.
      Gen 3: pokeemerald src/battle_script_commands.c (Cmd_hiddenpowercalc) --
        bits HP,Atk,Def,Spe,SpA,SpD; power = 40 * secondBits / 63 + 30;
        type = 15 * lowBits / 63, from Fighting, skipping Mystery.
  */
  const hpMath = await page.evaluate(async () => {
    const m = await import('/pokeapp/src/modules/tools/hidden-power/hiddenPowerMath.ts')
    const r = (gen, raw) => {
      const o = m.readHiddenPower(gen, raw)
      return o.ok ? `${o.type} ${o.power}` : `reason: ${o.reason}`
    }
    const all = (keys, v) => Object.fromEntries(keys.map((k) => [k, String(v)]))
    return {
      g2max: r(2, all(m.HP_KEYS_GEN2, 15)),
      g2min: r(2, all(m.HP_KEYS_GEN2, 0)),
      g2rock: r(2, { attack: '13', defense: '12', speed: '15', special: '14' }),
      g3max: r(3, all(m.HP_KEYS_GEN34, 31)),
      g4min: r(4, all(m.HP_KEYS_GEN34, 0)),
      g4fire: r(4, { hp: '31', attack: '30', defense: '31', speed: '30', 'special-attack': '30', 'special-defense': '31' }),
      g1: r(1, {}),
      empty: r(3, { ...all(m.HP_KEYS_GEN34, 31), hp: '' }),
      high: r(2, { ...all(m.HP_KEYS_GEN2, 15), attack: '16' }),
      half: r(3, { ...all(m.HP_KEYS_GEN34, 31), speed: '7.5' }),
    }
  })
  check('Gen 2: all DVs 15 is Dark 70', hpMath.g2max === 'dark 70', hpMath.g2max)
  check('Gen 2: all DVs 0 is Fighting 31', hpMath.g2min === 'fighting 31', hpMath.g2min)
  check('Gen 2: Atk 13 / Def 12 / Spe 15 / Spc 14 is Rock 69', hpMath.g2rock === 'rock 69', hpMath.g2rock)
  check('Gen 3: all IVs 31 is Dark 70', hpMath.g3max === 'dark 70', hpMath.g3max)
  check('Gen 4: all IVs 0 is Fighting 30', hpMath.g4min === 'fighting 30', hpMath.g4min)
  check('Gen 4: 31/30/31, Spe 30, SpA 30, SpD 31 is Fire 70', hpMath.g4fire === 'fire 70', hpMath.g4fire)
  check('Gen 1 has no Hidden Power, and says so', hpMath.g1.includes('does not exist in Gen 1'), hpMath.g1)
  check('an empty field is a reason naming it, not a number', hpMath.empty === 'reason: Enter the IVs for HP.', hpMath.empty)
  check('a DV over 15 is a reason, not a number', hpMath.high.startsWith('reason: Attack DV must be'), hpMath.high)
  check('a fractional IV is a reason, not a number', hpMath.half.startsWith('reason: Enter the IVs for Speed'), hpMath.half)

  const openHp = async (gen) => {
    await selectGeneration(page, gen)
    await openIndex(page)
    await page.click('[data-testid="tool-link-2"]')
    await page.waitForSelector('[data-testid="tool-page-2"]', { timeout: 60000 })
  }
  await openHp(2)
  const hpG2 = await page.evaluate(() => ({
    fields: [...document.querySelectorAll('[data-testid^="hp-input-"]')].map((el) => el.dataset.testid.replace('hp-input-', '')),
    result: document.querySelector('[data-testid="hp-result"]')?.innerText.trim(),
    areas: getComputedStyle(document.querySelector('[data-layout="tool-body"]')).gridTemplateAreas,
  }))
  const toolsActive = await page.$eval('[data-testid="nav-tab-tools"]', (el) => el.getAttribute('aria-current'))
  check('on a tool page the Tools tab reads as "you are here"', toolsActive === 'page', String(toolsActive))
  check('Gen 2 asks for four DVs, no HP field', JSON.stringify(hpG2.fields) === '["attack","defense","speed","special"]', hpG2.fields.join(','))
  check('and opens on the maxed spread: Dark 70', hpG2.result?.toLowerCase() === 'dark 70', hpG2.result)
  check('the body is laid out by named areas: inputs, result', hpG2.areas.includes('inputs') && hpG2.areas.includes('result'), hpG2.areas)
  await openHp(4)
  for (const [k, v] of Object.entries({ hp: '31', attack: '30', defense: '31', speed: '30', 'special-attack': '30', 'special-defense': '31' })) {
    await page.fill(`[data-testid="hp-input-${k}"]`, v)
  }
  const hpG4 = await page.$eval('[data-testid="hp-result"]', (el) => el.innerText.trim())
  await page.screenshot({ path: shot('tool-2-hidden-power.png') })
  check('Gen 4 asks for six IVs, and the Fire spread reads Fire 70 on screen', hpG4.toLowerCase() === 'fire 70', hpG4)
  await page.fill('[data-testid="hp-input-hp"]', '')
  const hpReason = await page.$eval('[data-testid="tool-result"]', (el) => ({
    state: el.dataset.state,
    text: el.textContent.trim(),
  }))
  check('clearing a field prints the reason where the result was', hpReason.state === 'reason' && hpReason.text === 'Enter the IVs for HP.', JSON.stringify(hpReason))
  await selectGeneration(page, 1)
  await openIndex(page)
  const hpGen1 = await page.evaluate(() => ({
    disabled: document.querySelector('[data-testid="tool-link-2"]').disabled,
    reason: document.querySelector('[data-testid="tool-reason-2"]')?.textContent,
  }))
  check('on Gen 1 the index lists it disabled: "this exists in Gen 2–4"', hpGen1.disabled && hpGen1.reason?.includes('Gen 2–4'), JSON.stringify(hpGen1))

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
