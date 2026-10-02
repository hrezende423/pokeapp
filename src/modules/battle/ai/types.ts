/**
 * The opponent AI's contract, shared by the four generations' models.
 *
 * Every model is the game's GREEDY, SINGLE-TURN decision: before choosing a move
 * it may use a bag item or switch (each generation's own routine), then it scores
 * each of its moves from a base value with additive adjustments and picks the
 * best (Gen 1-2: lowest score wins; Gen 3-4: highest), breaking ties at random.
 *
 * A model returns its choice AND A TRACE: every adjustment it made to every move,
 * labelled with the routine that made it. `predict.ts` runs the model many times
 * with different random draws (the AI's own random checks are part of the
 * decision) and aggregates the traces into the per-move breakdown P3 shows.
 */

import type { BattleData } from '../battleData'
import type { Action } from '../engine/turn'
import type { Rng } from '../engine/rng'
import type { BattleState } from '../engine/state'
import type { GameContext } from '../game'

export interface Contribution {
  /** The routine, in the game's own vocabulary: "AI_Smart_Paralyze", "Expert_StatusSleep". */
  label: string
  delta: number
}

export interface MoveTrace {
  slot: number
  moveId: number
  score: number
  contributions: Contribution[]
}

export interface AiTrace {
  moves: MoveTrace[]
  /** Set when the model used an item or switched instead of choosing a move. */
  pre: { kind: 'item' | 'switch'; label: string; itemId?: number; to?: number } | null
  /** Why a prediction is low confidence, if it is. */
  lowConfidence: string[]
  /** Scores: lower is better (Gen 1-2) or higher is better (Gen 3-4). */
  better: 'lower' | 'higher'
}

export interface AiEnv {
  ctx: GameContext
  data: BattleData
  st: BattleState
  rng: Rng
}

export interface AiChoice {
  action: Action
  trace: AiTrace
}

export type AiModel = (env: AiEnv) => AiChoice

/** Pick uniformly among the indexes whose value is best. */
export function pickBest(values: (number | null)[], better: 'lower' | 'higher', rng: Rng): number {
  let best: number | null = null
  for (const v of values)
    if (v != null && (best == null || (better === 'lower' ? v < best : v > best))) best = v
  const idx = values.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0)
  return idx[rng.int(idx.length)] ?? 0
}

/** The game's `percent` macro: X percent = X * 255 / 100, floored. */
export const pct = (x: number) => Math.floor((x * 255) / 100)
