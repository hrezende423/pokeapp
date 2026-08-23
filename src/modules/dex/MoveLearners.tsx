import { useEffect, useState } from 'react'
import {
  evolutionThumbUrl,
  learnsetRowsForVersionGroup,
  learnersAcrossVersionGroups,
  learnersInVersionGroup,
  loadAllLearnsets,
} from '../../data'
import type { Move, MoveLearner } from '../../data'

/** Method labels, the same wording the Pokedex learnset card uses. */
const METHOD_LABELS: Record<string, string> = {
  'level-up': 'Level up',
  machine: 'TM / HM',
  egg: 'Egg',
  tutor: 'Tutor',
}

const methodLabel = (m: string) => METHOD_LABELS[m] ?? m.replace(/-/g, ' ')

interface State {
  key: string
  learners: MoveLearner[]
  /** Version groups whose partition failed, so a partial answer says so. */
  failed: string[]
}

/**
 * "Which species learn this move", from the learnset partitions.
 *
 * Under a specific game it reads that one partition. Under "All" it unions all
 * fourteen and deduplicates by species -- 23.5 MiB raw, so it is loaded only when
 * a move detail is actually open in that mode, and reused for every later move.
 */
export function MoveLearners({
  move,
  versionGroup,
  isAll,
}: {
  move: Move
  versionGroup: string | null
  isAll: boolean
}) {
  const requestKey = `${move.id}|${versionGroup ?? 'all'}`
  const [state, setState] = useState<State | null>(null)
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
  const loadError = failure?.key === requestKey ? failure.message : null

  if (loadError) {
    return (
      <div data-testid="movedex-learners-error">
        <p role="alert">Could not load the learnset data.</p>
        <p className="subtitle">{loadError}</p>
      </div>
    )
  }
  if (!ready) {
    return (
      <p className="subtitle" data-testid="movedex-learners-loading">
        {isAll ? 'Loading every version group…' : 'Loading learnset…'}
      </p>
    )
  }
  if (ready.learners.length === 0) {
    return (
      <p className="subtitle" data-testid="movedex-learners-none">
        No species learns this move{isAll ? ' in Generations 1-4' : ` in ${versionGroup}`}.
      </p>
    )
  }

  return (
    <div data-testid="movedex-learners" data-learner-count={ready.learners.length}>
      <p className="subtitle" data-testid="movedex-learner-count">
        {ready.learners.length} species
        {isAll ? ' across all Generation 1-4 games' : ` in ${versionGroup}`}
      </p>
      {ready.failed.length > 0 && (
        <p role="alert" data-testid="movedex-learners-partial">
          Incomplete: {ready.failed.join(', ')} failed to load.
        </p>
      )}
      <ul className="learner-list" data-testid="movedex-learner-list">
        {ready.learners.map((l) => {
          const variety = l.species.varieties.find((v) => v.is_default) ?? l.species.varieties[0]
          const thumb = variety ? evolutionThumbUrl(variety, false) : null
          return (
            <li key={l.species.id} data-species-id={l.species.id} className="learner">
              <span className="learner-thumb">
                {thumb && (
                  <img
                    src={thumb}
                    alt={l.species.display_name}
                    loading="lazy"
                    width={40}
                    height={40}
                  />
                )}
              </span>
              <span className="learner-body">
                <span className="learner-name">
                  <span className="dex-no">#{String(l.species.id).padStart(3, '0')}</span>{' '}
                  {l.species.display_name}
                </span>
                <span className="learner-methods" data-methods={l.methods.join(',')}>
                  {l.methods.map((m) => (
                    <span key={m} className="method-chip">
                      {methodLabel(m)}
                      {m === 'level-up' && l.level != null ? ` ${l.level}` : ''}
                    </span>
                  ))}
                </span>
                {l.forms.length > 0 && (
                  <span className="subtitle learner-forms">{l.forms.join(', ')}</span>
                )}
                {isAll && l.versionGroups.length > 0 && l.versionGroups.length < 14 && (
                  <span
                    className="subtitle learner-games"
                    data-game-count={l.versionGroups.length}
                    title={l.versionGroups.join(', ')}
                  >
                    {l.versionGroups.length} game{l.versionGroups.length === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
