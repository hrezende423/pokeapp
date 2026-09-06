/**
 * How hard each attacking type hits a BUILD -- types and ability together.
 *
 * `typeEffectivenessAgainst` in src/data already multiplies the chart across
 * both of a species' types, so a dual-type immunity is handled there and always
 * was: Zapdos is Electric/Flying, Ground is 2x on Electric and 0x on Flying, and
 * 2 x 0 is 0. What it cannot know about is the ABILITY, because an ability
 * belongs to a build rather than to a species -- Bronzong read as 2x weak to
 * Ground and Heatran as neutral to Fire, both of which are wrong the moment you
 * know they are holding Levitate and Flash Fire.
 *
 * So this is a thin layer on top: resolve the chart, then let the ability
 * override individual types. It never reaches into src/data.
 *
 * ERA-SCOPED, like everything else in this module. Abilities do not exist before
 * Gen 3, and three of the ones below arrived in Gen 4, so each carries the
 * generation it starts in and is ignored before it.
 *
 * DELIBERATELY NOT INCLUDED, because each would put the chart on a multiplier
 * that is not a chart tier and the panel groups by tier:
 *   - Filter and Solid Rock take super-effective hits to 0.75x (so 1.5x / 3x).
 *   - Dry Skin's Fire penalty is 1.25x (so 2.5x). Its Water immunity IS here.
 * LIGHTNING ROD AND STORM DRAIN ARE ABSENT ON PURPOSE, and this is an era trap
 * rather than an omission: in Gen 3-4 both only REDIRECT the move, and the
 * holder still takes normal damage. They do not grant immunity until Gen 5,
 * which is outside this app's scope entirely.
 */

import { typeEffectivenessAgainst } from '../../data'
import type { Effectiveness } from '../../data'

interface AbilityDefence {
  /** The generation the ability starts working in. */
  since: number
  /** Type name -> the multiplier this ability FORCES, replacing the chart's. */
  types?: Record<string, number>
  /** Shedinja's rule: anything not super-effective does nothing at all. */
  wonderGuard?: boolean
}

/** Keyed by ability id, which is stable in the bundle. */
const ABILITY_DEFENCE: Record<number, AbilityDefence> = {
  10: { since: 3, types: { electric: 0 } }, // Volt Absorb
  11: { since: 3, types: { water: 0 } }, // Water Absorb
  18: { since: 3, types: { fire: 0 } }, // Flash Fire
  25: { since: 3, wonderGuard: true }, // Wonder Guard
  26: { since: 3, types: { ground: 0 } }, // Levitate
  47: { since: 3, types: { fire: 0.5, ice: 0.5 } }, // Thick Fat
  78: { since: 4, types: { electric: 0 } }, // Motor Drive
  85: { since: 4, types: { fire: 0.5 } }, // Heatproof
  87: { since: 4, types: { water: 0 } }, // Dry Skin
}

/**
 * The chart for a build: its types, then its ability's say over them.
 *
 * THE ABILITY REPLACES THE CHART'S NUMBER RATHER THAN MULTIPLYING IT. Flash Fire
 * on Heatran is the case that settles it -- Fire is 2x on Steel and 0.5x on Fire,
 * which the chart resolves to a neutral 1x, and the ability makes it 0. Halving
 * abilities work the same way for a different reason: Thick Fat is stated as
 * "halves the damage", so on a type already resisted it is 0.5x of the type
 * result, which is why those multiply rather than replace. Immunity is absolute;
 * a reduction is relative.
 */
export function defensiveChart(
  typeIds: number[],
  abilityId: number | null,
  generation: number,
): Effectiveness[] {
  const rows = typeEffectivenessAgainst(typeIds, generation)
  const ability = abilityId != null ? ABILITY_DEFENCE[abilityId] : null
  if (!ability || generation < ability.since) return rows

  if (ability.wonderGuard) {
    return rows.map((row) => ({ ...row, multiplier: row.multiplier > 1 ? row.multiplier : 0 }))
  }

  return rows.map((row) => {
    const forced = ability.types?.[row.type.name]
    if (forced == null) return row
    /* 0 is absolute; anything else is a reduction applied to what the types
       already did. See the note above. */
    return { ...row, multiplier: forced === 0 ? 0 : row.multiplier * forced }
  })
}

/** Does this ability change any incoming type multiplier in this generation? */
export function abilityAffectsDefence(abilityId: number | null, generation: number): boolean {
  const ability = abilityId != null ? ABILITY_DEFENCE[abilityId] : null
  return ability != null && generation >= ability.since
}
