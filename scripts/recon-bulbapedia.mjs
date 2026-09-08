/**
 * Bulbapedia recon for the supplement layer. IT FETCHES AND PRINTS; IT WRITES
 * NOTHING into src/data.
 *
 * The handoff asks for three datasets and says, correctly, that several of its
 * own names were guesses to be verified before hardcoding. This is that
 * verification, plus the join it implies: for each category, which members
 * match a move/ability the bundle already has IN GEN 1-4 SCOPE, and which do
 * not. The unmatched list is the thing worth reading -- the handoff's rule is
 * that nothing gets silently dropped or silently force-matched.
 *
 * ETIQUETTE. One request per category, serial, with a delay between them and a
 * real User-Agent. Bulbapedia publishes no rate limit; this is the same
 * courtesy the project already extends to PokeAPI.
 *
 * Usage: node scripts/recon-bulbapedia.mjs
 */
import { readFileSync } from 'node:fs'

const API = 'https://bulbapedia.bulbagarden.net/w/api.php'
const UA =
  'pokeapp-data-recon/0.1 (personal, non-commercial learning project; https://github.com/hrezende423/pokeapp)'
const DELAY_MS = 1200

const hr = (t) => console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`)
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
  return members
}

// ---------------------------------------------------------------- the bundle
const moves = JSON.parse(readFileSync('public/data/moves.json', 'utf8'))
const abilities = JSON.parse(readFileSync('public/data/abilities.json', 'utf8'))
const inScopeMoves = new Map()
for (const m of Object.values(moves)) {
  if ((m.generation_id ?? 1) <= 4) inScopeMoves.set(m.name, m)
}
const inScopeAbilities = new Map()
for (const a of Object.values(abilities)) {
  if ((a.generation_id ?? 1) <= 4) inScopeAbilities.set(a.name, a)
}
const allMoveNames = new Set(Object.values(moves).map((m) => m.name))
const allAbilityNames = new Set(Object.values(abilities).map((a) => a.name))

console.log(
  `bundle: ${inScopeMoves.size} moves and ${inScopeAbilities.size} abilities in Gen 1-4 scope` +
    ` (of ${allMoveNames.size} and ${allAbilityNames.size} total)`,
)

/*
  VERIFIED ON BULBAPEDIA, not guessed. Seven of the handoff's eight flag
  categories exist under the names it proposed. CONTACT DOES NOT: neither
  "Category:Contact moves" nor "Category:Moves that make contact" exists, and
  nothing under "Moves that ..." covers it -- so the contact flag has no
  category to read and needs a different source.
*/
const FLAG_CATEGORIES = [
  ['sound', 'Category:Sound-based moves'],
  ['punch', 'Category:Punching moves'],
  ['powder', 'Category:Powder and spore moves'],
  ['bite', 'Category:Biting moves'],
  ['pulse', 'Category:Pulse moves'],
  ['dance', 'Category:Dance moves'],
  ['ballistic', 'Category:Ball and bomb moves'],
]

const report = { flags: {}, unmatched: [], outOfScope: {} }

hr('MOVE FLAGS — seven categories that exist')
for (const [flag, category] of FLAG_CATEGORIES) {
  const titles = await categoryMembers(category)
  const matched = []
  const later = []
  const unmatched = []
  for (const title of titles) {
    const key = normalise(title)
    if (inScopeMoves.has(key)) matched.push(key)
    else if (allMoveNames.has(key)) later.push(key)
    else unmatched.push(title)
  }
  report.flags[flag] = matched
  report.outOfScope[flag] = later.length
  for (const u of unmatched) report.unmatched.push({ dataset: `flag:${flag}`, title: u })
  console.log(
    `  ${flag.padEnd(10)} ${String(titles.length).padStart(3)} members ` +
      `-> ${String(matched.length).padStart(3)} in scope, ` +
      `${String(later.length).padStart(3)} Gen 5+, ${unmatched.length} unmatched`,
  )
  console.log(`             ${matched.slice(0, 10).join(', ')}${matched.length > 10 ? ' ...' : ''}`)
  await sleep(DELAY_MS)
}

hr('ABILITY IGNORABILITY')
const ignorableTitles = await categoryMembers('Category:Ignorable Abilities')
const ignorable = []
const ignorableLater = []
for (const title of ignorableTitles) {
  const key = normalise(title)
  if (inScopeAbilities.has(key)) ignorable.push(key)
  else if (allAbilityNames.has(key)) ignorableLater.push(key)
  else report.unmatched.push({ dataset: 'ignorable', title })
}
console.log(
  `  ${ignorableTitles.length} members -> ${ignorable.length} in Gen 1-4 scope, ` +
    `${ignorableLater.length} Gen 5+, ` +
    `${report.unmatched.filter((u) => u.dataset === 'ignorable').length} unmatched`,
)

/*
  The five the handoff names as NOT ignorable despite fitting the pattern. All
  five are Gen 7+ abilities, so none of them can appear in this app at all --
  which is worth saying out loud rather than encoding a rule nothing can reach.
*/
const EXCEPTIONS = ['comatose', 'shields-down', 'full-metal-body', 'shadow-shield', 'prism-armor']
console.log('\n  the five stated exceptions, checked against the bundle:')
for (const name of EXCEPTIONS) {
  const a = Object.values(abilities).find((x) => x.name === name)
  const gen = a?.generation_id ?? '(not in bundle)'
  console.log(
    `    ${name.padEnd(16)} generation ${String(gen).padEnd(4)}` +
      `${a && gen <= 4 ? 'IN SCOPE — needs the exception' : 'out of scope — unreachable here'}` +
      `${ignorable.includes(name) ? ' — AND IS IN THE CATEGORY' : ''}`,
  )
}

const notIgnorable = [...inScopeAbilities.keys()].filter((n) => !ignorable.includes(n))
console.log(
  `\n  in scope: ${ignorable.length} ignorable, ${notIgnorable.length} not.` +
    `\n  ignorable sample: ${ignorable.slice(0, 12).join(', ')}` +
    `\n  not-ignorable sample: ${notIgnorable.slice(0, 12).join(', ')}`,
)

hr('UNMATCHED — manual review, nothing dropped silently')
if (report.unmatched.length === 0) console.log('  none')
for (const u of report.unmatched) console.log(`  ${u.dataset.padEnd(16)} ${u.title}`)

hr('TOTALS')
console.log(
  `  flags in scope: ${Object.entries(report.flags)
    .map(([f, l]) => `${f} ${l.length}`)
    .join(', ')}`,
)
console.log(`  ignorable abilities in scope: ${ignorable.length}`)
console.log(`  unmatched needing a decision: ${report.unmatched.length}`)
