import { useCallback, useEffect, useState } from 'react'
import { getLearnsetsForSpecies, listVersionGroups } from '../../data'
import type { LoadState } from '../pokedex/usePartitionRows'

/**
 * The move ids a species (in one form) can learn in a generation: every row, by
 * any method, in any of that generation's games -- Red/Blue/Yellow for Gen 1,
 * the five Gen 3 groups including Colosseum and XD, and so on.
 *
 * This is the plain learnset the brief asks for, via `getLearnsetsForSpecies`,
 * not Team Building's stricter `getLegalMoveset` (evolution stage, level, trade
 * blocks): a calculator asks "is this a move this Pokemon has", not "is this
 * exact build legal". Moves only a PRE-evolution learns are therefore not listed;
 * the "Any move" switch is the way to reach those.
 *
 * Forms learn differently (Deoxys-Attack, Rotom-Wash), so rows are narrowed to the
 * variety's own `pokemon_id`; a form with no rows of its own falls back to the
 * species' rows rather than showing nothing.
 *
 * The LoadState discipline from usePartitionRows: `ready` with an empty set is not
 * `error`, readiness is derived from a request key, and `retry` bumps the key.
 */
export function useGenerationLearnset(
  speciesId: number,
  pokemonId: number,
  generation: number,
): { state: LoadState<number>; retry: () => void } {
  const [result, setResult] = useState<{ key: string; rows: number[] } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${speciesId}|${pokemonId}|${generation}|${attempt}`

  useEffect(() => {
    let cancelled = false
    const groups = listVersionGroups().filter((vg) => vg.generation_id === generation)
    Promise.all(groups.map((vg) => getLearnsetsForSpecies(speciesId, vg.name)))
      .then((parts) => {
        const rows = parts.flat()
        const own = rows.filter((r) => r.pokemon_id === pokemonId)
        const ids = [...new Set((own.length > 0 ? own : rows).map((r) => r.move_id))]
        if (!cancelled) setResult({ key, rows: ids })
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [speciesId, pokemonId, generation, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  let state: LoadState<number>
  if (failure?.key === key) state = { status: 'error', message: failure.message }
  else if (result?.key === key) state = { status: 'ready', rows: result.rows }
  else state = { status: 'loading' }
  return { state, retry }
}
