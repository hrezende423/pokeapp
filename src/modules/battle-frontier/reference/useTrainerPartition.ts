import { useEffect, useState } from 'react'
import { loadTrainers, type TrainerPartition } from '../../../data/trainers'

/**
 * One game's Trainer Dex partition, for the Frontier screens that read a facility
 * from it (Trainer Hill, Trainer Tower, the Gen 4 Brains). The LoadState
 * discipline of usePartitionRows (MODULE-PATTERNS §6): readiness is derived from
 * the request key (game + attempt), so a new game never shows the last one's data.
 * null = nothing to load (no request).
 */
export type PartitionLoad =
  | { status: 'loading' }
  | { status: 'ready'; partition: TrainerPartition }
  | { status: 'error'; message: string; retry: () => void }

export function useTrainerPartition(versionGroup: string | null): PartitionLoad {
  const [attempt, setAttempt] = useState(0)
  const key = `${versionGroup}|${attempt}`
  const [result, setResult] = useState<{ key: string; partition?: TrainerPartition; error?: string } | null>(null)

  useEffect(() => {
    if (!versionGroup) return
    let live = true
    loadTrainers(versionGroup).then(
      (partition) => live && setResult({ key, partition }),
      (e: unknown) => live && setResult({ key, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
  }, [key, versionGroup])

  if (result?.key === key) {
    if (result.partition) return { status: 'ready', partition: result.partition }
    return { status: 'error', message: result.error ?? 'unknown error', retry: () => setAttempt((n) => n + 1) }
  }
  return { status: 'loading' }
}
