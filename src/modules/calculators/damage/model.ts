/**
 * The damage engine's inputs and outputs.
 *
 * A PORT, NOT A DEPENDENCY. The formulas are the Showdown calculator's
 * (github.com/smogon/damage-calc, calc/src/mechanics/gen12.ts, gen3.ts, gen4.ts)
 * re-implemented against pokeapp's own data: the inputs below carry the bundle's
 * `Species`, `Variety`, `Move`, `Item`, `Ability` and `Nature` records directly,
 * and every era-sensitive read goes through the same resolvers the rest of the app
 * uses (era.ts, moveEra.ts, statMath.ts). There is no parallel Pokemon model.
 *
 * WHAT IS IN SCOPE is what can fire in Generations 1-4, singles. Anything later
 * (terrain, Tera, Dynamax, Z-moves, rooms, Ruin abilities, doubles spread
 * reduction, Gen 5+ hazards) has no field here to set, rather than a field the UI
 * has to remember to hide. Gen 5 is added by writing its mechanics module and
 * registering it in index.ts, and by widening FIELD_RULES below -- not by editing
 * the three existing modules.
 */

import type { Ability, Item, Move, Nature, Species, Variety } from '../../../data'
import type { StatNumbers } from '../../team-builder/statMath'

/** The generations this engine has a mechanics module for. */
export const CALC_GENERATIONS = [1, 2, 3, 4] as const

export type Weather = 'sun' | 'rain' | 'sand' | 'hail'

export type StatusId = 'healthy' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz'

/** In-battle stat stages, -6..+6. Gen 1 has one `spc` stage for its one Special. */
export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type Boosts = Partial<Record<BoostStat, number>>

/** The engine's short stat ids, the reference's own vocabulary. */
export type StatId = 'hp' | BoostStat

export interface CalcPokemon {
  species: Species
  /** The battle form. Deoxys-Attack and Rotom-Wash are varieties, not species. */
  variety: Variety
  level: number
  /**
   * DVs in Gen 1-2 (0-15, keyed attack/defense/speed/special -- HP is derived),
   * IVs in Gen 3-4 (0-31, all six). statMath's own shape.
   */
  individual: StatNumbers
  /**
   * Stat Exp in Gen 1-2 (0-65535; Gen 2's `special` is one value for both halves),
   * EVs in Gen 3-4 (0-252). statMath's own shape.
   */
  effort: StatNumbers
  /** Gen 3+ only; ignored before. */
  nature: Nature | null
  /** Gen 3+ only; ignored before. */
  ability: Ability | null
  /**
   * For abilities that are conditionally on: Flash Fire (activated), Plus/Minus
   * (partner present), Slow Start (still counting down), Intimidate (on entry).
   */
  abilityOn: boolean
  /** Gen 2+ only; ignored in Gen 1. */
  item: Item | null
  status: StatusId
  boosts: Boosts
  /** Current HP; null means full. */
  currentHp: number | null
  /** For Rivalry. 'N' for genderless or "don't care". */
  gender: 'M' | 'F' | 'N'
  /**
   * The PLAYER's badge boosts, which the reference calculator does not model
   * (the Team Matchup page sets these; the Damage Calculator never does).
   * Gen 1-2: the stat x9/8 after stages (pokered ApplyBadgeStatBoosts,
   * pokecrystal BadgeStatBoosts), and Gen 2's +1/8 damage for a move whose type
   * matches an owned badge (DoBadgeTypeBoosts). Gen 3: the stat x110/100 right
   * after Huge Power (pokeemerald CalculateBaseDamage). Gen 4 has none.
   */
  badgeBoosts?: BadgeBoosts
}

export interface BadgeBoosts {
  atk?: boolean
  def?: boolean
  spa?: boolean
  spd?: boolean
  spe?: boolean
  /** Gen 2: move types whose damage the badges raise by 1/8. */
  types?: string[]
}

export interface CalcMove {
  move: Move
  isCrit: boolean
  /** For a variable multi-hit move (2-5, Triple Kick 1-3). Null takes the reference default. */
  hits: number | null
  /**
   * Base power for moves whose power is not a property of the move -- Return and
   * Frustration (happiness), Magnitude, Present, Spit Up, Trump Card. Null takes the
   * engine default, which is the reference's where it has one.
   */
  powerOverride: number | null
}

export interface SideConditions {
  reflect: boolean
  lightScreen: boolean
  /** Foresight / Odor Sleuth used on this side: Normal and Fighting hit Ghost. Gen 2+. */
  foresight: boolean
  /** Layers. Gen 2 has one; Gen 3-4 have three. */
  spikes: number
  /** Gen 4. */
  stealthRock: boolean
  /** This side's Pokemon is switching out (Pursuit doubles). Gen 2+. */
  switchingOut: boolean
  /** This side used Charge (Electric doubles). Gen 3+. */
  charge: boolean
}

export interface CalcField {
  weather: Weather | null
  /** Gen 4. */
  gravity: boolean
  attackerSide: SideConditions
  defenderSide: SideConditions
  /**
   * A DOUBLE BATTLE (Gen 3-4), set only by Team Matchup's engine; the Damage
   * Calculator page never sets it, so its numbers are the singles ones. Absent =
   * singles. What it changes is the games' own code, not the reference's:
   *   Gen 3 pokeemerald CalculateBaseDamage: a screen is 2 * (damage / 3) instead
   *     of damage / 2 when the defender's side has two battlers; a MOVE_TARGET_BOTH
   *     move (Surf, Rock Slide) halves when the defender's side has two.
   *   Gen 4 pokeplatinum BattleSystem_CalcBaseDamage: a screen is damage * 2 / 3
   *     on the same condition; RANGE_ADJACENT_OPPONENTS x3/4 when the defender's
   *     side has two; RANGE_ALL_ADJACENT x3/4 when two or more battlers other than
   *     the defender stand (the attacker counts).
   */
  doubles?: DoublesField
}

export interface DoublesField {
  /** Battlers standing on the defender's side (BATTLE_ALIVE_DEF_SIDE / CountAliveBattlers(TRUE)). */
  defenderSideAlive: number
  /** Battlers standing other than the defender (Gen 4 CountAliveBattlers(FALSE)). */
  othersAlive: number
  /** The move's range in the game's terms: 'both-foes' (MOVE_TARGET_BOTH / RANGE_ADJACENT_OPPONENTS), 'all-adjacent' (MOVE_TARGET_FOES_AND_ALLY / RANGE_ALL_ADJACENT), or 'single'. */
  spread: 'both-foes' | 'all-adjacent' | 'single'
  /**
   * The attacker's partner used Helping Hand this turn: x15/10 on the damage right
   * after Charge (Gen 3 Cmd_damagecalc), or on the move's power right after Charge
   * (Gen 4 BattleSystem_CalcBaseDamage).
   */
  helpingHand?: boolean
}

/**
 * Which field conditions exist in each generation. The UI reads this to decide
 * what to offer; the engine never has to, because a field the UI cannot set is a
 * field that is never on.
 */
export interface FieldRules {
  weathers: readonly Weather[]
  maxSpikes: number
  stealthRock: boolean
  foresight: boolean
  pursuit: boolean
  charge: boolean
  gravity: boolean
}

export const FIELD_RULES: Record<number, FieldRules> = {
  1: {
    weathers: [],
    maxSpikes: 0,
    stealthRock: false,
    foresight: false,
    pursuit: false,
    charge: false,
    gravity: false,
  },
  // Gen 2's weather set has no Hail, and only one layer of Spikes.
  2: {
    weathers: ['sun', 'rain', 'sand'],
    maxSpikes: 1,
    stealthRock: false,
    foresight: true,
    pursuit: true,
    charge: false,
    gravity: false,
  },
  3: {
    weathers: ['sun', 'rain', 'sand', 'hail'],
    maxSpikes: 3,
    stealthRock: false,
    foresight: true,
    pursuit: true,
    charge: true,
    gravity: false,
  },
  4: {
    weathers: ['sun', 'rain', 'sand', 'hail'],
    maxSpikes: 3,
    stealthRock: true,
    foresight: true,
    pursuit: true,
    charge: true,
    gravity: true,
  },
}

export function emptySide(): SideConditions {
  return {
    reflect: false,
    lightScreen: false,
    foresight: false,
    spikes: 0,
    stealthRock: false,
    switchingOut: false,
    charge: false,
  }
}

export function emptyField(): CalcField {
  return { weather: null, gravity: false, attackerSide: emptySide(), defenderSide: emptySide() }
}

/**
 * The damage of one use of the move, as the reference shapes it:
 *   - a single number for a fixed amount (Seismic Toss, Dragon Rage)
 *   - one array of rolls for a single hit (39 in Gen 1-2, 16 in Gen 3-4)
 *   - one array of rolls PER HIT for a multi-hit move
 */
export type Damage = number | number[] | number[][]

export type CalcCategory = 'physical' | 'special' | 'status'

export interface DamageResult {
  generation: number
  damage: Damage
  /** Total over all hits, min and max. [0, 0] when nothing happens. */
  range: [number, number]
  /** Percent of the defender's MAX HP, one decimal, as the reference prints it. */
  percent: [number, number]
  defenderMaxHp: number
  attackerMaxHp: number
  /** The move as it actually resolved: era type, category, power after BP effects. */
  moveType: string
  category: CalcCategory
  basePower: number
  effectiveness: number
  /** Why nothing happened, when nothing did. */
  noDamageReason: 'status' | 'immune' | 'ability' | 'variable' | null
  /** "252+ Atk Choice Band Tauros Body Slam vs. 252 HP / 0 Def Chansey" -- the reference's desc. */
  description: string
  /** "guaranteed OHKO", "56.3% chance to 2HKO after Leftovers recovery", or ''. */
  koText: string
  /** description: min-max (min% - max%) -- koText, the reference's full line. */
  fullText: string
}
