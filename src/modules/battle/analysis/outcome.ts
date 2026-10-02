/**
 * OUTCOMES (O1-O4): whole battles against the opponent's AI.
 *
 *   O2 MONTE CARLO: N seeded battles, every roll drawn, the opponent played by
 *      its generation's AI (ai/), mine by a policy. Ranged spreads are run at
 *      BOTH ends -- my least favourable values against their most favourable,
 *      and the reverse -- so the win probability is a range like every other
 *      output (single-value spreads run once).
 *   O3 RISK REPORT: the chance events recorded in every run (engine/rng.ts),
 *      split by who they hurt, compared between lost and won runs: the events
 *      that show up in losses far more than in wins are the risks.
 *   O4 NUZLOCKE: the chance of winning with NO faint, each Pokemon's chance of
 *      fainting, and (in the lead search) the lead that minimises faints.
 *   O1 SEARCH: the best lead (by win rate, or by zero-faint rate in Nuzlocke
 *      mode), then a line turn by turn -- at each turn every action I could
 *      take is tried with the same seeded rollouts (common random numbers) and
 *      the best is kept; the line follows the opponent's most likely action and
 *      average rolls.
 */

import type { BattleData } from '../battleData'
import type { BattlerSpec } from '../battler'
import { canSwitch, usableMoveSlots, type Action } from '../engine/turn'
import { DEFAULT_SANDBOX_POLICIES, RANDOM_POLICIES, Rng, type ChanceEvent } from '../engine/rng'
import { activeMon, aliveCount, type BattleState, type CornerPick } from '../engine/state'
import type { GameContext } from '../game'
import { isPoint, type Range } from '../range'
import { actionLabel, predictAi } from '../ai'
import {
  bestReplacement,
  greedyPlayer,
  newBattle,
  playerSwitch,
  runBattle,
  stepTurn,
  type CarryOver,
  type PlayerPolicy,
  type TrainerInfo,
} from '../session'
import type { MatchField } from '../damage'
import { getMove } from '../../../data'

export interface OutcomeInput {
  ctx: GameContext
  data: BattleData
  mine: BattlerSpec[]
  theirs: BattlerSpec[]
  trainer: TrainerInfo | null
  badges: string[]
  field?: MatchField
  carry?: CarryOver
  mineLead?: number
  runs: number
  seed?: number
  maxTurns?: number
  player?: PlayerPolicy
  /**
   * R6: a facility trainer's pool. Each run DRAWS `size` sets from it, as the game
   * does -- no two of one species and no two holding one item (the facilities'
   * own clauses) -- instead of fighting `theirs`.
   */
  pool?: { specs: BattlerSpec[]; size: number }
  /** Rank by zero-faint rate instead of win rate (O4). */
  nuzlocke?: boolean
  onProgress?: (done: number, total: number) => void
}

/** Does any spread on either side carry a range? Then outcomes run at both ends. */
export function hasRanges(specs: BattlerSpec[]): boolean {
  return specs.some(
    (s) =>
      Object.values(s.spread.individual).some((r) => r && !isPoint(r)) ||
      Object.values(s.spread.effort).some((r) => r && !isPoint(r)) ||
      s.spread.natureIds.length > 1 ||
      !!s.ivRandom,
  )
}

export interface CornerPlan {
  name: 'exact' | 'unfavourable' | 'favourable'
  mine: CornerPick
  theirs: CornerPick
}

export function cornerPlans(inp: Pick<OutcomeInput, 'mine' | 'theirs'>): CornerPlan[] {
  if (!hasRanges([...inp.mine, ...inp.theirs]))
    return [{ name: 'exact', mine: 'high', theirs: 'high' }]
  return [
    { name: 'unfavourable', mine: 'low', theirs: 'high' },
    { name: 'favourable', mine: 'high', theirs: 'low' },
  ]
}

// ------------------------------------------------------------------ risks

/** Who an event's notable outcome hurts: 'mine' = bad for me. */
function eventHurts(e: ChanceEvent): 'mine' | 'theirs' | null {
  if (e.kind === 'roll' || e.kind === 'multi-hit' || e.kind === 'ai') return null
  if (e.kind === 'speed-tie') return e.happened ? null : 'mine'
  if (e.who === 'both') return null
  const actor = e.who.startsWith('mine:') ? 'mine' : e.who.startsWith('theirs:') ? 'theirs' : null
  if (!actor) return null
  if (!e.happened) {
    // A move that "hits" for an OHKO failing is the actor's misfortune; otherwise nothing notable.
    return e.kind === 'miss' && / hits$/.test(e.label) ? actor : null
  }
  // Outcomes that help the actor: crits, secondary effects, Quick Claw, thaws, a Protect chain holding, an OHKO landing.
  const helpsActor =
    e.kind === 'crit' ||
    e.kind === 'secondary' ||
    e.kind === 'quick-claw' ||
    e.kind === 'thaw' ||
    (e.kind === 'other' && /succeeds again/.test(e.label)) ||
    (e.kind === 'miss' && / hits$/.test(e.label))
  const hurtsActor =
    (e.kind === 'miss' && / misses$/.test(e.label)) ||
    e.kind === 'full-para' ||
    e.kind === 'confusion' ||
    (e.kind === 'other' && /love/.test(e.label))
  if (helpsActor) return actor === 'mine' ? 'theirs' : 'mine'
  if (hurtsActor) return actor
  return null
}

const normalise = (label: string) =>
  label.replace(/ \(hit \d+\)/, '').replace(/ \(\d+(\.\d+)?%\)/, '')

export interface RiskItem {
  label: string
  kind: ChanceEvent['kind']
  /** Its chance each time it is rolled. */
  p: number
  /** Share of lost runs / won runs in which it happened (against me). */
  inLosses: number
  inWins: number
  lift: number
}

// ------------------------------------------------------------- Monte Carlo

export interface FaintRisk {
  key: string
  label: string
  /** P(this Pokemon faints in the battle), per corner plan. */
  p: Range
  /** Mean turn it faints on, when it does. */
  meanTurn: number | null
}

export interface McResult {
  runsPerPlan: number
  plans: CornerPlan[]
  winRate: Range
  /** Wilson 95% interval: low end of the unfavourable plan .. high end of the favourable. */
  interval: [number, number]
  /** O4: win with no faint at all. */
  zeroFaint: Range
  expectedFaints: Range
  avgTurns: number
  /** Battles that hit the turn limit undecided. */
  undecided: number
  faintRisk: FaintRisk[]
  /** O3: events against me, ranked by how much more often they appear in losses. */
  risks: RiskItem[]
  /** O3: share of losses in which an against-me event of chance <= 25% happened. */
  lossesToLuck: number
  ceiling: boolean
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]
}

interface PlanStats {
  wins: number
  zeroFaint: number
  faints: number
  turns: number
  undecided: number
  faintCount: Map<number, number>
  faintTurns: Map<number, number>
  lossEvents: Map<string, { n: number; p: number; kind: ChanceEvent['kind'] }>
  winEvents: Map<string, number>
  losses: number
  lossesToLuck: number
}

function initial(inp: OutcomeInput, plan: CornerPlan, lead?: number): BattleState {
  return newBattle(inp.ctx, inp.data, inp.mine, inp.theirs, inp.trainer, {
    badges: inp.badges,
    minePick: plan.mine,
    theirsPick: plan.theirs,
    mineLead: lead ?? inp.mineLead ?? 0,
    carry: inp.carry,
    field: inp.field,
  }).state
}

/** R6: one draw from a facility pool, honouring the species and item clauses. */
export function drawFromPool(pool: BattlerSpec[], size: number, rng: Rng): BattlerSpec[] {
  const out: BattlerSpec[] = []
  const species = new Set<number>()
  const items = new Set<number>()
  const order = pool.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  for (const i of order) {
    const s = pool[i]
    if (species.has(s.speciesId) || (s.itemId != null && items.has(s.itemId))) continue
    species.add(s.speciesId)
    if (s.itemId != null) items.add(s.itemId)
    out.push({ ...s, key: `${s.key}#${out.length}` })
    if (out.length === size) break
  }
  return out
}

function runPlan(
  inp: OutcomeInput,
  plan: CornerPlan,
  runs: number,
  seed: number,
  lead: number | undefined,
  tick: () => void,
): PlanStats {
  const fixed = inp.pool ? null : initial(inp, plan, lead)
  const drawRng = new Rng(seed ^ 0xd2a3)
  const s: PlanStats = {
    wins: 0,
    zeroFaint: 0,
    faints: 0,
    turns: 0,
    undecided: 0,
    faintCount: new Map(),
    faintTurns: new Map(),
    lossEvents: new Map(),
    winEvents: new Map(),
    losses: 0,
    lossesToLuck: 0,
  }
  for (let i = 0; i < runs; i++) {
    const st0 =
      fixed ??
      initial(
        { ...inp, theirs: drawFromPool(inp.pool!.specs, inp.pool!.size, drawRng) },
        plan,
        lead,
      )
    const o = runBattle(
      inp.ctx,
      inp.data,
      st0,
      inp.player ?? greedyPlayer,
      seed + i * 104729,
      inp.maxTurns ?? 120,
    )
    s.turns += o.turns
    if (o.winner === 'mine') s.wins++
    if (!o.winner) s.undecided++
    if (o.winner === 'mine' && o.mineFainted.length === 0) s.zeroFaint++
    s.faints += o.mineFainted.length
    for (const i2 of o.mineFainted) {
      s.faintCount.set(i2, (s.faintCount.get(i2) ?? 0) + 1)
      s.faintTurns.set(i2, (s.faintTurns.get(i2) ?? 0) + (o.faintTurn[i2] ?? 0))
    }
    const bad = new Map<string, { p: number; kind: ChanceEvent['kind'] }>()
    for (const e of o.events) {
      if (eventHurts(e) !== 'mine') continue
      const k = normalise(e.label)
      const p =
        e.kind === 'miss' && / hits$/.test(e.label) ? 1 - e.p : e.kind === 'speed-tie' ? 0.5 : e.p
      if (!bad.has(k)) bad.set(k, { p, kind: e.kind })
    }
    if (o.winner === 'mine') {
      for (const k of bad.keys()) s.winEvents.set(k, (s.winEvents.get(k) ?? 0) + 1)
    } else {
      s.losses++
      let luck = false
      for (const [k, v] of bad) {
        const e = s.lossEvents.get(k) ?? { n: 0, p: v.p, kind: v.kind }
        e.n++
        s.lossEvents.set(k, e)
        if (v.p <= 0.25) luck = true
      }
      if (luck) s.lossesToLuck++
    }
    tick()
  }
  return s
}

export function monteCarlo(inp: OutcomeInput, lead?: number): McResult {
  const plans = cornerPlans(inp)
  const runs = Math.max(1, inp.runs)
  const total = runs * plans.length
  let done = 0
  const tick = () => {
    done++
    if (inp.onProgress && (done % 10 === 0 || done === total)) inp.onProgress(done, total)
  }
  const stats = plans.map((p) => runPlan(inp, p, runs, inp.seed ?? 1, lead, tick))
  const rate = (f: (s: PlanStats) => number): Range => {
    const v = stats.map(f)
    return { min: Math.min(...v), max: Math.max(...v) }
  }
  const winRate = rate((s) => s.wins / runs)
  const lo = stats.reduce((a, s) => (s.wins < a.wins ? s : a), stats[0])
  const hi = stats.reduce((a, s) => (s.wins > a.wins ? s : a), stats[0])
  const interval: [number, number] = [wilson(lo.wins, runs)[0], wilson(hi.wins, runs)[1]]
  const faintRisk: FaintRisk[] = inp.mine.map((m, i) => {
    const ps = stats.map((s) => (s.faintCount.get(i) ?? 0) / runs)
    const n = stats.reduce((a, s) => a + (s.faintCount.get(i) ?? 0), 0)
    const t = stats.reduce((a, s) => a + (s.faintTurns.get(i) ?? 0), 0)
    return {
      key: m.key,
      label: m.label,
      p: { min: Math.min(...ps), max: Math.max(...ps) },
      meanTurn: n ? t / n : null,
    }
  })
  // Risks: pooled over the plans.
  const losses = stats.reduce((a, s) => a + s.losses, 0)
  const wins = stats.reduce((a, s) => a + s.wins, 0)
  const pooled = new Map<string, { n: number; p: number; kind: ChanceEvent['kind'] }>()
  for (const s of stats)
    for (const [k, v] of s.lossEvents) {
      const e = pooled.get(k) ?? { n: 0, p: v.p, kind: v.kind }
      e.n += v.n
      pooled.set(k, e)
    }
  const winEv = new Map<string, number>()
  for (const s of stats) for (const [k, n] of s.winEvents) winEv.set(k, (winEv.get(k) ?? 0) + n)
  const risks: RiskItem[] = [...pooled.entries()]
    .map(([label, v]) => {
      const inLosses = losses ? v.n / losses : 0
      const inWins = wins ? (winEv.get(label) ?? 0) / wins : 0
      return { label, kind: v.kind, p: v.p, inLosses, inWins, lift: inLosses - inWins }
    })
    .filter((r) => r.inLosses >= 0.05 && r.lift > 0)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 10)
  return {
    runsPerPlan: runs,
    plans,
    winRate,
    interval,
    zeroFaint: rate((s) => s.zeroFaint / runs),
    expectedFaints: rate((s) => s.faints / runs),
    avgTurns: stats.reduce((a, s) => a + s.turns, 0) / (runs * plans.length),
    undecided: stats.reduce((a, s) => a + s.undecided, 0),
    faintRisk,
    risks,
    lossesToLuck: losses ? stats.reduce((a, s) => a + s.lossesToLuck, 0) / losses : 0,
    ceiling: [...inp.mine, ...inp.theirs].some((s) => s.spread.ceiling),
  }
}

// ------------------------------------------------------------- O1 search

export interface LeadScore {
  index: number
  key: string
  label: string
  winRate: Range
  zeroFaint: Range
  expectedFaints: Range
}

export interface LineStep {
  turn: number
  /** My Pokemon on the field and the opponent's, at the start of the turn. */
  mineKey: string
  theirsKey: string
  action: Action
  actionLabel: string
  /** Rollout score (win rate, or zero-faint rate in Nuzlocke mode) of the chosen action. */
  score: number
  alternatives: { label: string; score: number }[]
  /** The opponent's most likely action this turn, and its chance. */
  expectedFoe: { label: string; p: number } | null
  /** HP % after the turn (average rolls, no crits or misses), both sides. */
  hpAfter: { mine: number; theirs: number }
  note?: string
}

export interface SearchResult {
  leads: LeadScore[]
  bestLead: number
  line: LineStep[]
  /** The battle the line reached (by average rolls), and whether it was won. */
  lineOutcome: 'won' | 'lost' | 'open'
  objective: 'win' | 'no-faint'
}

export interface SearchOptions {
  leadRuns: number
  rollouts: number
  depth: number
}

function actionsFor(inp: OutcomeInput, st: BattleState): Action[] {
  const moves = usableMoveSlots(inp.ctx, inp.data, st, 'mine').map(
    (slot) => ({ kind: 'move', slot }) as Action,
  )
  const switches = canSwitch(st, 'mine').map((to) => ({ kind: 'switch', to }) as Action)
  return moves.length ? [...moves, ...switches] : [{ kind: 'move', slot: 0 }, ...switches]
}

function myActionLabel(st: BattleState, a: Action): string {
  const m = activeMon(st, 'mine')
  if (a.kind === 'move') return getMove(m.spec.moves[a.slot])?.display_name ?? `Move ${a.slot + 1}`
  if (a.kind === 'switch') return `Switch to ${st.sides.mine.mons[a.to]?.spec.label}`
  return 'Nothing'
}

/** Score an action from a state: the share of seeded rollouts won (or won clean). */
function rolloutScore(
  inp: OutcomeInput,
  st: BattleState,
  a: Action,
  rollouts: number,
  seed: number,
  nuzlocke: boolean,
): number {
  let score = 0
  for (let i = 0; i < rollouts; i++) {
    const s = seed + i * 7907
    const rng = new Rng(s)
    const aiRng = new Rng(s ^ 0x51ed)
    let next = stepTurn(inp.ctx, inp.data, st, a, RANDOM_POLICIES, rng, aiRng).state
    const faintedBefore = st.sides.mine.mons.filter((m) => m.fainted).length
    if (next.pendingSwitch.includes('mine') && !next.winner) {
      const to = bestReplacement(inp.ctx, inp.data, next)
      if (to >= 0) next = playerSwitch(inp.ctx, inp.data, next, to, RANDOM_POLICIES, rng).state
    }
    const o = next.winner
      ? null
      : runBattle(inp.ctx, inp.data, next, inp.player ?? greedyPlayer, s + 1, inp.maxTurns ?? 120)
    const winner = next.winner ?? o?.winner
    const faints =
      next.sides.mine.mons.filter((m) => m.fainted).length -
      faintedBefore +
      (o?.mineFainted.length ?? 0)
    if (winner === 'mine' && (!nuzlocke || faints === 0)) score++
    else if (winner === 'mine') score += 0.5
  }
  return score / rollouts
}

export function searchLine(inp: OutcomeInput, opts: SearchOptions): SearchResult {
  const { ctx, data } = inp
  const nuzlocke = !!inp.nuzlocke
  const plan = cornerPlans(inp)[0]
  const alive = inp.mine.map((_, i) => i).filter((i) => inp.carry?.hpPct[i] !== 0)
  const totalWork =
    alive.length * opts.leadRuns * cornerPlans(inp).length + opts.depth * 8 * opts.rollouts
  let done = 0
  const progress = (n: number) => {
    done += n
    inp.onProgress?.(Math.min(done, totalWork), totalWork)
  }
  // Leads.
  const leads: LeadScore[] = alive.map((i) => {
    const r = monteCarlo({ ...inp, runs: opts.leadRuns, onProgress: undefined }, i)
    progress(opts.leadRuns * r.plans.length)
    return {
      index: i,
      key: inp.mine[i].key,
      label: inp.mine[i].label,
      winRate: r.winRate,
      zeroFaint: r.zeroFaint,
      expectedFaints: r.expectedFaints,
    }
  })
  const key = (l: LeadScore) =>
    nuzlocke ? l.zeroFaint.min + l.zeroFaint.max : l.winRate.min + l.winRate.max
  leads.sort((a, b) => key(b) - key(a))
  const bestLead = leads[0]?.index ?? 0
  // Line.
  // A facility pool: the line is played against one draw from it (the leads above sampled many).
  let st = initial(
    inp.pool ? { ...inp, theirs: drawFromPool(inp.pool.specs, inp.pool.size, new Rng(0x77)) } : inp,
    plan,
    bestLead,
  )
  const line: LineStep[] = []
  const lineRng = new Rng(0x11e)
  for (let t = 0; t < opts.depth && !st.winner; t++) {
    if (st.pendingSwitch.includes('mine')) {
      const to = bestReplacement(ctx, data, st)
      if (to < 0) break
      st = playerSwitch(ctx, data, st, to, DEFAULT_SANDBOX_POLICIES, lineRng).state
    }
    const options = actionsFor(inp, st)
    const scored = options.map((a) => {
      const sc = rolloutScore(inp, st, a, opts.rollouts, (inp.seed ?? 1) + t * 31337, nuzlocke)
      progress(opts.rollouts)
      return { a, score: sc }
    })
    scored.sort((x, y) => y.score - x.score)
    const best = scored[0]
    const pred = predictAi(ctx, data, st, 60, 0xa1 + t)
    const top = pred.odds[0] ?? null
    const before = st
    const r = stepTurn(
      ctx,
      data,
      st,
      best.a,
      DEFAULT_SANDBOX_POLICIES,
      lineRng,
      new Rng(0xa1 + t),
      top?.action,
    )
    // (stepTurn has already sent the AI's replacement for a fainted opponent.)
    st = r.state
    const mineNow = before.sides.mine.mons[before.sides.mine.active]
    const theirsNow = before.sides.theirs.mons[before.sides.theirs.active]
    const mAfter = st.sides.mine.mons[before.sides.mine.active]
    const tAfter = st.sides.theirs.mons[before.sides.theirs.active]
    line.push({
      turn: before.turn + 1,
      mineKey: mineNow.key,
      theirsKey: theirsNow.key,
      action: best.a,
      actionLabel: myActionLabel(before, best.a),
      score: best.score,
      alternatives: scored
        .slice(1, 5)
        .map((s) => ({ label: myActionLabel(before, s.a), score: s.score })),
      expectedFoe: top ? { label: actionLabel(before, top.action), p: top.p } : null,
      hpAfter: { mine: (100 * mAfter.hp) / mAfter.maxHp, theirs: (100 * tAfter.hp) / tAfter.maxHp },
      note: pred.lowConfidence.length
        ? `Opponent prediction low confidence: ${pred.lowConfidence.join('; ')}`
        : undefined,
    })
  }
  const lineOutcome =
    st.winner === 'mine'
      ? 'won'
      : st.winner === 'theirs'
        ? 'lost'
        : aliveCount(st.sides.theirs) === 0
          ? 'won'
          : 'open'
  return { leads, bestLead, line, lineOutcome, objective: nuzlocke ? 'no-faint' : 'win' }
}
