import { useEffect, useState } from 'react'
import { useVersionGroup } from '../version-group/context'
import { isFrontierGeneration, loadFrontierData, peekFrontierData, type FrontierData } from './data'

/**
 * The Frontier data for the app's selected generation, as a LoadState
 * (MODULE-PATTERNS §6). `other-generation` is not an error: the Frontier is
 * Emerald's, and outside Gen 3 nothing is fetched at all.
 *
 * Readiness is derived from the request key (generation + attempt), so a new
 * request never shows the previous one's result.
 */
export type FrontierLoad =
  | { status: 'other-generation' }
  | { status: 'loading' }
  | { status: 'ready'; data: FrontierData }
  | { status: 'error'; message: string; retry: () => void }

export function useFrontierData(): FrontierLoad {
  const { selectedGeneration } = useVersionGroup()
  const inScope = isFrontierGeneration(selectedGeneration)
  const [attempt, setAttempt] = useState(0)
  const key = `${selectedGeneration}|${attempt}`
  const [result, setResult] = useState<{ key: string; data: FrontierData | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!inScope || peekFrontierData(selectedGeneration)) return
    let live = true
    loadFrontierData(selectedGeneration).then(
      (data) => live && setResult({ key, data, error: data ? null : 'no Frontier data for this generation' }),
      (e: unknown) => live && setResult({ key, data: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
  }, [key, inScope, selectedGeneration])

  if (!inScope) return { status: 'other-generation' }
  const cached = peekFrontierData(selectedGeneration)
  if (cached) return { status: 'ready', data: cached }
  if (result?.key === key) {
    if (result.data) return { status: 'ready', data: result.data }
    return { status: 'error', message: result.error ?? 'unknown error', retry: () => setAttempt((n) => n + 1) }
  }
  return { status: 'loading' }
}
