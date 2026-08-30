/**
 * The glyph for one evolution requirement: a painted icon where the set has one,
 * the Tabler trigger glyph everywhere else.
 *
 * TWO REGISTERS, ON PURPOSE. The ten Tabler icons are the generic vocabulary --
 * level up, a stone, a move, friendship -- and stay line art. The eleven painted
 * icons in public/evo-icons/ cover the specific, memorable conditions (the Moss
 * Rock, Mt. Coronet's magnetic field, Remoraid in the party, high beauty, day and
 * night, trade, gender) and are shaded to sit beside official item art. Where a
 * painted icon exists it wins, because it says more; where none exists the line
 * icon carries it rather than leaving a gap.
 *
 * All ten Tabler icons are real imports from @tabler/icons-react -- no hand-drawn
 * or invented paths. See evolutionTriggers.ts for which kind maps to which and
 * why; TRIGGER_ICON_NAMES there is the reviewable copy of that table, and is also
 * emitted as `data-icon` on the rendered svg.
 *
 * No Poke Ball motif appears here, deliberately: that is reserved for
 * caught / not-caught status elsewhere in the app, which also rules out
 * Tabler's IconCircleDot.
 *
 * THIS FILE IS ONE OF TWO ALLOWED TO IMPORT ./evoGenderIcon (eslint.config.js has
 * the allowlist). The painted gender icons are scoped to the evolution chart and
 * must not become the app's general gender glyph.
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
import type { EvolutionDetail } from '../../data'
import {
  evoConditionIconKey,
  evoConditionIconUrl,
  type EvoConditionIconKey,
} from './evoConditionIcons'
import { EVO_GENDER_MALE, evoGenderIconUrl, evoGenderLabel } from './evoGenderIcon'
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

/**
 * The icon for one requirement, painted or line, resolved in that order.
 *
 * Gender is checked first because it is the distinguishing field on every detail
 * that sets it (Gallade needs a Dawn Stone *and* to be male, but so does nothing
 * else in Kirlia's chain -- the stone is in the caption, the gender is the branch).
 *
 * `alt` is empty and the meaning is carried by a sibling .visually-hidden span:
 * the caption beside the icon already names the condition in most cases, and a
 * duplicated alt would have a screen reader say it twice. Where there is no
 * caption -- plain trade, gender -- the hidden label is the only statement of the
 * requirement, so it is never omitted.
 *
 * `data-evo-icon` is the painted key (or 'gender-male' / 'gender-female'), so
 * verification can assert which register rendered without reading pixels.
 */
export function EvoRequirementIcon({
  detail,
  kind,
}: {
  detail: EvolutionDetail
  kind: TriggerKind
}) {
  const genderUrl = evoGenderIconUrl(detail.gender)
  const genderText = evoGenderLabel(detail.gender)
  if (genderUrl && genderText) {
    return (
      <PaintedIcon
        src={genderUrl}
        label={genderText}
        iconKey={detail.gender === EVO_GENDER_MALE ? 'gender-male' : 'gender-female'}
      />
    )
  }

  const key = evoConditionIconKey(detail)
  if (key) {
    return (
      <PaintedIcon src={evoConditionIconUrl(key)} label={EVO_CONDITION_LABELS[key]} iconKey={key} />
    )
  }

  return <TriggerIcon kind={kind} />
}

/** Short spoken form per painted condition, for the hidden label. */
const EVO_CONDITION_LABELS: Record<EvoConditionIconKey, string> = {
  day: 'During the day',
  night: 'At night',
  trade: 'By trading',
  'random-split': 'Random outcome',
  'location-moss-rock': 'Near the Moss Rock',
  'location-ice-rock': 'Near the Ice Rock',
  'location-mount-coronet': "In Mt. Coronet's magnetic field",
  beauty: 'With high beauty',
  'party-species-remoraid': 'With Remoraid in the party',
}

/**
 * One painted icon, sized to sit on the same baseline as the 16px line icons.
 *
 * 20px rather than 16: these are shaded artwork, not 1.8px strokes, and at 16 the
 * detail turns to mush. The source is 128px, so 20px is a 6.4x reduction the
 * browser handles cleanly, and there is headroom for a retina display.
 */
function PaintedIcon({ src, label, iconKey }: { src: string; label: string; iconKey: string }) {
  return (
    <>
      <img
        src={src}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        className="evo-painted-icon"
        data-evo-icon={iconKey}
      />
      <span className="visually-hidden">{label}</span>
    </>
  )
}
