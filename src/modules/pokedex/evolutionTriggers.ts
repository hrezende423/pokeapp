/**
 * Which kind of requirement one evolution detail is.
 *
 * WHAT USED TO BE HERE. This module also owned TRIGGER_ICON_NAMES (a Tabler export
 * name per kind) and triggerCaption (a short text label per kind), for the old
 * chart's "glyph + caption beside an arrow" treatment. The rebuilt chart draws
 * neither -- the reference uses real item sprites and the painted condition icons,
 * with no line glyphs and no captions -- so both are deleted rather than left as
 * exports nothing renders. TriggerIcon.tsx went with them.
 *
 * triggerKind survives because it is still the honest answer to "what kind of
 * requirement is this", independent of how it is drawn: the chart puts it on
 * data-kind, and the suites read that.
 *
 * PRECEDENCE IS MOST-DISTINGUISHING-FIRST. A requirement often carries several
 * conditions at once (Espeon is level-up + friendship + daytime), so the kind is
 * the one that separates this branch from its siblings. Order matters: trade and
 * use-item are decided by the trigger, everything else by which extra condition is
 * set.
 */

import type { EvolutionDetail } from '../../data'

export type TriggerKind =
  | 'level'
  | 'stone'
  | 'move'
  | 'trade'
  | 'trade-item'
  | 'location'
  | 'friendship'
  | 'held-item'
  | 'shed'
  | 'other'

/**
 * Pick the single most specific kind for a requirement.
 *
 * A requirement often carries several conditions at once (Espeon is level-up +
 * friendship + daytime), so the icon shows the *distinguishing* one and the full
 * clause is still rendered as text beside it. Order matters: trade and use-item
 * are decided by the trigger, everything else by which extra condition is set.
 */
export function triggerKind(detail: EvolutionDetail): TriggerKind {
  if (detail.trigger === 'trade') return detail.held_item_id != null ? 'trade-item' : 'trade'
  if (detail.trigger === 'use-item') return 'stone'
  if (detail.trigger === 'shed') return 'shed'
  if (detail.known_move_id != null || detail.known_move_type_id != null) return 'move'
  if (detail.location_id != null) return 'location'
  if (detail.held_item_id != null) return 'held-item'
  if (detail.min_happiness != null || detail.min_affection != null) return 'friendship'
  if (detail.trigger === 'level-up') return 'level'
  return 'other'
}
