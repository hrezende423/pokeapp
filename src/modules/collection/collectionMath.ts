/**
 * The Collection's rules, pure: which effort keys a generation stores, what a
 * valid entry is, and a one-line summary of a spread.
 *
 * GEN 1-2 STORE STAT EXP, Gen 3-4 EVs: the same keys the Build Form edits
 * (`spreadKeys` -- five in Gen 1-2, the Special unsplit; six from Gen 3), capped
 * at 65535 per stat in Gen 1-2 and at 252 per stat and 510 in total from Gen 3.
 *
 * DVs (Gen 1-2) and IVs (Gen 3-4) are on `spreadStatKeys`: four DVs, the HP DV
 * derived; six IVs. A blank is UNKNOWN and is not stored (candidates.ts).
 */

import { spreadKeys } from '../battle/battler'
import { spreadStatKeys, type AcquireMethod, type Gender, type Pokerus } from '../team-builder/model'
import { MAX_DV, MAX_IV, type StatKey, type StatNumbers } from '../team-builder/statMath'

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

export const individualKeysFor = (generation: number): readonly StatKey[] =>
  spreadStatKeys(generation)

export const individualCap = (generation: number): number => (generation <= 2 ? MAX_DV : MAX_IV)

/**
 * The form's state. The v2 fields are optional so a draft shaped like a v1 one
 * (verify-tools builds them) still checks: a missing one reads as blank.
 */
export interface EntryDraft {
  speciesId: number | null
  nickname: string
  level: string
  natureId: number | null
  /** Raw field text per stat. */
  effort: Partial<Record<StatKey, string>>
  buildId: string | null
  // ---- v2
  pokemonId?: number | null
  game?: string | null
  gender?: Gender | null
  shiny?: boolean
  abilityId?: number | null
  itemId?: number | null
  /** Raw field text per stat; blank = unknown. */
  individual?: Partial<Record<StatKey, string>>
  moveIds?: (number | null)[]
  metLocation?: string
  metLevel?: string
  metDate?: string
  otName?: string
  otId?: string
  otLanguage?: string | null
  acquiredDate?: string
  acquiredMethod?: AcquireMethod | null
  pokerus?: Pokerus
}

export type EntryCheck =
  | {
      ok: true
      level: number
      effort: StatNumbers
      /** Only the stats the reader filled in. */
      individual: StatNumbers
      metLevel: number | null
      otId: string
    }
  | { ok: false; reason: string }

const wholeIn = (text: string, lo: number, hi: number): number | null => {
  const n = Number(text)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

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
  const ivCap = individualCap(generation)
  const ivWord = generation <= 2 ? 'DV' : 'IV'
  const individual: StatNumbers = {}
  for (const key of individualKeysFor(generation)) {
    const text = (draft.individual?.[key] ?? '').trim()
    if (text === '') continue
    const n = wholeIn(text, 0, ivCap)
    if (n == null) {
      return {
        ok: false,
        reason: `${EFFORT_LABEL[key]} ${ivWord} must be a whole number from 0 to ${ivCap}.`,
      }
    }
    individual[key] = n
  }
  const metText = (draft.metLevel ?? '').trim()
  const metLevel = metText === '' ? null : wholeIn(metText, 1, 100)
  if (metText !== '' && metLevel == null) {
    return { ok: false, reason: 'Met level must be a whole number from 1 to 100.' }
  }
  const otId = (draft.otId ?? '').trim()
  if (otId !== '' && wholeIn(otId, 0, 65535) == null) {
    return { ok: false, reason: 'OT ID must be a whole number from 0 to 65535.' }
  }
  return { ok: true, level, effort, individual, metLevel, otId }
}

/** "252 HP / 4 Def / 252 Spe", zeros left out; "no effort yet" when all are 0. */
export function effortSummary(generation: number, effort: StatNumbers): string {
  const parts = effortKeysFor(generation)
    .filter((k) => (effort[k] ?? 0) > 0)
    .map((k) => `${effort[k]} ${EFFORT_LABEL[k]}`)
  return parts.length ? parts.join(' / ') : 'no effort yet'
}
