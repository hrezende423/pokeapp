/**
 * TURN RESOLUTION (P2, and the engine under O1-O4 and R1).
 *
 * One function, `resolveTurn(state, actions, chance)`, applied the same way by
 * the sandbox (the reader fixes every roll), the Monte Carlo (everything drawn
 * from a seeded PRNG) and the search. It never mutates its input.
 *
 * DAMAGE IS THE PORTED ENGINE'S. Each hit asks calculators/damage for the roll
 * set of that hit (crit or not) and picks one by policy -- so a sandbox damage
 * number is always a real roll of the verified calculator.
 *
 * WHAT IS SIMULATED is listed in moveSem.ts; a move outside it still deals its
 * damage, and the log says its other effect was not simulated.
 */

import {
  getItem,
  getMove,
  getType,
  resolveTypesForGeneration,
  typeEffectivenessAgainst,
} from '../../../data'
import {
  calculateDamage,
  emptySide,
  type CalcField,
  type DamageResult,
  type DoublesField,
} from '../../calculators/damage'
import type { BattleData } from '../battleData'
import { gameMove, heldEffect } from '../battleData'
import { varietyOfSpec } from '../battler'
import { critChance, hitChance, hitCounts, quickClawChance } from '../chance'
import { categoryOf, movePriority } from '../damage'
import type { GameContext } from '../game'
import { effectiveSpeed } from '../speed'
import { doublesField, redirectSingle, spreadTargets, standingFoes, targetKind } from './doubles'
import { moveSem, type MoveSem } from './moveSem'
import { decide, pickRoll, type ChanceSource } from './rng'
import {
  abilitySlugOf,
  activeMon,
  aliveCount,
  battlerOrder,
  calcPokemonOf,
  cloneState,
  emptyVolatile,
  itemSlugOf,
  monAt,
  onField,
  other,
  partnerPos,
  posKey,
  samePos,
  slotIndex,
  slotOfMon,
  standing,
  type BattleState,
  type BoostKey,
  type MonState,
  type Pos,
  type Side,
  type Slot,
} from './state'

export type Action =
  /** `target`: the battler a single-target move is aimed at (doubles; singles ignore it). */
  | { kind: 'move'; slot: number; target?: Pos }
  | { kind: 'switch'; to: number }
  | { kind: 'item'; itemId: number }
  | { kind: 'none' }

export interface LogLine {
  turn: number
  side?: Side
  kind:
    | 'move'
    | 'damage'
    | 'status'
    | 'faint'
    | 'switch'
    | 'item'
    | 'field'
    | 'info'
    | 'warn'
    | 'miss'
    | 'crit'
  text: string
  /** HP after this line, for the line's subject. */
  hp?: { side: Side; hp: number; maxHp: number }
  damage?: number
}

export interface TurnResult {
  state: BattleState
  log: LogLine[]
  /** Damage dealt this turn by each side's active Pokemon, for Counter and the risk report. */
  dealt: Record<Side, number>
}

interface Ctx {
  ctx: GameContext
  data: BattleData
  st: BattleState
  src: ChanceSource
  log: LogLine[]
  dealt: Record<Side, number>
  /** Doubles: each battler's action this turn (Pursuit, Counter), by posKey. */
  actions?: Map<string, Action>
  /** Doubles: this turn's order of action and the battlers' speed order (Gen 4 spread order). */
  turnOrder?: Pos[]
  speedOrder?: Pos[]
}

const name = (m: MonState) => m.spec.label

function typesOf(ctx: GameContext, m: MonState): string[] {
  return resolveTypesForGeneration(varietyOfSpec(m.spec), ctx.generation).map(
    (t) => getType(t.type_id)?.name ?? '',
  )
}

function line(
  c: Ctx,
  kind: LogLine['kind'],
  text: string,
  side?: Side,
  mon?: MonState,
  damage?: number,
) {
  c.log.push({
    turn: c.st.turn,
    side,
    kind,
    text,
    damage,
    hp: mon && side ? { side, hp: mon.hp, maxHp: mon.maxHp } : undefined,
  })
}

function calcField(
  c: Ctx,
  attacker: Side,
  defenderSwitching = false,
  dSide: Side = other(attacker),
): CalcField {
  const s = c.st.sides
  const mk = (sd: Side) => ({
    ...emptySide(),
    reflect: s[sd].reflect > 0,
    lightScreen: s[sd].lightScreen > 0,
    spikes: s[sd].spikes,
    stealthRock: s[sd].stealthRock,
    switchingOut: sd !== attacker && defenderSwitching,
  })
  return {
    weather: c.st.weather.kind,
    gravity: c.st.gravity > 0,
    attackerSide: mk(attacker),
    defenderSide: mk(dSide),
  }
}

/**
 * Which two battlers a damage call is between, when they are not the two slot-0
 * Pokemon (doubles: a slot-1 battler, or an ally hit by Earthquake), and the
 * double-battle inputs of the formula.
 */
export interface DamageAt {
  attacker: MonState
  defender: MonState
  defenderSide: Side
  doubles?: DoublesField
}

/** The engine's damage for one hit (or the whole move when `hits` is set). */
export function engineDamage(
  ctx: GameContext,
  st: BattleState,
  attackerSide: Side,
  moveId: number,
  isCrit: boolean,
  hits: number | null,
  defenderSwitching = false,
  at?: DamageAt,
): DamageResult | null {
  const a = at?.attacker ?? activeMon(st, attackerSide)
  const d = at?.defender ?? activeMon(st, other(attackerSide))
  const move = getMove(moveId)
  if (!move) return null
  const c = { ctx, st } as Ctx
  const field = calcField(
    c,
    attackerSide,
    defenderSwitching,
    at?.defenderSide ?? other(attackerSide),
  )
  if (at?.doubles) field.doubles = at.doubles
  try {
    return calculateDamage(
      ctx.generation,
      calcPokemonOf(ctx, st, a),
      calcPokemonOf(ctx, st, d),
      { move, isCrit, hits, powerOverride: null },
      field,
      { koText: false },
    )
  } catch {
    return null
  }
}

function rollsOf(r: DamageResult, hit: number): number[] {
  const d = r.damage
  if (typeof d === 'number') return [d]
  if (Array.isArray(d[0])) return (d as number[][])[Math.min(hit, d.length - 1)]
  return d as number[]
}

// ----------------------------------------------------------------- order

function actionPriority(c: Ctx, side: Side, a: Action, who?: MonState): number {
  if (a.kind === 'switch') return 7
  if (a.kind === 'item') return 6
  if (a.kind === 'move') {
    const m = who ?? activeMon(c.st, side)
    return movePriority(c.ctx, c.data, m.spec.moves[a.slot])
  }
  return -8
}

function speedOf(c: Ctx, m: MonState, side: Side): number {
  return effectiveSpeed(
    c.ctx,
    c.data,
    { ...m.spec, itemId: m.itemId, abilityId: m.abilityId },
    'high',
    {
      stage: m.boosts.spe,
      paralyzed: m.status === 'par',
      statused: m.status !== 'healthy',
      weather: c.st.weather.kind,
      tailwind: c.st.sides[side].tailwind > 0,
      unburden: m.volatile.unburden,
      slowStart: m.volatile.slowStartTurns > 0,
    },
    new Set(c.st.badges),
  )
}

/** Who acts first this turn. */
function order(c: Ctx, actions: Record<Side, Action>): Side[] {
  const pm = actionPriority(c, 'mine', actions.mine)
  const pt = actionPriority(c, 'theirs', actions.theirs)
  if (pm !== pt) return pm > pt ? ['mine', 'theirs'] : ['theirs', 'mine']
  const mine = activeMon(c.st, 'mine')
  const theirs = activeMon(c.st, 'theirs')
  if (actions.mine.kind === 'move' && actions.theirs.kind === 'move') {
    const qm = quickClawChance(c.ctx, c.data, mine.itemId)
    const qt = quickClawChance(c.ctx, c.data, theirs.itemId)
    if (c.ctx.generation === 3) {
      if (qm || qt) {
        // One turn roll decides every Quick Claw.
        const fired = decide(
          c.src,
          'both',
          'quick-claw',
          'Quick Claw',
          Math.max(qm, qt),
          c.src.policies.status,
        )
        if (fired && qm && !qt) return ['mine', 'theirs']
        if (fired && qt && !qm) return ['theirs', 'mine']
      }
    } else if (c.ctx.generation === 2 || c.ctx.generation === 4) {
      const ft = qt
        ? decide(
            c.src,
            theirs.key,
            'quick-claw',
            `${name(theirs)}'s Quick Claw`,
            qt,
            c.src.policies.status,
          )
        : false
      const fm = qm
        ? decide(
            c.src,
            mine.key,
            'quick-claw',
            `${name(mine)}'s Quick Claw`,
            qm,
            c.src.policies.status,
          )
        : false
      if (fm && !ft) return ['mine', 'theirs']
      if (ft && !fm) return ['theirs', 'mine']
    }
  }
  const sm = speedOf(c, mine, 'mine')
  const stt = speedOf(c, theirs, 'theirs')
  const tr = c.ctx.trickRoom && c.st.trickRoom > 0
  if (sm === stt) {
    const mineFirst = decide(
      c.src,
      'both',
      'speed-tie',
      `Speed tie at ${sm}`,
      0.5,
      c.src.policies.status === 'never' ? 'never' : c.src.policies.status,
    )
    return mineFirst ? ['mine', 'theirs'] : ['theirs', 'mine']
  }
  return sm > stt !== tr ? ['mine', 'theirs'] : ['theirs', 'mine']
}

// --------------------------------------------------------------- statuses

function canBeStatused(c: Ctx, target: MonState, side: Side, kind: string): boolean {
  if (target.fainted) return false
  const types = typesOf(c.ctx, target)
  const ab = abilitySlugOf(target)
  if (kind === 'confusion') return target.volatile.confusion === 0 && ab !== 'own-tempo'
  if (kind === 'flinch') return ab !== 'inner-focus'
  if (kind === 'attract') return !target.volatile.attract && ab !== 'oblivious'
  if (target.status !== 'healthy') return false
  if (c.st.sides[side].safeguard > 0) return false
  switch (kind) {
    case 'psn':
    case 'tox':
      return (
        !types.includes('poison') &&
        !(c.ctx.generation >= 2 && types.includes('steel')) &&
        ab !== 'immunity'
      )
    case 'brn':
      return !types.includes('fire') && ab !== 'water-veil'
    case 'frz':
      return !types.includes('ice') && ab !== 'magma-armor' && c.st.weather.kind !== 'sun'
    case 'par':
      return ab !== 'limber'
    case 'slp':
      return ab !== 'insomnia' && ab !== 'vital-spirit'
  }
  return true
}

function inflict(c: Ctx, target: MonState, side: Side, kind: string, source: string) {
  if (!canBeStatused(c, target, side, kind)) return false
  switch (kind) {
    case 'confusion': {
      const [lo, hi] = c.ctx.generation <= 2 ? [2, 5] : c.ctx.generation === 3 ? [2, 5] : [1, 4]
      target.volatile.confusion =
        lo +
        (c.src.policies.status === 'random'
          ? c.src.rng.int(hi - lo + 1)
          : Math.floor((hi - lo) / 2))
      line(c, 'status', `${name(target)} became confused (${source}).`, side, target)
      return true
    }
    case 'flinch':
      target.volatile.flinch = true
      return true
    case 'attract':
      target.volatile.attract = true
      line(c, 'status', `${name(target)} fell in love.`, side, target)
      return true
    case 'slp': {
      const [lo, hi] = c.ctx.sleepTurns
      target.status = 'slp'
      target.sleep =
        lo +
        (c.src.policies.status === 'random'
          ? c.src.rng.int(hi - lo + 1)
          : Math.floor((hi - lo) / 2))
      line(
        c,
        'status',
        `${name(target)} fell asleep (${target.sleep} turn${target.sleep === 1 ? '' : 's'}).`,
        side,
        target,
      )
      return true
    }
    default:
      target.status = kind as MonState['status']
      if (kind === 'tox') target.toxic = 0
      line(
        c,
        'status',
        `${name(target)} was ${{ psn: 'poisoned', tox: 'badly poisoned', brn: 'burned', frz: 'frozen', par: 'paralyzed' }[kind] ?? kind} (${source}).`,
        side,
        target,
      )
      return true
  }
}

function changeStats(
  c: Ctx,
  target: MonState,
  side: Side,
  changes: { stat: BoostKey; delta: number }[],
  byFoe: boolean,
) {
  if (byFoe && c.st.sides[side].mist > 0 && changes.some((ch) => ch.delta < 0)) {
    line(c, 'info', `${name(target)} is protected by Mist.`, side)
    return
  }
  const ab = abilitySlugOf(target)
  for (const ch of changes) {
    if (
      byFoe &&
      ch.delta < 0 &&
      (ab === 'clear-body' ||
        ab === 'white-smoke' ||
        (ab === 'hyper-cutter' && ch.stat === 'atk') ||
        (ab === 'keen-eye' && ch.stat === 'acc'))
    )
      continue
    const delta = ab === 'simple' && c.ctx.generation === 4 ? ch.delta * 2 : ch.delta
    const stats: BoostKey[] =
      c.ctx.generation === 1 && ch.stat === 'spa' ? ['spa', 'spd'] : [ch.stat]
    for (const s of stats) {
      const before = target.boosts[s]
      target.boosts[s] = Math.max(-6, Math.min(6, before + delta))
    }
    line(
      c,
      'status',
      `${name(target)}'s ${ch.stat.toUpperCase()} ${delta > 0 ? 'rose' : 'fell'}${Math.abs(delta) > 1 ? ' sharply' : ''}.`,
      side,
      target,
    )
  }
}

// --------------------------------------------------------------- faints

function checkFaint(c: Ctx, side: Side, m: MonState) {
  if (m.hp > 0 || m.fainted) return
  m.hp = 0
  m.fainted = true
  m.status = 'healthy'
  line(c, 'faint', `${name(m)} fainted.`, side, m)
  if (c.st.doubles) markPending(c, side, slotOfMon(c.st, side, m))
  else if (aliveCount(c.st.sides[side]) > 0 && !c.st.pendingSwitch.includes(side))
    c.st.pendingSwitch.push(side)
  if (aliveCount(c.st.sides[side]) === 0) c.st.winner = other(side)
}

/** Can this side send someone into an empty slot (a living Pokemon off the field)? */
function hasBench(st: BattleState, side: Side): boolean {
  const sd = st.sides[side]
  return sd.mons.some((x, i) => !x.fainted && !onField(sd, i))
}

/**
 * A slot must be refilled before the next turn (a faint, U-turn, Baton Pass). In
 * singles that is the side's pendingSwitch; in doubles the slot itself, and only
 * when the side has someone left to send (else the slot stays empty).
 */
function markPending(c: Ctx, side: Side, slot: Slot) {
  if (!c.st.doubles) {
    if (!c.st.pendingSwitch.includes(side)) c.st.pendingSwitch.push(side)
    return
  }
  if (!hasBench(c.st, side)) return
  const pend = c.st.pendingSlots ?? (c.st.pendingSlots = [])
  if (!pend.some((p) => p.side === side && p.slot === slot)) pend.push({ side, slot })
  if (!c.st.pendingSwitch.includes(side)) c.st.pendingSwitch.push(side)
}

function damageTo(c: Ctx, side: Side, m: MonState, amount: number, text: string) {
  if (amount <= 0 || m.fainted) return
  m.hp = Math.max(0, m.hp - amount)
  line(c, 'damage', text, side, m, amount)
  checkFaint(c, side, m)
}

function healTo(c: Ctx, side: Side, m: MonState, amount: number, text: string) {
  if (amount <= 0 || m.fainted || m.hp >= m.maxHp) return
  m.hp = Math.min(m.maxHp, m.hp + amount)
  line(c, 'info', text, side, m)
}

// ------------------------------------------------------------- switching

/** Bring Pokemon `to` in on `side`, applying entry hazards and abilities. */
export function switchIn(
  c0: { ctx: GameContext; data: BattleData; st: BattleState; src: ChanceSource; log: LogLine[] },
  side: Side,
  to: number,
  batonPass = false,
  slot: Slot = 0,
) {
  const c = c0 as Ctx
  const sd = c.st.sides[side]
  const out = sd.mons[slotIndex(sd, slot) ?? sd.active]
  const carried = batonPass
    ? {
        boosts: { ...out.boosts },
        sub: out.volatile.substituteHp,
        seed: out.volatile.leechSeed,
        confusion: out.volatile.confusion,
        focus: out.volatile.focusEnergy,
        perish: out.volatile.perishSong,
      }
    : null
  // Leaving clears volatile state (Gen 1-2 keep toxic counter reset to plain poison).
  if (!out.fainted) {
    out.volatile = emptyVolatile()
    out.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 }
    if (out.status === 'tox' && c.ctx.generation <= 2) out.status = 'psn'
    out.toxic = 0
    if (abilitySlugOf(out) === 'natural-cure') out.status = 'healthy'
  }
  if (slot === 1) sd.active2 = to
  else sd.active = to
  const m = sd.mons[to]
  m.volatile = emptyVolatile()
  if (carried) {
    m.boosts = carried.boosts
    m.volatile.substituteHp = carried.sub
    m.volatile.leechSeed = carried.seed
    m.volatile.confusion = carried.confusion
    m.volatile.focusEnergy = carried.focus
    m.volatile.perishSong = carried.perish
  }
  if (side === 'theirs' && c.ctx.ai === 'gen1') {
    const counts =
      c.data.ai.kind === 'gen1' ? c.data.ai.classes[c.st.trainer?.classId ?? ''] : undefined
    m.aiCount = counts?.count ?? 0
    c.st.aiLayer2 = 0
  }
  line(c, 'switch', `${side === 'mine' ? 'You sent out' : 'Foe sent out'} ${name(m)}.`, side, m)
  const types = typesOf(c.ctx, m)
  const ab = abilitySlugOf(m)
  const grounded = !types.includes('flying') && ab !== 'levitate' && m.volatile.magnetRise === 0
  // Spikes: Gen 2 one layer 1/8; Gen 3-4 1/8, 1/6, 1/4.
  if (sd.spikes > 0 && grounded && ab !== 'magic-guard') {
    const frac = sd.spikes === 1 ? 8 : sd.spikes === 2 ? 6 : 4
    damageTo(c, side, m, Math.max(1, Math.floor(m.maxHp / frac)), `${name(m)} is hurt by Spikes.`)
  }
  if (sd.stealthRock && ab !== 'magic-guard' && !m.fainted) {
    const eff = typeMult('rock', typeIdsOf(c.ctx, m), c.ctx.generation)
    damageTo(
      c,
      side,
      m,
      Math.max(1, Math.floor((m.maxHp * eff) / 8)),
      `Pointed stones dig into ${name(m)}.`,
    )
  }
  if (sd.toxicSpikes > 0 && grounded && !m.fainted) {
    if (types.includes('poison')) {
      sd.toxicSpikes = 0
      line(c, 'field', `${name(m)} absorbed the Toxic Spikes.`, side)
    } else inflict(c, m, side, sd.toxicSpikes >= 2 ? 'tox' : 'psn', 'Toxic Spikes')
  }
  if (
    !m.fainted &&
    [
      'intimidate',
      'drizzle',
      'drought',
      'sand-stream',
      'snow-warning',
      'pressure',
      'mold-breaker',
      'download',
      'anticipation',
      'forewarn',
      'frisk',
      'trace',
    ].includes(ab)
  )
    m.volatile.abilityRevealed = true
  if (!m.fainted && ab === 'intimidate') {
    // Every opposing battler on the field (both foes in a double battle).
    for (const p of battlerOrder(c.st)) {
      if (p.side === side) continue
      const foe = monAt(c.st, p)
      if (foe && !foe.fainted) changeStats(c, foe, p.side, [{ stat: 'atk', delta: -1 }], true)
    }
  }
  if (!m.fainted) {
    const weatherAbility: Record<string, 'rain' | 'sun' | 'sand' | 'hail'> = {
      drizzle: 'rain',
      drought: 'sun',
      'sand-stream': 'sand',
      'snow-warning': 'hail',
    }
    const w = weatherAbility[ab]
    if (w && c.ctx.field.weathers.includes(w)) {
      c.st.weather = { kind: w, turns: -1 }
      line(c, 'field', `${name(m)}'s ${ab.replace('-', ' ')} set the weather.`, side)
    }
  }
}

function typeIdsOf(ctx: GameContext, m: MonState): number[] {
  return resolveTypesForGeneration(varietyOfSpec(m.spec), ctx.generation).map((t) => t.type_id)
}

// ----------------------------------------------------------- move execution

function canAct(c: Ctx, side: Side, m: MonState): boolean {
  const gen = c.ctx.generation
  if (m.volatile.recharging) {
    m.volatile.recharging = false
    line(c, 'info', `${name(m)} must recharge.`, side)
    return false
  }
  if (m.status === 'slp') {
    m.sleep -= 1
    if (m.sleep > 0) {
      line(c, 'info', `${name(m)} is fast asleep.`, side)
      return false
    }
    m.status = 'healthy'
    line(c, 'status', `${name(m)} woke up.`, side, m)
    if (gen === 1) return false
  }
  if (m.status === 'frz') {
    if (gen === 1) {
      line(c, 'info', `${name(m)} is frozen solid.`, side)
      return false
    }
    // Gen 2: 25/256 a turn; Gen 3-4: 20%.
    const thaw = gen === 2 ? 25 / 256 : 0.2
    if (decide(c.src, m.key, 'thaw', `${name(m)} thaws`, thaw, c.src.policies.status)) {
      m.status = 'healthy'
      line(c, 'status', `${name(m)} thawed out.`, side, m)
    } else {
      line(c, 'info', `${name(m)} is frozen solid.`, side)
      return false
    }
  }
  if (m.volatile.flinch) {
    m.volatile.flinch = false
    line(c, 'info', `${name(m)} flinched.`, side)
    return false
  }
  if (m.volatile.confusion > 0) {
    m.volatile.confusion -= 1
    if (m.volatile.confusion === 0) line(c, 'status', `${name(m)} snapped out of confusion.`, side)
    else if (
      decide(
        c.src,
        m.key,
        'confusion',
        `${name(m)} hurts itself in confusion`,
        0.5,
        c.src.policies.status,
      )
    ) {
      const atk = m.stats.atk
      const def = m.stats.def
      const dmg =
        Math.floor(
          Math.floor((Math.floor((2 * m.spec.level) / 5 + 2) * 40 * atk) / Math.max(1, def)) / 50,
        ) + 2
      damageTo(c, side, m, dmg, `${name(m)} hurt itself in its confusion.`)
      return false
    }
  }
  if (m.status === 'par') {
    const p = gen <= 2 ? 63 / 256 : 0.25
    if (decide(c.src, m.key, 'full-para', `${name(m)} fully paralyzed`, p, c.src.policies.status)) {
      line(c, 'info', `${name(m)} is fully paralyzed.`, side)
      return false
    }
  }
  if (m.volatile.attract && gen >= 2) {
    if (
      decide(c.src, m.key, 'other', `${name(m)} immobilized by love`, 0.5, c.src.policies.status)
    ) {
      line(c, 'info', `${name(m)} is immobilized by love.`, side)
      return false
    }
  }
  return true
}

function executeMove(c: Ctx, side: Side, slot: number, foeAction: Action) {
  runMoveAt(c, { side, slot: 0 }, slot, null, foeAction)
}

/**
 * One battler uses one move. In a single battle the target is the other slot-0
 * Pokemon; in a double battle it is worked out from the move's game target and the
 * reader's (or the AI's) choice -- see doubles.ts -- and a spread move runs the
 * accuracy, damage and effects below once per target.
 */
function runMoveAt(c: Ctx, atk: Pos, slot: number, chosen: Pos | null, foeAction: Action) {
  const { ctx, data } = c
  const gen = ctx.generation
  const side = atk.side
  const a = monAt(c.st, atk)
  if (!a || a.fainted) return
  let moveId = a.spec.moves[slot]
  if (a.volatile.rampage) moveId = a.volatile.rampage.moveId
  if (a.volatile.charging != null) moveId = a.volatile.charging
  if (!moveId) return
  if (!canAct(c, side, a)) {
    a.volatile.charging = null
    a.volatile.semiInvulnerable = null
    return
  }
  const move = getMove(moveId)
  const sem = moveSem(gen, data, moveId)
  const label = move?.display_name ?? `#${moveId}`
  // Two-turn moves: the first turn charges (Solar Beam fires at once in sun, Gen 2+).
  if (sem.twoTurn && a.volatile.charging == null) {
    if (!(sem.slug === 'solar-beam' && c.st.weather.kind === 'sun' && gen >= 2)) {
      a.volatile.charging = moveId
      if (sem.twoTurn !== 'charge') a.volatile.semiInvulnerable = sem.twoTurn
      if (a.pp[slot] > 0) a.pp[slot] -= 1
      line(c, 'move', `${name(a)} is charging ${label}.`, side)
      return
    }
  }
  const wasCharging = a.volatile.charging != null
  a.volatile.charging = null
  a.volatile.semiInvulnerable = null
  if (!wasCharging && !a.volatile.rampage && a.pp[slot] > 0) a.pp[slot] -= 1
  a.volatile.lastMove = moveId
  if (!a.volatile.usedMoves.includes(moveId)) a.volatile.usedMoves.push(moveId)
  line(c, 'move', `${name(a)} used ${label}.`, side)

  // ---- the two doubles-only moves (Gen 3 Cmd_trysethelpinghand / Follow Me's effect)
  if (c.st.doubles && (sem.slug === 'helping-hand' || sem.slug === 'follow-me')) {
    if (sem.slug === 'follow-me') {
      c.st.followMe = { ...(c.st.followMe ?? {}), [side]: atk.slot }
      line(c, 'status', `${name(a)} became the center of attention!`, side)
      return
    }
    const ally = partnerPos(atk)
    const hh = c.st.helpingHand ?? (c.st.helpingHand = [])
    if (standing(c.st, ally) && !hh.some((p) => samePos(p, ally))) {
      hh.push(ally)
      line(c, 'status', `${name(a)} is ready to help ${name(monAt(c.st, ally)!)}!`, side)
    } else line(c, 'info', 'But it failed!', side)
    return
  }
  if (sem.unsimulated && !sem.damaging) {
    line(c, 'warn', `${label}'s effect is not simulated (${sem.unsimulated}).`, side)
    return
  }

  // ---- moves aimed at the user or the field
  const selfOnly =
    !sem.damaging &&
    (getMove(moveId)?.target === 'user' ||
      sem.screen ||
      sem.weather ||
      sem.protect ||
      sem.substitute ||
      sem.heal != null ||
      sem.focusEnergy ||
      sem.bellyDrum ||
      sem.trickRoom ||
      sem.hazard ||
      sem.haze ||
      sem.healBell ||
      sem.pivot === 'baton-pass' ||
      sem.curse)
  if (selfOnly) {
    applySelfMove(c, side, a, sem, label, atk.slot, chosen)
    return
  }

  // ---- who it hits
  const targets = moveTargets(c, atk, moveId, chosen)
  const category = categoryOf(ctx, data, moveId)
  let last: MonState | null = null
  let anyHit = false
  if (!targets.length) line(c, 'info', 'But there was no target...', side)
  for (const t of targets) {
    if (a.fainted) break
    const d = monAt(c.st, t)!
    const dSide = t.side
    last = d
    if (d.fainted) {
      line(c, 'info', 'But there was no target...', side)
      continue
    }
    if (d.volatile.protecting) {
      line(c, 'info', `${name(d)} protected itself.`, dSide)
      continue
    }
    // ---- accuracy
    const semi = d.volatile.semiInvulnerable
    if (semi) {
      const hitsSemi =
        semi === 'fly' || semi === 'bounce'
          ? ['gust', 'twister', 'thunder', 'sky-uppercut'].includes(sem.slug)
          : semi === 'dig'
            ? ['earthquake', 'magnitude', 'fissure'].includes(sem.slug)
            : semi === 'dive'
              ? ['surf', 'whirlpool'].includes(sem.slug)
              : false
      if (!hitsSemi) {
        line(c, 'miss', `${name(d)} avoided the attack.`, dSide)
        continue
      }
    }
    const p = hitChance(ctx, data, {
      moveId,
      accStage: a.boosts.acc,
      evaStage: d.boosts.eva,
      weather: c.st.weather.kind,
      attackerAbility: abilitySlugOf(a),
      targetAbility: abilitySlugOf(d),
      targetItemId: d.itemId,
      physical: category === 'physical',
      sureHit: a.volatile.xAccuracy || a.volatile.lockOn > 0,
    })
    if (sem.ohko) {
      const lvlOk =
        gen === 1 ? speedOf(c, a, side) >= speedOf(c, d, dSide) : a.spec.level >= d.spec.level
      const pOhko =
        gen === 1 ? p : lvlOk ? Math.min(1, (30 + a.spec.level - d.spec.level) / 100) : 0
      if (
        !lvlOk ||
        !decide(c.src, a.key, 'miss', `${label} hits`, pOhko, invert(c.src.policies.miss))
      ) {
        line(c, 'miss', `${name(a)}'s ${label} missed.`, side)
        continue
      }
      damageTo(c, dSide, d, d.hp, `It's a one-hit KO!`)
      anyHit = true
      continue
    }
    if (p < 1 && decide(c.src, a.key, 'miss', `${label} misses`, 1 - p, c.src.policies.miss)) {
      line(c, 'miss', `${name(a)}'s attack missed.`, side)
      if ((sem.slug === 'jump-kick' || sem.slug === 'high-jump-kick') && gen >= 1) {
        damageTo(
          c,
          side,
          a,
          gen === 1 ? 1 : Math.max(1, Math.floor(a.maxHp / 8)),
          `${name(a)} kept going and crashed.`,
        )
      }
      if (sem.selfDestruct && targets.length === 1)
        damageTo(c, side, a, a.hp, `${name(a)} exploded.`)
      continue
    }
    // ---- damage
    let total = 0
    if (sem.damaging) {
      const tAction = c.actions?.get(posKey(t)) ?? foeAction
      total = dealDamage(c, side, a, d, moveId, sem, category, label, tAction, dSide, atk, t)
      if (total < 0) continue
    }
    anyHit = true
    // ---- secondary / primary effects on the target
    if (!d.fainted || sem.damaging === false)
      applyFoeEffects(c, side, a, d, sem, label, total, dSide, atk.slot)
  }
  // The user of Explosion / Self-Destruct faints once it has hit (singles, as
  // before) -- or, in a double battle, once the move was used at all.
  if (sem.selfDestruct && !a.fainted && (anyHit || (c.st.doubles && targets.length > 0)))
    damageTo(
      c,
      side,
      a,
      a.hp,
      anyHit ? `${name(a)} fainted from the blast.` : `${name(a)} exploded.`,
    )
  if (anyHit && last && sem.recharge && !last.fainted && !(gen === 1 && last.fainted))
    a.volatile.recharging = true
  if (anyHit && last && sem.recharge && gen === 1 && last.fainted) a.volatile.recharging = false
}

/**
 * The battlers a move hits. Singles: the foe. Doubles: by the move's game target
 * (doubles.ts), after Follow Me and the redirecting abilities.
 */
function moveTargets(c: Ctx, atk: Pos, moveId: number, chosen: Pos | null): Pos[] {
  const st = c.st
  const foeSlot0: Pos = { side: other(atk.side), slot: 0 }
  if (!st.doubles) return [foeSlot0]
  const gm = gameMove(c.data, moveId)
  const kind = targetKind(gm)
  const a = monAt(st, atk)!
  const speedOrder = c.speedOrder ?? battlerOrder(st)
  if (kind === 'both-foes' || kind === 'all-adjacent')
    return spreadTargets(c.ctx, st, atk, kind, speedOrder)
  if (kind === 'ally') {
    const ally = partnerPos(atk)
    return standing(st, ally) ? [ally] : []
  }
  if (kind === 'depends') {
    // Counter / Mirror Coat / Bide: whoever last hit this battler with the right kind.
    const by = a.volatile.counterDamage?.by
    if (by && by.side !== atk.side && standing(st, by)) return [by]
    const foes = standingFoes(st, atk)
    return foes.length ? [foes[0]] : []
  }
  const first = standingFoes(st, atk)[0] ?? foeSlot0
  let target = chosen ?? first
  if (kind === 'random') {
    const foes = standingFoes(st, atk)
    if (!foes.length) return []
    target =
      foes.length > 1 && c.src.policies.status === 'random' ? foes[c.src.rng.int(2)] : foes[0]
  }
  const typeName = gm?.t ?? 'normal'
  const t = redirectSingle(
    c.ctx,
    st,
    atk,
    target,
    { type: typeName, kind: kind === 'random' ? 'random' : 'single' },
    abilitySlugOf(a),
    (p) => abilitySlugOf(monAt(st, p)!),
    speedOrder,
    c.turnOrder ?? battlerOrder(st),
  )
  return t ? [t] : []
}

const invert = (p: 'never' | 'always' | 'random') =>
  p === 'never' ? 'always' : p === 'always' ? 'never' : 'random'

function dealDamage(
  c: Ctx,
  side: Side,
  a: MonState,
  d: MonState,
  moveId: number,
  sem: MoveSem,
  category: string,
  label: string,
  foeAction: Action,
  dSide: Side = other(side),
  atkPos?: Pos,
  defPos?: Pos,
): number {
  const { ctx, data } = c
  const gen = ctx.generation
  const by = atkPos
  // Fixed-damage moves.
  if (sem.fixed != null || sem.counter) {
    let dmg = 0
    if (sem.fixed === 'level') dmg = a.spec.level
    else if (typeof sem.fixed === 'number') dmg = sem.fixed
    else if (sem.fixed === 'half-hp') dmg = Math.max(1, Math.floor(d.hp / 2))
    else if (sem.fixed === 'psywave')
      dmg = Math.max(
        1,
        Math.floor(
          a.spec.level *
            (c.src.policies.roll === 'max' ? 1.5 : c.src.policies.roll === 'min' ? 0.5 : 1),
        ),
      )
    else if (sem.counter) {
      const last = a.volatile.counterDamage
      if (!last || (gen >= 2 && last.category !== sem.counter) || last.amount === 0) {
        line(c, 'miss', `${label} failed.`, side)
        return -1
      }
      dmg = last.amount * 2
    }
    const eff = typeMult(gameMove(data, moveId)?.t ?? 'normal', typeIdsOf(ctx, d), gen)
    if (eff === 0 && gen >= 2 && sem.fixed !== 'level') {
      line(c, 'info', `It doesn't affect ${name(d)}.`, dSide)
      return -1
    }
    applyHit(c, dSide, d, dmg, label, category, moveId, by)
    return dmg
  }
  const ability = abilitySlugOf(a)
  const counts = hitCounts(
    ctx,
    sem.slug,
    getMove(moveId)?.meta?.min_hits ?? null,
    getMove(moveId)?.meta?.max_hits ?? null,
    ability,
  )
  let hits = counts[0].hits
  if (counts.length > 1) {
    if (c.src.policies.roll === 'random' || c.src.policies.secondary === 'random') {
      let r = c.src.rng.next()
      for (const h of counts) {
        if (r < h.p) {
          hits = h.hits
          break
        }
        r -= h.p
      }
    } else
      hits =
        c.src.policies.roll === 'max'
          ? counts[counts.length - 1].hits
          : c.src.policies.roll === 'min'
            ? counts[0].hits
            : 3
    c.src.events.push({
      turn: c.st.turn,
      who: a.key,
      kind: 'multi-hit',
      label: `${label} hit ${hits} times`,
      p: counts.find((h) => h.hits === hits)?.p ?? 1,
      happened: true,
    })
  }
  const cc = critChance(
    ctx,
    data,
    {
      moveId,
      baseSpeed: baseSpeedOf(a, gen),
      speciesSlug: a.spec.varietyName.split('-')[0],
      itemId: a.itemId,
      abilitySlug: ability,
      focusEnergy: a.volatile.focusEnergy,
      targetBlocks: gen >= 3 && ['battle-armor', 'shell-armor'].includes(abilitySlugOf(d)),
      luckyChant: c.st.sides[dSide].luckyChant > 0,
    },
    sem.slug,
  )
  const switching = foeAction.kind === 'switch'
  // Doubles: name both battlers and the formula's double-battle inputs.
  const at: DamageAt | undefined =
    c.st.doubles && atkPos && defPos
      ? {
          attacker: a,
          defender: d,
          defenderSide: dSide,
          doubles: doublesField(c.st, data, atkPos, defPos, moveId),
        }
      : undefined
  const normal = engineDamage(ctx, c.st, side, moveId, false, hits, switching, at)
  if (!normal) {
    line(c, 'warn', `${label}: damage not calculated.`, side)
    return -1
  }
  if (normal.noDamageReason === 'immune' || normal.noDamageReason === 'ability') {
    line(c, 'info', `It doesn't affect ${name(d)}.`, dSide)
    return -1
  }
  if (normal.noDamageReason === 'variable') {
    line(c, 'warn', `${label}: damage not calculated by the engine.`, side)
    return -1
  }
  const crit = cc > 0 ? engineDamage(ctx, c.st, side, moveId, true, hits, switching, at) : null
  let total = 0
  const critOnce =
    gen === 1 ? decide(c.src, a.key, 'crit', `${label} crits`, cc, c.src.policies.crit) : false
  for (let h = 0; h < hits; h++) {
    if (d.fainted) break
    const isCrit =
      gen === 1
        ? critOnce
        : decide(c.src, a.key, 'crit', `${label} crits (hit ${h + 1})`, cc, c.src.policies.crit)
    const r = isCrit && crit ? crit : normal
    const rolls = rollsOf(r, gen === 1 ? 0 : h)
    const idx = gen === 1 && h > 0 ? -1 : pickRoll(c.src, rolls.length)
    const dmg = gen === 1 && h > 0 ? lastGen1 : rolls[idx]
    if (gen === 1) lastGen1 = dmg
    if (c.src.policies.roll === 'random' && rolls.length > 1) {
      c.src.events.push({
        turn: c.st.turn,
        who: a.key,
        kind: 'roll',
        label: `${label} roll ${idx + 1}/${rolls.length}`,
        p: 1 / rolls.length,
        happened: true,
      })
    }
    if (isCrit) line(c, 'crit', 'A critical hit!', side)
    applyHit(c, dSide, d, dmg, label, categoryOf(ctx, data, moveId), moveId, by)
    total += dmg
  }
  if (hits > 1) line(c, 'info', `Hit ${hits} times.`, side)
  if (normal.effectiveness > 1) line(c, 'info', "It's super effective!", dSide)
  else if (normal.effectiveness < 1 && normal.effectiveness > 0)
    line(c, 'info', "It's not very effective...", dSide)
  c.dealt[side] += total
  // Drain / recoil.
  if (sem.drain && total > 0) {
    const amt = Math.max(1, Math.floor(total * Math.abs(sem.drain)))
    if (sem.drain > 0) healTo(c, side, a, amt, `${name(d)} had its energy drained.`)
    else if (abilitySlugOf(a) !== 'rock-head' && abilitySlugOf(a) !== 'magic-guard')
      damageTo(c, side, a, amt, `${name(a)} is hit with recoil.`)
  }
  if (sem.rampage && !a.volatile.rampage)
    a.volatile.rampage = {
      moveId,
      turns: 1 + (c.src.policies.status === 'random' ? c.src.rng.int(2) : 1),
    }
  else if (a.volatile.rampage) {
    a.volatile.rampage.turns -= 1
    if (a.volatile.rampage.turns <= 0) {
      a.volatile.rampage = null
      if (gen >= 2) inflict(c, a, side, 'confusion', 'fatigue')
    }
  }
  // Choice items lock the move (Gen 3+).
  const held = heldEffect(data, a.itemId)?.h
  if (held && /CHOICE/.test(held)) a.volatile.choiceLock = moveId
  return total
}
let lastGen1 = 0

function baseSpeedOf(m: MonState, gen: number): number {
  const v = varietyOfSpec(m.spec)
  const key = 'speed'
  void gen
  return v.stats.find((s) => s.stat === key)?.base_stat ?? 0
}

/** One attacking type against a typing, in the generation's chart. */
export function typeMult(attackType: string, defendingTypeIds: number[], gen: number): number {
  return (
    typeEffectivenessAgainst(defendingTypeIds, gen).find((e) => e.type.name === attackType)
      ?.multiplier ?? 1
  )
}

function applyHit(
  c: Ctx,
  side: Side,
  d: MonState,
  dmg: number,
  label: string,
  category: string,
  moveId: number,
  by?: Pos,
) {
  // A substitute absorbs it.
  if (d.volatile.substituteHp > 0) {
    d.volatile.substituteHp = Math.max(0, d.volatile.substituteHp - dmg)
    line(
      c,
      'damage',
      d.volatile.substituteHp > 0
        ? `The substitute took the hit.`
        : `${name(d)}'s substitute broke.`,
      side,
    )
    return
  }
  // Focus Sash (Gen 4): survive a hit from full HP.
  const held = heldEffect(c.data, d.itemId)?.h
  if (c.ctx.generation === 4 && held === 'HOLD_EFFECT_ENDURE' && d.hp === d.maxHp && dmg >= d.hp) {
    dmg = d.hp - 1
    d.consumedItem = d.itemId
    d.itemId = null
    line(c, 'item', `${name(d)} hung on using its Focus Sash.`, side)
  }
  d.volatile.lastDamageTaken = { amount: Math.min(dmg, d.hp), category, moveId }
  d.volatile.counterDamage = {
    amount: (d.volatile.counterDamage?.amount ?? 0) + Math.min(dmg, d.hp),
    category,
    ...(by ? { by } : {}),
  }
  damageTo(
    c,
    side,
    d,
    dmg,
    `${label} dealt ${Math.min(dmg, d.hp)} (${((100 * Math.min(dmg, d.hp)) / d.maxHp).toFixed(1)}%).`,
  )
  // Pinch berries.
  if (!d.fainted && d.itemId != null) berryCheck(c, side, d)
}

function berryCheck(c: Ctx, side: Side, m: MonState) {
  const held = heldEffect(c.data, m.itemId)
  if (!held) return
  const isHpBerry =
    held.h === 'HELD_BERRY' ||
    held.h === 'HOLD_EFFECT_RESTORE_HP' ||
    held.h === 'HOLD_EFFECT_HP_RESTORE'
  const threshold = c.ctx.generation === 2 ? m.maxHp / 2 : m.maxHp / 2
  if (isHpBerry && m.hp <= threshold) {
    const amt = held.v
    m.consumedItem = m.itemId
    m.itemId = null
    healTo(c, side, m, amt, `${name(m)} ate its berry.`)
  }
}

function applyFoeEffects(
  c: Ctx,
  side: Side,
  a: MonState,
  d: MonState,
  sem: MoveSem,
  label: string,
  dealt: number,
  dSide: Side = other(side),
  aSlot: Slot = 0,
) {
  const subBlocks = d.volatile.substituteHp > 0 && sem.damaging
  if (sem.ailment && !d.fainted) {
    const k = sem.ailment.kind
    if (!(subBlocks && k !== 'flinch')) {
      const primary = sem.ailment.chance >= 1
      const can = canBeStatused(c, d, dSide, k)
      if (!can && primary) line(c, 'info', `${label} had no effect on ${name(d)}.`, dSide)
      // Status moves of the immune type fail outright (Thunder Wave on Ground).
      else if (
        can &&
        (primary ||
          decide(
            c.src,
            a.key,
            'secondary',
            `${label}: ${k} (${(sem.ailment.chance * 100).toFixed(1)}%)`,
            sem.ailment.chance,
            c.src.policies.secondary,
          ))
      ) {
        if (!(
          primary &&
          !sem.damaging &&
          k === 'par' &&
          typesOf(c.ctx, d).includes('ground') &&
          /THUNDER_WAVE|PARALYZE/.test(sem.effect) &&
          sem.slug === 'thunder-wave'
        ))
          inflict(c, d, dSide, k, label)
        else line(c, 'info', `It doesn't affect ${name(d)}.`, dSide)
      }
    }
  }
  if (sem.stats && !d.fainted) {
    const target = sem.stats.target === 'self' ? a : d
    const tSide = sem.stats.target === 'self' ? side : dSide
    if (sem.stats.target === 'self' || !subBlocks) {
      const happens =
        sem.stats.chance >= 1 ||
        decide(
          c.src,
          a.key,
          'secondary',
          `${label}: stat change (${(sem.stats.chance * 100).toFixed(1)}%)`,
          sem.stats.chance,
          c.src.policies.secondary,
        )
      if (happens) changeStats(c, target, tSide, sem.stats.changes, sem.stats.target === 'foe')
    }
  } else if (sem.stats && sem.stats.target === 'self' && !a.fainted) {
    changeStats(c, a, side, sem.stats.changes, false)
  }
  if (sem.leechSeed && !d.fainted) {
    if (typesOf(c.ctx, d).includes('grass') || d.volatile.leechSeed)
      line(c, 'info', `${name(d)} evaded the seed.`, dSide)
    else {
      d.volatile.leechSeed = true
      d.volatile.leechSeedSlot = aSlot
      line(c, 'status', `${name(d)} was seeded.`, dSide)
    }
  }
  if (sem.forceSwitch && !d.fainted) {
    const sd = c.st.sides[dSide]
    const choices = sd.mons
      .map((m, i) => (m.fainted || onField(sd, i) ? -1 : i))
      .filter((i) => i >= 0)
    if (choices.length) {
      const pick = choices[c.src.policies.status === 'random' ? c.src.rng.int(choices.length) : 0]
      switchIn(c, dSide, pick, false, slotOfMon(c.st, dSide, d))
    } else line(c, 'info', 'But it failed!', side)
  }
  if (sem.trap && !d.fainted && !d.volatile.trapped)
    d.volatile.trapped = { turns: 4, moveId: sem.moveId }
  if (sem.meanLook) d.volatile.meanLook = true
  if (sem.encore && d.volatile.lastMove)
    d.volatile.encore = { moveId: d.volatile.lastMove, turns: 3 }
  if (sem.disable && d.volatile.lastMove)
    d.volatile.disable = { moveId: d.volatile.lastMove, turns: 4 }
  if (sem.taunt) d.volatile.taunt = 3
  if (sem.yawn && d.status === 'healthy') d.volatile.yawn = 2
  if (sem.perishSong) {
    if (!a.volatile.perishSong) a.volatile.perishSong = 4
    if (!d.volatile.perishSong) d.volatile.perishSong = 4
    // Doubles: every battler on the field hears it.
    for (const q of c.st.doubles ? battlerOrder(c.st) : []) {
      const m = monAt(c.st, q)
      if (m && !m.fainted && !m.volatile.perishSong) m.volatile.perishSong = 4
    }
    line(c, 'status', 'All Pokemon hearing the song will faint in three turns.', side)
  }
  if (sem.painSplit) {
    const avg = Math.floor((a.hp + d.hp) / 2)
    a.hp = Math.min(a.maxHp, avg)
    d.hp = Math.min(d.maxHp, avg)
    line(c, 'info', 'The battlers shared their pain.', side)
  }
  if (sem.destinyBond) a.volatile.destinyBond = true
  if (sem.rapidSpin && !a.fainted) {
    const sd = c.st.sides[side]
    sd.spikes = 0
    sd.toxicSpikes = 0
    sd.stealthRock = false
    a.volatile.leechSeed = false
    a.volatile.trapped = null
  }
  if (sem.pivot === 'u-turn' && !a.fainted && dealt > 0) {
    // The switch target is chosen by the caller (the reader, or the AI) -- flag it.
    markPending(c, side, aSlot)
    line(c, 'switch', `${name(a)} went back.`, side)
  }
  if (d.fainted && dealt > 0 && d.volatile.destinyBond)
    damageTo(c, side, a, a.hp, `${name(d)} took ${name(a)} down with it.`)
  if (sem.unsimulated && sem.damaging)
    line(c, 'warn', `${label}'s extra effect is not simulated (${sem.unsimulated}).`, side)
}

function applySelfMove(
  c: Ctx,
  side: Side,
  a: MonState,
  sem: MoveSem,
  label: string,
  aSlot: Slot = 0,
  chosen: Pos | null = null,
) {
  const gen = c.ctx.generation
  const sd = c.st.sides[side]
  const foeSide = other(side)
  const turns = (base: number) =>
    heldEffect(c.data, a.itemId)?.h === 'HOLD_EFFECT_EXTEND_SCREENS' ? 8 : base
  if (sem.protect) {
    const chainOk =
      a.volatile.protectChain === 0 ||
      decide(
        c.src,
        a.key,
        'other',
        `${label} succeeds again`,
        1 / Math.pow(gen <= 2 ? 3 : 2, a.volatile.protectChain),
        c.src.policies.status,
      )
    if (chainOk) {
      a.volatile.protecting = true
      a.volatile.protectChain += 1
      line(c, 'status', `${name(a)} protected itself.`, side)
    } else {
      a.volatile.protectChain = 0
      line(c, 'info', 'But it failed!', side)
    }
    return
  }
  a.volatile.protectChain = 0
  if (sem.screen) {
    const key = {
      reflect: 'reflect',
      'light-screen': 'lightScreen',
      safeguard: 'safeguard',
      mist: 'mist',
      'lucky-chant': 'luckyChant',
      tailwind: 'tailwind',
    }[sem.screen] as 'reflect'
    if ((sd[key] as number) > 0) {
      line(c, 'info', 'But it failed!', side)
      return
    }
    ;(sd as unknown as Record<string, number>)[key] =
      sem.screen === 'reflect' || sem.screen === 'light-screen'
        ? turns(5)
        : sem.screen === 'tailwind'
          ? 3
          : 5
    line(c, 'field', `${label} protects ${side === 'mine' ? 'your' : "the foe's"} side.`, side)
    return
  }
  if (sem.weather) {
    if (!c.ctx.field.weathers.includes(sem.weather) || c.st.weather.kind === sem.weather) {
      line(c, 'info', 'But it failed!', side)
      return
    }
    const rock: Record<string, string> = {
      sun: 'HOLD_EFFECT_EXTEND_SUN',
      rain: 'HOLD_EFFECT_EXTEND_RAIN',
      sand: 'HOLD_EFFECT_EXTEND_SANDSTORM',
      hail: 'HOLD_EFFECT_EXTEND_HAIL',
    }
    c.st.weather = {
      kind: sem.weather,
      turns: heldEffect(c.data, a.itemId)?.h === rock[sem.weather] ? 8 : 5,
    }
    line(c, 'field', `The weather changed (${sem.weather}).`, side)
    return
  }
  if (sem.hazard) {
    const fs = c.st.sides[foeSide]
    if (sem.hazard === 'spikes') {
      if (fs.spikes >= c.ctx.field.maxSpikes) return line(c, 'info', 'But it failed!', side)
      fs.spikes += 1
    } else if (sem.hazard === 'toxic-spikes') {
      if (fs.toxicSpikes >= 2) return line(c, 'info', 'But it failed!', side)
      fs.toxicSpikes += 1
    } else {
      if (fs.stealthRock) return line(c, 'info', 'But it failed!', side)
      fs.stealthRock = true
    }
    line(c, 'field', `${label} was set on the foe's side.`, side)
    return
  }
  if (sem.substitute) {
    const cost = Math.floor(a.maxHp / 4)
    if (a.volatile.substituteHp > 0 || a.hp <= cost) return line(c, 'info', 'But it failed!', side)
    a.hp -= cost
    a.volatile.substituteHp = cost + (gen === 1 ? 1 : 0)
    line(c, 'status', `${name(a)} made a substitute.`, side, a)
    return
  }
  if (sem.heal != null) {
    if (sem.heal === 'rest') {
      if (a.hp === a.maxHp) return line(c, 'info', 'But it failed!', side)
      a.status = 'slp'
      a.sleep = gen === 1 ? 2 : gen === 2 ? 3 : 3
      a.hp = a.maxHp
      line(c, 'status', `${name(a)} slept and became healthy.`, side, a)
      return
    }
    let frac = typeof sem.heal === 'number' ? sem.heal : 0.5
    if (sem.heal === 'weather') {
      const w = c.st.weather.kind
      frac = w === 'sun' ? 2 / 3 : w ? 0.25 : 0.5
      if (gen === 2) frac = w === 'sun' ? 1 : w ? 0.25 : 0.5
    }
    if (a.hp === a.maxHp) return line(c, 'info', 'But it failed!', side)
    healTo(c, side, a, Math.floor(a.maxHp * frac), `${name(a)} regained health.`)
    return
  }
  if (sem.focusEnergy) {
    a.volatile.focusEnergy = true
    line(c, 'status', `${name(a)} is getting pumped.`, side)
    return
  }
  if (sem.bellyDrum) {
    if (a.hp <= Math.floor(a.maxHp / 2)) return line(c, 'info', 'But it failed!', side)
    a.hp -= Math.floor(a.maxHp / 2)
    a.boosts.atk = 6
    line(c, 'status', `${name(a)} cut its HP and maximized Attack.`, side, a)
    return
  }
  if (sem.curse) {
    if (typesOf(c.ctx, a).includes('ghost')) {
      // The chosen foe in doubles (the other one when it is gone), the foe in singles.
      const pick = c.st.doubles
        ? chosen && chosen.side === foeSide && standing(c.st, chosen)
          ? chosen
          : standingFoes(c.st, { side, slot: aSlot })[0]
        : null
      const foe = pick ? monAt(c.st, pick)! : activeMon(c.st, foeSide)
      a.hp = Math.max(0, a.hp - Math.floor(a.maxHp / 2))
      foe.volatile.cursed = true
      line(c, 'status', `${name(a)} cut its HP and laid a curse.`, side, a)
      checkFaint(c, side, a)
    } else
      changeStats(
        c,
        a,
        side,
        [
          { stat: 'atk', delta: 1 },
          { stat: 'def', delta: 1 },
          { stat: 'spe', delta: -1 },
        ],
        false,
      )
    return
  }
  if (sem.haze) {
    for (const q of battlerOrder(c.st)) {
      const s = q.side
      const m = monAt(c.st, q)
      if (!m) continue
      m.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 }
      if (gen === 1 && s !== side) {
        if (m.status !== 'healthy' && m.status !== 'slp' && m.status !== 'frz') {
          /* Gen 1 Haze cures the target's non-volatile status (pokered HazeEffect) */
        }
        m.status = 'healthy'
        m.volatile.confusion = 0
        m.volatile.leechSeed = false
      }
    }
    line(c, 'field', 'All stat changes were eliminated.', side)
    return
  }
  if (sem.healBell) {
    for (const m of sd.mons) m.status = 'healthy'
    line(c, 'status', 'A bell chimed: the team is cured.', side)
    return
  }
  if (sem.trickRoom) {
    c.st.trickRoom = c.st.trickRoom > 0 ? 0 : 5
    line(
      c,
      'field',
      c.st.trickRoom
        ? 'The dimensions were twisted.'
        : 'The twisted dimensions returned to normal.',
      side,
    )
    return
  }
  if (sem.pivot === 'baton-pass') {
    if (c.st.doubles ? !hasBench(c.st, side) : aliveCount(sd) <= 1)
      return line(c, 'info', 'But it failed!', side)
    markPending(c, side, aSlot)
    ;(a.volatile as unknown as { batonPass?: boolean }).batonPass = true
    line(c, 'switch', `${name(a)} is passing its boosts.`, side)
    return
  }
  if (sem.stats) changeStats(c, a, side, sem.stats.changes, false)
  else if (sem.unsimulated)
    line(c, 'warn', `${label}'s effect is not simulated (${sem.unsimulated}).`, side)
}

// ----------------------------------------------------------------- items

const ITEM_EFFECTS: Record<
  string,
  {
    heal?: number | 'full'
    cure?: boolean
    stat?: BoostKey
    crit?: boolean
    mist?: boolean
    acc?: boolean
  }
> = {
  potion: { heal: 20 },
  'super-potion': { heal: 50 },
  'hyper-potion': { heal: 200 },
  'max-potion': { heal: 'full' },
  'full-restore': { heal: 'full', cure: true },
  'full-heal': { cure: true },
  'x-attack': { stat: 'atk' },
  'x-defense': { stat: 'def' },
  'x-speed': { stat: 'spe' },
  'x-sp-atk': { stat: 'spa' },
  'x-sp-def': { stat: 'spd' },
  'x-accuracy': { acc: true },
  'dire-hit': { crit: true },
  'guard-spec': { mist: true },
}

export function applyItem(
  c0: { ctx: GameContext; data: BattleData; st: BattleState; src: ChanceSource; log: LogLine[] },
  side: Side,
  itemId: number,
  slot: Slot = 0,
) {
  const c = c0 as Ctx
  const m = monAt(c.st, { side, slot }) ?? activeMon(c.st, side)
  const sd = c.st.sides[side]
  const i = sd.bag.indexOf(itemId)
  if (i >= 0) sd.bag.splice(i, 1)
  // Gen 1: an item use spends one of this Pokemon's class AI uses (DecrementAICount).
  if (c.ctx.ai === 'gen1' && side === 'theirs') m.aiCount -= 1
  const slug = getItemSlug(itemId)
  const eff = ITEM_EFFECTS[slug]
  line(
    c,
    'item',
    `${side === 'theirs' ? 'The foe' : 'You'} used ${slug.replace(/-/g, ' ')} on ${name(m)}.`,
    side,
  )
  if (!eff) return
  if (eff.cure) {
    m.status = 'healthy'
    m.volatile.confusion =
      c.ctx.generation === 2 && slug === 'full-restore' ? 0 : m.volatile.confusion
  }
  if (eff.heal)
    healTo(c, side, m, eff.heal === 'full' ? m.maxHp : eff.heal, `${name(m)} recovered HP.`)
  if (eff.stat)
    changeStats(
      c,
      m,
      side,
      [
        {
          stat: c.ctx.generation === 1 && eff.stat === 'spd' ? 'spa' : eff.stat,
          delta: c.ctx.generation >= 4 ? 1 : 1,
        },
      ],
      false,
    )
  if (eff.crit) m.volatile.focusEnergy = true
  if (eff.mist) sd.mist = 5
  if (eff.acc) m.volatile.xAccuracy = true
}

const getItemSlug = (id: number) => getItem(id)?.name ?? ''

// ---------------------------------------------------------------- residual

function endOfTurn(c: Ctx) {
  const gen = c.ctx.generation
  const r = c.ctx.residual
  const frac = (m: MonState, [n, d]: [number, number]) => Math.max(1, Math.floor((m.maxHp * n) / d))
  // Every battler on the field, in battler order (player, foe; then the right slots).
  const order = battlerOrder(c.st)
  // Weather damage.
  const w = c.st.weather.kind
  if (w === 'sand' || w === 'hail') {
    for (const q of order) {
      const s = q.side
      const m = monAt(c.st, q)
      if (!m || m.fainted) continue
      const types = typesOf(c.ctx, m)
      const ab = abilitySlugOf(m)
      const immune =
        w === 'sand'
          ? types.some((t) => ['rock', 'ground', 'steel'].includes(t)) || ab === 'sand-veil'
          : types.includes('ice') || ab === 'ice-body' || ab === 'snow-cloak'
      const f = w === 'sand' ? r.sand : r.hail
      if (!immune && f && ab !== 'magic-guard' && !m.volatile.semiInvulnerable)
        damageTo(
          c,
          s,
          m,
          frac(m, f),
          `${name(m)} is buffeted by the ${w === 'sand' ? 'sandstorm' : 'hail'}.`,
        )
    }
  }
  for (const q of order) {
    const s = q.side
    const m = monAt(c.st, q)
    if (!m || m.fainted) continue
    const ab = abilitySlugOf(m)
    const held = heldEffect(c.data, m.itemId)?.h
    if (
      r.leftovers &&
      (held === 'HELD_LEFTOVERS' ||
        held === 'HOLD_EFFECT_LEFTOVERS' ||
        held === 'HOLD_EFFECT_HP_RESTORE_GRADUAL') &&
      m.hp < m.maxHp
    ) {
      healTo(c, s, m, frac(m, r.leftovers), `${name(m)} restored HP with Leftovers.`)
      m.volatile.itemRevealed = true
    }
    if (m.volatile.leechSeed && ab !== 'magic-guard') {
      // The seed drains to whoever stands in the planter's place.
      const foe =
        monAt(c.st, { side: other(s), slot: m.volatile.leechSeedSlot ?? 0 }) ??
        activeMon(c.st, other(s))
      let amt = frac(m, r.leechSeed)
      if (gen === 1 && m.status === 'tox')
        amt = Math.max(1, Math.floor((m.maxHp * Math.max(1, m.toxic)) / 16))
      amt = Math.min(amt, m.hp)
      damageTo(c, s, m, amt, `${name(m)}'s health is sapped by Leech Seed.`)
      if (!foe.fainted) healTo(c, other(s), foe, amt, `${name(foe)} absorbed HP.`)
    }
    if (m.fainted || ab === 'magic-guard') continue
    if (m.status === 'psn') damageTo(c, s, m, frac(m, r.poison), `${name(m)} is hurt by poison.`)
    if (m.status === 'tox') {
      m.toxic = Math.min(15, m.toxic + 1)
      damageTo(
        c,
        s,
        m,
        Math.max(1, Math.floor((m.maxHp * m.toxic) / r.toxicDenom)),
        `${name(m)} is hurt by poison.`,
      )
    }
    if (m.status === 'brn') damageTo(c, s, m, frac(m, r.burn), `${name(m)} is hurt by its burn.`)
    if (m.volatile.nightmare && m.status === 'slp')
      damageTo(c, s, m, frac(m, [1, 4]), `${name(m)} is locked in a nightmare.`)
    if (m.volatile.cursed)
      damageTo(c, s, m, frac(m, [1, 4]), `${name(m)} is afflicted by the curse.`)
    if (m.volatile.trapped) {
      m.volatile.trapped.turns -= 1
      damageTo(
        c,
        s,
        m,
        frac(m, gen <= 2 ? [1, 16] : [1, 16]),
        `${name(m)} is hurt by the binding move.`,
      )
      if (m.volatile.trapped.turns <= 0) m.volatile.trapped = null
    }
    if (m.volatile.perishSong > 0) {
      m.volatile.perishSong -= 1
      if (m.volatile.perishSong === 0)
        damageTo(c, s, m, m.hp, `${name(m)}'s perish count fell to 0.`)
    }
    if (m.volatile.yawn > 0) {
      m.volatile.yawn -= 1
      if (m.volatile.yawn === 0) inflict(c, m, s, 'slp', 'Yawn')
    }
  }
  // Timers.
  for (const s of ['mine', 'theirs'] as Side[]) {
    const sd = c.st.sides[s]
    for (const k of [
      'reflect',
      'lightScreen',
      'safeguard',
      'mist',
      'tailwind',
      'luckyChant',
    ] as const) {
      if (sd[k] > 0) {
        sd[k] -= 1
        if (sd[k] === 0)
          line(c, 'field', `${s === 'mine' ? 'Your' : "The foe's"} ${k} wore off.`, s)
      }
    }
  }
  for (const q of order) {
    const m = monAt(c.st, q)
    if (!m) continue
    m.volatile.protecting = false
    m.volatile.turnsOut += 1
    m.volatile.firstTurn = false
    if (m.volatile.slowStartTurns > 0) m.volatile.slowStartTurns -= 1
    if (m.volatile.taunt > 0) m.volatile.taunt -= 1
    if (m.volatile.encore) m.volatile.encore.turns -= 1
    if (m.volatile.encore && m.volatile.encore.turns <= 0) m.volatile.encore = null
    if (m.volatile.disable) m.volatile.disable.turns -= 1
    if (m.volatile.disable && m.volatile.disable.turns <= 0) m.volatile.disable = null
    if (m.volatile.lockOn > 0) m.volatile.lockOn -= 1
  }
  if (c.st.weather.turns > 0) {
    c.st.weather.turns -= 1
    if (c.st.weather.turns === 0) {
      line(c, 'field', 'The weather returned to normal.')
      c.st.weather = { kind: null, turns: 0 }
    }
  }
  if (c.st.trickRoom > 0) c.st.trickRoom -= 1
  if (c.st.gravity > 0) c.st.gravity -= 1
}

// ------------------------------------------------------------------- turn

export function resolveTurn(
  ctx: GameContext,
  data: BattleData,
  state: BattleState,
  actions: Record<Side, Action>,
  src: ChanceSource,
): TurnResult {
  const st = cloneState(state)
  st.turn += 1
  src.turn = st.turn
  const c: Ctx = { ctx, data, st, src, log: [], dealt: { mine: 0, theirs: 0 } }
  for (const s of ['mine', 'theirs'] as Side[]) activeMon(st, s).volatile.counterDamage = null
  const sides = order(c, actions)
  for (const s of sides) {
    if (st.winner) break
    const act = actions[s]
    const m = activeMon(st, s)
    if (m.fainted && act.kind !== 'switch') continue
    if (act.kind === 'switch') {
      // Pursuit on a switching target hits first (Gen 2+) -- handled through the foe's move damage flag.
      switchIn(c, s, act.to)
    } else if (act.kind === 'item') {
      applyItem(c, s, act.itemId)
    } else if (act.kind === 'move') {
      executeMove(c, s, act.slot, actions[other(s)])
    }
  }
  if (!st.winner) endOfTurn(c)
  if (ctx.ai === 'gen1') st.aiLayer2 += 1
  return { state: st, log: c.log, dealt: c.dealt }
}

// ------------------------------------------------------------ doubles turn

/**
 * The order four battlers act in, each generation's own way:
 *   Gen 3 pokeemerald SetActionsAndBattlersTurnOrder: items and switches first, in
 *     battler order; then the rest, sorted pairwise with GetWhoStrikesFirst (move
 *     priority, then speed; a tie is a coin flip per comparison). Quick Claw is one
 *     roll a turn for every holder (gRandomTurnNumber).
 *   Gen 4 pokeplatinum BattleControllerPlayer_CalcTurnOrder: items and switches
 *     first, then Fight; battlers that chose the SAME command are sorted pairwise
 *     with BattleSystem_CompareBattlerSpeed (priority only between two Fights;
 *     Quick Claw rolled per battler; Trick Room reverses speed).
 */
function orderDoubles(c: Ctx, acts: { p: Pos; a: Action }[]): Pos[] {
  const gen = c.ctx.generation
  const isFight = (a: Action) => a.kind === 'move' || a.kind === 'none'
  const list = [...acts.filter((x) => !isFight(x.a)), ...acts.filter((x) => isFight(x.a))]
  // Quick Claw, decided once this turn.
  const claw = new Map<string, boolean>()
  const qcOf = (p: Pos) => quickClawChance(c.ctx, c.data, monAt(c.st, p)!.itemId)
  const holders = list.filter((x) => qcOf(x.p) > 0)
  if (gen === 3 && holders.length) {
    const qc = Math.max(...holders.map((x) => qcOf(x.p)))
    const fired = decide(c.src, 'both', 'quick-claw', 'Quick Claw', qc, c.src.policies.status)
    for (const x of holders) claw.set(posKey(x.p), fired)
  } else
    for (const x of holders) {
      const m = monAt(c.st, x.p)!
      const label = name(m) + "'s Quick Claw"
      claw.set(
        posKey(x.p),
        decide(c.src, m.key, 'quick-claw', label, qcOf(x.p), c.src.policies.status),
      )
    }
  const tr = c.ctx.trickRoom && c.st.trickRoom > 0
  // True when the second battler goes before the first (the games' "swap").
  const second = (x: { p: Pos; a: Action }, y: { p: Pos; a: Action }, usePriority: boolean) => {
    const m1 = monAt(c.st, x.p)!
    const m2 = monAt(c.st, y.p)!
    if (usePriority) {
      const p1 = actionPriority(c, x.p.side, x.a, m1)
      const p2 = actionPriority(c, y.p.side, y.a, m2)
      if (p1 !== p2) return p2 > p1
    }
    const q1 = claw.get(posKey(x.p)) ?? false
    const q2 = claw.get(posKey(y.p)) ?? false
    if (q1 !== q2) return q2
    const s1 = speedOf(c, m1, x.p.side)
    const s2 = speedOf(c, m2, y.p.side)
    if (s1 === s2)
      return decide(c.src, 'both', 'speed-tie', 'Speed tie at ' + s1, 0.5, c.src.policies.status)
    return tr ? s1 > s2 : s1 < s2
  }
  for (let i = 0; i < list.length - 1; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const fi = isFight(list[i].a)
      const fj = isFight(list[j].a)
      const compare = gen === 3 ? fi && fj : fi === fj && list[i].a.kind === list[j].a.kind
      if (compare && second(list[i], list[j], fi && fj)) {
        const t = list[i]
        list[i] = list[j]
        list[j] = t
      }
    }
  }
  return list.map((x) => x.p)
}

/** The battlers on the field fastest first (Gen 4 spread moves hit in this order). */
function speedOrderOf(c: Ctx): Pos[] {
  const tr = c.ctx.trickRoom && c.st.trickRoom > 0
  return battlerOrder(c.st)
    .filter((p) => standing(c.st, p))
    .map((p) => ({ p, s: speedOf(c, monAt(c.st, p)!, p.side) }))
    .sort((x, y) => (tr ? x.s - y.s : y.s - x.s))
    .map((x) => x.p)
}

/**
 * Who fills an emptied slot, asked mid-turn in Gen 3 (see resolveTurnDoubles):
 * returns a party index, or -1 to leave the slot empty.
 */
export type Refill = (st: BattleState, p: Pos, reserved: number[]) => number

/**
 * One turn of a DOUBLE battle (S6): every battler's action, keyed by posKey
 * ('mine0', 'theirs1', ...). A move's `target` is the battler it is aimed at.
 *
 * WHEN AN EMPTIED SLOT IS REFILLED differs by generation, and both are the games':
 *   Gen 3: every move script ends in Cmd_end -> HandleAction_TryFinish ->
 *     HandleFaintedMonActions -> BattleScript_HandleFaintedMon, so the slot is
 *     refilled right after the action that emptied it (`refill` chooses), and the
 *     newcomer can be hit for the rest of the turn (it does not act).
 *   Gen 4: BattleControllerPlayer_TurnEnd -> ReplaceFainted, at the end of the
 *     turn; the slots stay in st.pendingSlots for the caller.
 */
export function resolveTurnDoubles(
  ctx: GameContext,
  data: BattleData,
  state: BattleState,
  actions: Map<string, Action>,
  src: ChanceSource,
  refill?: Refill,
): TurnResult {
  const st = cloneState(state)
  st.turn += 1
  src.turn = st.turn
  const c: Ctx = { ctx, data, st, src, log: [], dealt: { mine: 0, theirs: 0 }, actions }
  st.followMe = {}
  st.helpingHand = []
  const present = battlerOrder(st).filter((p) => standing(st, p))
  for (const p of present) monAt(st, p)!.volatile.counterDamage = null
  // Who acts from each place, as the turn starts: a Pokemon dragged in mid-turn does not act.
  const who = new Map(present.map((p) => [posKey(p), monAt(st, p)!]))
  const none: Action = { kind: 'none' }
  const acts = present.map((p) => ({ p, a: actions.get(posKey(p)) ?? none }))
  c.speedOrder = speedOrderOf(c)
  const ord = orderDoubles(c, acts)
  c.turnOrder = ord
  for (const p of ord) {
    if (st.winner) break
    const act = actions.get(posKey(p)) ?? none
    const m = monAt(st, p)
    if (!m || m !== who.get(posKey(p)) || m.fainted) continue
    if (act.kind === 'switch') {
      const sd = st.sides[p.side]
      // Two switches into the same Pokemon: the second is dropped.
      if (sd.mons[act.to]?.fainted || onField(sd, act.to)) continue
      switchIn(c, p.side, act.to, false, p.slot)
    } else if (act.kind === 'item') applyItem(c, p.side, act.itemId, p.slot)
    else if (act.kind === 'move') runMoveAt(c, p, act.slot, act.target ?? null, none)
    if (ctx.generation === 3 && refill && !st.winner) refillNow(c, refill)
  }
  if (!st.winner) endOfTurn(c)
  if (ctx.generation === 3 && refill && !st.winner) refillNow(c, refill)
  st.followMe = undefined
  st.helpingHand = undefined
  return { state: st, log: c.log, dealt: c.dealt }
}

/** Gen 3: refill every emptied slot now, in battler order (HandleFaintedMonActions' loop). */
function refillNow(c: Ctx, refill: Refill) {
  const st = c.st
  const reserved: number[] = []
  for (const p of battlerOrder(st)) {
    const pend = st.pendingSlots ?? []
    if (!pend.some((q) => q.side === p.side && q.slot === p.slot)) continue
    st.pendingSlots = pend.filter((q) => !(q.side === p.side && q.slot === p.slot))
    if (!st.pendingSlots.some((q) => q.side === p.side))
      st.pendingSwitch = st.pendingSwitch.filter((s) => s !== p.side)
    const to = refill(st, p, reserved)
    if (to < 0) continue
    reserved.push(to)
    const out = monAt(st, p)!
    const baton = !!(out.volatile as unknown as { batonPass?: boolean }).batonPass
    switchIn(c, p.side, to, baton && !out.fainted, p.slot)
  }
}

/** Resolve a pending switch (a faint, U-turn, Baton Pass) for one side. */
export function resolveSwitch(
  ctx: GameContext,
  data: BattleData,
  state: BattleState,
  side: Side,
  to: number,
  src: ChanceSource,
  slot: Slot = 0,
): TurnResult {
  const st = cloneState(state)
  const c: Ctx = { ctx, data, st, src, log: [], dealt: { mine: 0, theirs: 0 } }
  const out = monAt(st, { side, slot }) ?? activeMon(st, side)
  const baton = !!(out.volatile as unknown as { batonPass?: boolean }).batonPass
  if (st.doubles) {
    st.pendingSlots = (st.pendingSlots ?? []).filter((p) => !(p.side === side && p.slot === slot))
    if (!st.pendingSlots.some((p) => p.side === side))
      st.pendingSwitch = st.pendingSwitch.filter((s) => s !== side)
  } else st.pendingSwitch = st.pendingSwitch.filter((s) => s !== side)
  switchIn(c, side, to, baton && !out.fainted, slot)
  return { state: st, log: c.log, dealt: c.dealt }
}

/** The moves a side can choose this turn (PP left, not disabled, encore/choice locks, taunt). */
export function usableMoveSlots(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  side: Side,
  slot: Slot = 0,
): number[] {
  const m = monAt(st, { side, slot }) ?? activeMon(st, side)
  const out: number[] = []
  m.spec.moves.forEach((id, i) => {
    if (!id) return
    if (m.pp[i] <= 0) return
    if (m.volatile.disable?.moveId === id) return
    if (m.volatile.encore && m.volatile.encore.moveId !== id) return
    if (
      m.volatile.choiceLock != null &&
      m.volatile.choiceLock !== id &&
      m.spec.moves.includes(m.volatile.choiceLock)
    )
      return
    if (m.volatile.taunt > 0 && moveSem(ctx.generation, data, id).damaging === false) return
    out.push(i)
  })
  return out
}

export function canSwitch(st: BattleState, side: Side, slot: Slot = 0): number[] {
  const sd = st.sides[side]
  const m = sd.mons[slotIndex(sd, slot) ?? sd.active]
  const pending = st.doubles
    ? (st.pendingSlots ?? []).some((p) => p.side === side && p.slot === slot)
    : st.pendingSwitch.includes(side)
  if (!m.fainted && (m.volatile.meanLook || m.volatile.trapped) && !pending) return []
  return sd.mons.map((x, i) => (x.fainted || onField(sd, i) ? -1 : i)).filter((i) => i >= 0)
}

export { itemSlugOf }
