/**
 * The Battle Pyramid's floor log: pure rules over the tracker document
 * (model.ts) and the owner's two fixtures (pyramidData.ts, generated). UI-free,
 * so verify:frontier-tracker runs them in Node. Lazy: only the tracker's own
 * chunk imports this file, never the eager trackerStore.
 *
 * A FLOOR IS A BATTLE: its number is the floor as logged (cumulative within the
 * run), its result W (cleared) or L (the run ended there). The floor being logged
 * is the run's `openFloor`, written at every tap; "Next floor" makes it a Battle
 * through logBattle, the one path that proposes BP lines and ends a run.
 */

import type { FrontierData } from '../data'
import {
  logBattle,
  type Battle,
  type OpenFloor,
  type PyramidFloor,
  type PyramidTrainer,
  type Run,
  type RunView,
  type TrackerDoc,
  type TrackerView,
} from './model'
import { PYRAMID_CATEGORIES, PYRAMID_ITEMS_BY_ROUND, type PyramidCategory } from './pyramidData'

export const EMPTY_FLOOR: PyramidFloor = { trainers: [], wild: [], items: [] }

// ------------------------------------------------------------------ rounds, items, categories

/** Round = ceil(floor / 7): the owner's rule, the loader's challenge of `perSet` floors. */
export const roundOf = (n: number, perSet: number): number => Math.ceil(n / perSet)

/** "Round 2 · floor 3 of 7": the loader's unit (floor) and its count per challenge. */
export const floorLabel = (n: number, perSet: number): string =>
  `Round ${roundOf(n, perSet)} · floor ${((n - 1) % perSet) + 1} of ${perSet}`

/** The round's items as one-tap picks: its distinct items in slot order; none past the table (round 41+). */
export function roundItems(round: number): number[] {
  return [...new Set(PYRAMID_ITEMS_BY_ROUND[round - 1] ?? [])]
}

export const categoryById = (id: number | undefined): PyramidCategory | undefined =>
  id == null ? undefined : PYRAMID_CATEGORIES.find((c) => c.id === id)

/**
 * The wild category in force on floor `n`: the floor's own pick, else the latest
 * pick on an earlier floor of the same round. Whether the game draws it per round
 * or per floor was open when this was built, so it is REMEMBERED per round and
 * changeable on any floor (each floor stores what it used).
 */
export function categoryAt(run: Run, battles: { n: number; pyramid?: PyramidFloor }[], n: number, perSet: number): number | undefined {
  const own = run.openFloor?.n === n ? run.openFloor.pyramid.wildCategory : battles.find((b) => b.n === n)?.pyramid?.wildCategory
  if (own != null) return own
  const round = roundOf(n, perSet)
  return battles
    .filter((b) => b.n < n && roundOf(b.n, perSet) === round && b.pyramid?.wildCategory != null)
    .sort((a, b) => b.n - a.n)[0]?.pyramid?.wildCategory
}

// ------------------------------------------------------------------ one floor's lists

/** One more of a wild species (null = Unknown): the same species raises its count. */
export function addWild(f: PyramidFloor, species: number | null): PyramidFloor {
  const i = f.wild.findIndex((w) => w.species === species)
  if (i < 0) return { ...f, wild: [...f.wild, { species, count: 1 }] }
  return { ...f, wild: f.wild.map((w, j) => (j === i ? { ...w, count: w.count + 1 } : w)) }
}

/** -1 / +1 on a wild entry; at 0 it is removed. */
export const stepWild = (f: PyramidFloor, i: number, delta: number): PyramidFloor => ({
  ...f,
  wild: f.wild.flatMap((w, j) => (j !== i ? [w] : w.count + delta > 0 ? [{ ...w, count: w.count + delta }] : [])),
})

export const removeWild = (f: PyramidFloor, i: number): PyramidFloor => ({ ...f, wild: f.wild.filter((_, j) => j !== i) })

/** One more of an item: the same item raises its quantity. */
export function addItem(f: PyramidFloor, itemId: number): PyramidFloor {
  const i = f.items.findIndex((x) => x.itemId === itemId)
  if (i < 0) return { ...f, items: [...f.items, { itemId, qty: 1 }] }
  return { ...f, items: f.items.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) }
}

export const stepItem = (f: PyramidFloor, i: number, delta: number): PyramidFloor => ({
  ...f,
  items: f.items.flatMap((x, j) => (j !== i ? [x] : x.qty + delta > 0 ? [{ ...x, qty: x.qty + delta }] : [])),
})

export const removeItem = (f: PyramidFloor, i: number): PyramidFloor => ({ ...f, items: f.items.filter((_, j) => j !== i) })

/**
 * A trainer met on the floor, with its ONE Pokémon (null = Unknown). Anything
 * else is refused here as in the document's validation (model.ts pyramidTrainer).
 */
export function addTrainer(f: PyramidFloor, species: number | null, result: 'W' | 'L' = 'W'): PyramidFloor {
  if (species !== null && !(Number.isInteger(species) && species >= 1)) {
    throw new Error('A Pyramid trainer has exactly one Pokémon: one species id, or null for Unknown')
  }
  return { ...f, trainers: [...f.trainers, { species, result }] }
}

/** The optional trainer id and set, and the result; `undefined` clears an optional field. */
export function setTrainer(
  f: PyramidFloor,
  i: number,
  patch: Partial<Pick<PyramidTrainer, 'trainerId' | 'setIndex' | 'result'>>,
): PyramidFloor {
  return {
    ...f,
    trainers: f.trainers.map((t, j) => {
      if (j !== i) return t
      const out: PyramidTrainer = { ...t, ...patch }
      if ('trainerId' in patch && patch.trainerId == null) delete out.trainerId
      if ('setIndex' in patch && patch.setIndex == null) delete out.setIndex
      return out
    }),
  }
}

export const removeTrainer = (f: PyramidFloor, i: number): PyramidFloor => ({
  ...f,
  trainers: f.trainers.filter((_, j) => j !== i),
})

export const setCategory = (f: PyramidFloor, id: number): PyramidFloor => ({ ...f, wildCategory: id })

// ------------------------------------------------------------------ the document

/** The run's open floor when it is the next floor's; otherwise an empty one for that floor. */
export function openFloorOf(run: Run, battles: { n: number }[]): OpenFloor {
  const n = Math.max(0, ...battles.map((b) => b.n)) + 1
  const o = run.openFloor
  return o && o.n === n ? o : { n, pyramid: EMPTY_FLOOR }
}

const battlesOf = (doc: TrackerDoc, runId: string) => doc.battles.filter((b) => b.runId === runId)

/** Change the open floor of an ongoing Pyramid run (each tap is one call: it saves at once). */
export function editOpenFloor(doc: TrackerDoc, runId: string, fn: (o: OpenFloor) => OpenFloor): TrackerDoc {
  const run = doc.runs.find((r) => r.id === runId)
  if (!run || run.facility !== 'pyramid' || run.outcome !== 'ongoing') return doc
  const next = fn(openFloorOf(run, battlesOf(doc, runId)))
  return { ...doc, runs: doc.runs.map((r) => (r.id === runId ? { ...r, openFloor: next } : r)) }
}

/** Change a logged floor's own fields (its note, Brandon's three): a saved floor reopened. */
export function editLoggedBattle(doc: TrackerDoc, battleId: string, fn: (b: Battle) => Battle): TrackerDoc {
  return { ...doc, battles: doc.battles.map((b) => (b.id === battleId ? fn(b) : b)) }
}

/** Change a logged (closed) floor's lists: a saved floor reopened. Its result and number stay. */
export function editLoggedFloor(doc: TrackerDoc, battleId: string, fn: (f: PyramidFloor) => PyramidFloor): TrackerDoc {
  return {
    ...doc,
    battles: doc.battles.map((b) => (b.id === battleId ? { ...b, pyramid: fn(b.pyramid ?? EMPTY_FLOOR) } : b)),
  }
}

/**
 * Close the open floor: W (cleared, the next floor opens) or L (the run ended on
 * it). The floor keeps the category it used, the round's when it picked none.
 */
export function closeFloor(
  doc: TrackerDoc,
  fd: FrontierData,
  runId: string,
  result: 'W' | 'L',
  at: string,
  ids: { battle: string; line: string },
): TrackerDoc {
  const run = doc.runs.find((r) => r.id === runId)
  if (!run || run.facility !== 'pyramid' || run.outcome !== 'ongoing') return doc
  const battles = battlesOf(doc, runId)
  const open = openFloorOf(run, battles)
  const perSet = fd.facilities().find((f) => f.id === 'pyramid')?.perSet ?? 7
  const cat = categoryAt(run, battles, open.n, perSet)
  const pyramid: PyramidFloor = { ...open.pyramid, ...(cat != null ? { wildCategory: cat } : {}) }
  return logBattle(
    doc,
    fd,
    runId,
    {
      opponents: open.opponents ?? [null, null, null],
      result,
      pyramid,
      ...(open.note?.trim() ? { note: open.note.trim() } : {}),
    },
    at,
    ids,
  )
}

/**
 * Lost to a regular trainer: trainer `i` of the open floor (the one the picker
 * shows) becomes the loss, or with none an Unknown trainer is added as one; the
 * floor closes as L and the run ends.
 */
export function loseToTrainer(
  doc: TrackerDoc,
  fd: FrontierData,
  runId: string,
  i: number | null,
  at: string,
  ids: { battle: string; line: string },
): TrackerDoc {
  const marked = editOpenFloor(doc, runId, (o) => ({
    ...o,
    pyramid: i == null || !o.pyramid.trainers[i] ? addTrainer(o.pyramid, null, 'L') : setTrainer(o.pyramid, i, { result: 'L' }),
  }))
  return marked === doc ? doc : closeFloor(marked, fd, runId, 'L', at, ids)
}

// ------------------------------------------------------------------ totals and insights

export interface PyramidTotals {
  floors: number
  trainers: number
  wild: number
  items: number
}

/**
 * The floor still open when the run stopped: the ongoing run's, or the entries a
 * run retired on mid-floor keeps (a loss closes its floor, so it has none).
 */
export const unclosedFloor = (v: Pick<RunView, 'run' | 'battles'>): PyramidFloor => openFloorOf(v.run, v.battles).pyramid

/** A run's floors (closed ones) and what was logged on them, the open floor's entries included. */
export function pyramidTotals(v: Pick<RunView, 'run' | 'battles'>): PyramidTotals {
  const floors = v.battles.map((b) => b.pyramid ?? EMPTY_FLOOR)
  const all = [...floors, unclosedFloor(v)]
  return {
    floors: v.battles.length,
    trainers: all.reduce((s, f) => s + f.trainers.length, 0),
    wild: all.reduce((s, f) => s + f.wild.reduce((t, w) => t + w.count, 0), 0),
    items: all.reduce((s, f) => s + f.items.reduce((t, x) => t + x.qty, 0), 0),
  }
}

export interface PyramidInsights {
  wild: [number, number][]
  items: [number, number][]
  trainers: [number, number][]
}

/**
 * Across every Pyramid run: the wild species defeated most, the items obtained
 * most and the trainers' Pokémon seen most (Unknown not counted), top `limit`
 * each, ties by name.
 */
export function pyramidInsights(
  view: TrackerView,
  names: { species: (id: number) => string; item: (id: number) => string },
  limit = 10,
): PyramidInsights {
  const wild = new Map<number, number>()
  const items = new Map<number, number>()
  const trainers = new Map<number, number>()
  const add = (m: Map<number, number>, k: number | null, by: number) => {
    if (k != null) m.set(k, (m.get(k) ?? 0) + by)
  }
  for (const v of view.ordered) {
    if (v.run.facility !== 'pyramid') continue
    const floors = [...v.battles.map((b) => b.pyramid ?? EMPTY_FLOOR), unclosedFloor(v)]
    for (const f of floors) {
      for (const w of f.wild) add(wild, w.species, w.count)
      for (const x of f.items) add(items, x.itemId, x.qty)
      for (const t of f.trainers) add(trainers, t.species, 1)
    }
  }
  const top = (m: Map<number, number>, name: (id: number) => string) =>
    [...m].sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0]))).slice(0, limit)
  return { wild: top(wild, names.species), items: top(items, names.item), trainers: top(trainers, names.species) }
}
