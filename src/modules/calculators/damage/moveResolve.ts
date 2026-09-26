/**
 * A bundle Move resolved for one generation -- the reference's `Move` class,
 * for the fields a Gen 1-4 formula reads.
 *
 * THE CATEGORY IS BY TYPE BEFORE GEN 4, NOT BY MOVE. The bundle's
 * `damage_class` is the modern per-move classification, which only became true of
 * the games in Diamond/Pearl. Gen 1-3 took the category from the move's TYPE:
 * Fire, Water, Grass, Electric, Ice, Psychic, Dragon and Dark are special,
 * everything else physical -- so a Gen 3 Crunch is special and a Gen 3 Shadow Ball
 * physical, and the Gen 4 split reverses both. This is the single largest
 * Gen 3 -> Gen 4 behaviour change and it is gated here, once.
 *
 * TYPE AND POWER ARE ERA-RESOLVED through moveEra.ts (Gen 1 Karate Chop is
 * Normal; Gen 1 Dig is 100). A few moves' damage is typeless in the formula even
 * though they have a type: Struggle from Gen 2 and Future Sight / Doom Desire in
 * Gen 2-4, which neither get STAB nor meet the type chart.
 */

import { typesInGeneration, type Move } from '../../../data'
import { moveHasFlag } from '../../../data/moveFlags'
import {
  resolveMovePowerForGeneration,
  resolveMoveTypeIdForGeneration,
} from '../../../data/moveEra'
import { hiddenPower } from '../../team-builder/statMath'
import { hasAbility, type Combatant } from './combatant'
import type { CalcCategory, CalcMove } from './model'
import { TYPELESS } from './util'

/** Gen 1-3's special types. Everything else that deals damage is physical. */
export const SPECIAL_TYPES_BEFORE_GEN_4 = [
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'psychic',
  'dragon',
  'dark',
]

/** Physical/special split arrives in Gen 4. */
export const PER_MOVE_CATEGORY_INTRODUCED_IN_GENERATION = 4

/**
 * Moves whose base power the mechanics modules compute (from HP, weight, Speed,
 * held item, weather, stat stages...). The formula owns their number.
 */
const ENGINE_POWER_MOVES = new Set([
  'flail',
  'reversal',
  'eruption',
  'water-spout',
  'low-kick',
  'grass-knot',
  'gyro-ball',
  'punishment',
  'crush-grip',
  'wring-out',
  'triple-kick',
  'weather-ball',
  'fling',
  'natural-gift',
  'nature-power',
])

/**
 * Moves whose power depends on something outside the battle state the calculator
 * models -- happiness, a random roll, a stockpile count, PP left. The reader sets
 * it; these are the starting values.
 *
 * Return and Frustration at 102 (max happiness) is the reference's own default.
 * Present at 40 is the reference's Gen 2 default; it is used in Gen 3-4 as well,
 * where the reference leaves it at 0 and prints nothing -- a blank result for a
 * move that does damage is less useful than its lowest outcome. Magnitude's 70 is
 * Magnitude 7, the median of its table; Spit Up's 100 is one Stockpile; Trump
 * Card's 40 is five or more PP left. Those three the reference also leaves at 0.
 */
export const POWER_OVERRIDE_DEFAULTS: Record<string, number> = {
  return: 102,
  frustration: 102,
  present: 40,
  magnitude: 70,
  'spit-up': 100,
  'trump-card': 40,
}

export interface ResolvedMove {
  move: Move
  slug: string
  name: string
  /** Lowercase type name, or TYPELESS. */
  type: string
  typeId: number | null
  category: CalcCategory
  bp: number
  isCrit: boolean
  hits: number
  isSound: boolean
  isPunch: boolean
  recoil: boolean
  hasCrashDamage: boolean
  /**
   * A damaging move whose damage the calculator does not compute: one-hit KOs,
   * Counter-likes, Endeavor, Super Fang, Psywave, Bide.
   */
  variable: boolean
}

function typeName(typeId: number | null, gen: number): string {
  if (typeId == null) return TYPELESS
  const t = typesInGeneration(gen).find((x) => x.id === typeId)
  return t ? t.name : TYPELESS
}

function typeIdOf(name: string, gen: number): number | null {
  return typesInGeneration(gen).find((t) => t.name === name)?.id ?? null
}

export function categoryFor(gen: number, move: Move, type: string): CalcCategory {
  if (move.damage_class === 'status' && move.name !== 'nature-power') return 'status'
  if (gen >= PER_MOVE_CATEGORY_INTRODUCED_IN_GENERATION) {
    return move.damage_class === 'special' ? 'special' : 'physical'
  }
  return SPECIAL_TYPES_BEFORE_GEN_4.includes(type) ? 'special' : 'physical'
}

export function resolveMove(gen: number, calc: CalcMove, attacker: Combatant): ResolvedMove {
  const { move } = calc
  const slug = move.name

  let typeId = resolveMoveTypeIdForGeneration(move, gen)
  let type = typeName(typeId, gen)
  let bp = resolveMovePowerForGeneration(move, gen) ?? 0
  let name = move.display_name

  const typeless =
    (gen >= 2 && slug === 'struggle') ||
    (gen >= 2 && gen <= 4 && (slug === 'future-sight' || slug === 'doom-desire'))
  if (typeless) {
    type = TYPELESS
    typeId = null
  }

  if (slug === 'hidden-power' && gen >= 2) {
    const hp = hiddenPower(gen, attacker.input.individual)
    type = hp.type
    typeId = typeIdOf(hp.type, gen)
    bp = hp.power
    // The reference names the move by its type ("Hidden Power Dragon"); so do we.
    name = `${move.display_name} ${hp.type.charAt(0).toUpperCase()}${hp.type.slice(1)}`
  }

  if (slug in POWER_OVERRIDE_DEFAULTS) {
    bp = calc.powerOverride ?? POWER_OVERRIDE_DEFAULTS[slug]
  }

  const min = move.meta?.min_hits ?? null
  const max = move.meta?.max_hits ?? null
  let hits = 1
  // Gen 2's Triple Kick hits a random 1-3 times (default 2, the reference's
  // min+1); from Gen 3 it always tries all three.
  if (slug === 'triple-kick') hits = calc.hits ?? (gen === 2 ? 2 : 3)
  // Beat Up hits once per healthy party member, each off that member's own Attack.
  // A one-Pokemon calculator has no party, so it is one hit, as in the reference.
  else if (slug === 'beat-up') hits = 1
  else if (min != null && max != null) {
    hits = min === max ? min : (calc.hits ?? (hasAbility(attacker, 'skill-link') ? max : min + 1))
  }

  const engineOwnsPower = ENGINE_POWER_MOVES.has(slug)
  const variable =
    move.damage_class !== 'status' &&
    bp === 0 &&
    !engineOwnsPower &&
    !['seismic-toss', 'night-shade', 'dragon-rage', 'sonic-boom'].includes(slug)

  return {
    move,
    slug,
    name,
    type,
    typeId,
    category: categoryFor(gen, move, type),
    bp,
    isCrit: calc.isCrit,
    hits,
    isSound: moveHasFlag(slug, 'sound'),
    isPunch: moveHasFlag(slug, 'punch'),
    recoil: (move.meta?.drain ?? 0) < 0,
    hasCrashDamage: slug === 'jump-kick' || slug === 'high-jump-kick',
    variable,
  }
}

/** Retype a resolved move in place (Weather Ball, Judgment, Natural Gift, Normalize). */
export function retype(move: ResolvedMove, type: string, gen: number) {
  move.type = type
  move.typeId = typeIdOf(type, gen)
}

export { typeIdOf, typeName }
