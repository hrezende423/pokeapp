/**
 * The sync's original entry points, kept as aliases. The engine is now
 * documentSync.ts and mirrors every document defined with `sync: true`; the
 * Team Builder document is one of them and still syncs through
 * `team_builder_docs` exactly as before (syncTargets.ts). Other documents go to
 * `user_documents`, a table pending the owner's approval -- until it is applied
 * they stay local-only, silently.
 *
 * Importing this file registers the Team Builder document, so `startTeamSync`
 * at boot finds it.
 */

import '../modules/team-builder/store'

export {
  signInWithGitHub,
  signOut,
  startSync,
  startSync as startTeamSync,
  updateProfile,
  useSyncState,
  type SyncState,
  type SyncStatus,
} from './documentSync'

/** The Team Builder's merge, now beside its document in team-builder/store.ts. */
export { mergeDocs } from '../modules/team-builder/store'
