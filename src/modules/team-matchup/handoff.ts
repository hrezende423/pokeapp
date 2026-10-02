/**
 * M3: open the Damage Calculator on one matrix cell. The calculator holds single
 * values, so a ranged spread goes over at its HIGH end (said beside the link);
 * badge boosts have no control there and do not go over.
 */

import { effectiveLevel, freshConditions, resolveAt, type BattlerSpec } from '../battle/battler'
import type { MatchField } from '../battle/damage'
import type { GameContext } from '../battle/game'
import { setDamageCalcPrefill } from '../calculators/damageCalcHandoff'
import type { SideState } from '../calculators/damageCalcState'

const HIGH = {
  hp: 'high',
  atk: 'high',
  def: 'high',
  spa: 'high',
  spd: 'high',
  spe: 'high',
} as const

export function toCalcSide(spec: BattlerSpec, ctx: GameContext): SideState {
  const p = resolveAt(spec, ctx, HIGH, freshConditions())
  const moves: (number | null)[] = [...spec.moves, null, null, null, null].slice(0, 4)
  return {
    speciesId: spec.speciesId,
    varietyName: spec.varietyName,
    level: effectiveLevel(spec),
    natureId: p.nature?.id ?? null,
    abilityId: ctx.hasAbilities ? spec.abilityId : null,
    abilityOn: false,
    itemId: ctx.hasItems ? spec.itemId : null,
    status: 'healthy',
    boosts: {},
    currentHp: null,
    gender: spec.gender,
    effort: p.effort,
    individual: p.individual,
    moves,
    setKey: null,
    crit: [false, false, false, false],
    hits: [null, null, null, null],
    power: [null, null, null, null],
  }
}

export function openInDamageCalculator(
  ctx: GameContext,
  mine: BattlerSpec,
  theirs: BattlerSpec,
  field: MatchField,
  myMoveId: number | null,
  setModule: (id: 'damage-calculator') => void,
) {
  setDamageCalcPrefill({
    versionGroup: ctx.versionGroup,
    sides: [toCalcSide(mine, ctx), toCalcSide(theirs, ctx)],
    field: {
      weather: field.weather,
      gravity: field.gravity,
      sides: [{ ...field.sides.mine }, { ...field.sides.theirs }],
    },
    selected: { side: 0, slot: Math.max(0, myMoveId != null ? mine.moves.indexOf(myMoveId) : 0) },
  })
  setModule('damage-calculator')
}
