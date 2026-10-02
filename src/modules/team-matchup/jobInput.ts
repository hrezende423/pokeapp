import type { MatchupView } from './TeamMatchup'
import type { OutcomeJobInput } from './jobs'

/** The Monte Carlo / search input for a view's resolved setup (a facility pool is drawn from per battle). */
export function jobInput(view: MatchupView, runs: number): OutcomeJobInput {
  const { resolved, setup } = view
  return {
    mine: resolved.mine,
    theirs: resolved.theirs,
    trainer: resolved.trainer,
    badges: setup.badges,
    field: resolved.field,
    mineLead: setup.lead,
    mineLead2: setup.lead2,
    doubles: resolved.doubles,
    runs,
    seed: 1,
    nuzlocke: setup.nuzlocke,
    pool:
      resolved.pool && resolved.theirs.length > resolved.poolSize
        ? { specs: resolved.theirs, size: resolved.poolSize }
        : undefined,
  }
}
