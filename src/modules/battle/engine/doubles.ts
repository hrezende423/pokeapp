/**
 * DOUBLE BATTLES (S6): the rules a second battler a side adds, read off the games.
 *
 * WHAT A MOVE HITS comes from the game's own move table (`tg` in the battle bundle),
 * not PokeAPI's modern target: Surf is MOVE_TARGET_BOTH (both foes) in Gen 3 and
 * RANGE_ALL_ADJACENT (both foes and the ally) in Gen 4.
 *
 * TARGETING (pokeemerald HandleAction_UseMove, pokeplatinum BattleSystem_Defender
 * and BattleSystem_CheckRedirectionAbilities):
 *   - Follow Me draws every single-target move from the other side to its user.
 *   - Gen 3 Lightning Rod draws Electric moves from the OTHER side (the first holder
 *     in turn order); Gen 4 Lightning Rod and Storm Drain draw Electric / Water
 *     single-target moves from anyone (the fastest holder), unless the attacker
 *     has Normalize or Mold Breaker.
 *   - A random-target move (Thrash, Outrage) picks a standing foe at random.
 *   - A move whose target is gone goes to that target's partner.
 *   - Spread moves hit each standing target in BATTLER ORDER (Gen 3) or SPEED
 *     ORDER (Gen 4).
 *
 * ONE SIMPLIFICATION, stated where it applies: a battler that faints mid-turn is
 * treated as gone at once for targeting, and is replaced at the end of the turn.
 * The games mark it "absent" at slightly different moments (Gen 3 when its side's
 * replacement is resolved); that moment only matters to a move aimed at it later
 * in the same turn.
 */

import type { DoublesField } from '../../calculators/damage'
import type { BattleData, GameMove } from '../battleData'
import { gameMove } from '../battleData'
import type { GameContext } from '../game'
import {
  battlerOrder,
  monAt,
  other,
  partnerPos,
  samePos,
  standing,
  type BattleState,
  type Pos,
  type Side,
} from './state'

export type TargetKind =
  'single' | 'both-foes' | 'all-adjacent' | 'self' | 'random' | 'ally' | 'user-or-ally' | 'depends'

/** What a move aims at, in its game's terms. Gen 1-2 have no targets (singles only). */
export function targetKind(gm: GameMove | undefined): TargetKind {
  switch (gm?.tg) {
    // pokeruby names the same constants without MOVE_ (TARGET_BOTH_ENEMIES ...).
    case 'MOVE_TARGET_BOTH':
    case 'TARGET_BOTH_ENEMIES':
    case 'RANGE_ADJACENT_OPPONENTS':
      return 'both-foes'
    case 'MOVE_TARGET_FOES_AND_ALLY':
    case 'TARGET_ALL_EXCEPT_USER':
    case 'RANGE_ALL_ADJACENT':
      return 'all-adjacent'
    case 'MOVE_TARGET_USER':
    case 'TARGET_USER':
    case 'TARGET_ENEMY_SIDE':
    case 'MOVE_TARGET_OPPONENTS_FIELD':
    case 'RANGE_USER':
    case 'RANGE_USER_SIDE':
    case 'RANGE_FIELD':
    case 'RANGE_OPPONENT_SIDE':
      return 'self'
    case 'MOVE_TARGET_RANDOM':
    case 'TARGET_RANDOM':
    case 'RANGE_RANDOM_OPPONENT':
      return 'random'
    case 'RANGE_ALLY':
      return 'ally'
    case 'RANGE_USER_OR_ALLY':
      return 'user-or-ally'
    case 'MOVE_TARGET_DEPENDS':
    case 'TARGET_SPECIAL':
    case 'RANGE_SINGLE_TARGET_SPECIAL':
      return 'depends'
    default:
      return 'single'
  }
}

/** The move's spread class for the damage formula (CalcField.doubles.spread). */
export function spreadOf(gm: GameMove | undefined): DoublesField['spread'] {
  const k = targetKind(gm)
  return k === 'both-foes' ? 'both-foes' : k === 'all-adjacent' ? 'all-adjacent' : 'single'
}

/** Does the reader (or the AI) pick a target for this move? Single-target moves only. */
export function needsTarget(data: BattleData, moveId: number): boolean {
  const k = targetKind(gameMove(data, moveId))
  return k === 'single' || k === 'user-or-ally'
}

/** The battlers standing, counted the games' way (curHP != 0 / not absent). */
export function standingOn(st: BattleState, side: Side): number {
  return battlerOrder(st).filter((p) => p.side === side && standing(st, p)).length
}

export function standingTotal(st: BattleState): number {
  return battlerOrder(st).filter((p) => standing(st, p)).length
}

/** The damage formula's double-battle inputs for one attacker / defender pair. */
export function doublesField(
  st: BattleState,
  data: BattleData,
  attacker: Pos,
  defender: Pos,
  moveId: number,
): DoublesField | undefined {
  if (!st.doubles) return undefined
  const defenderStands = standing(st, defender) ? 1 : 0
  return {
    defenderSideAlive: standingOn(st, defender.side),
    othersAlive: standingTotal(st) - defenderStands,
    spread: spreadOf(gameMove(data, moveId)),
    helpingHand: (st.helpingHand ?? []).some((p) => samePos(p, attacker)),
  }
}

/** The foes a battler faces, standing, in battler order. */
export function standingFoes(st: BattleState, p: Pos): Pos[] {
  return battlerOrder(st).filter((q) => q.side === other(p.side) && standing(st, q))
}

/**
 * Where a single-target move lands once the game's redirections apply. Returns
 * null when nobody can be hit.
 */
export function redirectSingle(
  ctx: GameContext,
  st: BattleState,
  attacker: Pos,
  chosen: Pos,
  move: { type: string; kind: TargetKind },
  attackerAbility: string,
  abilityAt: (p: Pos) => string,
  speedOrder: Pos[],
  turnOrder: Pos[],
): Pos | null {
  const foeSide = other(attacker.side)
  // Follow Me (both generations): the other side's Follow Me user, still standing.
  const fm = st.followMe?.[foeSide]
  if (fm != null && (move.kind === 'single' || move.kind === 'random')) {
    const p: Pos = { side: foeSide, slot: fm }
    if (standing(st, p)) return p
  }
  let target: Pos | null = chosen
  if (move.kind === 'random') {
    const foes = standingFoes(st, attacker)
    target = foes.length ? foes[0] : null
  }
  if (ctx.generation === 3 && move.type === 'electric') {
    // HandleAction_UseMove: an opposing Lightning Rod other than the chosen target,
    // the first in turn order, draws the move.
    for (const p of turnOrder) {
      if (p.side === attacker.side || (target && samePos(p, target))) continue
      if (standing(st, p) && abilityAt(p) === 'lightning-rod') return p
    }
  }
  if (
    ctx.generation === 4 &&
    (move.kind === 'single' || move.kind === 'random') &&
    attackerAbility !== 'normalize' &&
    attackerAbility !== 'mold-breaker'
  ) {
    const draw =
      move.type === 'electric' ? 'lightning-rod' : move.type === 'water' ? 'storm-drain' : null
    if (draw) {
      const holder = speedOrder.find(
        (p) => !samePos(p, attacker) && standing(st, p) && abilityAt(p) === draw,
      )
      if (holder) return holder
    }
  }
  if (target && standing(st, target)) return target
  // The target is gone: its partner, if a foe stands there.
  if (target) {
    const partner = partnerPos(target)
    if (partner.side !== attacker.side && standing(st, partner)) return partner
    if (target.side === attacker.side) {
      const foes = standingFoes(st, attacker)
      return foes[0] ?? null
    }
  }
  const foes = standingFoes(st, attacker)
  return foes[0] ?? null
}

/** Every battler a spread move hits, in the generation's order. */
export function spreadTargets(
  ctx: GameContext,
  st: BattleState,
  attacker: Pos,
  kind: 'both-foes' | 'all-adjacent',
  speedOrder: Pos[],
): Pos[] {
  const order = ctx.generation >= 4 ? speedOrder : battlerOrder(st)
  return order.filter(
    (p) =>
      !samePos(p, attacker) &&
      standing(st, p) &&
      (kind === 'all-adjacent' || p.side !== attacker.side),
  )
}

/** The Pokemon in a place, asserting it exists. */
export const at = (st: BattleState, p: Pos) => monAt(st, p)!
