/**
 * Audit PokeAPI's animated sprite set and regenerate the availability bitmask.
 *
 * WHAT THIS ANSWERS, and why it is a script rather than a paragraph: "does
 * PokeAPI have animated sprites, and for what?" has been asked twice and guessed
 * at once. The answer is a file census, so it is taken from the eight directory
 * listings rather than from the docs:
 *
 *   sprites/pokemon/versions/generation-v/black-white/animated
 *     /{id}.gif                    front  regular
 *     /shiny/{id}.gif              front  shiny
 *     /back/{id}.gif               back   regular
 *     /back/shiny/{id}.gif         back   shiny
 *     /female/{id}.gif             front  regular  female
 *     /shiny/female/{id}.gif       front  shiny    female
 *     /back/female/{id}.gif        back   regular  female
 *     /back/shiny/female/{id}.gif  back   shiny    female
 *
 * Only bare `{id}.gif` counts: the directories also hold form variants
 * (412-plant.gif, 386-attack.gif) whose ids would otherwise be double-counted.
 *
 * It prints the hex mask that src/data/animatedSprites.ts holds, and diffs it
 * against the one already in the file, so "upstream added a sprite" is a visible
 * failure rather than a silent 404 in the app.
 *
 * Run: node scripts/audit-bw-sprites.mjs
 */

import { readFileSync } from 'node:fs'

const API = 'https://api.github.com/repos/PokeAPI/sprites/contents'
const ROOT = 'sprites/pokemon/versions/generation-v/black-white/animated'
const FIRST = 1
const LAST = 493

/** dir -> bit, in the order src/data/animatedSprites.ts encodes them. */
const DIRS = [
  { dir: '', bit: 0, label: 'front regular' },
  { dir: 'shiny', bit: 1, label: 'front shiny' },
  { dir: 'back', bit: 2, label: 'back regular' },
  { dir: 'back/shiny', bit: 3, label: 'back shiny' },
  { dir: 'female', bit: 4, label: 'front regular female' },
  { dir: 'shiny/female', bit: 5, label: 'front shiny female' },
  { dir: 'back/female', bit: 6, label: 'back regular female' },
  { dir: 'back/shiny/female', bit: 7, label: 'back shiny female' },
]

const mask = new Array(LAST + 1).fill(0)
let files = 0

for (const d of DIRS) {
  const url = `${API}/${ROOT}${d.dir ? '/' + d.dir : ''}?per_page=1000`
  const res = await fetch(url, { headers: { 'User-Agent': 'pokeapp-audit' } })
  if (!res.ok) {
    console.error(`FAIL ${url} -> ${res.status}`)
    process.exit(1)
  }
  let n = 0
  for (const f of await res.json()) {
    if (f.type !== 'file') continue
    const m = /^(\d+)\.gif$/.exec(f.name)
    if (!m) continue
    const id = Number(m[1])
    if (id < FIRST || id > LAST) continue
    mask[id] |= 1 << d.bit
    n++
    files++
  }
  console.log(`${d.label.padEnd(22)} ${String(n).padStart(4)} files`)
}

let hex = ''
for (let id = FIRST; id <= LAST; id++) hex += mask[id].toString(16).padStart(2, '0')

console.log(
  `\n${files} files across ${new Set(mask.map((m, i) => (m ? i : 0)).filter(Boolean)).size} species`,
)

const byValue = new Map()
for (let id = FIRST; id <= LAST; id++) {
  const list = byValue.get(mask[id]) ?? []
  list.push(id)
  byValue.set(mask[id], list)
}
for (const [value, ids] of [...byValue].sort((a, b) => b[1].length - a[1].length)) {
  const shown = ids.length <= 8 ? ` -> ${ids.join(', ')}` : ''
  console.log(
    `  0x${value.toString(16).padStart(2, '0')}  ${String(ids.length).padStart(3)} species${shown}`,
  )
}

const source = readFileSync('src/data/animatedSprites.ts', 'utf8')
const inFile = [...source.matchAll(/'([0-9a-f]{2,})'/g)].map((m) => m[1]).join('')
if (inFile === hex) {
  console.log('\nOK: the mask in src/data/animatedSprites.ts is current.')
} else {
  console.log('\nCHANGED. The mask in src/data/animatedSprites.ts is stale. New value:\n')
  for (let i = 0; i < hex.length; i += 128) console.log(`  '${hex.slice(i, i + 128)}' +`)
  process.exitCode = 1
}

/*
  AND THE THIRD RECORD OF THE SAME CENSUS: the release assets we actually host.
  Upstream says which slots exist, the mask says which cards the app draws, and
  the releases say which files a browser can fetch. Any two of those agreeing is
  not enough -- a mask entry with no asset behind it is a broken image, and an
  asset with no mask entry is dead weight nobody requests. Four API calls, so it
  is cheap enough to be part of the audit rather than a separate errand.
*/
const REPO = 'hrezende423/pokeapp-sprites'
const genOf = (id) => (id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 : 4)
const BITS = [
  { bit: 0, side: 'front', shiny: false, female: false },
  { bit: 1, side: 'front', shiny: true, female: false },
  { bit: 2, side: 'back', shiny: false, female: false },
  { bit: 3, side: 'back', shiny: true, female: false },
  { bit: 4, side: 'front', shiny: false, female: true },
  { bit: 5, side: 'front', shiny: true, female: true },
  { bit: 6, side: 'back', shiny: false, female: true },
  { bit: 7, side: 'back', shiny: true, female: true },
]

/** Every asset name the mask implies, grouped by the release it should be in. */
const expected = new Map([1, 2, 3, 4].map((g) => [g, new Set()]))
for (let id = FIRST; id <= LAST; id++) {
  for (const b of BITS) {
    if (!(mask[id] & (1 << b.bit))) continue
    const name =
      `${String(id).padStart(3, '0')}-bw-${b.side}-${b.shiny ? 's' : 'n'}` +
      `${b.female ? '-f' : ''}.webp`
    expected.get(genOf(id)).add(name)
  }
}

console.log('')
let releaseProblems = 0
for (const g of [1, 2, 3, 4]) {
  const tag = `bw-gen${g}`
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
    headers: { 'User-Agent': 'pokeapp-audit' },
  })
  if (!res.ok) {
    console.log(`  ${tag}: release unreadable (${res.status})`)
    releaseProblems++
    continue
  }
  const have = new Set((await res.json()).assets.map((a) => a.name))
  const want = expected.get(g)
  const missing = [...want].filter((n) => !have.has(n))
  const extra = [...have].filter((n) => !want.has(n))
  console.log(
    `  ${tag}: ${have.size} assets, expected ${want.size}` +
      `${missing.length ? `, MISSING ${missing.length}` : ''}` +
      `${extra.length ? `, EXTRA ${extra.length}` : ''}`,
  )
  missing.slice(0, 6).forEach((n) => console.log(`      missing ${n}`))
  extra.slice(0, 6).forEach((n) => console.log(`      extra   ${n}`))
  if (missing.length || extra.length) releaseProblems++
}
if (releaseProblems === 0) {
  console.log('\nOK: every slot the mask claims has a release asset, and nothing is orphaned.')
} else {
  console.log(`\n${releaseProblems} release(s) disagree with the mask.`)
  process.exitCode = 1
}
