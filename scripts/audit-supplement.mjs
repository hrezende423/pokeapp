/**
 * Audits the generated supplement layer against the bundle and against known facts.
 *
 * TWO DIFFERENT KINDS OF CHECK, and the second is the one that matters. The first
 * half re-joins every emitted name to moves.json / abilities.json and requires it
 * to resolve to something the bundle really carries in Gen 1-4 scope -- that
 * catches a rename or a stale regeneration. But a join can be internally
 * consistent and still wrong, so the second half asserts facts derived by hand
 * from the games rather than read back out of the file it is testing: Tackle is
 * not a biting move, Mega Kick is not a punch, Intimidate is not ignorable.
 *
 * IT ALSO ASSERTS THE TWO DELIBERATE ABSENCES -- no contact flag, no ability
 * exception list -- because an absence that nothing guards is indistinguishable
 * from an omission, and both of these are decisions somebody could "helpfully"
 * undo. CLAUDE.md carries the reasoning.
 *
 * Static: reads the generated files and the bundle, no browser and no network.
 *
 * Usage: npm run audit:supplement
 */

import { readFileSync } from 'node:fs'


const mf = readFileSync('src/data/moveFlags.ts', 'utf8')
const ai = readFileSync('src/data/abilityIgnorability.ts', 'utf8')
const moves = JSON.parse(readFileSync('public/data/moves.json', 'utf8'))
const abil = JSON.parse(readFileSync('public/data/abilities.json', 'utf8'))

const FLAGS = ['sound', 'punch', 'powder', 'bite', 'pulse', 'dance', 'ballistic']
const names = (s) => (s.match(/'([^']+)'/g) ?? []).map((x) => x.slice(1, -1))

const flags = {}
for (const f of FLAGS) {
  const re = new RegExp('\\n  ' + f + ': \\[([\\s\\S]*?)\\n  \\]')
  const m = mf.match(re)
  if (!m) throw new Error('could not parse flag block: ' + f)
  flags[f] = names(m[1])
}
const ign = names(ai.match(/IGNORABLE_ABILITIES[^=]*=\s*\[([\s\S]*?)\n\]/)[1])

let fails = 0
const t = (label, cond) => {
  if (!cond) fails += 1
  console.log((cond ? '  ok   ' : '  FAIL ') + label)
}

console.log('parsed:', FLAGS.map((f) => `${f} ${flags[f].length}`).join(', '), '| ignorable', ign.length)

console.log('\n--- every emitted name resolves to a real Gen<=4 entity ---')
const moveByName = {}
for (const m of Object.values(moves)) moveByName[m.name] = m
const abilByName = {}
for (const a of Object.values(abil)) abilByName[a.name] = a

let bad = 0
for (const [f, list] of Object.entries(flags)) {
  for (const n of list) {
    const m = moveByName[n]
    if (!m || (m.generation_id ?? 1) > 4) {
      console.log('  BAD', f, n)
      bad += 1
    }
  }
}
for (const n of ign) {
  const a = abilByName[n]
  if (!a || (a.generation_id ?? 1) > 4) {
    console.log('  BAD ignorable', n)
    bad += 1
  }
}
const total = Object.values(flags).flat().length + ign.length
t(`all ${total} emitted names resolve to bundle entities in Gen 1-4`, bad === 0)

console.log('\n--- known-fact spot checks, hand-derived rather than read back from the source ---')
t('bite: Bite and Crunch flagged', flags.bite.includes('bite') && flags.bite.includes('crunch'))
t('bite: Hyper Fang flagged (a fang move counts as biting)', flags.bite.includes('hyper-fang'))
t('bite: Tackle NOT flagged', !flags.bite.includes('tackle'))
t('punch: Fire / Ice / Thunder Punch all flagged',
  ['fire-punch', 'ice-punch', 'thunder-punch'].every((n) => flags.punch.includes(n)))
t('punch: Mega Punch flagged', flags.punch.includes('mega-punch'))
t('punch: Mega Kick NOT flagged (not a punch)', !flags.punch.includes('mega-kick'))
t('sound: Growl, Roar, Screech, Perish Song flagged',
  ['growl', 'roar', 'screech', 'perish-song'].every((n) => flags.sound.includes(n)))
t('sound: Sing flagged', flags.sound.includes('sing'))
t('powder: Stun Spore, Sleep Powder, Spore flagged',
  ['stun-spore', 'sleep-powder', 'spore'].every((n) => flags.powder.includes(n)))
t('powder: exactly the 5 Gen 1-4 powder/spore moves', flags.powder.length === 5)
t('pulse: exactly 4 (Water/Dark/Dragon Pulse + Aura Sphere)', flags.pulse.length === 4)
t('dance: Swords Dance and Petal Dance flagged',
  flags.dance.includes('swords-dance') && flags.dance.includes('petal-dance'))
t('ballistic: Egg Bomb and Bullet Seed flagged',
  flags.ballistic.includes('egg-bomb') && flags.ballistic.includes('bullet-seed'))
t('overlap is real: Aura Sphere is BOTH pulse and ballistic',
  flags.pulse.includes('aura-sphere') && flags.ballistic.includes('aura-sphere'))

console.log('\n--- ability ignorability ---')
t('Levitate is ignorable (the canonical case)', ign.includes('levitate'))
t('Flash Fire, Water Absorb, Volt Absorb ignorable',
  ['flash-fire', 'water-absorb', 'volt-absorb'].every((n) => ign.includes(n)))
t('Wonder Guard is ignorable', ign.includes('wonder-guard'))
t('Intimidate NOT ignorable (not a damage-time ability)', !ign.includes('intimidate'))
t('Static NOT ignorable', !ign.includes('static'))

console.log('\n--- the two deliberate absences ---')
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
t('no exception list encoded in abilityIgnorability.ts',
  !/comatose|shields-down|full-metal-body|shadow-shield|prism-armor/i.test(code(ai)))
t('no contact flag anywhere in moveFlags.ts', !/contact/i.test(code(mf)))

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' FAILURE(S)'}`)
process.exit(fails ? 1 : 0)
