/**
 * Emerald's Trainer Hill and FireRed/LeafGreen's Trainer Tower: speed-climb
 * facilities, not streak gauntlets. Static rules here, PURE; the modes, floors
 * and trainers come from the Trainer Dex's own facility (`trainer-hill` in the
 * Emerald partition, `trainer-tower` in FireRed/LeafGreen's), grouped by
 * `modeFloors`.
 *
 * SOURCES (pret disassemblies):
 * - pokeemerald @ 9103e529c2fbdd7add4a1ff3350c6c1f92112c42
 *   include/constants/trainer_hill.h (HILL_MODE_*, NUM_TRAINER_HILL_FLOORS 4,
 *   HILL_TRAINERS_PER_FLOOR 2); src/trainer_hill.c (HILL_MAX_TIME 215999 frames,
 *   GetPrizeItemId: minutes = timer / 3600 -> the prize rows below;
 *   GiveChallengePrize: all floors cleared, once per data set;
 *   BATTLE_TYPE_TWO_OPPONENTS: every battle a Double against two trainers).
 * - pokefirered @ ce6406d8c2eaf46d543c8a2606de0c3cb1951982
 *   include/constants/trainer_tower.h (CHALLENGE_TYPE_*, MAX_TRAINER_TOWER_FLOORS
 *   8); src/trainer_tower.c (BuildEnemyParty -> GetPartyMaxLevel: every enemy at
 *   your highest level; TRAINER_TOWER_MAX_TIME 215999; GiveChallengePrize: the
 *   first floor's prize, once per data set; CheckFinalTime: time is a record,
 *   not a prize threshold); src/trainer_tower_sets.c (the prizes).
 * - Bulbapedia (prose): the entry requirements; the Hill's "no healing between
 *   floors". The Hill's own code comment says it cannot be entered before the
 *   Hall of Fame; GetPrizeItemId's FLAG_SYS_GAME_CLEAR check serves the Japanese
 *   release, which is not gated, and picks the prize list.
 */

import type { Facility, FacilityTrainer } from '../../../data/trainers'

export type SpeedFacilityId = 'trainer-hill' | 'trainer-tower'

export interface SpeedFacilityRef {
  id: SpeedFacilityId
  /** The Trainer Dex partition that holds its trainers. */
  versionGroup: 'emerald' | 'firered-leafgreen'
  name: string
  rule: string
  entry: string
  /** Label -> text rows. */
  facts: [string, string][]
  reward: [string, string][]
}

/** 215,999 frames at 60 per second: the timer's cap in both games. */
export const SPEED_TIMER_CAP_CS = Math.floor((215999 * 100) / 60)

export const TRAINER_HILL: SpeedFacilityRef = {
  id: 'trainer-hill',
  versionGroup: 'emerald',
  name: 'Trainer Hill',
  rule: 'Climb four floors and reach the roof against the clock. Two trainers per floor, every battle a Double Battle against both, with no healing between floors.',
  entry: 'After the Hall of Fame.',
  facts: [
    ['Format', 'Double Battle against two trainers'],
    ['Challenge', '4 floors, 2 trainers each; the timer runs to the roof'],
    ['Timer', 'Stops at 59:59.98'],
  ],
  reward: [
    ['Prize', 'Once per set of trainers, for clearing all four floors; by your time:'],
    ['Under 12 min', 'The floor set’s grand prize (Rare Candy, Luxury Ball, Max Revive, Max Ether, Elixir or a TM)'],
    ['12 min', 'Ether'],
    ['13 min', 'Max Potion'],
    ['14–15 min', 'Revive'],
    ['16–17 min', 'Fluffy Tail'],
    ['18 min or more', 'Great Ball'],
  ],
}

export const TRAINER_TOWER: SpeedFacilityRef = {
  id: 'trainer-tower',
  versionGroup: 'firered-leafgreen',
  name: 'Trainer Tower',
  rule: 'Climb eight floors against the clock. Every opponent’s Pokémon is set to your highest-level Pokémon, with no cap.',
  entry: 'Seven Island, reached with the Rainbow Pass (after the Hall of Fame and the National Pokédex).',
  facts: [
    ['Format', 'Single: 1 trainer per floor · Double: 2 · Knockout: 3 in a row · Mixed: floors from the other three'],
    ['Challenge', '8 floors; the timer runs to the top'],
    ['Timer', 'Stops at 59:59.98'],
  ],
  reward: [
    ['Prize', 'Once, for clearing all eight floors; your time sets the record only'],
    ['Single', 'Up-Grade'],
    ['Double', 'Dragon Scale'],
    ['Knockout', 'Metal Coat'],
    ['Mixed', 'King’s Rock'],
  ],
}

export const SPEED_FACILITY: Record<SpeedFacilityId, SpeedFacilityRef> = {
  'trainer-hill': TRAINER_HILL,
  'trainer-tower': TRAINER_TOWER,
}

export interface FloorTrainers {
  floor: number
  trainers: FacilityTrainer[]
}

export interface ModeFloors {
  mode: string
  floors: FloorTrainers[]
}

/**
 * The facility's trainers by mode then floor, from each trainer's `group`
 * ("Normal · Floor 1"), in the bundle's order. A trainer whose group does not
 * read that way is left out rather than guessed.
 */
export function modeFloors(facility: Facility): ModeFloors[] {
  const modes: ModeFloors[] = []
  for (const t of facility.trainers) {
    const m = /^(.+?) · Floor (\d+)$/.exec(t.group ?? '')
    if (!m) continue
    const [, mode, floorText] = m
    const floor = Number(floorText)
    let entry = modes.find((x) => x.mode === mode)
    if (!entry) modes.push((entry = { mode, floors: [] }))
    let f = entry.floors.find((x) => x.floor === floor)
    if (!f) entry.floors.push((f = { floor, trainers: [] }))
    f.trainers.push(t)
  }
  for (const m of modes) m.floors.sort((a, b) => a.floor - b.floor)
  return modes
}
