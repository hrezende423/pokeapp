/**
 * Multi-Counter: the rules, pure and UI-free (asserted by verify:counters).
 *
 * `goal` and `step` are kept AS TYPED (strings while the owner edits); the
 * functions below read them through `goalOf` / `stepOf`, so a half-typed field
 * never produces a NaN.
 */

export type CounterMode = 'up' | 'down'

export interface Counter {
  id: string
  name: string
  value: number
  mode: CounterMode
  goal: string | number
  step: string | number
}

export const NAME_MAX = 40
export const DEFAULT_COUNT = 6

/** BR-4: every stored or shown value is rounded to 6 decimals (0.1 + 0.2 -> 0.3). */
export const round6 = (n: number): number => Math.round((n + Number.EPSILON) * 1e6) / 1e6

const toNumber = (x: string | number): number => (typeof x === 'number' ? x : x.trim() === '' ? NaN : Number(x))

/** The increment: empty, zero, negative or unreadable falls back to 1. */
export function stepOf(c: Pick<Counter, 'step'>): number {
  const n = toNumber(c.step)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** The goal, or null: empty, unreadable and <= 0 all count as no goal. */
export function goalOf(c: Pick<Counter, 'goal'>): number | null {
  const n = toNumber(c.goal)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Where a counter starts and returns to: the goal when it counts down to zero, else 0. */
export function startValue(c: Pick<Counter, 'mode' | 'goal'>): number {
  return c.mode === 'down' ? (goalOf(c) ?? 0) : 0
}

export function makeCounter(id: string, name: string): Counter {
  return { id, name, value: 0, mode: 'up', goal: '', step: 1 }
}

export function defaultCounters(): Counter[] {
  return Array.from({ length: DEFAULT_COUNT }, (_, i) => makeCounter(`c${i + 1}`, `Counter ${i + 1}`))
}

/** + or - one increment. Negative values are allowed; a reached goal does not lock (BR-3). */
export function nudge(c: Counter, dir: 1 | -1): Counter {
  return { ...c, value: round6(c.value + dir * stepOf(c)) }
}

export function resetCounter(c: Counter): Counter {
  return { ...c, value: startValue(c) }
}

/** BR-1: switching direction resets the value. */
export function setMode(c: Counter, mode: CounterMode): Counter {
  if (mode === c.mode) return c
  const next = { ...c, mode }
  return { ...next, value: startValue(next) }
}

/**
 * BR-2: a goal set on a descending counter that sits at 0 puts the value at the goal.
 * The goal is typed one key at a time ("3", then "30"), so a counter still sitting at
 * its previous goal (the start BR-2 gave it a keystroke ago) follows the new one.
 */
export function setGoal(c: Counter, goal: string): Counter {
  const next = { ...c, goal }
  const g = goalOf(next)
  const atStart = c.value === 0 || c.value === goalOf(c)
  return next.mode === 'down' && atStart && g != null ? { ...next, value: g } : next
}

/** 0-100, or null with no goal. Up: value/goal. Down: (goal - value)/goal. */
export function progress(c: Counter): number | null {
  const g = goalOf(c)
  if (g == null) return null
  const raw = c.mode === 'up' ? c.value / g : (g - c.value) / g
  return Math.min(100, Math.max(0, round6(raw * 100)))
}

export function isReached(c: Counter): boolean {
  const g = goalOf(c)
  if (g == null) return false
  return c.mode === 'up' ? c.value >= g : c.value <= 0
}

export function statusText(c: Counter): string {
  const g = goalOf(c)
  if (g == null) return c.mode === 'up' ? 'Ascending' : 'Descending'
  if (isReached(c)) return c.mode === 'up' ? 'Goal reached' : 'Reached zero'
  return `${round6(c.mode === 'up' ? g - c.value : c.value)} left`
}

// --------------------------------------------------------------- the stored document

export interface CountersDoc {
  schemaVersion: 1
  counters: Counter[]
}

export const DEFAULT_DOC: CountersDoc = { schemaVersion: 1, counters: defaultCounters() }

const isObject = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x)
const asField = (x: unknown, fallback: string | number): string | number =>
  typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)) ? x : fallback

/**
 * Any stored value -> a valid document. Nothing saved or a shape that is not a
 * document at all gives the 6 defaults; a saved EMPTY list stays empty (the owner
 * removed them all). Idempotent.
 */
export function normalise(raw: unknown): CountersDoc {
  if (!isObject(raw) || !Array.isArray(raw.counters)) return DEFAULT_DOC
  const seen = new Set<string>()
  const counters: Counter[] = []
  raw.counters.forEach((item, i) => {
    if (!isObject(item)) return
    let id = typeof item.id === 'string' && item.id ? item.id : `c${i + 1}`
    while (seen.has(id)) id += '_'
    seen.add(id)
    const value = typeof item.value === 'number' && Number.isFinite(item.value) ? round6(item.value) : 0
    counters.push({
      id,
      name: typeof item.name === 'string' ? item.name.slice(0, NAME_MAX) : `Counter ${i + 1}`,
      value,
      mode: item.mode === 'down' ? 'down' : 'up',
      goal: asField(item.goal, ''),
      step: asField(item.step, 1),
    })
  })
  return { schemaVersion: 1, counters }
}
