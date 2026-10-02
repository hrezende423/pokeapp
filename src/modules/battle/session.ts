/**
 * A battle from start to finish, headless: the same code the sandbox steps one
 * turn at a time, the Monte Carlo runs thousands of times, and the gauntlet
 * chains across five trainers.
 *
 * The OPPONENT is always the AI model (ai/index.ts). The PLAYER is whoever calls:
 * the sandbox passes the reader's chosen action; the Monte Carlo and the search
 * pass a policy.
 */

import type { StatusId } from '../calculators/damage'
import { aiSendOut, chooseOpponentAction, type AiChoice } from './ai'
import type { BattleData } from './battleData'
import { gameMove } from './battleData'
import type { BattlerSpec } from './battler'
import { analyzeMove, emptyMatchField, type MatchField } from './damage'
import {
  canSwitch,
  engineDamage,
  resolveSwitch,
  resolveTurn,
  switchIn,
  usableMoveSlots,
  type Action,
  type LogLine,
} from './engine/turn'
import {
  Rng,
  type ChanceEvent,
  type ChanceSource,
  type Policies,
  RANDOM_POLICIES,
} from './engine/rng'
import {
  activeMon,
  aliveCount,
  emptySideState,
  initMon,
  type BattleState,
  type CornerPick,
  type Side,
} from './engine/state'
import type { GameContext } from './game'

export interface TrainerInfo {
  classId: string
  aiFlags: string[]
  versionGroup: string
  bag: number[]
}

export interface CarryOver {
  /** Per mine-slot HP % (0 = fainted) and status, e.g. from a previous gauntlet fight. */
  hpPct: (number | null)[]
  status: (StatusId | null)[]
  /** Per mine-slot PP left per move. */
  pp?: (number[] | null)[]
}

export interface NewBattleOptions {
  badges: string[]
  /** Which end of every ranged spread to pin (the sandbox shows which). */
  minePick?: CornerPick
  theirsPick?: CornerPick
  mineLead?: number
  carry?: CarryOver
  field?: MatchField
}

export function newBattle(
  ctx: GameContext,
  data: BattleData,
  mine: BattlerSpec[],
  theirs: BattlerSpec[],
  trainer: TrainerInfo | null,
  opts: NewBattleOptions,
): { state: BattleState; log: LogLine[] } {
  const mineMons = mine.map((s, i) => {
    const m = initMon(
      ctx,
      data,
      s,
      opts.minePick ?? 'high',
      opts.carry?.hpPct[i] ?? null,
      opts.carry?.status[i] ?? 'healthy',
    )
    const pp = opts.carry?.pp?.[i]
    if (pp) m.pp = [...pp]
    return m
  })
  const theirMons = theirs.map((s) => initMon(ctx, data, s, opts.theirsPick ?? 'high'))
  const st: BattleState = {
    turn: 0,
    weather: { kind: opts.field?.weather ?? null, turns: opts.field?.weather ? -1 : 0 },
    trickRoom: opts.field?.trickRoom ? 5 : 0,
    gravity: opts.field?.gravity ? 5 : 0,
    sides: {
      mine: emptySideState(mineMons),
      theirs: emptySideState(theirMons, trainer?.bag ?? []),
    },
    badges: opts.badges,
    trainer: trainer
      ? { classId: trainer.classId, aiFlags: trainer.aiFlags, versionGroup: trainer.versionGroup }
      : null,
    pendingSwitch: [],
    winner: null,
    aiLayer2: 0,
  }
  if (opts.field) {
    for (const side of ['mine', 'theirs'] as Side[]) {
      const f = opts.field.sides[side]
      const sd = st.sides[side]
      sd.spikes = f.spikes
      sd.stealthRock = f.stealthRock
      sd.reflect = f.reflect ? 5 : 0
      sd.lightScreen = f.lightScreen ? 5 : 0
    }
  }
  const lead = Math.max(
    0,
    mineMons.findIndex((m, i) => i >= (opts.mineLead ?? 0) && !m.fainted),
  )
  st.sides.mine.active = lead
  st.sides.theirs.active = Math.max(
    0,
    theirMons.findIndex((m) => !m.fainted),
  )
  const log: LogLine[] = []
  const src: ChanceSource = { rng: new Rng(1), policies: RANDOM_POLICIES, events: [], turn: 0 }
  // The leads "switch in" so entry abilities and hazards apply (opponent first, as the games send it first).
  switchIn({ ctx, data, st, src, log }, 'theirs', st.sides.theirs.active)
  switchIn({ ctx, data, st, src, log }, 'mine', st.sides.mine.active)
  return { state: st, log }
}

export interface StepResult {
  state: BattleState
  log: LogLine[]
  ai: AiChoice | null
  events: ChanceEvent[]
}

/** One turn: the AI picks for the opponent, then everything resolves. */
export function stepTurn(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  player: Action,
  policies: Policies,
  rng: Rng,
  aiRng: Rng,
  forcedAi?: Action,
): StepResult {
  const ai = forcedAi ? null : chooseOpponentAction(ctx, data, st, aiRng)
  const oppAction = forcedAi ?? ai!.action
  const src: ChanceSource = { rng, policies, events: [], turn: st.turn }
  const r = resolveTurn(ctx, data, st, { mine: player, theirs: oppAction }, src)
  let state = r.state
  const log = [...r.log]
  // The opponent replaces a fainted (or pivoting) Pokemon with its own logic.
  if (!state.winner && state.pendingSwitch.includes('theirs')) {
    const to = aiSendOut({ ctx, data, st: state, rng: aiRng })
    if (to >= 0) {
      const sw = resolveSwitch(ctx, data, state, 'theirs', to, src)
      state = sw.state
      log.push(...sw.log)
    }
  }
  return { state, log, ai, events: src.events }
}

/** The player's replacement, done by the caller (sandbox) or a policy. */
export function playerSwitch(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  to: number,
  policies: Policies,
  rng: Rng,
): StepResult {
  const src: ChanceSource = { rng, policies, events: [], turn: st.turn }
  const r = resolveSwitch(ctx, data, st, 'mine', to, src)
  return { state: r.state, log: r.log, ai: null, events: src.events }
}

// --------------------------------------------------------------- policies

export type PlayerPolicy = (ctx: GameContext, data: BattleData, st: BattleState, rng: Rng) => Action

/**
 * The greedy player: the move with the most expected damage on the active
 * opponent (accuracy and crits folded in), a status move only when it has nothing
 * that damages. The baseline the Monte Carlo and the search measure against.
 */
export const greedyPlayer: PlayerPolicy = (ctx, data, st) => {
  const m = activeMon(st, 'mine')
  const slots = usableMoveSlots(ctx, data, st, 'mine')
  if (!slots.length) return { kind: 'move', slot: 0 }
  let best = slots[0]
  let bestVal = -1
  for (const slot of slots) {
    const id = m.spec.moves[slot]
    const r = engineDamage(ctx, st, 'mine', id, false, null)
    let val: number
    if (r && !r.noDamageReason) {
      const d = r.damage
      const rolls =
        typeof d === 'number'
          ? [d]
          : Array.isArray(d[0])
            ? (d as number[][]).map((row) => row.reduce((s, x) => s + x, 0) / row.length)
            : (d as number[])
      const mean =
        Array.isArray(d) && Array.isArray(d[0])
          ? rolls.reduce((s, x) => s + x, 0)
          : rolls.reduce((s, x) => s + x, 0) / rolls.length
      val = (mean * ((gameMove(data, id)?.a ?? 100) || 100)) / 100
    } else val = (gameMove(data, id)?.p ?? 0) > 0 ? 0 : 0.01
    if (val > bestVal) {
      bestVal = val
      best = slot
    }
  }
  return { kind: 'move', slot: best }
}

/** Replacement policy: the healthy Pokemon whose best move does the most to the opponent's active. */
export function bestReplacement(ctx: GameContext, data: BattleData, st: BattleState): number {
  const options = canSwitch(st, 'mine')
  if (!options.length) return -1
  const foe = activeMon(st, 'theirs')
  let best = options[0]
  let bestVal = -1
  for (const i of options) {
    const m = st.sides.mine.mons[i]
    let val = 0
    for (const id of m.spec.moves) {
      const md = analyzeMove({
        ctx,
        data,
        attacker: m.spec,
        defender: foe.spec,
        moveId: id,
        attackerSide: 'mine',
        field: fieldOf(st),
        atk: { status: m.status, boosts: {}, currentHp: m.hp, abilityOn: false },
        def: { status: foe.status, boosts: {}, currentHp: foe.hp, abilityOn: false },
        badges: new Set(st.badges),
        fast: true,
      })
      if (md.status === 'ok') val = Math.max(val, md.expectedPct)
    }
    val *= m.hp / m.maxHp
    if (val > bestVal) {
      bestVal = val
      best = i
    }
  }
  return best
}

export function fieldOf(st: BattleState): MatchField {
  const f = emptyMatchField()
  f.weather = st.weather.kind
  f.trickRoom = st.trickRoom > 0
  f.gravity = st.gravity > 0
  for (const side of ['mine', 'theirs'] as Side[]) {
    const sd = st.sides[side]
    f.sides[side] = {
      ...f.sides[side],
      reflect: sd.reflect > 0,
      lightScreen: sd.lightScreen > 0,
      spikes: sd.spikes,
      stealthRock: sd.stealthRock,
    }
  }
  return f
}

export interface BattleOutcome {
  winner: Side | null
  turns: number
  /** Indexes of my Pokemon that fainted, in order. */
  mineFainted: number[]
  theirsFainted: number[]
  events: ChanceEvent[]
  final: BattleState
  /** The turn each of my Pokemon fainted on. */
  faintTurn: Record<number, number>
}

/** Play a whole battle out. */
export function runBattle(
  ctx: GameContext,
  data: BattleData,
  initial: BattleState,
  player: PlayerPolicy,
  seed: number,
  maxTurns = 120,
  policies: Policies = RANDOM_POLICIES,
): BattleOutcome {
  const rng = new Rng(seed)
  const aiRng = new Rng(seed ^ 0x9e3779b9)
  let st = initial
  const events: ChanceEvent[] = []
  const mineFainted: number[] = []
  const theirsFainted: number[] = []
  const faintTurn: Record<number, number> = {}
  const noteFaints = (before: BattleState, after: BattleState) => {
    after.sides.mine.mons.forEach((m, i) => {
      if (m.fainted && !before.sides.mine.mons[i].fainted) {
        mineFainted.push(i)
        faintTurn[i] = after.turn
      }
    })
    after.sides.theirs.mons.forEach((m, i) => {
      if (m.fainted && !before.sides.theirs.mons[i].fainted) theirsFainted.push(i)
    })
  }
  while (!st.winner && st.turn < maxTurns) {
    if (st.pendingSwitch.includes('mine')) {
      const to = bestReplacement(ctx, data, st)
      if (to < 0) break
      st = playerSwitch(ctx, data, st, to, policies, rng).state
      continue
    }
    const before = st
    const r = stepTurn(ctx, data, st, player(ctx, data, st, rng), policies, rng, aiRng)
    events.push(...r.events)
    st = r.state
    noteFaints(before, st)
  }
  if (!st.winner) {
    if (aliveCount(st.sides.theirs) === 0) st.winner = 'mine'
    else if (aliveCount(st.sides.mine) === 0) st.winner = 'theirs'
  }
  return {
    winner: st.winner,
    turns: st.turn,
    mineFainted,
    theirsFainted,
    events,
    final: st,
    faintTurn,
  }
}
