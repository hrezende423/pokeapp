/**
 * Verification for the four Team Building screens.
 *
 * DRIVES THE REAL APP IN A REAL BROWSER and asserts BEHAVIOUR, not presence: that
 * creating a team lands you in an empty Team Viewer, that a seventh member is
 * impossible, that a drag reorder survives leaving and returning, that clearing
 * move slot 2 shifts 3 and 4 up, that the shared-build prompt fires at two teams
 * and not at one. "It rendered" is not a check.
 *
 * THE STORE IS localStorage, so every section starts from a known state by seeding
 * it and reloading -- otherwise one section's team count would depend on what an
 * earlier one left behind, and failures would move around between runs.
 *
 * THE MOVE-TYPE ASSERTIONS ARE THE POINT OF SECTION 1. Team Building must resolve
 * move types through src/data/moveEra.ts, never `move.type_id`: a Gen 1 Karate
 * Chop is NORMAL (it became Fighting in Gen 2) and a Gen 2-4 Curse is ???-typed.
 * Both render as something else if the raw field is read, so the suite builds
 * exactly those two cases and reads the rendered type back out of the DOM.
 *
 * Usage: node scripts/verify-team-builder.mjs
 */

import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'

const PORT = 4193

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

/*
  THE SERVER IS STARTED THROUGH lib/devServer.mjs, which proves the port is served
  by a dev server this run actually started. Polling the URL until it answers is
  NOT enough: an orphaned `vite preview` on the same port answers too, with a stale
  build, and the whole suite then silently tests previous code. See that file.
*/
const dev = await startDevServer({ port: PORT })
const APP_URL = dev.url

let browser
try {
  log(`dev server ready at ${APP_URL}`)
  browser = await chromium.launch()
  /*
    THE SERVICE WORKER MUST BE BLOCKED -- this is not a detail, it invalidated an
    entire earlier run. vite-plugin-pwa registers a worker in dev too, and its
    precache then answers module requests from a PREVIOUS build, so the screens
    under test are a stale copy of themselves.
  */
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    serviceWorkers: 'block',
  })
  /* A cold dev server transforms every module on first request, and this suite
     reloads a dozen times, so navigation is slow in a way `vite preview` is not. */
  context.setDefaultNavigationTimeout(120000)
  context.setDefaultTimeout(30000)
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })

  const seedStore = async (doc) => {
    await page.evaluate(
      ([key, value]) => {
        if (value == null) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(value))
      },
      ['pokeapp:team-builder:v1', doc],
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  }
  const readStore = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('pokeapp:team-builder:v1') ?? 'null'))

  const goTo = async (id) => {
    await page.hover('[data-testid="nav-tab-team-building"]')
    await page.waitForSelector('[data-testid="nav-dropdown-team-building"]', { state: 'visible' })
    await page.click(`[data-testid="nav-${id}"]`)
  }

  /** Move ids come from the bundle, so the suite never hardcodes one. */
  const moveIdByName = await page.evaluate(async () => {
    const data = await import('/pokeapp/src/data/index.ts')
    const out = {}
    for (const m of data.listMoves()) out[m.name] = m.id
    return {
      'karate-chop': out['karate-chop'],
      curse: out['curse'],
      tackle: out['tackle'],
      growl: out['growl'],
      ember: out['ember'],
      scratch: out['scratch'],
    }
  })
  log(`  move ids: ${JSON.stringify(moveIdByName)}`)

  const mkBuild = (id, over = {}) => ({
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
    abilityId: null,
    natureId: null,
    moveIds: [null, null, null, null],
    effort: {},
    individual: {},
    tags: [],
    notes: '',
    ...over,
  })
  const mkTeam = (id, seq, memberIds, over = {}) => ({
    id,
    seq,
    generation: 3,
    memberIds: [...memberIds, ...Array(6 - memberIds.length).fill(null)],
    notes: '',
    ...over,
  })

  // =====================================================================
  hr('NAV — the four entries resolve to real screens, not stubs')
  await page.hover('[data-testid="nav-tab-team-building"]')
  await page.waitForSelector('[data-testid="nav-dropdown-team-building"]', { state: 'visible' })
  const tbLabels = await page.$$eval('[data-testid="nav-dropdown-team-building"] button', (b) =>
    b.map((x) => x.textContent.trim()),
  )
  log(`  Team Building entries: ${tbLabels.join(', ')}`)
  check(
    'the dropdown lists New Team, New Build, My Teams, Build Library',
    JSON.stringify(tbLabels.slice(0, 4)) ===
      JSON.stringify(['New Team', 'New Build', 'My Teams', 'Build Library']),
    tbLabels.join(','),
  )
  await page.click('[data-testid="nav-my-teams"]')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  check('My Teams is a real screen, not the stub placeholder', true)

  // =====================================================================
  hr('1. MY TEAMS')
  await seedStore(null)
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  check(
    'with no teams it shows the empty state and NO search bar',
    (await page.$$('[data-testid="tb-my-teams-empty"]')).length === 1 &&
      (await page.$$('[data-testid="tb-team-search"]')).length === 0,
  )

  // ---- creating a team lands in an EMPTY Team Viewer
  await page.click('[data-testid="tb-new-team"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  const emptySlots = (await page.$$('[data-tb="empty-slot"]')).length
  const viewerId = (await page.textContent('[data-testid="tb-viewer-team-id"]'))?.trim()
  log(`  new team ${viewerId} opened with ${emptySlots} empty slots`)
  check(
    '"+ New team" creates a team AND opens it in an empty Team Viewer',
    emptySlots === 6 && viewerId === '#001',
    `${emptySlots} slots, id ${viewerId}`,
  )

  // ---- move types resolve through moveEra, not raw type_id
  /*
    GEN 1 KARATE CHOP IS NORMAL and GEN 2 CURSE IS NOT GHOST. Both are stored with
    a modern type plus a past_values entry, so a raw `type_id` read shows Fighting
    and Ghost respectively. This is the regression this module was built to avoid.
  */
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', {
        generation: 1,
        speciesId: 56,
        pokemonId: 56,
        moveIds: [moveIdByName['karate-chop'], null, null, null],
      }),
      mkBuild('b2', {
        generation: 2,
        speciesId: 1,
        pokemonId: 1,
        moveIds: [moveIdByName['curse'], null, null, null],
      }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2'], { generation: 1 })],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-team-rows"]')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  const renderedTypes = await page.$$eval('[data-move-id]', (els) =>
    els.map((e) => ({ id: Number(e.dataset.moveId), type: e.dataset.moveType })),
  )
  log(`  rendered move types: ${JSON.stringify(renderedTypes)}`)
  const karate = renderedTypes.find((r) => r.id === moveIdByName['karate-chop'])
  const curse = renderedTypes.find((r) => r.id === moveIdByName['curse'])
  check(
    'a Gen 1 Karate Chop renders as NORMAL (a raw type_id read would say fighting)',
    karate?.type === 'normal',
    `got ${karate?.type}`,
  )
  check(
    'a Gen 2 Curse does NOT render as ghost (a raw type_id read would say ghost)',
    curse != null && curse.type !== 'ghost',
    `got ${curse?.type}`,
  )

  // ---- genderless species shows no indicator at all
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    /* Magnemite: gender_rate -1, i.e. genderless. */
    builds: [mkBuild('b1', { speciesId: 81, pokemonId: 81, gender: null })],
    teams: [mkTeam('t1', 1, ['b1'])],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-team-rows"]')
  const genderMarks = await page.$$eval('.tb-card-gender', (els) => els.map((e) => e.textContent))
  check(
    'a genderless species renders NO gender glyph and no dash',
    genderMarks.length === 0,
    JSON.stringify(genderMarks),
  )

  // ---- delete confirms, then actually removes
  await page.hover('[data-testid="tb-team-t1"]')
  await page.click('[data-testid="tb-team-t1-kebab"]')
  await page.waitForSelector('[data-testid="tb-team-t1-delete"]')
  await page.click('[data-testid="tb-team-t1-delete"]')
  const promptShown = (await page.$$('[data-testid="tb-delete-team-prompt"]')).length === 1
  const teamsBeforeConfirm = (await readStore()).teams.length
  check(
    'deleting a team asks first and has NOT deleted anything yet',
    promptShown && teamsBeforeConfirm === 1,
    `prompt=${promptShown} teams=${teamsBeforeConfirm}`,
  )
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(300)
  const teamsAfter = (await readStore()).teams.length
  check('confirming actually removes the row', teamsAfter === 0, `${teamsAfter} teams`)

  // =====================================================================
  hr('2. TEAM VIEWER')
  const sixIds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']
  await seedStore({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: sixIds.map((id, i) =>
      mkBuild(id, { speciesId: 1 + i * 3, pokemonId: 1 + i * 3, nickname: `Mon${i + 1}` }),
    ),
    teams: [mkTeam('t1', 1, sixIds)],
  })
  await goTo('my-teams')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')

  // ---- a 7th member is impossible
  const addAffordances = (await page.$$('[data-testid$="-add"]')).length
  const slotCount = (await page.textContent('[data-testid="tb-slot-count"]'))?.trim()
  check(
    'a full team offers NO add affordance, so a 7th member is impossible',
    addAffordances === 0 && (slotCount ?? '').includes('6 / 6'),
    `add buttons=${addAffordances}, count=${slotCount}`,
  )

  // ---- no team name anywhere
  const viewerText = await page.textContent('[data-testid="tb-team-viewer"]')
  const nameInputs = await page.$$eval(
    '[data-testid="tb-team-viewer"] input[type="text"]',
    (els) => els.length,
  )
  check(
    'no team NAME is displayed and no name input exists (only the id)',
    nameInputs === 0 && !/Ultimate Team/i.test(viewerText ?? ''),
    `inputs=${nameInputs}`,
  )

  // ---- clicking a member opens Build Form pre-filled with THAT member
  await page.click('[data-testid="tb-slot-2-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  const openedId = await page.getAttribute('[data-testid="tb-build-form"]', 'data-build-id')
  const nickname = await page.inputValue('[data-testid="tb-nickname"]')
  check(
    'clicking a member opens Build Form pre-filled with that build, not a blank one',
    openedId === 'b3' && nickname === 'Mon3',
    `id=${openedId} nickname=${nickname}`,
  )
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')

  // ---- drag reorder persists across leaving and returning
  const orderBefore = (await readStore()).teams[0].memberIds
  await page.dispatchEvent('[data-testid="tb-slot-0"]', 'dragstart')
  await page.dispatchEvent('[data-testid="tb-slot-2"]', 'dragover')
  await page.dispatchEvent('[data-testid="tb-slot-2"]', 'drop')
  await page.waitForTimeout(300)
  const orderAfter = (await readStore()).teams[0].memberIds
  log(`  order before: ${orderBefore.join(',')}`)
  log(`  order after:  ${orderAfter.join(',')}`)
  check(
    'dragging a member onto another slot reorders the team',
    JSON.stringify(orderBefore) !== JSON.stringify(orderAfter),
    orderAfter.join(','),
  )
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  const orderReturned = (await readStore()).teams[0].memberIds
  check(
    'that reorder survives leaving the screen and coming back',
    JSON.stringify(orderReturned) === JSON.stringify(orderAfter),
    orderReturned.join(','),
  )

  // ---- the click gesture still works on a draggable card
  await page.click('[data-testid="tb-slot-0-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  check('a card being draggable does NOT break its click-to-open gesture', true)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')

  // =====================================================================
  hr('3. BUILD LIBRARY')
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', { speciesId: 373, pokemonId: 373, nickname: 'SalaMENACE' }),
      mkBuild('b2', { speciesId: 6, pokemonId: 6 }),
    ],
    teams: [mkTeam('t1', 1, [])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  const usedBefore = (await page.textContent('[data-testid="tb-build-b1-used-in"]'))?.trim()
  check(
    'an unattached build reports "Used in 0 teams"',
    /0 teams/.test(usedBefore ?? ''),
    usedBefore,
  )

  // ---- Add-to-team updates the real count
  await page.hover('[data-testid="tb-build-b1-cell"]')
  await page.click('[data-testid="tb-build-b1-add-to-team"]')
  await page.waitForSelector('[data-testid="tb-add-to-team"]')
  await page.click('[data-testid="tb-add-to-team-t1"]')
  await page.waitForSelector('[data-testid="tb-add-to-team-slots"]')
  await page.click('[data-testid="tb-add-to-team-slot-0"]')
  await page.waitForTimeout(300)
  const stillOnLibrary = (await page.$$('[data-testid="tb-build-library"]')).length === 1
  const usedAfter = (await page.textContent('[data-testid="tb-build-b1-used-in"]'))?.trim()
  check(
    'Add-to-team places the build and the modal closes without navigating away',
    stillOnLibrary && (await readStore()).teams[0].memberIds[0] === 'b1',
    `onLibrary=${stillOnLibrary}`,
  )
  check(
    '"Used in N teams" reflects the real count afterwards',
    /1 team/.test(usedAfter ?? ''),
    usedAfter,
  )

  // ---- clicking a card opens THAT build
  await page.click('[data-testid="tb-build-b2-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  const libOpened = await page.getAttribute('[data-testid="tb-build-form"]', 'data-build-id')
  check('clicking a card opens Build Form for that specific build', libOpened === 'b2', libOpened)

  // =====================================================================
  hr('4. BUILD FORM')
  await seedStore({
    nextBuildSeq: 4,
    nextTeamSeq: 3,
    builds: [
      /* Salamence: Dragon/Flying, for the dual-type row. */
      mkBuild('b1', {
        speciesId: 373,
        pokemonId: 373,
        moveIds: [
          moveIdByName['tackle'],
          moveIdByName['growl'],
          moveIdByName['ember'],
          moveIdByName['scratch'],
        ],
        level: 60,
        nickname: 'Sal',
        effort: { attack: 100 },
        individual: { attack: 20 },
        itemId: 1,
      }),
      mkBuild('b2', { speciesId: 255, pokemonId: 255 }),
      mkBuild('b3', { speciesId: 25, pokemonId: 25 }),
    ],
    /* b3 is on BOTH teams, so it is the shared case; b1 is on one only. */
    teams: [mkTeam('t1', 1, ['b1', 'b3']), mkTeam('t2', 2, ['b3'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')

  // ---- dual type
  const typeRow = await page.$$eval('[data-testid="tb-type-row"] [data-ds="type-label"]', (els) =>
    els.map((e) => e.dataset.type),
  )
  check(
    'a dual-type species renders BOTH types in the type row',
    JSON.stringify(typeRow) === JSON.stringify(['dragon', 'flying']),
    typeRow.join(','),
  )

  /*
    ---- clearing slot 2 shifts 3 and 4 up

    READ OFF THE FORM, NOT OUT OF THE STORE. The form edits a draft and writes
    only at a save point, so the store still holds the pre-edit moveset at this
    instant -- by design. What this check is about is the SHIFT rule, so it asks
    the four selects what they are showing. Section 6 is where the draft actually
    reaching the store is proven.
  */
  const slotValues = () =>
    page.$$eval('[data-testid^="tb-move-select-"]', (els) =>
      els.map((e) => (e.value === '' ? null : Number(e.value))),
    )
  const movesBefore = await slotValues()
  await page.selectOption('[data-testid="tb-move-select-1"]', '')
  await page.waitForTimeout(300)
  const movesAfter = await slotValues()
  log(`  moves before: ${movesBefore.join(',')}`)
  log(`  moves after:  ${movesAfter.join(',')}`)
  check(
    'clearing move slot 2 shifts slots 3 and 4 up and empties slot 4',
    movesAfter[0] === movesBefore[0] &&
      movesAfter[1] === movesBefore[2] &&
      movesAfter[2] === movesBefore[3] &&
      movesAfter[3] === null,
    movesAfter.join(','),
  )

  // ---- reset clears exactly the listed fields, and confirms first
  const beforeReset = (await readStore()).builds.find((b) => b.id === 'b1')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-reset"]')
  const resetPrompted = (await page.$$('[data-testid="tb-reset-prompt"]')).length === 1
  check('reset asks for confirmation first', resetPrompted)
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(300)
  const afterReset = (await readStore()).builds.find((b) => b.id === 'b1')
  check(
    'reset clears item, moves, level, friendship, nickname, spread and shiny',
    afterReset.itemId === null &&
      afterReset.moveIds.every((m) => m === null) &&
      afterReset.level === 1 &&
      afterReset.friendship === 0 &&
      afterReset.nickname === '' &&
      Object.values(afterReset.effort).every((v) => !v) &&
      Object.values(afterReset.individual).every((v) => !v) &&
      afterReset.shiny === false,
    JSON.stringify({ item: afterReset.itemId, level: afterReset.level, nick: afterReset.nickname }),
  )
  check(
    'and KEEPS species, nature, ability and gender',
    afterReset.speciesId === beforeReset.speciesId &&
      afterReset.natureId === beforeReset.natureId &&
      afterReset.abilityId === beforeReset.abilityId &&
      afterReset.gender === beforeReset.gender,
  )

  // ---- the right rail shows the team's REAL other members
  const railIds = await page.$$eval('[data-testid^="tb-rail-b"]', (els) =>
    els.map((e) => e.dataset.buildId),
  )
  check(
    "the right rail lists the attached team's actual other members, not fixed data",
    railIds.length === 1 && railIds[0] === 'b3',
    railIds.join(','),
  )

  // ---- a build on ONE team autosaves with no prompt
  await page.fill('[data-testid="tb-nickname"]', 'Solo')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(200)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(400)
  const soloPrompt = (await page.$$('[data-testid="tb-shared-prompt"]')).length
  const soloSaved = (await readStore()).builds.find((b) => b.id === 'b1').nickname
  check(
    'a build attached to ONE team autosaves silently, with no prompt',
    soloPrompt === 0 && soloSaved === 'Solo',
    `prompt=${soloPrompt} nickname=${soloSaved}`,
  )

  // ---- a build on TWO teams prompts on leaving
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b3-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.fill('[data-testid="tb-nickname"]', 'Shared')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(200)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(400)
  const sharedPrompt = (await page.$$('[data-testid="tb-shared-prompt"]')).length === 1
  const options = await page.$$eval('[data-testid="tb-shared-prompt"] button', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'a build attached to TWO teams prompts on leaving, with all three options',
    sharedPrompt &&
      options.some((o) => /Save to all/i.test(o)) &&
      options.some((o) => /new build/i.test(o)) &&
      options.some((o) => /Discard/i.test(o)),
    options.join(' | '),
  )
  const buildsBeforeFork = (await readStore()).builds.length
  await page.click('[data-testid="tb-shared-fork"]')
  await page.waitForTimeout(400)
  const store = await readStore()
  check(
    '"Save as a new build" forks rather than editing the shared original',
    store.builds.length === buildsBeforeFork + 1 &&
      store.builds.find((b) => b.id === 'b3').nickname !== 'Shared',
    `${store.builds.length} builds`,
  )

  // ---- the moveset dropdown comes from getLegalMoveset
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b2-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="tb-move-select-0"] option').length > 5,
    { timeout: 90000 },
  )
  const torchicMoves = await page.$$eval('[data-testid="tb-move-select-0"] option', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  log(`  Torchic legal moves: ${torchicMoves.length} options`)
  check(
    "Torchic's move dropdown does NOT offer Bulk Up",
    !torchicMoves.some((m) => /^Bulk Up/i.test(m)),
    torchicMoves.filter((m) => /Bulk/i.test(m)).join(',') || 'absent',
  )
  check(
    'and it is populated from getLegalMoveset rather than empty',
    torchicMoves.length > 10,
    `${torchicMoves.length} options`,
  )

  // =====================================================================
  /*
    5. THE SAVE MODEL — when a draft becomes a saved build, and when it does not.

    THE FORM DOES NOT AUTOSAVE. It used to, and the consequence was that every
    keystroke of a half-built Pokemon was, briefly, the saved state of it. It now
    edits a draft and writes at named save points, so both halves need proving:
    that an edit does NOT reach the store on its own, and that each save point
    really does put it there. Half of this section would pass against a form that
    never saved at all, and the other half against the old autosaving one.

    EVERY CHECK READS localStorage, because "the field shows the new value" is
    exactly what a draft does whether or not anything was written down.
  */
  hr('5. THE SAVE MODEL — drafts, save points, and the one exit that must not save')
  const nickOf = async (id) => (await readStore()).builds.find((b) => b.id === id)?.nickname
  const openBuild = async (id) => {
    await goTo('build-library')
    await page.waitForSelector('[data-testid="tb-build-grid"]')
    await page.click(`[data-testid="tb-build-${id}-open"]`)
    await page.waitForSelector('[data-testid="tb-build-form"]')
  }

  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Original' })],
    teams: [mkTeam('t1', 1, ['b1'])],
  })

  // ---- an edit stays in the draft
  await openBuild('b1')
  await page.fill('[data-testid="tb-nickname"]', 'Draft')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(400)
  check(
    'typing in the form does NOT write to the store',
    (await nickOf('b1')) === 'Original',
    `stored nickname is "${await nickOf('b1')}"`,
  )
  check(
    'and the screen says so, since there is no Save button to press',
    (await page.$$('[data-testid="tb-dirty-note"]')).length === 1,
  )

  // ---- back is a save point
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(400)
  check(
    'leaving by the back control saves the draft',
    (await nickOf('b1')) === 'Draft',
    `stored nickname is "${await nickOf('b1')}"`,
  )

  // ---- the GLOBAL nav bar is a save point too, which was logged debt
  await openBuild('b1')
  await page.fill('[data-testid="tb-nickname"]', 'ViaGlobalNav')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(300)
  /* Out of the module entirely, by the app bar -- the route that used to drop
     the edit on the floor. Pokepedia's tab opens a dropdown; picking any entry
     in it unmounts Team Building, which is the case under test. */
  await page.hover('[data-testid="nav-tab-pokepedia"]')
  await page.waitForSelector('[data-testid="nav-dropdown-pokepedia"]', { state: 'visible' })
  await page.click('[data-testid="nav-dropdown-pokepedia"] button')
  await page.waitForTimeout(900)
  const afterGlobalNav = await nickOf('b1')
  check(
    'leaving through the GLOBAL app nav bar saves it as well',
    afterGlobalNav === 'ViaGlobalNav',
    `stored nickname is "${afterGlobalNav}"`,
  )

  // ---- adding a member from the rail saves the build you were on
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Original' })],
    teams: [mkTeam('t1', 1, ['b1'])],
  })
  await openBuild('b1')
  await page.fill('[data-testid="tb-nickname"]', 'SavedByAdd')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="tb-rail-add"]')
  await page.waitForTimeout(700)
  check(
    'adding a member from the right rail saves the build you were editing',
    (await nickOf('b1')) === 'SavedByAdd',
    `stored nickname is "${await nickOf('b1')}"`,
  )

  // ---- duplicate saves the original, copies the EDIT, and lands on the copy
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Original' })],
    teams: [],
  })
  await openBuild('b1')
  await page.fill('[data-testid="tb-nickname"]', 'Edited')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(300)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-duplicate"]')
  await page.waitForTimeout(800)
  const dupStore = await readStore()
  const landedOn = await page.getAttribute('[data-testid="tb-build-form"]', 'data-build-id')
  log(`  after duplicate: ${dupStore.builds.map((b) => `${b.id}:${b.nickname}`).join(' ')}`)
  check(
    'duplicating saves the original with the edit, and the copy carries it too',
    dupStore.builds.length === 2 &&
      dupStore.builds.find((b) => b.id === 'b1').nickname === 'Edited' &&
      dupStore.builds.filter((b) => b.nickname === 'Edited').length === 2,
    dupStore.builds.map((b) => `${b.id}:${b.nickname}`).join(' '),
  )
  check(
    'and the form switches to the COPY, not the original',
    landedOn !== null && landedOn !== 'b1',
    `landed on ${landedOn}`,
  )

  // ---- reset is confirmed and destructive, so it writes straight through
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Original', level: 77 })],
    teams: [],
  })
  await openBuild('b1')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-reset"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(600)
  const afterReset2 = (await readStore()).builds.find((b) => b.id === 'b1')
  check(
    'Reset writes immediately rather than leaving a reset sitting in the draft',
    afterReset2.nickname === '' && afterReset2.level === 1,
    `nickname="${afterReset2.nickname}" level=${afterReset2.level}`,
  )

  // ---- delete must not be resurrected by the unmount flush
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', { speciesId: 6, pokemonId: 6, nickname: 'Doomed' }),
      mkBuild('b2', { speciesId: 9, pokemonId: 9 }),
    ],
    teams: [],
  })
  await openBuild('b1')
  await page.fill('[data-testid="tb-nickname"]', 'EditedThenDeleted')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(300)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-delete"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(700)
  const afterDelete = await readStore()
  check(
    'deleting an EDITED build does not resurrect it through the unmount flush',
    !afterDelete.builds.some((b) => b.id === 'b1'),
    afterDelete.builds.map((b) => b.id).join(',') || 'none',
  )

  // ---- discard on a shared build leaves the store alone
  await seedStore({
    nextBuildSeq: 4,
    nextTeamSeq: 3,
    builds: [mkBuild('b3', { speciesId: 25, pokemonId: 25, nickname: 'SharedOriginal' })],
    teams: [mkTeam('t1', 1, ['b3']), mkTeam('t2', 2, ['b3'])],
  })
  await openBuild('b3')
  await page.fill('[data-testid="tb-nickname"]', 'ShouldVanish')
  await page.click('[data-testid="tb-level"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(500)
  await page.click('[data-testid="tb-shared-discard"]')
  await page.waitForTimeout(700)
  check(
    'Discard on a shared build leaves the original untouched, flush included',
    (await nickOf('b3')) === 'SharedOriginal',
    `stored nickname is "${await nickOf('b3')}"`,
  )

  // =====================================================================
  /*
    6. HIDDEN POWER — the pure formula, driven with MIXED spreads.

    THE MAXED SPREAD IS THE ONE CASE THAT CANNOT FAIL, which is exactly why this
    section exists. Gen 2's power formula weights the high bit of each DV
    (Attack 8, Defense 4, Speed 2, Special 1); those weights were once reversed in
    the implementation and every well-known reference case still passed, because
    reversing them is a permutation and is invisible whenever the four high bits
    are equal. All-15 DVs gave Dark 70 either way. So do Bulbapedia's own worked
    examples. The cases below are chosen so that they DIFFER: four of them set
    exactly one high bit, which isolates one stat's weight per case.

    Expected values come from Bulbapedia's Hidden Power/Calculation page and are
    corroborated by pret/pokecrystal engine/battle/hidden_power.asm -- never from
    this app's own output, which would make the test circular.
  */
  hr('6. HIDDEN POWER — mixed DV/IV spreads, not just the maxed one')
  const STAT_MATH_URL = '/pokeapp/src/modules/team-builder/statMath.ts'
  const hiddenPowerCases = [
    { gen: 2, dvs: [15, 15, 15, 15], type: 'dark', power: 70, note: 'maxed — the old anchor' },
    { gen: 2, dvs: [10, 10, 13, 8], type: 'grass', power: 68, note: "Bulbapedia's Shellder" },
    { gen: 2, dvs: [15, 0, 0, 0], type: 'psychic', power: 51, note: 'Attack high bit alone (8)' },
    { gen: 2, dvs: [0, 15, 0, 0], type: 'ground', power: 41, note: 'Defense high bit alone (4)' },
    { gen: 2, dvs: [0, 0, 15, 0], type: 'fighting', power: 36, note: 'Speed high bit alone (2)' },
    { gen: 2, dvs: [3, 0, 0, 15], type: 'psychic', power: 35, note: 'Special high bit alone (1)' },
    { gen: 2, dvs: [15, 13, 15, 6], type: 'ice', power: 67, note: 'realistic mixed spread' },
  ]
  /* Gen 3-4 was verified correct and is NOT being changed -- these lock it down so
     a future edit to this function cannot quietly break the other branch. */
  const hiddenPowerIvCases = [
    { gen: 4, ivs: [25, 2, 12, 17, 5, 8], type: 'bug', power: 31, note: "Bulbapedia's Unown" },
    { gen: 4, ivs: [31, 30, 30, 31, 31, 31], type: 'ice', power: 70, note: 'canonical HP Ice 70' },
    { gen: 3, ivs: [31, 31, 31, 31, 31, 31], type: 'dark', power: 70, note: 'all-31 maximum' },
  ]
  const hpResults = await page.evaluate(
    async ([url, dvCases, ivCases]) => {
      const { hiddenPower } = await import(url)
      return {
        dv: dvCases.map((c) => {
          const [attack, defense, speed, special] = c.dvs
          return hiddenPower(c.gen, { attack, defense, speed, special })
        }),
        iv: ivCases.map((c) => {
          const [hp, attack, defense, speed, spa, spd] = c.ivs
          return hiddenPower(c.gen, {
            hp,
            attack,
            defense,
            speed,
            'special-attack': spa,
            'special-defense': spd,
          })
        }),
      }
    },
    [STAT_MATH_URL, hiddenPowerCases, hiddenPowerIvCases],
  )
  hiddenPowerCases.forEach((c, i) => {
    const got = hpResults.dv[i]
    check(
      `Gen ${c.gen} DVs ${c.dvs.join('/')} → ${c.type} ${c.power}  (${c.note})`,
      got.type === c.type && got.power === c.power,
      `got ${got.type} ${got.power}`,
    )
  })
  hiddenPowerIvCases.forEach((c, i) => {
    const got = hpResults.iv[i]
    check(
      `Gen ${c.gen} IVs ${c.ivs.join('/')} → ${c.type} ${c.power}  (${c.note})`,
      got.type === c.type && got.power === c.power,
      `got ${got.type} ${got.power}`,
    )
  })

  // =====================================================================
  /*
    7. LAYOUT — reachability at a short viewport, and the inspector.

    "IT DOES NOT FIT" IS NOT THE FAILURE. The app pins #root to the viewport and
    `.panel` sets `overflow: hidden`, so a module that is too tall does not grow
    a scrollbar -- it is silently CLIPPED, and the bottom of the form becomes
    unreachable rather than merely below the fold. That shipped once and was
    found by eye on a phone. The check is therefore not "the form is short
    enough" (which depends on the window, and would fail on a laptop while
    passing here) but "everything in it can still be reached".
  */
  hr('7. LAYOUT — nothing is unreachable, and the inspector reports real regions')
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    /* HOLDING AN ITEM, because the `item` area only exists when there is one to
       draw -- Gen 1 and an empty hand render no badge at all, by design. */
    builds: [mkBuild('b1', { speciesId: 197, pokemonId: 197, itemId: 234 })],
    teams: [],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  check(
    'the seeded build really is holding an item, so the `item` area exists',
    (await page.$$('[data-testid="tb-held-item"]')).length === 1,
  )

  /* Deliberately cruel: shorter than any real laptop, so the form MUST overflow
     and the scroll area is the only thing that can save it. */
  await page.setViewportSize({ width: 1440, height: 620 })
  await page.waitForTimeout(400)
  const scrollState = await page.evaluate(() => {
    const area = document.querySelector('[data-testid="tb-scroll"]')
    if (!area) return null
    return { scrollHeight: area.scrollHeight, clientHeight: area.clientHeight }
  })
  check(
    'the Build Form sits in a scroll area rather than being clipped by .panel',
    scrollState !== null && scrollState.scrollHeight > scrollState.clientHeight,
    scrollState
      ? `${scrollState.scrollHeight} content / ${scrollState.clientHeight} visible`
      : 'no scroll area',
  )

  /* The last thing on the page, at the bottom of the tallest column. If this can
     be scrolled into view, so can everything above it. */
  await page.evaluate(() => {
    const area = document.querySelector('[data-testid="tb-scroll"]')
    if (area) area.scrollTop = area.scrollHeight
  })
  await page.waitForTimeout(400)
  const lastVisible = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tb-stat-sum"]')
    const area = document.querySelector('[data-testid="tb-scroll"]')
    if (!el || !area) return null
    const r = el.getBoundingClientRect()
    const a = area.getBoundingClientRect()
    return { inside: r.bottom <= a.bottom + 1 && r.top >= a.top - 1, top: Math.round(r.top) }
  })
  check(
    'and scrolling to the end really does reach the bottom of the tallest column',
    lastVisible !== null && lastVisible.inside,
    JSON.stringify(lastVisible),
  )
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.waitForTimeout(300)

  /*
    THE INSPECTOR IS SHIPPED CODE, so it gets a check like anything else. It
    reads `grid-template-areas` out of the computed style, which means a passing
    check here also proves those area names really are what the stylesheet says.
  */
  await page.goto(`${APP_URL}?layout=1`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(700)
  const regions = await page.$$eval('.layout-overlay-label', (els) =>
    els.map((e) => (e.textContent ?? '').split(' ')[0]),
  )
  log(`  regions: ${regions.join(', ')}`)
  check(
    '?layout=1 names the form regions, including the artwork grid areas',
    ['form-grid', 'identity', 'identity-art', 'main', 'rail', 'dex', 'kana', 'shiny', 'item'].every(
      (n) => regions.includes(n),
    ),
    regions.join(','),
  )
  check(
    'and the overlay is inert — it never intercepts a click',
    (await page.evaluate(
      () => getComputedStyle(document.querySelector('.layout-overlay')).pointerEvents,
    )) === 'none',
  )
  /* Back to a clean page so the conventions section is not inspecting the tool. */
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="boot-status"]', { timeout: 60000 })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')

  // =====================================================================
  hr('CONVENTIONS — across the whole module')
  const savey = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => (b.textContent ?? '').trim().toLowerCase())
      .filter((t) => t === 'save' || t === 'edit' || t === 'cancel'),
  )
  check(
    'no bare Save / Edit / Cancel button on the Build Form',
    savey.length === 0,
    savey.join(','),
  )

  const shadowed = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-tb], .tb-card, .tb-modal, .tb-popover')].filter(
        (el) => getComputedStyle(el).boxShadow !== 'none',
      ).length,
  )
  check('nothing in the module carries a box-shadow', shadowed === 0, `${shadowed} elements`)

  const badged = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-ds="type-label"]')].filter((el) => {
        const s = getComputedStyle(el)
        return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
      }).length,
  )
  check('type labels are coloured text with no fill (no badges)', badged === 0, `${badged}`)

  const realErrors = consoleErrors.filter(
    (e) => !/raw\.githubusercontent|objects\.githubusercontent|ERR_|favicon/.test(e),
  )
  check('no console or page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  hr(failures.length ? `FAILED — ${failures.length} check(s)` : 'ALL CHECKS PASSED')
  for (const f of failures) log(`  - ${f}`)
} finally {
  if (browser) await browser.close()
  dev.stop()
}

process.exit(failures.length ? 1 : 0)
