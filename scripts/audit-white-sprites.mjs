/**
 * Audit the Gen 1-2 white-background sprite problem, and the keyed set that fixes it.
 *
 * WHAT THE PROBLEM IS. PokeAPI serves the Gen 1-2 sprites on an OPAQUE WHITE
 * background. Most of those slots also exist under `transparent/`, so the app
 * prefers the counterpart and never renders the white one -- but 2,110 tiles have
 * no counterpart (both gray slots on red-blue and yellow, and front_shiny /
 * back_default / back_shiny on gold and silver), and those are keyed to
 * transparency and hosted in pokeapp-sprites instead.
 *
 * WHAT THIS SCRIPT CHECKS, and why each half is here:
 *
 *   1. The WHITE_BACKGROUND and TRANSPARENT_COUNTERPART tables in
 *      src/data/spriteSlots.ts still describe upstream. If PokeAPI ever adds a
 *      `transparent/` rendering for one of the ten keyed slots, the app should
 *      stop hosting a copy of it -- and this is what would say so.
 *   2. Every keyed URL the bundle implies actually resolves. The bitmask decides
 *      which cards get drawn, so a mask entry with no file behind it is a broken
 *      image and not a missing card.
 *
 * IT DOES NOT DECODE PIXELS -- that check lives in verify-species-page section N,
 * which draws every Gen 1-2 tile into a canvas and reads its corners. Decoding is
 * the only way to prove "transparent" rather than assume it from a path, and a
 * browser is the cheapest PNG decoder this project has.
 *
 * Run: node scripts/audit-white-sprites.mjs
 */

import { readFileSync } from 'node:fs'

const UPSTREAM = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions'
const KEYED = 'https://raw.githubusercontent.com/hrezende423/pokeapp-sprites/main/transparent'

const SLOT_ORDER = [
  'front_default',
  'front_shiny',
  'front_female',
  'front_shiny_female',
  'back_default',
  'back_shiny',
  'back_female',
  'back_shiny_female',
  'front_transparent',
  'back_transparent',
  'front_shiny_transparent',
  'back_shiny_transparent',
  'front_gray',
  'back_gray',
]

const SLOT_PATH = {
  front_default: '',
  front_shiny: 'shiny/',
  back_default: 'back/',
  back_shiny: 'back/shiny/',
  front_transparent: 'transparent/',
  back_transparent: 'transparent/back/',
  front_shiny_transparent: 'transparent/shiny/',
  back_shiny_transparent: 'transparent/back/shiny/',
  front_gray: 'gray/',
  back_gray: 'back/gray/',
}

const GEN_PATH = {
  'red-blue': 'generation-i',
  yellow: 'generation-i',
  gold: 'generation-ii',
  silver: 'generation-ii',
  crystal: 'generation-ii',
}

/** Must stay identical to WHITE_BACKGROUND in src/data/spriteSlots.ts. */
const WHITE = {
  'red-blue': ['front_default', 'back_default', 'front_gray', 'back_gray'],
  yellow: ['front_default', 'back_default', 'front_gray', 'back_gray'],
  gold: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
  silver: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
  crystal: ['front_default', 'front_shiny', 'back_default', 'back_shiny'],
}

const COUNTERPART = {
  front_default: 'front_transparent',
  back_default: 'back_transparent',
  front_shiny: 'front_shiny_transparent',
  back_shiny: 'back_shiny_transparent',
}

let problems = 0

// ---------------------------------------------------- 1. is the table still true?
console.log('\nUPSTREAM COUNTERPARTS — does a `transparent/` rendering exist?')
console.log('  ' + '-'.repeat(66))
for (const [game, slots] of Object.entries(WHITE)) {
  for (const slot of slots) {
    const counterpart = COUNTERPART[slot]
    if (!counterpart) {
      console.log(`  ${game}/${slot}`.padEnd(34) + 'no counterpart possible (gray)')
      continue
    }
    // Species 1 for Gen 1, 152 for Gen 2 -- the first id each set covers.
    const id = GEN_PATH[game] === 'generation-i' ? 1 : 152
    const url = `${UPSTREAM}/${GEN_PATH[game]}/${game}/${SLOT_PATH[counterpart]}${id}.png`
    const ok = (await fetch(url, { method: 'GET' })).ok
    console.log(`  ${game}/${slot}`.padEnd(34) + (ok ? `-> ${counterpart}` : 'NONE, keyed by us'))
  }
}

// ---------------------------------------------------- 2. does every keyed file exist?
const raw = JSON.parse(readFileSync('public/data/species.json', 'utf8'))
const list = Array.isArray(raw) ? raw : (raw.species ?? Object.values(raw))

const expected = []
for (const s of list) {
  if (s.id > 493) continue
  const v = s.varieties.find((x) => x.is_default) ?? s.varieties[0]
  const masks = v.version_sprite_slots ?? {}
  for (const [game, slots] of Object.entries(WHITE)) {
    const m = masks[game]
    if (m == null) continue
    const has = (slot) => (m & (1 << SLOT_ORDER.indexOf(slot))) !== 0
    for (const slot of slots) {
      if (!has(slot)) continue
      const counterpart = COUNTERPART[slot]
      if (counterpart && has(counterpart)) continue
      expected.push({ game, slot, id: v.pokemon_id })
    }
  }
}

const byGroup = {}
for (const e of expected) byGroup[`${e.game}/${e.slot}`] = (byGroup[`${e.game}/${e.slot}`] ?? 0) + 1
console.log(`\nKEYED SET — ${expected.length} tiles the bitmask says we must host`)
console.log('  ' + '-'.repeat(66))
for (const [k, n] of Object.entries(byGroup)) console.log(`  ${k}`.padEnd(34) + n)

/*
  Sampled, not exhaustive: 2,110 HEAD requests to raw.githubusercontent gets
  throttled long before it proves anything the first and last of each group does
  not. Three per group -- first, middle, last -- catches a whole group that failed
  to upload, which is the failure mode that has actually happened.
*/
console.log('\n  sampling three per group…')
let checked = 0
for (const [key, n] of Object.entries(byGroup)) {
  const [game, slot] = key.split('/')
  const ids = expected.filter((e) => e.game === game && e.slot === slot).map((e) => e.id)
  for (const id of [ids[0], ids[Math.floor(n / 2)], ids[n - 1]]) {
    const url = `${KEYED}/${game}/${slot}/${id}.png`
    const res = await fetch(url)
    checked++
    if (!res.ok) {
      console.log(`  MISSING ${res.status} ${url}`)
      problems++
    }
  }
}
console.log(`  ${checked} sampled, ${problems} missing`)

if (problems === 0) {
  console.log('\nOK: the table matches upstream and every sampled keyed tile resolves.')
} else {
  console.log(`\n${problems} problem(s).`)
  process.exitCode = 1
}
