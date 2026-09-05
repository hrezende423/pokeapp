/**
 * What a build and a team ARE, plus the pure operations on them.
 *
 * No React, no storage, no data-layer reads -- so the store can persist these and
 * the screens can render them without either one owning the shape. The stat
 * vocabulary itself (`StatKey`, `StatNumbers`) is NOT redefined here; it lives in
 * statMath.ts beside the arithmetic that consumes it, and this file imports it.
 *
 * NO NAME FIELD ON EITHER TYPE, and that is deliberate rather than an omission:
 * teams are identified by their id, builds by nickname-or-species plus tags. A
 * `name` here would immediately grow a header input on Team Viewer, which the
 * spec rules out.
 */

import type { StatKey, StatNumbers } from './statMath'

export type Gender = 'male' | 'female'

export const TEAM_SIZE = 6
export const MOVE_SLOTS = 4

/** The 510-point budget on a Gen 3-4 EV spread. */
export const MAX_EV_TOTAL = 510

export interface Build {
  id: string
  /** 1-4. Fixed at creation; the form has no generation control by design. */
  generation: number
  speciesId: number
  /** The variety (form) whose learnset and stats apply. */
  pokemonId: number
  nickname: string
  /** Null for a genderless species, which renders no indicator at all. */
  gender: Gender | null
  /** Gen 3-4 only. Gen 2 computes shininess from DVs; Gen 1 has no such thing. */
  shiny: boolean
  level: number
  friendship: number
  itemId: number | null
  abilityId: number | null
  natureId: number | null
  /** Exactly MOVE_SLOTS long. A null is an empty slot, which is always valid. */
  moveIds: (number | null)[]
  /** EVs in Gen 3-4, Stat Exp in Gen 1-2. */
  effort: StatNumbers
  /** IVs in Gen 3-4, DVs in Gen 1-2. */
  individual: StatNumbers
  tags: string[]
  notes: string
}

export interface Team {
  id: string
  /** Display number: the "#001" on the row. Stable, never reused. */
  seq: number
  generation: number
  /** Exactly TEAM_SIZE long. Nulls are empty slots. */
  memberIds: (string | null)[]
  notes: string
}

export interface TeamBuilderData {
  builds: Build[]
  teams: Team[]
  nextBuildSeq: number
  nextTeamSeq: number
}

export const EMPTY_DATA: TeamBuilderData = {
  builds: [],
  teams: [],
  nextBuildSeq: 1,
  nextTeamSeq: 1,
}

const GEN1_STAT_KEYS: readonly StatKey[] = ['hp', 'attack', 'defense', 'special', 'speed']
const MODERN_STAT_KEYS: readonly StatKey[] = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
]

/**
 * The stat ROWS a generation shows.
 *
 * Gen 1 has one unsplit Special; Gen 2 split the stat into Sp.Atk/Sp.Def. This is
 * about display, and differs from `spreadStatKeys` below -- which is about what
 * can be EDITED, and does not track it.
 */
export function statKeysForGeneration(generation: number): readonly StatKey[] {
  return generation <= 1 ? GEN1_STAT_KEYS : MODERN_STAT_KEYS
}

/**
 * The stats whose DV/IV can be EDITED.
 *
 * GEN 2 IS THE TRAP HERE. It split the Special STAT but kept a single Special DV,
 * so a Gen 2 build shows six stat rows and only four DV controls. And HP is
 * absent from this list in Gen 1-2 entirely, because the HP DV is not stored at
 * all -- it is the parity of the other four (see statMath.hpDvFrom), so rendering
 * a slider for it would be a control that silently does nothing.
 */
export function spreadStatKeys(generation: number): readonly StatKey[] {
  if (generation <= 2) return ['attack', 'defense', 'speed', 'special']
  return MODERN_STAT_KEYS
}

export function zeroSpread(): StatNumbers {
  return {}
}

/** "#001" -- the only identity a team has. */
export function teamLabel(team: Pick<Team, 'seq'>): string {
  return `#${String(team.seq).padStart(3, '0')}`
}

/** Every team this build is a member of. Length >= 2 is what gates the prompt. */
export function teamsUsingBuild(data: TeamBuilderData, buildId: string): Team[] {
  return data.teams.filter((t) => t.memberIds.includes(buildId))
}

export function filledMemberIds(team: Team): string[] {
  return team.memberIds.filter((id): id is string => id != null)
}

export function firstOpenSlot(team: Team): number {
  return team.memberIds.findIndex((id) => id == null)
}

export function teamIsFull(team: Team): boolean {
  return firstOpenSlot(team) === -1
}

/**
 * Clear one move slot and CLOSE THE GAP behind it.
 *
 * Clearing slot 2 of four moves moves 3 into 2 and 4 into 3, leaving 4 empty --
 * required behaviour, and the reason move slots are not just an array you splice
 * a null into. Trailing nulls are re-padded so the array stays MOVE_SLOTS long.
 */
export function clearMoveSlot(moveIds: (number | null)[], slot: number): (number | null)[] {
  const kept = moveIds.filter((_, i) => i !== slot)
  const compacted = kept.filter((id) => id != null)
  return padSlots(compacted, MOVE_SLOTS, null)
}

export function setMoveSlot(
  moveIds: (number | null)[],
  slot: number,
  moveId: number | null,
): (number | null)[] {
  if (moveId == null) return clearMoveSlot(moveIds, slot)
  const next = [...moveIds]
  next[slot] = moveId
  return padSlots(next, MOVE_SLOTS, null)
}

/** Move the slot at `from` to `to`, sliding the rest along. Used by drag reorder. */
export function reorderSlots<T>(slots: T[], from: number, to: number): T[] {
  if (from === to) return slots
  const next = [...slots]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function padSlots<T>(items: T[], length: number, fill: T): T[] {
  const out = items.slice(0, length)
  while (out.length < length) out.push(fill)
  return out
}

export { padSlots }
