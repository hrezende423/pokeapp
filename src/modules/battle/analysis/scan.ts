/**
 * R2: THE BATCH SCAN -- my team against every boss in the game at once, as a
 * heatmap: one row per boss, one column per Pokemon of mine (the share of the
 * boss's team it beats one-on-one), and the whole-battle win probability from a
 * short Monte Carlo against the boss's AI.
 *
 * The Monte Carlo here is deliberately small (the scan is a map, not a verdict);
 * each row says how many runs it rests on, and opening the boss runs the full one.
 */

import type { BattleData } from '../battleData'
import type { BattlerSpec } from '../battler'
import { emptyMatchField, type MatchField } from '../damage'
import type { GameContext } from '../game'
import type { Range } from '../range'
import type { TrainerInfo } from '../session'
import { computeMatrix } from './matrix'
import { monteCarlo } from './outcome'

export interface ScanTarget {
  key: string
  label: string
  /** Play order, when the walkthrough gives one. */
  order: number | null
  trainer: TrainerInfo
  theirs: BattlerSpec[]
  /** Doubles / tag battles are simulated as singles; the row says so. */
  format: 'single' | 'double' | 'tag'
}

export interface ScanRow {
  key: string
  label: string
  order: number | null
  format: ScanTarget['format']
  /** Per Pokemon of mine: the share of the boss's team it beats (wins) or at least trades with. */
  perMine: { key: string; wins: number; winsOrTrades: number }[]
  unanswered: number
  winRate: Range
  zeroFaint: Range
  runs: number
  topLevel: number
}

export interface ScanInput {
  ctx: GameContext
  data: BattleData
  mine: BattlerSpec[]
  targets: ScanTarget[]
  badges: string[]
  runs: number
  field?: MatchField
  onRow?: (row: ScanRow, done: number, total: number) => void
}

export function batchScan(inp: ScanInput): ScanRow[] {
  const rows: ScanRow[] = []
  const field = inp.field ?? emptyMatchField()
  inp.targets.forEach((t, idx) => {
    const m = computeMatrix({
      ctx: inp.ctx,
      data: inp.data,
      mine: inp.mine,
      theirs: t.theirs,
      field,
      badges: new Set(inp.badges),
      residual: true,
    })
    const n = t.theirs.length || 1
    const perMine = inp.mine.map((mine, i) => ({
      key: mine.key,
      wins: m.cells[i].filter((c) => c.verdict === 'wins').length / n,
      winsOrTrades:
        m.cells[i].filter((c) => c.verdict === 'wins' || c.verdict === 'trades').length / n,
    }))
    const mc =
      inp.runs > 0
        ? monteCarlo({
            ctx: inp.ctx,
            data: inp.data,
            mine: inp.mine,
            theirs: t.theirs,
            trainer: t.trainer,
            badges: inp.badges,
            field,
            runs: inp.runs,
            seed: 7,
          })
        : null
    const row: ScanRow = {
      key: t.key,
      label: t.label,
      order: t.order,
      format: t.format,
      perMine,
      unanswered: m.unanswered.length,
      winRate: mc?.winRate ?? { min: NaN, max: NaN },
      zeroFaint: mc?.zeroFaint ?? { min: NaN, max: NaN },
      runs: inp.runs,
      topLevel: Math.max(...t.theirs.map((s) => s.level)),
    }
    rows.push(row)
    inp.onRow?.(row, idx + 1, inp.targets.length)
  })
  return rows
}
