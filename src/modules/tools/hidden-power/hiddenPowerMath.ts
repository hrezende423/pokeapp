/**
 * Hidden Power from a typed spread: validation, then the formula.
 *
 * PURE, AND UI-FREE. The formula itself is Team Building's
 * (`statMath.hiddenPower`, Gen 2's DV version and Gen 3+'s IV version); this file
 * only turns raw field text into a result or a sentence saying what is missing,
 * so the page never shows a NaN or a blank.
 *
 * GEN 2 READS FOUR DVs, NOT SIX IVs: Attack, Defense, Speed and the unsplit
 * Special. The HP DV is not an input -- it is packed from the other four -- and
 * Hidden Power does not read it anyway. Hidden Power does not exist in Gen 1.
 */

import { HIDDEN_POWER_TYPES, hiddenPower, hpDvFrom, type StatKey } from '../../team-builder/statMath'

export const HP_KEYS_GEN2: readonly StatKey[] = ['attack', 'defense', 'speed', 'special']
export const HP_KEYS_GEN34: readonly StatKey[] = [
  'hp',
  'attack',
  'defense',
  'speed',
  'special-attack',
  'special-defense',
]

export const HP_LABEL: Partial<Record<StatKey, string>> = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  speed: 'Speed',
  special: 'Special',
  'special-attack': 'Sp. Atk',
  'special-defense': 'Sp. Def',
}

export const hiddenPowerKeys = (generation: number): readonly StatKey[] =>
  generation <= 2 ? HP_KEYS_GEN2 : HP_KEYS_GEN34

export const individualCap = (generation: number): number => (generation <= 2 ? 15 : 31)

export type HiddenPowerOutcome =
  | { ok: true; type: string; power: number; hpDv: number | null }
  | { ok: false; reason: string }

/** Raw field text per stat -> Hidden Power, or the reason there is none. */
export function readHiddenPower(
  generation: number,
  raw: Partial<Record<StatKey, string>>,
): HiddenPowerOutcome {
  if (generation < 2) return { ok: false, reason: 'Hidden Power does not exist in Gen 1.' }
  const keys = hiddenPowerKeys(generation)
  const cap = individualCap(generation)
  const word = generation <= 2 ? 'DV' : 'IV'
  const values: Partial<Record<StatKey, number>> = {}
  const missing: string[] = []
  for (const key of keys) {
    const text = (raw[key] ?? '').trim()
    const n = Number(text)
    if (text === '' || !Number.isInteger(n)) {
      missing.push(HP_LABEL[key] ?? key)
      continue
    }
    if (n < 0 || n > cap) {
      return { ok: false, reason: `${HP_LABEL[key]} ${word} must be a whole number from 0 to ${cap}.` }
    }
    values[key] = n
  }
  if (missing.length) {
    return { ok: false, reason: `Enter the ${word}s for ${missing.join(', ')}.` }
  }
  const result = hiddenPower(generation, values)
  return {
    ok: true,
    type: result.type,
    power: result.power,
    hpDv: generation <= 2 ? hpDvFrom(values) : null,
  }
}

/** Every type Hidden Power can be, in the formula's own order. */
export const HIDDEN_POWER_TYPE_ORDER = HIDDEN_POWER_TYPES
