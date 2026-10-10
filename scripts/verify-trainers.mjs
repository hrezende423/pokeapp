/**
 * Trainer Dex: the bundle (public/data/trainers/*.json) and the screen.
 *
 * 1. FACTS WITH A KNOWN ANSWER -- values the games are known for, each checked
 *    against the bundle: Brock's Bide Onix and his ¥1386, Giovanni's Fissure,
 *    Lorelei's Blizzard, Crystal Falkner's DVs, Platinum's doubled twin prize,
 *    Koga's Black Sludge, Gen 2's Pink Bow keeping its own name.
 * 2. INTEGRITY -- every species, move, item and nature id resolves in the
 *    bundle; every party has 1-6 Pokemon with 1-4 moves; every facility set a
 *    trainer draws from exists.
 * 3. THE WIKI AS WITNESS -- the agreement counts the build writes (prize, gender,
 *    boss movesets) stay above floors. They are not 100% and are not meant to
 *    be: where the two disagree the disassembly is the game (see CLAUDE.md).
 * 4. THE SCREEN -- the dex is in the nav, asks for a game under "All", lists a
 *    game in walkthrough order, opens a trainer and a facility trainer, and
 *    renders without console errors, box-shadow or phone overflow.
 *
 * Usage: npm run verify:trainers
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startDevServer } from './lib/devServer.mjs'
import { selectGame } from './lib/controls.mjs'

const PORT = 4201
const DATA = new URL('../public/data/', import.meta.url)
const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, DATA)), 'utf8'))
const GAMES = [
  'red-blue',
  'yellow',
  'gold-silver',
  'crystal',
  'ruby-sapphire',
  'emerald',
  'firered-leafgreen',
  'diamond-pearl',
  'platinum',
  'heartgold-soulsilver',
]

let checks = 0
const failures = []
const log = (s) => console.log(s)
const hr = (t) => log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  checks += 1
  if (!ok) failures.push(`${label}${detail ? `  (${detail})` : ''}`)
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? `  ${detail}` : ''}`)
}

const species = read('species.json')
const moves = read('moves.json')
const items = read('items.json')
const natures = read('natures.json')
const moveId = (slug) => Object.values(moves).find((m) => m.name === slug)?.id
const itemId = (slug) => Object.values(items).find((i) => i.name === slug)?.id
const T = Object.fromEntries(GAMES.map((g) => [g, read(`trainers/${g}.json`)]))
const find = (g, id) => T[g].trainers.find((t) => t.id === id)

// -------------------------------------------------------------------- 1
hr('1. FACTS WITH A KNOWN ANSWER')
{
  const brock = T['red-blue'].trainers.find((t) => t.class_id === 'BROCK')
  const onix = brock.party.find((m) => m.species_id === 95)
  check(
    'RB Brock: Geodude 12 and Onix 14',
    JSON.stringify(brock.party.map((m) => [m.species_id, m.level])) === '[[74,12],[95,14]]',
  )
  check(
    'RB Brock: Onix knows Bide (LoneMoves, third slot)',
    onix.moves.includes(moveId('bide')),
    JSON.stringify(onix.moves),
  )
  check('RB Brock: prize 99 x 14 = 1386', brock.prize === 1386, String(brock.prize))
  check(
    'RB trainer DVs are 9/8/8/8',
    JSON.stringify(onix.dvs) === '{"attack":9,"defense":8,"speed":8,"special":8}',
  )
  check(
    'RB Brock is named from the walkthrough, class "Leader"',
    brock.name === 'Brock' && T['red-blue'].classes.BROCK.name === 'Leader',
  )
  const gio = T['red-blue'].trainers
    .filter((t) => t.class_id === 'GIOVANNI')
    .find((t) => t.party.some((m) => m.species_id === 112))
  check(
    'RB Viridian Gym Giovanni: Rhydon knows Fissure',
    gio?.party.find((m) => m.species_id === 112)?.moves.includes(moveId('fissure')),
  )
  const lorelei = T['red-blue'].trainers.find((t) => t.class_id === 'LORELEI')
  check(
    'RB Lorelei: Lapras (fifth) knows Blizzard (TeamMoves)',
    lorelei.party[4]?.species_id === 131 && lorelei.party[4].moves.includes(moveId('blizzard')),
  )
  const champ = T['red-blue'].trainers.filter((t) => t.class_id === 'RIVAL3')
  check(
    'RB Champion: Pidgeot knows Sky Attack in all three',
    champ.length === 3 && champ.every((t) => t.party[0].moves.includes(moveId('sky-attack'))),
  )
  const falkner = T.crystal.trainers.find((t) => t.class_id === 'FALKNER')
  check(
    'Crystal Falkner: DVs 9/10/7/7, prize 900',
    JSON.stringify(falkner.party[0].dvs) === '{"attack":9,"defense":10,"speed":7,"special":7}' &&
      falkner.prize === 900,
  )
  const whitney = T.crystal.trainers.find((t) => t.class_id === 'WHITNEY')
  const miltank = whitney.party.find((m) => m.species_id === 241)
  check(
    'Crystal Whitney: Miltank Rollout / Attract / Stomp / Milk Drink',
    ['rollout', 'attract', 'stomp', 'milk-drink'].every((s) => miltank.moves.includes(moveId(s))),
  )
  const pinkBow = T.crystal.trainers.flatMap((t) => t.party).find((m) => m.item_name === 'Pink Bow')
  check(
    'Gen 2 Pink Bow resolves to Silk Scarf and keeps its own name',
    pinkBow && pinkBow.item_id === itemId('silk-scarf'),
  )
  const roxanne = find('emerald', 'TRAINER_ROXANNE_1')
  const nosepass = roxanne.party.find((m) => m.species_id === 299)
  check(
    'Emerald Roxanne: Nosepass holds an Oran Berry, IV 200 -> 24',
    nosepass.item_id === itemId('oran-berry') && nosepass.iv === 24,
  )
  const roark = find('platinum', 'TRAINER_LEADER_ROARK')
  check('Platinum Roark: prize 30 x 4 x 14 = 1680', roark.prize === 1680, String(roark.prize))
  check(
    'Platinum Roark: Onix knows Stealth Rock',
    roark.party[1].moves.includes(moveId('stealth-rock')),
  )
  check(
    'Platinum double battles pay double (Twins Liv & Liz: 352)',
    find('platinum', 'TRAINER_TWINS_LIV_AND_LIZ')?.prize === 352,
  )
  const koga = T['heartgold-soulsilver'].trainers.find(
    (t) => /KOGA/.test(t.id) && t.class_id.includes('ELITE'),
  )
  check(
    'HGSS Koga: Muk holds Black Sludge',
    koga?.party.find((m) => m.species_id === 89)?.item_id === itemId('black-sludge'),
  )
  const barry = T.platinum.trainers[0]
  check(
    'Platinum opens with Barry on Route 201, starter variant named',
    barry.name === 'Barry' && /If you chose/.test(barry.appearances[0].variant ?? ''),
    `${barry.name} ${barry.appearances[0]?.variant}`,
  )
  check(
    'Platinum rival data name kept as game_name',
    barry.game_name === 'Cedric',
    String(barry.game_name),
  )
  const dpTower = T['diamond-pearl'].facilities.find((f) => f.id === 'battle-tower')
  check(
    'DP Battle Tower: 307 named trainers, 950 sets',
    dpTower.trainers.filter((t) => !t.key.startsWith('brain')).length === 307 &&
      dpTower.sets.length === 950 &&
      dpTower.trainers[0].name === 'Lloyd',
  )
  check(
    'HGSS frontier marks its Platinum-sourced pool',
    !!T['heartgold-soulsilver'].facilities[0].source_note,
  )
  const brains = T.emerald.facilities
    .find((f) => f.id === 'battle-frontier')
    .trainers.filter((t) => t.key.startsWith('brain-'))
  check('Emerald: 7 Frontier Brains x 2 symbols', brains.length === 14)
  check('Emerald: Noland carries the Steven note', !!brains.find((b) => b.name === 'Noland')?.note)
}

// -------------------------------------------------------------------- 2
hr('2. INTEGRITY')
for (const g of GAMES) {
  const d = T[g]
  const bad = []
  for (const t of d.trainers) {
    if (!d.classes[t.class_id]) bad.push(`${t.id}: class`)
    if (t.party.length < 1 || t.party.length > 6) bad.push(`${t.id}: party size ${t.party.length}`)
    for (const m of t.party) {
      if (!species[m.species_id]) bad.push(`${t.id}: species ${m.species_id}`)
      if (m.moves.length < 1 || m.moves.length > 4) bad.push(`${t.id}: ${m.moves.length} moves`)
      for (const mv of m.moves) if (!moves[mv]) bad.push(`${t.id}: move ${mv}`)
      if (m.item_id != null && !items[m.item_id]) bad.push(`${t.id}: item ${m.item_id}`)
      if (m.nature_id != null && !natures[m.nature_id]) bad.push(`${t.id}: nature ${m.nature_id}`)
    }
    for (const it of t.items) if (!items[it]) bad.push(`${t.id}: bag item ${it}`)
  }
  for (const f of d.facilities) {
    const keys = new Set(f.sets.map((s) => s.key))
    for (const s of f.sets) {
      if (!species[s.species_id]) bad.push(`${f.id} ${s.key}: species`)
      for (const mv of s.moves) if (!moves[mv]) bad.push(`${f.id} ${s.key}: move ${mv}`)
    }
    for (const t of f.trainers)
      for (const k of t.set_keys ?? []) if (!keys.has(k)) bad.push(`${f.id} ${t.key}: set ${k}`)
  }
  check(
    `${g}: every id resolves, every party and set is well-formed`,
    bad.length === 0,
    bad.slice(0, 4).join(' | '),
  )
  const gen = d.generation
  const ivsOk = d.trainers.every((t) =>
    t.party.every((m) =>
      gen <= 2 ? m.dvs != null : m.iv_random || (m.iv != null && m.iv >= 0 && m.iv <= 31),
    ),
  )
  check(`${g}: every Pokemon carries ${gen <= 2 ? 'DVs' : 'an IV'}`, ivsOk)
}

// -------------------------------------------------------------------- 3
hr('3. THE WIKI AS WITNESS (agreement floors)')
const FLOOR = { prize: 0.85, gender: 0.96, moves: 0.9 }
for (const g of GAMES) {
  const c = T[g].checks
  for (const k of Object.keys(FLOOR)) {
    if (!c[k] || !c[k].compared) continue
    const r = c[k].agree / c[k].compared
    check(
      `${g}: ${k} agrees with the walkthrough >= ${FLOOR[k] * 100}%`,
      r >= FLOOR[k],
      `${c[k].agree}/${c[k].compared}`,
    )
  }
  const cov = T[g].coverage
  check(
    `${g}: at most 13 walkthrough sightings unmatched`,
    cov.sightings_unmatched <= 13,
    String(cov.sightings_unmatched),
  )
  check(
    `${g}: at least 85% of in-use trainers placed`,
    cov.placed / (cov.trainers - cov.unused) >= 0.85,
    `${cov.placed}/${cov.trainers - cov.unused}`,
  )
}

// -------------------------------------------------------------------- 4
hr('4. THE SCREEN')
const dev = await startDevServer({ port: PORT })
let browser
const errors = []
try {
  browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    serviceWorkers: 'block',
  })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(dev.url, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForSelector('[data-testid="gen-select"]', { state: 'attached', timeout: 180000 })
  /* The app picks a generation; the Trainer Dex picks the game inside it. */
  const pick = (vg) => selectGame(page, vg)

  check('Pokepedia lists the Trainer Dex', (await page.$('[data-testid="nav-trainerdex"]')) != null)
  await pick('all')
  await page.evaluate(() => document.querySelector('[data-testid="nav-trainerdex"]').click())
  await page.waitForSelector('[data-testid="trainerdex-empty"]', { timeout: 30000 })
  check(
    'under "All" it asks for a generation',
    /Choose a generation/.test(await page.textContent('[data-testid="trainerdex-empty"]')),
  )

  await pick('platinum')
  await page.waitForSelector('[data-testid="trainerdex-rows"]', { timeout: 60000 })
  check(
    'its game row offers the three Gen 4 games, Platinum picked',
    (await page.$$('[data-testid="trainerdex-game"] button')).length === 3 &&
      (await page.getAttribute('[data-testid="trainerdex-game-platinum"]', 'aria-pressed')) === 'true',
  )
  const count = Number(
    (await page.textContent('[data-testid="trainerdex-count"]')).replace(/\D/g, ''),
  )
  const expected =
    T.platinum.trainers.length + T.platinum.facilities.reduce((n, f) => n + f.trainers.length, 0)
  check(
    'Platinum lists every trainer and facility trainer',
    count === expected,
    `${count} vs ${expected}`,
  )
  const firstRow = await page.textContent('[data-testid="trainerdex-rows"] li:first-child')
  check(
    'the list opens in walkthrough order: Barry on Route 201 first',
    /Barry/.test(firstRow) && /Route 201/.test(firstRow),
    firstRow,
  )

  await page
    .locator('[data-testid="trainerdex-rows"] button:has-text("Leader Roark")')
    .first()
    .click()
  await page.waitForSelector('[data-testid="trainerdex-detail"]')
  check(
    'a trainer opens with its party',
    (await page.$$('[data-testid^="trainerdex-mon-"]')).length === 3,
  )
  check(
    'the prize reads 1680',
    /1[.,]?680/.test(await page.textContent('[data-testid="trainerdex-prize"]')),
  )
  const shadows = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="trainerdex-detail"] *')].filter(
        (el) => getComputedStyle(el).boxShadow !== 'none',
      ).length,
  )
  check('no box-shadow on the detail page', shadows === 0, String(shadows))
  await page.click('[data-testid="entity-back"]')

  await page
    .locator('[data-testid="trainerdex-rows"] button:has-text("Silver Print")')
    .first()
    .click()
  await page.waitForSelector('[data-testid="trainerdex-detail"]')
  check(
    'a Frontier Brain opens with the facility rules and a team',
    (await page.$('[data-testid="trainerdex-rules"]')) != null &&
      (await page.$$('[data-testid^="trainerdex-mon-"]')).length === 3,
  )
  await page.click('[data-testid="entity-back"]')

  await pick('red-blue')
  await page.waitForSelector('[data-testid="trainerdex-rows"]', { timeout: 60000 })
  await page
    .locator('[data-testid="trainerdex-rows"] button:has-text("Leader Brock")')
    .first()
    .click()
  await page.waitForSelector('[data-testid="trainerdex-detail"]')
  check(
    'RB Brock shows DVs and a Bide Onix',
    /9\/8\/8\/8/.test(await page.textContent('[data-testid="trainerdex-party"]')) &&
      /Bide/.test(await page.textContent('[data-testid="trainerdex-party"]')),
  )

  await page.setViewportSize({ width: 390, height: 1200 })
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  check('no sideways overflow at phone width', !overflow)
  await page.screenshot({
    path: fileURLToPath(new URL('.verify-shots/trainerdex-phone.png', import.meta.url)),
  })
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  if (browser) await browser.close()
  await dev.stop()
}

log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length) {
  log(`FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
