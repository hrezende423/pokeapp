/**
 * THE GAUNTLET (R1): the Elite Four and the Champion back to back, HP, PP and
 * status carried between fights, a healing budget spent between them.
 */

import { useMemo, useState } from 'react'
import { SearchSelect } from '../../components/ds/SearchSelect'
import type { Trainer } from '../../data/trainers'
import {
  BUDGET_LABELS,
  EMPTY_BUDGET,
  type GauntletResult,
  type HealingBudget,
} from '../battle/analysis/gauntlet'
import { trainerTitle } from '../battle/sources'
import { defaultGauntlet, stageOf } from './gauntletStages'
import type { MatchupView } from './TeamMatchup'
import { JobStatus, Note, Section } from './parts'
import { prob } from './format'
import { useJob } from './useJob'

export function GauntletTab({ view }: { view: MatchupView }) {
  const { partition, ctx, resolved, setup } = view
  const [ids, setIds] = useState<string[] | null>(null)
  const [budget, setBudget] = useState<HealingBudget>({
    ...EMPTY_BUDGET,
    hyperPotion: 5,
    fullRestore: 2,
    revive: 2,
  })
  const [runs, setRuns] = useState(200)
  const job = useJob<GauntletResult>()
  const defaults = useMemo(
    () => (partition ? defaultGauntlet(partition).map((t) => t.id) : []),
    [partition],
  )
  const stageIds = ids ?? defaults
  const options = useMemo(
    () =>
      partition
        ? partition.trainers
            .filter((t) => !t.unused)
            .map((t) => ({ value: t.id, label: trainerTitle(partition, t) }))
        : [],
    [partition],
  )
  if (!partition) return <Note>Loading trainers…</Note>
  if (!resolved.mine.length) return <Note>Choose your team in Setup.</Note>
  const stages = stageIds
    .map((id) => partition.trainers.find((t) => t.id === id))
    .filter((t): t is Trainer => !!t)
  const run = () =>
    job.run({
      kind: 'gauntlet',
      vg: view.vg,
      input: {
        mine: resolved.mine,
        stages: stages.map((t) => stageOf(partition, t, ctx, setup.format.level === 'level-50')),
        badges: setup.badges,
        budget,
        runs,
        field: undefined,
      },
    })
  return (
    <div className="tm-gauntlet" data-layout="tm-gauntlet">
      <Section title="Fights, in order" testId="tm-gauntlet-stages">
        <ol className="tm-list" data-testid="tm-gauntlet-list">
          {stages.map((t, i) => (
            <li key={t.id}>
              {trainerTitle(partition, t)}{' '}
              <button
                type="button"
                className="tm-link"
                onClick={() => setIds(stageIds.filter((_, k) => k !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <SearchSelect
          label="Add a fight"
          options={options}
          value=""
          placeholder="Search trainers"
          onChange={(id) => setIds([...stageIds, id])}
        />
        {ids && (
          <button type="button" className="tm-link" onClick={() => setIds(null)}>
            Back to the Elite Four and Champion
          </button>
        )}
      </Section>

      <Section title="Healing between fights" testId="tm-gauntlet-budget">
        <div className="tm-budget">
          {(Object.keys(BUDGET_LABELS) as (keyof HealingBudget)[]).map((k) => (
            <label key={k} className="tm-inline-field">
              <span>{BUDGET_LABELS[k]}</span>
              <input
                type="number"
                className="tm-input tm-input-num"
                min={0}
                max={99}
                data-testid={`tm-budget-${k}`}
                value={budget[k]}
                onChange={(e) =>
                  setBudget({
                    ...budget,
                    [k]: Math.max(0, Math.min(99, Number(e.target.value) || 0)),
                  })
                }
              />
            </label>
          ))}
        </div>
        <Note>
          Spent between fights: revive the fainted, cure status, then the smallest item that fills
          the most hurt (below 75%). PP is never restored. Potion 20, Super 50, Hyper 200 HP (Gen
          1–4 values).
        </Note>
      </Section>

      <Section
        title="Result"
        testId="tm-gauntlet-result"
        aside={
          <span className="tm-row">
            <select
              className="tm-select"
              aria-label="Runs"
              value={runs}
              onChange={(e) => setRuns(Number(e.target.value))}
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n} runs
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tm-link"
              data-testid="tm-gauntlet-run"
              onClick={run}
              disabled={!stages.length}
            >
              Run
            </button>
          </span>
        }
      >
        <JobStatus state={job.state} onCancel={job.cancel} label="Gauntlet" />
        {job.state.status === 'done' && (
          <>
            <p className="tm-big" data-testid="tm-gauntlet-clear">
              Clears all {stages.length}: {prob(job.state.value.clear)}
              {job.state.value.clearByPlan.length > 1 && (
                <span className="tm-muted">
                  {' '}
                  ({job.state.value.clearByPlan.map((p) => `${p.name} ${prob(p.clear)}`).join(', ')}
                  )
                </span>
              )}
            </p>
            <table className="tm-table" data-testid="tm-gauntlet-table">
              <thead>
                <tr>
                  <th>Fight</th>
                  <th className="tm-num">Reached</th>
                  <th className="tm-num">Won when reached</th>
                  <th className="tm-num">Team HP entering</th>
                  <th className="tm-num">Standing entering</th>
                </tr>
              </thead>
              <tbody>
                {job.state.value.stages.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td className="tm-num tm-mono">{prob(s.reached)}</td>
                    <td className="tm-num tm-mono">{prob(s.wonIfReached)}</td>
                    <td className="tm-num tm-mono">{s.hpIn.toFixed(0)}%</td>
                    <td className="tm-num tm-mono">{s.aliveIn.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tm-muted">
              Items used per run:{' '}
              {Object.entries(job.state.value.itemsUsed)
                .map(
                  ([k, n]) => `${BUDGET_LABELS[k as keyof HealingBudget]} ${(n ?? 0).toFixed(1)}`,
                )
                .join(', ') || 'none'}
              . Faints at least once:{' '}
              {job.state.value.faintRisk.map((f) => `${f.label} ${prob(f.p)}`).join(', ')}.
            </p>
          </>
        )}
      </Section>
    </div>
  )
}
