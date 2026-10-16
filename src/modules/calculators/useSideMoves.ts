import { useMemo } from 'react'
import { getType, resolveTypesForGeneration } from '../../data'
import { MOVE_SLOT_COUNT, defaultMoves, varietyOf, type SideState } from './damageCalcState'

/** A side's four slots: its own once edited, otherwise the learnset's defaults. */
export function useSideMoves(side: SideState, learnRows: number[] | null, gen: number) {
  const variety = varietyOf(side)
  return useMemo<(number | null)[]>(() => {
    if (side.moves) return side.moves
    if (!learnRows) return Array(MOVE_SLOT_COUNT).fill(null)
    const types = resolveTypesForGeneration(variety, gen).map((t) => getType(t.type_id)?.name ?? '')
    return defaultMoves(learnRows, gen, types)
  }, [side.moves, learnRows, gen, variety])
}
