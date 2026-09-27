/**
 * Cloud sync for the Team Builder: the same document the module keeps in
 * localStorage, mirrored to one row per signed-in user in Supabase.
 *
 * LOCAL STAYS PRIMARY. Signed out, nothing here runs and the module behaves as it
 * always has. Signed in, every local edit is uploaded a moment later, and the
 * cloud copy is pulled on sign-in, on focus and on reconnect -- so a build made on
 * the phone is on the laptop the next time the laptop's tab is looked at.
 *
 * THREE CASES DECIDE WHAT A PULL DOES, by what this device knows:
 *
 *   first sync of this account on this device -> MERGE. Whatever the device had
 *     is added to whatever the cloud has, the device's builds and teams renumbered
 *     after the cloud's so no id collides ("b3" on the phone is not "b3" on the
 *     laptop). Nothing is lost on either side.
 *   the cloud moved and this device has no unsent edit -> TAKE the cloud copy.
 *   this device has an unsent edit -> SEND it, unless the cloud moved since the
 *     device last saw it AND more recently than that edit -- then the cloud's
 *     copy wins. Last writer wins, per whole document: two devices editing
 *     offline at once keep the later one.
 */

import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { TeamBuilderData } from '../modules/team-builder/model'
import {
  normalise,
  onLocalWrite,
  readData,
  replaceData,
} from '../modules/team-builder/store'
import { authRedirectUrl, supabase } from './supabase'

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  /** GitHub login, or the email when there is none. */
  user: string | null
  avatarUrl: string | null
  /** When the cloud copy last matched this device. */
  lastSynced: string | null
  error: string | null
}

const META_KEY = 'pokeapp:team-builder:sync'

interface SyncMeta {
  /** The account this device last synced with. */
  userId: string | null
  /** The cloud row's updated_at as this device last saw it. */
  seenAt: string | null
  /** A local edit not yet uploaded, and when it was made. */
  dirtyAt: string | null
}

function readMeta(): SyncMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<SyncMeta> | null
    return { userId: raw?.userId ?? null, seenAt: raw?.seenAt ?? null, dirtyAt: raw?.dirtyAt ?? null }
  } catch {
    return { userId: null, seenAt: null, dirtyAt: null }
  }
}

function writeMeta(patch: Partial<SyncMeta>) {
  const next = { ...readMeta(), ...patch }
  try {
    localStorage.setItem(META_KEY, JSON.stringify(next))
  } catch {
    /* a private window: sync still works for the session */
  }
}

// ------------------------------------------------------------------ state

let state: SyncState = { status: 'signed-out', user: null, avatarUrl: null, lastSynced: null, error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
    () => state,
  )
}

// ------------------------------------------------------------------ merge

const isEmpty = (d: TeamBuilderData) => d.builds.length === 0 && d.teams.length === 0

/**
 * The cloud document plus this device's, the device's records renumbered after
 * the cloud's counters. Team membership is rewritten through the same map, so a
 * device team still holds the device builds it held.
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
  return {
    builds: [...cloud.builds, ...builds],
    teams: [...cloud.teams, ...teams],
    nextBuildSeq: buildSeq,
    nextTeamSeq: teamSeq,
  }
}

// ------------------------------------------------------------------ remote

async function fetchRemote(): Promise<{ doc: TeamBuilderData; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from('team_builder_docs')
    .select('doc, updated_at')
    .maybeSingle()
  if (error) throw error
  return data ? { doc: normalise(data.doc), updatedAt: data.updated_at as string } : null
}

async function upload(userId: string, doc: TeamBuilderData): Promise<string> {
  const { data, error } = await supabase
    .from('team_builder_docs')
    .upsert({ user_id: userId, doc, updated_at: new Date().toISOString() })
    .select('updated_at')
    .single()
  if (error) throw error
  return data.updated_at as string
}

// ------------------------------------------------------------------ the loop

let session: Session | null = null
let busy: Promise<void> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null

const fail = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  set({ status: navigator.onLine ? 'error' : 'offline', error: message })
}

async function push() {
  if (!session) return
  const userId = session.user.id
  const updatedAt = await upload(userId, readData())
  writeMeta({ userId, seenAt: updatedAt, dirtyAt: null })
  set({ status: 'synced', lastSynced: updatedAt, error: null })
}

async function reconcile() {
  if (!session) return
  const userId = session.user.id
  set({ status: 'syncing' })
  const meta = readMeta()
  const local = readData()
  const remote = await fetchRemote()

  if (meta.userId !== userId) {
    // First sync of this account on this device: keep both sides.
    const merged = !remote ? local : isEmpty(local) ? remote.doc : mergeDocs(remote.doc, local)
    replaceData(merged)
    writeMeta({ userId, seenAt: remote?.updatedAt ?? null, dirtyAt: null })
    if (!remote || !isEmpty(local)) await push()
    else set({ status: 'synced', lastSynced: remote.updatedAt, error: null })
    return
  }

  if (!remote) {
    await push()
    return
  }
  const cloudMoved = remote.updatedAt !== meta.seenAt
  if (meta.dirtyAt && !(cloudMoved && remote.updatedAt > meta.dirtyAt)) {
    await push()
    return
  }
  if (cloudMoved) replaceData(remote.doc)
  writeMeta({ seenAt: remote.updatedAt, dirtyAt: null })
  set({ status: 'synced', lastSynced: remote.updatedAt, error: null })
}

/** Run one pull-and-settle at a time; a second request waits for the first. */
function sync() {
  if (!session) return
  const run = async () => {
    try {
      await reconcile()
    } catch (err) {
      fail(err)
    }
  }
  busy = (busy ?? Promise.resolve()).then(run).finally(() => {
    busy = null
  })
}

function schedulePush() {
  writeMeta({ dirtyAt: new Date().toISOString() })
  if (!session) return
  if (pushTimer) clearTimeout(pushTimer)
  set({ status: 'syncing' })
  pushTimer = setTimeout(() => {
    pushTimer = null
    const run = async () => {
      try {
        await push()
      } catch (err) {
        fail(err)
      }
    }
    busy = (busy ?? Promise.resolve()).then(run).finally(() => {
      busy = null
    })
  }, 800)
}

function applySession(next: Session | null) {
  const wasSignedIn = session != null
  session = next
  if (!next) {
    set({ status: 'signed-out', user: null, avatarUrl: null, error: null })
    return
  }
  const meta = next.user.user_metadata ?? {}
  set({
    user: (meta.user_name as string) ?? (meta.preferred_username as string) ?? next.user.email ?? 'Signed in',
    avatarUrl: (meta.avatar_url as string) ?? null,
  })
  if (!wasSignedIn) sync()
}

let started = false

/** Wire the sync up once, at boot. Harmless when the reader never signs in. */
export function startTeamSync() {
  if (started) return
  started = true
  // Signed out, an edit is still marked unsent, so the next sign-in uploads it.
  onLocalWrite(() => schedulePush())
  supabase.auth.onAuthStateChange((_event, next) => applySession(next))
  window.addEventListener('focus', () => sync())
  window.addEventListener('online', () => sync())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync()
  })
}

export async function signInWithGitHub() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: authRedirectUrl() },
  })
  if (error) set({ status: 'error', error: error.message })
}

/** Signing out keeps this device's copy; it simply stops following the cloud. */
export async function signOut() {
  await supabase.auth.signOut()
}
