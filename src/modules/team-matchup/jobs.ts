/**
 * The heavy analyses (O1-O4, R1, R2, R5) as messages to a Web Worker, so a
 * thousand battles never freeze the page. Everything crossing the boundary is
 * plain data: specs, fields, badge lists (never Sets).
 */

import type { BattlerSpec } from '../battle/battler'
import type { MatchField } from '../battle/damage'
import type { CarryOver, TrainerInfo } from '../battle/session'
import type { GauntletStage, HealingBudget } from '../battle/analysis/gauntlet'
import type { ScanTarget } from '../battle/analysis/scan'
import type { SearchOptions } from '../battle/analysis/outcome'

export interface OutcomeJobInput {
  mine: BattlerSpec[]
  theirs: BattlerSpec[]
  trainer: TrainerInfo | null
  badges: string[]
  field?: MatchField
  carry?: CarryOver
  mineLead?: number
  runs: number
  seed?: number
  nuzlocke?: boolean
  pool?: { specs: BattlerSpec[]; size: number }
}

export type JobRequest =
  | { kind: 'mc'; vg: string; input: OutcomeJobInput }
  | { kind: 'search'; vg: string; input: OutcomeJobInput; opts: SearchOptions }
  | {
      kind: 'gauntlet'
      vg: string
      input: {
        mine: BattlerSpec[]
        stages: GauntletStage[]
        badges: string[]
        budget: HealingBudget
        runs: number
        field?: MatchField
      }
    }
  | {
      kind: 'scan'
      vg: string
      input: {
        mine: BattlerSpec[]
        targets: ScanTarget[]
        badges: string[]
        runs: number
        field?: MatchField
      }
    }
  | {
      kind: 'suggest'
      vg: string
      input: { mine: BattlerSpec[]; theirs: BattlerSpec[]; badges: string[]; field: MatchField }
    }

export type JobMessage =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'partial'; value: unknown }
  | { id: number; type: 'done'; value: unknown }
  | { id: number; type: 'error'; message: string }
