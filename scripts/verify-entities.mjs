/**
 * verify:entities -- the entity-link engine (src/lib/entities), browser-free.
 *
 * Imports the PURE engine with importTs and drives it with a literal fake
 * context, so nothing here needs the data bundle, a server or a browser. The
 * data-wired context (appContext.ts) is deliberately not exercised here.
 */
import { importTs } from './lib/tsModule.mjs'

const failures = []
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const E = await importTs('src/lib/entities/index.ts')

/* One valid ref per kind, with its canonical string. */
const SAMPLES = [
  [{ kind: 'species', id: 25 }, 'species:25'],
  [{ kind: 'move', id: 85 }, 'move:85'],
  [{ kind: 'item', id: 1 }, 'item:1'],
  [{ kind: 'ability', id: 65 }, 'ability:65'],
  [{ kind: 'collectionEntry', id: 'c12' }, 'collectionEntry:c12'],
  [{ kind: 'trainer', game: 'platinum', id: 'TRAINER_CHAMPION_CYNTHIA' }, 'trainer:platinum/TRAINER_CHAMPION_CYNTHIA'],
  [{ kind: 'route', id: 7 }, 'route:7'],
  [{ kind: 'game', id: 'heartgold-soulsilver' }, 'game:heartgold-soulsilver'],
  [{ kind: 'playthrough', id: 'p1' }, 'playthrough:p1'],
]

hr('1. FORMAT / PARSE ROUND TRIP')
{
  check('every kind has a sample', same(SAMPLES.map(([r]) => r.kind), [...E.ENTITY_KINDS]))
  for (const [ref, text] of SAMPLES) {
    const formatted = E.formatRef(ref)
    const parsed = E.parseRef(text)
    check(`${ref.kind}: formatRef -> "${text}"`, formatted === text, formatted)
    check(`${ref.kind}: parseRef(formatRef(r)) deep-equals r`, same(E.parseRef(formatted), ref), JSON.stringify(parsed))
    check(`${ref.kind}: formatRef(parseRef(s)) === s`, parsed != null && E.formatRef(parsed) === text)
  }
}

hr('2. MALFORMED REFS ARE REJECTED')
{
  const badText = [
    '',
    'species',
    'species:',
    ':25',
    'species:025',
    'species:0',
    'species:-1',
    'species:2.5',
    'species:1e3',
    'species: 25',
    'species:25 ',
    'Species:25',
    'pokemon:25',
    'move:abc',
    'route:9999999999',
    'collectionEntry:',
    'collectionEntry:c 1',
    'collectionEntry:c1/2',
    'trainer:platinum',
    'trainer:/TRAINER_X',
    'trainer:platinum/',
    'trainer:Platinum/TRAINER_X',
    'trainer:platinum/TRAINER-X',
    'trainer:platinum/a/b',
    'game:Platinum',
    'game:heartgold--soulsilver',
    'game:-platinum',
    'playthrough:',
    'playthrough:a:b',
  ]
  for (const t of badText) check(`parseRef(${JSON.stringify(t)}) is null`, E.parseRef(t) === null)
  check('parseRef(non-string) is null', E.parseRef(25) === null && E.parseRef(null) === null)

  const badRefs = [
    { kind: 'species', id: 0 },
    { kind: 'species', id: 2.5 },
    { kind: 'species', id: '25' },
    { kind: 'move', id: Number.NaN },
    { kind: 'collectionEntry', id: '' },
    { kind: 'trainer', game: 'platinum' },
    { kind: 'trainer', game: 'Platinum', id: 'X' },
    { kind: 'game', id: 'plat inum' },
    { kind: 'unknown', id: 1 },
  ]
  for (const r of badRefs) {
    let threw = false
    try {
      E.formatRef(r)
    } catch {
      threw = true
    }
    check(`formatRef(${JSON.stringify(r)}) throws`, threw && !E.isValidRef(r))
  }
}

/* A fake context: literal tables, a generation rule per kind, no data layer. */
const SPECIES = { 25: { id: 25, display_name: 'Pikachu', gen: 1 }, 387: { id: 387, display_name: 'Turtwig', gen: 4 } }
const MOVES = { 85: { id: 85, display_name: 'Thunderbolt', gen: 1 } }
const fake = {
  species: {
    get: ({ id }, g) => {
      const s = SPECIES[id]
      return s && (g == null || s.gen <= g) ? s : null
    },
    label: (s, _ref, g) => (g == null ? s.display_name : `${s.display_name} (Gen ${g})`),
  },
  move: { get: ({ id }) => MOVES[id] ?? null, label: (m) => m.display_name },
  item: { get: ({ id }) => (id === 1 ? { id: 1, display_name: 'Master Ball' } : null), label: (i) => i.display_name },
  ability: { get: ({ id }) => (id === 65 ? { id: 65, display_name: 'Overgrow' } : null), label: (a) => a.display_name },
  collectionEntry: {
    get: ({ id }, g) => (id === 'c12' && (g == null || g === 4) ? { id: 'c12', nickname: 'Sparky', generation: 4 } : null),
    label: (e) => e.nickname,
  },
  trainer: {
    get: ({ game, id }) =>
      game === 'platinum' && id === 'TRAINER_CHAMPION_CYNTHIA' ? { id, class_id: 'CHAMPION', name: 'Cynthia' } : null,
    label: (t) => `Champion ${t.name}`,
  },
  route: { get: ({ id }) => (id === 7 ? { id: 7, display_name: 'Route 201' } : null), label: (a) => a.display_name },
  game: { get: ({ id }) => (id === 'platinum' ? { id: 14, name: 'platinum' } : null), label: () => 'Platinum' },
  /* playthrough: deliberately absent -- reserved, no resolver registered. */
}

hr('3. RESOLVE AND LABEL: HIT AND MISS')
{
  check('resolve species:25 hits', E.resolve({ kind: 'species', id: 25 }, fake)?.display_name === 'Pikachu')
  check('resolve species:9 misses -> null', E.resolve({ kind: 'species', id: 9 }, fake) === null)
  check('resolve passes the generation: Turtwig in Gen 4 hits', E.resolve({ kind: 'species', id: 387 }, fake, 4)?.id === 387)
  check('resolve passes the generation: Turtwig in Gen 3 misses', E.resolve({ kind: 'species', id: 387 }, fake, 3) === null)
  check(
    'resolve trainer hits on game + id',
    E.resolve({ kind: 'trainer', game: 'platinum', id: 'TRAINER_CHAMPION_CYNTHIA' }, fake)?.name === 'Cynthia',
  )
  check('resolve trainer misses in another game', E.resolve({ kind: 'trainer', game: 'diamond-pearl', id: 'TRAINER_CHAMPION_CYNTHIA' }, fake) === null)
  check('resolve playthrough (no resolver registered) -> null', E.resolve({ kind: 'playthrough', id: 'p1' }, fake) === null)
  check('resolve with an empty context -> null', E.resolve({ kind: 'species', id: 25 }, {}) === null)

  const hits = [
    [{ kind: 'species', id: 25 }, 'Pikachu'],
    [{ kind: 'move', id: 85 }, 'Thunderbolt'],
    [{ kind: 'item', id: 1 }, 'Master Ball'],
    [{ kind: 'ability', id: 65 }, 'Overgrow'],
    [{ kind: 'collectionEntry', id: 'c12' }, 'Sparky'],
    [{ kind: 'trainer', game: 'platinum', id: 'TRAINER_CHAMPION_CYNTHIA' }, 'Champion Cynthia'],
    [{ kind: 'route', id: 7 }, 'Route 201'],
    [{ kind: 'game', id: 'platinum' }, 'Platinum'],
  ]
  for (const [ref, text] of hits) check(`label ${E.formatRef(ref)} = "${text}"`, E.label(ref, fake) === text, E.label(ref, fake))
  check('label passes the generation to the resolver', E.label({ kind: 'species', id: 25 }, fake, 2) === 'Pikachu (Gen 2)')

  const misses = [
    [{ kind: 'species', id: 9 }, 'Species #9'],
    [{ kind: 'species', id: 387 }, 'Species #387', 3],
    [{ kind: 'move', id: 1 }, 'Move #1'],
    [{ kind: 'item', id: 2 }, 'Item #2'],
    [{ kind: 'ability', id: 1 }, 'Ability #1'],
    [{ kind: 'collectionEntry', id: 'c12' }, 'Collection entry c12', 3],
    [{ kind: 'trainer', game: 'platinum', id: 'TRAINER_X' }, 'Trainer TRAINER_X (platinum)'],
    [{ kind: 'route', id: 8 }, 'Location #8'],
    [{ kind: 'game', id: 'emerald' }, 'Game emerald'],
    [{ kind: 'playthrough', id: 'p1' }, 'Playthrough p1'],
  ]
  for (const [ref, text, g] of misses) {
    check(`label miss ${E.formatRef(ref)}${g ? ` @Gen ${g}` : ''} falls back to "${text}"`, E.label(ref, fake, g) === text, E.label(ref, fake, g))
  }
}

hr('4. DEEP LINKS (the NavLocation the nav applies)')
{
  const expected = [
    ['species:25', { page: 'pokedex', entry: 25 }],
    ['move:85', { page: 'movedex', entry: 85 }],
    ['item:1', { page: 'itemdex', entry: 1 }],
    ['ability:65', { page: 'abilitydex', entry: 65 }],
    ['collectionEntry:c12', { page: 'collection', entry: null }],
    ['trainer:platinum/TRAINER_CHAMPION_CYNTHIA', { page: 'trainerdex', entry: null }],
    ['route:7', null],
    ['game:heartgold-soulsilver', null],
    ['playthrough:p1', null],
  ]
  check('every kind has an expected deep link', same(expected.map(([t]) => E.parseRef(t).kind), [...E.ENTITY_KINDS]))
  for (const [text, target] of expected) {
    const got = E.deepLink(E.parseRef(text))
    check(`deepLink(${text}) = ${JSON.stringify(target)}`, same(got, target), JSON.stringify(got))
  }
}

hr('5. WHAT LINKS HERE')
{
  const pikachu = { kind: 'species', id: 25 }
  const noteA = { kind: 'playthrough', id: 'a' }
  const sources = [
    { owner: noteA, refs: [{ kind: 'move', id: 85 }, { kind: 'species', id: 25 }, { kind: 'species', id: 25 }] },
    { owner: 'journal/2026-11-07', refs: [{ kind: 'species', id: 25 }] },
    { owner: { kind: 'playthrough', id: 'a' }, refs: [{ kind: 'species', id: 25 }] }, // same owner, rebuilt
    { owner: 'journal/2026-11-07', refs: [{ kind: 'species', id: 25 }] }, // same string owner again
    { owner: 'journal/unrelated', refs: [{ kind: 'species', id: 26 }, { kind: 'move', id: 25 }] },
    { owner: { kind: 'species', id: 25 }, refs: [{ kind: 'species', id: 25 }] }, // self
    { owner: 'empty', refs: [] },
  ]
  const got = E.whatLinksHere(pikachu, sources)
  check('duplicates collapse to one per owner, first-seen order', same(got, [noteA, 'journal/2026-11-07']), JSON.stringify(got))
  check('a ref of another kind with the same id does not match (move:25)', !got.includes('journal/unrelated'))
  check('an owner never lists itself', !got.some((o) => typeof o === 'object' && o.kind === 'species'))
  check('no match -> empty list', same(E.whatLinksHere({ kind: 'item', id: 999 }, sources), []))
  check('no sources -> empty list', same(E.whatLinksHere(pikachu, []), []))
  check(
    'trainers match on game AND id',
    same(
      E.whatLinksHere({ kind: 'trainer', game: 'platinum', id: 'T' }, [
        { owner: 'x', refs: [{ kind: 'trainer', game: 'diamond-pearl', id: 'T' }] },
        { owner: 'y', refs: [{ kind: 'trainer', game: 'platinum', id: 'T' }] },
      ]),
      ['y'],
    ),
  )
}

hr('SUMMARY')
if (failures.length) {
  console.log(`${failures.length} FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('ALL CHECKS PASSED')
