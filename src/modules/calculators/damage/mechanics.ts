/**
 * The contract every generation's mechanics module implements.
 *
 * One function per era, mirroring the reference's gen12.ts / gen3.ts / gen4.ts
 * split. A module receives its own freshly built copies of both combatants, the
 * move and the field, and may mutate all four (Intimidate, Forecast, Weather Ball,
 * Brick Break removing screens) -- which is why the output hands them back: the
 * description and the KO text must read the state the formula actually used.
 */

import type { Combatant } from './combatant'
import type { RawDesc } from './desc'
import type { CalcField, Damage, DamageResult } from './model'
import type { ResolvedMove } from './moveResolve'

export interface MechanicsOutput {
  damage: Damage
  desc: RawDesc
  move: ResolvedMove
  attacker: Combatant
  defender: Combatant
  field: CalcField
  effectiveness: number
  noDamageReason: DamageResult['noDamageReason']
}

export type Mechanics = (
  gen: number,
  attacker: Combatant,
  defender: Combatant,
  move: ResolvedMove,
  field: CalcField,
) => MechanicsOutput
