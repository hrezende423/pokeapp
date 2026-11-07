/**
 * Team transfer: Showdown text in and out, the Build name, tag search, and
 * Build-vs-Build comparison. Acceptance for docs/SPEC.md slice A.
 *
 * The text rules run against the real modules in the page, so they read the real
 * bundle. The screens run against a seeded document.
 */

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startDevServer } from './lib/devServer.mjs'
import { selectGeneration, withControlsOn } from './lib/controls.mjs'
import { goToPage } from './lib/nav.mjs'

const PORT = 4204
const KEY = 'pokeapp:team-builder:v1'
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

const dev = await startDevServer({ port: PORT })
let browser
try {
  browser = await chromium.launch()
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(180000)
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  await page.goto(dev.url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="nav-tab-tools"]', { timeout: 180000 })
  await selectGeneration(page, 4)

  // ------------------------------------------------------------------ 1
  hr('1. THE TEXT RULES, against the real bundle')
  const r = await page.evaluate(async () => {
    const sd = await import('/pokeapp/src/modules/team-builder/showdown.ts')
    const si = await import('/pokeapp/src/modules/team-builder/showdownImport.ts')
    const d = await import('/pokeapp/src/data/index.ts')
    const move = (name) => d.listMoves().find((m) => m.name === name).id
    const ability = (name) => d.listAbilities().find((a) => a.name === name).id
    const item = (name) => d.listItems().find((i) => i.name === name).id
    const nature = (name) => d.listNatures().find((n) => n.name === name).id
    const base = {
      id: 'x',
      nickname: '',
      gender: null,
      shiny: false,
      friendship: 255,
      itemId: null,
      abilityId: null,
      natureId: null,
      moveIds: [null, null, null, null],
      effort: {},
      individual: {},
      tags: [],
      notes: '',
    }
    const gen4 = {
      ...base,
      generation: 4,
      speciesId: 445,
      pokemonId: 445,
      nickname: 'Rocky',
      gender: 'male',
      level: 78,
      itemId: item('choice-scarf'),
      abilityId: ability('sand-veil'),
      natureId: nature('jolly'),
      moveIds: [move('earthquake'), move('dragon-claw'), move('stone-edge'), move('fire-fang')],
      effort: { attack: 252, defense: 4, speed: 252 },
      individual: { hp: 31, attack: 31, defense: 30, 'special-attack': 12, 'special-defense': 31, speed: 31 },
    }
    const text4 = si.exportBuilds([gen4])
    const back = (await si.resolveImport(text4, 4, 'build')).items[0]
    const same = (k) => JSON.stringify(gen4[k]) === JSON.stringify(back.build[k])
    const gen1 = {
      ...base,
      generation: 1,
      speciesId: 25,
      pokemonId: 25,
      level: 50,
      gender: 'female',
      friendship: 70,
      itemId: item('leftovers'),
      abilityId: ability('static'),
      natureId: nature('jolly'),
      effort: { hp: 65535, attack: 65535, defense: 65535, speed: 65535, special: 65535 },
      individual: { attack: 15, defense: 15, speed: 15, special: 15 },
    }
    const gen2 = {
      ...base,
      generation: 2,
      speciesId: 248,
      pokemonId: 248,
      level: 100,
      gender: 'male',
      abilityId: ability('sand-stream'),
      natureId: nature('adamant'),
      effort: { hp: 65535, attack: 65535, defense: 40000, speed: 0, special: 0 },
      individual: { attack: 14, defense: 15, speed: 15, special: 15 },
    }
    const text1 = si.exportBuilds([gen1])
    const text2 = si.exportBuilds([gen2])
    const back2 = (await si.resolveImport(text2, 2, 'build')).items[0].build

    const formGen2 = si.exportBuilds([{
      ...gen2,
      effort: { hp: 0, attack: 0, defense: 0, speed: 0, 'special-attack': 65535, 'special-defense': 65535 },
    }])
    const special = (await si.resolveImport('Snorlax\nEVs: 252 SpA / 252 SpD', 2, 'build')).items[0].build.effort
    const oldForms = await si.resolveImport(['Gastrodon-East', '', 'Unown-B', '', 'Arceus-Fire', '', 'Garchomp-Mega', '', 'Shaymin-Sky'].join('\n'), 4, 'team')
    const skyAbility = d.getAbility(oldForms.items[4].build.abilityId)?.name
    const stick = await si.resolveImport("Farfetch'd @ Stick", 4, 'build')
    const hpIce = await si.resolveImport('Snorlax\n- Hidden Power [Ice]', 4, 'build')
    const big = await si.resolveImport('Snorlax\nEVs: 255 HP', 2, 'build')
    const paste = [
      '=== [gen4ou] Sand Crew ===',
      '',
      'Tyranitar (M) @ Leftovers',
      'Ability: Sand Stream',
      'EVs: 252 Atk / 252 Spe',
      'Adamant Nature',
      '- Crunch',
      '- Dragon Dance',
      '',
      'Garchomp @ Choice Scarf',
      'Ability: Rough Skin',
      '- Earthquake',
    ].join('\n')
    const onGen2 = await si.resolveImport(paste, 2, 'team')
    const onGen4 = await si.resolveImport(paste, 4, 'team')
    const forms = await si.resolveImport(
      ['Deoxys-Attack', '', 'Rotom-Wash', '', 'Nidoran-F', '', 'Mr. Mime', "", "Farfetch'd"].join('\n'),
      4,
      'team',
    )
    const hp = await si.resolveImport('Snorlax\nAbility: Immunity\n- Hidden Power [Ice]\n- Hidden Power Fire', 4, 'build')
    const seven = await si.resolveImport(Array(7).fill('Snorlax').join('\n\n'), 4, 'team')
    const over = await si.resolveImport('Snorlax\nEVs: 255 HP / 252 Atk / 252 Def', 4, 'build')
    const nothing = await si.resolveImport('', 4, 'team')
    return {
      text4,
      same: ['speciesId', 'level', 'natureId', 'abilityId', 'itemId', 'moveIds', 'nickname', 'gender'].map((k) => [k, same(k)]),
      evs: [back.build.effort.attack, back.build.effort.defense, back.build.effort.speed, back.build.effort.hp],
      ivs: back.build.individual,
      backNotes: back.notes,
      text1,
      text2,
      statExp: [sd.evFromStatExp(65535), sd.statExpFromEv(252), sd.evFromStatExp(40000), sd.ivFromDv(14), sd.dvFromIv(28), sd.dvFromIv(31)],
      back2: { attack: back2.effort.attack, dv: back2.individual.attack, def: back2.individual.defense },
      gen2: onGen2.items.map((i) => ({ l: i.label, ok: i.build != null, n: i.notes, a: i.build?.abilityId, nat: i.build?.natureId, m: i.build?.moveIds })),
      gen4: onGen4.items.map((i) => ({ l: i.label, ok: i.build != null, n: i.notes, a: i.build?.abilityId, sand: ability('sand-veil') })),
      teamName: onGen4.teamName,
      forms: forms.items.map((i) => ({ l: i.label, ok: i.build != null, pk: i.build?.pokemonId })),
      formNames: forms.items.map((i) => d.getSpecies(i.build?.speciesId ?? 0)?.varieties.find((v) => v.pokemon_id === i.build?.pokemonId)?.name),
      hp: { m: hp.items[0].build.moveIds.filter(Boolean).length, id: hp.items[0].build.moveIds[0], want: move('hidden-power') },
      seven: { n: seven.items.length, notes: seven.notes },
      over: { hp: over.items[0].build.effort.hp, n: over.items[0].notes },
      nothing: nothing.items.length,
      formGen2,
      special,
      oldForms: oldForms.items.map((i) => ({ l: i.label, ok: i.build != null, n: i.notes })),
      skyAbility,
      stick: { id: stick.items[0].build.itemId, want: item('stick'), n: stick.items[0].notes },
      hpIce: hpIce.items[0].notes,
      big: { hp: big.items[0].build.effort.hp, n: big.items[0].notes },
    }
  })
  log(r.text4)
  log(r.text2)
  check('a Gen 4 Build round-trips', r.same.every(([, ok]) => ok), JSON.stringify(r.same.filter(([, ok]) => !ok)))
  check('its EVs round-trip', r.evs.join() === '252,4,252,0', r.evs.join())
  check('its IVs round-trip', r.ivs.defense === 30 && r.ivs['special-attack'] === 12 && r.ivs.hp === 31, JSON.stringify(r.ivs))
  check('and nothing is reported', r.backNotes.length === 0, JSON.stringify(r.backNotes))
  check('Gen 1 text has no gender, item, ability, nature or happiness', !/\(F\)|@|Ability|Nature|Happiness/.test(r.text1), JSON.stringify(r.text1))
  check('Gen 1 full Stat Exp writes 252 on SpA, with no SpD', /252 SpA/.test(r.text1) && !/SpD/.test(r.text1), r.text1)
  check('Gen 2 text has no ability or nature', !/Ability|Nature/.test(r.text2), JSON.stringify(r.text2))
  check('Gen 2 writes one Special on both halves only when it has one', /IVs: 28 Atk/.test(r.text2), r.text2)
  check('65535 Stat Exp is 252 and returns as 65535', r.statExp[0] === 252 && r.statExp[1] === 65535, r.statExp.join())
  check('40000 Stat Exp rounds to a Showdown step', r.statExp[2] === 200, String(r.statExp[2]))
  check('DV 14 is IV 28 and returns as 14, IV 31 is DV 15', r.statExp[3] === 28 && r.statExp[4] === 14 && r.statExp[5] === 15)
  check('and the Gen 2 Build reads back', r.back2.attack === 65535 && r.back2.dv === 14 && r.back2.def === 15, JSON.stringify(r.back2))

  const [tyr2, chomp2] = r.gen2
  check('on Gen 2 ability and nature drop, and are reported', tyr2.ok && tyr2.a == null && tyr2.nat == null && tyr2.n.some((n) => /Ability and nature dropped/.test(n)), JSON.stringify(tyr2.n))
  check('an illegal move is left out and reported', tyr2.m.filter(Boolean).length === 1 && tyr2.n.some((n) => /Dragon Dance left out/.test(n)))
  check('a species outside the generation is refused and reported', !chomp2.ok && /not in Gen 2/.test(chomp2.n[0]), JSON.stringify(chomp2))
  const chomp4 = r.gen4[1]
  check('a hidden ability is refused in Gen 4 and reported', chomp4.ok && chomp4.a === chomp4.sand && chomp4.n.some((n) => /Rough Skin dropped/.test(n)), JSON.stringify(chomp4))
  check('the === header gives the team name', r.teamName === 'Sand Crew', r.teamName)
  check('species and forms match through punctuation', r.forms.every((f) => f.ok), JSON.stringify(r.forms))
  check('and a form lands on its own variety', r.formNames[0] === 'deoxys-attack' && r.formNames[1] === 'rotom-wash', r.formNames.join())
  check('Hidden Power reads with or without brackets, once', r.hp.m === 1 && r.hp.id === r.hp.want, JSON.stringify(r.hp))
  check('a seventh Pokémon is left out and said so', r.seven.n === 6 && r.seven.notes.some((n) => /past the sixth/.test(n)), JSON.stringify(r.seven))
  check('an EV over 252 is lowered and said so', r.over.hp === 252 && r.over.n.some((n) => /lowered/.test(n)), JSON.stringify(r.over))
  check('an EV total over 510 is kept and said so', r.over.n.some((n) => /over the 510/.test(n)))
  check('empty text gives an empty plan, not a crash', r.nothing === 0)
  check('Stat Exp in the Build Form\'s Gen 2 keys exports on both halves', /252 SpA/.test(r.formGen2) && /252 SpD/.test(r.formGen2), r.formGen2)
  check('Gen 2 import fills every Special key', r.special.special === 65535 && r.special['special-attack'] === 65535 && r.special['special-defense'] === 65535, JSON.stringify(r.special))
  check('a form with no variety reads as its species, and says so', r.oldForms.every((f) => f.ok) && r.oldForms.slice(0, 4).every((f) => f.n.some((n) => /no such form/.test(n))), JSON.stringify(r.oldForms))
  check('a form with its own abilities gets one of them', r.skyAbility === 'serene-grace', r.skyAbility)
  check('an item matches by its slug too', r.stick.id === r.stick.want && r.stick.n.length === 0, JSON.stringify(r.stick))
  check('Hidden Power of another type than the IVs give is reported', r.hpIce.some((n) => /Hidden Power is .* not Ice/.test(n)), JSON.stringify(r.hpIce))
  check('a Gen 2 EV over 252 is reported', r.big.hp === 65535 && r.big.n.some((n) => /lowered/.test(n)), JSON.stringify(r.big))

  // ------------------------------------------------------------------ 2
  hr('2. IMPORT ON SCREEN, never overwriting')
  const b = (id, speciesId, extra = {}) => ({
    id,
    generation: 4,
    speciesId,
    pokemonId: speciesId,
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
    ...extra,
  })
  const doc = {
    builds: [
      b('b1', 445, { nickname: 'Rocky', tags: ['Sweeper', 'sand'] }),
      b('b2', 373, { name: 'Dragon Dancer', tags: ['Sweeper'] }),
      b('b3', 143, { tags: ['Wall'], generation: 2, level: 100 }),
      b('b4', 25, { generation: 1, gender: null }),
      b('b5', 150, { generation: 1, gender: null }),
    ],
    teams: [{ id: 't1', seq: 1, generation: 4, memberIds: ['b1', 'b2', null, null, null, null], notes: '' }],
    nextBuildSeq: 4,
    nextTeamSeq: 2,
    collection: [],
    nextEntrySeq: 1,
  }
  const seed = async () => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, doc])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="nav-tab-team-building"]', { timeout: 60000 })
    await selectGeneration(page, 4)
  }
  const store = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)
  await seed()
  await goToPage(page, 'team-building', 'my-teams')
  await page.waitForSelector('[data-testid="tb-my-teams"]')
  await page.click('[data-testid="tb-teams-import"]')
  await page.fill('[data-testid="tb-import-text"]', 'Tyranitar\nAbility: Rough Skin\n- Crunch\n\nMissingno')
  await page.click('[data-testid="tb-import-check"]')
  await page.waitForSelector('[data-testid="tb-import-report"]')
  const before = await store()
  check('checking writes nothing', before.builds.length === 5 && before.teams.length === 1)
  const report = await page.textContent('[data-testid="tb-import-report"]')
  check('the report names each drop', /Rough Skin dropped/.test(report) && /Not imported/.test(report), report)
  check('the button says how many will land', (await page.textContent('[data-testid="tb-import-confirm"]')).includes('1'))
  await page.screenshot({ path: shot('transfer-import.png') })
  await page.click('[data-testid="tb-import-confirm"]')
  await page.waitForSelector('[data-testid="tb-team-viewer"], .tb-team-viewer')
  const after = await store()
  check('import makes one new Build and one new team', after.builds.length === 6 && after.teams.length === 2, `${after.builds.length}/${after.teams.length}`)
  check('in the app generation', after.teams[1].generation === 4 && after.builds[5].generation === 4)
  check('and existing records are untouched', JSON.stringify(after.builds.slice(0, 5)) === JSON.stringify(doc.builds) && JSON.stringify(after.teams[0]) === JSON.stringify(doc.teams[0]))
  check('the new team holds it', after.teams[1].memberIds[0] === after.builds[5].id)

  await page.evaluate(() => document.querySelector('[data-testid="tb-viewer-info"]')?.click())
  await page.waitForSelector('[data-testid="tb-viewer-export"]')
  await page.click('[data-testid="tb-viewer-export"]')
  const teamText = await page.inputValue('[data-testid="tb-export-text"]')
  check('a team exports its members', /^Tyranitar/.test(teamText) && /- Crunch/.test(teamText), teamText)
  await page.keyboard.press('Escape')

  // ------------------------------------------------------------------ 3
  hr('3. THE NAME, without losing a nickname')
  await seed()
  await goToPage(page, 'team-building', 'build-library')
  await page.waitForSelector('[data-testid="tb-build-library"]')
  check('a Build with no name still shows no name line', (await page.$('[data-testid="tb-build-b1-name"]')) == null)
  check('a stored name shows on its card', (await page.textContent('[data-testid="tb-build-b2-name"]')) === 'Dragon Dancer')
  const footBefore = await page.$eval('[data-testid="tb-build-b1-cell"]', (e) => e.getBoundingClientRect().height)
  await page.evaluate(() => document.querySelector('[data-testid="tb-build-b1-info"]').click())
  await page.fill('[data-testid="tb-build-b1-name-input"]', 'Physical Garchomp with a very long label')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="tb-build-b1-name"]')
  const saved = (await store()).builds[0]
  check('the name saves beside the nickname', saved.name === 'Physical Garchomp with a very long label' && saved.nickname === 'Rocky')
  const footAfter = await page.$eval('[data-testid="tb-build-b1-cell"]', (e) => e.getBoundingClientRect().height)
  check('a long name does not change the card height', footBefore === footAfter, `${footBefore} -> ${footAfter}`)
  const labels = await page.evaluate(async () => {
    const f = await import('/pokeapp/src/modules/team-builder/buildFacts.ts')
    return [
      f.buildLabel({ name: 'A', nickname: 'B' }, { display_name: 'C' }),
      f.buildLabel({ nickname: 'B' }, { display_name: 'C' }),
      f.buildLabel({ name: '  ', nickname: ' ' }, { display_name: 'C' }),
    ]
  })
  check('the label falls back to nickname, then species', labels.join() === 'A,B,C', labels.join())
  const inCalc = await page.evaluate(async (key) => {
    const s = await import('/pokeapp/src/modules/calculators/damageSets.ts')
    const doc = JSON.parse(localStorage.getItem(key))
    const catalog = s.setCatalog(s.speciesPickerOptions(4), [], doc, 4)
    return [catalog.byKey.get('b:b1')?.label, catalog.byKey.get('b:b2')?.label]
  }, KEY)
  check('the Damage calculator lists a Build by its name', inCalc[0]?.includes('Physical Garchomp') && inCalc[1]?.includes('Dragon Dancer'), inCalc.join(' / '))
  await goToPage(page, 'team-building', 'collection')
  await page.waitForSelector('[data-testid="col-build"]')
  const targets = await page.$$eval('[data-testid="col-build"] option', (els) => els.map((e) => e.textContent))
  check('the Collection offers a Build by its name', targets.some((t) => t.includes('Physical Garchomp')), targets.join(' / '))
  await goToPage(page, 'team-building', 'build-library')
  await page.waitForSelector('[data-testid="tb-build-library"]')

  // ------------------------------------------------------------------ 4
  hr('4. SEARCH BY NAME AND TAG')
  const shown = () => page.$$eval('.tb-library-cell', (els) => els.map((e) => e.dataset.testid.replace(/^tb-build-|-cell$/g, '')))
  const search = async (term) => {
    await withControlsOn(page, () => page.fill('[data-testid="tb-builds-search"]', term))
    await page.waitForTimeout(150)
    return (await shown()).join()
  }
  check('search finds a name', (await search('dragon dan')) === 'b2', await search('dragon dan'))
  check('search finds a nickname behind a name', (await search('rocky')) === 'b1', await search('rocky'))
  check('search finds a tag', (await search('wall')) === 'b3', await search('wall'))
  await search('')
  const options = await page.$$eval('[data-testid^="dex-filter-tag-"]', (els) => els.map((e) => e.dataset.testid.replace('dex-filter-tag-', '')))
  check('the Tag filter lists every tag once', options.join() === 'sand,Sweeper,Wall', options.join())
  await withControlsOn(page, () => page.click('[data-testid="dex-filter-tag-Sweeper"]'))
  await page.waitForTimeout(150)
  check('and narrows the list', (await shown()).join() === 'b1,b2', (await shown()).join())
  await withControlsOn(page, () => page.click('[data-testid="dex-filter-tag-Sweeper"]'))
  await page.waitForTimeout(150)

  // ------------------------------------------------------------------ 5
  hr('5. COMPARE TWO BUILDS')
  await page.click('[data-testid="tb-builds-select"]')
  await page.waitForSelector('[data-testid="tb-builds-compare"]')
  check('Compare waits for exactly two', await page.isDisabled('[data-testid="tb-builds-compare"]'))
  const tick = (id) => page.$eval(`[data-testid="tb-build-${id}-check"]`, (el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
  })
  await tick('b2')
  await tick('b3')
  await page.waitForFunction(() => !document.querySelector('[data-testid="tb-builds-compare"]')?.disabled)
  await page.click('[data-testid="tb-builds-compare"]')
  await page.waitForSelector('[data-testid="tb-compare"]')
  const row = (label) => page.$eval(`[data-testid="tb-compare-row-${label}"]`, (e) => ({ differs: e.dataset.differs, cells: [...e.querySelectorAll('td')].map((c) => c.textContent) }))
  const species = await row('Species')
  const nature = await row('Nature')
  const moves = await row('Move 1')
  check('both Builds are shown', species.cells.join() === 'Salamence,Snorlax', species.cells.join())
  check('a differing row is marked', species.differs === 'true')
  check('a row the same on both is not', moves.differs === 'false', JSON.stringify(moves))
  check('a field one generation lacks shows a dash', nature.cells[1] === '—', JSON.stringify(nature))
  const border = await page.$eval('[data-testid="tb-compare-row-Species"] .tb-compare-first', (e) => getComputedStyle(e).borderLeftColor)
  const plain = await page.$eval('[data-testid="tb-compare-row-Move 1"] .tb-compare-first', (e) => getComputedStyle(e).borderLeftColor)
  check('the mark is a line, shown only on a differing row', border !== plain, `${border} vs ${plain}`)
  await page.screenshot({ path: shot('transfer-compare.png') })
  await page.click('[data-testid="tb-compare-back"]')
  await page.waitForSelector('[data-testid="tb-build-library"]')
  check('back returns to the library', true)

  await page.click('[data-testid="tb-builds-select"]')
  await tick('b4')
  await tick('b5')
  await page.waitForFunction(() => !document.querySelector('[data-testid="tb-builds-compare"]')?.disabled)
  await page.click('[data-testid="tb-builds-compare"]')
  await page.waitForSelector('[data-testid="tb-compare"]')
  const rowLabels = await page.$$eval('[data-testid^="tb-compare-row-"]', (els) => els.map((e) => e.dataset.testid.replace('tb-compare-row-', '')))
  check('two Gen 1 Builds show one Special and no split rows', rowLabels.includes('Special') && !rowLabels.includes('Sp. Atk') && !rowLabels.includes('Sp. Def'), rowLabels.join())
  check('and no row Gen 1 lacks', !rowLabels.some((l) => ['Gender', 'Ability', 'Nature', 'Item'].includes(l)), rowLabels.join())
  await page.click('[data-testid="tb-compare-back"]')
  await page.waitForSelector('[data-testid="tb-build-library"]')

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
