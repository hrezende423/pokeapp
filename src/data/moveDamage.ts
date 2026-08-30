/**
 * What a move's POWER column should say when `power` is null.
 *
 * WHAT THE DATA ACTUALLY HAS. There is no structured "fixed damage" field.
 * Dragon Rage in the bundle is `power: null`, `damage_class: "special"`,
 * `meta.category: "damage"`, and the number 40 appears only in prose:
 * `short_effect: "Inflicts 40 points of damage."`. So the amount cannot be read
 * off a field.
 *
 * WHAT IT DOES HAVE is enough to find the candidates without guessing. A move
 * that deals damage but has no power value is exactly
 * `damage_class !== 'status' && power == null`, and across the 485 in-scope moves
 * that is a set of 33 -- against 176 status moves (no power by nature) and 276
 * ordinary damaging moves. Those 33 were then read:
 *
 *   FIXED, a constant, 2 moves:  Dragon Rage 40, Sonic Boom 20
 *   VARIABLE, 31 moves:          one-hit KOs (Fissure, Guillotine, Horn Drill,
 *                                Sheer Cold), level-scaling (Seismic Toss, Night
 *                                Shade, Psywave), HP-relative (Endeavor, Super
 *                                Fang, Flail, Reversal, Crush Grip, Wring Out),
 *                                counter-attacks (Counter, Mirror Coat, Bide,
 *                                Metal Burst), weight/happiness/PP/Stockpile
 *                                scaling, Beat Up, Fling, Natural Gift,
 *                                Magnitude, Present, Spit Up, Trump Card,
 *                                Punishment, Gyro Ball, Grass Knot, Low Kick,
 *                                Return, Frustration, Shadow Half
 *
 * ONLY TWO MOVES ARE ACTUALLY FIXED. Worth stating plainly because Seismic Toss
 * and Night Shade are commonly grouped with them and are NOT: both deal damage
 * equal to the user's level, so there is no single number to print and "100 hp"
 * would be wrong for every Pokemon that is not level 100.
 *
 * SO THIS PARSES RATHER THAN HARDCODING. The gate is structural, and the number
 * comes from the effect text via one narrow pattern. A hardcoded two-entry map
 * would be the same answer today, but silently wrong if the bundle gained a
 * generation or PokeAPI reworded an entry; this way an unparseable move falls
 * through to the variable case, which is a visible "—" rather than a wrong
 * number. FIXED_DAMAGE_MOVE_COUNT pins the count so a suite can notice a change.
 */

import type { Move } from './types'

/** Moves confirmed to deal a constant amount, at the time of writing. */
export const FIXED_DAMAGE_MOVE_COUNT = 2

/** "Inflicts 40 points of damage." / "Inflicts exactly 40 damage." */
const FIXED_PATTERN = /inflicts\s+(?:exactly\s+)?(\d+)\s*(?:points?\s+of\s+)?damage\b/i

/**
 * The constant amount a move always deals, or null if it is not a fixed-damage
 * move.
 *
 * Returns null for every status move and every variable-damage move, so a caller
 * can treat "null" as "there is no number to show".
 */
export function fixedDamage(move: Move): number | null {
  // Status moves deal no damage at all; an ordinary move already has `power`.
  if (move.damage_class === 'status' || move.power != null) return null
  const text = move.short_effect ?? move.effect ?? ''
  const match = FIXED_PATTERN.exec(text)
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

/**
 * True for a damaging move with no single power number: a one-hit KO, a
 * counter-attack, or anything that scales with level, HP, weight or happiness.
 *
 * Kept separate from `fixedDamage` because the two want different treatments and
 * conflating them is how "40 hp" ends up on Seismic Toss.
 */
export function hasVariableDamage(move: Move): boolean {
  return move.damage_class !== 'status' && move.power == null && fixedDamage(move) == null
}
