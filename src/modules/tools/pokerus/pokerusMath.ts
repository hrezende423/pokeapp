/**
 * #17 Pokérus: how it spreads through a party, battle by battle, as each game
 * does it. Exact (a Markov chain over the party), not sampled.
 *
 * PURE, AND UI-FREE. Read from the pinned pret disassemblies:
 *
 *   Gen 2 (pokegold / pokecrystal engine/events/pokerus/pokerus.asm,
 *   GivePokerusAndConvertBerries, run after a battle the player WINS):
 *     1/3 per battle. Only the FIRST party member with an active infection
 *     spreads, to ONE side: backward if it is last, else a coin flip (backward
 *     from the first slot does nothing). The search skips infected members and
 *     infects the first that never had it; a member whose status `and $3` is 0
 *     stops it -- a cured one, and also an ACTIVE one with 4 days left, a quirk
 *     of that mask. A fresh infection is impossible while one is active.
 *
 *   Gen 3-4 (pokeruby/pokeemerald PartySpreadPokerus, pokeplatinum
 *   Pokemon_ValidatePokerus, pokeheartgold Party_SpreadPokerus, run after every
 *   battle that is not a link battle):
 *     1/3 per battle; then every active member infects both neighbours that never
 *     had it, and the one it infects after itself is skipped -- so each spread
 *     grows every infected run by exactly one slot on each side.
 *
 *   FireRed / LeafGreen: both routines are empty. It never starts or spreads.
 *
 * Within one day: an infection's days only run down at midnight, which this
 * model does not cross.
 */

export type Slot = 'none' | 'active' | 'cured'
export type Rules = 'gen2' | 'gen34' | 'none'

export const SPREAD_CHANCE = 1 / 3
/** The fresh-infection roll every game shares: 3 of 65,536 values. */
export const FRESH_CHANCE = 3 / 65536

export function rulesFor(game: string): Rules | null {
  if (game === 'gold-silver' || game === 'crystal') return 'gen2'
  if (game === 'firered-leafgreen') return 'none'
  if (
    ['ruby-sapphire', 'emerald', 'diamond-pearl', 'platinum', 'heartgold-soulsilver'].includes(game)
  )
    return 'gen34'
  return null
}

/** One spread, given it happens: every party it can lead to, with its probability. */
export function spreadOnce(
  rules: Rules,
  party: readonly Slot[],
  strainDays = 1,
): { p: number; next: Slot[] }[] {
  if (rules === 'none') return [{ p: 1, next: [...party] }]
  if (rules === 'gen34') {
    const next = [...party]
    party.forEach((s, i) => {
      if (s !== 'active') return
      for (const j of [i - 1, i + 1]) if (party[j] === 'none') next[j] = 'active'
    })
    return [{ p: 1, next }]
  }
  // Gen 2: the first active member, one direction.
  const s = party.indexOf('active')
  const n = party.length
  if (s < 0 || n === 1) return [{ p: 1, next: [...party] }]
  const blocks = (x: Slot) => x === 'cured' || (x === 'active' && strainDays === 4)
  const walk = (dir: 1 | -1): Slot[] => {
    const next = [...party]
    for (let j = s + dir; j >= 0 && j < n; j += dir) {
      if (party[j] === 'none') {
        next[j] = 'active'
        break
      }
      if (blocks(party[j])) break
    }
    return next
  }
  if (s === n - 1) return [{ p: 1, next: walk(-1) }]
  return [
    { p: 0.5, next: walk(-1) },
    { p: 0.5, next: walk(1) },
  ]
}

const key = (party: readonly Slot[]) => party.join(',')

/** Every party after one battle, with its probability (the 2/3 no-spread case included). */
export function afterBattle(rules: Rules, party: readonly Slot[], strainDays = 1) {
  const out = new Map<string, { p: number; party: Slot[] }>()
  const add = (p: number, next: Slot[]) => {
    const k = key(next)
    const cur = out.get(k)
    if (cur) cur.p += p
    else out.set(k, { p, party: next })
  }
  if (rules === 'none') add(1, [...party])
  else {
    add(1 - SPREAD_CHANCE, [...party])
    for (const o of spreadOnce(rules, party, strainDays)) add(SPREAD_CHANCE * o.p, o.next)
  }
  return [...out.values()]
}

/** For each slot, the chance it has caught Pokérus after `battles` battles. */
export function chancesAfter(
  rules: Rules,
  party: readonly Slot[],
  battles: number,
  strainDays = 1,
): number[] {
  let dist = new Map<string, { p: number; party: Slot[] }>([
    [key(party), { p: 1, party: [...party] }],
  ])
  for (let b = 0; b < battles; b++) {
    const next = new Map<string, { p: number; party: Slot[] }>()
    for (const { p, party: from } of dist.values())
      for (const o of afterBattle(rules, from, strainDays)) {
        const k = key(o.party)
        const cur = next.get(k)
        if (cur) cur.p += p * o.p
        else next.set(k, { p: p * o.p, party: o.party })
      }
    dist = next
  }
  return party.map((_, i) => {
    let p = 0
    for (const d of dist.values()) if (d.party[i] !== 'none') p += d.p
    return p
  })
}

export type Reach = 'always' | 'sometimes' | 'never'

export interface Settled {
  /** Expected battles until nothing more can spread. 0 when nothing can. */
  battles: number
  /** Per slot: infected in every way the spread can end, in some, or in none. */
  reached: Reach[]
}

/**
 * Where the spread ends and how long it takes, in expectation. Spreading only
 * ever adds infections, so the chain is solved from the fullest parties down:
 * E(s) = (1 + sum over s' != s of P(s -> s') E(s')) / (1 - P(s -> s)).
 */
export function settle(rules: Rules, party: readonly Slot[], strainDays = 1): Settled {
  const memo = new Map<string, number>()
  const finals: Slot[][] = []
  const expect = (s: Slot[]): number => {
    const k = key(s)
    const hit = memo.get(k)
    if (hit != null) return hit
    const outs = afterBattle(rules, s, strainDays)
    const stay = outs.find((o) => key(o.party) === k)?.p ?? 0
    let e: number
    if (stay >= 1 - 1e-12) {
      e = 0
      finals.push(s)
    } else {
      let sum = 1
      for (const o of outs) if (key(o.party) !== k) sum += o.p * expect(o.party)
      e = sum / (1 - stay)
    }
    memo.set(k, e)
    return e
  }
  const battles = expect([...party])
  const reached = party.map((slot, i): Reach => {
    if (slot === 'cured') return 'never' // immune: it had it before
    const n = finals.filter((f) => f[i] !== 'none').length
    return n === finals.length ? 'always' : n === 0 ? 'never' : 'sometimes'
  })
  return { battles, reached }
}
