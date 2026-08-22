/**
 * Icon + short caption for one evolution requirement.
 *
 * Icons are real Tabler icons imported from @tabler/icons-react -- no hand-drawn
 * or invented paths. The Poke Ball motif is deliberately absent: it is reserved
 * for caught / not-caught status elsewhere in the app, so nothing here may look
 * like one (which also rules out Tabler's IconCircleDot).
 *
 * KIND -> ICON
 *   level         IconTrendingUp      level-up, caption is the level number
 *   stone         IconDiamond         use-item, caption is the stone name
 *   move          IconSwords          requires knowing a move, caption is the move
 *   trade         IconArrowsExchange  plain trade, icon alone
 *   trade-item    IconGift            trade while holding an item, caption is the item
 *   location      IconMapPin          location-gated, caption is the location
 *   friendship    IconHeart           friendship threshold, caption is the value
 *   held-item     IconHandGrab        level up while holding an item (Razor Fang etc.)
 *   shed          IconGhost           Nincada -> Shedinja
 *   other         IconHelpCircle      fallback, never reached by Gen 1-4 data
 *
 * The last four exist because the Gen 1-4 chains need them: `use-item` is always
 * a stone in this era (verified: all 27 use-item details point at one of the 9
 * *-stone items), but level-up splits into plain levels, friendship, locations,
 * known moves and held items, and each deserves its own glyph.
 */

import { getItem, getLocation, getMove } from '../../data'
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

/** The Tabler export name per kind, for reporting and for the DOM attribute. */
export const TRIGGER_ICON_NAMES: Record<TriggerKind, string> = {
  level: 'IconTrendingUp',
  stone: 'IconDiamond',
  move: 'IconSwords',
  trade: 'IconArrowsExchange',
  'trade-item': 'IconGift',
  location: 'IconMapPin',
  friendship: 'IconHeart',
  'held-item': 'IconHandGrab',
  shed: 'IconGhost',
  other: 'IconHelpCircle',
}

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

/**
 * Short caption beside the icon: the one value that identifies this branch.
 * Empty for plain trade, which the brief specifies as icon-only.
 */
export function triggerCaption(detail: EvolutionDetail, kind: TriggerKind): string {
  switch (kind) {
    case 'level':
      return detail.min_level != null ? `Lv ${detail.min_level}` : 'Level up'
    case 'stone':
      return getItem(detail.item_id ?? -1)?.display_name ?? 'Stone'
    case 'move':
      return detail.known_move_id != null
        ? (getMove(detail.known_move_id)?.display_name ?? 'a move')
        : 'a move type'
    case 'trade':
      return ''
    case 'trade-item':
      return getItem(detail.held_item_id ?? -1)?.display_name ?? 'an item'
    case 'location':
      return getLocation(detail.location_id ?? -1)?.display_name ?? 'a location'
    case 'friendship':
      return detail.min_happiness != null ? `Friendship ${detail.min_happiness}` : 'Affection'
    case 'held-item':
      return getItem(detail.held_item_id ?? -1)?.display_name ?? 'an item'
    case 'shed':
      return 'Shed'
    case 'other':
      return detail.trigger ?? 'Unknown'
  }
}
