/**
 * The Platinum and HeartGold/SoulSilver Challenge Tracker: per facility, the
 * current streak, the best streak and the two prints. The "next Brain" line is
 * DERIVED from the streak and reference/gen4.ts (the Brain's Silver and Gold
 * battles), never typed. PURE and UI-free: model.ts normalises and merges with
 * these, and verify:frontier-tracker runs them in Node.
 *
 * Stored in the Challenge Tracker document (`games`, schema v2, model.ts):
 * games.platinum.facilities[id] and games['heartgold-soulsilver'].facilities[id].
 * No version bump: v2 already carries `games`, and a field it does not know is
 * kept (keep()).
 *
 * Only reference/gen4.ts (pure constants) at runtime: this file is in the eager
 * tracker store's bundle (trackerStore.ts).
 */

import { GEN4_FACILITIES, GEN4_FACILITY_ORDER, type Gen4Facility, type Gen4FacilityId } from '../reference/gen4'

export interface Gen4FacilityLog {
  /** Battles won in the streak under way. */
  streak: number
  /** The longest streak; raised with the streak, editable. */
  best: number
  silver?: boolean
  gold?: boolean
}

export interface Gen4GameLog {
  facilities: Partial<Record<Gen4FacilityId, Gen4FacilityLog>>
}

export const EMPTY_FACILITY_LOG: Gen4FacilityLog = { streak: 0, best: 0 }

// ------------------------------------------------------------------ normalise / merge

const isObj = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x)
const natural = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : undefined

function facilityLog(x: Record<string, unknown>): Gen4FacilityLog {
  const out = { ...x } as Record<string, unknown>
  delete out.silver
  delete out.gold
  out.streak = natural(x.streak) ?? 0
  out.best = natural(x.best) ?? 0
  if (typeof x.silver === 'boolean') out.silver = x.silver
  if (typeof x.gold === 'boolean') out.gold = x.gold
  return out as unknown as Gen4FacilityLog
}

/** Any stored value -> a game's log, or undefined when it is not one. A newer client's fields are kept. */
export function normaliseGen4Game(x: unknown): Gen4GameLog | undefined {
  if (!isObj(x)) return undefined
  const facilities: Record<string, unknown> = isObj(x.facilities) ? { ...x.facilities } : {}
  for (const id of GEN4_FACILITY_ORDER) {
    const f = facilities[id]
    if (isObj(f)) facilities[id] = facilityLog(f)
    else delete facilities[id]
  }
  return { ...x, facilities } as Gen4GameLog
}

/**
 * Facility by facility: the best is the higher, the STREAK is the base's (the
 * device already holding data; neither side carries a time to say which is
 * later), a print held on either side is held. A facility only one side has
 * comes whole.
 */
export function mergeGen4Game(base: Gen4GameLog, added: Gen4GameLog): Gen4GameLog {
  const facilities: Record<string, unknown> = { ...added.facilities, ...base.facilities }
  for (const id of GEN4_FACILITY_ORDER) {
    const b = base.facilities[id]
    const a = added.facilities[id]
    if (!b || !a) continue
    const f: Gen4FacilityLog = { ...a, ...b, streak: b.streak, best: Math.max(a.best, b.best) }
    if (a.silver || b.silver) f.silver = true
    if (a.gold || b.gold) f.gold = true
    facilities[id] = f
  }
  return { ...added, ...base, facilities } as Gen4GameLog
}

export const gen4HasData = (g: Gen4GameLog | undefined): boolean =>
  Object.values(g?.facilities ?? {}).some((f) => !!f && (f.streak > 0 || f.best > 0 || !!f.silver || !!f.gold))

// ------------------------------------------------------------------ edits

const withFacility = (
  g: Gen4GameLog | undefined,
  id: Gen4FacilityId,
  fn: (f: Gen4FacilityLog) => Gen4FacilityLog,
): Gen4GameLog => ({
  ...g,
  facilities: { ...g?.facilities, [id]: fn(g?.facilities?.[id] ?? EMPTY_FACILITY_LOG) },
})

/** The streak; the best rises with it, never falls. */
export const setStreak = (g: Gen4GameLog | undefined, id: Gen4FacilityId, streak: number): Gen4GameLog =>
  withFacility(g, id, (f) => ({ ...f, streak, best: Math.max(f.best, streak) }))

/** The best, typed: never below the streak under way. */
export const setBest = (g: Gen4GameLog | undefined, id: Gen4FacilityId, best: number): Gen4GameLog =>
  withFacility(g, id, (f) => ({ ...f, best: Math.max(best, f.streak) }))

export const togglePrint = (g: Gen4GameLog | undefined, id: Gen4FacilityId, print: 'silver' | 'gold'): Gen4GameLog =>
  withFacility(g, id, (f) => ({ ...f, [print]: !f[print] }))

// ------------------------------------------------------------------ derived

export type NextBrain =
  | { kind: 'due'; facility: Gen4Facility; battle: number; print: 'silver' | 'gold'; held: boolean }
  | { kind: 'past'; facility: Gen4Facility }

/**
 * The next Brain battle of the streak under way: the battle after `streak` wins.
 * The Silver battle while it is ahead, then the Gold; past both, none is left in
 * this streak. `held` says the print is already yours.
 */
export function nextBrain(id: Gen4FacilityId, log: Gen4FacilityLog | undefined): NextBrain {
  const facility = GEN4_FACILITIES.find((f) => f.id === id) as Gen4Facility
  const next = (log?.streak ?? 0) + 1
  if (next <= facility.silver) return { kind: 'due', facility, battle: facility.silver, print: 'silver', held: !!log?.silver }
  if (next <= facility.gold) return { kind: 'due', facility, battle: facility.gold, print: 'gold', held: !!log?.gold }
  return { kind: 'past', facility }
}

/** "Palmer at battle 21, for the Silver Print" -- the line the tracker shows. */
export function nextBrainText(n: NextBrain): string {
  const name = n.facility.brain.name
  if (n.kind === 'past') return `No Brain left in this streak: ${name} was at battles ${n.facility.silver} and ${n.facility.gold}.`
  const print = n.print === 'silver' ? 'Silver Print' : 'Gold Print'
  return n.held ? `${name} at battle ${n.battle}; ${print} already held` : `${name} at battle ${n.battle}, for the ${print}`
}
