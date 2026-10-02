/**
 * Randomness for the turn engine, in one place so the SAME code runs three ways:
 *
 *   - the SANDBOX (P2) fixes each roll by policy: the reader picks min / max /
 *     average / a specific damage roll, and whether a crit, a miss or a secondary
 *     effect happens;
 *   - the MONTE CARLO (O2) draws every one from a seeded PRNG, so a run is
 *     reproducible from its seed;
 *   - the AI's own random checks always draw (they are the opponent's decisions,
 *     not outcomes the reader chooses), from the same PRNG.
 *
 * Every draw is labelled, so a run can record the events that decided it (O3).
 */

export type RollPolicy = 'min' | 'max' | 'avg' | 'random' | { index: number }
export type EventPolicy = 'never' | 'always' | 'random'

export interface Policies {
  roll: RollPolicy
  crit: EventPolicy
  /** 'never' = every move hits; 'always' = it misses. */
  miss: EventPolicy
  /** Secondary effects (status, flinch, stat changes on a hit). */
  secondary: EventPolicy
  /** Full paralysis, confusion self-hits, freeze thaws, sleep length... */
  status: EventPolicy
}

export const RANDOM_POLICIES: Policies = {
  roll: 'random',
  crit: 'random',
  miss: 'random',
  secondary: 'random',
  status: 'random',
}

export const DEFAULT_SANDBOX_POLICIES: Policies = {
  roll: 'avg',
  crit: 'never',
  miss: 'never',
  secondary: 'never',
  status: 'never',
}

/** A recorded chance event: what was rolled, its probability, and whether it happened. */
export interface ChanceEvent {
  turn: number
  /** The mon key (mine:... / theirs:...), or "both" for a shared roll. */
  /** The mon's key ('mine:...' / 'theirs:...'), or 'both' for a roll shared by the two. */
  who: string
  kind:
    | 'crit'
    | 'miss'
    | 'secondary'
    | 'roll'
    | 'speed-tie'
    | 'quick-claw'
    | 'full-para'
    | 'confusion'
    | 'thaw'
    | 'sleep'
    | 'ai'
    | 'multi-hit'
    | 'other'
  label: string
  p: number
  happened: boolean
}

/** mulberry32: small, fast, seedable. Not the games' PRNG -- outcomes, not RNG manipulation. */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }
  /** A byte, 0..255 -- the unit the Game Boy AI routines compare against. */
  byte(): number {
    return this.int(256)
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  get state(): number {
    return this.s
  }
}

export interface ChanceSource {
  rng: Rng
  policies: Policies
  events: ChanceEvent[]
  turn: number
}

/** Decide an event under a policy, recording it. */
export function decide(
  src: ChanceSource,
  who: string,
  kind: ChanceEvent['kind'],
  label: string,
  p: number,
  policy: EventPolicy,
): boolean {
  let happened: boolean
  if (p <= 0) happened = false
  else if (p >= 1) happened = true
  else if (policy === 'always') happened = true
  else if (policy === 'never') happened = false
  else happened = src.rng.chance(p)
  if (p > 0 && p < 1) src.events.push({ turn: src.turn, who, kind, label, p, happened })
  return happened
}

/** Pick a damage roll index from `count` equiprobable rolls. */
export function pickRoll(src: ChanceSource, count: number): number {
  const r = src.policies.roll
  if (r === 'min') return 0
  if (r === 'max') return count - 1
  if (r === 'avg') return Math.floor((count - 1) / 2)
  if (r === 'random') return src.rng.int(count)
  return Math.max(0, Math.min(count - 1, r.index))
}
