/**
 * A versioned document in localStorage: one key, one JSON value, read through
 * `useSyncExternalStore`. The rules are in src/store/CLAUDE.md.
 *
 * LOCALSTORAGE IS THE PRIMARY COPY. Every access is wrapped (Safari's private
 * mode throws on it), and a document that is absent, corrupt or fails to
 * normalise reads as `empty` rather than throwing.
 *
 * READING NEVER WRITES. A stored document older than `version` is migrated in
 * memory on every read; the migrated shape reaches storage only with the next
 * write, so merely opening a screen never rewrites anyone's data.
 *
 * MIGRATIONS ARE FORWARD-ONLY. `migrations[n]` turns a version-n document into
 * a version-(n+1) one, purely. A document NEWER than `version` (a newer client
 * wrote it, on this device or through the sync) runs no migration and keeps its
 * version: it is flagged (`status().newer`), never downgraded.
 */

import { useSyncExternalStore } from 'react'

export type Migration = (doc: unknown) => unknown

export interface DocumentSpec<T> {
  /** Stable id: the export's key and the sync row's `name`. Never rename one. */
  name: string
  /** The localStorage key. */
  key: string
  /** The current schema version, an integer from 1. */
  version: number
  /** from-version -> the next version. Every step from 1 to `version - 1` must exist. */
  migrations: Record<number, Migration>
  /** What an absent or unreadable document reads as. */
  empty: T
  /** Any stored document at `version` -> the current shape. Runs on every read. */
  normalise?: (raw: unknown) => T
  /** The stored document's version; default its `schemaVersion` field. Absent = 1. */
  versionOf?: (raw: unknown) => unknown
  /** Combine two documents: `base` keeps its identity, `added` is appended to it. */
  merge?: (base: T, added: T) => T
  /** Whether a document holds nothing worth keeping; default: equal to `empty`. */
  isEmpty?: (doc: T) => boolean
  /** Mirror it to the signed-in account (src/sync/). Default false. */
  sync?: boolean
}

export interface DocumentStatus {
  /** The version of what is in storage now; null when nothing is. */
  storedVersion: number | null
  /** Stored by a newer client than this one: kept as is, never migrated down. */
  newer: boolean
}

export interface Migrated<T> {
  data: T
  fromVersion: number | null
  newer: boolean
}

/* Method syntax on purpose: a DocumentHandle<Foo> must be usable as a
   DocumentHandle<unknown> by the registry, export and sync. */
export interface DocumentHandle<T> {
  readonly name: string
  readonly key: string
  readonly version: number
  readonly sync: boolean
  read(): T
  write(next: T): void
  update(fn: (doc: T) => T): void
  /** Put a whole document in place WITHOUT telling `onLocalWrite` (the sync's download). */
  replace(next: unknown, fromVersion?: number): void
  subscribe(fn: () => void): () => void
  /** Called after every write made in this tab, never after `replace`. */
  onLocalWrite(fn: (doc: T) => void): () => void
  useDocument(): T
  status(): DocumentStatus
  /** Pure: any stored value -> the current shape (or a newer one, flagged). */
  migrate(raw: unknown, fromVersion?: number): Migrated<T>
  versionOf(doc: unknown): number
  merge(base: T, added: T): T
  isEmpty(doc: T): boolean
  readonly mergeable: boolean
  /** Test seam: drop the in-memory copy so the next read re-parses storage. */
  reset(): void
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  x != null && typeof x === 'object' && !Array.isArray(x)

const asVersion = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null

const defaultVersionOf = (raw: unknown): unknown => (isObject(raw) ? raw.schemaVersion : undefined)

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* quota or a private window: the session still works, it just will not persist */
  }
}

// ---------------------------------------------------------------- registry

const registry = new Map<string, DocumentHandle<unknown>>()
const registryListeners = new Set<(doc: DocumentHandle<unknown>) => void>()

export function listDocuments(): DocumentHandle<unknown>[] {
  return [...registry.values()]
}

export function getDocument(name: string): DocumentHandle<unknown> | undefined {
  return registry.get(name)
}

/** Hear about every document defined from now on (a lazily loaded module's). */
export function onDocumentDefined(fn: (doc: DocumentHandle<unknown>) => void): () => void {
  registryListeners.add(fn)
  return () => registryListeners.delete(fn)
}

// ---------------------------------------------------------------- define

export function defineDocument<T>(spec: DocumentSpec<T>): DocumentHandle<T> {
  const { name, key, version, migrations, empty } = spec
  if (!name) throw new Error('defineDocument: a name is required')
  if (asVersion(version) == null) throw new Error(`defineDocument(${name}): version must be an integer from 1`)
  for (let v = 1; v < version; v++) {
    if (typeof migrations[v] !== 'function') throw new Error(`defineDocument(${name}): no migration from v${v}`)
  }
  const customVersionOf = spec.versionOf
  const versionOf = (doc: unknown): number => asVersion((customVersionOf ?? defaultVersionOf)(doc)) ?? 1

  function migrate(raw: unknown, fromVersion?: number): Migrated<T> {
    if (raw == null) return { data: empty, fromVersion: null, newer: false }
    const from = asVersion(fromVersion) ?? versionOf(raw)
    if (from > version) {
      let data = spec.normalise ? spec.normalise(raw) : (raw as T)
      // The normaliser must not lower the marker either.
      if (!customVersionOf && isObject(data) && data.schemaVersion !== from) data = { ...data, schemaVersion: from }
      return { data, fromVersion: from, newer: true }
    }
    let doc: unknown = raw
    for (let v = from; v < version; v++) doc = migrations[v](doc)
    let data = spec.normalise ? spec.normalise(doc) : (doc as T)
    if (!customVersionOf && isObject(data) && data.schemaVersion !== version) data = { ...data, schemaVersion: version }
    return { data, fromVersion: from, newer: false }
  }

  let cache: T = empty
  let loaded = false
  let status: DocumentStatus = { storedVersion: null, newer: false }
  const listeners = new Set<() => void>()
  const writeListeners = new Set<(doc: T) => void>()

  function read(): T {
    if (loaded) return cache
    loaded = true
    try {
      const raw: unknown = JSON.parse(storageGet(key) ?? 'null')
      const m = migrate(raw)
      cache = m.data
      status = { storedVersion: m.fromVersion, newer: m.newer }
    } catch {
      cache = empty
      status = { storedVersion: null, newer: false }
    }
    return cache
  }

  function persist(next: T) {
    cache = next
    loaded = true
    const v = versionOf(next)
    status = { storedVersion: v, newer: v > version }
    storageSet(key, JSON.stringify(next))
    listeners.forEach((fn) => fn())
  }

  function write(next: T) {
    persist(next)
    writeListeners.forEach((fn) => fn(next))
  }

  function subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  const handle: DocumentHandle<T> = {
    name,
    key,
    version,
    sync: spec.sync ?? false,
    read,
    write,
    update: (fn) => write(fn(read())),
    replace: (next, fromVersion) => persist(migrate(next, fromVersion).data),
    subscribe,
    onLocalWrite(fn) {
      writeListeners.add(fn)
      return () => {
        writeListeners.delete(fn)
      }
    },
    useDocument: () => useSyncExternalStore(subscribe, read, () => empty),
    status() {
      read()
      return status
    },
    migrate,
    versionOf,
    merge: (base, added) => (spec.merge ? spec.merge(base, added) : added),
    mergeable: spec.merge != null,
    isEmpty: (doc) => (spec.isEmpty ? spec.isEmpty(doc) : JSON.stringify(doc) === JSON.stringify(empty)),
    reset() {
      loaded = false
    },
  }
  registry.set(name, handle as DocumentHandle<unknown>)
  registryListeners.forEach((fn) => fn(handle as DocumentHandle<unknown>))
  return handle
}

// ---------------------------------------------------------------- export / import

export const EXPORT_APP = 'pokeapp'
export const EXPORT_FORMAT = 1

export interface ExportFile {
  app: typeof EXPORT_APP
  format: typeof EXPORT_FORMAT
  exportedAt: string
  documents: Record<string, { version: number; data: unknown }>
}

/** Every registered document, or the named ones, as one JSON string. */
export function exportDocuments(names?: string[], opts: { exportedAt?: string } = {}): string {
  const documents: ExportFile['documents'] = {}
  for (const doc of listDocuments()) {
    if (names && !names.includes(doc.name)) continue
    const data = doc.read()
    documents[doc.name] = { version: doc.versionOf(data), data }
  }
  const file: ExportFile = {
    app: EXPORT_APP,
    format: EXPORT_FORMAT,
    exportedAt: opts.exportedAt ?? new Date().toISOString(),
    documents,
  }
  return JSON.stringify(file, null, 2)
}

export type ImportMode = 'replace' | 'merge'

export interface ImportReport {
  ok: boolean
  /** Why the whole file was refused; absent when it was read. */
  reason?: string
  documents: {
    name: string
    result: 'replaced' | 'merged' | 'refused' | 'skipped'
    reason?: string
    fromVersion?: number
    toVersion?: number
  }[]
}

/**
 * Read an export back. The whole file is refused for malformed JSON, another
 * app, or an unknown format; each document separately for a version newer than
 * this client supports, a bad version, or a migration that throws. A name this
 * client does not define is skipped. Imported documents are WRITTEN (not
 * replaced), so the sync uploads them like any edit.
 */
export function importDocuments(json: string, opts: { mode: ImportMode }): ImportReport {
  let file: unknown
  try {
    file = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'Not a JSON file.', documents: [] }
  }
  if (!isObject(file) || file.app !== EXPORT_APP) {
    return { ok: false, reason: 'Not a pokeapp export.', documents: [] }
  }
  if (file.format !== EXPORT_FORMAT) {
    return { ok: false, reason: `Unsupported export format: ${String(file.format)}.`, documents: [] }
  }
  if (!isObject(file.documents)) {
    return { ok: false, reason: 'The export holds no documents.', documents: [] }
  }
  const report: ImportReport = { ok: true, documents: [] }
  for (const [name, entry] of Object.entries(file.documents)) {
    const doc = registry.get(name)
    if (!doc) {
      report.documents.push({ name, result: 'skipped', reason: 'No such document in this version of the app.' })
      continue
    }
    const from = isObject(entry) ? asVersion(entry.version) : null
    if (!isObject(entry) || from == null) {
      report.documents.push({ name, result: 'refused', reason: 'Missing or invalid version.' })
      continue
    }
    if (from > doc.version) {
      report.documents.push({
        name,
        result: 'refused',
        reason: `Version ${from} is newer than this app supports (${doc.version}).`,
        fromVersion: from,
      })
      continue
    }
    let incoming: unknown
    try {
      incoming = doc.migrate(entry.data, from).data
    } catch (err) {
      report.documents.push({ name, result: 'refused', reason: `Migration failed: ${String(err)}`, fromVersion: from })
      continue
    }
    const merge = opts.mode === 'merge' && doc.mergeable
    doc.write(merge ? doc.merge(doc.read(), incoming) : incoming)
    report.documents.push({ name, result: merge ? 'merged' : 'replaced', fromVersion: from, toVersion: doc.version })
  }
  return report
}
