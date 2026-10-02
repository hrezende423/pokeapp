/**
 * OUTCOME (O1-O4): whole battles against the trainer's AI.
 */

import { useState } from 'react'
import type { McResult, SearchResult } from '../battle/analysis/outcome'
import type { MatchupView } from './TeamMatchup'
import { jobInput } from './jobInput'
import { JobStatus, MonName, Note, Section } from './parts'
import { prob, probRange } from './format'
import { useJob } from './useJob'

export function McView({ r, view, testId }: { r: McResult; view: MatchupView; testId: string }) {
  return (
    <div data-testid={testId}>
      <dl className="tm-facts">
        <dt>Win probability</dt>
        <dd className="tm-big tm-mono" data-testid={`${testId}-win`}>
          {probRange(r.winRate)}
        </dd>
        <dt>95% interval</dt>
        <dd className="tm-mono">
          {prob(r.interval[0])}–{prob(r.interval[1])} ({r.runsPerPlan} battles
          {r.plans.length > 1 ? ' at each end of the spreads' : ''})
        </dd>
        <dt>Win with no faint</dt>
        <dd className="tm-mono" data-testid={`${testId}-clean`}>
          {probRange(r.zeroFaint)}
        </dd>
        <dt>Expected faints</dt>
        <dd className="tm-mono">
          {r.expectedFaints.min === r.expectedFaints.max
            ? r.expectedFaints.min.toFixed(2)
            : `${r.expectedFaints.min.toFixed(2)}–${r.expectedFaints.max.toFixed(2)}`}
        </dd>
        <dt>Average length</dt>
        <dd className="tm-mono">
          {r.avgTurns.toFixed(1)} turns{r.undecided ? ` · ${r.undecided} hit the turn limit` : ''}
        </dd>
      </dl>
      {r.plans.length > 1 && (
        <Note>
          Spreads with ranges: the low figure is your least favourable values against their most
          favourable, the high one the reverse.
        </Note>
      )}
      {r.ceiling && (
        <Note tone="warn">
          Uses a best-case ceiling spread ("Maximize all EVs" past the 510 cap).
        </Note>
      )}
      <table className="tm-table" data-testid={`${testId}-faints`}>
        <thead>
          <tr>
            <th>Yours</th>
            <th className="tm-num">Faints in</th>
            <th className="tm-num">Usually on turn</th>
          </tr>
        </thead>
        <tbody>
          {r.faintRisk.map((f) => {
            const spec = view.resolved.mine.find((m) => m.key === f.key)
            return (
              <tr key={f.key}>
                <td>{spec ? <MonName spec={spec} /> : f.label}</td>
                <td className="tm-num tm-mono">{probRange(f.p)}</td>
                <td className="tm-num tm-mono">
                  {f.meanTurn != null ? f.meanTurn.toFixed(1) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function OutcomeTab({ view }: { view: MatchupView }) {
  const { resolved, setup } = view
  const [runs, setRuns] = useState(500)
  const [thorough, setThorough] = useState(false)
  const mc = useJob<McResult>()
  const search = useJob<SearchResult>()
  if (!resolved.mine.length || !resolved.theirs.length)
    return <Note>Choose your team and an opponent in Setup.</Note>
  const nameOf = (k: string) => resolved.mine.find((m) => m.key === k)?.label ?? k
  return (
    <div className="tm-outcome" data-layout="tm-outcome">
      <Section
        title="Win probability"
        testId="tm-mc"
        aside={
          <span className="tm-row">
            <select
              className="tm-select"
              aria-label="Battles"
              data-testid="tm-mc-runs"
              value={runs}
              onChange={(e) => setRuns(Number(e.target.value))}
            >
              {[100, 250, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>
                  {n} battles
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tm-link"
              data-testid="tm-mc-run"
              onClick={() => mc.run({ kind: 'mc', vg: view.vg, input: jobInput(view, runs) })}
            >
              Run
            </button>
          </span>
        }
      >
        <JobStatus state={mc.state} onCancel={mc.cancel} label="Monte Carlo" />
        {mc.state.status === 'done' && (
          <>
            <McView r={mc.state.value} view={view} testId="tm-mc-result" />
            <h3 className="tm-subhead">Risk report</h3>
            <p data-testid="tm-mc-luck">
              {prob(mc.state.value.lossesToLuck)} of the losses had an unlucky event of 25% or less
              against you.
            </p>
            {mc.state.value.risks.length === 0 ? (
              <p>No chance event stands out in the losses.</p>
            ) : (
              <table className="tm-table" data-testid="tm-risks">
                <thead>
                  <tr>
                    <th>Against you</th>
                    <th className="tm-num">Chance each time</th>
                    <th className="tm-num">In losses</th>
                    <th className="tm-num">In wins</th>
                  </tr>
                </thead>
                <tbody>
                  {mc.state.value.risks.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="tm-num tm-mono">{prob(r.p)}</td>
                      <td className="tm-num tm-mono">{prob(r.inLosses)}</td>
                      <td className="tm-num tm-mono">{prob(r.inWins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <Note>
          Every battle draws every roll, crit, miss and side effect; the opponent is played by{' '}
          {view.ctx.label}'s own AI and yours by a policy that uses the move doing the most expected
          damage and sends in the Pokemon that hits hardest.{' '}
          {resolved.pool ? "Each battle draws the facility trainer's team from its pool." : ''}
        </Note>
      </Section>

      <Section
        title={
          setup.nuzlocke
            ? 'Recommended lead and line (Nuzlocke: no faints)'
            : 'Recommended lead and line'
        }
        testId="tm-search"
        aside={
          <span className="tm-row">
            <label className="tm-check">
              <input
                type="checkbox"
                checked={thorough}
                onChange={(e) => setThorough(e.target.checked)}
              />
              Thorough
            </label>
            <button
              type="button"
              className="tm-link"
              data-testid="tm-search-run"
              onClick={() =>
                search.run({
                  kind: 'search',
                  vg: view.vg,
                  input: jobInput(view, 0),
                  opts: thorough
                    ? { leadRuns: 150, rollouts: 24, depth: 8 }
                    : { leadRuns: 60, rollouts: 10, depth: 5 },
                })
              }
            >
              Search
            </button>
          </span>
        }
      >
        <JobStatus state={search.state} onCancel={search.cancel} label="Search" />
        {search.state.status === 'done' && (
          <>
            <table className="tm-table" data-testid="tm-leads">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th className="tm-num">Win</th>
                  <th className="tm-num">No faint</th>
                  <th className="tm-num">Expected faints</th>
                </tr>
              </thead>
              <tbody>
                {search.state.value.leads.map((l, k) => (
                  <tr key={l.key} data-best={k === 0 || undefined}>
                    <td>
                      {k === 0 && <b>Best: </b>}
                      {l.label}
                    </td>
                    <td className="tm-num tm-mono">{probRange(l.winRate)}</td>
                    <td className="tm-num tm-mono">{probRange(l.zeroFaint)}</td>
                    <td className="tm-num tm-mono">{l.expectedFaints.min.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="tm-subhead">Line, turn by turn</h3>
            <ol className="tm-list" data-testid="tm-line">
              {search.state.value.line.map((s) => (
                <li key={s.turn}>
                  <b>
                    T{s.turn}: {s.actionLabel}
                  </b>{' '}
                  ({nameOf(s.mineKey)} vs{' '}
                  {resolved.theirs.find((t) => t.key === s.theirsKey)?.label ?? s.theirsKey}) —{' '}
                  {setup.nuzlocke ? 'clean-win' : 'win'} rate {prob(s.score)}
                  {s.expectedFoe &&
                    `; it likely uses ${s.expectedFoe.label} (${prob(s.expectedFoe.p)})`}
                  {s.alternatives.length > 0 && (
                    <span className="tm-muted">
                      {' '}
                      · next best:{' '}
                      {s.alternatives.map((a) => `${a.label} ${prob(a.score)}`).join(', ')}
                    </span>
                  )}
                  {s.note && <Note tone="low">{s.note}</Note>}
                </li>
              ))}
            </ol>
            <p className="tm-muted">
              The line follows average rolls and the opponent's likeliest action; after it,{' '}
              {search.state.value.lineOutcome === 'won'
                ? 'the battle is won'
                : search.state.value.lineOutcome === 'lost'
                  ? 'the battle is lost'
                  : 'play continues'}
              .
            </p>
          </>
        )}
        <Note>
          Each lead is scored by its own battles; each turn's action by seeded battles played out
          from it (the same seeds for every option, so the comparison is fair).
        </Note>
      </Section>
    </div>
  )
}
