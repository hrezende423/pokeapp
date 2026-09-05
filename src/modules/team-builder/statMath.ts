/**
 * Generation-correct stat, DV, shiny and Hidden Power arithmetic.
 *
 * CLAUDE.md: "Genuine per-generation mechanical accuracy is required, not a
 * modern-only model." Gen 1-2 use Stat Experience and DVs; Gen 3-4 use EVs and
 * IVs; Gen 1 has one Special stat and Gen 2 splits the stat but NOT the DV. Every
 * one of those differences changes a formula, so they live here as separate paths
 * rather than as one formula with fudge factors.
 *
 * PURE, AND UI-FREE. Every function takes numbers and returns numbers, so the
 * verification suite can assert the arithmetic without rendering anything.
 */

/**
 * Stat keys as the bundle names them. `special` is Gen 1's unsplit stat.
 *
 * DEFINED HERE, not in a shared model file. It lived in `model.ts` alongside the
 * Build/Team domain types until those were discarded with the first pass at the
 * screens; these two aliases were the only part of that file this module needed,
 * so they moved here rather than leaving a 180-line file alive to hold six lines.
 * The screens being rebuilt should import them FROM here -- the stat vocabulary
 * belongs with the stat arithmetic, not with whatever shape a saved build takes.
 */
export type StatKey =
  'hp' | 'attack' | 'defense' | 'special' | 'special-attack' | 'special-defense' | 'speed'

/** Per-stat numbers. Sparse: a missing key reads as 0. */
export type StatNumbers = Partial<Record<StatKey, number>>

export const MAX_STAT_EXP = 65535
export const MAX_DV = 15
export const MAX_EV = 252
export const MAX_EV_TOTAL = 510
export const MAX_IV = 31

/** Gen 2's shiny condition on the Attack DV. The other three must all be 10. */
export const SHINY_ATTACK_DVS: readonly number[] = [2, 3, 6, 7, 10, 11, 14, 15]
export const SHINY_FIXED_DV = 10

const at = (numbers: StatNumbers, key: StatKey): number => numbers[key] ?? 0

/**
 * Gen 1-2's Stat Exp contribution: floor(ceil(sqrt(statExp)) / 4).
 *
 * The inner ceil is not decoration -- it is why 63504 (252^2) and 63505 give
 * different results, and why maxing a stat means 65535 rather than "enough".
 */
export function statExpBonus(statExp: number): number {
  return Math.floor(Math.ceil(Math.sqrt(Math.max(0, statExp))) / 4)
}

/**
 * HP DV in Gen 1-2, which is NOT a stored value.
 *
 * It is the low bit of each of the other four DVs, packed Attack-Defense-Speed-
 * Special into a nibble. That is why the form renders it read-only: there is no
 * way to set it except by changing the other four, and an editable HP DV slider
 * would be a control that silently does nothing.
 */
export function hpDvFrom(individual: StatNumbers): number {
  return (
    8 * (at(individual, 'attack') % 2) +
    4 * (at(individual, 'defense') % 2) +
    2 * (at(individual, 'speed') % 2) +
    1 * (at(individual, 'special') % 2)
  )
}

/** The DV for one stat, with HP resolved through the parity rule. */
export function dvFor(individual: StatNumbers, key: StatKey): number {
  return key === 'hp' ? hpDvFrom(individual) : at(individual, key)
}

/**
 * Gen 2 shininess, computed rather than stored.
 *
 * Defense, Speed and Special DVs all exactly 10, and the Attack DV one of eight
 * values. Nothing about the Gen 2 flag is independent of the spread, which is why
 * the form shows an indicator and not a toggle.
 */
export function isShinyByDvs(individual: StatNumbers): boolean {
  return (
    at(individual, 'defense') === SHINY_FIXED_DV &&
    at(individual, 'speed') === SHINY_FIXED_DV &&
    at(individual, 'special') === SHINY_FIXED_DV &&
    SHINY_ATTACK_DVS.includes(at(individual, 'attack'))
  )
}

/** The nearest allowed Attack DV at or above `value`, wrapping to the lowest. */
export function nextShinyAttackDv(value: number, direction: 1 | -1): number {
  const list = SHINY_ATTACK_DVS
  const index = list.findIndex((v) => v === value)
  if (index < 0) {
    // Not currently on a legal value: snap to the closest one in the direction asked.
    return direction === 1
      ? (list.find((v) => v > value) ?? list[0])
      : ([...list].reverse().find((v) => v < value) ?? list[list.length - 1])
  }
  return list[(index + direction + list.length) % list.length]
}

export interface NatureMods {
  increased: StatKey | null
  decreased: StatKey | null
}

/**
 * The 1.1x / 0.9x nature multiplier for one stat.
 *
 * Returns exactly 1 when the nature is neutral OR when it raises and lowers the
 * same stat, which five of the 25 natures do -- those are neutral in effect and
 * must not be shown as a change.
 */
export function natureMultiplier(mods: NatureMods, key: StatKey): number {
  if (key === 'hp') return 1
  if (mods.increased === mods.decreased) return 1
  if (mods.increased === key) return 1.1
  if (mods.decreased === key) return 0.9
  return 1
}

export interface StatInput {
  generation: number
  level: number
  base: number
  key: StatKey
  effort: StatNumbers
  individual: StatNumbers
  nature: NatureMods
}

/**
 * The computed total for one stat.
 *
 * TWO FORMULAS, PICKED BY GENERATION, and the HP row differs from the rest inside
 * both. Gen 1-2:
 *
 *   shared = floor( ((base + DV) * 2 + statExpBonus) * level / 100 )
 *   HP     = shared + level + 10          other = shared + 5
 *
 * Gen 3-4:
 *
 *   shared = floor( (2*base + IV + floor(EV/4)) * level / 100 )
 *   HP     = shared + level + 10          other = floor( (shared + 5) * natureMod )
 *
 * The nature multiplier applies AFTER the +5 and only in Gen 3-4, because natures
 * do not exist before Gen 3 -- passing a neutral NatureMods for an earlier
 * generation would give the same answer, but the branch says why.
 */
export function computeStat(input: StatInput): number {
  const { generation, level, base, key, effort, individual, nature } = input
  const isHp = key === 'hp'

  if (generation <= 2) {
    const dv = dvFor(individual, key)
    const shared = Math.floor(((base + dv) * 2 + statExpBonus(at(effort, key))) * (level / 100))
    return isHp ? shared + level + 10 : shared + 5
  }

  const shared = Math.floor(
    (2 * base + at(individual, key) + Math.floor(at(effort, key) / 4)) * (level / 100),
  )
  if (isHp) return shared + level + 10
  return Math.floor((shared + 5) * natureMultiplier(nature, key))
}

/** Sum of EVs across the spread, for the 510 cap readout. */
export function effortTotal(effort: StatNumbers, keys: readonly StatKey[]): number {
  return keys.reduce((sum, key) => sum + at(effort, key), 0)
}

/**
 * The 16 Hidden Power types, in the index order both generations' formulas use.
 *
 * Normal is absent and that is correct: Hidden Power has never been able to be
 * Normal-type, which is why the table is 16 long and not 17.
 */
export const HIDDEN_POWER_TYPES: readonly string[] = [
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
]

export interface HiddenPower {
  type: string
  power: number
}

/**
 * Hidden Power's type and base power from the current spread.
 *
 * GEN 2, from DVs:
 *   type  = 4 * (Atk DV mod 4) + (Def DV mod 4)
 *   power = floor( (5 * (8a + 4b + 2c + d) + (Spc DV mod 4)) / 2 ) + 31
 *   where a, b, c, d are the high bits (>= 8) of the ATTACK, DEFENSE, SPEED and
 *   SPECIAL DVs -- in that order, Attack carrying the LARGEST weight.
 *
 *   THOSE WEIGHTS WERE REVERSED HERE ONCE, AND THE OBVIOUS TEST DID NOT CATCH IT.
 *   The bug is invisible whenever all four high bits are equal, because reversing
 *   them is only a permutation: all-15 DVs gave Dark 70 both ways, and so did
 *   Bulbapedia's own Shellder example (10/10/13/8), whose four high bits are all
 *   set. The output range stayed 31-70, so nothing ever looked out of bounds --
 *   an ordinary spread was simply off by up to 18 base power. Only a spread whose
 *   high bits DIFFER can tell the two apart, which is why the suite now carries
 *   six mixed-DV cases (verify-team-builder section 5) rather than one maxed one.
 *   Ground truth: pret/pokecrystal engine/battle/hidden_power.asm, where the
 *   Attack DV's bit is masked to weight 8 and the Special DV's to weight 1.
 *
 * GEN 3-4, from IVs: two 6-bit numbers built from the low bit and the second bit
 * of each IV in the order HP, Atk, Def, Spe, SpA, SpD, scaled to 0-15 and 30-70.
 */
export function hiddenPower(generation: number, individual: StatNumbers): HiddenPower {
  if (generation <= 2) {
    const atk = at(individual, 'attack')
    const def = at(individual, 'defense')
    const spe = at(individual, 'speed')
    const spc = at(individual, 'special')
    const type = HIDDEN_POWER_TYPES[4 * (atk % 4) + (def % 4)]
    const high = (v: number) => (v >= 8 ? 1 : 0)
    const power =
      Math.floor(
        (5 * (8 * high(atk) + 4 * high(def) + 2 * high(spe) + high(spc)) + (spc % 4)) / 2,
      ) + 31
    return { type, power }
  }

  const order: StatKey[] = ['hp', 'attack', 'defense', 'speed', 'special-attack', 'special-defense']
  let lowBits = 0
  let secondBits = 0
  order.forEach((key, i) => {
    const iv = at(individual, key)
    lowBits += (iv % 2) * 2 ** i
    secondBits += (Math.floor(iv / 2) % 2) * 2 ** i
  })
  return {
    type: HIDDEN_POWER_TYPES[Math.floor((lowBits * 15) / 63)],
    power: Math.floor((secondBits * 40) / 63) + 30,
  }
}

/** Per-stat caps for the spread controls, by generation. */
export function effortMax(generation: number): number {
  return generation <= 2 ? MAX_STAT_EXP : MAX_EV
}

export function individualMax(generation: number): number {
  return generation <= 2 ? MAX_DV : MAX_IV
}
