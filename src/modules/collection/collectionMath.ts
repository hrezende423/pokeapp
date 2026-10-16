/**
 * The Collection's rules, pure: which effort keys a generation stores, what a
 * valid entry is, and a one-line summary of a spread.
 *
 * GEN 1-2 STORE STAT EXP, Gen 3-4 EVs: the same keys the Build Form edits
 * (`spreadKeys` -- five in Gen 1-2, the Special unsplit; six from Gen 3), capped
 * at 65535 per stat in Gen 1-2 and at 252 per stat and 510 in total from Gen 3.
 */

import { spreadKeys } from '../battle/battler'
import type { StatKey, StatNumbers } from '../team-builder/statMath'

export const EFFORT_LABEL: Record<StatKey, string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  special: 'Spc',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  speed: 'Spe',
}

export const effortKeysFor = (generation: number): StatKey[] => spreadKeys(generation).effort

export const effortCap = (generation: number): number => (generation <= 2 ? 65535 : 252)

export interface EntryDraft {
  speciesId: number | null
  nickname: string
  level: string
  natureId: number | null
  /** Raw field text per stat. */
  effort: Partial<Record<StatKey, string>>
  buildId: string | null
}

export type EntryCheck =
  { ok: true; level: number; effort: StatNumbers } | { ok: false; reason: string }

/** A draft -> the numbers to save, or the first reason it cannot be saved. */
export function checkEntry(generation: number, draft: EntryDraft): EntryCheck {
  if (draft.speciesId == null) return { ok: false, reason: 'Pick a Pokémon.' }
  const level = Number(draft.level)
  if (draft.level.trim() === '' || !Number.isInteger(level) || level < 1 || level > 100) {
    return { ok: false, reason: 'Level must be a whole number from 1 to 100.' }
  }
  const cap = effortCap(generation)
  const word = generation <= 2 ? 'Stat Exp' : 'EVs'
  const effort: StatNumbers = {}
  for (const key of effortKeysFor(generation)) {
    const text = (draft.effort[key] ?? '').trim()
    const n = text === '' ? 0 : Number(text)
    if (!Number.isInteger(n) || n < 0 || n > cap) {
      return {
        ok: false,
        reason: `${EFFORT_LABEL[key]} ${word} must be a whole number from 0 to ${cap}.`,
      }
    }
    effort[key] = n
  }
  if (generation >= 3) {
    const total = Object.values(effort).reduce((s, v) => s + (v ?? 0), 0)
    if (total > 510)
      return { ok: false, reason: `EVs total ${total}: the most a Pokémon can hold is 510.` }
  }
  return { ok: true, level, effort }
}

/** "252 HP / 4 Def / 252 Spe", zeros left out; "no effort yet" when all are 0. */
export function effortSummary(generation: number, effort: StatNumbers): string {
  const parts = effortKeysFor(generation)
    .filter((k) => (effort[k] ?? 0) > 0)
    .map((k) => `${effort[k]} ${EFFORT_LABEL[k]}`)
  return parts.length ? parts.join(' / ') : 'no effort yet'
}
