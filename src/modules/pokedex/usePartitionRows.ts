import { useCallback, useEffect, useState } from 'react'

/**
 * Load state for one on-demand dataset.
 *
 * `ready` with an empty array and `error` are deliberately different states. They
 * used to be conflated: a failed fetch left the rows empty and the UI rendered its
 * "no data for this species" message, which asserts something false -- the data
 * exists, the request failed. A caller must be able to tell the two apart, so this
 * type makes it impossible not to.
 */
export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: T[] }
  | { status: 'error'; message: string }

/**
 * Fetch one species' rows from one on-demand partition.
 *
 * Each dataset gets its own instance, so a failure in one cannot blank the other.
 * Results are tagged with the request they belong to and readiness is derived,
 * rather than cleared in the effect body -- clearing synchronously would cascade an
 * extra render and briefly show the previous request's rows.
 *
 * `retry` bumps an attempt counter, which is part of the request key, so the state
 * derives back to `loading` and the effect re-runs. The loader never caches a
 * rejection, so a retry after a transient failure genuinely re-fetches.
 */
export function usePartitionRows<T>(
  load: (speciesId: number, versionGroup: string) => Promise<T[]>,
  speciesId: number,
  versionGroup: string | null,
): { state: LoadState<T>; retry: () => void } {
  const [result, setResult] = useState<{ key: string; rows: T[] } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const key = `${speciesId}|${versionGroup ?? 'none'}|${attempt}`

  useEffect(() => {
    if (versionGroup == null) return
    let cancelled = false
    load(speciesId, versionGroup)
      .then((rows) => {
        if (!cancelled) setResult({ key, rows })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [load, speciesId, versionGroup, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  let state: LoadState<T>
  if (versionGroup == null) state = { status: 'idle' }
  else if (failure?.key === key) state = { status: 'error', message: failure.message }
  else if (result?.key === key) state = { status: 'ready', rows: result.rows }
  else state = { status: 'loading' }

  return { state, retry }
}
