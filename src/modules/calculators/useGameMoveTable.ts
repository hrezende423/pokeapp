import { useEffect, useState } from 'react'
import { loadBattleData, peekBattleData, type BattleData } from '../battle/battleData'

export type GameMoveTable =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: BattleData }
  | { status: 'error'; message: string }

/**
 * One game's own move table (public/data/battle/<game>.json), loaded only when
 * asked for -- `versionGroup` null means "not needed", e.g. a singles calculation,
 * which never pays for the file.
 *
 * The LoadState discipline (MODULE-PATTERNS §6): readiness is derived from the
 * request key, so switching games never shows the previous game's table, and a
 * failed load is `error`, never an empty table.
 */
export function useGameMoveTable(versionGroup: string | null): GameMoveTable {
  const [loaded, setLoaded] = useState<{ key: string; result: GameMoveTable } | null>(null)

  useEffect(() => {
    if (!versionGroup || peekBattleData(versionGroup)) return
    let alive = true
    loadBattleData(versionGroup).then(
      (data) => alive && setLoaded({ key: versionGroup, result: { status: 'ready', data } }),
      (err: unknown) =>
        alive &&
        setLoaded({
          key: versionGroup,
          result: { status: 'error', message: err instanceof Error ? err.message : String(err) },
        }),
    )
    return () => {
      alive = false
    }
  }, [versionGroup])

  if (!versionGroup) return { status: 'idle' }
  const cached = peekBattleData(versionGroup)
  if (cached) return { status: 'ready', data: cached }
  if (loaded?.key === versionGroup) return loaded.result
  return { status: 'loading' }
}
