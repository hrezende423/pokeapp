/**
 * One background job at a time per caller: start it, watch its progress, read
 * its result, cancel it. Each hook owns its own worker, so the Outcome tab's
 * Monte Carlo and the Scan tab's sweep never queue behind each other.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobMessage, JobRequest } from './jobs'

export type JobState<T> =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number; partial: unknown[] }
  | { status: 'done'; value: T; ms: number }
  | { status: 'error'; message: string }

function spawn(): Worker {
  return new Worker(new URL('./matchup.worker.ts', import.meta.url), { type: 'module' })
}

export function useJob<T>(): {
  state: JobState<T>
  run: (job: JobRequest) => void
  cancel: () => void
} {
  const [state, setState] = useState<JobState<T>>({ status: 'idle' })
  const worker = useRef<Worker | null>(null)
  const seq = useRef(0)
  const started = useRef(0)

  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )

  const run = useCallback((job: JobRequest) => {
    const id = ++seq.current
    worker.current ??= spawn()
    const w = worker.current
    started.current = performance.now()
    setState({ status: 'running', done: 0, total: 0, partial: [] })
    w.onmessage = (e: MessageEvent<JobMessage>) => {
      const m = e.data
      if (m.id !== seq.current) return
      if (m.type === 'progress')
        setState((s) => (s.status === 'running' ? { ...s, done: m.done, total: m.total } : s))
      else if (m.type === 'partial')
        setState((s) => (s.status === 'running' ? { ...s, partial: [...s.partial, m.value] } : s))
      else if (m.type === 'done')
        setState({ status: 'done', value: m.value as T, ms: performance.now() - started.current })
      else setState({ status: 'error', message: m.message })
    }
    w.onerror = (e) => setState({ status: 'error', message: e.message || 'The worker failed' })
    w.postMessage({ id, job })
  }, [])

  const cancel = useCallback(() => {
    seq.current++
    worker.current?.terminate()
    worker.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, run, cancel }
}
