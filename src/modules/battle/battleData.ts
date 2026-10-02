/**
 * The battle-data partition: public/data/battle/<version-group>.json.
 *
 * Built by scripts/build-battle-data.mjs from the pinned pret disassemblies --
 * the game's own move table (effect constant, power, accuracy, PP, effect chance,
 * priority), held-item effects, and the trainer AI (Gen 1-2 tables, Gen 3 the
 * assembled AI script, Gen 4 the game's AI binary). See that file's header for
 * what is read from where, and why Gen 4 executes the binary rather than the
 * decompiled script.
 *
 * Loaded on demand, one game at a time, and cached -- the same pattern as the
 * trainer partitions (data/trainers.ts). It is plain `fetch`, so it works the same
 * on the main thread and inside the Monte Carlo worker.
 */

import { dataUrl } from '../../data'

/** One move as the game's own table has it. Symbolic where the runtime has a vocabulary. */
export interface GameMove {
  /** The move effect constant: EFFECT_SLEEP (Gen 2-3), SLEEP_EFFECT (Gen 1), BATTLE_EFFECT_... (Gen 4). */
  e: string
  p: number
  /** Bundle type name. */
  t: string
  /** Accuracy in percent (0 = never misses, Gen 3+). */
  a: number
  /** Gen 1-2: accuracy as the game's byte (percent * 255 / 100). */
  ab?: number
  pp: number
  /** Effect chance, percent. */
  c?: number
  /** Gen 2: effect chance as the game's byte. */
  cb?: number
  /** Gen 3-4 priority. */
  pr?: number
  /** Gen 3-4 target. */
  tg?: string
  /** Gen 3-4 flags. */
  fl?: string[]
  /** Gen 4 move class: physical / special / status. */
  cl?: string
}

export interface HeldEffect {
  /** HELD_* (Gen 2) or HOLD_EFFECT_* (Gen 3-4). */
  h: string
  /** The effect's parameter (Quick Claw's chance, Leftovers' fraction...). */
  v: number
  fp?: number
}

export interface Gen1Ai {
  kind: 'gen1'
  classes: Record<string, { mods: number[]; count: number; routine: string }>
  effectOrder: (string | null)[]
  highCritMoves: number[]
  /** data/types/type_matchups.asm rows: [attacking type, defending type, multiplier x10]. */
  typeMatchups: [string, string, number][]
}

export interface Gen2Ai {
  kind: 'gen2'
  classes: Record<
    string,
    { name: string; items: number[]; reward: number; layers: string[]; itemSwitch: string[] }
  >
  lists: Record<string, (number | string)[]>
  effectOrder: string[]
}

/** A Gen 3 argument: a number, or a symbolic constant, or a code/table reference. */
export type Gen3Arg =
  | number
  | { m: number }
  | { e: string }
  | { t: string }
  | { a: string }
  | { i: number }
  | { h: string }
  | { L: number }
  | { T: string }
  | null

export interface Gen3Ai {
  kind: 'gen3'
  code: [number, ...Gen3Arg[]][]
  tables: Record<string, Gen3Arg[]>
  entries: { label: string; at: number }[]
  labels?: Record<string, number>
  opNames?: string[]
  quirk?: 'emerald-tie-order' | 'ruby-tie-order'
}

export interface Gen4Ai {
  kind: 'gen4'
  /** The AI script binary as 32-bit words (tr_ai_seq.narc). */
  words: number[]
  /** Word offset of each flag's routine. */
  entries: number[]
  flagNames: string[]
  layout: { macro: string; args: ('jump' | 'table' | 'value')[] }[]
  opNames: string[]
  /** Word offset -> the decompiled script's label at that point (display only). */
  labels: Record<string, string>
  numbering: {
    abilities: string[]
    types: string[]
    items: number[]
    moveEffects: string[]
    holdEffects: string[]
  }
  constants: Record<string, number>
  source_note?: string
  lowConfidence?: boolean
  scriptDiff?: { onlyInSource: string[]; onlyInBinary: string[] }
}

export interface BattleData {
  version_group: string
  generation: number
  source: { repo: string; sha: string }
  moves: Record<string, GameMove>
  held?: Record<string, HeldEffect>
  ai: Gen1Ai | Gen2Ai | Gen3Ai | Gen4Ai
}

const cache = new Map<string, BattleData>()
const inflight = new Map<string, Promise<BattleData>>()

export function loadBattleData(versionGroup: string): Promise<BattleData> {
  const hit = cache.get(versionGroup)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(versionGroup)
  if (pending) return pending
  const promise = (async () => {
    const url = dataUrl(`battle/${versionGroup}.json`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
    const data = (await res.json()) as BattleData
    cache.set(versionGroup, data)
    return data
  })()
  inflight.set(versionGroup, promise)
  void promise.finally(() => inflight.delete(versionGroup)).catch(() => {})
  return promise
}

export const peekBattleData = (versionGroup: string): BattleData | undefined =>
  cache.get(versionGroup)

/** The game's own record for a move (PokeAPI id), or undefined if the game lacks it. */
export const gameMove = (data: BattleData, moveId: number): GameMove | undefined =>
  data.moves[String(moveId)]

export const heldEffect = (data: BattleData, itemId: number | null): HeldEffect | undefined =>
  itemId == null ? undefined : data.held?.[String(itemId)]

/** Test seam. */
export function __resetBattleData(): void {
  cache.clear()
  inflight.clear()
}
