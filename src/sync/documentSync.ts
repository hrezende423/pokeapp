/**
 * Cloud sync for every document defined with `sync: true` (src/store/): the
 * same JSON the app keeps in localStorage, mirrored to one row per signed-in
 * user per document in Supabase. Where each row lives is syncTargets.ts: the
 * Team Builder's in `team_builder_docs` as it always has, any other in
 * `user_documents` -- a table PENDING THE OWNER'S APPROVAL, not yet applied.
 * Until it exists those documents stay local-only, silently.
 *
 * LOCAL STAYS PRIMARY. Signed out, nothing here runs and every module behaves as
 * it always has. Signed in, every local edit is uploaded a moment later, and the
 * cloud copy is pulled on sign-in, on focus and on reconnect -- so a build made on
 * the phone is on the laptop the next time the laptop's tab is looked at.
 *
 * THREE CASES DECIDE WHAT A PULL DOES, per document, by what this device knows:
 *
 *   first sync of this account on this device -> MERGE. Whatever the device had
 *     is added to whatever the cloud has (the document's own `merge`; the Team
 *     Builder's renumbers the device's records after the cloud's). A document
 *     with no `merge` takes the cloud's copy when there is one.
 *   the cloud moved and this device has no unsent edit -> TAKE the cloud copy.
 *   this device has an unsent edit -> SEND it, unless the cloud moved since the
 *     device last saw it AND more recently than that edit -- then the cloud's
 *     copy wins. Last writer wins, per whole document: two devices editing
 *     offline at once keep the later one.
 */

import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { listDocuments, onDocumentDefined, type DocumentHandle } from '../store/documentStore'
import { syncErrorOutcome, syncMetaKeyFor, syncTargetFor, type SyncTarget } from './syncTargets'
import { authRedirectUrl, supabase } from './supabase'

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  /** The display name: the reader's own (profiles), else the GitHub login. */
  user: string | null
  /** The picture: the reader's own (profiles), else the GitHub avatar. */
  avatarUrl: string | null
  /** What GitHub says, for "use my GitHub name / picture". */
  githubName: string | null
  githubAvatarUrl: string | null
  /** Whether the reader has set their own name or picture. */
  customName: boolean
  customAvatar: boolean
  /** When the cloud copy last matched this device. */
  lastSynced: string | null
  error: string | null
}

interface SyncMeta {
  /** The account this device last synced with. */
  userId: string | null
  /** The cloud row's updated_at as this device last saw it. */
  seenAt: string | null
  /** A local edit not yet uploaded, and when it was made. */
  dirtyAt: string | null
}

function readMeta(key: string): SyncMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<SyncMeta> | null
    return { userId: raw?.userId ?? null, seenAt: raw?.seenAt ?? null, dirtyAt: raw?.dirtyAt ?? null }
  } catch {
    return { userId: null, seenAt: null, dirtyAt: null }
  }
}

function writeMeta(key: string, patch: Partial<SyncMeta>) {
  const next = { ...readMeta(key), ...patch }
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* a private window: sync still works for the session */
  }
}

// ------------------------------------------------------------------ state

let state: SyncState = {
  status: 'signed-out',
  user: null,
  avatarUrl: null,
  githubName: null,
  githubAvatarUrl: null,
  customName: false,
  customAvatar: false,
  lastSynced: null,
  error: null,
}
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

// ------------------------------------------------------------------ channels

/** One synced document's link to its row. */
interface Channel {
  doc: DocumentHandle<unknown>
  target: SyncTarget
  metaKey: string
  /** Its table is missing: it stays on this device until the next sign-in. */
  localOnly: boolean
  status: 'syncing' | 'synced' | 'offline' | 'error' | null
  lastSynced: string | null
  error: string | null
  busy: Promise<void> | null
  pushTimer: ReturnType<typeof setTimeout> | null
}

const channels: Channel[] = []

/** The account's one status, from every channel that is really syncing. */
function publish() {
  if (!session) return
  const live = channels.filter((c) => !c.localOnly && c.status != null)
  const failed = live.find((c) => c.status === 'error') ?? live.find((c) => c.status === 'offline')
  const status: SyncStatus = failed
    ? failed.status!
    : live.some((c) => c.status === 'syncing')
      ? 'syncing'
      : 'synced'
  const times = live.map((c) => c.lastSynced).filter((t): t is string => t != null)
  set({
    status,
    error: failed?.error ?? null,
    ...(times.length ? { lastSynced: times.reduce((a, b) => (a > b ? a : b)) } : {}),
  })
}

function setChannel(ch: Channel, patch: Partial<Channel>) {
  Object.assign(ch, patch)
  publish()
}

// ------------------------------------------------------------------ remote

/** Attach the HTTP status to a PostgREST error, so a missing table can be told apart. */
const withStatus = (error: object, status: number) => Object.assign(error, { status })

async function fetchRemote(ch: Channel): Promise<{ doc: unknown; updatedAt: string } | null> {
  const { table, column, named } = ch.target
  let query = supabase.from(table).select(named ? `${column}, version, updated_at` : `${column}, updated_at`)
  if (named) query = query.eq('name', ch.doc.name)
  const { data, error, status } = await query.maybeSingle()
  if (error) throw withStatus(error, status)
  if (!data) return null
  const row = data as unknown as Record<string, unknown>
  const version = typeof row.version === 'number' ? row.version : undefined
  return { doc: ch.doc.migrate(row[column], version).data, updatedAt: row.updated_at as string }
}

async function upload(ch: Channel, userId: string, doc: unknown): Promise<string> {
  const { table, column, named } = ch.target
  const updated_at = new Date().toISOString()
  const row: Record<string, unknown> = named
    ? { user_id: userId, name: ch.doc.name, version: ch.doc.versionOf(doc), [column]: doc, updated_at }
    : { user_id: userId, [column]: doc, updated_at }
  const { data, error, status } = await supabase
    .from(table)
    .upsert(row, named ? { onConflict: 'user_id,name' } : undefined)
    .select('updated_at')
    .single()
  if (error) throw withStatus(error, status)
  return (data as { updated_at: string }).updated_at
}

// ------------------------------------------------------------------ the loop

let session: Session | null = null

function fail(ch: Channel, err: unknown) {
  if (syncErrorOutcome(ch.doc.name, err) === 'local-only') {
    // Not an error for the reader: the table awaits the owner's approval.
    setChannel(ch, { localOnly: true, status: null, error: null })
    return
  }
  const message = err instanceof Error ? err.message : String(err)
  setChannel(ch, { status: navigator.onLine ? 'error' : 'offline', error: message })
}

async function push(ch: Channel) {
  if (!session || ch.localOnly) return
  const userId = session.user.id
  const updatedAt = await upload(ch, userId, ch.doc.read())
  writeMeta(ch.metaKey, { userId, seenAt: updatedAt, dirtyAt: null })
  setChannel(ch, { status: 'synced', lastSynced: updatedAt, error: null })
}

async function reconcile(ch: Channel) {
  if (!session || ch.localOnly) return
  const userId = session.user.id
  setChannel(ch, { status: 'syncing' })
  const meta = readMeta(ch.metaKey)
  const local = ch.doc.read()
  const remote = await fetchRemote(ch)

  if (meta.userId !== userId) {
    // First sync of this account on this device: keep both sides.
    const merged = !remote
      ? local
      : ch.doc.isEmpty(local) || !ch.doc.mergeable
        ? remote.doc
        : ch.doc.merge(remote.doc, local)
    ch.doc.replace(merged)
    writeMeta(ch.metaKey, { userId, seenAt: remote?.updatedAt ?? null, dirtyAt: null })
    if (!remote || !ch.doc.isEmpty(local)) await push(ch)
    else setChannel(ch, { status: 'synced', lastSynced: remote.updatedAt, error: null })
    return
  }

  if (!remote) {
    await push(ch)
    return
  }
  const cloudMoved = remote.updatedAt !== meta.seenAt
  if (meta.dirtyAt && !(cloudMoved && remote.updatedAt > meta.dirtyAt)) {
    await push(ch)
    return
  }
  if (cloudMoved) ch.doc.replace(remote.doc)
  writeMeta(ch.metaKey, { seenAt: remote.updatedAt, dirtyAt: null })
  setChannel(ch, { status: 'synced', lastSynced: remote.updatedAt, error: null })
}

/** Run one task per document at a time; a second request waits for the first. */
function queue(ch: Channel, task: (ch: Channel) => Promise<void>) {
  const run = async () => {
    try {
      await task(ch)
    } catch (err) {
      fail(ch, err)
    }
  }
  ch.busy = (ch.busy ?? Promise.resolve()).then(run).finally(() => {
    ch.busy = null
  })
}

function sync() {
  if (!session) return
  for (const ch of channels) if (!ch.localOnly) queue(ch, reconcile)
}

function schedulePush(ch: Channel) {
  writeMeta(ch.metaKey, { dirtyAt: new Date().toISOString() })
  if (!session || ch.localOnly) return
  if (ch.pushTimer) clearTimeout(ch.pushTimer)
  setChannel(ch, { status: 'syncing' })
  ch.pushTimer = setTimeout(() => {
    ch.pushTimer = null
    queue(ch, push)
  }, 800)
}

function attach(doc: DocumentHandle<unknown>) {
  if (!doc.sync || channels.some((c) => c.doc.name === doc.name)) return
  const ch: Channel = {
    doc,
    target: syncTargetFor(doc.name),
    metaKey: syncMetaKeyFor(doc.name),
    localOnly: false,
    status: null,
    lastSynced: null,
    error: null,
    busy: null,
    pushTimer: null,
  }
  channels.push(ch)
  // Signed out, an edit is still marked unsent, so the next sign-in uploads it.
  doc.onLocalWrite(() => schedulePush(ch))
  if (session) queue(ch, reconcile)
}

// --------------------------------------------------------------- profile

interface Profile {
  display_name: string | null
  avatar: string | null
}
let profile: Profile = { display_name: null, avatar: null }

function applyIdentity() {
  set({
    user: profile.display_name || state.githubName,
    avatarUrl: profile.avatar || state.githubAvatarUrl,
    customName: !!profile.display_name,
    customAvatar: !!profile.avatar,
  })
}

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, avatar')
    .maybeSingle()
  if (error) return
  profile = { display_name: data?.display_name ?? null, avatar: data?.avatar ?? null }
  applyIdentity()
}

/**
 * Change the name and/or picture. `null` goes back to GitHub's. Saved to the
 * account, so every device shows the same.
 */
export async function updateProfile(patch: Partial<Profile>): Promise<string | null> {
  if (!session) return 'Not signed in'
  const next = { ...profile, ...patch }
  const { error } = await supabase.from('profiles').upsert({
    user_id: session.user.id,
    display_name: next.display_name?.trim() || null,
    avatar: next.avatar || null,
    updated_at: new Date().toISOString(),
  })
  if (error) return error.message
  profile = { display_name: next.display_name?.trim() || null, avatar: next.avatar || null }
  applyIdentity()
  return null
}

function applySession(next: Session | null) {
  const wasSignedIn = session != null
  session = next
  if (!next) {
    profile = { display_name: null, avatar: null }
    for (const ch of channels) Object.assign(ch, { status: null, error: null })
    set({
      status: 'signed-out',
      user: null,
      avatarUrl: null,
      githubName: null,
      githubAvatarUrl: null,
      customName: false,
      customAvatar: false,
      error: null,
    })
    return
  }
  const meta = next.user.user_metadata ?? {}
  set({
    githubName:
      (meta.user_name as string) ??
      (meta.preferred_username as string) ??
      next.user.email ??
      'Signed in',
    githubAvatarUrl: (meta.avatar_url as string) ?? null,
  })
  applyIdentity()
  if (!wasSignedIn) {
    // A table approved since the last sign-in is tried again.
    for (const ch of channels) ch.localOnly = false
    void loadProfile()
    sync()
  }
}

let started = false

/** Wire the sync up once, at boot. Harmless when the reader never signs in. */
export function startSync() {
  if (started) return
  started = true
  listDocuments().forEach(attach)
  onDocumentDefined(attach)
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
