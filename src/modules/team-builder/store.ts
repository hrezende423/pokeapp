/**
 * The module's persistence: one localStorage document, read through
 * `useSyncExternalStore`.
 *
 * WHY AN EXTERNAL STORE RATHER THAN CONTEXT: several screens are mounted at once
 * in this module -- the Build Form's right rail lists a team whose Team Viewer may
 * also be behind it, and the Add-to-team modal renders the My Teams list over
 * whatever opened it. Those must never disagree about the data. A module-scope
 * store with one subscriber list means an edit anywhere re-renders all of them,
 * with no provider to thread through and no stale copy to reconcile.
 *
 * NO BACKEND, EVER (CLAUDE.md), so localStorage is the whole persistence story.
 * A corrupt or absent document reads as EMPTY_DATA rather than throwing: losing
 * saved teams is bad, but a module that will not render at all is worse, and the
 * user can always rebuild from an empty state.
 */

import { useSyncExternalStore } from 'react'
import {
  EMPTY_DATA,
  MOVE_SLOTS,
  TEAM_SIZE,
  padSlots,
  teamsUsingBuild,
  type Build,
  type Team,
  type TeamBuilderData,
} from './model'

const KEY = 'pokeapp:team-builder:v1'

let cache: TeamBuilderData | null = null
const listeners = new Set<() => void>()

function normalise(raw: unknown): TeamBuilderData {
  if (!raw || typeof raw !== 'object') return EMPTY_DATA
  const doc = raw as Partial<TeamBuilderData>
  const builds = Array.isArray(doc.builds) ? doc.builds : []
  const teams = Array.isArray(doc.teams) ? doc.teams : []
  return {
    // Slot arrays are re-padded on read: a document written by an older shape,
    // or hand-edited in devtools, must not make a screen index past its end.
    builds: builds.map((b) => ({ ...b, moveIds: padSlots(b.moveIds ?? [], MOVE_SLOTS, null) })),
    teams: teams.map((t) => ({ ...t, memberIds: padSlots(t.memberIds ?? [], TEAM_SIZE, null) })),
    nextBuildSeq: doc.nextBuildSeq ?? builds.length + 1,
    nextTeamSeq: doc.nextTeamSeq ?? teams.length + 1,
  }
}

export function readData(): TeamBuilderData {
  if (cache) return cache
  try {
    cache = normalise(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    cache = EMPTY_DATA
  }
  return cache
}

function write(next: TeamBuilderData) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* quota or a private window: the session still works, it just will not persist */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTeamBuilderData(): TeamBuilderData {
  return useSyncExternalStore(subscribe, readData, () => EMPTY_DATA)
}

function update(fn: (data: TeamBuilderData) => TeamBuilderData) {
  write(fn(readData()))
}

/* ------------------------------------------------------------------ builds */

export function createBuild(init: Omit<Build, 'id'>): Build {
  const data = readData()
  const build: Build = { ...init, id: `b${data.nextBuildSeq}` }
  write({ ...data, builds: [...data.builds, build], nextBuildSeq: data.nextBuildSeq + 1 })
  return build
}

export function updateBuild(id: string, patch: Partial<Build>) {
  update((data) => ({
    ...data,
    builds: data.builds.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  }))
}

/**
 * Delete a build AND detach it from every team that used it.
 *
 * Leaving the id in a team's slots would render as a permanently broken member
 * card, so removal is not optional -- the slot becomes empty instead.
 */
export function deleteBuild(id: string) {
  update((data) => ({
    ...data,
    builds: data.builds.filter((b) => b.id !== id),
    teams: data.teams.map((t) => ({
      ...t,
      memberIds: t.memberIds.map((m) => (m === id ? null : m)),
    })),
  }))
}

export function duplicateBuild(id: string): Build | null {
  const data = readData()
  const source = data.builds.find((b) => b.id === id)
  if (!source) return null
  return createBuild({ ...source, moveIds: [...source.moveIds], tags: [...source.tags] })
}

/**
 * Save an edit to a SHARED build as a brand-new build, repointing only the team
 * it was opened from. Every other team keeps the original untouched.
 */
export function forkBuildInTeam(originalId: string, edited: Build, teamId: string): Build {
  const data = readData()
  const copy: Build = { ...edited, id: `b${data.nextBuildSeq}` }
  write({
    ...data,
    builds: [...data.builds, copy],
    teams: data.teams.map((t) =>
      t.id === teamId
        ? { ...t, memberIds: t.memberIds.map((m) => (m === originalId ? copy.id : m)) }
        : t,
    ),
    nextBuildSeq: data.nextBuildSeq + 1,
  })
  return copy
}

/* ------------------------------------------------------------------- teams */

export function createTeam(generation: number, memberIds: (string | null)[] = []): Team {
  const data = readData()
  const team: Team = {
    id: `t${data.nextTeamSeq}`,
    seq: data.nextTeamSeq,
    generation,
    memberIds: padSlots([...memberIds], TEAM_SIZE, null),
    notes: '',
  }
  write({ ...data, teams: [...data.teams, team], nextTeamSeq: data.nextTeamSeq + 1 })
  return team
}

export function updateTeam(id: string, patch: Partial<Team>) {
  update((data) => ({
    ...data,
    teams: data.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }))
}

/**
 * Delete a team, and with it any build that ONLY this team used.
 *
 * A build reachable from another team, or from nowhere at all, is left alone --
 * the Build Library is the home for unattached builds, so deleting a team must
 * not quietly empty it.
 */
export function deleteTeam(id: string) {
  update((data) => {
    const doomed = data.teams.find((t) => t.id === id)
    const remaining = data.teams.filter((t) => t.id !== id)
    if (!doomed) return { ...data, teams: remaining }
    const orphaned = new Set(
      doomed.memberIds
        .filter((m): m is string => m != null)
        .filter((m) => !remaining.some((t) => t.memberIds.includes(m))),
    )
    // Only builds this team INTRODUCED go with it. One that also sits unattached
    // in the library was reachable there before and still should be.
    return { ...data, teams: remaining, builds: data.builds.filter((b) => !orphaned.has(b.id)) }
  })
}

/**
 * Duplicate a team AND its members.
 *
 * The copies are independent builds on purpose: sharing them would mean editing
 * the duplicate silently edits the original, which is the exact surprise the
 * shared-build prompt exists to prevent.
 */
export function duplicateTeam(id: string): Team | null {
  const data = readData()
  const source = data.teams.find((t) => t.id === id)
  if (!source) return null

  let seq = data.nextBuildSeq
  const clones: Build[] = []
  const memberIds = source.memberIds.map((memberId) => {
    if (memberId == null) return null
    const build = data.builds.find((b) => b.id === memberId)
    if (!build) return null
    const clone: Build = {
      ...build,
      id: `b${seq++}`,
      moveIds: [...build.moveIds],
      tags: [...build.tags],
    }
    clones.push(clone)
    return clone.id
  })

  const team: Team = {
    id: `t${data.nextTeamSeq}`,
    seq: data.nextTeamSeq,
    generation: source.generation,
    memberIds,
    notes: source.notes,
  }
  write({
    ...data,
    builds: [...data.builds, ...clones],
    teams: [...data.teams, team],
    nextBuildSeq: seq,
    nextTeamSeq: data.nextTeamSeq + 1,
  })
  return team
}

export function setTeamMember(teamId: string, slot: number, buildId: string | null) {
  update((data) => ({
    ...data,
    teams: data.teams.map((t) =>
      t.id === teamId
        ? { ...t, memberIds: t.memberIds.map((m, i) => (i === slot ? buildId : m)) }
        : t,
    ),
  }))
}

/** Reorder within a team, preserving empty slots at the end. */
export function reorderTeam(teamId: string, from: number, to: number) {
  update((data) => ({
    ...data,
    teams: data.teams.map((t) => {
      if (t.id !== teamId) return t
      const next = [...t.memberIds]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      const filled = next.filter((m): m is string => m != null)
      return { ...t, memberIds: padSlots(filled, TEAM_SIZE, null) }
    }),
  }))
}

export { teamsUsingBuild }

/** Test seam: drop the in-memory copy so the next read re-parses localStorage. */
export function __resetStoreCache() {
  cache = null
}
