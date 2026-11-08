/**
 * verify:counters -- the Multi-Counter's maths and storage (src/modules/tools/counters/).
 * Browser-free: the app's TypeScript is imported in Node (lib/tsModule.mjs) over an
 * in-memory localStorage. Every expected value is a literal worked by hand.
 * The screen itself is driven in verify-tools.mjs (section "Counters").
 */
import { importTs, memoryStorage } from './lib/tsModule.mjs'

const failures = []
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(label)
}
const hr = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

globalThis.localStorage = memoryStorage()
const m = await importTs('src/modules/tools/counters/countersMath.ts')
const { countersDocument: doc } = await importTs('src/modules/tools/counters/countersStore.ts')

const c = (over = {}) => ({ id: 'x', name: 'X', value: 0, mode: 'up', goal: '', step: 1, ...over })

hr('1. INCREMENT AND GOAL FALLBACKS')
check('increment: empty, 0, negative, text fall back to 1', [m.stepOf(c({ step: '' })), m.stepOf(c({ step: 0 })), m.stepOf(c({ step: -2 })), m.stepOf(c({ step: 'abc' }))].every((x) => x === 1))
check('increment: 3 and "0.5" are kept', m.stepOf(c({ step: 3 })) === 3 && m.stepOf(c({ step: '0.5' })) === 0.5)
check('goal: empty, 0 and negative count as no goal', [m.goalOf(c({ goal: '' })), m.goalOf(c({ goal: 0 })), m.goalOf(c({ goal: '-5' }))].every((x) => x === null))
check('goal: "252" is 252', m.goalOf(c({ goal: '252' })) === 252)

hr('2. + / - AND BR-3, BR-4')
check('+ adds the increment: 0 + 4 = 4', m.nudge(c({ step: 4 }), 1).value === 4)
check('- goes negative: 0 - 1 = -1', m.nudge(c(), -1).value === -1)
check('a blank increment adds 1', m.nudge(c({ step: '' }), 1).value === 1)
check('BR-4: 0.1 + 0.2 shows 0.3', m.nudge(c({ value: 0.1, step: 0.2 }), 1).value === 0.3)
check('BR-4: 0.3 - 0.1 = 0.2', m.nudge(c({ value: 0.3, step: 0.1 }), -1).value === 0.2)
check('BR-3: counting continues past the goal: 252 + 1 = 253', m.nudge(c({ value: 252, goal: 252 }), 1).value === 253)

hr('3. PROGRESS AND STATUS')
const up = (value) => c({ goal: '252', value })
check('up 120/252: 47.619048 %, "132 left", not reached', m.progress(up(120)) === 47.619048 && m.statusText(up(120)) === '132 left' && !m.isReached(up(120)))
check('up 252/252: 100 %, "Goal reached"', m.progress(up(252)) === 100 && m.statusText(up(252)) === 'Goal reached' && m.isReached(up(252)))
check('up 300/252: clamped to 100 %, still "Goal reached"', m.progress(up(300)) === 100 && m.statusText(up(300)) === 'Goal reached')
check('up -5/252: clamped to 0 %, "257 left"', m.progress(up(-5)) === 0 && m.statusText(up(-5)) === '257 left')
const dn = (value) => c({ mode: 'down', goal: '30', value })
check('down 18 of 30: 40 %, "18 left"', m.progress(dn(18)) === 40 && m.statusText(dn(18)) === '18 left' && !m.isReached(dn(18)))
check('down 30 of 30: 0 %, "30 left"', m.progress(dn(30)) === 0 && m.statusText(dn(30)) === '30 left')
check('down 0: 100 %, "Reached zero"', m.progress(dn(0)) === 100 && m.statusText(dn(0)) === 'Reached zero' && m.isReached(dn(0)))
check('down -3: clamped to 100 %, "Reached zero"', m.progress(dn(-3)) === 100 && m.statusText(dn(-3)) === 'Reached zero')
check('no goal: no bar, status is the direction', m.progress(c()) === null && m.statusText(c()) === 'Ascending' && m.statusText(c({ mode: 'down' })) === 'Descending' && !m.isReached(c()))
check('goal 0 counts as no goal', m.progress(c({ goal: '0' })) === null && m.statusText(c({ goal: 0 })) === 'Ascending')
check('remaining is rounded: goal 1, value 0.7 -> "0.3 left"', m.statusText(c({ goal: 1, value: 0.7 })) === '0.3 left')

hr('4. RESET, BR-1, BR-2')
check('reset: ascending 5 -> 0', m.resetCounter(c({ value: 5 })).value === 0)
check('reset: descending with goal 30 -> 30', m.resetCounter(dn(4)).value === 30)
check('reset: descending without a goal -> 0', m.resetCounter(c({ mode: 'down', value: 4 })).value === 0)
check('BR-1: up -> down with goal 30 starts at 30', m.setMode(c({ goal: '30', value: 7 }), 'down').value === 30)
check('BR-1: up -> down without a goal starts at 0', m.setMode(c({ value: 7 }), 'down').value === 0)
check('BR-1: down -> up resets to 0', m.setMode(dn(12), 'up').value === 0)
check('BR-1: the same direction changes nothing', m.setMode(c({ value: 7 }), 'up').value === 7)
check('BR-2: goal 25 on a descending counter at 0 sets the value to 25', m.setGoal(c({ mode: 'down' }), '25').value === 25)
const typed = ['3', '30'].reduce((acc, g) => m.setGoal(acc, g), c({ mode: 'down' }))
check('BR-2: typing "30" key by key ends at 30, not 3', typed.value === 30 && typed.goal === '30')
const typed2 = ['2', '25', '252'].reduce((acc, g) => m.setGoal(acc, g), c({ mode: 'down' }))
check('BR-2: typing "252" key by key ends at 252', typed2.value === 252)
const typed3 = ['0', '0.', '0.5'].reduce((acc, g) => m.setGoal(acc, g), c({ mode: 'down' }))
check('BR-2: typing "0.5" key by key ends at 0.5', typed3.value === 0.5)
check('BR-2: a counter that has counted down (18 of 30) keeps its value when the goal is edited', m.setGoal(dn(18), '40').value === 18)
check('BR-2: not when the value is not 0', m.setGoal(c({ mode: 'down', value: 5 }), '25').value === 5)
check('BR-2: not on an ascending counter', m.setGoal(c({ value: 0 }), '25').value === 0)
check('BR-2: not for a goal that counts as none ("0", "")', m.setGoal(c({ mode: 'down' }), '0').value === 0 && m.setGoal(c({ mode: 'down' }), '').value === 0)

hr('5. DEFAULTS AND NORMALISE')
const d = m.defaultCounters()
check('6 defaults named Counter 1..6, value 0, up, no goal, increment 1', d.length === 6 && d.every((x, i) => x.name === `Counter ${i + 1}` && x.value === 0 && x.mode === 'up' && x.goal === '' && x.step === 1))
check('ids are distinct', new Set(d.map((x) => x.id)).size === 6)
check('nothing saved / not a document -> the 6 defaults', same(m.normalise(null), m.DEFAULT_DOC) && same(m.normalise('x'), m.DEFAULT_DOC) && same(m.normalise({ counters: 'x' }), m.DEFAULT_DOC))
check('a saved empty list stays empty', m.normalise({ counters: [] }).counters.length === 0)
const n1 = m.normalise({ counters: [{ id: 'a', name: 'Z'.repeat(50), value: 'x', mode: 'sideways', goal: null, step: undefined }, 7] })
check('bad fields fall back; the name is cut to 40; a non-object item is dropped', n1.counters.length === 1 && n1.counters[0].name.length === 40 && n1.counters[0].value === 0 && n1.counters[0].mode === 'up' && n1.counters[0].goal === '' && n1.counters[0].step === 1)
check('normalise is idempotent', same(m.normalise(n1), n1))

hr('6. STORAGE')
const KEY = 'pokeapp:counters:v1'
check('local only: name "counters", key pokeapp:counters:v1, sync false', doc.name === 'counters' && doc.key === KEY && doc.sync === false)
doc.reset()
check('nothing saved reads as the 6 defaults', same(doc.read(), m.DEFAULT_DOC))
const saved = { schemaVersion: 1, counters: [c({ id: 'k1', name: 'HP EVs', value: 120, goal: '252', step: '4' }), c({ id: 'k2', name: 'Candies', mode: 'down', value: 18, goal: 30 })] }
doc.write(saved)
doc.reset()
check('round trip: every field of both counters survives a reload', same(doc.read(), saved), JSON.stringify(doc.read()).slice(0, 120))
check('the whole state is in the one key', same(JSON.parse(localStorage.getItem(KEY)).counters.map((x) => x.id), ['k1', 'k2']))
doc.write({ schemaVersion: 1, counters: [] })
doc.reset()
check('removing every counter persists as zero counters', doc.read().counters.length === 0)
localStorage.setItem(KEY, '{not json')
doc.reset()
check('corrupt JSON -> the 6 defaults', same(doc.read(), m.DEFAULT_DOC))
localStorage.setItem(KEY, JSON.stringify({ counters: 5 }))
doc.reset()
check('a wrong shape -> the 6 defaults', same(doc.read(), m.DEFAULT_DOC))
const denied = () => {
  throw new Error('denied')
}
globalThis.localStorage = { getItem: denied, setItem: denied, removeItem() {}, clear() {}, key: () => null, length: 0 }
doc.reset()
let threw = false
let afterWrite
try {
  const first = doc.read()
  doc.write({ schemaVersion: 1, counters: [c({ id: 'z' })] })
  afterWrite = doc.read().counters.length
  check('storage that throws -> the 6 defaults', same(first, m.DEFAULT_DOC))
} catch {
  threw = true
}
check('storage that throws never breaks a read or a write; the session still works', !threw && afterWrite === 1)
delete globalThis.localStorage
doc.reset()
check('no localStorage at all -> the 6 defaults', same(doc.read(), m.DEFAULT_DOC))

console.log(`\n${failures.length ? `FAILED (${failures.length}):\n  - ${failures.join('\n  - ')}` : 'all passed'}`)
process.exit(failures.length ? 1 : 0)
