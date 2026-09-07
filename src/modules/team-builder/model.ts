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

/**
 * The in-game nickname limit, and it is 10 for every generation this app
 * covers -- Gen 1 through 5 all cap at 10 characters. Enforced in the model
 * rather than only as an `maxLength` on the input, because the attribute stops
 * typing and pasting but says nothing about a value that arrives any other way.
 */
export const NICKNAME_MAX = 10

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
  /**
   * A BUILD THAT HAS NOT CLAIMED ITS PLACE YET.
   *
   * Starting a new member used to write it into a team slot immediately, before
   * a single field was filled -- so abandoning it left a blank Bulbasaur sitting
   * in the team and in the library forever. A draft is created, edited and shown
   * exactly like any other build; what it does not have is a slot. It gets one
   * when the reader says to keep it, and is deleted when they say not to.
   *
   * Optional because every build stored before this existed is not one, and
   * `undefined` reads as false without a migration.
   */
  draft?: boolean
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

/*
  ------------------------------------------------------------ THE TWO IDS

  `id` ("t3", "b12") is the PRIMARY KEY: immutable, never reused, never shown.
  Every reference between records is one of these, so nothing below can break a
  team's link to its members.

  The "#001" the reader sees is a different thing entirely and is DERIVED FROM
  POSITION rather than stored. That is the whole mechanism: delete #002 and the
  one after it is now second in the list, so it IS #002, with no renumbering
  pass to run and nothing to keep in sync. A stored counter cannot do this --
  it either leaves a hole at #002 or has to rewrite every record after it.

  It also means the displayed number is not stable across a deletion, which is
  exactly what was asked for. Never persist one, and never use one to look a
  record up: `uiId` is for showing, `id` is for finding.
*/

/** The reader-facing number for a position in a list. */
export function uiId(index: number): string {
  return index < 0 ? '#---' : `#${String(index + 1).padStart(3, '0')}`
}

/** Teams in creation order, which is the order the numbering counts in. */
export function orderedTeams(data: TeamBuilderData): Team[] {
  return [...data.teams].sort((a, b) => a.seq - b.seq)
}

/**
 * The teams that EXIST as far as the reader is concerned.
 *
 * An empty team is the moment between "New team" and choosing the first
 * member. The Team Library does not list one, so it must not be counted when
 * numbering either -- and that was a real bug: every abandoned attempt left an
 * invisible team behind, and the next one you started called itself #002, #003,
 * #004 while the library still showed one team. `teamUiId` counts against this
 * list rather than against `data.teams`.
 */
export function listedTeams(data: TeamBuilderData): Team[] {
  return orderedTeams(data).filter((t) => t.memberIds.some((m) => m != null))
}

/** Builds in creation order. Drafts are not builds yet, so they are not numbered. */
export function orderedBuilds(data: TeamBuilderData): Build[] {
  return data.builds.filter((b) => !b.draft)
}

/**
 * The "#001" for a team, INCLUDING one that is not in the library yet.
 *
 * A team being filled for the first time is still empty, so it is not in
 * `listedTeams` and has no position in it -- but it is on screen and has to
 * show a number, and it has to be the number it will still have once its first
 * member lands. That is the count of listed teams ahead of it, which is what
 * the fallback computes. Showing `#---` there, or numbering against every team
 * including the invisible ones, are the two ways this has been wrong.
 */
export function teamUiId(data: TeamBuilderData, teamId: string): string {
  const listed = listedTeams(data)
  const index = listed.findIndex((t) => t.id === teamId)
  if (index >= 0) return uiId(index)
  const team = data.teams.find((t) => t.id === teamId)
  if (!team) return uiId(-1)
  return uiId(listed.filter((t) => t.seq < team.seq).length)
}

export function buildUiId(data: TeamBuilderData, buildId: string): string {
  return uiId(orderedBuilds(data).findIndex((b) => b.id === buildId))
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
