/**
 * The Challenge Tracker's document and its rules: pure and UI-free, so
 * verify:frontier-tracker runs them in Node against the real loader, and the
 * one-time import (scripts/frontier/import-bf-xlsx.mjs) builds its ledger with
 * the same functions the screen uses.
 *
 * THE BATTLE NUMBER IS STORED AS LOGGED (cumulative within the run, the Dome's
 * at four per tournament). It reaches the loader's own streak unit in ONE place,
 * `poolArgsAt` (Dome: wins before the battle / 4 = tournaments won). Nothing
 * stored and nothing shown is a loader streak.
 *
 * DERIVED, NEVER TYPED: a log row's Brain (the loader, at the symbols held at
 * that battle), the symbols a log earns, the run's number and outcome text. The
 * owner types opponents, results, the Dome pair and dropped slot, rentals, the
 * BP ledger and symbol overrides.
 *
 * Only `import type` from the loader: this file must stay out of the loader's
 * chunk (trackerStore.ts is eager, for the account menu's import and the sync).
 */

import type {
  BrainAppearance,
  FacilityId,
  FrontierData,
  FrontierFormat,
  LevelMode,
  TrainerPoolArgs,
} from '../data'
import { loaderStreak } from '../format'
import { mergeModes, modesHaveAttempts, normaliseModes, type SpeedModes } from './speed'

// ------------------------------------------------------------------ the document

export type RunOutcome = 'ongoing' | 'lost' | 'retired' | 'cleared'
export type BattleResult = 'W' | 'L'
export type Symbols = 0 | 1 | 2

/** A Factory rental: a species, and optionally which of its Frontier sets (FRONTIER_MON_* index). */
export interface Rental {
  species: number
  setIndex?: number
}

/** The three rentals drafted at the start of a set (battles 1, 8, 15, ...). */
export interface Draft {
  atBattle: number
  rentals: Rental[]
}

/** One rental swapped for another before a battle inside a set. Same species is valid. */
export interface Swap {
  atBattle: number
  out: Rental
  in: Rental
}

export interface Run {
  id: string
  facility: FacilityId
  format: FrontierFormat
  levelMode: LevelMode
  /** YYYY-MM-DD: the day it started, or for an imported run the day of the import. */
  startedAt: string
  imported?: boolean
  endedAt?: string
  outcome: RunOutcome
  note?: string
  /** The Dome: the owner's three, once per run. */
  dome?: { team: number[] }
  /** The Factory: a draft at each set's start, swaps inside a set. Never one per row. */
  drafts?: Draft[]
  swaps?: Swap[]
  /** The Pyramid: the floor being logged, saved at every tap; a Battle once it is closed. */
  openFloor?: OpenFloor
}

/**
 * A regular Pyramid trainer: exactly ONE Pokémon (FillFrontierTrainerParty(1),
 * battle_setup.c). null = Unknown. Brandon is not one: his three are the floor's
 * `opponents`, on the Brain row.
 */
export interface PyramidTrainer {
  trainerId?: number
  species: number | null
  setIndex?: number
  result: BattleResult
}

/** Wild Pokémon defeated on a floor; null = Unknown (not seen). */
export interface PyramidWild {
  species: number | null
  count: number
}

export interface PyramidItem {
  itemId: number
  qty: number
}

/** A Pyramid floor's log. Any list may be empty. */
export interface PyramidFloor {
  trainers: PyramidTrainer[]
  wild: PyramidWild[]
  items: PyramidItem[]
  /** The wild category picked for this floor (pyramidData.ts, 1-20). */
  wildCategory?: number
}

/** The Pyramid floor being logged: battle number `n` (the floor as logged), not yet closed. */
export interface OpenFloor {
  n: number
  pyramid: PyramidFloor
  /** A Brain floor: Brandon's three as picked so far (null = Unknown). */
  opponents?: (number | null)[]
  note?: string
}

export interface Battle {
  id: string
  runId: string
  /** As logged: cumulative within the run (the Dome's: 4 per tournament). */
  n: number
  /** Three species ids; null = Unknown (an explicit choice: the log's "-"). */
  opponents: (number | null)[]
  result: BattleResult
  /** The Dome: the pair the owner brought, and the OPPONENT's slot (1-3) that did not battle. */
  dome?: { pair: number[]; dropped: 1 | 2 | 3 | null }
  note?: string
  /** The Pyramid: the floor's trainers, wild Pokémon and items. `opponents` stays three Unknowns but on a Brain floor. */
  pyramid?: PyramidFloor
}

/** A manual symbol override; absent = follow the log. */
export interface SymbolFlags {
  silver?: boolean
  gold?: boolean
}

export interface LedgerLine {
  id: string
  /** YYYY-MM-DD. */
  at: string
  /** Earned (+) or spent (-). */
  delta: number
  reason: string
  runId?: string
  /** The set (Dome: tournament) this line was proposed for. */
  set?: number
  /** The Frontier Brain bonus inside `delta`, shown beside the reason. */
  brainBonus?: number
}

/**
 * The games beyond Emerald's Frontier (schema v2): Emerald's Trainer Hill and
 * FireRed/LeafGreen's Trainer Tower, per mode (speed.ts). The Emerald fields
 * above (runs, battles, symbols, bp) are untouched by it.
 */
export interface TrackerGames {
  emerald?: { hill?: SpeedModes }
  'firered-leafgreen'?: { tower?: SpeedModes }
}

export interface TrackerDoc {
  schemaVersion: 2
  runs: Run[]
  battles: Battle[]
  /** Manual symbol overrides, keyed facility|format|levelMode (`keyOf`). */
  symbols: Record<string, SymbolFlags>
  bp: { opening: number; ledger: LedgerLine[] }
  games: TrackerGames
}

export const TRACKER_VERSION = 2
export const EMPTY_TRACKER: TrackerDoc = {
  schemaVersion: 2,
  runs: [],
  battles: [],
  symbols: {},
  bp: { opening: 0, ledger: [] },
  games: {},
}

/**
 * v1 -> v2: the per-game record joins, empty. Pure; every Emerald field stays
 * where it was, untouched (src/store/CLAUDE.md).
 */
/**
 * v1 -> v2: adds `games`, every v1 field untouched. A v1-STAMPED doc may already
 * carry `games`: a v1 client's mergeTracker stamps schemaVersion 1 and keeps the
 * field through `...base` (first sync, merge import). Keep it; normaliseTracker
 * cleans it after.
 */
export const v1ToV2 = (doc: unknown): unknown => {
  const d = doc as Record<string, unknown>
  const games = d.games != null && typeof d.games === 'object' && !Array.isArray(d.games) ? d.games : {}
  return { ...d, schemaVersion: 2, games }
}

/** A speed facility's mode logs: Trainer Hill in Emerald, Trainer Tower in FireRed/LeafGreen. */
export function speedModesOf(doc: TrackerDoc, facility: 'trainer-hill' | 'trainer-tower'): SpeedModes {
  return (facility === 'trainer-hill' ? doc.games?.emerald?.hill : doc.games?.['firered-leafgreen']?.tower) ?? {}
}

/** The document with one speed facility's mode logs rewritten by `fn`; every other field untouched. */
export function updateSpeedModes(
  doc: TrackerDoc,
  facility: 'trainer-hill' | 'trainer-tower',
  fn: (modes: SpeedModes) => SpeedModes,
): TrackerDoc {
  const games = doc.games ?? {}
  const next = fn(speedModesOf(doc, facility))
  return facility === 'trainer-hill'
    ? { ...doc, games: { ...games, emerald: { ...games.emerald, hill: next } } }
    : { ...doc, games: { ...games, 'firered-leafgreen': { ...games['firered-leafgreen'], tower: next } } }
}

// ------------------------------------------------------------------ normalise / merge

const FACILITIES: readonly FacilityId[] = ['tower', 'dome', 'palace', 'arena', 'factory', 'pike', 'pyramid']
const FORMATS: readonly FrontierFormat[] = ['singles', 'doubles', 'multi', 'link-multi']
const OUTCOMES: readonly RunOutcome[] = ['ongoing', 'lost', 'retired', 'cleared']

const isObj = (x: unknown): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): string | undefined => (typeof x === 'string' && x !== '' ? x : undefined)
const int = (x: unknown): number | undefined => (typeof x === 'number' && Number.isInteger(x) ? x : undefined)
const posInt = (x: unknown): number | undefined => {
  const n = int(x)
  return n != null && n >= 1 ? n : undefined
}
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])
const oneOf = <T extends string>(x: unknown, list: readonly T[]): T | undefined =>
  list.includes(x as T) ? (x as T) : undefined

function rental(x: unknown): Rental | null {
  if (!isObj(x)) return null
  const species = posInt(x.species)
  if (species == null) return null
  const setIndex = int(x.setIndex)
  return setIndex != null && setIndex >= 0 ? { species, setIndex } : { species }
}

/**
 * Start from the stored object, so a field a NEWER client added survives this
 * client's next write (src/store/CLAUDE.md; this document syncs), then drop the
 * optional fields this client knows and sets again only those that read.
 */
function keep(x: Record<string, unknown>, optional: string[]): Record<string, unknown> {
  const out = { ...x }
  for (const k of optional) delete out[k]
  return out
}

/**
 * A Pyramid trainer holds ONE species: a positive id or null (Unknown). An entry
 * whose species is anything else -- a list of two, a missing one -- is not a
 * Pyramid trainer and is dropped, whatever the UI did.
 */
export function pyramidTrainer(x: unknown): PyramidTrainer | null {
  if (!isObj(x)) return null
  const species = x.species === null ? null : posInt(x.species)
  const result = oneOf(x.result, ['W', 'L'] as const)
  if (species === undefined || !result) return null
  const out = keep(x, ['trainerId', 'setIndex']) as unknown as PyramidTrainer
  Object.assign(out, { species, result })
  const trainerId = int(x.trainerId)
  if (trainerId != null && trainerId >= 0) out.trainerId = trainerId
  const setIndex = int(x.setIndex)
  if (setIndex != null && setIndex >= 0) out.setIndex = setIndex
  return out
}

function pyramidWild(x: unknown): PyramidWild | null {
  if (!isObj(x)) return null
  const species = x.species === null ? null : posInt(x.species)
  const count = posInt(x.count)
  return species === undefined || count == null ? null : ({ ...x, species, count } as PyramidWild)
}

function pyramidItem(x: unknown): PyramidItem | null {
  if (!isObj(x)) return null
  const itemId = posInt(x.itemId)
  const qty = posInt(x.qty)
  return itemId == null || qty == null ? null : ({ ...x, itemId, qty } as PyramidItem)
}

const some = <T>(list: (T | null)[]): T[] => list.filter((x): x is T => x != null)

export function pyramidFloor(x: unknown): PyramidFloor {
  const o = isObj(x) ? x : {}
  const out = keep(o, ['wildCategory']) as unknown as PyramidFloor
  out.trainers = some(arr(o.trainers).map(pyramidTrainer))
  out.wild = some(arr(o.wild).map(pyramidWild))
  out.items = some(arr(o.items).map(pyramidItem))
  const cat = posInt(o.wildCategory)
  if (cat != null) out.wildCategory = cat
  return out
}

const threeOpponents = (x: unknown): (number | null)[] | undefined => {
  const list = arr(x).map((o) => (o === null ? null : (posInt(o) ?? null)))
  return list.length === 3 ? list : undefined
}

function openFloor(x: unknown): OpenFloor | undefined {
  if (!isObj(x)) return undefined
  const n = posInt(x.n)
  if (n == null) return undefined
  const out = keep(x, ['opponents', 'note']) as unknown as OpenFloor
  Object.assign(out, { n, pyramid: pyramidFloor(x.pyramid) })
  const opponents = threeOpponents(x.opponents)
  if (opponents) out.opponents = opponents
  if (typeof x.note === 'string' && x.note !== '') out.note = x.note
  return out
}

function run(x: unknown): Run | null {
  if (!isObj(x)) return null
  const id = str(x.id)
  const facility = oneOf(x.facility, FACILITIES)
  const format = oneOf(x.format, FORMATS)
  const levelMode = oneOf(x.levelMode, ['lv50', 'open'] as const)
  const startedAt = str(x.startedAt)
  if (!id || !facility || !format || !levelMode || !startedAt) return null
  const out = keep(x, ['imported', 'endedAt', 'note', 'dome', 'drafts', 'swaps', 'openFloor']) as unknown as Run
  const open = openFloor(x.openFloor)
  if (open) out.openFloor = open
  Object.assign(out, { id, facility, format, levelMode, startedAt, outcome: oneOf(x.outcome, OUTCOMES) ?? 'ongoing' })
  if (x.imported === true) out.imported = true
  const endedAt = str(x.endedAt)
  if (endedAt) out.endedAt = endedAt
  const note = str(x.note)
  if (note) out.note = note
  if (isObj(x.dome)) {
    const team = arr(x.dome.team).map(posInt)
    if (team.length === 3 && team.every((t) => t != null)) out.dome = { ...x.dome, team: team as number[] }
  }
  if (Array.isArray(x.drafts)) {
    out.drafts = x.drafts.flatMap((d) => {
      if (!isObj(d)) return []
      const atBattle = posInt(d.atBattle)
      const rentals = arr(d.rentals).map(rental)
      return atBattle != null && rentals.length === 3 && rentals.every(Boolean)
        ? [{ ...d, atBattle, rentals: rentals as Rental[] }]
        : []
    })
  }
  if (Array.isArray(x.swaps)) {
    out.swaps = x.swaps.flatMap((s) => {
      if (!isObj(s)) return []
      const atBattle = posInt(s.atBattle)
      const o = rental(s.out)
      const i = rental(s.in)
      return atBattle != null && o && i ? [{ ...s, atBattle, out: o, in: i }] : []
    })
  }
  return out
}

function battle(x: unknown): Battle | null {
  if (!isObj(x)) return null
  const id = str(x.id)
  const runId = str(x.runId)
  const n = posInt(x.n)
  const result = oneOf(x.result, ['W', 'L'] as const)
  const opponents = arr(x.opponents).map((o) => (o === null ? null : (posInt(o) ?? null)))
  if (!id || !runId || n == null || !result || opponents.length !== 3) return null
  const out = keep(x, ['dome', 'note', 'pyramid']) as unknown as Battle
  Object.assign(out, { id, runId, n, opponents, result })
  if (isObj(x.dome)) {
    const pair = arr(x.dome.pair).map(posInt)
    const d = x.dome.dropped
    const dropped = d === 1 || d === 2 || d === 3 ? d : null
    if (pair.length === 2 && pair.every((p) => p != null)) out.dome = { ...x.dome, pair: pair as number[], dropped }
  }
  const note = str(x.note)
  if (note) out.note = note
  if (isObj(x.pyramid)) out.pyramid = pyramidFloor(x.pyramid)
  return out
}

function line(x: unknown): LedgerLine | null {
  if (!isObj(x)) return null
  const id = str(x.id)
  const at = str(x.at)
  const delta = int(x.delta)
  if (!id || !at || delta == null) return null
  const out = keep(x, ['runId', 'set', 'brainBonus']) as unknown as LedgerLine
  Object.assign(out, { id, at, delta, reason: typeof x.reason === 'string' ? x.reason : '' })
  const runId = str(x.runId)
  if (runId) out.runId = runId
  const set = posInt(x.set)
  if (set != null) out.set = set
  const bonus = posInt(x.brainBonus)
  if (bonus != null) out.brainBonus = bonus
  return out
}

const uniqueById = <T extends { id: string }>(list: (T | null)[]): T[] => {
  const seen = new Set<string>()
  return list.filter((x): x is T => x != null && !seen.has(x.id) && (seen.add(x.id), true))
}

/** The speed facilities' place in `games`: the game, then the facility's key. */
const SPEED_GAMES = [
  ['emerald', 'hill'],
  ['firered-leafgreen', 'tower'],
] as const

/**
 * The per-game record: a known game's logs are read (unreadable attempts
 * dropped); a game or a field this client does not know is kept as stored.
 */
function normaliseGames(x: unknown): TrackerGames {
  if (!isObj(x)) return {}
  const out: Record<string, unknown> = { ...x }
  for (const [game, facility] of SPEED_GAMES) {
    const g = x[game]
    if (!isObj(g)) {
      delete out[game]
      continue
    }
    const o = keep(g, [facility])
    if (isObj(g[facility])) o[facility] = normaliseModes(g[facility])
    out[game] = o
  }
  return out as TrackerGames
}

/** Games joined: a mode's attempts by id (speed.ts mergeModes); `base` wins any other field. */
function mergeGames(base: TrackerGames, added: TrackerGames): TrackerGames {
  const out: Record<string, unknown> = { ...added, ...base }
  for (const [game, facility] of SPEED_GAMES) {
    const b = base[game] as Record<string, SpeedModes | undefined> | undefined
    const a = added[game] as Record<string, SpeedModes | undefined> | undefined
    if (!b || !a || (!b[facility] && !a[facility])) continue
    out[game] = { ...a, ...b, [facility]: mergeModes(b[facility] ?? {}, a[facility] ?? {}) }
  }
  return out as TrackerGames
}

/** Any stored value -> a TrackerDoc. Unreadable entries are dropped; fields this client does not know are kept. */
export function normaliseTracker(raw: unknown): TrackerDoc {
  if (!isObj(raw)) return EMPTY_TRACKER
  const runs = uniqueById(arr(raw.runs).map(run))
  const runIds = new Set(runs.map((r) => r.id))
  const battles = uniqueById(arr(raw.battles).map(battle)).filter((b) => runIds.has(b.runId))
  const symbols: Record<string, SymbolFlags> = {}
  if (isObj(raw.symbols)) {
    for (const [k, v] of Object.entries(raw.symbols)) {
      if (!isObj(v)) continue
      const f: SymbolFlags = {}
      if (typeof v.silver === 'boolean') f.silver = v.silver
      if (typeof v.gold === 'boolean') f.gold = v.gold
      if (f.silver != null || f.gold != null) symbols[k] = f
    }
  }
  const bp = isObj(raw.bp) ? raw.bp : {}
  const opening = int(bp.opening)
  return {
    ...raw,
    schemaVersion: 2,
    runs,
    battles,
    symbols,
    bp: { ...bp, opening: opening != null && opening >= 0 ? opening : 0, ledger: uniqueById(arr(bp.ledger).map(line)) },
    games: normaliseGames(raw.games),
  }
}

/**
 * The first sync's merge (the account menu's import replaces): `base` keeps its
 * identity. A run only one side has comes with its battles. A run BOTH sides
 * have is taken whole -- its battles, drafts, swaps and outcome -- from the side
 * that logged more of it (the base on a tie), so two copies of one battle never
 * meet. Ledger lines are joined by id; a merge never deletes, so a line deleted
 * on one device only comes back from the other. The per-game logs (`games`)
 * join the same way: attempts by id.
 */
export function mergeTracker(base: TrackerDoc, added: TrackerDoc): TrackerDoc {
  const count = (d: TrackerDoc, runId: string) => d.battles.filter((b) => b.runId === runId).length
  const addedRuns = new Map(added.runs.map((r) => [r.id, r]))
  const fromAdded = new Set(
    base.runs.filter((r) => addedRuns.has(r.id) && count(added, r.id) > count(base, r.id)).map((r) => r.id),
  )
  const baseIds = new Set(base.runs.map((r) => r.id))
  const runs = [
    ...base.runs.map((r) => (fromAdded.has(r.id) ? (addedRuns.get(r.id) as Run) : r)),
    ...added.runs.filter((r) => !baseIds.has(r.id)),
  ]
  const battles = [
    ...base.battles.filter((b) => !fromAdded.has(b.runId)),
    ...added.battles.filter((b) => fromAdded.has(b.runId) || !baseIds.has(b.runId)),
  ]
  const lineIds = new Set(base.bp.ledger.map((l) => l.id))
  return {
    ...added,
    ...base,
    schemaVersion: 2,
    runs,
    battles,
    symbols: { ...added.symbols, ...base.symbols },
    bp: {
      ...base.bp,
      opening: base.bp.opening || added.bp.opening,
      ledger: [...base.bp.ledger, ...added.bp.ledger.filter((l) => !lineIds.has(l.id))],
    },
    games: mergeGames(base.games ?? {}, added.games ?? {}),
  }
}

export const isTrackerEmpty = (d: TrackerDoc): boolean =>
  d.runs.length === 0 &&
  d.bp.ledger.length === 0 &&
  d.bp.opening === 0 &&
  Object.keys(d.symbols).length === 0 &&
  !modesHaveAttempts(d.games?.emerald?.hill) &&
  !modesHaveAttempts(d.games?.['firered-leafgreen']?.tower)

// ------------------------------------------------------------------ the loader boundary

type RunKey = Pick<Run, 'facility' | 'format' | 'levelMode'>

/** facility|format|levelMode: where streaks, symbols and Brains are counted. */
export const keyOf = (r: RunKey): string => `${r.facility}|${r.format}|${r.levelMode}`

/**
 * The loader call for a logged battle: THE one place a logged number becomes the
 * loader's streak (loaderStreak: the Dome's counts tournaments won).
 */
export function poolArgsAt(run: RunKey, n: number, symbols: Symbols): TrainerPoolArgs {
  return {
    facility: run.facility,
    format: run.format,
    levelMode: run.levelMode,
    // The Pyramid's Brain waits at the top AFTER floor 7, when the streak already
    // counts that floor (the Streak lookup's rule).
    streak: run.facility === 'pyramid' ? n : loaderStreak(run.facility, n),
    symbols,
  }
}

/**
 * The loader call for the TRAINERS on Pyramid floor `n`: drawn at the floors
 * cleared before it (GetUniqueTrainerId, battle_pyramid.c: the streak and the
 * floor index both count floors already cleared), the facility's loaderStreak.
 * Its Brain is not: he waits at the top AFTER floor n (`poolArgsAt`). No symbols:
 * this asks for the trainer range only.
 */
export function floorPoolArgs(run: RunKey, n: number): TrainerPoolArgs {
  return { facility: run.facility, format: run.format, levelMode: run.levelMode, streak: loaderStreak(run.facility, n) }
}

/**
 * The Frontier Brain a logged battle is against, from the loader (the same rule
 * as nextBrainAt): Singles only; the Dome's Brain is in a tournament's final
 * (battle 4, 8, ...); the Pyramid's at the top after floor 7. Never typed.
 */
export function brainAt(fd: FrontierData, run: RunKey, n: number, symbols: Symbols): BrainAppearance | null {
  if (run.format !== 'singles') return null
  if (run.facility === 'dome' && n % 4 !== 0) return null
  if (run.facility === 'pyramid' && n % 7 !== 0) return null
  return fd.trainerPoolForStreak(poolArgsAt(run, n, symbols)).brain ?? null
}

/**
 * The next Brain from a key's current streak, at the symbols held: the loader's
 * nextBrainAt, asked (through poolArgsAt, the one conversion) about the battle
 * the ongoing run fights next; with no ongoing run, from a streak of 0.
 */
export function nextBrainFor(fd: FrontierData, k: Pick<KeyView, 'facility' | 'format' | 'levelMode' | 'level' | 'current'>): BrainAppearance | null {
  const n = (k.current?.wins ?? 0) + 1
  const args = poolArgsAt(k, n, k.level)
  return fd.nextBrainAt({ facility: args.facility, format: k.format, levelMode: k.levelMode, streak: k.current ? args.streak : 0, symbols: k.level })
}

const raise = (held: Symbols, brain: BrainAppearance): Symbols =>
  brain.symbol === 'gold' ? 2 : held === 2 ? 2 : 1

// ------------------------------------------------------------------ derived state

export interface RunView {
  run: Run
  /** Its number among the facility's runs, in the order they were added. */
  number: number
  battles: Battle[]
  wins: number
  perSet: number
  setsCompleted: number
  /** battle id -> the Brain the loader puts there. */
  brains: Map<string, BrainAppearance>
  /** battle id -> the symbols held going into it (what the Streak lookup is opened with). */
  heldAt: Map<string, Symbols>
  symbolsAtStart: Symbols
  symbolsAtEnd: Symbols
}

export interface KeyView {
  key: string
  facility: FacilityId
  format: FrontierFormat
  levelMode: LevelMode
  runs: RunView[]
  /** What the log alone earned (no override). */
  fromLog: { silver: boolean; gold: boolean }
  /** What is held: the override where there is one, else the log. */
  held: { silver: boolean; gold: boolean }
  level: Symbols
  /** The ongoing run, the latest one if several. */
  current: RunView | null
  /** The most battles won in one run. */
  best: number
}

export interface TrackerView {
  runs: Map<string, RunView>
  /** Every run, in order (`chronological`). */
  ordered: RunView[]
  keys: Map<string, KeyView>
}

const levelOf = (f: { silver: boolean; gold: boolean }): Symbols => (f.gold ? 2 : f.silver ? 1 : 0)

/**
 * Walk each facility|format|level's runs in order, battle by battle: each
 * battle's Brain is the loader's at the symbols held THEN, and a won Brain battle
 * raises them. A symbol the owner marks as held (an override that is on) was
 * won before the app, so the walk starts with it -- even once the log alone
 * would have reached that Brain, which then never appears.
 *
 * ORDER: imported runs first (they are the history before the app), then by the
 * day they started, then as stored. Run numbers, the walk and "current" follow it,
 * so a merge that appends older runs cannot renumber or re-walk the newer ones.
 */
export function chronological(runs: Run[]): Run[] {
  return runs
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        (a.r.imported ? 0 : 1) - (b.r.imported ? 0 : 1) ||
        a.r.startedAt.localeCompare(b.r.startedAt) ||
        a.i - b.i,
    )
    .map((x) => x.r)
}

export function deriveTracker(doc: TrackerDoc, fd: FrontierData): TrackerView {
  const perSet = new Map(fd.facilities().map((f) => [f.id, f.perSet]))
  const counter = new Map<FacilityId, number>()
  const byId = new Map<string, Battle[]>()
  for (const b of doc.battles) byId.set(b.runId, [...(byId.get(b.runId) ?? []), b])
  const views: RunView[] = chronological(doc.runs).map((run) => {
    const number = (counter.get(run.facility) ?? 0) + 1
    counter.set(run.facility, number)
    const battles = (byId.get(run.id) ?? []).slice().sort((a, b) => a.n - b.n)
    const wins = battles.filter((b) => b.result === 'W').length
    const ps = perSet.get(run.facility) ?? 7
    return {
      run,
      number,
      battles,
      wins,
      perSet: ps,
      setsCompleted: Math.floor(wins / ps),
      brains: new Map(),
      heldAt: new Map(),
      symbolsAtStart: 0,
      symbolsAtEnd: 0,
    }
  })

  const groups = new Map<string, RunView[]>()
  for (const v of views) groups.set(keyOf(v.run), [...(groups.get(keyOf(v.run)) ?? []), v])

  const walk = (list: RunView[], start: Symbols, record: boolean): Symbols => {
    let held = start
    for (const v of list) {
      if (record) v.symbolsAtStart = held
      for (const b of v.battles) {
        if (record) v.heldAt.set(b.id, held)
        const brain = brainAt(fd, v.run, b.n, held)
        if (record && brain) v.brains.set(b.id, brain)
        if (brain && b.result === 'W') held = raise(held, brain)
      }
      if (record) v.symbolsAtEnd = held
    }
    return held
  }

  const keys = new Map<string, KeyView>()
  for (const [key, list] of groups) {
    const logLevel = walk(list, 0, false)
    const fromLog = { silver: logLevel >= 1, gold: logLevel >= 2 }
    const ov = doc.symbols[key] ?? {}
    const before = levelOf({ silver: ov.silver === true, gold: ov.gold === true })
    const end = walk(list, before, true)
    const held = { silver: ov.silver ?? end >= 1, gold: ov.gold ?? end >= 2 }
    const ongoing = list.filter((v) => v.run.outcome === 'ongoing')
    const { facility, format, levelMode } = list[0].run
    keys.set(key, {
      key,
      facility,
      format,
      levelMode,
      runs: list,
      fromLog,
      held,
      level: levelOf(held),
      current: ongoing.at(-1) ?? null,
      best: Math.max(0, ...list.map((v) => v.wins)),
    })
  }
  // A key with an override but no run yet still has a symbol line.
  for (const key of Object.keys(doc.symbols)) {
    if (keys.has(key)) continue
    const [facility, format, levelMode] = key.split('|') as [FacilityId, FrontierFormat, LevelMode]
    const ov = doc.symbols[key]
    const held = { silver: ov.silver ?? false, gold: ov.gold ?? false }
    keys.set(key, {
      key,
      facility,
      format,
      levelMode,
      runs: [],
      fromLog: { silver: false, gold: false },
      held,
      level: levelOf(held),
      current: null,
      best: 0,
    })
  }
  return { runs: new Map(views.map((v) => [v.run.id, v])), ordered: views, keys }
}

/** The symbols held for a key with no runs: the overrides alone. */
export function keyViewFor(view: TrackerView, run: RunKey): KeyView {
  return (
    view.keys.get(keyOf(run)) ?? {
      key: keyOf(run),
      ...run,
      runs: [],
      fromLog: { silver: false, gold: false },
      held: { silver: false, gold: false },
      level: 0,
      current: null,
      best: 0,
    }
  )
}

// ------------------------------------------------------------------ labels

export const UNIT_WORD: Record<FacilityId, string> = {
  tower: 'set',
  dome: 'tournament',
  palace: 'set',
  arena: 'set',
  factory: 'set',
  pike: 'challenge',
  pyramid: 'challenge',
}

/** "Ongoing · 40 won", "Lost battle 40 · 39 won". */
export function outcomeText(v: Pick<RunView, 'run' | 'battles' | 'wins'>): string {
  const won = `${v.wins} won`
  if (v.run.outcome === 'lost') return `Lost battle ${v.battles.at(-1)?.n ?? 0} · ${won}`
  if (v.run.outcome === 'retired') return `Retired · ${won}`
  if (v.run.outcome === 'cleared') return `Cleared · ${won}`
  return `Ongoing · ${won}`
}

export const symbolsText = (s: Symbols): string => (s === 2 ? 'Silver and Gold' : s === 1 ? 'Silver' : 'none')

/** "Factory run 4, set 3": a proposed line's reason. */
export function bpReason(facilityName: string, v: Pick<RunView, 'run' | 'number'>, set: number): string {
  return `${facilityName.replace(/^Battle /, '')} run ${v.number}, ${UNIT_WORD[v.run.facility]} ${set}`
}

/** "14 Nov 2026" from YYYY-MM-DD, with no time-zone shift. */
export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/** Today as YYYY-MM-DD, local time. */
export function today(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const newId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// ------------------------------------------------------------------ BP

/**
 * The ledger line a completed set proposes: bpAward for that set, the Brain's
 * bonus when the set ended on a won Brain battle. null when battle `n` does not
 * complete a set, or the facility has no such format.
 */
export function proposeBpLine(
  fd: FrontierData,
  v: RunView,
  n: number,
  brain: BrainAppearance | null | undefined,
  at: string,
  id: string,
): LedgerLine | null {
  if (n % v.perSet !== 0) return null
  const set = n / v.perSet
  const award = fd.bpAward({ facility: v.run.facility, format: v.run.format, completedSets: set, brain: !!brain })
  if (!award) return null
  const name = fd.facilities().find((f) => f.id === v.run.facility)?.name ?? v.run.facility
  return {
    id,
    at,
    delta: award.points,
    reason: bpReason(name, v, set),
    runId: v.run.id,
    set,
    ...(award.brainBonus ? { brainBonus: award.brainBonus } : {}),
  }
}

/** Every set a run has completed, as its proposed lines (the import's ledger). */
export function bpLinesForRun(fd: FrontierData, v: RunView, at: string, idOf: (set: number) => string): LedgerLine[] {
  const out: LedgerLine[] = []
  for (let set = 1; set <= v.setsCompleted; set++) {
    const n = set * v.perSet
    const b = v.battles.find((x) => x.n === n)
    const l = proposeBpLine(fd, v, n, b ? v.brains.get(b.id) : null, at, idOf(set))
    if (l) out.push(l)
  }
  return out
}

/** Each line with the balance after it: opening + deltas, capped by addBattlePoints. */
export function ledgerBalances(fd: FrontierData, doc: TrackerDoc): { line: LedgerLine; balance: number }[] {
  let balance = doc.bp.opening
  return doc.bp.ledger.map((l) => {
    balance = fd.addBattlePoints(balance, l.delta)
    return { line: l, balance }
  })
}

export const bpBalance = (fd: FrontierData, doc: TrackerDoc): number =>
  ledgerBalances(fd, doc).at(-1)?.balance ?? fd.addBattlePoints(doc.bp.opening, 0)

// ------------------------------------------------------------------ Factory rentals

const sameRental = (a: Rental, b: Rental) => a.species === b.species && (a.setIndex ?? null) === (b.setIndex ?? null)

/** The rentals held going into battle `n`: the last draft at or before it, then its swaps. */
export function rentalsAt(run: Run, n: number): Rental[] | null {
  const draft = (run.drafts ?? []).filter((d) => d.atBattle <= n).sort((a, b) => a.atBattle - b.atBattle).at(-1)
  if (!draft) return null
  const team = draft.rentals.slice()
  for (const s of (run.swaps ?? []).filter((x) => x.atBattle > draft.atBattle && x.atBattle <= n).sort((a, b) => a.atBattle - b.atBattle)) {
    const i = team.findIndex((r) => sameRental(r, s.out))
    if (i >= 0) team[i] = s.in
  }
  return team
}

/** A Factory battle that opens a set: 1, 8, 15, ... (the game drafts anew). */
export const isSetStart = (run: Pick<Run, 'facility'>, n: number, perSet: number): boolean =>
  run.facility === 'factory' && (n - 1) % perSet === 0

// ------------------------------------------------------------------ edits

export interface BattleEntry {
  opponents: (number | null)[]
  result: BattleResult
  dome?: { pair: number[]; dropped: 1 | 2 | 3 | null }
  note?: string
  /** The Factory, at a set's first battle. */
  draft?: Rental[]
  /** The Factory, inside a set. */
  swap?: { out: Rental; in: Rental }
  /** The Pyramid: the floor's lists (closing the run's open floor). */
  pyramid?: PyramidFloor
}

/**
 * Log the next battle of a run. A loss ends it; a win that completes a set
 * adds the line bpAward proposes (the owner can edit or delete it).
 */
export function logBattle(
  doc: TrackerDoc,
  fd: FrontierData,
  runId: string,
  entry: BattleEntry,
  at: string,
  ids: { battle: string; line: string },
): TrackerDoc {
  const run0 = doc.runs.find((r) => r.id === runId)
  if (!run0 || run0.outcome !== 'ongoing') return doc
  const n = Math.max(0, ...doc.battles.filter((b) => b.runId === runId).map((b) => b.n)) + 1
  const b: Battle = { id: ids.battle, runId, n, opponents: entry.opponents.slice(0, 3), result: entry.result }
  if (run0.facility === 'dome' && entry.dome) b.dome = { pair: entry.dome.pair.slice(0, 2), dropped: entry.dome.dropped }
  if (entry.note?.trim()) b.note = entry.note.trim()
  const run: Run = { ...run0 }
  if (run.facility === 'factory' && entry.draft?.length === 3) {
    run.drafts = [...(run.drafts ?? []).filter((d) => d.atBattle !== n), { atBattle: n, rentals: entry.draft }]
  }
  if (run.facility === 'factory' && entry.swap) run.swaps = [...(run.swaps ?? []), { atBattle: n, ...entry.swap }]
  if (run.facility === 'pyramid') {
    if (entry.pyramid) b.pyramid = pyramidFloor(entry.pyramid)
    delete run.openFloor
  }
  if (entry.result === 'L') {
    run.outcome = 'lost'
    run.endedAt = at
  }
  let next: TrackerDoc = {
    ...doc,
    runs: doc.runs.map((r) => (r.id === runId ? run : r)),
    battles: [...doc.battles, b],
  }
  if (entry.result === 'W') {
    const v = deriveTracker(next, fd).runs.get(runId)
    const l = v && proposeBpLine(fd, v, n, v.brains.get(b.id), at, ids.line)
    if (l) next = { ...next, bp: { ...next.bp, ledger: [...next.bp.ledger, l] } }
  }
  return next
}

/**
 * Take back a run's last battle: its draft or swap, the line its set proposed, and
 * a loss's end. A Pyramid floor goes with its lists, and the open floor after it
 * (it was the next floor's) is dropped.
 */
export function undoLastBattle(doc: TrackerDoc, runId: string, perSet: number): TrackerDoc {
  const last = doc.battles.filter((b) => b.runId === runId).sort((a, b) => a.n - b.n).at(-1)
  if (!last) return doc
  const runs = doc.runs.map((r) => {
    if (r.id !== runId) return r
    const out: Run = { ...r }
    delete out.openFloor
    if (last.result === 'L' && r.outcome === 'lost') {
      out.outcome = 'ongoing'
      delete out.endedAt
    }
    if (r.drafts) out.drafts = r.drafts.filter((d) => d.atBattle !== last.n)
    if (r.swaps) out.swaps = r.swaps.filter((s) => s.atBattle !== last.n)
    return out
  })
  const set = last.n % perSet === 0 ? last.n / perSet : null
  return {
    ...doc,
    runs,
    battles: doc.battles.filter((b) => b.id !== last.id),
    bp: {
      ...doc.bp,
      ledger: doc.bp.ledger.filter((l) => !(set != null && l.runId === runId && l.set === set)),
    },
  }
}

export function startRun(doc: TrackerDoc, key: RunKey, at: string, id: string): TrackerDoc {
  const run: Run = { id, ...key, startedAt: at, outcome: 'ongoing' }
  return { ...doc, runs: [...doc.runs, run] }
}

export function endRun(doc: TrackerDoc, runId: string, outcome: 'retired' | 'cleared', at: string): TrackerDoc {
  return { ...doc, runs: doc.runs.map((r) => (r.id === runId ? { ...r, outcome, endedAt: at } : r)) }
}

export function setDomeTeam(doc: TrackerDoc, runId: string, team: number[]): TrackerDoc {
  return { ...doc, runs: doc.runs.map((r) => (r.id === runId ? { ...r, dome: { team: team.slice(0, 3) } } : r)) }
}

/**
 * Toggle a symbol. The override is kept only where it differs from what the log
 * earned, so a toggle back to the log's answer removes it.
 */
export function toggleSymbol(doc: TrackerDoc, k: KeyView, symbol: 'silver' | 'gold'): TrackerDoc {
  const next = !k.held[symbol]
  const flags: SymbolFlags = { ...(doc.symbols[k.key] ?? {}) }
  if (next === k.fromLog[symbol]) delete flags[symbol]
  else flags[symbol] = next
  const symbols = { ...doc.symbols }
  if (flags.silver == null && flags.gold == null) delete symbols[k.key]
  else symbols[k.key] = flags
  return { ...doc, symbols }
}

export const setOpening = (doc: TrackerDoc, opening: number): TrackerDoc => ({
  ...doc,
  bp: { ...doc.bp, opening: Math.max(0, Math.floor(opening) || 0) },
})

export const addLine = (doc: TrackerDoc, l: LedgerLine): TrackerDoc => ({
  ...doc,
  bp: { ...doc.bp, ledger: [...doc.bp.ledger, l] },
})

export const editLine = (doc: TrackerDoc, id: string, patch: Partial<Pick<LedgerLine, 'delta' | 'reason'>>): TrackerDoc => ({
  ...doc,
  bp: { ...doc.bp, ledger: doc.bp.ledger.map((l) => (l.id === id ? { ...l, ...patch } : l)) },
})

export const deleteLine = (doc: TrackerDoc, id: string): TrackerDoc => ({
  ...doc,
  bp: { ...doc.bp, ledger: doc.bp.ledger.filter((l) => l.id !== id) },
})

// ------------------------------------------------------------------ insights

/** Opponent species seen most often across every logged battle (Unknown not counted). */
export function mostSeen(doc: TrackerDoc, name: (id: number) => string, limit = 10): [number, number][] {
  const counts = new Map<number, number>()
  for (const b of doc.battles) for (const id of b.opponents) if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0]))).slice(0, limit)
}

/** The Dome's pairs in the order first brought, each ordered as the run's three: won / fought. */
export function domePairs(view: TrackerView): { pair: number[]; won: number; fought: number }[] {
  const out = new Map<string, { pair: number[]; won: number; fought: number }>()
  for (const v of view.ordered) {
    if (v.run.facility !== 'dome') continue
    const team = v.run.dome?.team ?? []
    const rank = (id: number) => {
      const i = team.indexOf(id)
      return i < 0 ? 3 + id : i
    }
    for (const b of v.battles) {
      if (!b.dome) continue
      const pair = b.dome.pair.slice().sort((x, y) => rank(x) - rank(y))
      const k = pair.join()
      const p = out.get(k) ?? { pair, won: 0, fought: 0 }
      p.fought += 1
      if (b.result === 'W') p.won += 1
      out.set(k, p)
    }
  }
  return [...out.values()]
}
