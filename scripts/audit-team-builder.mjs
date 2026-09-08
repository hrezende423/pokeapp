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

  /*
    ==================================================================
    ROUND TWO. The scenarios above were written against the store and the
    pickers. These were written against what has changed since: the coverage
    panels (portalled to the body, placed against the app frame, counting
    attacks per tier), the Team Display's density, and the surfaces nobody has
    driven yet -- a phone-width window, the keyboard, two panels at once, a
    document large enough to be slow.
  */

  /* Move ids by name, for the movesets below. */
  const mv = await page.evaluate(async () => {
    const d = await import('/pokeapp/src/data/index.ts')
    const m = {}
    for (const x of d.listMoves()) m[x.name] = x.id
    return m
  })
  /* Every ancestor that could scroll sideways. The app's model says nothing
     may be clipped and the page must not scroll horizontally. */
  const overflows = () =>
    page.evaluate(() => {
      const of = (el, name) =>
        el
          ? {
              name,
              x: +(el.scrollWidth - el.clientWidth).toFixed(1),
              y: +(el.scrollHeight - el.clientHeight).toFixed(1),
            }
          : { name, missing: true }
      return [
        of(document.documentElement, 'html'),
        of(document.body, 'body'),
        of(document.querySelector('.panel'), 'panel'),
        of(document.querySelector('.scroll-area'), 'scroll-area'),
        of(document.querySelector('.tb-screen'), 'tb-screen'),
      ].filter((r) => r.missing || r.x !== 0 || r.y !== 0)
    })
  const panelBoxes = () =>
    page.evaluate(() => {
      const frame = document.querySelector('.panel')?.getBoundingClientRect()
      return [...document.querySelectorAll('.tb-popover')].map((el) => {
        const b = el.getBoundingClientRect()
        return {
          id: el.dataset.testid,
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
          inFrame:
            frame != null &&
            b.left >= frame.left - 0.5 &&
            b.right <= frame.right + 0.5 &&
            b.top >= frame.top - 0.5 &&
            b.bottom <= frame.bottom + 0.5,
          scrolls: el.scrollHeight > el.clientHeight + 1,
        }
      })
    })
  const sixWithMoves = (moveIds, gen = 4) => ({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: [462, 306, 272, 330, 326, 356].map((sp, i) =>
      b(`b${i + 1}`, {
        generation: gen,
        speciesId: sp,
        pokemonId: sp,
        natureId: 3,
        abilityId: null,
        moveIds,
      }),
    ),
    teams: [t('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], { generation: gen })],
  })

  // ==================================================================
  hr('17. A PHONE-WIDTH WINDOW')
  await seed(sixWithMoves([mv['thunderbolt'], mv['ice-beam'], mv['earthquake'], mv['toxic']]))
  for (const size of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size)
    await openTeam('t1')
    await page.waitForTimeout
    out(`team display at ${size.width}x${size.height}`, {
      overflow: await overflows(),
      geometry: await page.evaluate(() => {
        const r = (n) => Math.round(n)
        const grid = document.querySelector('[data-testid="tb-slot-grid"]')
        const cards = [...document.querySelectorAll('.tb-card-full')]
        const sc = document.querySelector('.scroll-area').getBoundingClientRect()
        const last = cards.at(-1)?.getBoundingClientRect()
        return {
          cards: cards.length,
          cardW: cards[0] ? r(cards[0].getBoundingClientRect().width) : null,
          gridW: r(grid.getBoundingClientRect().width),
          gridRight: r(grid.getBoundingClientRect().right),
          scRight: r(sc.right),
          lastCardOffRight: last ? r(Math.max(0, last.right - sc.right)) : null,
          lastCardOffBottom: last ? r(Math.max(0, last.bottom - sc.bottom)) : null,
          columns: getComputedStyle(grid).gridTemplateColumns,
        }
      }),
    })
    await nav('my-teams')
    out(`team library at ${size.width}`, {
      overflow: await overflows(),
      lanes: await page.evaluate(() => {
        const lane = document.querySelector('.tb-team-members')
        const cards = [...document.querySelectorAll('.tb-card-compact')]
        return {
          members: cards.length,
          rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().y))).size,
          laneW: lane ? Math.round(lane.getBoundingClientRect().width) : null,
        }
      }),
    })
  }
  await page.setViewportSize({ width: 1600, height: 1000 })

  // ==================================================================
  hr('18. TWO PANELS AT ONCE')
  await openTeam('t1')
  await page.hover('[data-testid="tb-slot-0"]')
  await page.click('[data-testid="tb-slot-0-matchup"]')
  await page.waitForTimeout(250)
  out('one open', await panelBoxes())
  /* Straight to another trigger, without closing the first. */
  await page.hover('[data-testid="tb-slot-1"]')
  await page.click('[data-testid="tb-slot-1-offence"]')
  await page.waitForTimeout(250)
  out('second trigger clicked with the first still open', await panelBoxes())
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  out('after one Escape', await panelBoxes())
  /* And the team's two, one after the other. */
  await page.click('[data-testid="tb-viewer-coverage"]')
  await page.waitForTimeout(200)
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForTimeout(250)
  out('team defence then team offence', await panelBoxes())
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('19. A PANEL WHILE THE PAGE SCROLLS UNDER IT')
  await page.setViewportSize({ width: 1280, height: 620 })
  await openTeam('t1')
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForTimeout(300)
  const before19 = await panelBoxes()
  out('placed', before19)
  await page.evaluate(() => document.querySelector('.scroll-area').scrollBy(0, 220))
  await page.waitForTimeout(300)
  out('after scrolling the screen 220px under it', {
    panels: await panelBoxes(),
    scrolled: await page.evaluate(() => document.querySelector('.scroll-area').scrollTop),
    stillOpen: (await page.$$('.tb-popover')).length,
  })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1600, height: 1000 })

  // ==================================================================
  hr('20. DARK MODE, INSIDE A PORTALLED PANEL')
  const readColours = () =>
    page.evaluate(() => {
      const pop = document.querySelector('.tb-popover')
      const cs = (el) => (el ? getComputedStyle(el) : null)
      const marked = document.querySelector('.tb-matchup-table td[data-hole="true"]')
      const label = document.querySelector('.tb-popover [data-ds="type-label"]')
      const row = document.querySelector('.tb-matchup-table td')
      return {
        theme: document.documentElement.dataset.theme ?? '(system)',
        panelBg: cs(pop)?.backgroundColor,
        panelBorder: cs(pop)?.borderTopColor,
        panelText: cs(pop)?.color,
        gap: cs(document.querySelector('.tb-popover .tb-matchup-note'))?.gap,
        hairline: cs(row)?.borderBottomColor,
        markedColour: cs(marked)?.color,
        typeLabel: cs(label)?.color,
      }
    })
  /* The theme is switched BEFORE the panel is opened, because the switcher is
     outside the panel and clicking it would dismiss the thing being measured. */
  for (const theme of ['light', 'dark']) {
    await page.click(`[data-testid="theme-${theme}"]`)
    await page.waitForTimeout(300)
    await openTeam('t1')
    await page.click('[data-testid="tb-viewer-offence"]')
    await page.waitForTimeout(300)
    out(theme, await readColours())
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await page.click('[data-testid="theme-light"]')
  await page.waitForTimeout(250)

  // ==================================================================
  hr('21. A GEN 1 TEAM')
  await seed(sixWithMoves([mv['thunderbolt'], mv['surf'], mv['body-slam'], mv['rest']], 1))
  await openTeam('t1')
  out('the cards', {
    generation: await page.getAttribute('.tb', 'data-generation'),
    spread: (await page.textContent('[data-testid="tb-slot-0-spread"]'))?.trim(),
    firstMoveRow: await page.evaluate(() => {
      const row = document.querySelector('.tb-card-full .tb-card-moves')
      return row ? row.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null
    }),
    idLine: await page.evaluate(() =>
      document.querySelector('.tb-card-idline')?.textContent.replace(/\s+/g, ' ').trim(),
    ),
  })
  await page.click('[data-testid="tb-viewer-coverage"]')
  await page.waitForTimeout(250)
  out('gen 1 defensive table', {
    rows: await page.$$eval('[data-testid="tb-matchup-team"] tbody tr', (r) =>
      r.map((x) => x.dataset.type),
    ),
    heads: await page.$$eval('[data-testid="tb-matchup-team"] th', (r) =>
      r.map((x) => x.textContent.trim()),
    ),
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForTimeout(250)
  out('gen 1 attacking table', {
    heads: await page.$$eval('[data-testid="tb-matchup-team-offense"] th', (r) =>
      r.map((x) => x.textContent.trim()),
    ),
    rows: await page.$$eval('[data-testid="tb-matchup-team-offense"] tbody tr', (r) =>
      r.map((x) => x.dataset.type),
    ),
    note: await page
      .textContent('[data-testid="tb-matchup-team-offense"] .tb-matchup-ignored')
      .catch(() => '(none)'),
  })
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('22. TWENTY-FOUR ATTACKS')
  await seed(sixWithMoves([mv['thunderbolt'], mv['ice-beam'], mv['earthquake'], mv['shadow-ball']]))
  await openTeam('t1')
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForTimeout(350)
  out('the biggest panel this module can draw', {
    panel: await panelBoxes(),
    note: await page
      .textContent('[data-testid="tb-matchup-team-offense"] .tb-matchup-ignored')
      .catch(() => '(no ignored line)'),
    sums: await page.$$eval('[data-testid="tb-matchup-team-offense"] tbody tr', (rows) =>
      rows.map(
        (r) =>
          `${r.dataset.type}:${[...r.children]
            .slice(1)
            .reduce((n, c) => n + (c.textContent.trim() === '' ? 0 : +c.textContent.trim()), 0)}`,
      ),
    ),
  })
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('23. A TEAM WITH NOTHING SUPER EFFECTIVE ANYWHERE')
  await seed(sixWithMoves([mv['body-slam'], mv['double-edge'], mv['toxic'], mv['rest']]))
  await openTeam('t1')
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForTimeout(300)
  out('normal-only coverage', {
    heads: await page.$$eval('[data-testid="tb-matchup-team-offense"] th', (r) =>
      r.map((x) => x.textContent.trim()),
    ),
    firstRows: await page.$$eval('[data-testid="tb-matchup-team-offense"] tbody tr', (rows) =>
      rows.slice(0, 4).map((r) => ({
        t: r.dataset.type,
        cells: [...r.children].slice(1).map((c) => c.textContent.trim()),
        hole: r.dataset.hole ?? null,
        wall: r.dataset.wall ?? null,
      })),
    ),
    marked: (await page.$$('[data-testid="tb-matchup-team-offense"] td[data-hole="true"]')).length,
  })
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('24. MOVE IDS THAT ARE NONSENSE, AND DUPLICATES')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      b('b1', {
        generation: 4,
        speciesId: 25,
        pokemonId: 25,
        natureId: 3,
        moveIds: [mv['thunderbolt'], mv['thunderbolt'], 999999, -4],
      }),
    ],
    teams: [t('t1', 1, ['b1'], { generation: 4 })],
  })
  await openTeam('t1')
  out('the card', {
    moves: await page.evaluate(() =>
      [...document.querySelectorAll('.tb-card-full .tb-move-name')].map((e) =>
        e.textContent.trim(),
      ),
    ),
    rows: (await page.$$('.tb-card-full .tb-move')).length,
  })
  await page.hover('[data-testid="tb-slot-0"]')
  await page.click('[data-testid="tb-slot-0-offence"]')
  await page.waitForTimeout(300)
  out('its attacking panel', {
    note: await page
      .textContent('[data-testid="tb-matchup-offense"] .tb-matchup-ignored')
      .catch(() => '(none)'),
    brought: await page.$$eval(
      '[data-testid="tb-matchup-offense"] .tb-matchup-note [data-ds="type-label"]',
      (e) => e.map((x) => x.dataset.type),
    ),
    water: await page.evaluate(() => {
      const tr = document.querySelector('[data-testid="tb-matchup-offense"] tr[data-type="water"]')
      return tr ? [...tr.children].slice(1).map((c) => c.textContent.trim()) : null
    }),
  })
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('25. EVS AND DVS OUT OF RANGE')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      b('b1', {
        generation: 4,
        speciesId: 25,
        pokemonId: 25,
        natureId: 3,
        effort: { hp: 999, attack: -20, speed: 252 },
        individual: { hp: 99, attack: -1 },
      }),
    ],
    teams: [t('t1', 1, ['b1'], { generation: 4 })],
  })
  await openTeam('t1')
  out('the card spread', (await page.textContent('[data-testid="tb-slot-0-spread"]')).trim())
  await openLib('b1')
  out('the form', {
    evTotal: await page.evaluate(
      () => document.querySelector('[data-testid="tb-ev-total"]')?.textContent.trim() ?? null,
    ),
    overBudget: await page.evaluate(
      () => document.querySelector('[data-over]')?.getAttribute('data-over') ?? null,
    ),
    stats: await page.$$eval('.tb-stat-row', (rows) =>
      rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    ),
  })

  // ==================================================================
  hr('26. THE LONGEST TEXT THIS CARD CAN HOLD')
  const longest = await page.evaluate(async () => {
    const d = await import('/pokeapp/src/data/index.ts')
    const by = (list, key) =>
      list.reduce((a, x) => ((x[key] ?? '').length > (a[key] ?? '').length ? x : a))
    const ability = by(
      d.listAbilities().filter((a) => (a.generation_id ?? 1) <= 4),
      'display_name',
    )
    const nature = by(d.listNatures(), 'display_name')
    return {
      abilityId: ability.id,
      ability: ability.display_name,
      natureId: nature.id,
      nature: nature.display_name,
    }
  })
  out('the longest names in Gen 1-4 scope', longest)
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      /* Nidoran-f for the glyph in the species name, the longest nature and a
         long ability, and a nickname at whatever the cap turns out to be. */
      b('b1', {
        generation: 4,
        speciesId: 29,
        pokemonId: 29,
        /* NICKNAME_MAX is 10, and W is the widest glyph in the face. */
        nickname: 'WWWWWWWWWW',
        natureId: longest.natureId,
        abilityId: longest.abilityId,
        moveIds: [mv['high-jump-kick'], mv['thunderbolt'], mv['earthquake'], mv['toxic']],
        level: 100,
      }),
    ],
    teams: [t('t1', 1, ['b1'], { generation: 4 })],
  })
  await openTeam('t1')
  out('a card carrying the worst case', {
    card: await page.evaluate(() => {
      const r = (n) => Math.round(n)
      const card = document.querySelector('.tb-card-full')
      const clipped = (sel) => {
        const el = card.querySelector(sel)
        if (!el) return null
        return {
          text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
          overflowX: r(el.scrollWidth - el.clientWidth),
        }
      }
      return {
        width: r(card.getBoundingClientRect().width),
        art: r(card.querySelector('.tb-card-art').getBoundingClientRect().height),
        headline: clipped('.tb-card-headline'),
        name: clipped('.tb-card-name'),
        idline: clipped('.tb-card-idline'),
        moveName: clipped('.tb-move-name'),
      }
    }),
    screenOverflow: await overflows(),
  })

  // ==================================================================
  hr('27. THE KEYBOARD')
  await seed(sixWithMoves([mv['thunderbolt'], mv['ice-beam'], mv['earthquake'], mv['toxic']]))
  await openTeam('t1')
  await page.evaluate(() => document.querySelector('[data-testid="tb-back-to-teams"]')?.focus())
  const tabTrail = []
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab')
    tabTrail.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'body'
        return (
          el.dataset.testid ??
          `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`
        )
      }),
    )
  }
  out('twelve tabs from the back button', tabTrail)
  out('does focus reveal a card corner', {
    focused: await page.evaluate(() => document.activeElement?.dataset.testid ?? null),
    cornerOpacity: await page.evaluate(() => {
      const focused = document.activeElement
      const corner = focused?.closest('.tb-corner')
      return corner ? getComputedStyle(corner).opacity : '(focus is not in a corner)'
    }),
  })
  /* Open a panel with the keyboard, if the corner can be reached at all. */
  await page.evaluate(() => document.querySelector('[data-testid="tb-slot-0-matchup"]')?.focus())
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  out('Enter on a focused shield', {
    panels: (await page.$$('.tb-popover')).length,
    focusAfterOpen: await page.evaluate(
      () => document.activeElement?.dataset.testid ?? document.activeElement?.tagName,
    ),
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  out('after Escape', {
    panels: (await page.$$('.tb-popover')).length,
    focus: await page.evaluate(
      () => document.activeElement?.dataset.testid ?? document.activeElement?.tagName,
    ),
  })

  // ==================================================================
  hr('28. RAPID CLICKS')
  await nav('my-teams')
  const teamsBefore = (await store()).teams.length
  await page.click('[data-testid="tb-new-team"]', { clickCount: 2, delay: 20 }).catch(() => {})
  await page.waitForTimeout(600)
  out('double-clicking New team', {
    teamsBefore,
    teamsAfter: (await store()).teams.length,
    screen: (await page.$$('[data-testid="tb-team-viewer"]')).length ? 'viewer' : 'my-teams',
  })
  await openTeam('t1')
  await page.hover('[data-testid="tb-slot-0"]')
  await page.click('[data-testid="tb-slot-0-offence"]', { clickCount: 2, delay: 20 })
  await page.waitForTimeout(300)
  out('double-clicking the swords', { panels: (await page.$$('.tb-popover')).length })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  out('two Escapes later', {
    panels: (await page.$$('.tb-popover')).length,
    screen: (await page.$$('[data-testid="tb-team-viewer"]')).length ? 'viewer' : 'elsewhere',
  })

  // ==================================================================
  hr('29. A DOCUMENT BIG ENOUGH TO BE SLOW')
  const big = { nextBuildSeq: 241, nextTeamSeq: 41, builds: [], teams: [] }
  for (let i = 1; i <= 240; i += 1) {
    big.builds.push(
      b(`b${i}`, {
        generation: 4,
        speciesId: (i % 490) + 1,
        pokemonId: (i % 490) + 1,
        natureId: 3,
        moveIds: [mv['thunderbolt'], mv['ice-beam'], mv['earthquake'], mv['toxic']],
      }),
    )
  }
  for (let i = 1; i <= 40; i += 1) {
    big.teams.push(
      t(
        `t${i}`,
        i,
        [1, 2, 3, 4, 5, 6].map((n) => `b${(i - 1) * 6 + n}`),
        { generation: 4 },
      ),
    )
  }
  await seed(big)
  const timed = async (label, fn) => {
    const started = await page.evaluate(() => performance.now())
    await fn()
    const ended = await page.evaluate(() => performance.now())
    out(label, `${Math.round(ended - started)}ms`)
  }
  out('document size', `${JSON.stringify(big).length} bytes`)
  await timed('My Teams with 40 teams', async () => {
    await nav('my-teams')
    await page.waitForSelector('[data-testid="tb-my-teams"]')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-tb="team-row"], .tb-team-row').length > 0,
    )
  })
  out('what My Teams drew', {
    lanes: (await page.$$('.tb-team-row')).length,
    compactCards: (await page.$$('.tb-card-compact')).length,
    overflow: await overflows(),
  })
  await timed('Build Library with 240 builds', async () => {
    await nav('build-library')
    await page.waitForSelector('[data-testid="tb-build-grid"]')
    await page.waitForFunction(() => document.querySelectorAll('.tb-card-library').length > 100)
  })
  out('what the library drew', { cards: (await page.$$('.tb-card-library')).length })
  await timed('a team viewer and its attacking panel', async () => {
    await openTeam('t7')
    await page.click('[data-testid="tb-viewer-offence"]')
    await page.waitForSelector('[data-testid="tb-matchup-team-offense"] tbody tr')
  })
  await page.keyboard.press('Escape')

  // ==================================================================
  hr('30. WONDER GUARD ON A TEAM')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      /* Shedinja, whose ability makes everything not super effective a 0x. */
      b('b1', { generation: 4, speciesId: 292, pokemonId: 292, abilityId: 25, natureId: 3 }),
      b('b2', { generation: 4, speciesId: 306, pokemonId: 306, abilityId: 69, natureId: 3 }),
    ],
    teams: [t('t1', 1, ['b1', 'b2'], { generation: 4 })],
  })
  await openTeam('t1')
  await page.click('[data-testid="tb-viewer-coverage"]')
  await page.waitForTimeout(300)
  out('the team table with a Wonder Guard member', {
    rows: await page.$$eval('[data-testid="tb-matchup-team"] tbody tr', (rows) =>
      rows.map(
        (r) =>
          `${r.dataset.type}:${[...r.children]
            .slice(1)
            .map((c) => c.textContent.trim())
            .join('/')}`,
      ),
    ),
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  out('and Shedinja itself', {
    hp: await page.evaluate(() => {
      const card = document.querySelector('.tb-card-full')
      return card ? card.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) : null
    }),
  })

  // ==================================================================
  hr('31. A MOVE WHOSE TYPE MOVED BETWEEN ERAS')
  await seed({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      b('b1', {
        generation: 4,
        speciesId: 35,
        pokemonId: 35,
        natureId: 3,
        /* Charm, Sweet Kiss and Moonlight are stored as FAIRY (a Gen 6 type)
           with a past_values entry giving their real Gen 1-4 type. */
        moveIds: [mv['charm'], mv['sweet-kiss'], mv['moonlight'], mv['body-slam']],
      }),
    ],
    teams: [t('t1', 1, ['b1'], { generation: 4 })],
  })
  await openTeam('t1')
  out('the move rows on the card', {
    rows: await page.evaluate(() =>
      [...document.querySelectorAll('.tb-card-full .tb-move')].map((r) =>
        r.textContent.replace(/\s+/g, ' ').trim(),
      ),
    ),
    types: await page.$$eval('.tb-card-full .tb-move [data-ds="type-label"]', (e) =>
      e.map((x) => x.dataset.type),
    ),
  })

  console.log(`\n${'='.repeat(74)}`)
  console.log(
    `console/page errors: ${JSON.stringify(errors.filter((e) => !/githubusercontent|ERR_|favicon|Failed to load resource/.test(e)))}`,
  )
} finally {
  await browser.close()
  dev.stop()
}
