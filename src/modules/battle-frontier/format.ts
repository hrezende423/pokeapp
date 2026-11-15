/**
 * Labels and orderings shared by the three Frontier screens. Pure strings: the
 * wording is the approved mockups' (scripts/mockups/frontier.mjs), so the suite can
 * compare a screen's text with its mockup's.
 */

import type { FacilityId, FrontierFacility, FrontierFormat, LevelMode, StreakUnit } from './data'

/** Facility order on every screen: the mockups'. */
export const FACILITY_ORDER: readonly FacilityId[] = [
  'tower',
  'dome',
  'factory',
  'palace',
  'arena',
  'pike',
  'pyramid',
]

export const FORMAT_LABEL: Record<FrontierFormat, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  multi: 'Multi',
  'link-multi': 'Link Multi',
}

export const LEVEL_LABEL: Record<LevelMode, string> = { lv50: 'Lv50', open: 'Open Level' }

/** EV order as the game stores it, with the short labels. */
export const STATS = [
  ['hp', 'HP'],
  ['attack', 'Atk'],
  ['defense', 'Def'],
  ['special-attack', 'SpA'],
  ['special-defense', 'SpD'],
  ['speed', 'Spe'],
] as const

/** en-US grouping, as the mockups print numbers. */
export const fmt = (n: number): string => Number(n).toLocaleString('en-US')

export function partyText(f: FrontierFacility): string {
  if (f.id === 'dome') return 'Register 3, choose 2 before each match'
  if (f.id === 'factory') return `3 rentals (${f.formats.map((x) => FORMAT_LABEL[x.id]).join(' and ')})`
  const sizes = f.formats.map((x) => `${FORMAT_LABEL[x.id]} ${x.partySize}`)
  return new Set(f.formats.map((x) => x.partySize)).size === 1 ? `${f.formats[0].partySize}` : sizes.join(' · ')
}

export const SET_TEXT: Record<StreakUnit, (f: FrontierFacility) => string> = {
  battle: (f) => `${f.perSet} battles per set; the streak counts battles`,
  tournament: () => '4 rounds per tournament; the streak counts tournaments won',
  room: (f) => `${f.perSet} rooms per challenge; the streak counts rooms cleared`,
  floor: (f) => `${f.perSet} floors per challenge; the streak counts floors cleared`,
}

/** The label a battle number gets, counted as the owner's log counts it. */
export function battleLabel(facility: FacilityId, n: number): string {
  if (facility === 'dome')
    return `Tournament ${Math.ceil(n / 4)} · ${['Round 1', 'Round 2', 'Semifinal', 'Final'][(n - 1) % 4]}`
  if (facility === 'pike') return `Challenge ${Math.ceil(n / 14)} · room ${((n - 1) % 14) + 1}`
  if (facility === 'pyramid') return `Challenge ${Math.ceil(n / 7)} · floor ${((n - 1) % 7) + 1}`
  return `Set ${Math.ceil(n / 7)} · battle ${((n - 1) % 7) + 1}`
}

/** A logged battle number -> the loader's streak (wins before it, in the facility's own unit). */
export const loaderStreak = (facility: FacilityId, n: number): number =>
  facility === 'dome' ? Math.floor((n - 1) / 4) : n - 1
