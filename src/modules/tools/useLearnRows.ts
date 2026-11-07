import { useEffect, useState } from 'react'
import { loadLearnsets, type LearnRow } from '../../data'

/**
 * One game's learnset partition, loaded on demand (the same rows the species
 * page's Learnset tab reads). Keyed by the game, so switching games never shows
 * the previous one's rows; a failed load is an error, never an empty list.
 */
export function useLearnRows(game: string): { rows: LearnRow[] | null; error: string | null } {
  const [loaded, setLoaded] = useState<{
    game: string
    rows: LearnRow[] | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    let alive = true
    loadLearnsets(game).then(
      (p) => alive && setLoaded({ game, rows: p.rows, error: null }),
      (e: unknown) =>
        alive && setLoaded({ game, rows: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
  }, [game])
  return loaded?.game === game ? loaded : { rows: null, error: null }
}
