/**
 * Scenario verification for the rebuilt species detail page and its four tabs.
 *
 * Serves the production build with `vite preview` and drives it with Playwright.
 * This IS the live detail view now: the ?detail flag and the old rail-plus-cards
 * page were retired once the four tabs landed and the old page's four-axis artwork
 * control was folded into the Sprites tab.
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
import { goToDex } from './lib/nav.mjs'

const PORT = 4183
const APP_URL = `http://localhost:${PORT}/pokeapp/`
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

  /**
   * Scroll the locations section into view and wait for its partition.
   *
   * IT DOES NOT FETCH UNTIL IT IS SCROLLED TO, which is deliberate -- Info is the
   * default tab, and an eager fetch there would pull up to 2.8 MB of encounters
   * for a visit that only wanted the stat line. So a reader that wants rows has
   * to do what a person does, and `data-loaded` is the section's own record of
   * having been reached.
   */
  const revealLocations = async () => {
    await page.waitForSelector('[data-testid="species-locations"]', { timeout: 30000 })
    await page.$eval('[data-testid="species-locations"]', (el) =>
      el.scrollIntoView({ block: 'center' }),
    )
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="species-locations"]')?.dataset.loaded === 'true' &&
        !document.querySelector('[data-testid="locations-loading"]'),
      { timeout: 60000 },
    )
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
  /*
    SCROLLED TWICE ON PURPOSE. The Info tab grows while you are scrolling it: the
    locations section fetches its partition when it comes into view, so the first
    scroll-to-the-bottom lands at a bottom that then moves. One scroll made this
    assertion a race against a network request -- it failed at 694 of 787 once.
    So: go to the end, let the section settle, go to the new end.
  */
  const toEnd = () =>
    page.$eval('[data-testid="species-page-scroll"]', (el) => el.scrollTo({ top: el.scrollHeight }))
  await toEnd()
  await page.waitForTimeout(150)
  const pinnedAfter = await page.$eval('[data-testid="species-page-pinned"]', (el) =>
    Math.round(el.getBoundingClientRect().top),
  )
  await page.waitForFunction(
    () => document.querySelector('[data-testid="locations-loading"]') == null,
    { timeout: 60000 },
  )
  await toEnd()
  await page.waitForTimeout(150)
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
    scrolled > 100 && Math.abs(scrolled - maxScroll) <= 1,
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
      /* The types are in the BANNER now, not inside the Info tab -- which is
         where the frame puts them (group-TypeText 57:735 is a child of
         container-poke-name) and what makes them visible on all four tabs. Still
         era-resolved through the same resolveTypesForGeneration. */
      types: [...document.querySelectorAll('[data-testid="species-banner-types"] [data-type]')].map(
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
      /* Grouped by multiplier now, so the per-type count is the sum over the
         tiers rather than a cell count -- the claim is unchanged: fifteen
         attacking types in Gen 1, not seventeen. */
      matchupCells: document.querySelectorAll('[data-testid^="matchup-type-"]').length,
      matchupGrouped: Number(
        document.querySelector('[data-testid="type-matchup-chart"]')?.dataset.groupedTypes,
      ),
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
  /* Every type lands in exactly one tier: the component counts what it grouped,
     so a multiplier outside the six known tiers cannot vanish silently. */
  check(
    'every attacking type is in exactly one tier',
    gen1Gating.matchupGrouped === gen1Gating.matchupCells,
    `${gen1Gating.matchupGrouped} of ${gen1Gating.matchupCells}`,
  )

  await page.screenshot({ path: `${SHOTS}/species-page-info-gen1.png` })

  // ======================================================================== C
  hr('C — the type chart, grouped by multiplier, against known matchups')

  /*
    RESTRUCTURED FROM PER-TYPE CELLS TO PER-MULTIPLIER TIERS, so the multiplier is
    now read off the type's TIER rather than off its own cell. The numbers asserted
    are the same published matchups as before -- the regrouping must not change a
    single one of them, which is the point of keeping these three species.
  */
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
                .querySelector(`[data-testid="matchup-type-${t}"]`)
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

  const tiers = await page.evaluate(() => ({
    present: [...document.querySelectorAll('[data-testid^="matchup-tier-"]')].map((e) => ({
      m: e.getAttribute('data-multiplier'),
      n: Number(e.getAttribute('data-count')),
    })),
    declared: Number(document.querySelector('[data-testid="type-matchup-chart"]')?.dataset.tiers),
  }))
  log(`  Gengar tiers: ${tiers.present.map((t) => `${t.m}x:${t.n}`).join('  ')}`)
  check(
    'a neutral tier exists and is populated',
    tiers.present.some((t) => t.m === '1' && t.n > 0),
  )
  check(
    'the declared tier count matches the rendered rows',
    tiers.declared === tiers.present.length,
  )
  /* Nothing hits ghost/poison for quadruple -- Psychic and Dark and Ghost and
     Ground are all x2 and none of them doubles up -- so Gengar genuinely has no x4
     tier, and the row must be absent rather than rendered empty. Same rule as the
     Movedex learn-method grouping. */
  check(
    'no empty x4 tier is rendered for Gengar',
    !tiers.present.some((t) => t.m === '4'),
    tiers.present.map((t) => t.m).join(','),
  )
  check(
    'every rendered tier has at least one type in it',
    tiers.present.every((t) => t.n > 0),
  )

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
  hr('E — Description tab: every game’s entry, in sequence, badged')

  await openTab('Description')
  await page.waitForSelector('[data-testid="species-description"]', { timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="locations-loading"]'), {
    timeout: 60000,
  })

  const describe = () =>
    page.evaluate(() => ({
      /* .species-flavor-entry, not the [data-testid^=] prefix: the per-generation
         group wrappers are species-flavor-group-N and match that prefix too, so the
         prefix form counted four wrappers as four extra versions. */
      flavour: [...document.querySelectorAll('.species-flavor-entry[data-testid]')].map((e) => {
        const badge = e.querySelector('.species-flavor-version')
        const cs = badge ? getComputedStyle(badge) : null
        return {
          version: e.getAttribute('data-testid').replace('species-flavor-', ''),
          text: e.querySelector('.species-flavor-text')?.textContent?.trim() ?? '',
          badgeGame: badge?.getAttribute('data-game') ?? null,
          badgeColored: badge?.getAttribute('data-colored') ?? null,
          badgeColor: cs?.color ?? null,
          badgeFill: cs?.backgroundColor ?? null,
          badgeRadius: cs?.borderTopLeftRadius ?? null,
          badgeTransform: cs?.textTransform ?? null,
        }
      }),
      /* Both must be absent from this tab now: its own selector, which was
         removed, and the locations section, which moved to the Info tab. */
      scopeControl: document.querySelector('[data-testid^="description-scope-"]') != null,
      locations: document.querySelector('[data-testid="species-locations"]') != null,
      declared: Number(
        document.querySelector('[data-testid="species-description"]')?.dataset.flavorEntries,
      ),
      genLabels: [...document.querySelectorAll('.species-flavor-gen-label')].map((e) =>
        e.textContent.trim().toUpperCase(),
      ),
    }))

  const desc = await describe()
  log(`  ${desc.flavour.length} entries`)
  desc.flavour.slice(0, 4).forEach((f) => log(`    ${f.version}: ${f.text.slice(0, 60)}…`))

  /*
    THE TAB HAS NO GAME SELECTOR ANY MORE, so the claims here changed shape rather
    than moving. What used to be asserted -- "the Description tab inherits the
    Learnset tab's scope" and "switching the game switches both halves together" --
    described a control that has been removed; asserting it against the new page
    would be asserting the old design.

    What replaces it is stronger, because it is about the data rather than the
    control: EVERY in-scope version that has an entry is on screen, in bundle order,
    grouped by generation. Bulbasaur has one in all 16.
  */
  check('no game selector on the Description tab', desc.scopeControl === false)
  /* And the locations table is not here either -- it is on the Info tab, checked
     immediately below. Two different kinds of reading in one tab was the reason. */
  check('and no locations table on it any more', desc.locations === false)
  check(
    'every version with an entry is rendered, not one',
    desc.flavour.length === desc.declared && desc.flavour.length > 10,
    `${desc.flavour.length} rendered, ${desc.declared} declared`,
  )
  check(
    'they are grouped by generation, oldest first',
    desc.genLabels.join(',') === 'GENERATION I,GENERATION II,GENERATION III,GENERATION IV',
    desc.genLabels.join(','),
  )
  /* Bundle order, not Object.keys order: red before blue before yellow, and gold
     before the Gen 3 entries. A JSON object's key order is whatever the build
     wrote, which is why listVersionGroups drives this. */
  check(
    'and in chronological order inside a generation',
    desc.flavour
      .slice(0, 4)
      .map((f) => f.version)
      .join(',') === 'red,blue,yellow,gold',
    desc.flavour
      .slice(0, 4)
      .map((f) => f.version)
      .join(','),
  )
  check(
    'with real text in every one of them',
    desc.flavour.every((f) => f.text.length > 20),
  )

  /*
    THE GAME NAME IS A COLOURED BADGE, and the colour comes from a per-game token
    rather than from --text-secondary. PokeAPI has no colour for a version -- see
    GameBadge.tsx -- so the palette is the community version-colour set corrected
    per theme, and what is assertable is that every in-scope version resolves to
    one, that no two adjacent generations collapse to the same colour, and that
    the badge is a real badge: a radius and a fill, not just tinted text.
  */
  const badges = desc.flavour.filter((f) => f.badgeGame)
  const colors = new Set(badges.map((f) => f.badgeColor))
  log(`  badges: ${badges.map((f) => `${f.badgeGame}=${f.badgeColor}`).join(' ')}`)
  check(
    'every entry names its game in a badge',
    badges.length === desc.flavour.length,
    `${badges.length} of ${desc.flavour.length}`,
  )
  check(
    'and every in-scope version has a colour token',
    badges.every((f) => f.badgeColored === 'true'),
    badges
      .filter((f) => f.badgeColored !== 'true')
      .map((f) => f.badgeGame)
      .join(',') || 'all coloured',
  )
  /* Not one colour repeated: 16 entries across 12 distinct games, and Gold/
     HeartGold plus Silver/SoulSilver deliberately share, so >=8 is the floor. */
  check('the colours actually differ per game', colors.size >= 8, `${colors.size} distinct`)
  check(
    'the badge has a fill and a radius, not just coloured text',
    badges.every((f) => f.badgeFill !== 'rgba(0, 0, 0, 0)' && parseFloat(f.badgeRadius ?? '0') > 0),
    `${badges[0]?.badgeFill} r=${badges[0]?.badgeRadius}`,
  )
  check(
    'and it is not upper-cased',
    badges.every((f) => f.badgeTransform === 'none'),
    badges[0]?.badgeTransform ?? '',
  )

  await page.screenshot({ path: `${SHOTS}/species-page-description.png` })

  // ======================================================================= E2
  hr('E2 — locations moved to the Info tab, under the two charts')

  /*
    WHERE IT LIVES NOW, and it is an ORDER claim as much as a presence one: below
    the base-stat and evolution charts, above the type-effectiveness table. That
    is the position it was asked for and it is the reason this is not just the
    same section with a different parent.

    LOCATIONS STILL FOLLOW THE APP-WIDE SELECTOR, which is the architecture rule
    in CLAUDE.md; the page's own scope only stands in when that selector is on
    "All". The app is on HeartGold/SoulSilver here even though the Learnset tab
    was left on Yellow, so this also proves the page scope does not reach it.
  */
  await openTab('Info')
  /* Before it is scrolled to, the section exists and has fetched nothing -- which
     is the property that keeps the default tab free, so it is asserted rather
     than skipped past. */
  const beforeScroll = await page.evaluate(() => ({
    present: document.querySelector('[data-testid="species-locations"]') != null,
    loaded: document.querySelector('[data-testid="species-locations"]')?.dataset.loaded,
    idle: document.querySelector('[data-testid="locations-idle"]') != null,
    rows: document.querySelectorAll('[data-testid="species-locations-rows"] tbody tr').length,
  }))
  log(`  before scrolling to it: ${JSON.stringify(beforeScroll)}`)
  check(
    'the section is on the tab but has fetched nothing before it is reached',
    beforeScroll.present && beforeScroll.loaded === 'false' && beforeScroll.rows === 0,
    JSON.stringify(beforeScroll),
  )
  check('and says so instead of showing an empty block', beforeScroll.idle)

  await revealLocations()
  const locate = () =>
    page.evaluate(() => {
      const info = document.querySelector('[data-testid="species-info"]')
      const kids = [...info.children]
      const idx = (sel) => kids.findIndex((k) => k.matches(sel) || k.querySelector(sel))
      const section = document.querySelector('[data-testid="species-locations"]')
      return {
        present: section != null,
        versionGroup: section?.getAttribute('data-version-group') ?? null,
        rows: document.querySelectorAll('[data-testid="species-locations-rows"] tbody tr').length,
        empty: document.querySelector('[data-testid="locations-empty"]') != null,
        scopeNote:
          document.querySelector('[data-testid="locations-scope"]')?.textContent?.trim() ?? null,
        atWide: idx('.species-info-wide'),
        atLocations: idx('[data-testid="species-locations"]'),
        atMatchups: idx('[data-testid="species-type-matchups"]'),
        /* The Version column is a badge here too, so the table and the prose tab
           name a game the same way. */
        badgedVersions: document.querySelectorAll(
          '[data-testid="species-locations-rows"] .species-game-badge',
        ).length,
      }
    })
  const loc = await locate()
  log(`  locations: ${JSON.stringify(loc)}`)
  check('the locations section is on the Info tab', loc.present)
  check(
    'between the two charts and the type table',
    loc.atWide < loc.atLocations && loc.atLocations < loc.atMatchups,
    `wide ${loc.atWide} locations ${loc.atLocations} matchups ${loc.atMatchups}`,
  )
  check('locations either listed or explicitly empty', loc.rows > 0 || loc.empty)
  check(
    'it names the app-selected game, not the page-local one',
    loc.versionGroup === 'heartgold-soulsilver',
    loc.versionGroup,
  )
  check('and says which game it is showing', /HeartGold/.test(loc.scopeNote ?? ''), loc.scopeNote)

  await backToGrid()
  await openSpecies(16) // Pidgey — common wild encounter in every Gen 1-4 game
  await revealLocations()
  const pidgey = await locate()
  log(`  Pidgey in ${pidgey.versionGroup}: ${pidgey.rows} location rows`)
  check('a wild-encounterable species lists real locations', pidgey.rows > 0, `(${pidgey.rows})`)
  check(
    'and every row badges its version',
    pidgey.badgedVersions === pidgey.rows,
    `${pidgey.badgedVersions} of ${pidgey.rows}`,
  )

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
      bw: [...document.querySelectorAll('[data-testid^="sprite-bw-"]')].map((e) => ({
        slot: e.getAttribute('data-testid').replace('sprite-bw-', ''),
        src: e.querySelector('img')?.getAttribute('src') ?? '',
        pixelated: e.querySelector('img')?.classList.contains('is-pixelated') ?? false,
      })),
      bwDeclared: Number(
        document.querySelector('[data-testid="species-sprites"]')?.dataset.bwTiles,
      ),
      bwSection: document.querySelector('[data-testid="sprites-bw-animated"]') != null,
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
  /*
    THE API'S ANIMATED SET, WHICH IS GIF AND IS BLACK/WHITE. Converted to animated
    WebP and hosted beside the existing artwork -- see src/data/animatedSprites.ts
    for the file census. What is assertable here is that the bitmask and the DOM
    agree, that the URLs point at the bw-gen* releases rather than at PokeAPI, and
    that these tiles are nearest-neighbour: they are 2-3x sprites drawn well above
    1:1 in a 7rem card, and smoothing a GIF-derived sprite is exactly what grows a
    soft white edge on it.
  */
  log(`  bw animated: ${sprites.bw.length} tiles, declared ${sprites.bwDeclared}`)
  sprites.bw.slice(0, 3).forEach((t) => log(`    ${t.slot}: ${t.src}`))
  check(
    'the Black/White animated section is on the tab',
    sprites.bwSection && sprites.bw.length === sprites.bwDeclared && sprites.bw.length >= 4,
    `${sprites.bw.length} of ${sprites.bwDeclared}`,
  )
  check(
    'and every tile is one of our converted WebPs, not an upstream GIF',
    sprites.bw.every((t) => /\/releases\/download\/bw-gen[1-4]\/\d{3}-bw-/.test(t.src)) &&
      sprites.bw.every((t) => t.src.endsWith('.webp')),
    sprites.bw[0]?.src ?? '',
  )
  check(
    'drawn nearest-neighbour, so nothing interpolates the transparent pixels',
    sprites.bw.every((t) => t.pixelated),
  )

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

  /*
    THE SAME QUESTION FOR THE BLACK/WHITE SET, and it is the one that would go
    wrong silently. The availability bitmask in src/data/animatedSprites.ts and
    the 2,340 uploaded release assets are two records of the same file census; if
    they disagree, the mask says a slot exists and the release 404s. Every card on
    screen is checked rather than a sample, because the mask is what decided which
    cards to draw and this is the only thing that closes that loop.

    Naming the release rather than the sprite dir also matters here: these are
    conversions we host, not PokeAPI's GIFs, so a URL that fell back upstream
    would still load and would still be wrong.

    FETCHED FROM NODE, NOT FROM THE PAGE, which the per-game check above does not
    have to do. A GitHub release asset redirects to objects.githubusercontent.com,
    which sends no Access-Control-Allow-Origin -- so an in-page fetch fails CORS
    and logs a console error, while the <img> that actually renders it does not
    care. Checking it from the harness asks the real question (does the asset
    exist) without inventing a failure the app never has.
  */
  const bwUrls = await page.$$eval('[data-testid^="sprite-bw-"] img', (els) =>
    els.map((i) => i.src),
  )
  const bwResults = []
  for (const url of bwUrls) {
    try {
      const res = await fetch(url)
      /*
        THE FILE'S OWN HEADER, NOT THE Content-Type. GitHub serves every release
        asset as application/octet-stream -- the existing pokeapp-sprites WebPs
        included -- and the browser sniffs it, which is why the cards render. So
        the honest question is what the BYTES are:

          'RIFF' at 0, 'WEBP' at 8   it is a WebP
          a 'VP8X' extended header   it has the flag byte that carries alpha
          bit 1 of that byte         animation
          bit 4 of that byte         alpha

        Both flags matter here. Animation is the whole point, and alpha is the
        "without the white background" half of the request -- a WebP with no alpha
        channel would be a converted GIF that lost its transparency.
      */
      const head = Buffer.from(await res.arrayBuffer()).subarray(0, 64)
      const riff = head.subarray(0, 4).toString('latin1') === 'RIFF'
      const webp = head.subarray(8, 12).toString('latin1') === 'WEBP'
      const vp8x = head.subarray(12, 16).toString('latin1') === 'VP8X'
      const flags = vp8x ? head[20] : 0
      bwResults.push({
        url,
        status: res.status,
        webp: riff && webp,
        animated: ((flags >> 1) & 1) === 1,
        alpha: ((flags >> 4) & 1) === 1,
      })
    } catch (err) {
      bwResults.push({ url, status: String(err), webp: false, animated: false, alpha: false })
    }
  }
  const bwBad = bwResults.filter((r) => r.status !== 200)
  log(`  checked ${bwResults.length} Black/White URLs, ${bwBad.length} not 200`)
  bwBad.forEach((b) => log(`    ${b.status} ${b.url}`))
  check(
    'every Black/White animated URL the bitmask claims actually resolves',
    bwResults.length > 0 && bwBad.length === 0,
    `${bwResults.length} checked`,
  )
  const ok = bwResults.filter((r) => r.status === 200)
  check(
    'and every one of them really is a WebP by its own header',
    ok.length > 0 && ok.every((r) => r.webp),
    `${ok.filter((r) => r.webp).length} of ${ok.length}`,
  )
  check(
    'animated, which is the whole reason they exist',
    ok.every((r) => r.animated),
    `${ok.filter((r) => r.animated).length} of ${ok.length}`,
  )
  /* The "without the white background" half of the request: the source GIFs are
     already transparent, and this is what proves the conversion kept it. */
  check(
    'and carrying an alpha channel, so the background is transparent and not white',
    ok.every((r) => r.alpha),
    `${ok.filter((r) => r.alpha).length} of ${ok.length}`,
  )

  /*
    THE ARTWORK CONTROL IS GONE FROM THIS TAB, and that is a reversal of the
    previous pass rather than a regression -- it was folded in here, and this build
    removes it. Artwork.tsx is deleted, not left unreferenced.

    WHAT THE CONTROL'S RULES BECAME. Its four axes encoded real facts about the
    data (94/493 species have a gendered in-game sprite, 0/493 have gendered
    official artwork, 94/493 ship a gendered animated file). Those facts are now
    assertions about WHICH CARDS EXIST, which is a stronger claim than "the toggle
    was disabled" -- the toggle could be disabled for the wrong reason and still
    pass. Section L asserts the control's absence; this asserts the rules survived
    it.
  */
  const genderRules = await page.evaluate(() => {
    const ids = (sel) => document.querySelectorAll(sel).length
    return {
      /* Pidgey (16) has no gender differences: no female tile, no female animated
         card, and the artwork section is the flat two. */
      femaleTiles: ids('[data-testid^="sprite-tile-"][data-testid*="_female"]'),
      femaleAnimated: ids('[data-testid$="-female"]'),
      artworkCards: ids('[data-testid^="sprite-artwork-"]'),
      animatedCards: ids('[data-testid^="sprite-animated-"]'),
    }
  })
  log(`  Pidgey gender rules: ${JSON.stringify(genderRules)}`)
  check(
    'a species with no gender differences has no female card of any kind',
    genderRules.femaleTiles === 0 && genderRules.femaleAnimated === 0,
    JSON.stringify(genderRules),
  )
  check(
    'official artwork is always exactly the two colours, never gendered',
    genderRules.artworkCards === 2,
    `(${genderRules.artworkCards})`,
  )
  check(
    'and the animated set is the two colours for it',
    genderRules.animatedCards === 2,
    `(${genderRules.animatedCards})`,
  )

  /* And a species that DOES have gender differences gets the extra cards, from
     the same bitmask -- so the 94/399 split is a property of the data, not a rule
     applied twice. Unfezant is Gen 5; Hippopotas (449) is the in-scope case. */
  await backToGrid()
  await openSpecies(449)
  await openTab('Sprites')
  await page.waitForSelector('[data-testid="species-sprites"]', { timeout: 30000 })
  const gendered = await page.evaluate(() => ({
    femaleTiles: [...document.querySelectorAll('[data-testid^="sprite-tile-"]')].filter((e) =>
      (e.getAttribute('data-testid') || '').includes('_female'),
    ).length,
    femaleAnimated: document.querySelectorAll('[data-testid$="-female"]').length,
  }))
  log(`  Hippopotas gender rules: ${JSON.stringify(gendered)}`)
  check(
    'a species with gender differences does get female cards',
    gendered.femaleTiles > 0 && gendered.femaleAnimated === 2,
    JSON.stringify(gendered),
  )

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

  // ======================================================================== I
  hr('I — the pinned column against the Figma frame (FIX 1)')

  /*
    THE FRAME IS THE EXPECTATION, not the screenshot.

    container-sprite (57:837) is 737 x 1031 raw units and every child sits at a
    known percentage of it, so each one is checkable as a ratio -- which is what
    makes this a suite entry rather than an eye. Positions are read as fractions of
    the hero's own box so the assertions hold at any rendered size.

      node            x     y     w    h      -> fraction of 737 x 1031
      shadow-number   0     29    701  344       0.000 / 0.028 / 0.951 / 0.334
      poke-artwork    95    213   500  500       0.129 / 0.207 / 0.678 / 0.485
      Region          17    604   78   313       0.023 / 0.586
      Name-kata       85    717   557  146       0.115 / 0.696
      Name-main       85    879   284  78        0.115 / 0.853
      Name-roma       369   882   305  78        0.501 / 0.855
  */
  /*
    Section G ended on the Breedingdex, so there is no species page to go back
    from -- the Pokedex has to be re-entered first. And re-entering it lands in
    whichever of its two states it was left in: the Pokedex is EITHER the grid or a
    detail page, not both, and it kept the species that was open. So wait for
    either, then close the detail if that is what came back.
  */
  await goToDex(page, 'pokedex')
  /*
    THE POINTER HAS TO LEAVE THE NAV. The Pokepedia dropdown opens on hover and
    stays open while the pointer rests on it, and it overlays the top-left of the
    content area -- which is where the back link now sits, absolutely positioned to
    the frame. Playwright leaves the mouse wherever it last clicked, so without this
    the next click on the back link is intercepted by the still-open dropdown. An
    artefact of driving a hover menu, not a defect in the page: elementFromPoint at
    the back link's centre returns the back link once the menu closes.
  */
  await page.mouse.move(10, 600)
  await page.waitForSelector('[data-testid="nav-dropdown-pokepedia"]', {
    state: 'hidden',
    timeout: 15000,
  })
  await page.waitForSelector('[data-testid="species-rows"], [data-testid="species-page"]', {
    timeout: 30000,
  })
  if (await page.$('[data-testid="species-page-back"]')) await backToGrid()
  await selectVersionGroup('heartgold-soulsilver')
  await openSpecies(197) // the species the frame itself draws
  await page.waitForSelector('[data-testid="species-hero"]', { timeout: 30000 })

  const hero = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="species-hero"]').getBoundingClientRect()
    const at = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        w: r.width / box.width,
        h: r.height / box.height,
        right: (r.right - box.left) / box.width,
        bottom: (r.bottom - box.top) / box.height,
      }
    }
    return {
      aspect: box.width / box.height,
      ghost: at('species-hero-ghost'),
      art: at('species-hero-art'),
      region: at('species-hero-region'),
      kana: at('species-page-kana'),
      name: at('species-hero-name'),
      roma: at('species-page-romaji'),
      /* The genus must NOT be in this column -- punch-list item 4. */
      genusInHero:
        document.querySelector(
          '[data-testid="species-hero"] [data-testid="species-banner-genus"]',
        ) != null,
      /* Nothing else either: the brief is sprite, three names, ghost number,
         region label, and that is all. FIX 1 says "nothing else". */
      strayText: [...document.querySelectorAll('[data-testid="species-hero"] *')]
        .filter((e) => e.children.length === 0 && (e.textContent || '').trim().length > 0)
        .map((e) => e.getAttribute('data-testid') || e.className || e.tagName),
    }
  })
  const near = (got, want, tol = 0.02) => Math.abs(got - want) <= tol
  log(`  hero aspect ${hero.aspect.toFixed(3)} (frame 737/1031 = 0.715)`)
  log(`  ghost  ${JSON.stringify(hero.ghost)}`)
  log(`  art    ${JSON.stringify(hero.art)}`)
  log(`  names  main ${JSON.stringify(hero.name)}  roma ${JSON.stringify(hero.roma)}`)
  log(`  stray text nodes: ${hero.strayText.join(', ')}`)

  check(
    'the column has the frame’s aspect ratio',
    near(hero.aspect, 737 / 1031, 0.01),
    hero.aspect.toFixed(3),
  )

  /*
    PUNCH-LIST ITEM 1. Not "the watermark is smaller" -- "the watermark is inside
    the card". The frame puts shadow-number at x=0 y=29 in a 737-wide column, so it
    is left-aligned and fully contained, where the design-system hero card's
    watermark genuinely does bleed off the top-right and the previous build used
    that treatment here.
  */
  check(
    'the ghost number is fully inside the column',
    hero.ghost.x >= -0.005 && hero.ghost.right <= 1.005 && hero.ghost.bottom <= 1,
    `x ${hero.ghost.x.toFixed(3)} right ${hero.ghost.right.toFixed(3)} bottom ${hero.ghost.bottom.toFixed(3)}`,
  )
  /*
    THE HEIGHT IS THE FRAME'S TIMES THE TYPE SCALE. The frame's box is 344 of
    1031 (0.334); --dp-s is 0.78, so the drawn block is 0.260. The POSITION is
    unscaled -- it is a percentage of the column, not a type size -- which is why
    only one of the three terms carries the factor. Reading --dp-s out of the DOM
    rather than hard-coding 0.78 means retuning the scale does not silently
    invalidate this assertion.
  */
  const typeScale = Number(
    await page.$eval('.species-page-inner', (el) =>
      getComputedStyle(el).getPropertyValue('--dp-s').trim(),
    ),
  )
  log(`  type scale --dp-s = ${typeScale}`)
  check('the type scale is a real number below 1', typeScale > 0.4 && typeScale < 1, `${typeScale}`)
  check(
    'and at the frame’s position, and the frame’s size times the type scale',
    near(hero.ghost.x, 0) &&
      near(hero.ghost.y, 29 / 1031) &&
      near(hero.ghost.h, (344 / 1031) * typeScale, 0.04),
    `y ${hero.ghost.y.toFixed(3)} h ${hero.ghost.h.toFixed(3)} vs ${((344 / 1031) * typeScale).toFixed(3)}`,
  )

  /*
    PUNCH-LIST ITEM 2, as a number: the artwork's TOP, not a judgement about "dead
    band". The frame starts it 20.7% down a column it fills 48.5% of.
  */
  check(
    'the artwork sits where the frame puts it, and is 500 of 737 wide',
    near(hero.art.y, 213 / 1031) && near(hero.art.w, 500 / 737) && near(hero.art.h, 500 / 1031),
    `y ${hero.art.y.toFixed(3)} w ${hero.art.w.toFixed(3)} h ${hero.art.h.toFixed(3)}`,
  )

  /*
    PUNCH-LIST ITEM 3, and the ordering the prose spec got wrong: the katakana is
    ABOVE the Latin names, and the two Latin names share ONE ROW rather than
    stacking. Name-roma's box starts at x=369, exactly where Name-main's ends.
  */
  check(
    'katakana above the name row',
    hero.kana.bottom <= hero.name.y + 0.01,
    `kana bottom ${hero.kana.bottom.toFixed(3)} vs name top ${hero.name.y.toFixed(3)}`,
  )
  check(
    'main name and romanisation on one row, roma to the right',
    Math.abs(hero.name.y - hero.roma.y) < 0.03 && hero.roma.x > hero.name.x,
    `main y ${hero.name.y.toFixed(3)} roma y ${hero.roma.y.toFixed(3)}`,
  )
  check(
    'all three name lines at the frame’s left inset and vertical positions',
    near(hero.kana.x, 85 / 737) &&
      near(hero.name.x, 85 / 737) &&
      near(hero.kana.y, 717 / 1031, 0.03) &&
      near(hero.name.y, 879 / 1031, 0.03),
    `kana ${hero.kana.x.toFixed(3)}/${hero.kana.y.toFixed(3)} name ${hero.name.x.toFixed(3)}/${hero.name.y.toFixed(3)}`,
  )
  check(
    'the rotated region label is at the frame’s left edge',
    near(hero.region.x, 17 / 737, 0.03),
    hero.region.x.toFixed(3),
  )
  check('the genus is NOT in the pinned column', hero.genusInHero === false)
  /* Exactly five text-bearing leaves: ghost, region, kana, name, roma. A sixth
     means something crept back in. */
  check(
    'the column carries nothing but the six specified elements',
    hero.strayText.length === 5,
    `${hero.strayText.length}: ${hero.strayText.join(', ')}`,
  )

  /*
    THE WATERMARK MUST FIT FOR ALL 493, not just for #197. Plex Sans draws
    proportional digits by default, so a wide number renders wider than a narrow
    one; tabular-nums is what makes the containment above true in general, and 888
    is the widest three-digit case.
  */
  for (const id of [1, 111, 289, 388, 493]) {
    await backToGrid()
    await openSpecies(id)
    await page.waitForSelector('[data-testid="species-hero-ghost"]', { timeout: 30000 })
    const fit = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="species-hero"]').getBoundingClientRect()
      const g = document.querySelector('[data-testid="species-hero-ghost"]').getBoundingClientRect()
      return { right: (g.right - box.left) / box.width, text: null }
    })
    check(
      `#${id}’s watermark still fits inside the column`,
      fit.right <= 1.005,
      fit.right.toFixed(3),
    )
  }

  // ======================================================================== J
  hr('J — the banner is page chrome, not tab content (FIX 2)')

  /*
    THE ACTUAL REQUIREMENT: the banner must remain fixed and visible across all
    four tabs, never disappearing or re-rendering when switching. "Present on every
    tab" is the weak version of that and would pass for four separate copies, so
    this asserts the STRONGER thing -- the same DOM node survives, at the same
    position, with the same text.

    Identity is checked by stamping the node and looking for the stamp again: React
    would drop a data attribute set outside its control only by replacing the
    element, so the stamp surviving four tab switches IS "it was never re-mounted".
  */
  await backToGrid()
  await openSpecies(197)
  await page.waitForSelector('[data-testid="species-banner"]', { timeout: 30000 })
  await page.evaluate(() => {
    document.querySelector('[data-testid="species-banner"]').setAttribute('data-probe', 'stamped')
    document
      .querySelector('[data-testid="species-page-subnav"]')
      .setAttribute('data-probe', 'stamped')
  })

  const bannerState = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-testid="species-banner"]')
      const nav = document.querySelector('[data-testid="species-page-subnav"]')
      const panel = document.querySelector('[data-testid^="species-page-panel-"]')
      const br = b.getBoundingClientRect()
      const nr = nav.getBoundingClientRect()
      const pr = panel.getBoundingClientRect()
      return {
        stamped: b.getAttribute('data-probe') === 'stamped',
        navStamped: nav.getAttribute('data-probe') === 'stamped',
        text: b.textContent.replace(/\s+/g, ' ').trim(),
        top: Math.round(br.top),
        left: Math.round(br.left),
        types: [...b.querySelectorAll('[data-type]')].map((e) => e.getAttribute('data-type')),
        /* Order, which is the whole of punch-list item 5: banner, then sub-nav,
           then the panel. */
        navBelowBanner: nr.top >= br.bottom - 2,
        panelBelowNav: pr.top >= nr.bottom - 2,
        navRightAligned: Math.abs(nr.right - br.right) < 40,
      }
    })

  const before = await bannerState()
  log(`  ${JSON.stringify(before)}`)
  /* textContent concatenates without separators, so the expectation is the run
     rather than a spaced sentence -- and anchoring it is what makes this an order
     check as well as a presence check: number, name, genus, type. */
  check(
    'the banner carries number, name, genus and types, in that order',
    /^#0197UmbreonMoonlight Pok.mondark$/.test(before.text),
    before.text,
  )
  check('the type row is in the banner', before.types.join('/') === 'dark', before.types.join('/'))
  check('the sub-nav sits BELOW the banner', before.navBelowBanner)
  check('and is right-aligned in the column', before.navRightAligned)
  check('the panel sits below the sub-nav', before.panelBelowNav)

  for (const tab of ['Learnset', 'Description', 'Sprites', 'Info']) {
    await openTab(tab)
    const after = await bannerState()
    const same =
      after.stamped &&
      after.navStamped &&
      after.text === before.text &&
      after.top === before.top &&
      after.left === before.left
    check(
      `the same banner node survives the switch to ${tab}, unmoved`,
      same,
      same ? '' : JSON.stringify(after),
    )
  }

  // ======================================================================== K
  hr('K — the rebuilt evolution chart (FIX 3)')

  /*
    THE REFERENCE'S VISUAL LANGUAGE, as the things that can be asserted: no
    bordered cards, no dex numbers or names drawn, chevron wedges rather than a
    glyph-plus-caption, and real item sprites for the mechanic. What CANNOT be
    asserted -- whether it LOOKS like the frames -- is what the screenshots are for.
  */
  const evoShape = async (id, label) => {
    await backToGrid()
    await openSpecies(id)
    await page.waitForSelector('[data-testid="evolution-tree"]', { timeout: 30000 })
    const shape = await page.evaluate(() => {
      const tree = document.querySelector('[data-testid="evolution-tree"]')
      const nodes = [...tree.querySelectorAll('[data-testid^="evo-node-"]')]
      const styles = nodes.map((n) => getComputedStyle(n))
      return {
        nodes: nodes.length,
        arrows: tree.querySelectorAll('[data-testid^="evo-arrow-"]').length,
        wedges: tree.querySelectorAll('.evo-arrow-wedge').length,
        chevrons: tree.querySelectorAll('.evo-arrow-chevron').length,
        icons: [...tree.querySelectorAll('[data-evo-icon]')].map((e) =>
          e.getAttribute('data-evo-icon'),
        ),
        /* No card: no border, no background fill, no radius on any stage. */
        borders: styles.map((c) => c.borderTopWidth).filter((w) => w !== '0px').length,
        fills: styles
          .map((c) => c.backgroundColor)
          .filter((b) => b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent').length,
        /* No dex number and no name drawn: the reference draws neither. Both are
           still in the accessibility tree via .visually-hidden, which is why this
           filters those out rather than checking for absence of the text. */
        visibleLabels: [...tree.querySelectorAll('[data-testid^="evo-node-"] span')].filter(
          (e) => !e.classList.contains('visually-hidden') && (e.textContent || '').trim(),
        ).length,
        /* The old glyph register must be gone entirely. */
        tablerGlyphs: tree.querySelectorAll('svg.trigger-icon').length,
      }
    })
    log(`  ${label}: ${JSON.stringify(shape)}`)
    return shape
  }

  const bulba = await evoShape(1, 'Bulbasaur (3-stage linear)')
  check('three stages, two arrows', bulba.nodes === 3 && bulba.arrows === 2)
  check('one wedge and three chevrons per arrow', bulba.wedges === 2 && bulba.chevrons === 6)
  check('no bordered cards around the artwork', bulba.borders === 0 && bulba.fills === 0)
  check('no dex number or name drawn beside a stage', bulba.visibleLabels === 0)
  check('no Tabler trigger glyphs anywhere in the chart', bulba.tablerGlyphs === 0)
  /* The reference draws image-rare-candy on every level-up step, so the level-up
     register is the Rare Candy item sprite and not a glyph. */
  check(
    'level-up steps carry the Rare Candy sprite',
    bulba.icons.filter((i) => i === 'item-rare-candy').length === 2,
    bulba.icons.join(','),
  )

  const starmie = await evoShape(121, 'Starmie (stone)')
  check(
    'a stone evolution carries the real item sprite, not a glyph',
    starmie.icons.includes('item-water-stone'),
    starmie.icons.join(','),
  )

  const eevee = await evoShape(133, 'Eevee (radial)')
  check('Eevee draws all its branches', eevee.nodes === 8 && eevee.arrows === 7)
  /* Radial, per layout-evo-eevee: seven children on a circle, so no two share a
     row and no two share a column. A vertical fan would put all seven at the same
     x. */
  const radial = await page.evaluate(() => {
    const tree = document.querySelector('[data-testid="evolution-tree"]')
    const root = tree.querySelector('[data-testid="evo-node-133"]').getBoundingClientRect()
    const kids = [...tree.querySelectorAll('[data-testid^="evo-node-"]')]
      .filter((n) => n.getAttribute('data-testid') !== 'evo-node-133')
      .map((n) => {
        const r = n.getBoundingClientRect()
        return {
          dx: r.left + r.width / 2 - (root.left + root.width / 2),
          dy: r.top + r.height / 2 - (root.top + root.height / 2),
        }
      })
    const radii = kids.map((k) => Math.hypot(k.dx, k.dy))
    const artwork = root.width
    return {
      distinctX: new Set(kids.map((k) => Math.round(k.dx / 10))).size,
      spread: Math.max(...radii) / Math.min(...radii),
      radiusInArtworks: radii.reduce((a, b) => a + b, 0) / radii.length / artwork,
      above: kids.filter((k) => k.dy < 0).length,
      below: kids.filter((k) => k.dy > 0).length,
    }
  })
  log(`  radial: ${JSON.stringify(radial)}`)
  check('the seven branches are on a circle, not in a column', radial.distinctX >= 5)
  check('all at one radius', radial.spread < 1.15, radial.spread.toFixed(3))
  /* layout-evo-eevee measures 2.31 artworks; the formula uses 2.30. */
  check(
    'at the frame’s radius of ~2.3 artworks',
    Math.abs(radial.radiusInArtworks - 2.3) < 0.25,
    radial.radiusInArtworks.toFixed(2),
  )
  check('spread on both sides of the parent', radial.above >= 2 && radial.below >= 2)

  const wurmple = await evoShape(265, 'Wurmple (random fork)')
  check(
    'the random fork still draws the dice, now inline on the arrow',
    wurmple.icons.filter((i) => i === 'random-split').length === 2,
    wurmple.icons.join(','),
  )
  const inlineDice = await page.$$eval('[data-testid^="evo-fork-random-"]', (els) => els.length)
  check('and keeps its own hook for the fork', inlineDice === 2, `(${inlineDice})`)

  await page.screenshot({ path: `${SHOTS}/species-page-evo-wurmple.png` })

  // ======================================================================== L
  hr('L — tab polish (FIX 5)')

  await backToGrid()
  await openSpecies(1)
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  const infoOrder = await page.evaluate(() => {
    const info = document.querySelector('[data-testid="species-info"]')
    const kids = [...info.children]
    const idx = (sel) => kids.findIndex((k) => k.matches(sel) || k.querySelector(sel))
    return {
      last: kids[kids.length - 1]?.getAttribute('data-testid'),
      pokeathlon: idx('[data-testid="pokeathlon-pending"]'),
      matchups: idx('[data-testid="species-type-matchups"]'),
      stats: idx('[data-testid="species-base-stats"]'),
      total: kids.length,
    }
  })
  log(`  Info tab order: ${JSON.stringify(infoOrder)}`)
  /* Gen 4 is selected, so the note is present -- and it must be the LAST block on
     the tab, after the type chart, rather than sitting between the metadata columns
     and the stat block where it interrupted the facts. */
  check(
    'the Pokeathlon note is the last block on the Info tab',
    infoOrder.pokeathlon === infoOrder.total - 1 && infoOrder.pokeathlon > infoOrder.matchups,
    `pokeathlon ${infoOrder.pokeathlon}, matchups ${infoOrder.matchups}, of ${infoOrder.total}`,
  )

  await openTab('Learnset')
  await page.waitForSelector('[data-testid="species-learn-level-up"]', { timeout: 60000 })
  const rhythm = await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="species-learnset"]')
    const scope = wrap.querySelector('.species-scope').getBoundingClientRect()
    const groups = [...wrap.querySelectorAll('.species-learn-group')].map((g) =>
      g.getBoundingClientRect(),
    )
    return {
      scopeToFirst: Math.round(groups[0].top - scope.bottom),
      betweenGroups: groups.slice(1).map((g, i) => Math.round(g.top - groups[i].bottom)),
      groups: groups.length,
    }
  })
  log(`  learnset rhythm: ${JSON.stringify(rhythm)}`)
  /*
    A BAND, NOT A CEILING, and the band moved up.

    The first pass took this from --space-gap-lg (~34px on the scaled page) down to
    --space-gap-sm plus a 0.35rem step, which overshot: consecutive tables ran
    together with no break between the end of one and the heading of the next. It
    is --space-gap-md now with most of the separation in the group-to-group margin,
    because a heading is what starts a section.

    So the assertion is that the gap is in the readable middle -- neither the
    original "the page ended" gap nor the collapsed one. Both bounds are load-
    bearing and each has failed once.
  */
  check(
    'the game selector has room above the first table, but not a chapter break',
    rhythm.scopeToFirst >= 8 && rhythm.scopeToFirst <= 30,
    `${rhythm.scopeToFirst}px`,
  )
  check(
    'and consecutive tables are separated without being pushed apart',
    rhythm.betweenGroups.every((g) => g >= 16 && g <= 44),
    rhythm.betweenGroups.join(', '),
  )

  await openTab('Sprites')
  await page.waitForSelector('[data-testid="species-sprites"]', { timeout: 30000 })
  const spritesTab = await page.evaluate(() => ({
    /* The four-axis control and its filter switch must both be gone. */
    toggles: document.querySelectorAll('[data-testid^="toggle-"]').length,
    artworkPanel: document.querySelector('[data-testid="artwork-img"]') != null,
    featured: document.querySelector('[data-testid="sprites-featured"]') != null,
    filterCount: document.querySelector('[data-testid="sprites-filter-count"]') != null,
    cards: document.querySelectorAll('.sprite-card').length,
    declared: Number(document.querySelector('[data-testid="species-sprites"]')?.dataset.cards),
    /* Still labelled -- that was the brief for the tab and it did not change. */
    labelled: [...document.querySelectorAll('.sprite-card')].every(
      (c) =>
        (c.querySelector('.sprite-card-primary')?.textContent || '').trim() &&
        (c.querySelector('.sprite-card-secondary')?.textContent || '').trim(),
    ),
  }))
  log(`  sprites: ${JSON.stringify(spritesTab)}`)
  check(
    'no artwork control on the Sprites tab',
    spritesTab.toggles === 0 && !spritesTab.artworkPanel,
  )
  check('and no filter switch or filter count', !spritesTab.featured && !spritesTab.filterCount)
  check(
    'every variant is in the one sequence',
    spritesTab.cards === spritesTab.declared && spritesTab.cards > 20,
    `${spritesTab.cards} of ${spritesTab.declared}`,
  )
  check('every card still names its game and its slot', spritesTab.labelled)

  // ======================================================================== M
  hr('M — the type scale, the case, the two hues and the arrow’s geometry')

  /*
    THE SIX SMALL FIXES, each as the thing that can actually be read back.

    Everything here was a visual complaint, and a visual complaint turns into an
    assertion only if you name what would have to be true. "Text is cut off at the
    edges" is a bounding box; "no full capitals" is a computed text-transform;
    "the columns must be the same height" is a list of row tops; "the chevrons'
    edges follow the trapezoid's legs" is two gradients that have to match. Those
    are the checks. Whether the result LOOKS right is what the screenshots are for.
  */

  await backToGrid()
  await openSpecies(1)
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })

  // ---------------------------------------------------------------- no caps
  /*
    THE COMPUTED PROPERTY, NOT THE RENDERED STRING. Testing the string would fail
    on every legitimate initialism the page has to show -- HP, PP, TM/HM, XP, EV,
    "Sp. Atk" -- and would pass a rule that only happened to have no all-caps
    content on this one species. text-transform: uppercase is the thing that was
    wrong and the thing that is gone.
  */
  const caps = await page.evaluate(() =>
    [...document.querySelectorAll('.species-page *')]
      .filter((el) => getComputedStyle(el).textTransform === 'uppercase')
      .map((el) => `${el.tagName.toLowerCase()}.${el.className?.toString().split(' ')[0]}`),
  )
  log(
    `  elements still text-transform:uppercase — ${caps.length}${caps.length ? ': ' + [...new Set(caps)].join(', ') : ''}`,
  )
  check(
    'nothing on the page is upper-cased any more',
    caps.length === 0,
    caps.slice(0, 6).join(', '),
  )

  /* And the labels that were uppercase are title-cased rather than merely
     un-transformed, which is what "just the initial of each one" asked for. */
  const cased = await page.evaluate(() => {
    const at = (sel) => {
      const el = document.querySelector(sel)
      return el
        ? { transform: getComputedStyle(el).textTransform, text: el.textContent.trim() }
        : null
    }
    return {
      statLabel: at('.ds-stat-label'),
      heading: at('.species-info-heading'),
      type: at('.species-banner-types .ds-type'),
      tableHeader: at('.data-table-sort'),
    }
  })
  log(`  case: ${JSON.stringify(cased)}`)
  check(
    'the shared stat label, the section heading and the type label all capitalize',
    ['statLabel', 'heading', 'type'].every((k) => cased[k]?.transform === 'capitalize'),
    Object.entries(cased)
      .map(([k, v]) => `${k}=${v?.transform}`)
      .join(' '),
  )

  // ------------------------------------------------------ the two metadata columns
  /*
    "EACH INFO SECTION MUST HAVE THE SAME HEIGHT ON BOTH COLUMNS", as the row tops.
    Both lists have seven rows and are read as pairs, so the claim is that the nth
    row starts at the same y in both -- which is what subgrid buys and what two
    independent lists could not, because the Gender ratio row is two lines tall and
    pushed everything under it down on one side only.
  */
  const rowAlign = await page.evaluate(() => {
    const lists = [...document.querySelectorAll('.species-info-cols > .ds-stat-list')]
    const tops = lists.map((l) =>
      [...l.querySelectorAll('.ds-stat-row')].map((r) => Math.round(r.getBoundingClientRect().top)),
    )
    return {
      columns: lists.length,
      rows: tops.map((t) => t.length),
      left: tops[0] ?? [],
      right: tops[1] ?? [],
      subgrid: lists.map((l) => getComputedStyle(l).gridTemplateRows.slice(0, 20)),
    }
  })
  log(`  row tops left  ${rowAlign.left.join(',')}`)
  log(`  row tops right ${rowAlign.right.join(',')}`)
  check(
    'the two metadata columns hold the same number of rows',
    rowAlign.columns === 2 && rowAlign.rows[0] === rowAlign.rows[1] && rowAlign.rows[0] === 7,
    JSON.stringify(rowAlign.rows),
  )
  check(
    'and the nth row starts at the same height in both',
    rowAlign.left.every((t, i) => Math.abs(t - rowAlign.right[i]) <= 1),
    rowAlign.left.map((t, i) => t - rowAlign.right[i]).join(','),
  )

  // ---------------------------------------------------------- the gender bar
  /*
    --accent FOR FEMALE, THE PAGE'S INK FOR MALE, and a full grey bar for a
    genderless species. The resolved rgb() strings are compared against the tokens
    read from the document rather than hard-coded, so a palette change moves both
    sides of the assertion together.
  */
  const genderColors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const probe = document.createElement('span')
    document.body.appendChild(probe)
    const resolve = (v) => {
      probe.style.color = v
      return getComputedStyle(probe).color
    }
    const male = document.querySelector('.species-gender-male')
    const female = document.querySelector('.species-gender-female')
    const out = {
      accent: resolve(root.getPropertyValue('--accent').trim()),
      ink: resolve(root.getPropertyValue('--text-primary').trim()),
      maleBg: male ? getComputedStyle(male).backgroundColor : null,
      femaleBg: female ? getComputedStyle(female).backgroundColor : null,
      maleWidth: male ? male.style.width : null,
      femaleWidth: female ? female.style.width : null,
    }
    probe.remove()
    return out
  })
  log(`  gender: ${JSON.stringify(genderColors)}`)
  check(
    'the female share is --accent',
    genderColors.femaleBg === genderColors.accent,
    `${genderColors.femaleBg} vs ${genderColors.accent}`,
  )
  check(
    'the male share is the page’s ink, i.e. white on the dark theme',
    genderColors.maleBg === genderColors.ink,
    `${genderColors.maleBg} vs ${genderColors.ink}`,
  )
  check(
    'and the two widths are the real split',
    genderColors.maleWidth === '87.5%' && genderColors.femaleWidth === '12.5%',
    `${genderColors.maleWidth} / ${genderColors.femaleWidth}`,
  )

  await backToGrid()
  await openSpecies(81) // Magnemite — genderless
  await page.waitForSelector('[data-testid="species-info"]', { timeout: 30000 })
  const genderless = await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="gender-ratio"]')
    const bar = document.querySelector('.species-gender-none')
    const track = document.querySelector('.species-gender-track')
    return {
      flagged: wrap?.getAttribute('data-genderless'),
      hasBar: bar != null,
      fullWidth:
        bar && track ? bar.getBoundingClientRect().width / track.getBoundingClientRect().width : 0,
      color: bar ? getComputedStyle(bar).backgroundColor : null,
      opacity: bar ? getComputedStyle(bar).opacity : null,
      legend: document.querySelector('.species-gender-legend')?.textContent?.trim() ?? null,
    }
  })
  log(`  genderless: ${JSON.stringify(genderless)}`)
  check('a genderless species gets a full bar, not an absent one', genderless.hasBar)
  check(
    'and it spans the whole track',
    genderless.fullWidth > 0.99,
    genderless.fullWidth.toFixed(3),
  )
  check(
    'in the grey the female segment used to be',
    genderless.opacity === '0.45',
    genderless.opacity ?? '',
  )
  check('still saying so in words', genderless.legend === 'Genderless', genderless.legend ?? '')

  // ------------------------------------------------- the hero names never clip
  /*
    THE ACTUAL COMPLAINT was "Fushigidane" rendering as "Fushigidan": the name row
    was nowrap inside a column with overflow:hidden. The fix is the row being able
    to wrap, so this is checked on the five longest name pairs in the dex rather
    than on the one species that showed it -- a smaller type scale alone would only
    move which pair clips.
  */
  /* The five widest name pairs in the dex by character count: Bellsprout /
     Madatsubomi at 21, then four at 20. Computed from species.json rather than
     picked, so this is the worst case and not a sample. */
  const longNames = [69, 1, 12, 73, 449]
  for (const id of longNames) {
    await backToGrid()
    await openSpecies(id)
    await page.waitForSelector('.species-hero-names', { timeout: 30000 })
    const fit = await page.evaluate(() => {
      const names = document.querySelector('.species-hero-names')
      const hero = document.querySelector('.species-hero')
      const n = names.getBoundingClientRect()
      const h = hero.getBoundingClientRect()
      return {
        text: names.textContent.trim(),
        overRight: Math.round(n.right - h.right),
        overBottom: Math.round(n.bottom - h.bottom),
        clipped: [...names.children].some((c) => c.scrollWidth - c.clientWidth > 1),
      }
    })
    log(`  #${id} ${fit.text}: right ${fit.overRight}px bottom ${fit.overBottom}px`)
    check(
      `#${id}'s name row is inside the column`,
      fit.overRight <= 0 && fit.overBottom <= 0 && !fit.clipped,
      `right ${fit.overRight} bottom ${fit.overBottom} clipped ${fit.clipped}`,
    )
  }

  // ----------------------------------------------------- the arrow’s geometry
  /*
    "AN ISOSCELES TRAPEZOID ROTATED 90 DEGREES, AND RECTANGULAR CHEVRONS WHOSE
    EDGES FOLLOW THE TRAPEZOID LEG LINES" -- which is three separate, checkable
    facts, and the reason this is worth asserting rather than eyeballing is that
    the old chevrons were stroked polylines with round caps and passed every
    count-based check in section K.

      isosceles     the two legs have equal length and mirror each other about the
                    centreline, and the parallel sides are the vertical ones.
      rectangular   a filled polygon with no stroke, so the corners are mitred.
      edges follow  the gradient of the cut across a chevron's arm end equals the
                    gradient of the leg it meets.
  */
  await backToGrid()
  await openSpecies(1)
  await page.waitForSelector('[data-testid="evo-arrow-2"]', { timeout: 30000 })
  const arrow = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="evo-arrow-2"]')
    const pts = (el) =>
      (el.getAttribute('points') || '')
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
    const wedge = svg.querySelector('.evo-arrow-wedge')
    const chevs = [...svg.querySelectorAll('.evo-arrow-chevron')]
    const cs = chevs[0] ? getComputedStyle(chevs[0]) : null
    return {
      viewBox: svg.getAttribute('viewBox'),
      wedge: pts(wedge),
      chevrons: chevs.map(pts),
      tags: chevs.map((c) => c.tagName.toLowerCase()),
      fill: cs?.fill,
      stroke: cs?.stroke,
    }
  })
  const [w0, w1, w2, w3] = arrow.wedge
  const legTop = (w1[1] - w0[1]) / (w1[0] - w0[0])
  const legBottom = (w2[1] - w3[1]) / (w2[0] - w3[0])
  const centre = Number(arrow.viewBox.split(' ')[3]) / 2
  log(`  wedge ${JSON.stringify(arrow.wedge)}  legs ${legTop.toFixed(4)} / ${legBottom.toFixed(4)}`)
  check(
    'the wedge’s parallel sides are the two vertical ones',
    w0[0] === w3[0] && w1[0] === w2[0],
    `${w0[0]}/${w3[0]} and ${w1[0]}/${w2[0]}`,
  )
  check(
    'and its legs are equal and mirrored about the centreline — isosceles',
    Math.abs(legTop + legBottom) < 0.0005 &&
      Math.abs((w0[1] + w3[1]) / 2 - centre) < 0.01 &&
      Math.abs((w1[1] + w2[1]) / 2 - centre) < 0.01,
    `legs ${legTop.toFixed(4)}/${legBottom.toFixed(4)}, centre ${centre}`,
  )
  check(
    'the chevrons are filled polygons, not stroked polylines',
    arrow.tags.length === 3 &&
      arrow.tags.every((t) => t === 'polygon') &&
      arrow.stroke === 'none' &&
      arrow.fill !== 'none',
    `${arrow.tags.join(',')} fill=${arrow.fill} stroke=${arrow.stroke}`,
  )
  /* Six points each: outer arm end, tip, outer arm end, inner arm end, inner tip,
     inner arm end -- so points 0 and 5 are the cut across the upper arm. */
  const cuts = arrow.chevrons.map((c) => (c[5][1] - c[0][1]) / (c[5][0] - c[0][0]))
  log(
    `  chevron upper-arm cuts: ${cuts.map((g) => g.toFixed(4)).join(', ')}  leg ${legTop.toFixed(4)}`,
  )
  check(
    'each has six points, i.e. two arms of real thickness',
    arrow.chevrons.every((c) => c.length === 6),
    arrow.chevrons.map((c) => c.length).join(','),
  )
  check(
    'and every arm end is cut along the trapezoid’s own leg line',
    cuts.every((g) => Math.abs(g - legTop) < 0.002),
    cuts.map((g) => (g - legTop).toFixed(5)).join(', '),
  )
  /* They grow toward the head, because the band does: a chevron is as tall as the
     wedge is wherever it sits, which is what "follows the legs" looks like. */
  const heights = arrow.chevrons.map((c) => Math.abs(c[2][1] - c[0][1]))
  check(
    'so the three of them widen toward the child',
    heights[0] < heights[1] && heights[1] < heights[2],
    heights.map((h) => h.toFixed(1)).join(' < '),
  )

  // -------------------------------------------------- no dimmed evolution stages
  /*
    The chart used to draw every stage except the current one at opacity 0.7,
    which on Eevee's radial dimmed seven of eight. All stages are full strength
    now; the banner is what says which species the page is about.
  */
  const evoOpacity = await page.evaluate(() =>
    [...document.querySelectorAll('.evo-art')].map((e) => ({
      current: e.closest('[data-current]')?.getAttribute('data-current'),
      opacity: getComputedStyle(e).opacity,
    })),
  )
  log(`  evo stage opacities: ${evoOpacity.map((e) => `${e.current}:${e.opacity}`).join(' ')}`)
  check(
    'every stage is drawn at full opacity, current or not',
    evoOpacity.length > 1 && evoOpacity.every((e) => e.opacity === '1'),
    evoOpacity.map((e) => e.opacity).join(','),
  )

  await page.screenshot({ path: `${SHOTS}/species-page-fixes.png` })

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
