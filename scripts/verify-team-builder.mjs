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
    'the dropdown lists New Team, New Build, Team Library, Build Library',
    /* "Team Library", to sit beside "Build Library" -- the nav ID underneath is
       still `my-teams`, because an ID is a key and not a caption. */
    JSON.stringify(tbLabels.slice(0, 4)) ===
      JSON.stringify(['New Team', 'New Build', 'Team Library', 'Build Library']),
    tbLabels.join(','),
  )
  await page.click('[data-testid="nav-my-teams"]')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  check('the Team Library is a real screen, not the stub placeholder', true)

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
    /*
      NOT AN EMPTY TEAM ANY MORE. Empty teams are pruned when the module mounts,
      and seedStore reloads the page -- so a `[]` here was deleted before the
      first assertion could run. b2 sits in slot 3 rather than slot 1, which
      leaves slot 1 as the first empty one and keeps this section testing what it
      always tested: placing a build into the team's next free slot.
    */
    teams: [mkTeam('t1', 1, [null, null, 'b2'])],
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
    ---- WAIT FOR THE LEGAL MOVESET FIRST.

    Everything below reads the move <select>s, and a <select> can only show a
    value that is present as an option -- so until getLegalMoveset resolves,
    every slot reads as empty whether it holds a move or not. Without this the
    next three checks race the fetch and fail roughly one run in five, with the
    seeded moveset reported as blank.
  */
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="tb-move-select-0"] option').length > 5,
  )

  /*
    ---- no slot offers a move another slot already holds

    THE SELECTED MOVE MUST SURVIVE ITS OWN FILTER, and that is the half worth
    testing. Filtering out everything taken removes the slot's own move too,
    which leaves a <select> whose value matches no option -- browsers then fall
    back to displaying the first option, so the slot reads as empty while the
    build still holds the move. So this asserts both directions at once: each
    slot lists its own move, and lists none of the other three.
  */
  const dupes = await page.evaluate(() => {
    const selects = [...document.querySelectorAll('[data-testid^="tb-move-select-"]')]
    const chosen = selects.map((sel) => sel.value).filter((v) => v !== '')
    return selects.map((sel, i) => {
      const opts = [...sel.options].map((o) => o.value)
      const mine = sel.value
      return {
        slot: i,
        listsItsOwn: mine === '' || opts.includes(mine),
        listsOthers: chosen.filter((v) => v !== mine && opts.includes(v)),
      }
    })
  })
  log(
    `  per slot: ${dupes.map((d) => `${d.slot}:own=${d.listsItsOwn} leaks=${d.listsOthers.length}`).join(' ')}`,
  )
  check(
    'a move chosen in one slot is gone from the other three dropdowns',
    dupes.length === 4 && dupes.every((d) => d.listsOthers.length === 0),
    JSON.stringify(dupes.map((d) => d.listsOthers)),
  )
  check(
    'and each slot still lists its OWN move, so the <select> keeps showing it',
    dupes.every((d) => d.listsItsOwn),
    JSON.stringify(dupes.map((d) => d.listsItsOwn)),
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

  /*
    ---- the nickname is capped at the in-game limit

    ATTRIBUTE **AND** STORED VALUE. `maxLength` alone would pass a check that
    only typed into the field, because the browser enforces it during input --
    so this asserts what actually reached the store as well, which is what the
    slice in `commit` is for.
  */
  await page.fill('[data-testid="tb-nickname"]', 'ABCDEFGHIJKLMNOP')
  const nickAttr = await page.getAttribute('[data-testid="tb-nickname"]', 'maxlength')
  const nickTyped = await page.inputValue('[data-testid="tb-nickname"]')
  log(`  nickname: maxlength=${nickAttr} typed="${nickTyped}" (${nickTyped.length})`)
  check(
    'the nickname field caps at 10 characters, the in-game limit',
    nickAttr === '10' && nickTyped.length === 10,
    `maxlength=${nickAttr} value="${nickTyped}"`,
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
    'reset clears item, moves, friendship, nickname, spread and shiny, and puts level back to 1',
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

  /*
    ---- the right rail shows the team's REAL members, the open one included

    IT USED TO FILTER THE OPEN BUILD OUT, which turned a team of three into a
    rail of two and left no way to see where in the team you were. The open one
    is now present and MARKED, and carries no open handler at all -- clicking it
    is a no-op rather than a navigation to where you already are.

    Scoped to the card marker because each rail member also carries a delete
    control whose testid starts with the same prefix.
  */
  const railIds = await page.$$eval('[data-tb="member-card"][data-testid^="tb-rail-b"]', (els) =>
    els.map((e) => e.dataset.buildId),
  )
  check(
    "the right rail lists the attached team's actual members, the open one included",
    JSON.stringify(railIds) === JSON.stringify(['b1', 'b3']),
    railIds.join(','),
  )
  const currentCard = await page.evaluate(() => {
    const el = document.querySelector('[data-tb="member-card"][data-current="true"]')
    if (!el) return null
    return {
      id: el.dataset.buildId,
      /* A <span>, not a <button>: see MemberCard's rail branch. */
      openTag: el.querySelector('.tb-card-rail-open')?.tagName,
      buttons: el.querySelectorAll('.tb-card-rail-open button, button.tb-card-rail-open').length,
    }
  })
  check(
    'the member open in the form is marked, and is not a control at all',
    currentCard?.id === 'b1' && currentCard?.openTag === 'SPAN',
    JSON.stringify(currentCard),
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
  await page.fill('[data-testid="tb-nickname"]', 'ViaNavBar')
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
    afterGlobalNav === 'ViaNavBar',
    `stored nickname is "${afterGlobalNav}"`,
  )

  /*
    ---- adding a member from the rail ASKS, it no longer commits silently

    THIS CHECK USED TO ASSERT THE OPPOSITE, and the reversal was requested: the
    rail is where the reader chooses what happens to an edit, because the edit
    could go to the member they are leaving, be thrown away, or -- when the
    destination is an empty slot -- follow them to the new member. Silently
    saving picked one of those three for them.
  */
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
  await page.waitForSelector('[data-testid="tb-rail-add-modal"]')
  await page.click('[data-testid="tb-rail-add-new"]')
  await page.waitForSelector('[data-testid="tb-rail-switch-prompt"]')
  check(
    'adding a member from the right rail asks what happens to the edit rather than deciding',
    (await nickOf('b1')) === 'Original',
    `stored nickname is still "${await nickOf('b1')}"`,
  )
  await page.click('[data-testid="tb-rail-switch-save"]')
  await page.waitForTimeout(700)
  check(
    'and "Save this member first" is what writes it',
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
  await page.fill('[data-testid="tb-nickname"]', 'EditedThen')
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
  await page.fill('[data-testid="tb-nickname"]', 'Vanishes')
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
    'the seeded build really is holding an item, so the badge renders',
    (await page.$$('[data-testid="tb-held-item"]')).length === 1,
  )

  /* Deliberately cruel, and it has to STAY cruel: the form has been tightened
     twice since this was written and at 620px it now simply fits, which made
     this assert the opposite of what it means. 420 is shorter than any real
     window and guarantees the overflow the scroll area exists to absorb. */
  await page.setViewportSize({ width: 1440, height: 420 })
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
    /* No `item`: the held badge stopped being a grid area when it moved inside
       .tb-sprite-frame to sit on the artwork's own corner. It is positioned
       against that frame now, not placed in a track. */
    ['form-grid', 'identity', 'identity-art', 'main', 'rail', 'dex', 'kana', 'shiny'].every((n) =>
      regions.includes(n),
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
  /*
    8. COVERAGE, TOOLTIPS AND THE RAIL — the panels with real logic in them.

    THE MOVESET RULE IS THE POINT OF THIS SECTION. Attacking coverage counts a
    move only if it deals type-scaled damage, which rules out status moves AND
    fixed-damage ones: Seismic Toss is a physical Fighting move that deals a flat
    number, so counting it as Fighting coverage would promise a super-effective
    hit that cannot happen. The build below carries exactly one of each -- two
    real attacks, one status, one fixed-damage -- so a suite that got the rule
    wrong in either direction fails here rather than looking plausible.
  */
  hr('8. COVERAGE, TOOLTIPS AND THE RAIL')
  const moveIds2 = await page.evaluate(async () => {
    const d = await import('/pokeapp/src/data/index.ts')
    const m = {}
    for (const x of d.listMoves()) m[x.name] = x.id
    const it = {}
    for (const x of d.listItems()) it[x.name] = x.id
    return {
      razorLeaf: m['razor-leaf'],
      sludgeBomb: m['sludge-bomb'],
      toxic: m['toxic'],
      seismicToss: m['seismic-toss'],
      leftovers: it['leftovers'],
    }
  })
  await seedStore({
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', {
        speciesId: 1,
        pokemonId: 1,
        itemId: moveIds2.leftovers,
        abilityId: 65,
        moveIds: [moveIds2.razorLeaf, moveIds2.sludgeBomb, moveIds2.toxic, moveIds2.seismicToss],
      }),
      /* HOLDING AN ITEM ON PURPOSE: b2 is the build that appears in the rail
         while b1 is open, and the badge checks below are about the rail. */
      mkBuild('b2', { speciesId: 4, pokemonId: 4, itemId: moveIds2.leftovers }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(500)

  // ---- the stat table gained a Base column and the BST
  const statHeads = await page.$$eval('.tb-stat-head', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'the stat table is headed Stat | Base | Total',
    JSON.stringify(statHeads) === JSON.stringify(['Stat', 'Base', 'Total']),
    statHeads.join(' | '),
  )
  const bst = await page.textContent('[data-testid="tb-stat-bst"]')
  check(
    'the BST is the sum of the BASE column, not of the computed one',
    /* Bulbasaur: 45+49+49+65+65+45. The computed total differs at every level,
       which is exactly why both are shown. */
    bst.trim() === '318',
    `BST reads ${bst.trim()}`,
  )

  // ---- attacking coverage counts only type-scaled damage
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-offence"]')
  await page.waitForSelector('[data-testid="tb-form-offence-popover"]')
  const offence = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-offense"]')
    return {
      note: scope.querySelector('.tb-matchup-ignored')?.textContent?.trim() ?? '',
      brought: [...scope.querySelectorAll('.tb-matchup-note [data-ds="type-label"]')].map(
        (e) => e.dataset.type,
      ),
      cols: [...scope.querySelectorAll('.tb-matchup-col')].map((c) => ({
        label: c.querySelector('.tb-matchup-label').textContent.trim(),
        tiers: [...c.querySelectorAll('.tb-matchup-tier')].map((t) => ({
          mult: t.querySelector('.tb-matchup-mult').textContent.trim(),
          types: [...t.querySelectorAll('[data-ds="type-label"]')].map((x) => x.dataset.type),
        })),
      })),
    }
  })
  log(`  brought: ${offence.brought.join(',')} · ${offence.note}`)
  check(
    'attacking coverage counts Razor Leaf and Sludge Bomb, and ignores Toxic (status) and Seismic Toss (fixed damage)',
    JSON.stringify([...offence.brought].sort()) === JSON.stringify(['grass', 'poison']) &&
      offence.note === '2 of 4 moves counted',
    `${offence.brought.join(',')} | ${offence.note}`,
  )
  const hits = offence.cols.find((c) => c.label === 'Hits hard')
  check(
    'and it reports the BEST multiplier per defending type, not a sum',
    /* Grass hits Ground/Rock/Water for 2x and Poison hits Grass for 2x. Nothing
       here reaches 4x, because one move cannot be two types. */
    hits != null &&
      hits.tiers.length === 1 &&
      hits.tiers[0].mult === '2x' &&
      ['grass', 'ground', 'rock', 'water'].every((t) => hits.tiers[0].types.includes(t)),
    JSON.stringify(hits),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- the defensive panel splits its tiers
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-matchup"]')
  await page.waitForSelector('[data-testid="tb-form-matchup-popover"]')
  const defence = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-species"]')
    const cols = [...scope.querySelectorAll('.tb-matchup-col')]
    return {
      /* One distinct y per group is what stacking means. Two groups sharing a
         y would be the old side-by-side layout. */
      stacked:
        new Set(cols.map((c) => Math.round(c.getBoundingClientRect().y))).size === cols.length,
      cols: cols.map((c) => ({
        label: c.querySelector('.tb-matchup-label').textContent.trim(),
        tiers: [...c.querySelectorAll('.tb-matchup-tier')].map((t) =>
          t.querySelector('.tb-matchup-mult').textContent.trim(),
        ),
      })),
    }
  })
  log(`  ${defence.cols.map((c) => `${c.label}[${c.tiers.join(' ')}]`).join('  ')}`)
  const resists = defence.cols.find((c) => c.label === 'Resists')
  check(
    'the defensive panel splits Resists into its own 0.25x and 0.5x tiers, best first',
    resists != null && JSON.stringify(resists.tiers) === JSON.stringify(['0.25x', '0.5x']),
    JSON.stringify(resists),
  )
  check(
    'and the groups stack vertically rather than sitting side by side',
    defence.cols.length > 1 && defence.stacked,
    JSON.stringify(defence.cols.map((c) => c.label)),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- natures say what they do
  const natures = await page.$$eval('[data-testid="tb-nature"] option', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'every nature option carries its stat change, neutral ones included',
    natures.includes('Adamant (+Atk -SpA)') &&
      natures.includes('Modest (+SpA -Atk)') &&
      natures.includes('Hardy (—)'),
    natures.slice(1, 4).join(' | '),
  )

  // ---- info tips exist and carry real facts
  const tip = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tb-move-info-0"] .tb-infotip-panel')
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
  })
  log(`  move tip: ${tip}`)
  check(
    "the move tooltip carries the selected move's power, PP and accuracy",
    tip != null &&
      /Razor Leaf/.test(tip) &&
      /Power 55/.test(tip) &&
      /PP 25/.test(tip) &&
      /Acc 95%/.test(tip),
    tip ?? 'absent',
  )
  check(
    'and the item and ability fields have one too',
    (await page.$$('[data-testid="tb-item-info"]')).length === 1 &&
      (await page.$$('[data-testid="tb-ability-info"]')).length === 1,
  )
  const tipHidden = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector('[data-testid="tb-move-info-0"] .tb-infotip-panel'))
        .display,
  )
  check('the tooltip is hidden until hovered', tipHidden === 'none', tipHidden)

  // ---- the rail delete offers three answers, and each does what it says
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-0-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  check(
    'each rail member carries a delete control',
    (await page.$$('[data-testid="tb-rail-b2-delete"]')).length === 1,
  )

  /*
    ---- the artwork stays inside its own box

    THIS IS A SPECIFICITY REGRESSION GUARD, not a layout preference. The badge
    is `.tb-held-item { position: absolute }` at 0-1-0, and it lives inside a
    box styled by `.tb-card-art img` at 0-1-1 -- which matched it too and won,
    so the badge computed `relative`, stayed IN FLOW, and laid out BESIDE the
    artwork: 38 + 18 of content centred in a 38px box, hanging 9px off each
    side. The left 9px was clipped by the rail's edge and read as "the sprite
    is cut off". Asserting the computed `position` catches the cause; asserting
    the artwork's own box catches any other way it could end up outside.
  */
  const railArt = await page.evaluate(() =>
    [...document.querySelectorAll('[data-layout="rail"] .tb-card-art')].map((art) => {
      const a = art.getBoundingClientRect()
      const img = art.querySelector('img:not(.tb-held-item)')
      const held = art.querySelector('.tb-held-item')
      const i = img?.getBoundingClientRect()
      return {
        overflowLeft: i ? +(a.x - i.x).toFixed(1) : 0,
        overflowRight: i ? +(i.right - a.right).toFixed(1) : 0,
        heldPosition: held ? getComputedStyle(held).position : null,
      }
    }),
  )
  log(`  rail art: ${JSON.stringify(railArt)}`)
  check(
    "a rail member's artwork sits inside its own box, not hanging off either edge",
    railArt.length > 0 && railArt.every((a) => a.overflowLeft <= 0.5 && a.overflowRight <= 0.5),
    JSON.stringify(railArt.map((a) => [a.overflowLeft, a.overflowRight])),
  )
  const badges = railArt.filter((a) => a.heldPosition != null)
  check(
    'and the held-item badge is positioned OUT OF FLOW, so it overlaps rather than displaces',
    /* The length test is what stops this passing on an empty set -- the seed
       above puts an item on the rail member precisely so it cannot. */
    badges.length > 0 && badges.every((a) => a.heldPosition === 'absolute'),
    JSON.stringify(railArt.map((a) => a.heldPosition)),
  )
  await page.hover('[data-testid="tb-rail-b2"]')
  await page.click('[data-testid="tb-rail-b2-delete"]')
  await page.waitForSelector('[data-testid="tb-rail-remove-prompt"]')
  const removeOptions = await page.$$eval(
    '[data-testid="tb-rail-remove-prompt"] .tb-prompt-actions button',
    (els) => els.map((e) => e.textContent.trim()),
  )
  check(
    'removing a member asks: cancel, remove but keep the build, or delete it entirely',
    removeOptions.length === 3 &&
      /Cancel/i.test(removeOptions[0]) &&
      /keep the build/i.test(removeOptions[1]) &&
      /Delete the build/i.test(removeOptions[2]),
    removeOptions.join(' | '),
  )
  await page.click('[data-testid="tb-rail-remove-keep"]')
  await page.waitForTimeout(500)
  const afterKeep = await readStore()
  check(
    '"remove, keep the build" empties the slot and leaves the build in the library',
    afterKeep.teams[0].memberIds.filter((m) => m === 'b2').length === 0 &&
      afterKeep.builds.some((b) => b.id === 'b2'),
    `slots=${afterKeep.teams[0].memberIds.join(',')} builds=${afterKeep.builds.map((b) => b.id).join(',')}`,
  )

  // =====================================================================
  /*
    8b. THE RAIL HAS TO FIT THE COLUMN BESIDE IT.

    A FULL TEAM IS THE ONLY CASE WORTH MEASURING. Five members always fitted;
    six did not, and the rail then became the tallest column on the screen and
    made the whole page scroll -- for a form that is otherwise 420px tall. The
    checks here are the three separate causes that had to be fixed together:

      the LEADING -- these lines inherited an absolute 26.1px from the page, so
      an 11px label sat in a 26px line box and three of them made a 91px card;
      the BADGE -- one rule set `height: 64px` on the rail's held item and its
      width alone stayed 34px, so it was neither square nor small, and ran from
      24px above the sprite to 2px below it;
      the LABEL -- the team's id trailed the last card, which left it hanging
      below the left column however tightly the cards were set.

    ASSERTED AGAINST THE STAT TABLE'S TOTAL ROW, not against a pixel height. A
    height would only be true on the machine that measured it; "the band of
    cards ends where the column beside it ends" is the actual requirement and
    survives a different window.
  */
  hr('8b. THE RAIL FITS THE COLUMN')
  await seedStore({
    nextBuildSeq: 8,
    nextTeamSeq: 2,
    builds: [
      /* SIX, and the fourth is the worst case: an item, a nature, an ability
         and a three-stat spread, so it is the tallest and widest card. */
      mkBuild('r1', { speciesId: 7, pokemonId: 7, abilityId: 67, level: 52 }),
      mkBuild('r2', { speciesId: 1, pokemonId: 1, abilityId: 65 }),
      mkBuild('r3', { speciesId: 4, pokemonId: 4, abilityId: 66 }),
      mkBuild('r4', {
        speciesId: 3,
        pokemonId: 3,
        abilityId: 66,
        natureId: 3,
        itemId: moveIds2.leftovers,
        effort: { hp: 252, 'special-attack': 84, 'special-defense': 132 },
      }),
      mkBuild('r5', { speciesId: 2, pokemonId: 2, abilityId: 65 }),
      mkBuild('r6', { speciesId: 5, pokemonId: 5, abilityId: 66 }),
    ],
    teams: [mkTeam('t1', 1, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-r1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForSelector('[data-testid="tb-rail-r6"]')
  await page.waitForTimeout(400)

  const density = await page.evaluate(async () => {
    await document.fonts.ready
    const round = (n) => +n.toFixed(1)
    const cards = [...document.querySelectorAll('.tb-card-rail')]
    const rail = document.querySelector('[data-layout="rail"]')
    const label = document.querySelector('.tb-rail-team')
    const total = document.querySelector('.tb-stat-total-row')
    const lines = [...cards[3].querySelectorAll('.tb-rail-line')]
    /* Cap height, measured -- the only way to compare a mono against a sans.
       Both are set at 11px nominally and the mono draws a size larger. */
    const c = document.createElement('canvas').getContext('2d')
    const capOf = (el) => {
      const cs = getComputedStyle(el)
      c.font = `${cs.fontSize} ${cs.fontFamily}`
      return round(c.measureText('H').actualBoundingBoxAscent)
    }
    const frame = cards[3].querySelector('.tb-card-frame').getBoundingClientRect()
    const held = cards[3].querySelector('.tb-held-item')
    const hb = held.getBoundingClientRect()
    return {
      count: cards.length,
      heights: cards.map((x) => round(x.getBoundingClientRect().height)),
      lineBoxes: lines.map((l) => round(l.getBoundingClientRect().height)),
      fontSizes: lines.map((l) => getComputedStyle(l).fontSize),
      caps: lines.map(capOf),
      labelFirst: rail.firstElementChild === label,
      railBottom: round(rail.getBoundingClientRect().bottom),
      lastCardBottom: round(cards.at(-1).getBoundingClientRect().bottom),
      totalRowBottom: round(total.getBoundingClientRect().bottom),
      badge: {
        w: round(hb.width),
        h: round(hb.height),
        /* Distance from the badge's corner to the PICTURE's corner. */
        dx: round(hb.right - frame.right),
        dy: round(hb.bottom - frame.bottom),
        frame: round(frame.width),
      },
      /* No "Stats" title, but the column headings are still there. */
      statsBlockOwnLabel: document.querySelectorAll('.tb-stats-block .tb-field-label').length,
      statHeads: [...document.querySelectorAll('.tb-stat-head')].map((e) => e.textContent.trim()),
    }
  })
  log(`  cards: ${density.heights.join(', ')}`)
  log(`  line boxes: ${density.lineBoxes.join(', ')} at ${density.fontSizes.join(', ')}`)
  log(`  caps: ${density.caps.join(', ')}`)
  log(
    `  last card bottom ${density.lastCardBottom} vs Total row ${density.totalRowBottom}` +
      ` (rail bottom ${density.railBottom})`,
  )
  log(`  badge: ${JSON.stringify(density.badge)}`)

  check(
    'a full team draws six rail cards, all the same height',
    density.count === 6 && new Set(density.heights).size === 1,
    `${density.count} cards: ${[...new Set(density.heights)].join('/')}`,
  )
  check(
    "the three rows of a card share one line box, and it is the module's tight leading not the page's 26px",
    new Set(density.lineBoxes).size === 1 && density.lineBoxes[0] <= 18,
    density.lineBoxes.join(','),
  )
  check(
    'the spread is set SMALLER than the two label lines above it, because the mono draws larger',
    /* The point is the nominal sizes DIFFER while the drawn size does not. A
       spread at the label's own 11px was visibly a size up from its own card. */
    parseFloat(density.fontSizes[2]) < parseFloat(density.fontSizes[0]),
    density.fontSizes.join(' / '),
  )
  check(
    'and it therefore RENDERS at the same size: cap heights within a pixel',
    Math.abs(density.caps[2] - density.caps[0]) <= 1,
    `sans ${density.caps[0]} vs mono ${density.caps[2]}`,
  )
  check(
    'the held-item badge is SQUARE and clearly subordinate to the sprite, not taller than it',
    density.badge.w === density.badge.h && density.badge.h <= density.badge.frame / 2,
    `${density.badge.w}x${density.badge.h} on a ${density.badge.frame}px frame`,
  )
  check(
    "and it hangs off the PICTURE's bottom-right corner, the same structure the identity panel uses",
    Math.abs(density.badge.dx) <= 6 && Math.abs(density.badge.dy) <= 6,
    `dx=${density.badge.dx} dy=${density.badge.dy}`,
  )
  check(
    "the team's id HEADS the rail rather than trailing the last card",
    density.labelFirst && density.railBottom === density.lastCardBottom,
    `label first: ${density.labelFirst}, rail bottom ${density.railBottom} vs last card ${density.lastCardBottom}`,
  )
  check(
    "six cards end level with the stat table's Total row",
    Math.abs(density.lastCardBottom - density.totalRowBottom) <= 4,
    `${density.lastCardBottom} vs ${density.totalRowBottom}`,
  )
  check(
    'the stat block carries no "Stats" title over the header row that already says Stat',
    density.statsBlockOwnLabel === 0 &&
      JSON.stringify(density.statHeads) === JSON.stringify(['Stat', 'Base', 'Total']),
    `${density.statsBlockOwnLabel} title(s), heads ${density.statHeads.join('|')}`,
  )

  /*
    ---- and the rail is no longer what makes the page scroll

    THE CAUSE, NOT THE SYMPTOM. The form's main column is about 420px; the rail
    at six 91px cards was 594, so it was the tallest thing in the grid and the
    page's height was the rail's height. Asserting "no overflow" alone would
    pass on a tall window, so this asserts the rail is not the tallest column
    AND drives a short one.
  */
  const columns = await page.evaluate(() => {
    const h = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().height)
    return { rail: h('[data-layout="rail"]'), main: h('[data-layout="main"]') }
  })
  log(`  columns: rail ${columns.rail}, main ${columns.main}`)
  check(
    'the rail is no longer the tallest column, so the page height is the form and not the rail',
    columns.rail <= columns.main,
    `rail ${columns.rail} vs main ${columns.main}`,
  )
  const shortViewport = await (async () => {
    const before = page.viewportSize()
    await page.setViewportSize({ width: 1600, height: 720 })
    await page.waitForTimeout(200)
    const out = await page.evaluate(() => {
      const sc = document.querySelector('.scroll-area')
      const cards = [...document.querySelectorAll('.tb-card-rail')]
      const last = cards.at(-1).getBoundingClientRect()
      return {
        overflow: sc.scrollHeight - sc.clientHeight,
        /* Reachable WITHOUT scrolling is the claim, so compare against the
           scroller's visible box rather than against the document. */
        lastVisible: last.bottom <= sc.getBoundingClientRect().bottom + 0.5,
      }
    })
    await page.setViewportSize(before)
    await page.waitForTimeout(200)
    return out
  })()
  check(
    'and on a 720px window all six cards are on screen with nothing to scroll',
    shortViewport.overflow === 0 && shortViewport.lastVisible,
    `overflow ${shortViewport.overflow}, last card visible ${shortViewport.lastVisible}`,
  )

  // =====================================================================
  /*
    9. BUILD FORM'S RAIL AND ITS SAVE TIMING.

    BUILD FORM DELIBERATELY DOES NOT BEHAVE LIKE THE REST OF THE MODULE, and
    that is the point of this section rather than a wrinkle in it. My Teams,
    Team Viewer and Build Library all commit a field on blur. Build Form holds
    its edits in local state and writes them only at a TRANSITION -- switching
    rail member, adding one, duplicating, adding to a team, going back, or
    leaving by the app bar. Nothing else saves, and nothing announces a save.

    THE ONLY PROMPT ON A TRANSITION IS THE SHARED-BUILD ONE. Everything else
    commits silently, because a build one team uses is nobody else's business.
  */
  hr('9. BUILD FORM — RAIL AND SAVE TIMING')

  const twoMemberTeam = () => ({
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', { speciesId: 1, pokemonId: 1 }),
      mkBuild('b2', { speciesId: 4, pokemonId: 4 }),
      mkBuild('b3', { speciesId: 7, pokemonId: 7 }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2'])],
  })
  const slotsOf = (d) => d.teams[0].memberIds.map((m) => m ?? '·').join(',')
  const idsOf = (d) => d.builds.map((b) => b.id).join(',')
  const formBuildId = () =>
    page.evaluate(
      () => document.querySelector('[data-testid="tb-build-form"]')?.dataset.buildId ?? null,
    )
  const nickOfBuild = async (id) =>
    (await readStore()).builds.find((b) => b.id === id)?.nickname ?? null
  /** Type into the form WITHOUT triggering any transition. */
  const typeNickname = async (value) => {
    await page.fill('[data-testid="tb-nickname"]', value)
    await page.click('[data-testid="tb-level"]')
    await page.waitForTimeout(250)
  }
  const openTeamMember = async (slot) => {
    await goTo('my-teams')
    await page.waitForSelector('[data-testid="tb-my-teams"]')
    await page.click('[data-testid="tb-team-t1-open"]')
    await page.waitForSelector('[data-testid="tb-team-viewer"]')
    await page.click(`[data-testid="tb-slot-${slot}-open"]`)
    await page.waitForSelector('[data-testid="tb-build-form"]')
    await page.waitForTimeout(400)
  }

  // ---- PART 1: the collapse mechanic is gone
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 1,
    builds: [mkBuild('b1', { speciesId: 1, pokemonId: 1 })],
    teams: [],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  const looseRail = await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="tb-rail"]')
    return {
      state: rail?.dataset.state,
      addNow: document.querySelectorAll('[data-testid="tb-rail-create-team"]').length,
      chevron: document.querySelectorAll('[data-testid="tb-rail-expand"]').length,
      cards: rail?.querySelectorAll('[data-tb="member-card"]').length ?? 0,
    }
  })
  log(`  loose rail: ${JSON.stringify(looseRail)}`)
  check(
    'UC2: an unattached build shows the "+" immediately — no chevron, no collapsed state',
    looseRail.state === 'loose' &&
      looseRail.addNow === 1 &&
      looseRail.chevron === 0 &&
      looseRail.cards === 0,
    JSON.stringify(looseRail),
  )

  // ---- UC2: clicking it creates a real team with this build in it
  await page.click('[data-testid="tb-rail-create-team"]')
  await page.waitForTimeout(700)
  const afterCreate = await readStore()
  const attachedRail = await page.$$eval(
    '[data-tb="member-card"][data-testid^="tb-rail-"]',
    (els) => els.map((e) => e.dataset.buildId),
  )
  check(
    'UC2: it creates the team, makes this build member 1, persists, and the rail flips to the team',
    afterCreate.teams.length === 1 &&
      afterCreate.teams[0].memberIds[0] === 'b1' &&
      JSON.stringify(attachedRail) === JSON.stringify(['b1']),
    `teams=${afterCreate.teams.length} slots=${slotsOf(afterCreate)} rail=${attachedRail.join(',')}`,
  )

  /*
    ---- UC3: an edit is form state until the reader says where it goes

    THE EDIT IS MADE AND THEN LEFT ALONE. No blur handler, no timer, nothing --
    the point is that it is STILL uncommitted right up until the rail click, and
    that the rail click ASKS rather than choosing for the reader.

    THIS REPLACES A CHECK THAT ASSERTED THE OPPOSITE. "Commit silently on any
    transition" was the previous rule and it was reversed on request: an edit
    made on one member and abandoned by clicking another was saved without
    anyone deciding it should be.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('EditedA')
  const midEdit = await nickOfBuild('b1')
  check(
    'UC3: an edit sits in form state only — nothing is written before the transition',
    midEdit === '',
    `stored nickname is "${midEdit}"`,
  )
  await page.click('[data-testid="tb-rail-b2"] .tb-card-rail-open')
  await page.waitForSelector('[data-testid="tb-rail-switch-prompt"]')
  const switchAnswers = await page.$$eval(
    '[data-testid="tb-rail-switch-prompt"] .tb-prompt-actions button',
    (els) => els.map((e) => e.textContent.trim()),
  )
  check(
    'UC3: clicking another member asks what happens to the edit, and BLOCKS until answered',
    (await formBuildId()) === 'b1' && (await nickOfBuild('b1')) === '',
    `form=${await formBuildId()} stored="${await nickOfBuild('b1')}"`,
  )
  check(
    'UC3: two answers for another MEMBER — there is no new member for the edit to move to',
    switchAnswers.length === 2 &&
      /Save this member first/i.test(switchAnswers[0]) &&
      /Discard the changes/i.test(switchAnswers[1]),
    switchAnswers.join(' | '),
  )
  await page.click('[data-testid="tb-rail-switch-save"]')
  await page.waitForTimeout(700)
  check(
    'UC3: "Save this member first" writes it and then loads the other member',
    (await nickOfBuild('b1')) === 'EditedA' && (await formBuildId()) === 'b2',
    `stored="${await nickOfBuild('b1')}" form=${await formBuildId()}`,
  )

  // ---- and "Discard the changes" leaves the record exactly as it was
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('Thrown')
  await page.click('[data-testid="tb-rail-b2"] .tb-card-rail-open')
  await page.waitForSelector('[data-testid="tb-rail-switch-prompt"]')
  await page.click('[data-testid="tb-rail-switch-discard"]')
  await page.waitForTimeout(700)
  check(
    'UC3: "Discard the changes" moves on and leaves the record untouched',
    (await nickOfBuild('b1')) === '' && (await formBuildId()) === 'b2',
    `stored="${await nickOfBuild('b1')}" form=${await formBuildId()}`,
  )

  /*
    ---- UC4: the current slot is inert when clean, and the way back when dirty

    THE REVERSAL HERE WAS REQUESTED TOO. Clicking the card you are already on
    used to be a hard no-op in both states. It still is when there is nothing
    outstanding -- and it is not even a control then, so it cannot be otherwise
    -- but with an edit pending it is the only affordance that can undo it,
    which is what it now does.
  */
  const beforeNoop = JSON.stringify(await readStore())
  const inertTag = await page.evaluate(
    () =>
      document.querySelector('[data-testid="tb-rail-b2"] .tb-card-rail-open')?.tagName ?? 'ABSENT',
  )
  await page.click('[data-testid="tb-rail-b2"] .tb-card-rail-open')
  await page.waitForTimeout(500)
  check(
    'UC4: with nothing pending the open member is inert — a <span>, not a button, and changes nothing',
    inertTag === 'SPAN' &&
      (await formBuildId()) === 'b2' &&
      JSON.stringify(await readStore()) === beforeNoop,
    `tag=${inertTag} form=${await formBuildId()}`,
  )
  await typeNickname('Revertible')
  const dirtyTag = await page.evaluate(
    () =>
      document.querySelector('[data-testid="tb-rail-b2"] .tb-card-rail-open')?.tagName ?? 'ABSENT',
  )
  check(
    'UC4: with an edit pending the same card BECOMES a control',
    dirtyTag === 'BUTTON',
    `tag=${dirtyTag}`,
  )
  await page.click('[data-testid="tb-rail-b2"] .tb-card-rail-open')
  await page.waitForSelector('[data-testid="tb-rail-revert-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(500)
  const reverted = await page.evaluate(() => ({
    field: document.querySelector('[data-testid="tb-nickname"]')?.value,
    dirty: document.querySelectorAll('[data-testid="tb-dirty-note"]').length,
  }))
  check(
    'UC4: and reverting puts the FIELD back too, not just the state behind it',
    reverted.field === '' && reverted.dirty === 0 && (await nickOfBuild('b2')) === '',
    JSON.stringify(reverted),
  )

  /*
    ---- UC5: the "+" asks WHICH member first, then what happens to the edit

    THAT ORDER IS FORCED. "Move the changes to the new member" is only an answer
    once the reader has said they want a new member, so the kind has to be
    settled before the edit's fate can be offered.

    ONE "+", AND NEVER ON THE SLOT BEING EDITED. Six would ask the reader to
    pick a slot number, which is not a decision they have -- and one on the slot
    they are already filling re-asked a question they had just answered.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('BeforeAdd')
  const addButtons = (await page.$$('[data-testid="tb-rail-add"]')).length
  await page.click('[data-testid="tb-rail-add"]')
  await page.waitForSelector('[data-testid="tb-rail-add-modal"]')
  check(
    'UC5: the rail offers exactly one "+", and opening it commits NOTHING',
    addButtons === 1 && (await nickOfBuild('b1')) === '',
    `buttons=${addButtons} stored="${await nickOfBuild('b1')}"`,
  )
  const addChoices = await page.$$eval('[data-testid="tb-rail-add-modal"] .tb-ghost', (els) =>
    els.map((e) => e.textContent.trim()),
  )
  check(
    'UC5: and offers both a new member and an existing one',
    addChoices.length === 2 &&
      /new member/i.test(addChoices[0]) &&
      /existing build/i.test(addChoices[1]),
    addChoices.join(' | '),
  )
  await page.click('[data-testid="tb-rail-add-new"]')
  await page.waitForSelector('[data-testid="tb-rail-switch-prompt"]')
  const emptySlotAnswers = await page.$$eval(
    '[data-testid="tb-rail-switch-prompt"] .tb-prompt-actions button',
    (els) => els.map((e) => e.textContent.trim()),
  )
  check(
    'UC5: an EMPTY slot unlocks the third answer — move the edit to the new member',
    emptySlotAnswers.length === 3 &&
      /Save this member first/i.test(emptySlotAnswers[0]) &&
      /Move the changes to the new member/i.test(emptySlotAnswers[1]) &&
      /Discard the changes/i.test(emptySlotAnswers[2]),
    emptySlotAnswers.join(' | '),
  )
  await page.click('[data-testid="tb-rail-switch-move"]')
  await page.waitForTimeout(800)
  const movedForm = await page.evaluate(() => {
    const form = document.querySelector('[data-testid="tb-build-form"]')
    return {
      saved: form?.dataset.saved,
      slot: form?.dataset.slot,
      nickname: document.querySelector('[data-testid="tb-nickname"]')?.value,
    }
  })
  check(
    'UC5: the edit lands on the NEW member, which is not saved yet and holds the empty slot',
    movedForm.nickname === 'BeforeAdd' && movedForm.saved === 'false' && movedForm.slot === '2',
    JSON.stringify(movedForm),
  )
  check(
    'UC5: and the member it came from is back to what it was, with nothing written',
    (await nickOfBuild('b1')) === '' && (await readStore()).builds.length === 3,
    `b1="${await nickOfBuild('b1')}" builds=${(await readStore()).builds.length}`,
  )

  /*
    ---- UC5: "build a new member" writes NOTHING until it is saved

    The build and its slot are written together, at the first save point. A
    record created up front is how the previous shape produced blank Bulbasaurs
    in the library, and an id consumed up front is how the numbering drifted.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await page.click('[data-testid="tb-rail-add"]')
  await page.waitForSelector('[data-testid="tb-rail-add-modal"]')
  await page.click('[data-testid="tb-rail-add-new"]')
  await page.waitForTimeout(800)
  const freshMember = await readStore()
  const freshForm = await page.evaluate(() => {
    const form = document.querySelector('[data-testid="tb-build-form"]')
    return { saved: form?.dataset.saved, slot: form?.dataset.slot, id: form?.dataset.buildId }
  })
  check(
    'UC5: with nothing pending it goes straight to a new member — no prompt, no record, no id used',
    freshMember.builds.length === 3 &&
      freshMember.nextBuildSeq === 4 &&
      slotsOf(freshMember) === 'b1,b2,·,·,·,·' &&
      freshForm.saved === 'false' &&
      freshForm.slot === '2' &&
      freshForm.id === undefined,
    `builds=${freshMember.builds.length} seq=${freshMember.nextBuildSeq} slots=${slotsOf(freshMember)} form=${JSON.stringify(freshForm)}`,
  )
  const currentSlotShape = await page.evaluate(() => {
    const marked = document.querySelector('.tb-card-rail[data-current="true"]')
    return {
      markedIsTheBlank: marked?.dataset.testid ?? marked?.getAttribute('data-testid'),
      addButtonsLeft: document.querySelectorAll('[data-testid="tb-rail-add"]').length,
    }
  })
  check(
    'UC5: the slot being filled shows as the SELECTED slot, and is not an "add member" button',
    currentSlotShape.markedIsTheBlank === 'tb-rail-current-empty' &&
      currentSlotShape.addButtonsLeft === 1,
    JSON.stringify(currentSlotShape),
  )
  /*
    Change something the rail actually DRAWS, and watch the slot become a live
    card of it. Asserted on the ability line rather than the nickname, because
    a rail card shows nature / ability+level / spread and never the nickname --
    so a nickname would have proved nothing about the preview.
  */
  await page.selectOption('[data-testid="tb-species"]', '25')
  await page.waitForTimeout(400)
  const livePreview = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="tb-rail-current"]')
    return {
      present: card != null,
      lines: [...(card?.querySelectorAll('.tb-rail-line') ?? [])].map((e) => e.textContent.trim()),
      blanksLeft: document.querySelectorAll('[data-testid="tb-rail-current-empty"]').length,
    }
  })
  check(
    'UC5: and once anything is changed the slot previews the LIVE form, still with nothing written',
    livePreview.present &&
      livePreview.blanksLeft === 0 &&
      /* Pikachu's ability. The blank slot was a Bulbasaur with Overgrow. */
      livePreview.lines.some((l) => /Static/.test(l)) &&
      (await readStore()).builds.length === 3,
    JSON.stringify(livePreview),
  )
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(800)
  const savedByBack = await readStore()
  check(
    'UC5: "Back to team" is what creates it, AND puts it in the slot it was holding',
    savedByBack.builds.length === 4 &&
      savedByBack.builds.find((b) => b.id === 'b4')?.speciesId === 25 &&
      slotsOf(savedByBack) === 'b1,b2,b4,·,·,·',
    `builds=${savedByBack.builds.length} slots=${slotsOf(savedByBack)}`,
  )

  /*
    ---- UC5, the other branch: pick an existing build

    AND IT COMES BACK TO THE FORM, not to the team. The two callers of the
    picker want different answers and both were asked for: Team Viewer's own
    "add member" returns the TEAM, because being dumped in a build form after
    adding a member was the original complaint; the Build Form's rail is filling
    a slot for a form the reader is working in, so it returns the FORM with the
    build just picked loaded into it. `pickFor.then` carries which.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await page.click('[data-testid="tb-rail-add"]')
  await page.waitForSelector('[data-testid="tb-rail-add-modal"]')
  await page.click('[data-testid="tb-rail-add-existing"]')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b3"] .tb-card-open')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(600)
  const afterPickExisting = await readStore()
  const landedAfterPick = await page.evaluate(() => {
    const form = document.querySelector('[data-testid="tb-build-form"]')
    return {
      id: form?.dataset.buildId,
      slot: form?.dataset.slot,
      species: document.querySelector('[data-testid="tb-species"]')?.value,
      viewers: document.querySelectorAll('[data-testid="tb-team-viewer"]').length,
    }
  })
  check(
    'UC5: "pick an existing build" places it in that slot',
    slotsOf(afterPickExisting) === 'b1,b2,b3,·,·,·',
    slotsOf(afterPickExisting),
  )
  check(
    'UC5: and stays on the FORM with the picked build loaded, rather than opening the team',
    landedAfterPick.id === 'b3' &&
      landedAfterPick.slot === '2' &&
      landedAfterPick.species === '7' &&
      landedAfterPick.viewers === 0,
    JSON.stringify(landedAfterPick),
  )

  // ---- while Team Viewer's own add still returns the TEAM
  await seedStore(twoMemberTeam())
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-2-add"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b3"] .tb-card-open')
  await page.waitForTimeout(700)
  check(
    "UC5: Team Viewer's own add is unchanged -- it comes back to the team, not to a form",
    (await page.$$('[data-testid="tb-team-viewer"]')).length === 1 &&
      (await page.$$('[data-testid="tb-build-form"]')).length === 0,
    `viewer=${(await page.$$('[data-testid="tb-team-viewer"]')).length} form=${(await page.$$('[data-testid="tb-build-form"]')).length}`,
  )

  /*
    ---- UC7: two teams, and every transition asks first

    ADDITIVE TO UC3, not a replacement: the transition still happens, but only
    after the reader has said what the edit should do to the OTHER teams.
  */
  await seedStore({
    nextBuildSeq: 4,
    nextTeamSeq: 3,
    builds: [
      mkBuild('b1', { speciesId: 1, pokemonId: 1, nickname: 'Shared' }),
      mkBuild('b2', { speciesId: 4, pokemonId: 4 }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2']), mkTeam('t2', 2, ['b1'])],
  })
  await openTeamMember(0)
  await typeNickname('SharedEdit')
  await page.click('[data-testid="tb-rail-b2"] .tb-card-rail-open')
  await page.waitForTimeout(600)
  const sharedBlocked = {
    prompt: (await page.$$('[data-testid="tb-shared-prompt"]')).length,
    stillOn: await formBuildId(),
    stored: await nickOfBuild('b1'),
  }
  log(`  shared: ${JSON.stringify(sharedBlocked)}`)
  check(
    'UC7: a build on two teams prompts and BLOCKS the switch until it is answered',
    sharedBlocked.prompt === 1 &&
      sharedBlocked.stillOn === 'b1' &&
      sharedBlocked.stored === 'Shared',
    JSON.stringify(sharedBlocked),
  )
  const sharedOptions = await page.$$eval(
    '[data-testid="tb-shared-prompt"] .tb-prompt-actions button',
    (els) => els.map((e) => e.textContent.trim()),
  )
  check(
    'UC7: and it is the three-way prompt, not a yes/no',
    sharedOptions.length === 3,
    sharedOptions.join(' | '),
  )
  await page.click('[data-testid="tb-shared-save"]')
  await page.waitForTimeout(700)
  check(
    'UC7: answering it lets the transition through',
    (await nickOfBuild('b1')) === 'SharedEdit' && (await formBuildId()) === 'b2',
    `stored="${await nickOfBuild('b1')}" form=${await formBuildId()}`,
  )

  /*
    ---- UC8: reset discards rather than committing

    THE EDIT MUST NEVER REACH THE STORE. Reset used to spread the DRAFT, which
    quietly committed whatever was uncommitted on the fields reset does not
    touch -- so a species change made and then abandoned was saved by the act of
    resetting. Species is checked below precisely because reset does not clear
    it: if the pending edit had been committed, it would show here.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('NeverSaved')
  await page.selectOption('[data-testid="tb-species"]', '25')
  await page.waitForTimeout(250)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-reset"]')
  await page.waitForSelector('[data-testid="tb-reset-prompt"]')
  check('UC8: reset asks first, like any destructive action', true)
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(600)
  const afterUc8 = (await readStore()).builds.find((b) => b.id === 'b1')
  log(
    `  after reset: nickname="${afterUc8.nickname}" species=${afterUc8.speciesId} level=${afterUc8.level}`,
  )
  check(
    'UC8: the uncommitted edit is discarded, not saved-then-reset',
    afterUc8.nickname === '' && afterUc8.speciesId === 1,
    `nickname="${afterUc8.nickname}" species=${afterUc8.speciesId}`,
  )
  check(
    'UC8: and the reset defaults are what actually landed',
    afterUc8.level === 1 &&
      afterUc8.friendship === 0 &&
      afterUc8.itemId === null &&
      afterUc8.shiny === false &&
      afterUc8.moveIds.every((m) => m === null) &&
      Object.values(afterUc8.effort).every((v) => !v) &&
      Object.values(afterUc8.individual).every((v) => !v),
    JSON.stringify({ level: afterUc8.level, friendship: afterUc8.friendship }),
  )

  // ---- UC9: duplicate commits to the ORIGINAL, then follows the copy
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('Original')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-duplicate"]')
  await page.waitForTimeout(800)
  const dupForm = await formBuildId()
  check(
    'UC9: the pending edit lands on the ORIGINAL and the form follows the new copy',
    (await nickOfBuild('b1')) === 'Original' && dupForm === 'b4' && dupForm !== 'b1',
    `original="${await nickOfBuild('b1')}" form=${dupForm}`,
  )
  await typeNickname('OnTheCopy')
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(700)
  check(
    'UC9: and further typing goes to the copy, leaving the original alone',
    (await nickOfBuild('b4')) === 'OnTheCopy' && (await nickOfBuild('b1')) === 'Original',
    `copy="${await nickOfBuild('b4')}" original="${await nickOfBuild('b1')}"`,
  )

  // ---- UC11: delete removes the build and empties the screen
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-delete"]')
  await page.waitForSelector('[data-testid="tb-delete-build-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(700)
  const deletedStore = await readStore()
  const emptyState = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tb-build-form"]')
    return {
      state: el?.dataset.state ?? null,
      note: document.querySelector('[data-testid="tb-build-form-empty-note"]')?.textContent ?? null,
      fields: document.querySelectorAll('[data-testid="tb-nickname"]').length,
    }
  })
  log(`  after delete: ${JSON.stringify(emptyState)}`)
  check(
    'UC11: the build is gone from the store and the form visibly empties rather than sitting there',
    !deletedStore.builds.some((b) => b.id === 'b1') &&
      emptyState.state === 'deleted' &&
      emptyState.fields === 0,
    JSON.stringify(emptyState),
  )

  /*
    ---- UC12: the info modal commits only its own fields

    OPENING AND CLOSING IS NOT A TRANSITION. The main form's pending edit must
    still be pending afterwards -- the modal is a different surface with its own
    save-on-blur, and the two must not leak into each other.
  */
  await seedStore(twoMemberTeam())
  await openTeamMember(0)
  await typeNickname('StillPending')
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-info"]')
  await page.waitForSelector('[data-testid="tb-form-info-modal"]')
  /* Escape, because the overlay has no close button -- it dismisses on Escape
     or an outside click, both of which are "close" for this check's purposes. */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  check(
    'UC12: opening and closing the info modal commits nothing',
    (await nickOfBuild('b1')) === '',
    `stored nickname is "${await nickOfBuild('b1')}"`,
  )
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-info"]')
  await page.waitForSelector('[data-testid="tb-form-info-modal"]')
  await page.fill('[data-testid="tb-form-notes"]', 'A note')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const uc12 = (await readStore()).builds.find((b) => b.id === 'b1')
  check(
    "UC12: typing a note saves the NOTE and still leaves the form's own edit pending",
    uc12.notes === 'A note' && uc12.nickname === '',
    `notes="${uc12.notes}" nickname="${uc12.nickname}"`,
  )

  // ---- an untouched draft from Team Viewer is still dropped, silently
  await seedStore(twoMemberTeam())
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-2-add"]')
  await page.waitForSelector('[data-testid="tb-add-member-modal"]')
  await page.click('[data-testid="tb-add-member-new"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(600)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(700)
  const afterAbandon = await readStore()
  check(
    'an untouched draft started from Team Viewer is dropped on the way out, with no prompt asked',
    idsOf(afterAbandon) === 'b1,b2,b3' &&
      (await page.$$('[data-testid="tb-draft-prompt"]')).length === 0,
    idsOf(afterAbandon),
  )

  // =====================================================================
  /*
    10. TYPE DEFENCE — the chart, then the ability's say over it.

    THE FOUR CASES ARE FOUR DIFFERENT MECHANISMS and only one of them was ever
    working. Dual-type immunity (Zapdos, Quagsire) is the chart multiplying
    across both types, which src/data has always done. The other three are the
    ability, which src/data cannot know about because an ability belongs to a
    BUILD: Levitate replacing a 2x weakness with an immunity, Flash Fire
    replacing a chart-neutral 1x with one, and the era gate that stops either
    applying in a generation where abilities do not exist.
  */
  hr('10. TYPE DEFENCE')
  const defence2 = await page.evaluate(async () => {
    const d = await import('/pokeapp/src/data/index.ts')
    const td = await import('/pokeapp/src/modules/team-builder/typeDefence.ts')
    const typesOf = (id) => {
      const sp = d.getSpecies(id)
      const v = sp.varieties.find((x) => x.is_default) ?? sp.varieties[0]
      return v.types.map((t) => t.type_id)
    }
    const at = (typeIds, abilityId, gen, name) =>
      td.defensiveChart(typeIds, abilityId, gen).find((r) => r.type.name === name)?.multiplier
    const ability = (name) => d.listAbilities().find((a) => a.name === name)?.id ?? null
    return {
      /* Electric/Flying: Ground is 2x on Electric and 0x on Flying. */
      zapdosGround: at(typesOf(145), null, 4, 'ground'),
      /* Water/Ground: Electric is 2x on Water and 0x on Ground. */
      quagsireElectric: at(typesOf(195), null, 4, 'electric'),
      /* Steel/Psychic, so Ground is genuinely 2x -- until Levitate. */
      bronzongPlain: at(typesOf(437), null, 4, 'ground'),
      bronzongLevitate: at(typesOf(437), ability('levitate'), 4, 'ground'),
      /* Fire/Steel: 2x on Steel x 0.5x on Fire = a neutral 1, which is exactly
         why Flash Fire has to REPLACE the number rather than multiply it. */
      heatranPlain: at(typesOf(485), null, 4, 'fire'),
      heatranFlashFire: at(typesOf(485), ability('flash-fire'), 4, 'fire'),
      /* Water/Flying: Electric 2x x 2x. A 4x weakness must survive all this. */
      gyaradosElectric: at(typesOf(130), null, 4, 'electric'),
      /* Abilities do not exist before Gen 3. */
      levitateInGen2: at(typesOf(437), ability('levitate'), 2, 'ground'),
      /* A halving ability multiplies rather than replaces: Thick Fat on a
         species already resistant to Ice compounds with the chart. */
      thickFatIce: at(typesOf(143), ability('thick-fat'), 4, 'ice'),
    }
  })
  log(`  ${JSON.stringify(defence2)}`)
  check(
    'dual-type immunity: Zapdos takes nothing from Ground, Quagsire nothing from Electric',
    defence2.zapdosGround === 0 && defence2.quagsireElectric === 0,
    `zapdos=${defence2.zapdosGround} quagsire=${defence2.quagsireElectric}`,
  )
  check(
    "Levitate turns Bronzong's real 2x Ground weakness into an immunity",
    defence2.bronzongPlain === 2 && defence2.bronzongLevitate === 0,
    `plain=${defence2.bronzongPlain} levitate=${defence2.bronzongLevitate}`,
  )
  check(
    'Flash Fire REPLACES the chart rather than multiplying it, so a neutral 1x becomes 0',
    defence2.heatranPlain === 1 && defence2.heatranFlashFire === 0,
    `plain=${defence2.heatranPlain} flashfire=${defence2.heatranFlashFire}`,
  )
  check(
    'a 4x weakness still reads 4x — the ability layer changes only what it names',
    defence2.gyaradosElectric === 4,
    String(defence2.gyaradosElectric),
  )
  check(
    'and no ability applies before Gen 3, where abilities do not exist',
    defence2.levitateInGen2 === 2,
    String(defence2.levitateInGen2),
  )

  // =====================================================================
  /*
    11. THE LIBRARIES — two IDs, bulk delete, and the picker that comes back.

    THE DISPLAYED ID IS DERIVED FROM POSITION, which is the whole point of the
    two-ID split: `id` is the immutable key every record refers to, and "#002"
    is where a thing sits in the list right now. Deleting the second of three
    must renumber the third WITHOUT touching any stored field, so the check
    below reads the numbers off the screen after a delete rather than the store.
  */
  /*
    ---- AND IT HAS TO REACH THE SCREEN

    Everything above tests `defensiveChart` directly. That is the arithmetic; it
    proves nothing about whether the ability actually gets passed in from the
    card the reader is looking at. One forgotten `abilityId` on one call site
    and the chart is right while every screen is wrong -- so this drives the
    real popovers, on a team built from the four cases.
  */
  await seedStore({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: [
      /* Heracross bug/fighting, Magnezone electric/steel: ordinary members, so
         the tallies below have something to count that is not a special case. */
      mkBuild('b1', { generation: 4, speciesId: 214, pokemonId: 214, abilityId: 62 }),
      mkBuild('b2', { generation: 4, speciesId: 462, pokemonId: 462, abilityId: 42 }),
      /* Case 1, dual type: electric alone is 2x weak to Ground; flying is immune. */
      mkBuild('b3', { generation: 4, speciesId: 145, pokemonId: 145, abilityId: 46 }),
      /* Case 1 again: ground gives Quagsire an Electric immunity. */
      mkBuild('b4', { generation: 4, speciesId: 195, pokemonId: 195, abilityId: 6 }),
      /* Case 2: steel is 2x weak to Ground; LEVITATE is immune. */
      mkBuild('b5', { generation: 4, speciesId: 437, pokemonId: 437, abilityId: 26 }),
      /* Case 2 again: fire/steel takes Fire at 1x; FLASH FIRE is immune. */
      mkBuild('b6', { generation: 4, speciesId: 485, pokemonId: 485, abilityId: 18 }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], { generation: 4 })],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.waitForTimeout(500)
  await page.hover('[data-testid="tb-team-t1"]')
  await page.click('[data-testid="tb-team-t1-kebab"]')
  await page.waitForSelector('[data-testid="tb-team-t1-coverage"]')
  await page.click('[data-testid="tb-team-t1-coverage"]')
  await page.waitForSelector('[data-testid="tb-matchup-team"]')
  await page.waitForTimeout(300)
  const teamTable = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-team"]')
    return {
      heads: [...scope.querySelectorAll('th')].map((e) => e.textContent.trim()),
      tally: Object.fromEntries(
        [...scope.querySelectorAll('tbody tr')].map((r) => {
          const c = [...r.children].map((x) => x.textContent.trim())
          return [c[0].toLowerCase(), { weak: +c[1], resist: +c[2], immune: +c[3] }]
        }),
      ),
    }
  })
  const teamTally = teamTable.tally
  log(`  team tally: ${JSON.stringify(teamTally)}`)
  check(
    "the Team Library's own coverage table counts Levitate and dual types, not raw chart rows",
    /* Weak: Magnezone and Heatran, both 4x. Read raw, Bronzong would be a third
       weakness and Zapdos a fourth. */
    teamTally.ground?.weak === 2,
    `ground ${JSON.stringify(teamTally.ground)}`,
  )
  /*
    ---- AN IMMUNITY IS NOT A RESISTANCE

    The table counted `multiplier < 1` as a resistance, which swept 0x in with
    0.5x: three of these six cannot be hit by Ground at all -- Zapdos by its
    Flying half, Bronzong by Levitate -- and the panel said "resists it". These
    checks are the reason the column exists, and the two above them USED to
    assert the conflated numbers.
  */
  check(
    'the table has an Immune column of its own, after Weak and Resist',
    JSON.stringify(teamTable.heads) === JSON.stringify(['Type', 'Weak', 'Resist', 'Immune']),
    teamTable.heads.join(' | '),
  )
  check(
    'Ground: Zapdos and Bronzong are IMMUNE, and only Heracross actually resists it',
    teamTally.ground?.immune === 2 && teamTally.ground?.resist === 1,
    `ground ${JSON.stringify(teamTally.ground)}`,
  )
  check(
    'Fire: Flash Fire is an immunity, not the resistance it used to be counted as',
    /* Weak: Heracross, Magnezone, Bronzong. Resist: Quagsire at 0.5x. Immune:
       Heatran, which without the ability is a neutral 1x and neither. */
    teamTally.fire?.weak === 3 && teamTally.fire?.resist === 1 && teamTally.fire?.immune === 1,
    `fire ${JSON.stringify(teamTally.fire)}`,
  )
  check(
    'and a type nothing is weak to still earns a row when something is immune to it',
    /* The old filter was `weak > 0`, so the team's best news was invisible:
       Magnezone cannot be poisoned by anything, and the row was dropped. */
    teamTally.poison?.weak === 0 && teamTally.poison?.immune >= 1,
    `poison ${JSON.stringify(teamTally.poison)}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // ---- and each member's own popover, in the Team Viewer
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(500)
  const immunitiesOf = async (slot) => {
    await page.hover(`[data-testid="tb-slot-${slot}"]`)
    await page.click(`[data-testid="tb-slot-${slot}-matchup"]`)
    await page.waitForSelector('[data-testid="tb-matchup-species"]')
    await page.waitForTimeout(250)
    const got = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="tb-matchup-immune"]')
      const weak = document.querySelector('[data-testid="tb-matchup-weak"]')
      return {
        immune: [...(col?.querySelectorAll('[data-ds="type-label"]') ?? [])].map(
          (e) => e.dataset.type,
        ),
        weak: [...(weak?.querySelectorAll('[data-ds="type-label"]') ?? [])].map(
          (e) => e.dataset.type,
        ),
      }
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    return got
  }
  const zapdos = await immunitiesOf(2)
  const quagsire = await immunitiesOf(3)
  const bronzong = await immunitiesOf(4)
  const heatran = await immunitiesOf(5)
  log(`  zapdos ${JSON.stringify(zapdos)}`)
  log(`  quagsire ${JSON.stringify(quagsire)}`)
  log(`  bronzong ${JSON.stringify(bronzong)}`)
  log(`  heatran ${JSON.stringify(heatran)}`)
  check(
    'case 1 on screen: Zapdos is IMMUNE to Ground and not weak to it, and Quagsire to Electric',
    zapdos.immune.includes('ground') &&
      !zapdos.weak.includes('ground') &&
      quagsire.immune.includes('electric') &&
      !quagsire.weak.includes('electric'),
    `zapdos immune=${zapdos.immune.join(',')} quagsire immune=${quagsire.immune.join(',')}`,
  )
  check(
    'case 2 on screen: Levitate makes Bronzong immune to Ground rather than 2x weak',
    bronzong.immune.includes('ground') && !bronzong.weak.includes('ground'),
    `immune=${bronzong.immune.join(',')} weak=${bronzong.weak.join(',')}`,
  )
  check(
    'case 2 on screen: Flash Fire makes Heatran immune to Fire, and its real 4x Ground stays',
    heatran.immune.includes('fire') && heatran.weak.includes('ground'),
    `immune=${heatran.immune.join(',')} weak=${heatran.weak.join(',')}`,
  )

  hr('11. THE LIBRARIES')

  const threeBuilds = () => ({
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', { speciesId: 1, pokemonId: 1 }),
      mkBuild('b2', { speciesId: 4, pokemonId: 4 }),
      mkBuild('b3', { speciesId: 7, pokemonId: 7 }),
    ],
    teams: [mkTeam('t1', 1, ['b1'])],
  })

  await seedStore(threeBuilds())
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.waitForTimeout(400)
  const idsBefore = await page.$$eval('.tb-build-id', (els) => els.map((e) => e.textContent.trim()))
  check(
    'builds carry a UI id numbered from their position',
    JSON.stringify(idsBefore) === JSON.stringify(['#001', '#002', '#003']),
    idsBefore.join(' '),
  )

  // ---- bulk selection: enter, sweep two, delete
  await page.click('[data-testid="tb-builds-select"]')
  await page.waitForSelector('[data-testid="tb-builds-bulk"]')
  const circles = await page.$$('.tb-select-circle')
  check(
    'selection mode puts a check circle on every card',
    circles.length === 3,
    String(circles.length),
  )
  /*
    A SWEEP, not three clicks. Press on the second circle and drag across the
    third: pointerdown decides the direction (both were unselected, so this is
    selecting) and every circle the pointer enters takes the same decision. A
    per-item toggle would turn the second one back off on the way past.
  */
  const boxOf = async (i) => await circles[i].boundingBox()
  const from = await boxOf(1)
  const to = await boxOf(2)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const swept = (await page.textContent('[data-testid="tb-builds-bulk-count"]'))?.trim()
  check(
    'dragging across two cards selects both, rather than toggling each in turn',
    swept === '2 builds selected',
    swept,
  )
  await page.click('[data-testid="tb-builds-bulk-delete"]')
  await page.waitForSelector('[data-testid="tb-bulk-delete-builds-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(700)
  const afterBulk = await readStore()
  check(
    'bulk delete removes exactly the selected builds and asks first',
    afterBulk.builds.map((b) => b.id).join(',') === 'b1',
    afterBulk.builds.map((b) => b.id).join(',') || 'none',
  )

  // ---- the numbering closes the gap
  await seedStore(threeBuilds())
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.waitForTimeout(400)
  await page.hover('[data-testid="tb-build-b2-cell"]')
  await page.click('[data-testid="tb-build-b2-delete"]')
  await page.waitForSelector('[data-testid="tb-delete-build-prompt"]')
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(600)
  const idsAfter = await page.$$eval('.tb-build-id', (els) => els.map((e) => e.textContent.trim()))
  const keyAfter = await page.$$eval('.tb-library-cell', (els) =>
    els.map((e) => e.dataset.testid.replace('tb-build-', '').replace('-cell', '')),
  )
  log(`  after deleting #002: ids ${idsAfter.join(' ')} · keys ${keyAfter.join(' ')}`)
  check(
    'deleting #002 renumbers #003 to #002 — no gap, nothing renumbered in storage',
    JSON.stringify(idsAfter) === JSON.stringify(['#001', '#002']) &&
      JSON.stringify(keyAfter) === JSON.stringify(['b1', 'b3']),
    `${idsAfter.join(' ')} / ${keyAfter.join(' ')}`,
  )

  /*
    ---- "Pick an existing build" comes BACK

    It used to send the reader to the library with no memory of why, so choosing
    a build opened the Build Form and the team being assembled was left behind.
  */
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', { speciesId: 1, pokemonId: 1 }),
      mkBuild('b2', { speciesId: 4, pokemonId: 4 }),
    ],
    teams: [mkTeam('t1', 1, ['b1'])],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-1-add"]')
  await page.waitForSelector('[data-testid="tb-add-member-modal"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  check(
    'picking an existing member opens the library IN PICK MODE, which says so',
    (await page.$$('[data-testid="tb-pick-note"]')).length === 1,
  )
  await page.click('[data-testid="tb-build-b2"] .tb-card-open')
  await page.waitForTimeout(800)
  const afterPick = await readStore()
  check(
    'and choosing one adds it to the team and returns there, rather than opening the Build Form',
    (await page.$$('[data-testid="tb-team-viewer"]')).length === 1 &&
      afterPick.teams[0].memberIds[1] === 'b2',
    `screen=${(await page.$$('[data-testid="tb-team-viewer"]')).length ? 'team-viewer' : 'elsewhere'} slots=${afterPick.teams[0].memberIds.join(',')}`,
  )

  // ---- an empty team is not a team
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 3,
    builds: [mkBuild('b1', { speciesId: 1, pokemonId: 1 })],
    teams: [mkTeam('t1', 1, ['b1']), mkTeam('t2', 2, [])],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.waitForTimeout(600)
  const listedTeams = await page.$$eval('.tb-team-row', (els) => els.map((e) => e.dataset.teamId))
  const storedTeams = (await readStore()).teams.map((t) => t.id)
  check(
    'an empty team is neither listed nor kept',
    JSON.stringify(listedTeams) === JSON.stringify(['t1']) &&
      JSON.stringify(storedTeams) === JSON.stringify(['t1']),
    `listed=${listedTeams.join(',')} stored=${storedTeams.join(',')}`,
  )

  // ---- the whole lane opens the team
  await page.click('.tb-team-row .tb-team-members')
  await page.waitForTimeout(700)
  check(
    'clicking anywhere in a team lane opens it, not only the chevron',
    (await page.$$('[data-testid="tb-team-viewer"]')).length === 1,
  )

  // =====================================================================
  /*
    12. THE NEW-MEMBER LIFECYCLE.

    A MEMBER THAT DOES NOT EXIST YET is the case this module kept getting wrong,
    in three different ways at once, and every check here is one of them:

      THE NUMBER. "New team" creates the team before there is anything to put in
      it, and an abandoned one is invisible but still in storage. Numbering
      against every team rather than against the ones the library lists meant
      the next attempt called itself #002, then #003, while the library still
      showed nothing.

      THE SLOT. A new member used to be created up front, flagged `draft`, and
      placed by a later "keep it?" answer. When that question was removed
      nothing placed it: filling the form and pressing "Back to team" put the
      build in the library and returned to a team that was still empty. The
      build and its slot are now written together or not at all.

      THE SECOND ASK. The slot being filled read as free, so the rail drew an
      "add member" button on it -- the same question the reader had just
      answered. Answering it again created a second member and abandoned the
      first, and if the first was untouched it was deleted underneath the open
      form, which is where "this build no longer exists" came from mid-build.
  */
  hr('12. THE NEW-MEMBER LIFECYCLE')

  const leaveModule = async () => {
    /* Out of the module entirely, by the app bar -- an exit Team Building does
       not own, and the one its unmount cleanup exists for. */
    await page.hover('[data-testid="nav-tab-pokepedia"]')
    await page.waitForSelector('[data-testid="nav-dropdown-pokepedia"]', { state: 'visible' })
    await page.click('[data-testid="nav-dropdown-pokepedia"] button')
    await page.waitForTimeout(900)
  }
  const startNewMember = async () => {
    await goTo('new-team')
    await page.waitForSelector('[data-testid="tb-team-viewer"]')
    /* OFF THE NAV TAB. The dropdown stays open under the pointer after a nav
       click and covers the top of the screen, so the first thing clicked on the
       page below it hits the menu instead. */
    await page.mouse.move(800, 900)
    await page.click('[data-testid="tb-slot-0-add"]')
    await page.click('[data-testid="tb-add-member-new"]')
    await page.waitForSelector('[data-testid="tb-build-form"]')
    await page.waitForTimeout(300)
  }

  // ---- the number does not drift across abandoned attempts
  await seedStore(null)
  const numbers = []
  for (let i = 0; i < 3; i++) {
    await goTo('new-team')
    await page.waitForSelector('[data-testid="tb-team-viewer"]')
    numbers.push((await page.textContent('[data-testid="tb-viewer-team-id"]')).trim())
    await goTo('my-teams')
    await page.waitForSelector('[data-testid="tb-my-teams"]')
  }
  log(`  team id on three consecutive new teams: ${numbers.join(' ')}`)
  check(
    'a new team shows the number it will KEEP, however many attempts were abandoned first',
    JSON.stringify(numbers) === JSON.stringify(['#001', '#001', '#001']),
    numbers.join(' '),
  )

  // ---- new team > add member > build a new member > Back to team
  await seedStore(null)
  await startNewMember()
  const arrival = await page.evaluate(() => {
    const form = document.querySelector('[data-testid="tb-build-form"]')
    return {
      saved: form?.dataset.saved,
      slot: form?.dataset.slot,
      railTeam: document.querySelector('[data-testid="tb-rail-team"]')?.textContent.trim(),
      selectedSlot: document.querySelectorAll('[data-testid="tb-rail-current-empty"]').length,
      addButtons: document.querySelectorAll('[data-testid="tb-rail-add"]').length,
    }
  })
  log(`  on arrival: ${JSON.stringify(arrival)}`)
  check(
    'the form opens on a member that does not exist, holding slot 1 of a team numbered #001',
    arrival.saved === 'false' &&
      arrival.slot === '0' &&
      arrival.railTeam === '#001' &&
      arrival.selectedSlot === 1,
    JSON.stringify(arrival),
  )
  check(
    'and NOTHING has been written -- no build, no slot',
    (await readStore()).builds.length === 0,
    `${(await readStore()).builds.length} builds`,
  )
  check(
    'the slot being filled is NOT also an "add member" button; the "+" is the NEXT slot',
    arrival.addButtons === 1,
    `${arrival.addButtons} add button(s)`,
  )
  await page.selectOption('[data-testid="tb-species"]', '25')
  await page.waitForTimeout(400)
  check(
    'choosing a species previews in the rail and STILL writes nothing',
    (await page.$$('[data-testid="tb-rail-current"]')).length === 1 &&
      (await page.$$('[data-testid="tb-rail-current-empty"]')).length === 0 &&
      (await readStore()).builds.length === 0,
    `builds=${(await readStore()).builds.length}`,
  )
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(400)
  const backToTeam = await readStore()
  const newMemberCount = (await page.textContent('[data-testid="tb-slot-count"]')).trim()
  log(
    `  after Back to team: ${idsOf(backToTeam)} slots=${slotsOf(backToTeam)} count=${newMemberCount}`,
  )
  check(
    '"Back to team" creates the build AND puts it in the team -- not one without the other',
    backToTeam.builds.length === 1 &&
      backToTeam.builds[0].speciesId === 25 &&
      backToTeam.teams[0].memberIds[0] === backToTeam.builds[0].id &&
      newMemberCount === '1 / 6',
    `builds=${idsOf(backToTeam)} slots=${slotsOf(backToTeam)} count=${newMemberCount}`,
  )

  // ---- the app bar is a save point for a new member too
  await seedStore(null)
  await startNewMember()
  await page.selectOption('[data-testid="tb-species"]', '150')
  await page.waitForTimeout(400)
  await leaveModule()
  const viaAppBar = await readStore()
  log(
    `  via app bar: ${idsOf(viaAppBar)} slots=${viaAppBar.teams.map((t) => t.memberIds.join(',')).join(' | ')}`,
  )
  check(
    'a TOUCHED new member survives the global app nav bar, in its slot',
    viaAppBar.builds.length === 1 &&
      viaAppBar.builds[0].speciesId === 150 &&
      viaAppBar.teams[0].memberIds[0] === viaAppBar.builds[0].id,
    `builds=${idsOf(viaAppBar)}`,
  )

  // ---- and an untouched one leaves nothing at all
  await seedStore(null)
  await startNewMember()
  await leaveModule()
  const untouchedExit = await readStore()
  check(
    'an UNTOUCHED new member left the same way creates nothing -- no build, no orphan',
    untouchedExit.builds.length === 0 && untouchedExit.nextBuildSeq === 1,
    `builds=${untouchedExit.builds.length} seq=${untouchedExit.nextBuildSeq}`,
  )
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.waitForTimeout(400)
  check(
    'and the empty team it was for is collected on the way back in',
    (await readStore()).teams.length === 0,
    `${(await readStore()).teams.length} teams`,
  )

  // ---- discarding the member being built
  await seedStore(null)
  await startNewMember()
  await page.selectOption('[data-testid="tb-species"]', '150')
  await page.waitForTimeout(400)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-delete"]')
  await page.waitForSelector('[data-testid="tb-delete-build-prompt"]')
  const discardWording = await page.evaluate(() => ({
    title: document
      .querySelector('[data-testid="tb-delete-build-prompt"] .tb-modal-title')
      ?.textContent.trim(),
    confirm: document.querySelector('[data-testid="tb-prompt-confirm"]')?.textContent.trim(),
  }))
  check(
    'Delete says DISCARD for a member that was never saved -- there is no build to delete',
    /Discard this new member/i.test(discardWording.title ?? '') &&
      /Discard/i.test(discardWording.confirm ?? ''),
    JSON.stringify(discardWording),
  )
  await page.click('[data-testid="tb-prompt-confirm"]')
  await page.waitForTimeout(600)
  check(
    'and it returns to the team rather than showing an empty form for a build that never existed',
    (await page.$$('[data-testid="tb-team-viewer"]')).length === 1 &&
      (await readStore()).builds.length === 0 &&
      (await page.$$('[data-testid="tb-build-form-empty-note"]')).length === 0,
    `builds=${(await readStore()).builds.length}`,
  )

  /*
    ---- UC2 for an UNSAVED build: start a team from the rail

    The build is still not written. The team is created, the form takes slot 1
    of it, and the edit in progress starts previewing there -- so the reader can
    see the team forming while nothing has been committed to the library.
  */
  await seedStore(null)
  await goTo('new-build')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  const looseNew = await page.evaluate(() => ({
    saved: document.querySelector('[data-testid="tb-build-form"]')?.dataset.saved,
    railState: document.querySelector('[data-testid="tb-rail"]')?.dataset.state,
    cards: document.querySelectorAll('.tb-card-rail').length,
    startTeam: document.querySelectorAll('[data-testid="tb-rail-create-team"]').length,
  }))
  /* NULL, not an empty document: "New build" does not touch localStorage at
     all, so the key the seed removed is still absent. */
  const looseDoc = await readStore()
  check(
    'UC1: "New build" writes nothing and its rail shows no member info at all',
    looseNew.saved === 'false' &&
      looseNew.railState === 'loose' &&
      looseNew.cards === 0 &&
      looseNew.startTeam === 1 &&
      (looseDoc?.builds?.length ?? 0) === 0,
    `${JSON.stringify(looseNew)} doc=${looseDoc === null ? 'absent' : looseDoc.builds.length}`,
  )
  await page.selectOption('[data-testid="tb-species"]', '143')
  await page.waitForTimeout(400)
  await page.click('[data-testid="tb-rail-create-team"]')
  await page.waitForTimeout(700)
  const afterStartTeam = await readStore()
  const previewing = await page.evaluate(() => ({
    railState: document.querySelector('[data-testid="tb-rail"]')?.dataset.state,
    saved: document.querySelector('[data-testid="tb-build-form"]')?.dataset.saved,
    slot: document.querySelector('[data-testid="tb-build-form"]')?.dataset.slot,
    current: document.querySelectorAll('.tb-card-rail[data-current="true"]').length,
  }))
  check(
    'UC2: starting a team from an unsaved build previews it in the rail, still without saving it',
    previewing.railState === 'attached' &&
      previewing.saved === 'false' &&
      previewing.slot === '0' &&
      previewing.current === 1 &&
      afterStartTeam.builds.length === 0 &&
      afterStartTeam.teams.length === 1,
    `${JSON.stringify(previewing)} builds=${afterStartTeam.builds.length}`,
  )
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(700)
  const finallySaved = await readStore()
  check(
    'UC2: and leaving is what writes both the build and its slot',
    finallySaved.builds.length === 1 &&
      finallySaved.builds[0].speciesId === 143 &&
      finallySaved.teams[0].memberIds[0] === finallySaved.builds[0].id,
    `builds=${idsOf(finallySaved)} slots=${finallySaved.teams[0].memberIds.join(',')}`,
  )

  // ---- deleting the member the form is ON, from the rail
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [mkBuild('b1'), mkBuild('b2', { speciesId: 4, pokemonId: 4 })],
    teams: [mkTeam('t1', 1, ['b1', 'b2'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  await page.hover('[data-testid="tb-rail-b1"]')
  await page.click('[data-testid="tb-rail-b1-delete"]')
  await page.waitForSelector('[data-testid="tb-rail-remove-prompt"]')
  await page.click('[data-testid="tb-rail-remove-delete"]')
  await page.waitForTimeout(600)
  const selfDelete = await page.evaluate(() => ({
    state: document.querySelector('[data-testid="tb-build-form"]')?.dataset.state,
    note: document.querySelector('[data-testid="tb-build-form-empty-note"]')?.textContent.trim(),
  }))
  check(
    'deleting the member the form is ON reads as a deliberate delete, not "this build no longer exists"',
    selfDelete.state === 'deleted' &&
      /Build deleted/i.test(selfDelete.note ?? '') &&
      idsOf(await readStore()) === 'b2',
    `${JSON.stringify(selfDelete)} builds=${idsOf(await readStore())}`,
  )

  // ---- a full team has nothing to add
  await seedStore({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: [1, 2, 3, 4, 5, 6].map((n) => mkBuild(`b${n}`, { speciesId: n, pokemonId: n })),
    teams: [mkTeam('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  const fullRail = await page.evaluate(() => ({
    cards: document.querySelectorAll('.tb-card-rail').length,
    add: document.querySelectorAll('[data-testid="tb-rail-add"]').length,
    current: document.querySelectorAll('.tb-card-rail[data-current="true"]').length,
  }))
  check(
    'a full team draws six cards, exactly one of them marked, and no "+" anywhere',
    fullRail.cards === 6 && fullRail.add === 0 && fullRail.current === 1,
    JSON.stringify(fullRail),
  )

  /*
    ---- ONE BUILD CANNOT BE IN TWO SLOTS OF THE SAME TEAM

    Found by driving the picker rather than by reading it, and it was not a
    cosmetic duplicate. React reported two children with the same key -- which
    it documents as unsupported and free to duplicate or omit children -- the
    coverage panels counted that Pokemon twice so a team's weaknesses were
    computed against a team it did not have, "remove from this team" cleared the
    first matching slot only and left the other unreachable, and it did NOT
    register as a shared build, because sharing counts teams and not slots, so
    editing it changed both slots with no prompt.

    BOTH ROUTES ARE COVERED, because there are two: the library in pick mode,
    and the form's own "add to other team".
  */
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 2,
    builds: [mkBuild('b1'), mkBuild('b2', { speciesId: 4, pokemonId: 4 })],
    teams: [mkTeam('t1', 1, ['b1'])],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-1-add"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForTimeout(600)
  const pickerOffers = await page.evaluate(() => ({
    offered: [...document.querySelectorAll('[data-tb="member-card"]')].map(
      (e) => e.dataset.buildId,
    ),
    note: document
      .querySelector('[data-testid="tb-pick-note"]')
      ?.textContent.replace(/\s+/g, ' ')
      .trim(),
  }))
  log(`  picker: ${JSON.stringify(pickerOffers)}`)
  check(
    'the picker hides builds already on the team it is filling, and says how many',
    JSON.stringify(pickerOffers.offered) === JSON.stringify(['b2']) &&
      /1 already on it is hidden/.test(pickerOffers.note ?? ''),
    JSON.stringify(pickerOffers),
  )
  await page.click('[data-testid="tb-pick-cancel"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')

  // ---- and the same guard on the form's own route
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  await page.hover('[data-testid="tb-build-form"]')
  await page.click('[data-testid="tb-form-add-to-team"]')
  await page.waitForTimeout(600)
  const addToTeamRows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="tb-add-to-team-teams"] button')].map((r) => ({
      disabled: r.disabled,
      alreadyOn: r.dataset.alreadyOn ?? null,
      says: /already on/.test(r.textContent),
    })),
  )
  check(
    '"add to other team" shows a team that already has this build as unavailable, and says why',
    addToTeamRows.length === 1 &&
      addToTeamRows[0].disabled &&
      addToTeamRows[0].alreadyOn === 'true' &&
      addToTeamRows[0].says,
    JSON.stringify(addToTeamRows),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  /*
    ---- and the ONE case where a picked build must still land: an empty team

    The guard is "not already on THIS team", not "not on any team". A build on
    one team is a perfectly good member of another, and forbidding that would
    make the shared-build prompt unreachable.
  */
  await seedStore({
    nextBuildSeq: 3,
    nextTeamSeq: 3,
    builds: [mkBuild('b1'), mkBuild('b2', { speciesId: 4, pokemonId: 4 })],
    teams: [mkTeam('t1', 1, ['b1']), mkTeam('t2', 2, ['b2'])],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t2-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.click('[data-testid="tb-slot-1-add"]')
  await page.click('[data-testid="tb-add-member-existing"]')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1"] .tb-card-open')
  await page.waitForTimeout(700)
  const crossTeam = await readStore()
  check(
    'a build already on ANOTHER team is still pickable, and becomes a shared build',
    crossTeam.teams
      .find((t) => t.id === 't2')
      ?.memberIds.slice(0, 2)
      .join(',') === 'b2,b1',
    crossTeam.teams.map((t) => `${t.id}:${t.memberIds.filter(Boolean).join(',')}`).join(' | '),
  )

  /*
    ---- a slot holding an id nothing resolves to is an EMPTY slot

    Team Viewer has always treated it that way -- it maps unknown ids to null
    before rendering -- and the rail read `memberIds` raw, so it skipped the
    slot and aimed at the next one, leaving a hole nothing could fill.
  */
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [mkBuild('b1')],
    teams: [mkTeam('t1', 1, ['b1', 'a-build-that-is-gone'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)
  await page.click('[data-testid="tb-rail-add"]')
  await page.waitForSelector('[data-testid="tb-rail-add-modal"]')
  await page.click('[data-testid="tb-rail-add-new"]')
  await page.waitForTimeout(700)
  const danglingSlot = await page.evaluate(
    () => document.querySelector('[data-testid="tb-build-form"]')?.dataset.slot,
  )
  check(
    'the rail aims its "+" at the dangling slot rather than stepping over it',
    danglingSlot === '1',
    `slot ${danglingSlot}`,
  )
  await page.selectOption('[data-testid="tb-species"]', '25')
  await page.waitForTimeout(300)
  await page.click('[data-testid="tb-build-back"]')
  await page.waitForTimeout(700)
  const filledDangling = await readStore()
  check(
    'and saving REPLACES the dangling id instead of leaving a permanent hole',
    filledDangling.teams[0].memberIds[1] === 'b2' &&
      !filledDangling.teams[0].memberIds.includes('a-build-that-is-gone'),
    filledDangling.teams[0].memberIds.join(','),
  )

  await seedStore({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: [1, 2, 3, 4, 5, 6].map((n) => mkBuild(`b${n}`, { speciesId: n, pokemonId: n })),
    teams: [mkTeam('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])],
  })
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.click('[data-testid="tb-build-b1-open"]')
  await page.waitForSelector('[data-testid="tb-build-form"]')
  await page.waitForTimeout(400)

  /*
    ---- the selected slot is OUTLINED, and it has to be an outline

    A border takes part in layout, so the ring appearing would shift the whole
    rail -- which is measured against the stat table's Total row in 8b. The
    outline is declared on every card, transparent, and only its colour
    changes, which is also what lets it fade rather than snap.
  */
  const rings = await page.evaluate(() =>
    [...document.querySelectorAll('.tb-card-rail')].map((c) => {
      const cs = getComputedStyle(c)
      return {
        current: c.dataset.current === 'true',
        width: cs.outlineWidth,
        transparent: /rgba\(0, 0, 0, 0\)|transparent/.test(cs.outlineColor),
        transitions: cs.transitionProperty,
        border: cs.borderTopWidth,
      }
    }),
  )
  const marked = rings.filter((r) => r.current)
  const plain = rings.filter((r) => !r.current)
  check(
    'the slot being edited is the only one with a visible ring, and every card reserves the same width',
    marked.length === 1 &&
      !marked[0].transparent &&
      plain.length === 5 &&
      plain.every((r) => r.transparent) &&
      rings.every((r) => r.width === marked[0].width),
    `marked=${JSON.stringify(marked)} widths=${[...new Set(rings.map((r) => r.width))].join('/')}`,
  )
  check(
    'and it fades in rather than snapping, without a border that would move the rail',
    marked[0].transitions.includes('outline-color') && rings.every((r) => r.border === '0px'),
    `${marked[0].transitions} | border ${marked[0].border}`,
  )

  // =====================================================================
  /*
    13. THE TEAM LIBRARY CARD IS THE SAME CARD ON EVERY ROW.

    The cards were `flex: 1 1 0` and shared the row equally, so a team of one
    drew a single card as wide as the lane and a team of six drew six narrow
    ones. That is not only inconsistent: because the sprite is CENTRED in the
    card and the text is LEFT, the gap between them changed with the number of
    members, which is the "info position isn't well aligned with the sprites"
    complaint.

    The width is now a measured constant -- the rendered width of the longest
    type pair this app can show, plus 5px either side. The assertions below
    check the constant is still big enough rather than hardcoding it twice: the
    number lives in `--tb-compact-card` and the longest pair is measured here,
    in the browser, from the card's own markup.
  */
  hr('13. THE TEAM LIBRARY CARD')
  await seedStore({
    nextBuildSeq: 11,
    nextTeamSeq: 4,
    builds: [
      /* Magnezone is electric/steel and Heracross bug/fighting -- long pairs,
         so the row under test is not all four-letter types. */
      mkBuild('b1', { generation: 4, speciesId: 462, pokemonId: 462, abilityId: 42, itemId: 217 }),
      mkBuild('b2', { generation: 4, speciesId: 214, pokemonId: 214, abilityId: 62 }),
      mkBuild('b3', { generation: 4, speciesId: 145, pokemonId: 145, abilityId: 46 }),
      mkBuild('b4', { generation: 4, speciesId: 195, pokemonId: 195, abilityId: 6 }),
      mkBuild('b5', { generation: 4, speciesId: 437, pokemonId: 437, abilityId: 26 }),
      mkBuild('b6', { generation: 4, speciesId: 485, pokemonId: 485, abilityId: 18 }),
      mkBuild('b7', { generation: 4, speciesId: 1, pokemonId: 1, abilityId: 65 }),
      mkBuild('b8', { generation: 4, speciesId: 4, pokemonId: 4, abilityId: 66 }),
      mkBuild('b9', { generation: 4, speciesId: 7, pokemonId: 7, abilityId: 67 }),
      mkBuild('b10', { generation: 4, speciesId: 25, pokemonId: 25, abilityId: 9 }),
    ],
    teams: [
      mkTeam('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], { generation: 4 }),
      mkTeam('t2', 2, ['b7', 'b8', 'b9'], { generation: 4 }),
      mkTeam('t3', 3, ['b10'], { generation: 4 }),
    ],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.waitForTimeout(700)

  const cardGeometry = await page.evaluate(async () => {
    await document.fonts.ready
    const round = (n) => +n.toFixed(1)
    /*
      EVERY ORDERED PAIR OF THE 17 TYPES, rendered with the card's own markup in
      a detached host, so the number includes the uppercase transform, the
      tracking and the separator's margins. Computed from a font metric it would
      miss all three; hardcoded it would silently stop being true.
    */
    const TYPES = [
      'normal',
      'fire',
      'water',
      'electric',
      'grass',
      'ice',
      'fighting',
      'poison',
      'ground',
      'flying',
      'psychic',
      'bug',
      'rock',
      'ghost',
      'dragon',
      'dark',
      'steel',
    ]
    const host = document.createElement('div')
    host.className = 'tb tb-card tb-card-compact'
    host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden'
    const facts = document.createElement('span')
    facts.className = 'tb-card-facts'
    host.appendChild(facts)
    document.body.appendChild(host)
    const pairWidth = (a, b) => {
      facts.innerHTML =
        '<span class="tb-card-types" style="white-space:nowrap">' +
        `<span><span class="ds-type ds-type-sm" data-ds="type-label">${a}</span></span>` +
        `<span><span class="tb-type-sep">·</span><span class="ds-type ds-type-sm" data-ds="type-label">${b}</span></span>` +
        '</span>'
      return round(facts.querySelector('.tb-card-types').getBoundingClientRect().width)
    }
    let widest = { pair: '', w: 0 }
    for (const a of TYPES) {
      for (const b of TYPES) {
        if (a === b) continue
        const w = pairWidth(a, b)
        if (w > widest.w) widest = { pair: `${a} · ${b}`, w }
      }
    }
    host.remove()

    const rows = [...document.querySelectorAll('.tb-team-row')]
    const cards = rows.map((r) => [...r.querySelectorAll('.tb-card-compact')])
    const first = cards[0][0]
    const rect = (el) => (el ? el.getBoundingClientRect() : null)
    const card = rect(first)
    const art = rect(first.querySelector('.tb-card-art'))
    const frame = rect(first.querySelector('.tb-card-frame'))
    const held = rect(first.querySelector('.tb-held-item'))
    const ghost = rect(first.querySelector('.tb-card-ghost'))
    const line = (sel) => rect(first.querySelector(sel))
    const declared = parseFloat(
      getComputedStyle(document.querySelector('.tb')).getPropertyValue('--tb-compact-card'),
    )
    const inset = parseFloat(
      getComputedStyle(document.querySelector('.tb')).getPropertyValue('--tb-compact-inset'),
    )
    return {
      widest,
      declaredWidth: declared,
      inset,
      /* Every card on every row, however many members the team has. */
      widths: [...new Set(cards.flat().map((c) => round(c.getBoundingClientRect().width)))],
      heights: [...new Set(cards.flat().map((c) => round(c.getBoundingClientRect().height)))],
      rowHeights: rows.map((r) => round(r.getBoundingClientRect().height)),
      membersJustify: getComputedStyle(rows[0].querySelector('.tb-team-members')).justifyContent,
      /* The first card of each row starts at the same x: packed left, not centred. */
      firstCardLefts: cards.map((cs) => round(cs[0].getBoundingClientRect().x)),
      lineLefts: {
        name: round(line('.tb-card-headline').x - card.x),
        types: round(line('.tb-card-types').x - card.x),
        meta: round(line('.tb-card-meta').x - card.x),
      },
      typesJustify: getComputedStyle(first.querySelector('.tb-card-types')).justifyContent,
      /* Centred on the CARD, not on the inset text box. */
      artCentreOffset: round(art.x + art.width / 2 - (card.x + card.width / 2)),
      frameCentreOffset: round(frame.x + frame.width / 2 - (card.x + card.width / 2)),
      ghostCentreOffset: round(ghost.x + ghost.width / 2 - (card.x + card.width / 2)),
      /* The badge's own corner against the picture's corner: unchanged. */
      badge: { dx: round(held.right - frame.right), dy: round(held.bottom - frame.bottom) },
      lineHeight: getComputedStyle(first.querySelector('.tb-card-facts')).lineHeight,
    }
  })
  log(`  widest pair: ${JSON.stringify(cardGeometry.widest)}`)
  log(
    `  card ${cardGeometry.declaredWidth}px, widths ${cardGeometry.widths.join('/')}, heights ${cardGeometry.heights.join('/')}`,
  )
  log(
    `  rows ${cardGeometry.rowHeights.join(', ')} · line lefts ${JSON.stringify(cardGeometry.lineLefts)}`,
  )
  log(
    `  centres art ${cardGeometry.artCentreOffset} frame ${cardGeometry.frameCentreOffset} ghost ${cardGeometry.ghostCentreOffset}`,
  )

  check(
    'the fixed width still fits the longest type pair plus its inset either side',
    cardGeometry.declaredWidth >= cardGeometry.widest.w + cardGeometry.inset * 2,
    `${cardGeometry.declaredWidth} >= ${cardGeometry.widest.w} + ${cardGeometry.inset * 2} ("${cardGeometry.widest.pair}")`,
  )
  check(
    'and "electric · fighting" really is that pair, which is where the number came from',
    cardGeometry.widest.pair === 'electric · fighting',
    cardGeometry.widest.pair,
  )
  check(
    'every card is the same width and height whether its team holds one member or six',
    cardGeometry.widths.length === 1 &&
      cardGeometry.widths[0] === cardGeometry.declaredWidth &&
      cardGeometry.heights.length === 1,
    `widths ${cardGeometry.widths.join('/')} heights ${cardGeometry.heights.join('/')}`,
  )
  check(
    'the cards pack LEFT, so every row starts at the same x',
    cardGeometry.membersJustify === 'flex-start' && new Set(cardGeometry.firstCardLefts).size === 1,
    `${cardGeometry.membersJustify} · ${cardGeometry.firstCardLefts.join(',')}`,
  )
  check(
    'the name, the types and the meta line all start at the inset -- one left edge, not three',
    [cardGeometry.lineLefts.name, cardGeometry.lineLefts.types, cardGeometry.lineLefts.meta].every(
      (x) => Math.abs(x - cardGeometry.inset) <= 0.5,
    ),
    JSON.stringify(cardGeometry.lineLefts),
  )
  check(
    'the type run is CENTRED inside that box, while the lines around it are not',
    cardGeometry.typesJustify === 'center',
    cardGeometry.typesJustify,
  )
  check(
    'the sprite, its frame and the dex watermark are all centred on the CARD, not on the text box',
    Math.abs(cardGeometry.artCentreOffset) <= 0.5 &&
      Math.abs(cardGeometry.frameCentreOffset) <= 0.5 &&
      Math.abs(cardGeometry.ghostCentreOffset) <= 0.5,
    `art ${cardGeometry.artCentreOffset} frame ${cardGeometry.frameCentreOffset} ghost ${cardGeometry.ghostCentreOffset}`,
  )
  check(
    'and the held item still hangs off the picture’s bottom-right corner -- narrowing the card moved the pair together',
    Math.abs(cardGeometry.badge.dx) <= 6 && Math.abs(cardGeometry.badge.dy) <= 6,
    JSON.stringify(cardGeometry.badge),
  )
  check(
    "the card's lines carry the module's tight leading, not the page's 26px",
    parseFloat(cardGeometry.lineHeight) <= 16,
    cardGeometry.lineHeight,
  )
  check(
    'which is what makes a lane shorter than the card it used to hold',
    /* Was 167px with a 148px card. Asserted as a bound rather than a value so a
       different machine's font metrics cannot fail it. */
    cardGeometry.rowHeights.every((h) => h <= 140) && cardGeometry.heights[0] <= 120,
    `rows ${cardGeometry.rowHeights.join(',')} card ${cardGeometry.heights[0]}`,
  )

  // =====================================================================
  /*
    14. THE TEAM DISPLAY HAS TO FIT THE WINDOW.

    Six cards on screen at 100% zoom with the artwork as large as that allows.
    The sprite was 84px on a 483px-wide card, in a grid that sat BELOW a
    full-width header band -- so the one thing the screen exists to show was the
    smallest thing on it.

    THE SPRITE SIZE IS NOT ASSERTED AS A NUMBER, because it is not one: the art
    box takes whatever the seven text lines leave of a grid row, so it is a
    function of the window. What is asserted is the relationship -- all six
    visible, nothing scrolling, and the sprite growing when the window does.
  */
  hr('14. THE TEAM DISPLAY')
  const teamOfSix = () => ({
    nextBuildSeq: 7,
    nextTeamSeq: 2,
    builds: [
      /* A nickname on the first one, so the "(species)" parenthetical is on
         screen; genderless and female members so both glyph cases render. */
      mkBuild('b1', {
        generation: 4,
        speciesId: 462,
        pokemonId: 462,
        abilityId: 42,
        natureId: 3,
        nickname: 'Magnetron',
        level: 100,
        itemId: moveIds2.leftovers,
        effort: { hp: 252, 'special-attack': 252, speed: 6 },
        moveIds: [moveIds2.razorLeaf, moveIds2.sludgeBomb, moveIds2.toxic, moveIds2.seismicToss],
      }),
      mkBuild('b2', { generation: 4, speciesId: 214, pokemonId: 214, abilityId: 62, natureId: 3 }),
      mkBuild('b3', { generation: 4, speciesId: 145, pokemonId: 145, abilityId: 46, natureId: 3 }),
      mkBuild('b4', {
        generation: 4,
        speciesId: 195,
        pokemonId: 195,
        abilityId: 6,
        natureId: 3,
        gender: 'female',
      }),
      mkBuild('b5', {
        generation: 4,
        speciesId: 437,
        pokemonId: 437,
        abilityId: 26,
        natureId: 3,
        gender: null,
      }),
      mkBuild('b6', {
        generation: 4,
        speciesId: 485,
        pokemonId: 485,
        abilityId: 18,
        natureId: 3,
        gender: null,
      }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], { generation: 4 })],
  })
  await seedStore(teamOfSix())
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(1000)

  const display = await page.evaluate(async () => {
    await document.fonts.ready
    const r = (n) => +n.toFixed(1)
    const rect = (el) => {
      const b = el.getBoundingClientRect()
      return { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height), right: r(b.right) }
    }
    const card = document.querySelector('.tb-card-full')
    const facts = card.querySelector('.tb-card-facts')
    /*
      THE READING ORDER, taken from the DOM rather than from the stylesheet: the
      direct children of the facts block, in order, with what each one holds.
    */
    const order = [...facts.children].map((el) => ({
      cls: el.className,
      /* The headline and the id line are each several spans; name what is in
         them so the assertion can be about the ORDER of facts, not of classes. */
      /* The module class only: several of these also carry the `num` utility,
         and the assertion is about which FACT is where, not about class lists. */
      holds: [...el.querySelectorAll('[class]')]
        .map(
          (x) => (/(tb-card-(?:name|species|gender|level|types|meta))/.exec(x.className) ?? [])[1],
        )
        .filter(Boolean),
    }))
    /*
      CAP HEIGHT, MEASURED, because the card is set at two nominal sizes on
      purpose and the claim is about the DRAWN one. Measured at 100px and scaled
      by the element's own size: `measureText` at 8px rounds to whole pixels, so
      comparing two 10px faces directly cannot resolve a difference smaller than
      the one being tested for.
    */
    const cv = document.createElement('canvas').getContext('2d')
    const drawn = (cs) => {
      cv.font = `${cs.fontWeight} 100px ${cs.fontFamily}`
      const m = cv.measureText('H')
      return r((m.actualBoundingBoxAscent / 100) * parseFloat(cs.fontSize))
    }
    const style = (sel) => {
      const el = card.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        fs: cs.fontSize,
        fw: cs.fontWeight,
        family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        cap: drawn(cs),
        line: r(el.getBoundingClientRect().height),
      }
    }
    return {
      order,
      /* Every line, so "one size, weights untouched" can be checked as one fact. */
      styles: {
        name: style('.tb-card-name'),
        species: style('.tb-card-species'),
        gender: style('.tb-card-gender'),
        level: style('.tb-card-level'),
        type: style('.tb-card-types [data-ds="type-label"]'),
        meta: style('.tb-card-meta'),
        spread: style('.tb-card-spread'),
        moveName: style('.tb-move-name'),
        moveCat: style('.tb-move-cat'),
        /* Unsized, this one drew at the PAGE's 18px body -- see the note on
           .tb-card-full .tb-card-facts. */
        sep: style('.tb-meta-sep'),
      },
      /*
        Every line box in the facts block, which is what the leading buys. The
        move grid is four lines rather than one, so it contributes its CELLS.
      */
      lineBoxes: [
        ...[...facts.children].filter((el) => !el.classList.contains('tb-card-moves')),
        ...facts.querySelectorAll('.tb-move-name'),
      ].map((el) => r(el.getBoundingClientRect().height)),
      leading: parseFloat(
        getComputedStyle(document.querySelector('.tb')).getPropertyValue('--tb-slot-line'),
      ),
      moveRows: card.querySelectorAll('.tb-move').length,
      separators: card.querySelectorAll('.tb-meta-sep').length,
      idLine: card.querySelectorAll('.tb-card-idline').length,
      head: rect(document.querySelector('.tb-team-viewer .tb-screen-head')),
      grid: rect(document.querySelector('[data-testid="tb-slot-grid"]')),
      cardBox: rect(card),
      art: rect(card.querySelector('.tb-card-art')),
      frame: rect(card.querySelector('.tb-card-frame')),
      held: (() => {
        const el = card.querySelector('.tb-held-item')
        return el ? rect(el) : null
      })(),
      declaredWidth: parseFloat(
        getComputedStyle(document.querySelector('.tb')).getPropertyValue('--tb-slot-card'),
      ),
      cardWidths: [
        ...new Set(
          [...document.querySelectorAll('.tb-card-full')].map((c) =>
            r(c.getBoundingClientRect().width),
          ),
        ),
      ],
    }
  })
  log(`  facts order: ${display.order.map((o) => o.holds.join('+') || o.cls).join(' / ')}`)
  log(`  card ${display.cardBox.w}x${display.cardBox.h}, art ${display.art.w}x${display.art.h}`)
  log(`  styles: ${JSON.stringify(display.styles)}`)

  check(
    'line 1 is the nickname, the species in parentheses, the gender and the level -- in that order',
    JSON.stringify(display.order[0]?.holds) ===
      JSON.stringify(['tb-card-name', 'tb-card-species', 'tb-card-gender', 'tb-card-level']),
    JSON.stringify(display.order[0]),
  )
  check(
    'line 2 is the types, then the nature, then the ability, bar-separated on ONE line',
    display.idLine === 1 &&
      display.separators === 2 &&
      /tb-card-idline/.test(display.order[1]?.cls ?? '') &&
      display.order[1].holds.filter((c) => /tb-card-meta/.test(c)).length === 2,
    `idline=${display.idLine} seps=${display.separators} holds=${display.order[1]?.holds.join('+')}`,
  )
  check(
    'then the spread, then the four move rows -- seven lines, no more',
    /tb-card-spread/.test(display.order[2]?.cls ?? '') &&
      /tb-card-moves/.test(display.order[3]?.cls ?? '') &&
      display.order.length === 4 &&
      display.moveRows === 4,
    `${display.order.map((o) => o.cls).join(' / ')} · ${display.moveRows} moves`,
  )
  /*
    ONE DRAWN SIZE, TWO NOMINAL ONES. Levelling the nominal size is what this
    used to assert, and it was not enough: Martian Mono draws about a fifth
    larger than IBM Plex Sans at the same px, and the mono lines here are the
    long ones -- the nickname, the level, the EV spread and all four move names
    -- so the card read as two sizes and looked a size bigger than it was set.
  */
  const caps = Object.values(display.styles).map((x) => x.cap)
  check(
    'every line on the card DRAWS at one size -- cap heights within half a pixel',
    Math.max(...caps) - Math.min(...caps) <= 0.5,
    Object.entries(display.styles)
      .map(([k, v]) => `${k} ${v.fs}=${v.cap}`)
      .join(' '),
  )
  check(
    'and it takes two nominal sizes to do it: the mono lines are set SMALLER than the sans ones',
    parseFloat(display.styles.name.fs) < parseFloat(display.styles.meta.fs) &&
      display.styles.name.fs === display.styles.spread.fs &&
      display.styles.name.fs === display.styles.moveName.fs &&
      display.styles.name.fs === display.styles.level.fs &&
      /* And nothing is left inheriting the page's 18px body. */
      display.styles.sep.fs === display.styles.meta.fs,
    `mono ${display.styles.name.fs} vs sans ${display.styles.meta.fs}, sep ${display.styles.sep.fs}`,
  )
  check(
    "every line box is the module's tight leading, not the page's 26px",
    new Set(display.lineBoxes).size === 1 && display.lineBoxes[0] === display.leading,
    `${[...new Set(display.lineBoxes)].join('/')} vs --tb-slot-line ${display.leading}`,
  )
  check(
    'and the weights and families are UNTOUCHED -- only the size was levelled',
    /* The name and the numbers stay numeric-face, the gender and the type run
       stay bold, the rest stay regular sans. Levelling the size by setting one
       rule on the facts block would have flattened all of this. */
    display.styles.name.family === 'Martian Mono' &&
      display.styles.spread.family === 'Martian Mono' &&
      display.styles.moveName.family === 'Martian Mono' &&
      display.styles.gender.fw === '700' &&
      display.styles.type.fw === '700' &&
      display.styles.meta.fw === '400' &&
      display.styles.species.family === 'IBM Plex Sans',
    JSON.stringify(display.styles),
  )
  check(
    'the grid sits BESIDE the header, not below it',
    display.head.right <= display.grid.x + 0.5 && Math.abs(display.head.y - display.grid.y) <= 0.5,
    `head right ${display.head.right} vs grid x ${display.grid.x}, tops ${display.head.y}/${display.grid.y}`,
  )
  check(
    'every card is the declared width, three to a row',
    display.cardWidths.length === 1 && display.cardWidths[0] === display.declaredWidth,
    `${display.cardWidths.join('/')} vs ${display.declaredWidth}`,
  )
  check(
    'the sprite frame is SQUARE and inside its card -- an art box taller than the card is wide would clip it',
    Math.abs(display.frame.w - display.frame.h) <= 0.5 &&
      display.frame.w <= display.cardBox.w + 0.5,
    `${display.frame.w}x${display.frame.h} in ${display.cardBox.w}`,
  )
  if (display.held) {
    check(
      'and the held item still hangs off the picture’s corner at this much larger size',
      Math.abs(display.held.right - display.frame.right) <= 8,
      `dx ${(display.held.right - display.frame.right).toFixed(1)}`,
    )
  }

  /*
    ---- THE MOVE ROW FITS COMFORTABLY, measured against the whole bundle

    The width was asked to be driven by the move row. Rather than trusting that,
    this measures every Gen 1-4 move name in the card's own face and checks the
    widest one still has room beside the type and category columns.
  */
  const moveFit = await page.evaluate(async () => {
    await document.fonts.ready
    const d = await import('/pokeapp/src/data/index.ts')
    const names = d
      .listMoves()
      .filter((m) => (m.generation_id ?? 1) <= 4)
      .map((m) => m.display_name ?? m.name)
    const cv = document.createElement('canvas').getContext('2d')
    const nameEl = document.querySelector('.tb-card-full .tb-move-name')
    const ncs = getComputedStyle(nameEl)
    cv.font = `${ncs.fontSize} ${ncs.fontFamily}`
    let widest = { name: '', w: 0 }
    for (const n of names) {
      /* The tilde prefix and the event asterisk are both part of the cell. */
      const w = cv.measureText(`~ ${n}*`).width
      if (w > widest.w) widest = { name: n, w: +w.toFixed(1) }
    }
    const cell = (sel) =>
      +document.querySelector(`.tb-card-full ${sel}`).getBoundingClientRect().width.toFixed(1)
    return { widest, nameCell: cell('.tb-move-name'), catCell: cell('.tb-move-cat') }
  })
  log(
    `  widest move name "${moveFit.widest.name}" ${moveFit.widest.w}px in a ${moveFit.nameCell}px cell`,
  )
  check(
    'the move-name column comfortably fits the widest move name in the bundle, asterisk included',
    moveFit.nameCell >= moveFit.widest.w + 12,
    `${moveFit.nameCell} >= ${moveFit.widest.w} + 12 ("${moveFit.widest.name}")`,
  )

  /*
    ---- ALL SIX ON SCREEN, AT EVERY WINDOW HEIGHT WORTH HAVING

    And the sprite grows with the window rather than being a number picked for
    one screen, which is the point of sizing it from the remainder.
  */
  const before = page.viewportSize()
  const perHeight = []
  for (const h of [1080, 900, 820, 768, 720]) {
    await page.setViewportSize({ width: 1600, height: h })
    await page.waitForTimeout(300)
    perHeight.push({
      h,
      ...(await page.evaluate(() => {
        const sc = document.querySelector('.scroll-area')
        const cards = [...document.querySelectorAll('.tb-card-full')]
        const last = cards.at(-1).getBoundingClientRect()
        return {
          overflow: sc.scrollHeight - sc.clientHeight,
          lastVisible: last.bottom <= sc.getBoundingClientRect().bottom + 0.5,
          sprite: Math.round(cards[0].querySelector('.tb-card-art').getBoundingClientRect().height),
        }
      })),
    })
  }
  await page.setViewportSize(before)
  await page.waitForTimeout(300)
  log(`  ${perHeight.map((p) => `${p.h}:${p.sprite}px`).join(' ')}`)
  check(
    'all six cards are on screen with nothing scrolling, from a 720px window up to 1080',
    perHeight.every((p) => p.overflow === 0 && p.lastVisible),
    perHeight.map((p) => `${p.h}:${p.overflow}/${p.lastVisible}`).join(' '),
  )
  check(
    'and the sprite is sized from what is left over, so a taller window draws a bigger one',
    perHeight[0].sprite > perHeight.at(-1).sprite &&
      /* Three times the 84px it used to be, at the smallest window tested. */
      perHeight.at(-1).sprite >= 150,
    perHeight.map((p) => `${p.h}:${p.sprite}`).join(' '),
  )

  /*
    ---- AND THE BUILD LIBRARY CARD WAS NOT TOUCHED

    The reorder is scoped to the `full` variant on purpose: the library card was
    reviewed and signed off with the species on its own line and the nature and
    ability dot-separated. This is the guard that a change to one did not reach
    the other.
  */
  await goTo('build-library')
  await page.waitForSelector('[data-testid="tb-build-grid"]')
  await page.waitForTimeout(500)
  const libraryCard = await page.evaluate(() => {
    const card = document.querySelector('.tb-card-library')
    const facts = card.querySelector('.tb-card-facts')
    return {
      order: [...facts.children].map((e) => e.className),
      idLines: card.querySelectorAll('.tb-card-idline').length,
      separators: card.querySelectorAll('.tb-meta-sep').length,
      speciesInHeadline: card.querySelectorAll('.tb-card-headline .tb-card-species').length,
    }
  })
  log(`  library order: ${libraryCard.order.join(' / ')}`)
  check(
    'the Build Library card keeps its own order: species on its own line, no id line, no bars',
    libraryCard.idLines === 0 &&
      libraryCard.separators === 0 &&
      libraryCard.speciesInHeadline === 0 &&
      libraryCard.order.some((c) => /tb-card-species/.test(c)) &&
      libraryCard.order.some((c) => /tb-card-meta/.test(c)),
    JSON.stringify(libraryCard),
  )

  // =====================================================================
  /*
    15. THE COVERAGE PANELS ARE NOT CLIPPED

    Both of them were, and by two different ancestors, which is why the fix is
    "place it in the app frame" rather than a spacing change:

      A MEMBER's panel hung off `.tb-corner-tr` INSIDE `.tb-card`, which sets
      `overflow: hidden` -- it has to, the ghost watermark and the artwork both
      bleed to the card's edge. On the Team Display the card is 264px wide and
      the panel is wider than that and taller than a grid row, so it lost its
      right edge and its bottom rows.

      THE TEAM's panel hangs off a dock that now sits in the narrow left column,
      and right-aligned there it started at a NEGATIVE x -- outside the app.

    So this drives all FOUR real panels -- a member's two and the team's two --
    and checks three things about each: that nothing clips them, that they are
    inside the app frame, and that all of their content is reachable. At two
    window heights, because the team panels (fourteen and seventeen rows) are
    taller than a short window and must then flip or scroll rather than run off
    the bottom.
  */
  hr('15. THE COVERAGE PANELS FIT THE WINDOW')
  await seedStore(teamOfSix())
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(600)

  const panelProbe = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = (n) => +n.toFixed(1)
    const b = el.getBoundingClientRect()
    const frame = document.querySelector('.panel').getBoundingClientRect()
    /* Every ancestor that could clip, and by how much it actually does. */
    const cuts = []
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (!/hidden|auto|scroll|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue
      const pb = p.getBoundingClientRect()
      const cut = {
        who: (p.className.toString() || p.tagName).slice(0, 30),
        left: r(Math.max(0, pb.left - b.left)),
        right: r(Math.max(0, b.right - pb.right)),
        top: r(Math.max(0, pb.top - b.top)),
        bottom: r(Math.max(0, b.bottom - pb.bottom)),
      }
      if (cut.left || cut.right || cut.top || cut.bottom) cuts.push(cut)
    }
    return {
      /* Portalled: its parent is the body, not the card it hangs off. */
      portalled: el.parentElement === document.body,
      box: { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) },
      cuts,
      /* Inside the app's own surface, not merely inside the window. */
      insideFrame:
        b.left >= frame.left - 0.5 &&
        b.right <= frame.right + 0.5 &&
        b.top >= frame.top - 0.5 &&
        b.bottom <= frame.bottom + 0.5,
      /* Nothing unreadable: either it all fits, or the panel itself scrolls. */
      reachable:
        el.scrollHeight <= el.clientHeight + 1 || getComputedStyle(el).overflowY !== 'visible',
      hidden: r(el.scrollHeight - el.clientHeight),
      /*
        AND THE MODULE'S TOKENS STILL REACH IT. Portalling to the body took the
        panel out of `.tb`, where the --tb-* scale is declared -- and an
        unresolved custom property invalidates the whole declaration rather
        than falling back, so `gap: var(--tb-3) var(--tb-4)` computed to
        `normal` and the type run ran into the note beside it with no space.

        `null` for a panel with no such element to measure: a table-only panel
        has no flex row, and a member with no damaging moves renders a sentence
        rather than a chart. The check below requires several REAL readings, so
        this cannot quietly pass by measuring nothing.
      */
      gap: (() => {
        const flex = el.querySelector('.tb-matchup-note, .tb-matchup-col')
        return flex ? getComputedStyle(flex).gap : null
      })(),
    }
  }

  const panels = []
  for (const h of [900, 700]) {
    await page.setViewportSize({ width: 1600, height: h })
    await page.waitForTimeout(400)
    /* A member's own panels, off a card in the BOTTOM row -- the worst case
       for a panel that opens downwards. */
    for (const which of ['matchup', 'offence']) {
      await page.hover('[data-testid="tb-slot-5"]')
      await page.click(`[data-testid="tb-slot-5-${which}"]`)
      await page.waitForSelector(`[data-testid="tb-slot-5-${which}-popover"]`)
      await page.waitForTimeout(250)
      panels.push({
        h,
        what: `member-${which}`,
        ...(await page.evaluate(panelProbe, `[data-testid="tb-slot-5-${which}-popover"]`)),
      })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
    /* And the team's two, off the dock in the narrow left column. */
    for (const which of ['coverage', 'offence']) {
      await page.click(`[data-testid="tb-viewer-${which}"]`)
      await page.waitForSelector(`[data-testid="tb-viewer-${which}-popover"]`)
      await page.waitForTimeout(250)
      panels.push({
        h,
        what: `team-${which}`,
        ...(await page.evaluate(panelProbe, `[data-testid="tb-viewer-${which}-popover"]`)),
      })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.waitForTimeout(300)
  for (const p of panels) {
    log(
      `  ${p.what}@${p.h}: ${p.box.w}x${p.box.h} at ${p.box.x},${p.box.y}` +
        ` frame=${p.insideFrame} cuts=${JSON.stringify(p.cuts)} hidden=${p.hidden}`,
    )
  }
  check(
    'all four panels are portalled to the body, so no card can clip them',
    panels.length === 8 && panels.every((p) => p.portalled),
    panels.map((p) => `${p.what}@${p.h}:${p.portalled}`).join(' '),
  )
  check(
    'nothing clips any panel on any edge, at either window height',
    panels.every((p) => p.cuts.length === 0),
    JSON.stringify(panels.filter((p) => p.cuts.length).map((p) => [p.what, p.h, p.cuts])),
  )
  check(
    "and all of them sit inside the app's own surface, not just inside the window",
    panels.every((p) => p.insideFrame),
    panels.map((p) => `${p.what}@${p.h}:${p.insideFrame}`).join(' '),
  )
  check(
    'every row of them is reachable -- a panel taller than the room scrolls itself',
    panels.every((p) => p.reachable),
    panels.map((p) => `${p.what}@${p.h}:${p.hidden}px hidden`).join(' '),
  )
  const gaps = panels.filter((p) => p.gap != null)
  check(
    "the module's own spacing scale still resolves inside a portalled panel",
    gaps.length >= 4 && gaps.every((p) => p.gap !== 'normal'),
    `${gaps.length} measured: ${gaps.map((p) => `${p.what}@${p.h}:${p.gap}`).join(' ')}`,
  )

  // =====================================================================
  /*
    16. THE TEAM, DEALING DAMAGE

    The Team Viewer now answers the offensive question at both scopes: per
    member it is the same panel the Build Form shows, and for the team it is a
    new one. Both are checked against a team whose numbers can be derived by
    hand:

      b1  Razor Leaf, Sludge Bomb, Toxic, Seismic Toss  -> grass, poison
      b2  Earthquake, Rock Slide, Double-Edge, Rest     -> ground, rock, normal
      b3  Razor Leaf                                    -> grass

    so six of nine moves count (Toxic and Rest are status, Seismic Toss is fixed
    damage, and the empty slots are not moves at all), and the team brings five
    attacking types. From those:

      water   grass hits it 2x, and TWO members carry grass          -> 2, 2x
      rock    all three have something super effective on it         -> 3, 2x
      steel   only b2's Earthquake                                   -> 1, 2x
      normal  nothing here is super effective against it            -> 0, 1x
      ghost   normal 0x, poison 0.5x; the best is grass/ground at 1x -> 0, 1x

    The zero rows are the point of the panel -- a type no member can hit hard is
    a Pokemon this team cannot break -- so they sort to the top and carry the
    same marker the defensive table gives a shared weakness.
  */
  hr('16. THE TEAM, DEALING DAMAGE')
  const offMoves = await page.evaluate(async () => {
    const d = await import('/pokeapp/src/data/index.ts')
    const m = {}
    for (const x of d.listMoves()) m[x.name] = x.id
    return {
      razorLeaf: m['razor-leaf'],
      sludgeBomb: m['sludge-bomb'],
      toxic: m['toxic'],
      seismicToss: m['seismic-toss'],
      earthquake: m['earthquake'],
      rockSlide: m['rock-slide'],
      doubleEdge: m['double-edge'],
      rest: m['rest'],
    }
  })
  await seedStore({
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', {
        generation: 4,
        speciesId: 3,
        pokemonId: 3,
        moveIds: [offMoves.razorLeaf, offMoves.sludgeBomb, offMoves.toxic, offMoves.seismicToss],
      }),
      mkBuild('b2', {
        generation: 4,
        speciesId: 306,
        pokemonId: 306,
        moveIds: [offMoves.earthquake, offMoves.rockSlide, offMoves.doubleEdge, offMoves.rest],
      }),
      mkBuild('b3', {
        generation: 4,
        speciesId: 254,
        pokemonId: 254,
        moveIds: [offMoves.razorLeaf, null, null, null],
      }),
    ],
    teams: [mkTeam('t1', 1, ['b1', 'b2', 'b3'], { generation: 4 })],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(800)

  // ---- the team's panel
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForSelector('[data-testid="tb-viewer-offence-popover"]')
  await page.waitForTimeout(300)
  const teamOff = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-team-offense"]')
    return {
      title: scope.querySelector('.tb-matchup-title').textContent.trim(),
      brought: [...scope.querySelectorAll('.tb-matchup-note [data-ds="type-label"]')].map(
        (e) => e.dataset.type,
      ),
      note: scope.querySelector('.tb-matchup-ignored')?.textContent?.trim() ?? '',
      heads: [...scope.querySelectorAll('th')].map((e) => e.textContent.trim()),
      rows: [...scope.querySelectorAll('tbody tr')].map((tr) => ({
        type: tr.dataset.type,
        hits: +tr.children[1].textContent.trim(),
        best: tr.children[2].textContent.trim(),
        marked: tr.children[1].dataset.hole === 'true',
      })),
    }
  })
  const offRow = (t) => teamOff.rows.find((r) => r.type === t)
  log(`  ${teamOff.title} · brought ${teamOff.brought.join(',')} · ${teamOff.note}`)
  log(`  ${teamOff.rows.map((r) => `${r.type}:${r.hits}/${r.best}`).join(' ')}`)
  check(
    'the team panel counts the whole team and says how many of its moves it could use',
    teamOff.title === 'Team offence · 3 members' && teamOff.note === '6 of 9 moves counted',
    `${teamOff.title} | ${teamOff.note}`,
  )
  check(
    "it brings the UNION of its members' damaging types, status and fixed damage excluded",
    JSON.stringify([...teamOff.brought].sort()) ===
      JSON.stringify(['grass', 'ground', 'normal', 'poison', 'rock']),
    teamOff.brought.join(','),
  )
  check(
    'one row per defending type in this generation, headed Type | Hits hard | Best',
    teamOff.rows.length === 17 &&
      JSON.stringify(teamOff.heads) === JSON.stringify(['Type', 'Hits hard', 'Best']),
    `${teamOff.rows.length} rows: ${teamOff.heads.join(' | ')}`,
  )
  check(
    'the count is MEMBERS with a super-effective answer, not types: two members carry grass, so Water reads 2',
    offRow('water')?.hits === 2 && offRow('water')?.best === '2x' && offRow('rock')?.hits === 3,
    `water ${offRow('water')?.hits}/${offRow('water')?.best}, rock ${offRow('rock')?.hits}`,
  )
  check(
    "and one member's Earthquake is the only answer to Steel",
    offRow('steel')?.hits === 1 && offRow('steel')?.best === '2x',
    `steel ${offRow('steel')?.hits}/${offRow('steel')?.best}`,
  )
  check(
    'a type nothing on the team hits hard reads 0, and carries the BEST the team can manage',
    offRow('normal')?.hits === 0 &&
      offRow('normal')?.best === '1x' &&
      offRow('ghost')?.hits === 0 &&
      offRow('ghost')?.best === '1x',
    `normal ${offRow('normal')?.hits}/${offRow('normal')?.best},` +
      ` ghost ${offRow('ghost')?.hits}/${offRow('ghost')?.best}`,
  )
  check(
    'the holes sort to the TOP -- the opposite of the defensive table, where the high count leads',
    teamOff.rows.slice(0, 6).every((r) => r.hits === 0 && r.marked) &&
      teamOff.rows.slice(6).every((r) => r.hits > 0 && !r.marked) &&
      teamOff.rows.at(-1).hits === 3,
    teamOff.rows.map((r) => r.hits).join(''),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // ---- and each member's own, which is the panel the Build Form shows
  await page.hover('[data-testid="tb-slot-0"]')
  await page.click('[data-testid="tb-slot-0-offence"]')
  await page.waitForSelector('[data-testid="tb-slot-0-offence-popover"]')
  await page.waitForTimeout(300)
  const memberOff = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-offense"]')
    return {
      title: scope.querySelector('.tb-matchup-title').textContent.trim(),
      note: scope.querySelector('.tb-matchup-ignored')?.textContent?.trim() ?? '',
      cols: [...scope.querySelectorAll('.tb-matchup-col')].map((col) => ({
        label: col.querySelector('.tb-matchup-label').textContent.trim(),
        tiers: [...col.querySelectorAll('.tb-matchup-tier')].map((t) => ({
          mult: t.querySelector('.tb-matchup-mult').textContent.trim(),
          types: [...t.querySelectorAll('[data-ds="type-label"]')].map((x) => x.dataset.type),
        })),
      })),
    }
  })
  log(`  ${memberOff.title} · ${memberOff.note}`)
  const memberHits = memberOff.cols.find((c) => c.label === 'Hits hard')
  log(`  hits hard: ${JSON.stringify(memberHits)}`)
  check(
    "a member's panel is the one the Build Form shows, titled with its own species",
    memberOff.title === 'Venusaur · dealing damage' && memberOff.note === '2 of 4 moves counted',
    `${memberOff.title} | ${memberOff.note}`,
  )
  check(
    'and it reports that build alone: Razor Leaf and Sludge Bomb, nothing a team-mate carries',
    memberHits != null &&
      memberHits.tiers.length === 1 &&
      memberHits.tiers[0].mult === '2x' &&
      ['grass', 'ground', 'rock', 'water'].every((t) => memberHits.tiers[0].types.includes(t)) &&
      /* Steel is b2's Earthquake, and must not leak into b1's panel. */
      !memberHits.tiers[0].types.includes('steel'),
    JSON.stringify(memberHits),
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // ---- both icons live in the same corner, in the module's own order
  await page.hover('[data-testid="tb-slot-0"]')
  await page.waitForTimeout(200)
  const cornerPair = await page.evaluate(() => {
    const card = document.querySelector('.tb-card-full')
    const tr = card.querySelector('.tb-corner-tr')
    const cb = card.getBoundingClientRect()
    const btns = [...tr.querySelectorAll('button')]
    return {
      ids: btns.map((b) => b.dataset.testid),
      xs: btns.map((b) => +b.getBoundingClientRect().x.toFixed(1)),
      widths: btns.map((b) => +b.getBoundingClientRect().width.toFixed(1)),
      /* Still pinned to the card's own corner, not pushed off it. */
      dx: +(tr.getBoundingClientRect().right - cb.right).toFixed(1),
      display: getComputedStyle(tr).display,
    }
  })
  log(`  corner: ${cornerPair.ids.join(' ')} at ${cornerPair.xs.join(',')} (${cornerPair.display})`)
  check(
    'the shield comes before the swords, the same order as every dock in the module',
    JSON.stringify(cornerPair.ids) === JSON.stringify(['tb-slot-0-matchup', 'tb-slot-0-offence']) &&
      cornerPair.xs[0] < cornerPair.xs[1] &&
      Math.abs(cornerPair.dx) <= 0.5,
    `${cornerPair.ids.join(',')} dx ${cornerPair.dx}`,
  )
  check(
    'and they sit against each other rather than with a word space between them',
    /* A flex row, so the two buttons touch. As a plain span they were inline
       boxes and the newline between them in the JSX was a word space. */
    /flex$/.test(cornerPair.display) &&
      Math.abs(cornerPair.xs[1] - cornerPair.xs[0] - cornerPair.widths[0]) <= 0.5,
    `${cornerPair.display}, ${(cornerPair.xs[1] - cornerPair.xs[0]).toFixed(1)}px apart` +
      ` for a ${cornerPair.widths[0]}px button`,
  )

  // ---- a team with nothing but status moves has NO coverage, and says so
  await seedStore({
    nextBuildSeq: 2,
    nextTeamSeq: 2,
    builds: [
      mkBuild('b1', {
        generation: 4,
        speciesId: 3,
        pokemonId: 3,
        moveIds: [offMoves.toxic, offMoves.rest, null, null],
      }),
    ],
    teams: [mkTeam('t1', 1, ['b1'], { generation: 4 })],
  })
  await goTo('my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.mouse.move(800, 940)
  await page.click('[data-testid="tb-team-t1-open"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"]')
  await page.waitForTimeout(600)
  await page.click('[data-testid="tb-viewer-offence"]')
  await page.waitForSelector('[data-testid="tb-viewer-offence-popover"]')
  await page.waitForTimeout(250)
  const noCoverage = await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="tb-matchup-team-offense"]')
    const empty = scope.querySelector('[data-testid="tb-matchup-team-offense-empty"]')
    return {
      empty: empty?.textContent ?? '',
      tables: scope.querySelectorAll('table').length,
      title: scope.querySelector('.tb-matchup-title').textContent.trim(),
    }
  })
  log(`  ${noCoverage.title}: ${noCoverage.empty.slice(0, 60)}`)
  check(
    'a team with only status moves gets the no-coverage answer, not a table of 1x rows',
    noCoverage.tables === 0 &&
      /no coverage to show/i.test(noCoverage.empty) &&
      noCoverage.title === 'Team offence · 1 member',
    `${noCoverage.tables} tables · ${noCoverage.title}`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

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
  /*
    GHOST MEANS NO BOX. Every visible action in this module is glyph-and-text on
    the page; an outlined button is an outlined button whatever its fill. Checked
    as a computed style rather than by reading the stylesheet, so a border
    arriving from any other rule is caught too.
  */
  const boxed = await page.evaluate(() =>
    [...document.querySelectorAll('.tb button, .tb .tb-card-empty')]
      .filter((el) => {
        const cs = getComputedStyle(el)
        return cs.borderTopStyle !== 'none' && cs.borderTopWidth !== '0px'
      })
      .map((el) => el.className)
      .slice(0, 8),
  )
  check(
    'no button or empty slot in the module draws an outline',
    boxed.length === 0,
    boxed.join(' | '),
  )

  check('no console or page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

  hr(failures.length ? `FAILED — ${failures.length} check(s)` : 'ALL CHECKS PASSED')
  for (const f of failures) log(`  - ${f}`)
} finally {
  if (browser) await browser.close()
  dev.stop()
}

process.exit(failures.length ? 1 : 0)
