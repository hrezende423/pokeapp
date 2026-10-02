/**
 * The opponent AI, dispatched by the game context (P3-P5), and its PREDICTION:
 * the AI's own random checks are part of its decision, so "what will it do" is a
 * distribution. `predictAi` runs the generation's model many times against the
 * same state, each with a different random stream, and reports how often each
 * action came out -- with the per-move score breakdown aggregated across runs
 * (which adjustments fired, how often, by how much).
 */

import { getItem, getMove } from '../../../data'
import type { BattleData } from '../battleData'
import type { Action } from '../engine/turn'
import { Rng } from '../engine/rng'
import { activeMon, monAt, posKey, standing, type BattleState, type Slot } from '../engine/state'
import type { GameContext } from '../game'
import { gen1Ai, gen1SendOut } from './gen1'
import { gen2Ai, gen2SendOut } from './gen2'
import { gen3Ai, gen3AiDoubles, gen3SendOut } from './script3'
import type { AiChoice, AiEnv, AiModel } from './types'
import { gen4Ai, gen4AiDoubles, gen4SendOut } from './vm4'
import { aiView } from './view'
import { needsTarget } from '../engine/doubles'

export function aiModel(ctx: GameContext): AiModel {
  switch (ctx.ai) {
    case 'gen1':
      return gen1Ai
    case 'gen2':
      return gen2Ai
    case 'gen3':
      return gen3Ai
    case 'gen4':
      return gen4Ai
  }
}

/** P4: the opponent's replacement after a faint, per generation. */
export function aiSendOut(env: AiEnv): number {
  switch (env.ctx.sendOut) {
    case 'party-order':
      return gen1SendOut(env)
    case 'gen2-matchup':
      return gen2SendOut(env)
    case 'gen3-best':
      return gen3SendOut(env)
    case 'gen4-best':
      return gen4SendOut(env)
  }
}

export function chooseOpponentAction(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  rng: Rng,
): AiChoice {
  return aiModel(ctx)({ ctx, data, st, rng })
}

export interface ActionOdds {
  action: Action
  label: string
  p: number
}

export interface MoveBreakdown {
  slot: number
  moveId: number
  name: string
  /** P(this move is chosen). */
  pChosen: number
  scoreMin: number
  scoreMax: number
  scoreMean: number
  /** Each adjustment: how often it fired across runs, and its average delta when it did. */
  contributions: { label: string; frequency: number; meanDelta: number }[]
}

export interface AiPrediction {
  odds: ActionOdds[]
  moves: MoveBreakdown[]
  better: 'lower' | 'higher'
  base: number
  lowConfidence: string[]
  /** How often the pre-move routine (item / switch) fired, and what it was. */
  pre: { label: string; p: number }[]
  samples: number
}

export function actionLabel(st: BattleState, a: Action): string {
  const m = activeMon(st, 'theirs')
  if (a.kind === 'move') return getMove(m.spec.moves[a.slot])?.display_name ?? `slot ${a.slot + 1}`
  if (a.kind === 'switch') return `Switch to ${st.sides.theirs.mons[a.to]?.spec.label ?? a.to}`
  if (a.kind === 'item') return `Use ${getItem(a.itemId)?.display_name ?? 'item'}`
  return 'Nothing'
}

const key = (a: Action) =>
  a.kind === 'move'
    ? `m${a.slot}`
    : a.kind === 'switch'
      ? `s${a.to}`
      : a.kind === 'item'
        ? `i${a.itemId}`
        : 'n'

export function predictAi(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  samples = 300,
  seed = 0x5eed,
): AiPrediction {
  const model = aiModel(ctx)
  const counts = new Map<string, { action: Action; n: number }>()
  const me = activeMon(st, 'theirs')
  const perMove = me.spec.moves.map(() => ({
    scores: [] as number[],
    contrib: new Map<string, { n: number; sum: number }>(),
  }))
  const pre = new Map<string, number>()
  let better: 'lower' | 'higher' = 'higher'
  const low = new Set<string>()
  for (let i = 0; i < samples; i++) {
    const rng = new Rng(seed + i * 7919)
    const { action, trace } = model({ ctx, data, st, rng })
    better = trace.better
    trace.lowConfidence.forEach((x) => low.add(x))
    const k = key(action)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { action, n: 1 })
    if (trace.pre) pre.set(trace.pre.label, (pre.get(trace.pre.label) ?? 0) + 1)
    trace.moves.forEach((mt) => {
      const pm = perMove[mt.slot]
      if (!pm) return
      pm.scores.push(mt.score)
      // Per run: a routine that adjusted the move twice is one firing with a summed delta.
      const run = new Map<string, number>()
      for (const ctb of mt.contributions) run.set(ctb.label, (run.get(ctb.label) ?? 0) + ctb.delta)
      for (const [label, delta] of run) {
        const e = pm.contrib.get(label) ?? { n: 0, sum: 0 }
        e.n++
        e.sum += delta
        pm.contrib.set(label, e)
      }
    })
  }
  const odds = [...counts.values()]
    .map(({ action, n }) => ({ action, label: actionLabel(st, action), p: n / samples }))
    .sort((a, b) => b.p - a.p)
  const moves: MoveBreakdown[] = me.spec.moves.map((id, slot) => {
    const pm = perMove[slot]
    const scores = pm.scores.length ? pm.scores : [0]
    return {
      slot,
      moveId: id,
      name: getMove(id)?.display_name ?? `#${id}`,
      pChosen: (counts.get(`m${slot}`)?.n ?? 0) / samples,
      scoreMin: Math.min(...scores),
      scoreMax: Math.max(...scores),
      scoreMean: scores.reduce((s, x) => s + x, 0) / scores.length,
      contributions: [...pm.contrib.entries()]
        .map(([label, e]) => ({ label, frequency: e.n / samples, meanDelta: e.sum / e.n }))
        .sort((a, b) => b.frequency - a.frequency),
    }
  })
  return {
    odds,
    moves,
    better,
    base: ctx.ai === 'gen1' ? 10 : ctx.ai === 'gen2' ? 20 : 100,
    lowConfidence: [...low],
    pre: [...pre.entries()].map(([label, n]) => ({ label, p: n / samples })),
    samples,
  }
}

// ------------------------------------------------------------------ doubles

/** The doubles model for the game: Gen 3 and Gen 4 only (Gen 1-2 have no double battles). */
function doublesModel(ctx: GameContext): (env: AiEnv, slot: Slot) => AiChoice {
  const model = ctx.ai === 'gen3' ? gen3AiDoubles : ctx.ai === 'gen4' ? gen4AiDoubles : null
  if (!model) throw new Error(`${ctx.label} has no double battles`)
  // A move nobody aims (a spread move, Outrage, Helping Hand...) carries no target:
  // the AI still names one internally, but it changes nothing.
  return (env, slot) => {
    const c = model(env, slot)
    const a = c.action
    if (a.kind !== 'move' || !a.target) return c
    const me = monAt(env.st, { side: 'theirs', slot })
    const id = me?.spec.moves[a.slot] ?? 0
    return needsTarget(env.data, id) ? c : { ...c, action: { kind: 'move', slot: a.slot } }
  }
}

/**
 * Both of the opponent's battlers choose (S6), left slot first. A switch the first
 * one picks is reserved, so the second cannot pick the same Pokemon (the games'
 * monToSwitchIntoId / aiSwitchedPartySlot).
 */
export function chooseOpponentActionsDoubles(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  rng: Rng,
): { slot: Slot; choice: AiChoice }[] {
  const model = doublesModel(ctx)
  const out: { slot: Slot; choice: AiChoice }[] = []
  const reserved: number[] = []
  for (const slot of [0, 1] as Slot[]) {
    if (!standing(st, { side: 'theirs', slot })) continue
    const choice = model({ ctx, data, st, rng, reserved: [...reserved] }, slot)
    if (choice.action.kind === 'switch') reserved.push(choice.action.to)
    out.push({ slot, choice })
  }
  return out
}

/** P4 in a double battle: the replacement for one emptied slot. */
export function aiSendOutDoubles(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  rng: Rng,
  slot: Slot,
  reserved: number[],
): number {
  const view = aiView(st, slot, { side: 'mine', slot })
  const env: AiEnv = { ctx, data, st: view, rng, reserved }
  return ctx.ai === 'gen4' ? gen4SendOut(env) : gen3SendOut(env)
}

/** A doubles action's label: the move and the battler it is aimed at. */
export function actionLabelAt(st: BattleState, a: Action, slot: Slot): string {
  const m = monAt(st, { side: 'theirs', slot })
  if (!m) return 'Nothing'
  if (a.kind === 'move') {
    const name = getMove(m.spec.moves[a.slot])?.display_name ?? `slot ${a.slot + 1}`
    const t = a.target ? monAt(st, a.target) : undefined
    return t ? `${name} → ${t.spec.label}${a.target!.side === 'theirs' ? ' (ally)' : ''}` : name
  }
  if (a.kind === 'switch') return `Switch to ${st.sides.theirs.mons[a.to]?.spec.label ?? a.to}`
  if (a.kind === 'item') return `Use ${getItem(a.itemId)?.display_name ?? 'item'}`
  return 'Nothing'
}

/**
 * The doubles prediction for one of the opponent's battlers: the odds of each
 * (move, target), over the AI's own random checks, with the per-move breakdown of
 * the target it ended up choosing.
 */
export function predictAiDoubles(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  slot: Slot,
  samples = 300,
  seed = 0x5eed,
): AiPrediction {
  const model = doublesModel(ctx)
  const me = monAt(st, { side: 'theirs', slot })!
  const counts = new Map<string, { action: Action; n: number }>()
  const perMove = me.spec.moves.map(() => ({
    scores: [] as number[],
    contrib: new Map<string, { n: number; sum: number }>(),
  }))
  const pre = new Map<string, number>()
  const low = new Set<string>()
  for (let i = 0; i < samples; i++) {
    const rng = new Rng(seed + i * 7919)
    const { action, trace } = model({ ctx, data, st, rng }, slot)
    trace.lowConfidence.forEach((x) => low.add(x))
    const k =
      action.kind === 'move' && action.target
        ? `${key(action)}@${posKey(action.target)}`
        : key(action)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { action, n: 1 })
    if (trace.pre) pre.set(trace.pre.label, (pre.get(trace.pre.label) ?? 0) + 1)
    trace.moves.forEach((mt) => {
      const pm = perMove[mt.slot]
      if (!pm) return
      pm.scores.push(mt.score)
      const run = new Map<string, number>()
      for (const ctb of mt.contributions) run.set(ctb.label, (run.get(ctb.label) ?? 0) + ctb.delta)
      for (const [label, delta] of run) {
        const e = pm.contrib.get(label) ?? { n: 0, sum: 0 }
        e.n++
        e.sum += delta
        pm.contrib.set(label, e)
      }
    })
  }
  const odds = [...counts.values()]
    .map(({ action, n }) => ({ action, label: actionLabelAt(st, action, slot), p: n / samples }))
    .sort((a, b) => b.p - a.p)
  const chosenSlot = (s: number) =>
    [...counts.values()]
      .filter((c) => c.action.kind === 'move' && c.action.slot === s)
      .reduce((t, c) => t + c.n, 0) / samples
  const moves: MoveBreakdown[] = me.spec.moves.map((id, s) => {
    const pm = perMove[s]
    const scores = pm.scores.length ? pm.scores : [0]
    return {
      slot: s,
      moveId: id,
      name: getMove(id)?.display_name ?? `#${id}`,
      pChosen: chosenSlot(s),
      scoreMin: Math.min(...scores),
      scoreMax: Math.max(...scores),
      scoreMean: scores.reduce((t, x) => t + x, 0) / scores.length,
      contributions: [...pm.contrib.entries()]
        .map(([label, e]) => ({ label, frequency: e.n / samples, meanDelta: e.sum / e.n }))
        .sort((a, b) => b.frequency - a.frequency),
    }
  })
  return {
    odds,
    moves,
    better: 'higher',
    base: 100,
    lowConfidence: [...low],
    pre: [...pre.entries()].map(([label, n]) => ({ label, p: n / samples })),
    samples,
  }
}

export type { AiChoice, AiEnv } from './types'
