/**
 * Generates the Bulbapedia supplement layer: src/data/moveFlags.ts and
 * src/data/abilityIgnorability.ts.
 *
 * WHY GENERATED AND THEN COMMITTED, rather than fetched at runtime or typed by
 * hand. Runtime is out: this app has no backend and is offline-first, so a
 * screen that needed a wiki to be reachable would simply be broken on a plane.
 * By hand is out too: 72 move entries and 42 ability names copied from a console
 * dump is exactly the kind of transcription nobody re-checks. So the fetch runs
 * here, the join is asserted here, and the result is a plain TypeScript module
 * that ships in the bundle.
 *
 * IT FAILS RATHER THAN GUESSES. If a category stops existing, or an in-scope
 * member stops matching a bundle name, this throws instead of writing a shorter
 * file -- a silently smaller flag list is the failure mode worth engineering
 * against, because nothing downstream can tell "Bite has no flag" from "the
 * biting category moved".
 *
 * WHAT IT DELIBERATELY DOES NOT CARRY:
 *
 *   CONTACT. Bulbapedia documents it neither as an inclusion list nor as an
 *   exception list -- Category:Contact moves, Category:Moves that make contact,
 *   Category:Non-contact moves and both "do/don't make contact" phrasings all
 *   return DOES NOT EXIST, and none of the 91 real "Moves that ..." categories
 *   concerns it. The PokeAPI snapshot this project builds from has no move-flag
 *   resource and no `flags` field either. Dropped, on instruction, rather than
 *   blocking the other seven. See CLAUDE.md.
 *
 *   AN ABILITY EXCEPTION LIST. The five abilities usually named as resisting
 *   Mold Breaker despite being ignorable -- Comatose, Shields Down, Full Metal
 *   Body, Shadow Shield, Prism Armor -- are all Generation 7+ and are not in
 *   this bundle at all, so a rule about them could never fire here.
 *
 * ETIQUETTE, the same courtesy recon-bulbapedia.mjs extends: one request at a
 * time, a delay between them, and a real User-Agent naming the project.
 *
 * Usage: node scripts/build-supplement.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'

const API = 'https://bulbapedia.bulbagarden.net/w/api.php'
const UA =
  'pokeapp-data-recon/0.1 (personal, non-commercial learning project; https://github.com/hrezende423/pokeapp)'
const DELAY_MS = 1200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Bulbapedia titles carry disambiguation suffixes; the bundle's names do not. */
const normalise = (title) =>
  title
    .replace(/\s*\((move|ability|Ability|Move)\)\s*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function categoryMembers(category) {
  const members = []
  let cont = ''
  for (let page = 0; page < 10; page += 1) {
    const url =
      `${API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}` +
      `&cmlimit=500&cmnamespace=0&format=json${cont}`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`)
    const body = await res.json()
    if (body.error) throw new Error(`${category}: ${body.error.info}`)
    for (const m of body.query?.categorymembers ?? []) members.push(m.title)
    if (!body.continue) break
    cont = `&cmcontinue=${encodeURIComponent(body.continue.cmcontinue)}`
    await sleep(DELAY_MS)
  }
  if (members.length === 0) throw new Error(`${category}: no members -- renamed or deleted?`)
  return members
}

const FLAG_CATEGORIES = [
  ['sound', 'Category:Sound-based moves'],
  ['punch', 'Category:Punching moves'],
  ['powder', 'Category:Powder and spore moves'],
  ['bite', 'Category:Biting moves'],
  ['pulse', 'Category:Pulse moves'],
  ['dance', 'Category:Dance moves'],
  ['ballistic', 'Category:Ball and bomb moves'],
]

// ---------------------------------------------------------------- the bundle
const moves = JSON.parse(readFileSync('public/data/moves.json', 'utf8'))
const abilities = JSON.parse(readFileSync('public/data/abilities.json', 'utf8'))
const inScopeMoves = new Set(
  Object.values(moves)
    .filter((m) => (m.generation_id ?? 1) <= 4)
    .map((m) => m.name),
)
const inScopeAbilities = new Set(
  Object.values(abilities)
    .filter((a) => (a.generation_id ?? 1) <= 4)
    .map((a) => a.name),
)
console.log(`bundle: ${inScopeMoves.size} moves, ${inScopeAbilities.size} abilities in Gen 1-4`)

/*
  A member that matches nothing is only acceptable when it is genuinely not a
  Gen 1-4 entity: a later-generation move, or the category's own description
  page. Both are recognised by NOT being in the bundle at all -- every move the
  bundle carries is already Gen 1-4, so "in the bundle" and "in scope" are the
  same test for moves. Anything else would be a rename and must stop the build.
*/
const allMoveNames = new Set(Object.values(moves).map((m) => m.name))
const allAbilityNames = new Set(Object.values(abilities).map((a) => a.name))

const flags = {}
let totalFlagged = 0
for (const [flag, category] of FLAG_CATEGORIES) {
  const titles = await categoryMembers(category)
  const matched = []
  for (const title of titles) {
    const key = normalise(title)
    if (inScopeMoves.has(key)) matched.push(key)
    else if (allMoveNames.has(key)) {
      throw new Error(`${category}: "${title}" is in the bundle but out of Gen 1-4 scope`)
    }
  }
  if (matched.length === 0) throw new Error(`${category}: matched nothing in scope`)
  flags[flag] = [...new Set(matched)].sort()
  totalFlagged += flags[flag].length
  console.log(`  ${flag.padEnd(10)} ${titles.length} members -> ${flags[flag].length} in scope`)
  await sleep(DELAY_MS)
}

const ignorableTitles = await categoryMembers('Category:Ignorable Abilities')
const ignorable = []
for (const title of ignorableTitles) {
  const key = normalise(title)
  if (inScopeAbilities.has(key)) ignorable.push(key)
  else if (allAbilityNames.has(key) && (abilities[key]?.generation_id ?? 99) <= 4) {
    throw new Error(`Ignorable Abilities: "${title}" is in scope but did not match`)
  }
}
ignorable.sort()
console.log(`  ignorable ${ignorableTitles.length} members -> ${ignorable.length} in scope`)

// ------------------------------------------------------------------- emit
const stamp = `Generated by scripts/build-supplement.mjs from Bulbapedia categories.
 * Re-run that script to refresh; do not edit this file by hand.`

const list = (names) => names.map((n) => `  '${n}',`).join('\n')

writeFileSync(
  'src/data/moveFlags.ts',
  `/**
 * Move flags the PokeAPI snapshot does not carry: sound, punch, powder, bite,
 * pulse, dance and ballistic.
 *
 * ${stamp}
 *
 * SEVEN FLAGS, NOT EIGHT -- contact is absent and that is a finding rather than
 * an oversight. Bulbapedia documents it neither as an inclusion list nor as an
 * exception list (every candidate category title returns DOES NOT EXIST, and
 * none of the 91 real "Moves that ..." categories concerns it), and the PokeAPI
 * snapshot this project builds from has no move-flag resource and no \`flags\`
 * field on a move. There is no source for it in the current data plan.
 *
 * NAMES ARE BUNDLE SLUGS, matched against moves.json rather than transcribed --
 * every name here resolved to a move the bundle carries in Gen 1-4 scope, and
 * the generator throws rather than emitting a short list if one stops matching.
 *
 * ERA: these are properties of the MOVE, not of a generation, so nothing here is
 * era-gated. A caller showing them still gates on whether the move existed yet,
 * the same way every other move field does.
 */

export const MOVE_FLAGS = [
  'sound',
  'punch',
  'powder',
  'bite',
  'pulse',
  'dance',
  'ballistic',
] as const

export type MoveFlag = (typeof MOVE_FLAGS)[number]

/** Move name slugs per flag, sorted, as of the snapshot above. */
export const MOVES_BY_FLAG: Record<MoveFlag, readonly string[]> = {
${FLAG_CATEGORIES.map(([f]) => `  ${f}: [\n${list(flags[f])}\n  ],`).join('\n')}
}

/*
  Inverted once at module load rather than scanned per call: the Movedex asks
  this per row, and seven linear searches per move is work that only has to
  happen once. A Map of name -> flags, built from the tables above so the two
  cannot drift.
*/
const FLAGS_BY_MOVE = new Map<string, MoveFlag[]>()
for (const flag of MOVE_FLAGS) {
  for (const name of MOVES_BY_FLAG[flag]) {
    const existing = FLAGS_BY_MOVE.get(name)
    if (existing) existing.push(flag)
    else FLAGS_BY_MOVE.set(name, [flag])
  }
}

/** Flags carried by a move, in MOVE_FLAGS order. Empty for most moves. */
export function moveFlags(moveName: string): readonly MoveFlag[] {
  return FLAGS_BY_MOVE.get(moveName) ?? []
}

/** Whether a move carries one particular flag. */
export function moveHasFlag(moveName: string, flag: MoveFlag): boolean {
  return MOVES_BY_FLAG[flag].includes(moveName)
}

/** Total distinct moves carrying at least one flag. */
export const FLAGGED_MOVE_COUNT = FLAGS_BY_MOVE.size
`,
)

writeFileSync(
  'src/data/abilityIgnorability.ts',
  `/**
 * Abilities that Mold Breaker (and Teravolt / Turboblaze) ignore.
 *
 * ${stamp}
 *
 * THERE IS NO EXCEPTION LIST, and its absence is deliberate rather than
 * unfinished. The five abilities usually named as ignorable-by-pattern but
 * immune in practice -- Comatose, Shields Down, Full Metal Body, Shadow Shield
 * and Prism Armor -- are all Generation 7+ and are not in this bundle at all,
 * so a rule about them could never fire in a Gen 1-4 app. Encoding one would be
 * a branch nothing can reach and a reader would have to verify to dismiss. If
 * this app ever grows past Gen 6, that list is the first thing to add back.
 *
 * ERA: Mold Breaker itself is a Generation 4 ability, so nothing consults this
 * before Gen 4 -- but ignorability is a property of the ABILITY, so it is not
 * era-gated here. The caller gates.
 */

/** Ability name slugs, sorted, in Gen 1-4 scope. */
export const IGNORABLE_ABILITIES: readonly string[] = [
${list(ignorable)}
]

const IGNORABLE = new Set(IGNORABLE_ABILITIES)

/** Whether Mold Breaker ignores this ability. */
export function abilityIsIgnorable(abilityName: string): boolean {
  return IGNORABLE.has(abilityName)
}

export const IGNORABLE_ABILITY_COUNT = IGNORABLE_ABILITIES.length
`,
)

console.log(`\nwrote src/data/moveFlags.ts (${totalFlagged} flag entries)`)
console.log(`wrote src/data/abilityIgnorability.ts (${ignorable.length} abilities)`)
