import { useEffect, useState } from 'react'
import {
  learnersAcrossVersionGroups,
  learnersInVersionGroup,
  learnsetRowsForVersionGroup,
  loadAllLearnsets,
} from '../../data'
import type { Move, MoveLearner } from '../../data'

/**
 * "Which species learn this move", from the learnset partitions.
 *
 * The loading machinery is lifted out of the old MoveLearners component
 * unchanged -- under a specific game it reads that one partition; under "All" it
 * unions all fourteen and deduplicates by species (23.5 MiB raw, so it loads only
 * when a move detail is actually open in that mode, and is reused afterwards).
 *
 * A hook rather than a component because the answer now feeds the shared detail
 * page's `sections` prop, and a component that renders its own list cannot.
 */

export interface LearnerState {
  learners: MoveLearner[]
  /** Version groups whose partition failed, so a partial answer says so. */
  failed: string[]
  loading: boolean
  error: string | null
}

interface Cached {
  key: string
  learners: MoveLearner[]
  failed: string[]
}

export function useMoveLearners(
  move: Move,
  versionGroup: string | null,
  isAll: boolean,
): LearnerState {
  const requestKey = `${move.id}|${versionGroup ?? 'all'}`
  const [state, setState] = useState<Cached | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (isAll) {
        const { partitions, failed } = await loadAllLearnsets()
        if (cancelled) return
        setState({
          key: requestKey,
          learners: learnersAcrossVersionGroups(partitions, move.id),
          failed,
        })
        return
      }
      if (versionGroup == null) return
      const rows = await learnsetRowsForVersionGroup(versionGroup)
      if (cancelled) return
      setState({ key: requestKey, learners: learnersInVersionGroup(rows, move.id), failed: [] })
    }
    run().catch((err: unknown) => {
      if (!cancelled) {
        setFailure({ key: requestKey, message: err instanceof Error ? err.message : String(err) })
      }
    })
    return () => {
      cancelled = true
    }
  }, [move.id, versionGroup, isAll, requestKey])

  const ready = state?.key === requestKey ? state : null
  const error = failure?.key === requestKey ? failure.message : null

  return {
    learners: ready?.learners ?? [],
    failed: ready?.failed ?? [],
    loading: ready == null && error == null,
    error,
  }
}

/**
 * The four sections the move detail page shows, in this order.
 *
 * The bundle carries four more methods across all fourteen version groups --
 * xd-purification (332 rows), form-change (12), stadium-surfing-pikachu (4) and
 * light-ball-egg (4). None is one of the four requested sections, so a species
 * that learns a move ONLY by one of those does not appear on the page. Counted
 * and reported rather than silently folded into "Move tutor", which is what
 * guessing would have looked like.
 */
export const LEARN_SECTIONS = [
  { method: 'level-up', label: 'Level up' },
  { method: 'machine', label: 'TM' },
  { method: 'egg', label: 'Egg move' },
  { method: 'tutor', label: 'Move tutor' },
] as const

/** Methods present in the bundle that no section covers. */
export const UNSECTIONED_METHODS = [
  'xd-purification',
  'form-change',
  'stadium-surfing-pikachu',
  'light-ball-egg',
] as const
