/**
 * The damage engine's one call site: `calculateDamage(gen, attacker, defender,
 * move, field)`.
 *
 * PURE AND UI-FREE. No React, no DOM; it reads the loaded data bundle through the
 * data layer and nothing else. The UI calls this and renders what comes back.
 *
 * DISPATCH IS A TABLE, which is the extension point: Gen 5 is a `gen56.ts` module
 * (the reference's own next file), one line in MECHANICS, and a FIELD_RULES entry
 * in model.ts. Nothing in gen12/gen3/gen4 needs to change for it.
 *
 * Singles, one attacker, one move. Doubles spread reduction and a whole-dex table
 * are later passes; neither needs a different entry point -- a table mode is this
 * function in a loop, and spread reduction is a field flag the Gen 3/4 modules
 * already have the reference's slot for.
 */

import { makeCombatant } from './combatant'
import { buildDescription, damageRange, koChanceText, toPercent } from './desc'
import { calculateRBYGSC } from './gen12'
import { calculateADV } from './gen3'
import { calculateDPP } from './gen4'
import type { Mechanics } from './mechanics'
import type { CalcField, CalcMove, CalcPokemon, DamageResult } from './model'
import { resolveMove } from './moveResolve'
import { copyField } from './util'

const MECHANICS: Record<number, Mechanics> = {
  1: calculateRBYGSC,
  2: calculateRBYGSC,
  3: calculateADV,
  4: calculateDPP,
}

export function supportsGeneration(gen: number): boolean {
  return gen in MECHANICS
}

export function calculateDamage(
  gen: number,
  attackerIn: CalcPokemon,
  defenderIn: CalcPokemon,
  moveIn: CalcMove,
  fieldIn: CalcField,
): DamageResult {
  const mechanics = MECHANICS[gen]
  if (!mechanics) throw new Error(`No damage mechanics for generation ${gen}`)

  const attacker = makeCombatant(attackerIn, gen)
  const defender = makeCombatant(defenderIn, gen)
  const move = resolveMove(gen, moveIn, attacker)
  const field = copyField(fieldIn)

  const result = mechanics(gen, attacker, defender, move, field)
  const range = damageRange(result.damage)
  const percent: [number, number] = [
    toPercent(range[0], result.defender.maxHp),
    toPercent(range[1], result.defender.maxHp),
  ]
  const description = buildDescription(result.desc, result.attacker, result.defender)
  const koText = range[1] > 0 ? koChanceText(gen, result) : ''
  const damageText = `${range[0]}-${range[1]} (${percent[0]} - ${percent[1]}%)`
  const fullText = koText
    ? `${description}: ${damageText} -- ${koText}`
    : `${description}: ${damageText}`

  return {
    generation: gen,
    damage: result.damage,
    range,
    percent,
    defenderMaxHp: result.defender.maxHp,
    attackerMaxHp: result.attacker.maxHp,
    moveType: result.move.type,
    category: result.move.category,
    basePower: result.desc.moveBP ?? result.move.bp,
    effectiveness: result.effectiveness,
    noDamageReason: result.noDamageReason,
    description,
    koText,
    fullText,
  }
}

export { computeRawStats, HELD_ITEMS_INTRODUCED_IN_GENERATION } from './combatant'
export { ITEM_SLUGS_REFERENCED } from './items'
export * from './model'
export {
  PER_MOVE_CATEGORY_INTRODUCED_IN_GENERATION,
  POWER_OVERRIDE_DEFAULTS,
  SPECIAL_TYPES_BEFORE_GEN_4,
  categoryFor,
} from './moveResolve'
