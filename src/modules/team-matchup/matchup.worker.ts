/// <reference lib="webworker" />
/**
 * The matchup's worker: runs the whole-battle analyses off the main thread.
 * It boots its own copy of the data layer and the game's battle data (both are
 * fetch-only and worker-safe), then answers one job at a time. Cancelling is
 * the page terminating this worker and starting another -- a synchronous loop
 * cannot be interrupted by a message.
 */

import { initDataLayer, loadLearnsets } from '../../data'
import { loadBattleData } from '../battle/battleData'
import { gameContext } from '../battle/game'
import { emptyMatchField } from '../battle/damage'
import { monteCarlo, searchLine } from '../battle/analysis/outcome'
import { runGauntlet } from '../battle/analysis/gauntlet'
import { batchScan } from '../battle/analysis/scan'
import { computeMatrix } from '../battle/analysis/matrix'
import { suggestions } from '../battle/analysis/suggest'
import type { JobMessage, JobRequest } from './jobs'

const post = (m: JobMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

let booted: Promise<void> | null = null
const boot = () => (booted ??= initDataLayer().then(() => undefined))

self.onmessage = async (e: MessageEvent<{ id: number; job: JobRequest }>) => {
  const { id, job } = e.data
  const progress = (done: number, total: number) => post({ id, type: 'progress', done, total })
  try {
    await boot()
    const ctx = gameContext(job.vg)
    const data = await loadBattleData(job.vg)
    let value: unknown
    switch (job.kind) {
      case 'mc':
        value = monteCarlo({ ctx, data, ...job.input, onProgress: progress })
        break
      case 'search':
        value = searchLine({ ctx, data, ...job.input, onProgress: progress }, job.opts)
        break
      case 'gauntlet':
        value = runGauntlet({ ctx, data, ...job.input, onProgress: progress })
        break
      case 'scan':
        value = batchScan({
          ctx,
          data,
          ...job.input,
          onRow: (row, done, total) => {
            post({ id, type: 'partial', value: row })
            progress(done, total)
          },
        })
        break
      case 'suggest': {
        const learn = await loadLearnsets(job.vg)
        const badges = new Set(job.input.badges)
        const field = job.input.field ?? emptyMatchField()
        const base = {
          ctx,
          data,
          mine: job.input.mine,
          theirs: job.input.theirs,
          field,
          badges,
          residual: true,
        }
        const matrix = computeMatrix(base)
        const learnsets = new Map(
          job.input.mine.map((m) => [m.speciesId, learn.bySpecies.get(m.speciesId) ?? []]),
        )
        value = suggestions({ ...base, matrix, learnsets })
        break
      }
    }
    post({ id, type: 'done', value })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
