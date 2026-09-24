/**
 * Turn order: priority first, effective Speed to break the tie.
 *
 * PURE, AND UI-FREE, same discipline as the other calculator math modules.
 *
 * PARALYSIS IS ×0.25 HERE, NOT ×0.5 — that halving is Generation VII's change.
 * Every generation in this app's scope (1-4) cut Speed to a quarter, not a half,
 * which is the kind of detail this project's own CLAUDE.md calls out by name
 * elsewhere (Lightning Rod's redirect-only behaviour before Gen 5 is the same
 * shape of trap: a mechanic that is well known today for what it became, not for
 * what it was in this app's window).
 */

export interface SpeedParticipant {
  /** The computed Speed stat, before in-battle modifiers. */
  speed: number
  /** The move's priority bracket, e.g. +1 for Quick Attack, -6 for Trick Room-immune moves. */
  priority: number
  isParalyzed: boolean
  /** Choice Scarf's +50% — a real item, but not one that exists before Gen 4. */
  hasSpeedBoostItem: boolean
}

/** Speed after paralysis and a held Speed-boosting item, in the order the games apply them. */
export function effectiveSpeed(p: SpeedParticipant): number {
  let speed = p.speed
  if (p.hasSpeedBoostItem) speed = Math.floor(speed * 1.5)
  if (p.isParalyzed) speed = Math.floor(speed * 0.25)
  return speed
}

export type TurnOrder = 'a' | 'b' | 'tie'

/**
 * Who moves first. Priority brackets are absolute — Trick Room reverses the
 * SPEED read within a bracket, never the bracket order itself, so a priority
 * move still goes first (or last, for a negative-priority move) whether or not
 * the room is up.
 */
export function determineTurnOrder(
  a: SpeedParticipant,
  b: SpeedParticipant,
  trickRoomActive: boolean,
): TurnOrder {
  if (a.priority !== b.priority) return a.priority > b.priority ? 'a' : 'b'

  const speedA = effectiveSpeed(a)
  const speedB = effectiveSpeed(b)
  if (speedA === speedB) return 'tie'
  if (trickRoomActive) return speedA < speedB ? 'a' : 'b'
  return speedA > speedB ? 'a' : 'b'
}
