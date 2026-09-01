/**
 * Scenario verification for the rebuilt species detail page and its four tabs.
 *
 * Serves the production build with `vite preview` and drives it with Playwright,
 * against ?detail — the flag Pokedex.tsx uses while the cutover from the old
 * detail view is still open.
 *
 * WHAT THIS SUITE IS FOR. Almost every claim the page makes is a number that can
 * be read back out of the DOM, so almost nothing here needs an eye: the era-
 * resolved stat lines, the matchup multipliers, the tile counts and the gating of
 * fields that did not exist yet are all assertions. Screenshots are taken for the
 * things that genuinely are gestalt calls (does the two-column split still read as
 * one page, is the sprite grid legible) and for nothing else.
 *
 * THE STAT ASSERTIONS ARE AGAINST REAL GEN 1 STAT LINES, not against the bundle.
 * Bulbasaur 45/49/49/65/45 and Beedrill 65/80/40/75/45 are the published Red/Blue
 * numbers; asserting them proves the resolver, where re-deriving the expectation
 * from past_stats with the same rule would only prove the code agrees with itself.
 * Beedrill is the load-bearing case: its Attack was 90 from Gen 6 and 80 before,
 * and its Gen 1 entry only mentions Special — so a resolver that took the earliest
 * applicable ENTRY instead of resolving per STAT would report 90 here.
 *
 * Usage: node scripts/verify-species-page.mjs
 */

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { controls } from './lib/controls.mjs'

const PORT = 4183
const APP_URL = `http://localhost:${PORT}/pokeapp/?detail=new`
const ORIGIN = `http://localhost:${PORT}`
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

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`preview server never became ready at ${url}`)
}

mkdirSync(SHOTS, { recursive: true })

/*
  Published Gen 1 base stat lines. Ground truth from outside this repo.
  Order: hp, attack, defense, special, speed.
*/
const GEN1_STATS = {
  1: { name: 'Bulbasaur', hp: 45, attack: 49, defense: 49, special: 65, speed: 45 },
  15: { name: 'Beedrill', hp: 65, attack: 80, defense: 40, special: 45, speed: 75 },
  25: { name: 'Pikachu', hp: 35, attack: 55, defense: 30, special: 50, speed: 90 },
}

/* Modern (Gen 4) lines for the same three, to prove the resolver is not just
   always applying the past entry. */
const GEN4_STATS = {
  1: { 'special-attack': 65, 'special-defense': 65, attack: 49 },
  15: { attack: 80, 'special-attack': 45, 'special-defense': 80 },
  25: { defense: 40, 'special-defense': 50, attack: 55 },
}

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', shell: process.platform === 'win32' },
)

let browser
try {
  await waitForServer(`${ORIGIN}/pokeapp/`)
  log(`preview ready at ${APP_URL}`)

  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  const failedResponses = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('response', (r) => {
    if (r.status() >= 400) failedResponses.push({ status: r.status(), url: r.url() })
  })

  const { withControls } = controls(page)

  const selectVersionGroup = async (name) => {
    await withControls(() => page.selectOption('[data-testid="vg-select"]', name))
    await page.waitForFunction(
      (n) => document.querySelector('[data-testid="vg-select"]')?.value === n,
      name,
      { timeout: 30000 },
    )
  }

  const openSpecies = async (id) => {
    await page.click(`[data-testid="species-row-${id}"]`)
    await page.waitForSelector(`[data-testid="species-page"][data-species-id="${id}"]`, {
      timeout: 30000,
    })
  }

  const backToGrid = async () => {
    await page.click('[data-testid="species-page-back"]')
    await page.waitForSelector('[data-testid="species-rows"]', { timeout: 30000 })
  }

  const openTab = async (tab) => {
    await page.click(`[data-testid="species-page-subnav"] .ds-tab:text-is("${tab}")`)
    await page.waitForSelector(`[data-testid="species-page-panel-${tab.toLowerCase()}"]`, {
      timeout: 30000,
    })
  }

  /** The rendered stat line, as { statName: value }. */
  const statLine = () =>
    page.$$eval('[data-testid="species-base-stats"] .species-stat-bars li', (els) =>
      Object.fromEntries(
        els.map((e) => [e.getAttribute('data-stat'), Number(e.getAttribute('data-value'))]),
      ),
    )

  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid="species-rows"]', { timeout: 60000 })

  // ======================================================================== A
  hr('A — the shell still holds with real content in it')

  await selectVersionGroup('heartgold-soulsilver')
  await openSpecies(1)
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })

  const scrollables = await page.$$eval('*', (els) =>
    els
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'inline') return false
        const scrolls = ['auto', 'scroll']
        return (
          (scrolls.includes(cs.overflowY) && el.scrollHeight - el.clientHeight > 8) ||
          (scrolls.includes(cs.overflowX) && el.scrollWidth - el.clientWidth > 8)
        )
      })
      .map((el) => `${el.tagName}.${el.className?.toString().split(' ').join('.')}`),
  )
  log(`  scrollable elements: ${scrollables.join(' | ') || 'none'}`)
  check(
    'the right column is the only scrolling region',
    scrollables.length === 1 && scrollables[0].includes('species-page-scroll'),
    `(${scrollables.length})`,
  )

  const pinnedBefore = await page.$eval('[data-testid="species-page-pinned"]', (el) =>
    Math.round(el.getBoundingClientRect().top),
  )
  await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTo({ top: 1500 }))
  await page.waitForTimeout(150)
  const pinnedAfter = await page.$eval('[data-testid="species-page-pinned"]', (el) =>
    Math.round(el.getBoundingClientRect().top),
  )
  const scrolled = await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTop)
  log(`  right column scrollTop ${scrolled}; pinned top ${pinnedBefore} -> ${pinnedAfter}`)
  check(
    'the pinned column does not move when the right column scrolls',
    pinnedBefore === pinnedAfter,
  )
  /* Against the column's OWN maximum rather than a round number: the Info tab is
     as long as it is, and 500 was a guess that happened to exceed it. */
  const maxScroll = await page.$eval(
    '[data-testid="species-page-scroll"]',
    (el) => el.scrollHeight - el.clientHeight,
  )
  check(
    'and the right column really did scroll, to its own end',
    scrolled > 100 && scrolled === maxScroll,
    `(${scrolled} of ${maxScroll})`,
  )
  await page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTo({ top: 0 }))

  const tabs = await page.$$eval('[data-testid="species-page-subnav"] .ds-tab', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'four page-local tabs, in order',
    tabs.join(',') === 'Info,Learnset,Description,Sprites',
    tabs.join(','),
  )

  // ======================================================================== B
  hr('B — Info tab: every era-sensitive field resolves for the selected generation')

  const gen4Line = await statLine()
  log(`  Bulbasaur, HGSS: ${JSON.stringify(gen4Line)}`)
  check(
    'Gen 4 shows the split Special pair',
    'special-attack' in gen4Line && !('special' in gen4Line),
  )
  check(
    'with the modern values',
    Object.entries(GEN4_STATS[1]).every(([k, v]) => gen4Line[k] === v),
  )
  check('six stat rows', Object.keys(gen4Line).length === 6, `(${Object.keys(gen4Line).length})`)

  const accent = await page.$eval(
    '[data-testid="species-base-stats"] .species-stat-fill',
    (el) => ({
      fill: getComputedStyle(el).backgroundColor,
      token: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    }),
  )
  log(`  stat bar fill ${accent.fill}, --accent ${accent.token}`)
  const accentRgb = accent.token.startsWith('#')
    ? `rgb(${[1, 3, 5].map((i) => parseInt(accent.token.slice(i, i + 2), 16)).join(', ')})`
    : accent.token
  check('the stat bar fill IS --accent (its fourth sanctioned use)', accent.fill === accentRgb)

  const gen4Facts = await page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null
    return {
      abilities: [...document.querySelectorAll('[data-testid^="species-ability-"]')].map((e) => ({
        name: e.getAttribute('data-testid').replace('species-ability-', ''),
        hidden: e.getAttribute('data-hidden-ability') === 'true',
      })),
      eggGroups: [...document.querySelectorAll('[data-testid^="species-egg-group-"]')].map((e) =>
        e.textContent.trim(),
      ),
      gender: document.querySelector('[data-testid="gender-ratio"]')?.dataset ?? {},
      growth: t('growth-rate'),
      shape: t('shape'),
      colour: t('body-colour'),
      catch: t('catch-rate'),
      hatch: t('hatch-time'),
      friendship: t('base-friendship'),
      ev: t('ev-yield'),
      xp: t('base-xp'),
      pokeathlon: t('pokeathlon-pending') != null,
      types: [...document.querySelectorAll('[data-testid="species-info-types"] [data-type]')].map(
        (e) => e.getAttribute('data-type'),
      ),
      evolutionInsideInfo: !!document.querySelector(
        '[data-testid="species-info"] [data-testid="evolution-tree"]',
      ),
    }
  })
  log(`  ${JSON.stringify(gen4Facts)}`)
  /*
    ONE ability, not two. Chlorophyll is Bulbasaur's HIDDEN ability, and hidden
    abilities are a Gen 5 mechanic -- resolveAbilitiesForGeneration correctly drops
    it under a Gen 4 selection, because PokeAPI carries a past entry saying slot 3
    was empty then. 17 species have no such entry and DO leak a hidden ability
    here; see the finding logged below.
  */
  check(
    'abilities are era-resolved: Overgrow only, in Gen 4',
    gen4Facts.abilities.length === 1 &&
      gen4Facts.abilities[0].name === 'overgrow' &&
      !gen4Facts.abilities[0].hidden,
    JSON.stringify(gen4Facts.abilities),
  )
  check(
    'both egg groups, each a control',
    gen4Facts.eggGroups.length === 2 && gen4Facts.eggGroups.includes('Monster'),
    gen4Facts.eggGroups.join(', '),
  )
  check(
    'gender ratio bar carries the split',
    gen4Facts.gender.male === '87.5' && gen4Facts.gender.female === '12.5',
    `${gen4Facts.gender.male}/${gen4Facts.gender.female}`,
  )
  check('growth rate title-cased', gen4Facts.growth === 'Medium Slow', gen4Facts.growth)
  check('shape and body colour', gen4Facts.shape === 'Quadruped' && gen4Facts.colour === 'Green')
  check('catch rate with its percentage', /^45\s*~18\s*%$/.test(gen4Facts.catch), gen4Facts.catch)
  check(
    'hatch time in cycles and steps',
    /^20cycles~5,355steps$/.test(gen4Facts.hatch.replace(/\s/g, '')),
    gen4Facts.hatch,
  )
  check('base friendship', gen4Facts.friendship === '70', gen4Facts.friendship)
  check('EV yield present in Gen 4', /Sp. Atk/.test(gen4Facts.ev ?? ''), gen4Facts.ev)
  check('XP yield', gen4Facts.xp === '64', gen4Facts.xp)
  check('Pokeathlon note under a Gen 4 selection', gen4Facts.pokeathlon === true)
  check(
    'types resolve to grass/poison',
    gen4Facts.types.join('/') === 'grass/poison',
    gen4Facts.types.join('/'),
  )
  check('the evolution chart is reused inside the Info tab', gen4Facts.evolutionInsideInfo)

  const heldPikachu = async () => {
    await backToGrid()
    await openSpecies(25)
    await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
    return page.evaluate(() => ({
      items: [...document.querySelectorAll('[data-testid^="held-item-"]')].map((e) => ({
        key: e.getAttribute('data-testid').replace('held-item-', ''),
        rarity: e.getAttribute('data-rarity'),
      })),
      none: document.querySelector('[data-testid="held-items-none"]')?.textContent?.trim() ?? null,
    }))
  }
  const pikachuHgss = await heldPikachu()
  log(`  Pikachu held items, HGSS: ${JSON.stringify(pikachuHgss)}`)
  /* Both of them, at their real HeartGold/SoulSilver rates: Oran Berry 50%, Light
     Ball 5%. Two items at different rarities is the case the per-version scoping
     exists for. */
  const heldRate = (key) => pikachuHgss.items.find((i) => i.key === key)?.rarity
  check(
    'held items scope to the selected game, at their real rates',
    pikachuHgss.items.length === 2 &&
      heldRate('oran-berry') === '50' &&
      heldRate('light-ball') === '5',
    JSON.stringify(pikachuHgss.items),
  )

  /*
    FINDING, logged rather than asserted because it is a pending decision, not a
    regression this suite introduced: 17 species show a slot-3 HIDDEN ability under
    a Gen 4 selection (12 under Gen 3), and hidden abilities did not exist until
    Gen 5. PokeAPI has no past_abilities entry emptying slot 3 for them, so the
    resolver has nothing to go on. Asserting either way would bake in an answer.
  */
  await backToGrid()
  await openSpecies(109) // Koffing -- Stench, its Gen 5 hidden ability
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  const koffing = await page.$$eval('[data-testid^="species-ability-"]', (els) =>
    els.map(
      (e) =>
        `${e.getAttribute('data-testid').replace('species-ability-', '')}${
          e.getAttribute('data-hidden-ability') === 'true' ? ' (hidden)' : ''
        }`,
    ),
  )
  log(`  FINDING  Koffing under Gen 4 shows: ${koffing.join(', ')}`)
  log('  FINDING  hidden abilities are a Gen 5 mechanic; 17 species leak one here.')
  log('  FINDING  a one-line gate in resolveAbilitiesForGeneration would fix it.')

  await backToGrid()
  await openSpecies(1)
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  await page.screenshot({ path: `${SHOTS}/species-page-info-gen4.png` })

  // ---- the same page under a Gen 1 selection ----------------------------
  hr('B2 — Gen 1: one combined Special, and the fields that did not exist yet')

  await selectVersionGroup('red-blue')
  await page.waitForTimeout(200)

  for (const [id, expected] of Object.entries(GEN1_STATS)) {
    await backToGrid()
    await openSpecies(Number(id))
    await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
    const line = await statLine()
    const ok =
      Object.keys(line).length === 5 &&
      line.hp === expected.hp &&
      line.attack === expected.attack &&
      line.defense === expected.defense &&
      line.special === expected.special &&
      line.speed === expected.speed
    check(
      `${expected.name}'s Gen 1 stat line matches the published Red/Blue numbers`,
      ok,
      JSON.stringify(line),
    )
  }

  const gen1Gating = await page.evaluate(() => {
    const t = (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null
    return {
      abilitiesNone: t('abilities-none'),
      eggGroupsNone: t('egg-groups-none'),
      evNone: t('ev-yield-none'),
      heldNone: t('held-items-none'),
      pokeathlon: t('pokeathlon-pending'),
      specialAside: document.querySelector('[data-testid="stat-total"]')?.textContent?.trim(),
      matchupCells: document.querySelectorAll('[data-testid^="matchup-cell-"]').length,
    }
  })
  log(`  ${JSON.stringify(gen1Gating)}`)
  check('abilities say they did not exist', /None in Gen 1/.test(gen1Gating.abilitiesNone ?? ''))
  check('egg groups say breeding arrived in Gen 2', /Gen 2/.test(gen1Gating.eggGroupsNone ?? ''))
  check('EV yield names the Stat Exp era', /Stat Exp/.test(gen1Gating.evNone ?? ''))
  check(
    'held items say they are not recorded before Gen 3',
    /Gen 3/.test(gen1Gating.heldNone ?? ''),
  )
  check('no Pokeathlon section outside Gen 4', gen1Gating.pokeathlon === null)
  check(
    'the total notes the combined Special',
    /combined Special/.test(gen1Gating.specialAside ?? ''),
  )
  check(
    '15 attacking types in Gen 1, not 17',
    gen1Gating.matchupCells === 15,
    `(${gen1Gating.matchupCells})`,
  )

  await page.screenshot({ path: `${SHOTS}/species-page-info-gen1.png` })

  // ======================================================================== C
  hr('C — the type matchup chart, against known matchups')

  const matchups = async (id, expect) => {
    await backToGrid()
    await openSpecies(id)
    await page.waitForSelector('[data-testid="type-matchup-chart"]', { timeout: 30000 })
    const got = await page.evaluate(
      (types) =>
        Object.fromEntries(
          types.map((t) => [
            t,
            Number(
              document
                .querySelector(`[data-testid="matchup-cell-${t}"]`)
                ?.getAttribute('data-multiplier'),
            ),
          ]),
        ),
      Object.keys(expect),
    )
    const ok = Object.entries(expect).every(([t, m]) => got[t] === m)
    check(`species #${id} matchups`, ok, JSON.stringify(got))
  }

  await selectVersionGroup('heartgold-soulsilver')
  await matchups(6, { rock: 4, water: 2, electric: 2, grass: 0.25, fire: 0.5, ground: 0 })
  await matchups(1, { fire: 2, ice: 2, flying: 2, psychic: 2, grass: 0.25, water: 0.5 })
  /* Ground is x2 on Gengar: Poison takes double from Ground and Ghost is neutral
     to it. Levitate makes it immune in play, but that is an ability, and this chart
     is about typing. */
  await matchups(94, { normal: 0, ground: 2, psychic: 2, dark: 2, poison: 0.25 })

  const neutralDim = await page.$$eval(
    '[data-testid^="matchup-cell-"]',
    (els) => els.filter((e) => e.getAttribute('data-neutral') === 'true').length,
  )
  log(`  neutral (x1) cells on Gengar: ${neutralDim}`)
  check('neutral cells are marked so they can recede', neutralDim > 0)

  // ======================================================================== D
  hr('D — Learnset tab: the page has its own generation scope')

  await backToGrid()
  await openSpecies(1)
  await openTab('Learnset')
  await page.waitForSelector('[data-testid="species-learnset"]', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
    timeout: 60000,
  })

  const scopeState = () =>
    page.evaluate(() => ({
      generations: [
        ...document.querySelectorAll('[data-testid^="learnset-scope-generation-"]'),
      ].map((e) => ({
        gen: Number(e.getAttribute('data-testid').split('-').pop()),
        active: e.getAttribute('data-active') === 'true',
      })),
      games: [...document.querySelectorAll('[data-testid^="learnset-scope-game-"]')].map((e) => ({
        name: e.getAttribute('data-testid').replace('learnset-scope-game-', ''),
        active: e.getAttribute('data-active') === 'true',
      })),
      versionGroup: document
        .querySelector('[data-testid="species-learnset"]')
        ?.getAttribute('data-version-group'),
      sections: [...document.querySelectorAll('[data-testid^="species-learn-"]')]
        .filter((e) => !e.getAttribute('data-testid').endsWith('-rows'))
        .map((e) => ({
          method: e.getAttribute('data-testid').replace('species-learn-', ''),
          rows: Number(e.getAttribute('data-rows')),
        })),
    }))

  const gen4Scope = await scopeState()
  log(`  ${JSON.stringify(gen4Scope)}`)
  check(
    'the scope seeds from the app selection',
    gen4Scope.versionGroup === 'heartgold-soulsilver',
    gen4Scope.versionGroup,
  )
  check(
    'all four generations offered for a Gen 1 species',
    gen4Scope.generations.map((g) => g.gen).join(',') === '1,2,3,4',
  )
  check('exactly one generation active', gen4Scope.generations.filter((g) => g.active).length === 1)
  check(
    'Gen 4 offers its three game tables',
    gen4Scope.games.length === 3 &&
      gen4Scope.games.some((g) => g.name === 'heartgold-soulsilver' && g.active),
    gen4Scope.games.map((g) => g.name).join(','),
  )
  check(
    'grouped by learn method, level-up first',
    gen4Scope.sections.length >= 3 && gen4Scope.sections[0].method === 'level-up',
    gen4Scope.sections.map((s) => `${s.method}:${s.rows}`).join(' '),
  )

  const levelsAscending = await page.$$eval(
    '[data-testid="species-learn-level-up-rows"] tbody tr td:first-child',
    (els) => els.map((e) => Number(e.textContent.trim())).filter((n) => !Number.isNaN(n)),
  )
  check(
    'the level-up table opens sorted by level',
    levelsAscending.every((n, i) => i === 0 || n >= levelsAscending[i - 1]),
    `[${levelsAscending.slice(0, 8).join(', ')}…]`,
  )

  const machineLabels = await page.$$eval(
    '[data-testid="species-learn-machine-rows"] tbody tr td:first-child',
    (els) => els.map((e) => e.textContent.trim()),
  )
  check(
    'TM/HM rows carry the real machine number, not just "machine"',
    machineLabels.length > 0 && machineLabels.every((l) => /^(TM|HM)\d+$/i.test(l)),
    machineLabels.slice(0, 6).join(', '),
  )

  // Switch this page's generation, and only this page's.
  await page.click('[data-testid="learnset-scope-generation-1"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="species-learnset"]')
        ?.getAttribute('data-version-group') === 'red-blue' ||
      document
        .querySelector('[data-testid="species-learnset"]')
        ?.getAttribute('data-version-group') === 'yellow',
    { timeout: 30000 },
  )
  await page.waitForFunction(() => !document.querySelector('[data-testid="learnset-loading"]'), {
    timeout: 60000,
  })
  const gen1Scope = await scopeState()
  log(`  after picking Gen 1: ${JSON.stringify(gen1Scope)}`)
  check(
    'picking a generation lands on its newest game',
    gen1Scope.versionGroup === 'yellow',
    gen1Scope.versionGroup,
  )
  check(
    'and the learnset really changed',
    JSON.stringify(gen1Scope.sections) !== JSON.stringify(gen4Scope.sections),
    gen1Scope.sections.map((s) => `${s.method}:${s.rows}`).join(' '),
  )
  const appSelection = await page.$eval('[data-testid="vg-select"]', (el) => el.value)
  check(
    'the app-wide selector is untouched by the page-local one',
    appSelection === 'heartgold-soulsilver',
    appSelection,
  )

  await page.screenshot({ path: `${SHOTS}/species-page-learnset.png` })

  // ======================================================================== E
  hr('E — Description tab: flavour text and locations under one game selector')

  await openTab('Description')
  await page.waitForSelector('[data-testid="species-description"]', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="locations-loading"]'), {
    timeout: 60000,
  })

  const describe = () =>
    page.evaluate(() => ({
      versionGroup: document
        .querySelector('[data-testid="species-description"]')
        ?.getAttribute('data-version-group'),
      flavour: [...document.querySelectorAll('[data-testid^="species-flavor-"]')]
        .filter((e) => e.getAttribute('data-testid') !== 'species-flavor-none')
        .map((e) => ({
          version: e.getAttribute('data-testid').replace('species-flavor-', ''),
          text: e.querySelector('.species-flavor-text')?.textContent?.trim() ?? '',
        })),
      rows: document.querySelectorAll('[data-testid="species-locations-rows"] tbody tr').length,
      empty: document.querySelector('[data-testid="locations-empty"]') != null,
    }))

  const desc = await describe()
  log(`  ${desc.versionGroup}: ${desc.flavour.length} entries, ${desc.rows} location rows`)
  desc.flavour.forEach((f) => log(`    ${f.version}: ${f.text.slice(0, 60)}…`))
  /*
    Yellow, NOT the app's HeartGold/SoulSilver -- the page owns one game scope that
    both tabs read, so the Gen 1 pick made on the Learnset tab is still in force
    here. Two independent per-tab scopes was the first shape and it was wrong: it
    also reset every time a tab was left, since only one tab is mounted at a time.
  */
  check(
    'the Description tab inherits the scope set on the Learnset tab',
    desc.versionGroup === 'yellow',
    desc.versionGroup,
  )
  check(
    'one flavour entry per version in the selected group',
    desc.flavour.length === 1 && desc.flavour[0].version === 'yellow',
    desc.flavour.map((f) => f.version).join(','),
  )
  check('with real text in it', desc.flavour[0]?.text.length > 20)
  check('locations either listed or explicitly empty', desc.rows > 0 || desc.empty)

  // A species that IS found in the wild, to prove the table renders rows.
  await page.click('[data-testid="description-scope-generation-4"]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="species-description"]')
        ?.getAttribute('data-version-group') === 'heartgold-soulsilver',
    { timeout: 30000 },
  )
  await page.waitForFunction(() => !document.querySelector('[data-testid="locations-loading"]'), {
    timeout: 60000,
  })
  const descGen4 = await describe()
  log(`  ${descGen4.versionGroup}: ${descGen4.flavour.length} entries, ${descGen4.rows} rows`)
  check(
    'switching the game switches both halves together',
    descGen4.flavour.length === 2 &&
      descGen4.flavour.map((f) => f.version).join(',') === 'heartgold,soulsilver',
    descGen4.flavour.map((f) => f.version).join(','),
  )

  await backToGrid()
  await openSpecies(16) // Pidgey — common wild encounter in every Gen 1-4 game
  await openTab('Description')
  await page.waitForFunction(() => !document.querySelector('[data-testid="locations-loading"]'), {
    timeout: 60000,
  })
  const pidgey = await describe()
  log(`  Pidgey in ${pidgey.versionGroup}: ${pidgey.rows} location rows`)
  check('a wild-encounterable species lists real locations', pidgey.rows > 0, `(${pidgey.rows})`)

  await page.screenshot({ path: `${SHOTS}/species-page-description.png` })

  // ======================================================================== F
  hr('F — Sprites tab: every tile the bitmask claims, each labelled')

  await openTab('Sprites')
  await page.waitForSelector('[data-testid="species-sprites"]', { timeout: 30000 })

  const sprites = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="species-sprites"]')
    const cards = [...document.querySelectorAll('.sprite-card')]
    return {
      claimed: Number(root?.getAttribute('data-tiles')),
      tileCards: document.querySelectorAll('[data-testid^="sprite-tile-"]').length,
      artwork: document.querySelectorAll('[data-testid^="sprite-artwork-"]').length,
      animated: document.querySelectorAll('[data-testid^="sprite-animated-"]').length,
      gameSections: [...document.querySelectorAll('[data-testid^="sprites-game-"]')].map((e) => ({
        game: e.getAttribute('data-testid').replace('sprites-game-', ''),
        gen: Number(e.getAttribute('data-generation')),
      })),
      unlabelled: cards.filter(
        (c) =>
          !c.querySelector('.sprite-card-primary')?.textContent?.trim() ||
          !c.querySelector('.sprite-card-secondary')?.textContent?.trim(),
      ).length,
      missingAlt: cards.filter((c) => !c.querySelector('img')?.getAttribute('alt')).length,
      lazy: cards.every((c) => c.querySelector('img')?.getAttribute('loading') === 'lazy'),
      pixelated: [...document.querySelectorAll('[data-testid^="sprite-tile-"] img')].every((i) =>
        i.classList.contains('is-pixelated'),
      ),
      artworkNotPixelated: [
        ...document.querySelectorAll('[data-testid^="sprite-artwork-"] img'),
      ].every((i) => !i.classList.contains('is-pixelated')),
      slots: [...document.querySelectorAll('[data-testid^="sprite-tile-"]')].map((e) =>
        e.getAttribute('data-testid').replace('sprite-tile-', ''),
      ),
    }
  })
  log(`  Pidgey: ${sprites.claimed} tiles across ${sprites.gameSections.length} games`)
  log(`  games: ${sprites.gameSections.map((g) => `${g.game}(g${g.gen})`).join(' ')}`)
  check(
    'a card for every tile the bitmask decodes',
    sprites.claimed === sprites.tileCards,
    `${sprites.claimed} vs ${sprites.tileCards}`,
  )
  check('both artwork variants', sprites.artwork === 2, `(${sprites.artwork})`)
  check('the animated set is present', sprites.animated >= 2, `(${sprites.animated})`)
  check(
    'only Gen 1-4 games appear',
    sprites.gameSections.every((g) => g.gen >= 1 && g.gen <= 4),
  )
  check('every card is labelled on both lines', sprites.unlabelled === 0, `(${sprites.unlabelled})`)
  check('every image has alt text', sprites.missingAlt === 0, `(${sprites.missingAlt})`)
  check('every image is lazy', sprites.lazy)
  check(
    'game sprites are nearest-neighbour, artwork is not',
    sprites.pixelated && sprites.artworkNotPixelated,
  )
  check(
    'no slot is listed twice for one game',
    new Set(sprites.slots).size === sprites.slots.length,
  )

  /*
    Do the URLs the path table builds actually resolve? Sampled rather than
    exhaustive: the transparent-back path was the one that would 404, so the
    sample deliberately includes whatever transparent and gray tiles this species
    has. Requested through the browser so the SW/runtime caching path is the one
    under test.
  */
  const sampled = await page.evaluate(async () => {
    const all = [...document.querySelectorAll('[data-testid^="sprite-tile-"] img')].map(
      (i) => i.src,
    )
    const odd = all.filter((u) => /transparent|gray/.test(u))
    const pick = [...new Set([...odd, ...all.slice(0, 6)])].slice(0, 12)
    const results = []
    for (const url of pick) {
      try {
        const res = await fetch(url, { method: 'GET' })
        results.push({ url, status: res.status })
      } catch (err) {
        results.push({ url, status: String(err) })
      }
    }
    return results
  })
  const bad = sampled.filter((r) => r.status !== 200)
  log(`  sampled ${sampled.length} tile URLs, ${bad.length} not 200`)
  bad.forEach((b) => log(`    ${b.status} ${b.url}`))
  check('every sampled per-game sprite URL resolves', bad.length === 0)

  await page.screenshot({ path: `${SHOTS}/species-page-sprites.png` })

  // ======================================================================== G
  hr('G — cross-navigation into the Breedingdex from the Info tab')

  await openTab('Info')
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  const groupId = await page.$eval('[data-testid^="species-egg-group-"]', (el) =>
    el.getAttribute('data-egg-group-id'),
  )
  await page.click(`[data-testid="species-egg-group-${groupId}"]`)
  await page.waitForSelector('[data-testid="breedingdex-detail"]', { timeout: 30000 })
  const landedOn = await page.$eval('[data-testid="breedingdex-detail"]', (el) =>
    el.getAttribute('data-entry-id'),
  )
  check(
    'an egg group opens that group in the Breedingdex',
    landedOn === groupId,
    `${groupId} -> ${landedOn}`,
  )

  // ======================================================================== H
  hr('H — CONSOLE / PAGE / HTTP')
  const sameOrigin = failedResponses.filter((r) => r.url.startsWith(ORIGIN))
  const external = failedResponses.filter((r) => !r.url.startsWith(ORIGIN))
  log(`  console errors : ${consoleErrors.length}`)
  consoleErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  page errors    : ${pageErrors.length}`)
  pageErrors.slice(0, 10).forEach((e) => log(`    ${e}`))
  log(`  same-origin >=400 : ${sameOrigin.length}`)
  sameOrigin.slice(0, 10).forEach((r) => log(`    ${r.status} ${r.url}`))
  /* External failures are reported but not asserted: the sprite hosts are
     third-party and a rate-limit there is not a defect in this page. The sampled
     URL check above is what proves the paths are right. */
  log(`  external >=400 (not asserted) : ${external.length}`)
  external.slice(0, 6).forEach((r) => log(`    ${r.status} ${r.url}`))
  check('no console errors', consoleErrors.length === 0)
  check('no uncaught page errors', pageErrors.length === 0)
  check('no failed same-origin responses', sameOrigin.length === 0)

  hr('SUMMARY')
  if (failures.length === 0) log('  ALL SCENARIOS PASSED')
  else {
    log(`  ${failures.length} FAILED:`)
    failures.forEach((f) => log(`    - ${f}`))
  }
  log(`  screenshots written to ${SHOTS}/`)
} finally {
  if (browser) await browser.close()
  preview.kill()
}

process.exit(failures.length ? 1 : 0)
