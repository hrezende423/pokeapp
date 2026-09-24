/**
 * Damage calculation, Gen 1-4.
 *
 * PURE, AND UI-FREE, same discipline as team-builder/statMath.ts: every function
 * takes numbers and returns numbers, so the arithmetic can be asserted without
 * rendering anything.
 *
 * THE PHYSICAL/SPECIAL SPLIT IS BY TYPE IN GEN 1-3, NOT BY MOVE. The per-move
 * `damage_class` field the bundle carries is the MODERN classification, which
 * only became true of the games themselves in Generation IV -- Gen 1-3 picked the
 * category from the move's TYPE (every Fire/Water/Electric/Grass/Ice/Psychic/
 * Dragon move is special, everything else is physical), independent of what the
 * move actually does. Water Gun and Surf are "special" today because they always
 * were; Gust being Normal-type made it PHYSICAL in Gen 1 despite hitting a flying
 * target, which is not what a modern reader expects. Getting this wrong would
 * silently use the wrong stat pair for a huge fraction of Gen 1-3 moves, so it is
 * encoded here as a rule rather than trusted to the record.
 *
 * GEN 1'S CRITICAL HIT DOUBLES THE LEVEL TERM, not the final damage. It also
 * ignores burn's Attack halving entirely -- both are genuine Gen 1 quirks (the
 * crit mechanic was rewritten from Gen 2 onward into a flat post-multiplier x2,
 * which respects burn). Modelling Gen 1 as "Gen 2's formula with a smaller crit
 * multiplier" would be a plausible-looking wrong answer, not a simplification.
 *
 * WHAT IS NOT MODELLED: stat stages (no in-battle boosts/drops), weather,
 * abilities other than the burn interaction above, held items, multi-target
 * spread reduction, and the exact 16-bit truncation order the Game Boy/DS
 * hardware performs internally. The floor-per-step order below is the standard
 * simplified formula (the one Bulbapedia's own worked examples use), not a
 * byte-for-byte emulation. Good enough for "what range should I expect", not for
 * settling a frame-perfect dispute.
 */

/** The random multiplier's range is the same across Gen 1-4: roll/255, roll in [216, 255]. */
export const RANDOM_ROLL_MIN = 217
export const RANDOM_ROLL_MAX = 255

/** Types that used the Special stat for both offence and defence before Gen 4. */
const TYPE_BASED_SPECIAL_TYPES = new Set([
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'psychic',
  'dragon',
])

/**
 * Whether a move of this type is "special" in `generation`.
 *
 * Gen 4 is where the per-move split actually starts; call sites should use the
 * move's own `damage_class` from Gen 4 onward and this function for Gen 1-3.
 */
export function isSpecialByType(typeName: string, generation: number): boolean {
  if (generation >= 4) {
    throw new Error('Gen 4+ classifies by move, not by type — use the damage_class field')
  }
  return TYPE_BASED_SPECIAL_TYPES.has(typeName)
}

export interface DamageParticipant {
  level: number
  /** The resolved offensive or defensive stat value (Attack/Special vs Defense/Special). */
  stat: number
  /** Era-resolved type ids, for STAB on the attacker and effectiveness on the defender. */
  typeIds: number[]
}

export interface DamageMove {
  power: number
  typeId: number
}

export interface DamageInput {
  generation: number
  attacker: DamageParticipant
  defender: DamageParticipant
  move: DamageMove
  /** Combined type-effectiveness multiplier already resolved against both of the defender's types. */
  effectiveness: number
  isCritical: boolean
  /** Physical burn halving. Ignored automatically on a Gen 1 crit — see the header note. */
  isBurned: boolean
}

export interface DamageResult {
  min: number
  max: number
  stab: boolean
  effectiveness: number
  immune: boolean
}

/** One damage roll, `roll` in [RANDOM_ROLL_MIN, RANDOM_ROLL_MAX]. Exposed so a suite can assert both ends. */
export function damageAtRoll(input: DamageInput, roll: number): number {
  const { generation, attacker, defender, move, effectiveness, isCritical, isBurned } = input
  if (effectiveness === 0) return 0

  const gen1Crit = isCritical && generation === 1
  const level = gen1Crit ? attacker.level * 2 : attacker.level

  // Burn halves physical Attack in every generation it exists in, EXCEPT that a
  // Gen 1 critical hit ignores it outright — the crit reads the unburned stat.
  const atk = isBurned && !gen1Crit ? Math.floor(attacker.stat / 2) : attacker.stat

  let damage =
    Math.floor(Math.floor((((2 * level) / 5 + 2) * move.power * atk) / defender.stat) / 50) + 2

  if (isCritical && generation >= 2) damage = Math.floor(damage * 2)

  const stab = attacker.typeIds.includes(move.typeId)
  if (stab) damage = Math.floor(damage * 1.5)

  damage = Math.floor(damage * effectiveness)

  damage = Math.floor((damage * roll) / 255)

  // "Any calculated damage of 0 becomes 1" — the games' own floor, distinct from
  // an immunity (effectiveness 0), which is handled above and never reaches here.
  return Math.max(1, damage)
}

export function calculateDamage(input: DamageInput): DamageResult {
  const stab = input.attacker.typeIds.includes(input.move.typeId)
  if (input.effectiveness === 0) {
    return { min: 0, max: 0, stab, effectiveness: 0, immune: true }
  }
  return {
    min: damageAtRoll(input, RANDOM_ROLL_MIN),
    max: damageAtRoll(input, RANDOM_ROLL_MAX),
    stab,
    effectiveness: input.effectiveness,
    immune: false,
  }
}

/** Damage as a percentage of the defender's max HP, for the "X–Y%" readout. */
export function percentOfHp(damage: number, maxHp: number): number {
  if (maxHp <= 0) return 0
  return Math.round((damage / maxHp) * 1000) / 10
}
