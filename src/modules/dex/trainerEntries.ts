/**
 * The Trainer Dex's rows: one per story trainer and one per facility trainer,
 * flattened out of a game's partition (data/trainers.ts).
 *
 * A dex row needs a numeric id (DexPageShell and the nav selection key on one),
 * so a story trainer uses its index in the game's own trainer table and a
 * facility trainer an offset past every story index. Both are stable across
 * rebuilds of the same pins.
 *
 * KIND is the reader's first question -- "is this someone I fight on the way
 * through, a rematch, a battle-facility opponent, or something the game never
 * uses?" -- so it is decided here once and filtered on, not re-derived by each
 * view.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  hasTrainerData,
  loadTrainers,
  peekTrainers,
  type Facility,
  type FacilityTrainer,
  type Trainer,
  type TrainerPartition,
} from '../../data/trainers'

export type TrainerKind = 'story' | 'rematch' | 'facility' | 'unused'

export const TRAINER_KIND_LABEL: Record<TrainerKind, string> = {
  story: 'Story',
  rematch: 'Rematch',
  facility: 'Battle facility',
  unused: 'Unused',
}

export interface TrainerEntry {
  id: number
  kind: TrainerKind
  className: string
  name: string | null
  /** "Youngster Tristan", "Rocket", "Tower Tycoon Palmer". */
  label: string
  location: string | null
  area: string | null
  /** "If the player chose Turtwig", "Rematch 2": what tells identical names apart. */
  variant: string | null
  /** Walkthrough position; facility and unplaced rows sort after every placed one. */
  order: number
  prize: number | null
  levels: [number, number] | null
  trainer?: Trainer
  facility?: Facility
  facilityTrainer?: FacilityTrainer
}

const FACILITY_ID_BASE = 1_000_000

export function trainerEntries(p: TrainerPartition): TrainerEntry[] {
  const out: TrainerEntry[] = []
  for (const t of p.trainers) {
    const className = p.classes[t.class_id]?.name ?? t.class_id
    const first = t.appearances[0]
    const levels = t.party.length
      ? ([Math.min(...t.party.map((m) => m.level)), Math.max(...t.party.map((m) => m.level))] as [
          number,
          number,
        ])
      : null
    out.push({
      id: t.index,
      kind: t.unused ? 'unused' : t.rematch_of ? 'rematch' : 'story',
      className,
      name: t.name,
      label: t.name ? `${className} ${t.name}` : className,
      location: first?.location ?? null,
      area: first?.area ?? null,
      variant: first?.variant ?? null,
      order: first?.order ?? Number.MAX_SAFE_INTEGER - 1,
      prize: t.prize,
      levels,
      trainer: t,
    })
  }
  let n = 0
  for (const f of p.facilities) {
    for (const ft of f.trainers) {
      n += 1
      const className = ft.class_name ?? ''
      out.push({
        id: FACILITY_ID_BASE + n,
        kind: 'facility',
        className,
        name: ft.name,
        label: [className, ft.name].filter(Boolean).join(' '),
        location: f.name,
        area: ft.group ?? null,
        variant: null,
        order: Number.MAX_SAFE_INTEGER,
        prize: null,
        levels: null,
        facility: f,
        facilityTrainer: ft,
      })
    }
  }
  return out
}

export type TrainerLoad =
  | { status: 'idle' }
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; partition: TrainerPartition }
  | { status: 'error'; message: string }

/**
 * A game's trainer partition, loading on first ask. `unavailable` is a game with
 * no data (Colosseum, XD, the Japanese Red/Green/Blue) and is not an error; the
 * same readiness-by-key derivation as usePartitionRows.
 */
export function useTrainerPartition(versionGroup: string | null): {
  state: TrainerLoad
  retry: () => void
} {
  const [result, setResult] = useState<{ key: string; partition: TrainerPartition } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const available = hasTrainerData(versionGroup)
  const key = `${versionGroup ?? 'none'}|${attempt}`

  useEffect(() => {
    if (!versionGroup || !available) return
    let cancelled = false
    loadTrainers(versionGroup)
      .then((partition) => {
        if (!cancelled) setResult({ key, partition })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [versionGroup, available, key])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  let state: TrainerLoad
  if (!versionGroup) state = { status: 'idle' }
  else if (!available) state = { status: 'unavailable' }
  else if (failure?.key === key) state = { status: 'error', message: failure.message }
  else if (result?.key === key) state = { status: 'ready', partition: result.partition }
  else {
    // Already in memory from another screen: ready on the first render.
    const cached = peekTrainers(versionGroup)
    state = cached ? { status: 'ready', partition: cached } : { status: 'loading' }
  }
  return { state, retry }
}
