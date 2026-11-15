import { defineDocument } from '../../../store/documentStore'
import { EMPTY_TRACKER, isTrackerEmpty, mergeTracker, normaliseTracker, type TrackerDoc } from './model'

/**
 * The Challenge Tracker's saved document (src/store/CLAUDE.md).
 *
 * EAGER on purpose (imported by ../pages.ts): the account menu's import and the
 * sync look documents up in the registry, so this one must be defined before the
 * tracker's lazy chunk ever loads. It imports only the pure model, never the loader.
 *
 * SYNC: true. The owner logs on phone and desktop; the store routes every
 * document but the Team Builder to `user_documents` with NO schema change of its
 * own. That table is pending the owner's approval, so until it is applied this
 * document stays on the device, silently (src/sync/syncTargets.ts).
 */
export const trackerDocument = defineDocument<TrackerDoc>({
  name: 'frontier-tracker',
  key: 'pokeapp:frontier-tracker:v1',
  version: 1,
  migrations: {},
  empty: EMPTY_TRACKER,
  normalise: normaliseTracker,
  merge: mergeTracker,
  isEmpty: isTrackerEmpty,
  sync: true,
})
