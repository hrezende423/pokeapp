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
 * LOCALSTORAGE IS STILL THE PRIMARY COPY: every screen reads and writes it, and
 * the module works offline and signed out exactly as it always has. The
 * mechanics -- the cache, the subscribers, the wrapped storage access -- are the
 * generic document store's (src/store/documentStore.ts); this file names the
 * document and keeps its own `normalise`. Signing in (src/sync/) adds a cloud
 * copy that follows it -- `onLocalWrite` is how the sync hears about an edit,
 * `replaceData` how it hands a newer cloud copy back. A corrupt or absent
 * document reads as EMPTY_DATA rather than throwing: losing saved teams is bad,
 * but a module that will not render at all is worse.
 */

import {
  EMPTY_DATA,
  MOVE_SLOTS,
  TEAM_SIZE,
  padSlots,
  teamsUsingBuild,
  type Build,
  type CollectionEntry,
  type Team,
  type TeamBuilderData,
} from './model'
import { migrateEntry } from '../collection/collectionSchema'
import { defineDocument } from '../../store/documentStore'

const KEY = 'pokeapp:team-builder:v1'

/**
 * Any stored document -> the current shape. Idempotent: normalise(normalise(x))
 * is normalise(x).
 *
 * UNKNOWN FIELDS ARE KEPT, top level and per entry (`{...doc, ...known}`), so a
 * document a NEWER client wrote survives a round trip through this one. Collection
 * entries go through `migrateEntry` every time -- never gated on
 * `schemaVersion`, which an older client drops (see collectionSchema.ts).
 */
export function normalise(raw: unknown): TeamBuilderData {
  if (!raw || typeof raw !== 'object') return EMPTY_DATA
  const doc = raw as Partial<TeamBuilderData>
  const builds = Array.isArray(doc.builds) ? doc.builds : []
  const teams = Array.isArray(doc.teams) ? doc.teams : []
  const collection = Array.isArray(doc.collection)
    ? doc.collection.filter((c) => c != null && typeof c === 'object' && !Array.isArray(c))
    : []
  return {
    ...doc,
    // Slot arrays are re-padded on read: a document written by an older shape,
    // or hand-edited in devtools, must not make a screen index past its end.
    builds: builds.map((b) => ({ ...b, moveIds: padSlots(b.moveIds ?? [], MOVE_SLOTS, null) })),
    teams: teams.map((t) => ({ ...t, memberIds: padSlots(t.memberIds ?? [], TEAM_SIZE, null) })),
    nextBuildSeq: doc.nextBuildSeq ?? builds.length + 1,
    nextTeamSeq: doc.nextTeamSeq ?? teams.length + 1,
    collection: collection.map(migrateEntry),
    nextEntrySeq: doc.nextEntrySeq ?? (Array.isArray(doc.collection) ? doc.collection.length : 0) + 1,
    schemaVersion: 2,
  }
}

/**
 * Another document's records appended to `base`'s, renumbered after `base`'s
 * counters so no id collides ("b3" on the phone is not "b3" on the laptop).
 * Team membership and Collection targets are rewritten through the same map, so
 * an appended team still holds the builds it held. The sync's first merge
 * (cloud, device) and an import's merge (local, file) both use it.
 */
export function mergeDocs(cloud: TeamBuilderData, device: TeamBuilderData): TeamBuilderData {
  let buildSeq = Math.max(cloud.nextBuildSeq, 1)
  const buildId = new Map<string, string>()
  const builds = device.builds.map((b) => {
    const id = `b${buildSeq++}`
    buildId.set(b.id, id)
    return { ...b, id }
  })
  let teamSeq = Math.max(cloud.nextTeamSeq, 1)
  const teams = device.teams.map((t) => {
    const seq = teamSeq++
    return {
      ...t,
      id: `t${seq}`,
      seq,
      memberIds: t.memberIds.map((m) => (m == null ? null : (buildId.get(m) ?? null))),
    }
  })
  // Collection entries the same way, their target build through the same map
  // (documents from before the Collection have none).
  let entrySeq = Math.max(cloud.nextEntrySeq ?? 1, 1)
  const entries = (device.collection ?? []).map((c) => {
    const seq = entrySeq++
    return { ...c, id: `c${seq}`, seq, buildId: c.buildId == null ? null : (buildId.get(c.buildId) ?? null) }
  })
  // Unknown fields survive: the device's, then the cloud's over them, and the
  // result through `normalise` -- which migrates every entry, so a v1 side and a
  // v2 side come out as one v2 document. Entries are spread above, so each keeps
  // its own v2 and unknown fields.
  return normalise({
    ...device,
    ...cloud,
    builds: [...cloud.builds, ...builds],
    teams: [...cloud.teams, ...teams],
    nextBuildSeq: buildSeq,
    nextTeamSeq: teamSeq,
    collection: [...(cloud.collection ?? []), ...entries],
    nextEntrySeq: entrySeq,
  })
}

/**
 * The document. Its v1 -> v2 step (Collection v2) is NOT a migration here: it is
 * `normalise`, which migrates every entry on EVERY read, never gated on
 * `schemaVersion` (an older client drops that field -- see collectionSchema.ts).
 * So `migrations[1]` is the identity, and what a screen reads is exactly
 * `normalise(stored)`, as it was before the generic store existed.
 */
export const teamBuilderDocument = defineDocument<TeamBuilderData>({
  name: 'team-builder',
  key: KEY,
  version: 2,
  migrations: { 1: (doc) => doc },
  empty: EMPTY_DATA,
  normalise,
  merge: mergeDocs,
  isEmpty: (d) => d.builds.length === 0 && d.teams.length === 0 && (d.collection ?? []).length === 0,
  sync: true,
})

export function readData(): TeamBuilderData {
  return teamBuilderDocument.read()
}

const write = (next: TeamBuilderData) => teamBuilderDocument.write(next)

/** Called after every edit made in this tab -- NOT after `replaceData`. */
export function onLocalWrite(fn: (data: TeamBuilderData) => void): () => void {
  return teamBuilderDocument.onLocalWrite(fn)
}

/**
 * Put a whole document in place (the cloud copy, when it is newer). Every
 * screen re-renders from it; the write listeners are NOT told, so the sync does
 * not upload straight back what it has just downloaded.
 */
export function replaceData(next: TeamBuilderData) {
  teamBuilderDocument.replace(next)
}

export function useTeamBuilderData(): TeamBuilderData {
  return teamBuilderDocument.useDocument()
}

function update(fn: (data: TeamBuilderData) => TeamBuilderData) {
  teamBuilderDocument.update(fn)
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
    // A Collection entry trained toward it keeps its numbers, loses the target.
    collection: (data.collection ?? []).map((c) => (c.buildId === id ? { ...c, buildId: null } : c)),
  }))
}

export function duplicateBuild(id: string): Build | null {
  const data = readData()
  const source = data.builds.find((b) => b.id === id)
  if (!source) return null
  /* `draft: false` explicitly: a copy is a build in its own right, and
     inheriting the flag would produce a second draft that no form is editing
     and nothing would ever resolve. */
  return createBuild({
    ...source,
    draft: false,
    moveIds: [...source.moveIds],
    tags: [...source.tags],
  })
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

export function createTeam(
  generation: number,
  memberIds: (string | null)[] = [],
  meta: Pick<Team, 'versionGroup' | 'name' | 'purpose'> = {},
): Team {
  const data = readData()
  const team: Team = {
    id: `t${data.nextTeamSeq}`,
    seq: data.nextTeamSeq,
    generation,
    ...(meta.versionGroup ? { versionGroup: meta.versionGroup } : {}),
    ...(meta.name?.trim() ? { name: meta.name.trim() } : {}),
    ...(meta.purpose ? { purpose: meta.purpose } : {}),
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
    ...(source.versionGroup ? { versionGroup: source.versionGroup } : {}),
    ...(source.name ? { name: source.name } : {}),
    ...(source.purpose ? { purpose: source.purpose } : {}),
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

/** Remove a member and close the gap: later members each move up one slot. */
export function removeTeamMember(teamId: string, slot: number) {
  update((data) => ({
    ...data,
    teams: data.teams.map((t) => {
      if (t.id !== teamId) return t
      const kept = t.memberIds.filter((m, i): m is string => i !== slot && m != null)
      return { ...t, memberIds: padSlots(kept, TEAM_SIZE, null) }
    }),
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

// ------------------------------------------------------------- Collection

/** The v1 fields are required; any v2 field left out takes its default. */
export type EntryInit = Pick<
  CollectionEntry,
  'generation' | 'speciesId' | 'nickname' | 'level' | 'natureId' | 'effort' | 'buildId'
> &
  Partial<Omit<CollectionEntry, 'id' | 'seq'>>

export function createEntry(init: EntryInit): CollectionEntry {
  const data = readData()
  const seq = data.nextEntrySeq ?? 1
  const entry: CollectionEntry = migrateEntry({ ...init, id: `c${seq}`, seq })
  write({ ...data, collection: [...(data.collection ?? []), entry], nextEntrySeq: seq + 1 })
  return entry
}

export function updateEntry(id: string, patch: Partial<CollectionEntry>) {
  update((data) => ({
    ...data,
    collection: (data.collection ?? []).map((c) => (c.id === id ? { ...c, ...patch, id: c.id, seq: c.seq } : c)),
  }))
}

export function deleteEntry(id: string) {
  update((data) => ({ ...data, collection: (data.collection ?? []).filter((c) => c.id !== id) }))
}

export { teamsUsingBuild }

/** Test seam: drop the in-memory copy so the next read re-parses localStorage. */
export function __resetStoreCache() {
  teamBuilderDocument.reset()
}
