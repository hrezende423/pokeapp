/**
 * `getLegalMoveset` as a hook, with the project's LoadState discipline.
 *
 * READINESS IS DERIVED FROM A REQUEST KEY, never cleared in an effect body. That
 * is the pattern `usePartitionRows` established and the reason this compiles
 * under `react-hooks/set-state-in-effect`: state is only ever set from the
 * promise's callback, and whether the current answer belongs to the current
 * question is decided at render time by comparing keys. Clearing to "loading" in
 * the effect instead would be a synchronous setState in an effect body, and would
 * also flash an empty dropdown on every keystroke of the level field.
 *
 * LEVEL IS IN THE KEY, because Gen 1 gates level-up moves on it -- a Gen 1 build
 * levelling from 10 to 20 genuinely has a different legal moveset. Gens 2-4 do
 * not gate (breeding and move relearners exist), so the key simply resolves to
 * the same answer and the promise short-circuits on the module's own cache.
 *
 * A partition that fails to load is NAMED, not dropped: `failed` reaches the UI
 * so a moveset missing three version groups cannot read as "these moves do not
 * exist".
 */

import { useCallback, useEffect, useState } from 'react'
import { getLegalMoveset, type LegalMove } from './legalMoveset'

export type LegalMovesetState =
  | { status: 'loading'; moves: LegalMove[]; failed: string[]; message: null }
  | { status: 'ready'; moves: LegalMove[]; failed: string[]; message: null }
  | { status: 'error'; moves: LegalMove[]; failed: string[]; message: string }

export function useLegalMoveset({
  speciesId,
  pokemonId,
  level,
  generation,
}: {
  speciesId: number
  pokemonId: number
  level: number
  generation: number
}): LegalMovesetState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    key: string
    moves: LegalMove[]
    failed: string[]
  } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)

  const key = `${speciesId}|${pokemonId}|${level}|${generation}|${attempt}`

  useEffect(() => {
    let cancelled = false
    getLegalMoveset({ speciesId, pokemonId, level, generation })
      .then((set) => {
        if (!cancelled) setResult({ key, moves: set.moves, failed: set.failed })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [speciesId, pokemonId, level, generation, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (failure?.key === key) {
    return { status: 'error', moves: [], failed: [], message: failure.message, retry }
  }
  if (result?.key === key) {
    return { status: 'ready', moves: result.moves, failed: result.failed, message: null, retry }
  }
  /* A stale-but-present result keeps rendering while the new one loads, so the
     dropdown does not empty itself mid-edit. `status` still says loading. */
  return {
    status: 'loading',
    moves: result?.moves ?? [],
    failed: result?.failed ?? [],
    message: null,
    retry,
  }
}
