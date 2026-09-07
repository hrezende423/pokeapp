/**
 * Exploratory audit of Team Building. NOT a pass/fail suite.
 *
 * IT PRINTS WHAT HAPPENED AND JUDGES NOTHING. Every scenario here drives a
 * situation `verify-team-builder` does not cover -- a build in two slots of one
 * team, a slot pointing at a build that is gone, a species not in the bundle,
 * six kinds of corrupt document, a Gen 3 build on a Gen 1 team, a level typed
 * past 100, a nickname pasted past its cap -- and reports the state it left
 * behind, so whether each is a problem is decided by reading the output.
 *
 * WHY IT IS KEPT RATHER THAN THROWN AWAY. Four real defects came out of one
 * run of it, three of which are now fixed and asserted in the suite (the
 * duplicate member, the dangling slot id, the add-to-team modal's numbering)
 * and one of which is logged as a product decision (the generation mismatch).
 * The scenarios that found them are worth re-running after any change to the
 * store or to a picker; the suite covers the outcomes, this covers the ground.
 *
 * A console/page error line at the end that is not empty is a finding in
 * itself -- the duplicate member was first noticed as a React duplicate-key
 * warning, not by any assertion.
 *
 * Usage: node scripts/audit-team-builder.mjs
 */
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'

const dev = await startDevServer({ port: 4185 })
const browser = await chromium.launch()
const out = (label, v) => console.log(`  ${label}: ${JSON.stringify(v)}`)
const hr = (t) => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: 'block',
  })
  context.setDefaultNavigationTimeout(120000)
  context.setDefaultTimeout(15000)
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })

  const KEY = 'pokeapp:team-builder:v1'
  /* Tolerant on purpose: several scenarios below deliberately put a document
     in localStorage that is not JSON, and the reader must not be the thing
     that falls over. */
  const store = () =>
    page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? 'null')
      } catch {
        return { unparseable: true }
      }
    }, KEY)
  const seed = async (doc) => {
    await page.evaluate(
      ([k, v]) =>
        v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)),
      [KEY, doc],
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  }
  const nav = async (id) => {
    await page.hover('[data-testid="nav-tab-team-building"]')
    await page.waitForSelector('[data-testid="nav-dropdown-team-building"]', { state: 'visible' })
    await page.click(`[data-testid="nav-${id}"]`)
    await page.mouse.move(800, 940)
    await page.waitForTimeout(250)
  }
  const b = (id, over = {}) => ({
    id,
    generation: 3,
    speciesId: 1,
    pokemonId: 1,
    nickname: '',
    gender: 'male',
    shiny: false,
    level: 50,
    friendship: 70,
    itemId: null,
    abilityId: 65,
    natureId: null,
    moveIds: [null, null, null, null],
    effort: {},
    individual: {},
    tags: [],
    notes: '',
    ...over,
  })
  const t = (id, seq, ids, over = {}) => ({
    id,
    seq,
    generation: 3,
    memberIds: [...ids, ...Array(6 - ids.length).fill(null)],
    notes: '',
    ...over,
  })
  const openLib = async (id) => {
    await nav('build-library')
    await page.waitForSelector('[data-testid="tb-build-grid"]')
    await page.click(`[data-testid="tb-build-${id}-open"]`)
    await page.waitForSelector('[data-testid="tb-build-form"]')
    await page.waitForTimeout(350)
  }
  const openTeam = async (id) => {
    await nav('my-teams')
    await page.waitForSelector('[data-testid="tb-my-teams"]')
    await page.click(`[data-testid="tb-team-${id}-open"]`)
    await page.waitForSelector('[data-testid="tb-team-viewer"]')
    await page.waitForTimeout(300)
  }

  // ==================================================================
  hr('1. THE SAME BUILD IN TWO SLOTS OF ONE TEAM')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [b('b1'), b('b2', { speciesId: 4, pokemonId: 4 })],
    teams: [t('t1', 1, ['b1'])],
  })
  await openTeam('t1')
  await page.click('[data-testid="tb-slot-1-add"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForTimeout(600)
  out('what the picker offers when b1 is already in slot 0', {
    offered: await page.$$eval('[data-tb="member-card"]', (e) => e.map((x) => x.dataset.buildId)),
    note: (await page.$$('[data-testid="tb-pick-note"]')).length
      ? (await page.textContent('[data-testid="tb-pick-note"]')).replace(/\s+/g, ' ').trim()
      : null,
    emptyState: (await page.$$('[data-testid="tb-build-library-empty"]')).length
      ? (await page.textContent('[data-testid="tb-build-library-empty"]')).trim()
      : null,
  })
  /* And via the form's own "add to other team" route. */
  await openLib('b1')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-add-to-team"]')
  await page.waitForTimeout(600)
  out(
    'and what the add-to-team modal says about a team that already has it',
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="tb-add-to-team-teams"] button')]
      return rows.map((r) => ({
        text: r.textContent.trim().replace(/\s+/g, ' ').slice(0, 44),
        disabled: r.disabled,
        alreadyOn: r.dataset.alreadyOn ?? null,
      }))
    }),
  )

  // ==================================================================
  hr('2. DELETING A TEAM THAT SHARES BUILDS')
  await seed({
    nextBuildSeq: 4,
    nextTeamSeq: 3,
    builds: [
      b('b1'),
      b('b2', { speciesId: 4, pokemonId: 4 }),
      b('b3', { speciesId: 7, pokemonId: 7 }),
    ],
    teams: [t('t1', 1, ['b1', 'b2']), t('t2', 2, ['b2', 'b3'])],
  })
  await nav('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.hover('[data-testid="tb-team-t1"]')
  await page.click('[data-testid="tb-team-t1-kebab"]')
  await page.waitForSelector('[data-testid="tb-team-t1-delete"]')
  await page.click('[data-testid="tb-team-t1-delete"]')
  await page.waitForSelector('[data-testid="tb-delete-team-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(500)
  const afterTeamDelete = await store()
  out(
    'builds left (b1 was only t1, b2 is shared, b3 only t2)',
    afterTeamDelete.builds.map((x) => x.id),
  )
  out('t2 slots intact', afterTeamDelete.teams[0].memberIds)

  // ==================================================================
  hr('3. NUMBERING AFTER A MIDDLE DELETION')
  await seed({
    nextBuildSeq: 4,
    nextTeamSeq: 4,
    builds: [
      b('b1'),
      b('b2', { speciesId: 4, pokemonId: 4 }),
      b('b3', { speciesId: 7, pokemonId: 7 }),
    ],
    teams: [t('t1', 1, ['b1']), t('t2', 2, ['b2']), t('t3', 3, ['b3'])],
  })
  await nav('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  out(
    'team ids before',
    await page.$$eval('.tb-team-id', (e) => e.map((x) => x.textContent.trim())),
  )
  await page.hover('[data-testid="tb-team-t2"]')
  await page.click('[data-testid="tb-team-t2-kebab"]')
  await page.waitForSelector('[data-testid="tb-team-t2-delete"]')
  await page.click('[data-testid="tb-team-t2-delete"]')
  await page.waitForSelector('[data-testid="tb-delete-team-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(500)
  out(
    'team ids after deleting the middle one',
    await page.$$eval('.tb-team-id', (e) => e.map((x) => x.textContent.trim())),
  )
  out(
    'keys in storage (unchanged)',
    (await store()).teams.map((x) => x.id),
  )
  /* And the number the rail shows for a team must agree with the library. */
  await openTeam('t3')
  out(
    'the surviving team says',
    (await page.textContent('[data-testid="tb-viewer-team-id"]')).trim(),
  )

  // ==================================================================
  hr('4. A TEAM POINTING AT A BUILD THAT IS NOT THERE')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [b('b1')],
    teams: [t('t1', 1, ['b1', 'ghost'])],
  })
  await nav('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  out('the library renders', {
    rows: (await page.$$('[data-testid="tb-team-rows"] > *')).length,
    cards: (await page.$$('[data-tb="member-card"]')).length,
  })
  await openTeam('t1')
  out('the viewer renders', {
    count: (await page.textContent('[data-testid="tb-slot-count"]')).trim(),
    cards: (await page.$$('[data-tb="member-card"]')).length,
    empties: (await page.$$('[data-tb="empty-slot"]')).length,
  })
  await openLib('b1')
  out('the rail renders', {
    cards: (await page.$$('.tb-card-rail')).length,
    add: (await page.$$('[data-testid="tb-rail-add"]')).length,
  })

  // ==================================================================
  hr('5. A BUILD WHOSE SPECIES IS NOT IN THE BUNDLE')
  await seed({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [b('b1', { speciesId: 9999, pokemonId: 9999 })],
    teams: [t('t1', 1, ['b1'])],
  })
  await nav('build-library')
  await page.waitForTimeout(600)
  out('library survives', {
    grid: (await page.$$('[data-testid="tb-build-grid"]')).length,
    missingCard: (await page.$$('.tb-card-missing')).length,
  })
  await openTeam('t1')
  out('viewer survives', { cards: (await page.$$('[data-tb="member-card"]')).length })

  // ==================================================================
  hr('6. CORRUPT AND HOSTILE DOCUMENTS')
  for (const [label, raw] of [
    ['not json', '{{{'],
    ['an array', '[]'],
    ['a string', '"hello"'],
    ['teams not an array', '{"teams":5,"builds":[]}'],
    [
      'a slot array of 40',
      JSON.stringify({
        teams: [{ id: 't1', seq: 1, generation: 3, memberIds: Array(40).fill(null), notes: '' }],
        builds: [],
      }),
    ],
    [
      'moveIds of 9',
      JSON.stringify({ teams: [], builds: [{ ...b('b1'), moveIds: Array(9).fill(1) }] }),
    ],
  ]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
    await nav('my-teams')
    await page.waitForTimeout(300)
    const d = await store()
    out(label, {
      screenRendered: (await page.$$('[data-testid="tb-my-teams"]')).length === 1,
      slots: d?.teams?.[0]?.memberIds?.length ?? null,
      moves: d?.builds?.[0]?.moveIds?.length ?? null,
    })
  }

  // ==================================================================
  hr('7. GENERATION MISMATCH: a Gen 3 build on a Gen 1 team')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      b('b1', { generation: 1, abilityId: null }),
      b('b2', { generation: 3, natureId: 3, itemId: 217 }),
    ],
    teams: [t('t1', 1, ['b1'], { generation: 1 })],
  })
  await openTeam('t1')
  await page.click('[data-testid="tb-slot-1-add"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  const offered = await page.$$eval('[data-tb="member-card"]', (e) =>
    e.map((x) => x.dataset.buildId),
  )
  out('which builds the picker offers for a GEN 1 team', offered)
  if (offered.includes('b2')) {
    await page.click('[data-testid="tb-build-b2"] .tb-card-open')
    await page.waitForTimeout(600)
    out('a Gen 3 build placed on a Gen 1 team', {
      slots: (await store()).teams[0].memberIds,
      cards: await page.$$eval('[data-tb="member-card"]', (e) =>
        e.map((x) => x.dataset.generation),
      ),
    })
  }

  // ==================================================================
  hr('8. THE FORM FOLLOWS THE APP GENERATION, OR DOES IT')
  await seed({ nextBuildSeq: 2, nextTeamSeq: 1, builds: [b('b1')], teams: [] })
  await openLib('b1')
  const genBefore = await page.evaluate(() => ({
    formGen: document.querySelector('.tb')?.dataset.generation,
    itemField: document.querySelectorAll('[data-testid="tb-item"]').length,
    natureField: document.querySelectorAll('[data-testid="tb-nature"]').length,
    statRows: document.querySelectorAll('.tb-stats tbody tr').length,
  }))
  out('a Gen 3 build under the app default', genBefore)
  await seed({
    nextBuildSeq: 2,
    nextTeamSeq: 1,
    builds: [b('b1', { generation: 1, abilityId: null })],
    teams: [],
  })
  await openLib('b1')
  out(
    'a GEN 1 build: era gates',
    await page.evaluate(() => ({
      itemField: document.querySelectorAll('[data-testid="tb-item"]').length,
      natureField: document.querySelectorAll('[data-testid="tb-nature"]').length,
      abilityField: document.querySelectorAll('[data-testid="tb-ability"]').length,
      friendship: document.querySelectorAll('[data-testid="tb-friendship"]').length,
      shiny: document.querySelectorAll('[data-testid="tb-shiny"]').length,
      statRows: document.querySelectorAll('.tb-stats tbody tr').length,
      heldItemBadge: document.querySelectorAll('.tb-identity .tb-held-item').length,
    })),
  )

  // ==================================================================
  hr('9. FIELD BOUNDS')
  await seed({ nextBuildSeq: 2, nextTeamSeq: 1, builds: [b('b1')], teams: [] })
  await openLib('b1')
  const bounds = await page.evaluate(() => {
    const at = (id) => document.querySelector(`[data-testid="${id}"]`)
    const lvl = at('tb-level')
    return {
      level: lvl ? { min: lvl.min, max: lvl.max, type: lvl.type } : null,
      nickMax: at('tb-nickname')?.maxLength,
    }
  })
  out('declared bounds', bounds)
  /* Push a level past the top by typing rather than by the control. */
  await page.fill('[data-testid="tb-level"]', '999')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  out('level typed as 999', {
    field: await page.inputValue('[data-testid="tb-level"]'),
    statTotalPresent: (await page.$$('[data-testid="tb-stat-sum"]')).length,
  })
  await page.fill('[data-testid="tb-level"]', '0')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  out('level typed as 0', { field: await page.inputValue('[data-testid="tb-level"]') })
  await page.fill('[data-testid="tb-level"]', '-5')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(300)
  out('level typed as -5', { field: await page.inputValue('[data-testid="tb-level"]') })
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(500)
  out(
    'what got stored',
    (await store()).builds.map((x) => `lv${x.level}`),
  )

  // ==================================================================
  hr('10. A PASTED NICKNAME LONGER THAN THE CAP')
  await seed({ nextBuildSeq: 2, nextTeamSeq: 1, builds: [b('b1')], teams: [] })
  await openLib('b1')
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tb-nickname"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, 'ABCDEFGHIJKLMNOPQRST')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(300)
  out('a 20-character value forced past maxLength', {
    field: await page.inputValue('[data-testid="tb-nickname"]'),
  })
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(500)
  out(
    'stored',
    (await store()).builds.map((x) => `${x.nickname}(${x.nickname.length})`),
  )

  // ==================================================================
  hr('11. EV BUDGET')
  await seed({
    nextBuildSeq: 2,
    nextTeamSeq: 1,
    builds: [b('b1', { effort: { hp: 252, attack: 252, defense: 252, speed: 252 } })],
    teams: [],
  })
  await openLib('b1')
  out(
    'a seeded spread of 1008 against a 510 budget',
    await page.evaluate(() => ({
      total: document.querySelector('[data-testid="tb-ev-total"]')?.textContent.trim() ?? null,
      overBudgetMarker: document.querySelectorAll('[data-testid="tb-ev-total"][data-over="true"]')
        .length,
    })),
  )

  // ==================================================================
  hr('12. AN EDIT MADE IN THE LIBRARY SHOWS ON THE TEAM')
  await seed({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [b('b1', { speciesId: 1, pokemonId: 1 })],
    teams: [t('t1', 1, ['b1'])],
  })
  await openLib('b1')
  await page.selectOption('[data-testid="tb-species"]', '25')
  await page.waitForTimeout(300)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(500)
  await openTeam('t1')
  out(
    'the team sees the edit',
    await page.$$eval('[data-tb="member-card"]', (e) => e.map((x) => x.dataset.speciesId)),
  )

  // ==================================================================
  hr('13. RESET, THEN LEAVE')
  await seed({
    nextBuildSeq: 2,
    nextTeamSeq: 1,
    builds: [b('b1', { nickname: 'Keep', level: 77, effort: { hp: 100 } })],
    teams: [],
  })
  await openLib('b1')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-reset"]')
  await page.waitForSelector('[data-testid="tb-reset-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(400)
  out(
    'immediately after reset',
    (await store()).builds.map((x) => `lv${x.level} "${x.nickname}"`),
  )
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(500)
  out(
    'after leaving (nothing resurrected)',
    (await store()).builds.map((x) => `lv${x.level} "${x.nickname}"`),
  )

  // ==================================================================
  hr('14. BULK DELETE OF TEAMS THAT SHARE A BUILD')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 3,
    builds: [b('b1'), b('b2', { speciesId: 4, pokemonId: 4 })],
    teams: [t('t1', 1, ['b1', 'b2']), t('t2', 2, ['b2'])],
  })
  await nav('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-teams-select"]')
  await page.waitForTimeout(200)
  const circles = await page.$$('.tb-select-circle')
  if (circles.length) await circles[0].click()
  await page.waitForTimeout(150)
  await page.click('[data-testid="tb-teams-bulk-delete"]')
  await page.waitForSelector('[data-testid="tb-bulk-delete-teams-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(500)
  const bulk = await store()
  out('deleting t1 alone: b2 is still on t2 so it must survive', {
    builds: bulk.builds.map((x) => x.id),
    teams: bulk.teams.map((x) => `${x.id}:${x.memberIds.filter(Boolean).join(',')}`),
  })

  // ==================================================================
  hr('15. THE SEVENTH MEMBER')
  await seed({
    nextBuildSeq: 8,
    nextTeamSeq: 2,
    builds: [1, 2, 3, 4, 5, 6, 7].map((n) => b(`b${n}`, { speciesId: n, pokemonId: n })),
    teams: [t('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])],
  })
  await openTeam('t1')
  out('a full team offers no add affordance', {
    adds: (await page.$$('[data-testid^="tb-slot-"][data-testid$="-add"]')).length,
    empties: (await page.$$('[data-tb="empty-slot"]')).length,
    count: (await page.textContent('[data-testid="tb-slot-count"]')).trim(),
  })
  /* And through the form's "add to other team" modal. */
  await openLib('b7')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-add-to-team"]')
  await page.waitForTimeout(500)
  out(
    'the add-to-team modal on a full team',
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="tb-add-to-team-teams"] button')]
      return {
        title: document
          .querySelector('[data-testid="tb-add-to-team"] .tb-modal-title')
          ?.textContent.trim(),
        rows: rows.map((r) => ({
          text: r.textContent.trim().replace(/\s+/g, ' ').slice(0, 44),
          disabled: r.disabled,
        })),
      }
    }),
  )

  // ==================================================================
  hr('16. DRAG REORDER WITH A GAP IN THE MIDDLE')
  await seed({
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    builds: [
      b('b1'),
      b('b2', { speciesId: 4, pokemonId: 4 }),
      b('b3', { speciesId: 7, pokemonId: 7 }),
    ],
    teams: [t('t1', 1, ['b1', null, 'b3'])],
  })
  await openTeam('t1')
  out('a seeded gap is compacted on read?', (await store()).teams[0].memberIds)
  out('what the viewer draws', {
    cards: await page.$$eval('[data-tb="member-card"]', (e) => e.map((x) => x.dataset.buildId)),
    addOn: (await page.$$('[data-testid="tb-slot-1-add"]')).length ? 'slot 1' : 'elsewhere',
  })

  console.log(`\n${'='.repeat(74)}`)
  console.log(
    `console/page errors: ${JSON.stringify(errors.filter((e) => !/githubusercontent|ERR_|favicon|Failed to load resource/.test(e)))}`,
  )
} finally {
  await browser.close()
  dev.stop()
}
