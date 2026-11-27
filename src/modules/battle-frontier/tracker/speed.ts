/**
 * Trainer Hill (Emerald) and Trainer Tower (FireRed/LeafGreen) tracking: a
 * speed climb, NOT a win streak. Per facility per mode, the owner logs attempts
 * (floors cleared, the time, the date); the best clear and the current run are
 * DERIVED from them, never typed. PURE and UI-free: verify:frontier-reference
 * runs these in Node, and model.ts normalises and merges the logs with them.
 *
 * Stored in the Challenge Tracker document (`games`, schema v2; model.ts):
 * games.emerald.hill[mode] and games['firered-leafgreen'].tower[mode], keyed by
 * the mode name the Trainer Dex's facility uses ("Normal", "Single", ...).
 *
 * Only `import type` beyond reference/speed.ts: this file is in the eager
 * tracker store's bundle (trackerStore.ts), which must carry no loader code.
 */

import { SPEED_TIMER_CAP_CS } from '../reference/speed'

/** One climb: how far it got and the timer when it ended (centiseconds). */
export interface SpeedAttempt {
  id: string
  /** YYYY-MM-DD. */
  at: string
  /** Floors cleared, 0..the mode's floors. */
  floors: number
  timeCs: number
}

export interface SpeedModeLog {
  attempts: SpeedAttempt[]
}

/** Mode name -> its log. */
export type SpeedModes = Record<string, SpeedModeLog>

// ------------------------------------------------------------------ time

export type ParsedTime = { cs: number } | { error: string }

export const TIME_FORMAT_ERROR = 'Type the time as m:ss.cs or mm:ss.cs, e.g. 12:03.45.'
export const TIME_CAP_ERROR = 'The timer stops at 59:59.98.'

/**
 * "m:ss.cs" or "mm:ss.cs" -> centiseconds. Seconds 00-59, two centisecond
 * digits; anything past the timer's cap (59:59.98, reference/speed.ts) is
 * refused, as is any other shape.
 */
export function parseTime(text: string): ParsedTime {
  const m = /^(\d{1,2}):([0-5]\d)\.(\d{2})$/.exec(text.trim())
  if (!m) return { error: TIME_FORMAT_ERROR }
  const cs = (Number(m[1]) * 60 + Number(m[2])) * 100 + Number(m[3])
  return cs > SPEED_TIMER_CAP_CS ? { error: TIME_CAP_ERROR } : { cs }
}

/** Centiseconds -> "mm:ss.cs". */
export function formatTime(cs: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const whole = Math.max(0, Math.floor(cs))
  return `${pad(Math.floor(whole / 6000))}:${pad(Math.floor((whole % 6000) / 100))}.${pad(whole % 100)}`
}

// ------------------------------------------------------------------ derived

export type SpeedBest = { kind: 'clear'; attempt: SpeedAttempt } | { kind: 'furthest'; floors: number } | null

/**
 * The fastest attempt that cleared every floor (the earlier one on a tie); with
 * no full clear, the furthest any attempt got; null with no attempt at all.
 */
export function bestOf(attempts: readonly SpeedAttempt[], floors: number): SpeedBest {
  let clear: SpeedAttempt | null = null
  for (const a of attempts) if (a.floors >= floors && (!clear || a.timeCs < clear.timeCs)) clear = a
  if (clear) return { kind: 'clear', attempt: clear }
  if (!attempts.length) return null
  return { kind: 'furthest', floors: Math.max(...attempts.map((a) => a.floors)) }
}

/** The current run: the latest attempt by date, the last logged on a tie. */
export function latestOf(attempts: readonly SpeedAttempt[]): SpeedAttempt | null {
  let last: SpeedAttempt | null = null
  for (const a of attempts) if (!last || a.at >= last.at) last = a
  return last
}

/** Newest first, for the attempts table. */
export const newestFirst = (attempts: readonly SpeedAttempt[]): SpeedAttempt[] =>
  attempts
    .map((a, i) => [a, i] as const)
    .sort(([a, i], [b, j]) => (a.at === b.at ? j - i : a.at < b.at ? 1 : -1))
    .map(([a]) => a)

// ------------------------------------------------------------------ normalise / merge

const isObj = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x)
const natural = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : undefined

/** A stored attempt, or null when it does not read. Fields a newer client added are kept. */
function attempt(x: unknown): SpeedAttempt | null {
  if (!isObj(x)) return null
  const id = typeof x.id === 'string' && x.id !== '' ? x.id : undefined
  const at = typeof x.at === 'string' && x.at !== '' ? x.at : undefined
  const floors = natural(x.floors)
  const timeCs = natural(x.timeCs)
  if (!id || !at || floors == null || timeCs == null || timeCs > SPEED_TIMER_CAP_CS) return null
  return { ...x, id, at, floors, timeCs } as SpeedAttempt
}

/** Any stored value -> mode logs. Unreadable attempts are dropped, duplicates by id too. */
export function normaliseModes(x: unknown): SpeedModes {
  const out: SpeedModes = {}
  if (!isObj(x)) return out
  for (const [mode, v] of Object.entries(x)) {
    if (!isObj(v)) continue
    const seen = new Set<string>()
    const attempts = (Array.isArray(v.attempts) ? v.attempts : [])
      .map(attempt)
      .filter((a): a is SpeedAttempt => a != null && !seen.has(a.id) && (seen.add(a.id), true))
    out[mode] = { ...v, attempts }
  }
  return out
}

/** Attempts joined by id, the base's first; a merge never deletes. */
export function mergeModes(base: SpeedModes, added: SpeedModes): SpeedModes {
  const out: SpeedModes = { ...added, ...base }
  for (const [mode, log] of Object.entries(added)) {
    const mine = base[mode]
    if (!mine) continue
    const ids = new Set(mine.attempts.map((a) => a.id))
    out[mode] = { ...log, ...mine, attempts: [...mine.attempts, ...log.attempts.filter((a) => !ids.has(a.id))] }
  }
  return out
}

export const modesHaveAttempts = (m: SpeedModes | undefined): boolean =>
  Object.values(m ?? {}).some((log) => log.attempts.length > 0)

// ------------------------------------------------------------------ edits

export const addAttempt = (modes: SpeedModes | undefined, mode: string, a: SpeedAttempt): SpeedModes => ({
  ...modes,
  [mode]: { ...modes?.[mode], attempts: [...(modes?.[mode]?.attempts ?? []), a] },
})

export const deleteAttempt = (modes: SpeedModes | undefined, mode: string, id: string): SpeedModes => ({
  ...modes,
  [mode]: { ...modes?.[mode], attempts: (modes?.[mode]?.attempts ?? []).filter((a) => a.id !== id) },
})
