/**
 * The glyph for one evolution trigger kind.
 *
 * All ten are real Tabler icons imported from @tabler/icons-react -- no
 * hand-drawn or invented paths. See evolutionTriggers.ts for which kind maps to
 * which icon and why; TRIGGER_ICON_NAMES there is the reviewable copy of this
 * table, and is also emitted as `data-icon` on the rendered svg.
 *
 * No Poke Ball motif appears here, deliberately: that is reserved for
 * caught / not-caught status elsewhere in the app, which also rules out
 * Tabler's IconCircleDot.
 */

import {
  IconArrowsExchange,
  IconDiamond,
  IconGhost,
  IconGift,
  IconHandGrab,
  IconHeart,
  IconHelpCircle,
  IconMapPin,
  IconSwords,
  IconTrendingUp,
  type Icon,
} from '@tabler/icons-react'
import { TRIGGER_ICON_NAMES, type TriggerKind } from './evolutionTriggers'

const TRIGGER_ICONS: Record<TriggerKind, Icon> = {
  level: IconTrendingUp,
  stone: IconDiamond,
  move: IconSwords,
  trade: IconArrowsExchange,
  'trade-item': IconGift,
  location: IconMapPin,
  friendship: IconHeart,
  'held-item': IconHandGrab,
  shed: IconGhost,
  other: IconHelpCircle,
}

export function TriggerIcon({ kind }: { kind: TriggerKind }) {
  const Component = TRIGGER_ICONS[kind]
  return (
    <Component
      size={16}
      stroke={1.8}
      aria-hidden
      focusable="false"
      className="trigger-icon"
      data-icon={TRIGGER_ICON_NAMES[kind]}
    />
  )
}
