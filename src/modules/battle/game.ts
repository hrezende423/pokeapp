/**
 * THE GAME CONTEXT -- one object, chosen by the selected game, that decides every
 * mechanic the matchup engine applies (S4). Nothing downstream asks "which
 * generation is this?" and branches on its own; it reads a field here.
 *
 * Every value is a game fact with its source named beside it. Where the source is
 * the disassembly, the file is named; where it is the ported Showdown engine
 * (calculators/damage), that module is the authority and is not re-derived.
 */

import { FIELD_RULES, type FieldRules } from '../calculators/damage'
import { MAX_DV, MAX_EV, MAX_IV, MAX_STAT_EXP } from '../team-builder/statMath'

export type Gen = 1 | 2 | 3 | 4

export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe'

export interface Badge {
  id: string
  label: string
  /** Stats the badge raises on the player's Pokemon. */
  stats: BoostStat[]
  /** Gen 2: the move type it raises by 1/8. */
  type?: string
}

export interface GameContext {
  versionGroup: string
  generation: Gen
  label: string
  /** The damage roll set: Gen 1-2 217..255 over 255 (39 rolls), Gen 3-4 85..100 over 100 (16). */
  rolls: { count: number; lo: number; hi: number; denom: number }
  /** Physical/special decided by the move's TYPE (Gen 1-3) or by the MOVE (Gen 4). */
  category: 'by-type' | 'by-move'
  hasItems: boolean
  hasAbilities: boolean
  hasNatures: boolean
  /** 'statexp': Stat Exp + DVs (Gen 1-2); 'ev': EVs + IVs (Gen 3-4). */
  spreadModel: 'statexp' | 'ev'
  maxEffort: number
  maxIndividual: number
  /** Gen 3-4: 510. Gen 1-2: none -- every stat can hold 65535 Stat Exp. */
  effortTotalCap: number | null
  badges: Badge[]
  /** Which badge-boost formula: Gen 1-2 x9/8 after stages; Gen 3 x110/100 in the damage calc. */
  badgeRule: 'gen12' | 'gen3' | null
  field: FieldRules
  trickRoom: boolean
  tailwind: boolean
  /** How the opponent picks its next Pokemon after a faint (P4). */
  sendOut: 'party-order' | 'gen2-matchup' | 'gen3-best' | 'gen4-best'
  ai: 'gen1' | 'gen2' | 'gen3' | 'gen4'
  /** Residual damage fractions (numerator/denominator of max HP). */
  residual: {
    poison: [number, number]
    burn: [number, number]
    leechSeed: [number, number]
    /** Toxic: counter/16 in every generation in scope. */
    toxicDenom: number
    sand: [number, number] | null
    hail: [number, number] | null
    leftovers: [number, number] | null
  }
  /** Turns a sleep inflicted by a move lasts (inclusive range of the counter). */
  sleepTurns: [number, number]
}

const KANTO_GEN1: Badge[] = [
  // pokered engine/battle/core.asm ApplyBadgeStatBoosts: every other badge,
  // Boulder -> Attack, Thunder -> Defense, Soul -> Speed, Volcano -> Special.
  { id: 'boulder', label: 'Boulder', stats: ['atk'] },
  { id: 'cascade', label: 'Cascade', stats: [] },
  { id: 'thunder', label: 'Thunder', stats: ['def'] },
  { id: 'rainbow', label: 'Rainbow', stats: [] },
  { id: 'soul', label: 'Soul', stats: ['spe'] },
  { id: 'marsh', label: 'Marsh', stats: [] },
  { id: 'volcano', label: 'Volcano', stats: ['spa', 'spd'] },
  { id: 'earth', label: 'Earth', stats: [] },
]

// pokecrystal engine/battle/core.asm BadgeStatBoosts (Zephyr Attack, Plain Speed,
// Mineral Defense, Glacier Special) and data/types/badge_type_boosts.asm (every
// badge, both regions, boosts one type by 1/8 in DoBadgeTypeBoosts). Glacier's
// Special Defense half is conditional -- see `glacierBoostsSpDef`.
const GEN2_BADGES: Badge[] = [
  { id: 'zephyr', label: 'Zephyr', stats: ['atk'], type: 'flying' },
  { id: 'hive', label: 'Hive', stats: [], type: 'bug' },
  { id: 'plain', label: 'Plain', stats: ['spe'], type: 'normal' },
  { id: 'fog', label: 'Fog', stats: [], type: 'ghost' },
  { id: 'storm', label: 'Storm', stats: [], type: 'fighting' },
  { id: 'mineral', label: 'Mineral', stats: ['def'], type: 'steel' },
  { id: 'glacier', label: 'Glacier', stats: ['spa', 'spd'], type: 'ice' },
  { id: 'rising', label: 'Rising', stats: [], type: 'dragon' },
  { id: 'boulder', label: 'Boulder', stats: [], type: 'rock' },
  { id: 'cascade', label: 'Cascade', stats: [], type: 'water' },
  { id: 'thunder', label: 'Thunder', stats: [], type: 'electric' },
  { id: 'rainbow', label: 'Rainbow', stats: [], type: 'grass' },
  { id: 'soul', label: 'Soul', stats: [], type: 'poison' },
  { id: 'marsh', label: 'Marsh', stats: [], type: 'psychic' },
  { id: 'volcano', label: 'Volcano', stats: [], type: 'fire' },
  { id: 'earth', label: 'Earth', stats: [], type: 'ground' },
]

// pokeemerald src/pokemon.c CalculateBaseDamage + battle_main.c GetWhoStrikesFirst:
// badge 1 Attack, badge 3 Speed, badge 5 Defense, badge 7 Sp. Atk and Sp. Def.
const HOENN: Badge[] = [
  { id: 'stone', label: 'Stone', stats: ['atk'] },
  { id: 'knuckle', label: 'Knuckle', stats: [] },
  { id: 'dynamo', label: 'Dynamo', stats: ['spe'] },
  { id: 'heat', label: 'Heat', stats: [] },
  { id: 'balance', label: 'Balance', stats: ['def'] },
  { id: 'feather', label: 'Feather', stats: [] },
  { id: 'mind', label: 'Mind', stats: ['spa', 'spd'] },
  { id: 'rain', label: 'Rain', stats: [] },
]
// pokefirered: the same badge-number rule over Kanto's badges.
const KANTO_FRLG: Badge[] = [
  { id: 'boulder', label: 'Boulder', stats: ['atk'] },
  { id: 'cascade', label: 'Cascade', stats: [] },
  { id: 'thunder', label: 'Thunder', stats: ['spe'] },
  { id: 'rainbow', label: 'Rainbow', stats: [] },
  { id: 'soul', label: 'Soul', stats: ['def'] },
  { id: 'marsh', label: 'Marsh', stats: [] },
  { id: 'volcano', label: 'Volcano', stats: ['spa', 'spd'] },
  { id: 'earth', label: 'Earth', stats: [] },
]

const GAMES: Record<string, { gen: Gen; label: string; badges: Badge[] }> = {
  'red-blue': { gen: 1, label: 'Red/Blue', badges: KANTO_GEN1 },
  yellow: { gen: 1, label: 'Yellow', badges: KANTO_GEN1 },
  'gold-silver': { gen: 2, label: 'Gold/Silver', badges: GEN2_BADGES },
  crystal: { gen: 2, label: 'Crystal', badges: GEN2_BADGES },
  'ruby-sapphire': { gen: 3, label: 'Ruby/Sapphire', badges: HOENN },
  emerald: { gen: 3, label: 'Emerald', badges: HOENN },
  'firered-leafgreen': { gen: 3, label: 'FireRed/LeafGreen', badges: KANTO_FRLG },
  'diamond-pearl': { gen: 4, label: 'Diamond/Pearl', badges: [] },
  platinum: { gen: 4, label: 'Platinum', badges: [] },
  'heartgold-soulsilver': { gen: 4, label: 'HeartGold/SoulSilver', badges: [] },
}

export const MATCHUP_GAMES = Object.keys(GAMES)

export function hasGameContext(vg: string): boolean {
  return vg in GAMES
}

export function gameContext(versionGroup: string): GameContext {
  const g = GAMES[versionGroup]
  if (!g) throw new Error(`no game context for ${versionGroup}`)
  const gen = g.gen
  const classic = gen <= 2
  return {
    versionGroup,
    generation: gen,
    label: g.label,
    rolls: classic
      ? { count: 39, lo: 217, hi: 255, denom: 255 }
      : { count: 16, lo: 85, hi: 100, denom: 100 },
    category: gen >= 4 ? 'by-move' : 'by-type',
    hasItems: gen >= 2,
    hasAbilities: gen >= 3,
    hasNatures: gen >= 3,
    spreadModel: classic ? 'statexp' : 'ev',
    maxEffort: classic ? MAX_STAT_EXP : MAX_EV,
    maxIndividual: classic ? MAX_DV : MAX_IV,
    effortTotalCap: classic ? null : 510,
    badges: g.badges,
    badgeRule: gen <= 2 ? 'gen12' : gen === 3 ? 'gen3' : null,
    field: FIELD_RULES[gen],
    trickRoom: gen === 4,
    tailwind: gen === 4,
    sendOut:
      gen === 1
        ? 'party-order'
        : gen === 2
          ? 'gen2-matchup'
          : gen === 3
            ? 'gen3-best'
            : 'gen4-best',
    ai: gen === 1 ? 'gen1' : gen === 2 ? 'gen2' : gen === 3 ? 'gen3' : 'gen4',
    residual:
      gen === 1
        ? {
            // pokered engine/battle/core.asm HandlePoisonBurnLeechSeed: 1/16.
            poison: [1, 16],
            burn: [1, 16],
            leechSeed: [1, 16],
            toxicDenom: 16,
            sand: null,
            hail: null,
            leftovers: null,
          }
        : gen === 2
          ? {
              // pokecrystal ResidualDamage: 1/8; sandstorm 1/8; Leftovers 1/16.
              poison: [1, 8],
              burn: [1, 8],
              leechSeed: [1, 8],
              toxicDenom: 16,
              sand: [1, 8],
              hail: null,
              leftovers: [1, 16],
            }
          : {
              // Gen 3-4: sandstorm and hail 1/16.
              poison: [1, 8],
              burn: [1, 8],
              leechSeed: [1, 8],
              toxicDenom: 16,
              sand: [1, 16],
              hail: [1, 16],
              leftovers: [1, 16],
            },
    // Sleep counters set by a sleep move: Gen 1 1-7 (pokered SleepEffect: rand & 7,
    // re-rolled on 0), Gen 2 1-6 (pokecrystal BattleCommand_SleepTarget: rand & 7,
    // re-rolled on 0 and 7), Gen 3 2-5 (pokeemerald: (Random() & 3) + 2), Gen 4
    // 2-5 (pokeplatinum, the same counter).
    sleepTurns: gen === 1 ? [1, 7] : gen === 2 ? [1, 6] : [2, 5],
  }
}

/**
 * Gen 2's Glacier Badge Special Defense boost fires only for some Special Attack
 * values -- pokecrystal docs/bugs_and_glitches.md: "unless the unboosted Special
 * Attack stat is 206-432, or 661 or above". BoostStat clobbers the register the
 * loop meant to test.
 */
export function glacierBoostsSpDef(unboostedSpAtk: number): boolean {
  return (unboostedSpAtk >= 206 && unboostedSpAtk <= 432) || unboostedSpAtk >= 661
}
