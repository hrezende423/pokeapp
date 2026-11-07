/**
 * Where each synced document lives in Supabase, and which errors mean "that
 * table does not exist yet". Pure -- no client import -- so verify-store tests
 * it in Node without touching the network.
 *
 * ONE ROW PER USER PER DOCUMENT.
 *   'team-builder' -> `team_builder_docs` (user_id, doc, updated_at), exactly as
 *     before the generic store: that table exists and holds everyone's data.
 *   every other document -> `user_documents` (user_id, name, version, data,
 *     updated_at; primary key (user_id, name)).
 *
 * `user_documents` IS PENDING THE OWNER'S APPROVAL: its migration is
 * supabase/migrations/20261107120000_user_documents.sql, written but NOT applied.
 * Until it is, a document routed there stays local-only, silently -- see
 * `syncErrorOutcome`.
 */

export const TEAM_BUILDER_DOC = 'team-builder'

export interface SyncTarget {
  table: 'team_builder_docs' | 'user_documents'
  /** The jsonb column holding the document. */
  column: 'doc' | 'data'
  /** Whether rows are told apart by `name` as well as `user_id`. */
  named: boolean
}

export function syncTargetFor(name: string): SyncTarget {
  return name === TEAM_BUILDER_DOC
    ? { table: 'team_builder_docs', column: 'doc', named: false }
    : { table: 'user_documents', column: 'data', named: true }
}

/** The device's sync bookkeeping key. The Team Builder's predates the rest and keeps its name. */
export function syncMetaKeyFor(name: string): string {
  return name === TEAM_BUILDER_DOC ? 'pokeapp:team-builder:sync' : `pokeapp:sync:${name}`
}

/**
 * A PostgREST 404, Postgres 42P01 (undefined_table) or PostgREST PGRST205 (not in
 * the schema cache): the table is not there.
 */
export function isMissingTable(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const { status, code } = err as { status?: unknown; code?: unknown }
  return status === 404 || code === '42P01' || code === 'PGRST205'
}

/**
 * What a failed request means for a document. A missing `user_documents` table
 * is not the reader's problem: that document simply stays on this device. Any
 * other failure -- including a missing `team_builder_docs`, which does exist --
 * is a sync error, shown as one.
 */
export function syncErrorOutcome(name: string, err: unknown): 'local-only' | 'error' {
  return syncTargetFor(name).table === 'user_documents' && isMissingTable(err) ? 'local-only' : 'error'
}
