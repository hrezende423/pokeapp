/**
 * The AI's VIEW of a double battle (S6).
 *
 * Every model was written against a single battle: it reads its user as the
 * opponent's slot-0 Pokemon and its target as the player's. The games' doubles
 * routines run that same scoring once per (user, target) pair -- Emerald's
 * ChooseMoveOrAction_Doubles, Platinum's TrainerAI_MainDoubles -- so a view is a
 * shallow copy of the state with the two slots pointed at that pair:
 *   theirs.active  = the AI's battler      theirs.active2 = its partner
 *   mine.active    = the target            mine.active2   = the target's partner
 * For a target on the AI's own side (its ally), "mine" is a copy of the AI's side
 * with the ally in front and the user behind it -- the target's partner IS the
 * user, as in the games' battler arithmetic (defender ^ 2).
 *
 * Views share the Pokemon objects and are read only; the AI never writes state.
 */

import type { DamageAt } from '../engine/turn'
import { standingTotal, spreadOf } from '../engine/doubles'
import { gameMove } from '../battleData'
import {
  activeMon,
  other,
  slotIndex,
  type BattleState,
  type Pos,
  type Side,
  type Slot,
} from '../engine/state'
import type { AiEnv } from './types'

interface ViewInfo {
  targetIsAlly: boolean
  /** Battlers standing in the REAL state (a view of the ally side cannot count the player's). */
  aliveTotal: number
}

const VIEWS = new WeakMap<BattleState, ViewInfo>()

export const viewInfo = (st: BattleState): ViewInfo | undefined => VIEWS.get(st)

const otherSlot = (s: Slot): Slot => (s === 0 ? 1 : 0)

/** The state as the AI's battler in `userSlot` sees it while scoring against `target`. */
export function aiView(st: BattleState, userSlot: Slot, target: Pos): BattleState {
  const theirs = st.sides.theirs
  const tSide = st.sides[target.side]
  const view: BattleState = {
    ...st,
    sides: {
      theirs: {
        ...theirs,
        active: slotIndex(theirs, userSlot) ?? theirs.active,
        active2: slotIndex(theirs, otherSlot(userSlot)),
      },
      mine: {
        ...tSide,
        active: slotIndex(tSide, target.slot) ?? tSide.active,
        active2: slotIndex(tSide, otherSlot(target.slot)),
      },
    },
  }
  VIEWS.set(view, { targetIsAlly: target.side === 'theirs', aliveTotal: standingTotal(st) })
  return view
}

/**
 * The damage call's double-battle inputs inside a view (the AI's own damage
 * estimate runs the games' full formula, doubles reductions included). Undefined
 * in a single battle, which keeps the singles numbers exactly as they were.
 */
export function aiDamageAt(
  env: AiEnv,
  st: BattleState,
  attackerSide: Side,
  moveId: number,
): DamageAt | undefined {
  if (!st.doubles) return undefined
  const dSide = other(attackerSide)
  const sd = st.sides[dSide]
  const defender = activeMon(st, dSide)
  const defenderSideAlive = [sd.active, sd.active2].filter(
    (i) => i != null && !sd.mons[i].fainted,
  ).length
  const total = viewInfo(st)?.aliveTotal ?? standingTotal(st)
  return {
    attacker: activeMon(st, attackerSide),
    defender,
    defenderSide: dSide,
    doubles: {
      defenderSideAlive,
      othersAlive: total - (defender.fainted ? 0 : 1),
      spread: spreadOf(gameMove(env.data, moveId)),
    },
  }
}

/** The partner of the view's user / target (doubles only; null in singles). */
export function partners(st: BattleState) {
  const u = st.sides.theirs
  const t = st.sides.mine
  return {
    userPartner: st.doubles && u.active2 != null ? u.mons[u.active2] : null,
    targetPartner: st.doubles && t.active2 != null ? t.mons[t.active2] : null,
    targetIsAlly: viewInfo(st)?.targetIsAlly ?? false,
  }
}
