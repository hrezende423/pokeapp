/**
 * THE BATCH SCAN (R2): my team against every boss in the game, as a colour-coded
 * grid -- one row per boss, one column per Pokemon of mine (the share of the
 * boss's team it beats or trades with), then the battle's win probability.
 * Colour is never alone: every cell prints its number.
 */

import { useMemo, useState } from 'react'
import type { ScanRow, ScanTarget } from '../battle/analysis/scan'
import { isBoss, trainerInfo, trainerTitle, trainerToSpecs } from '../battle/sources'
import { applyFormat } from '../battle/format'
import type { MatchupView } from './TeamMatchup'
import { JobStatus, MonName, Note, Section } from './parts'
import { probRange } from './format'
import { useJob } from './useJob'

/** No band (no attribute) without a number: a "—" cell (battles off) is never coloured. */
const band = (v: number) =>
  Number.isNaN(v) ? undefined : v >= 0.67 ? 'good' : v >= 0.34 ? 'mid' : 'bad'

export function ScanTab({ view }: { view: MatchupView }) {
  const { partition, ctx, resolved, setup, update, goTo } = view
  const [runs, setRuns] = useState(24)
  const job = useJob<ScanRow[]>()
  const targets = useMemo<ScanTarget[]>(() => {
    if (!partition) return []
    return partition.trainers
      .filter(
        (t) =>
          isBoss(partition, t) && !t.unused && !t.rematch_of && t.appearances[0]?.order != null,
      )
      .sort((a, b) => a.appearances[0].order! - b.appearances[0].order!)
      .map((t) => ({
        key: t.id,
        label: trainerTitle(partition, t),
        order: t.appearances[0].order,
        trainer: trainerInfo(t, ctx.versionGroup),
        theirs: applyFormat([], trainerToSpecs(t, ctx), setup.format).theirs,
        format: t.battle,
      }))
  }, [partition, ctx, setup.format])
  if (!partition) return <Note>Loading trainers…</Note>
  if (!resolved.mine.length) return <Note>Choose your team in Setup.</Note>
  const rows: ScanRow[] =
    job.state.status === 'done'
      ? job.state.value
      : job.state.status === 'running'
        ? (job.state.partial as ScanRow[])
        : []
  return (
    <div className="tm-scan" data-layout="tm-scan">
      <Section
        title={`Every boss in ${ctx.label} (${targets.length})`}
        testId="tm-scan"
        aside={
          <span className="tm-row">
            <select
              className="tm-select"
              aria-label="Battles per boss"
              value={runs}
              onChange={(e) => setRuns(Number(e.target.value))}
            >
              {[0, 12, 24, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n} battles each` : 'Matchups only'}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="tm-link"
              data-testid="tm-scan-run"
              onClick={() =>
                job.run({
                  kind: 'scan',
                  vg: view.vg,
                  input: {
                    mine: resolved.mine,
                    targets,
                    badges: setup.badges,
                    runs,
                    field: undefined,
                  },
                })
              }
            >
              Scan
            </button>
          </span>
        }
      >
        <JobStatus state={job.state} onCancel={job.cancel} label="Scan" />
        {rows.length > 0 && (
          <div className="tm-matrix-wrap">
            <table className="tm-table tm-heat" data-testid="tm-scan-table">
              <thead>
                <tr>
                  <th>Boss</th>
                  <th className="tm-num">Top Lv</th>
                  {resolved.mine.map((m) => (
                    <th key={m.key} className="tm-num">
                      <MonName spec={m} showLevel={false} />
                    </th>
                  ))}
                  <th className="tm-num">No answer</th>
                  <th className="tm-num">Win</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-testid={`tm-scan-row-${r.key}`}>
                    <td>
                      <button
                        type="button"
                        className="tm-link"
                        onClick={() => {
                          update((s) => ({
                            ...s,
                            opponent: { kind: 'trainer', trainerId: r.key },
                            theirs: {},
                          }))
                          goTo('Matrix')
                        }}
                      >
                        {r.label}
                      </button>
                      {r.format !== 'single' && (
                        <span className="tm-muted"> ({r.format}, as singles)</span>
                      )}
                    </td>
                    <td className="tm-num tm-mono">{r.topLevel}</td>
                    {r.perMine.map((p) => (
                      <td key={p.key} className="tm-num tm-mono" data-band={band(p.winsOrTrades)}>
                        {Math.round(p.winsOrTrades * 100)}%
                      </td>
                    ))}
                    <td className="tm-num tm-mono" data-band={r.unanswered ? 'bad' : 'good'}>
                      {r.unanswered}
                    </td>
                    <td className="tm-num tm-mono" data-band={band(r.winRate.min)}>
                      {Number.isNaN(r.winRate.min) ? '—' : probRange(r.winRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          Columns: the share of that boss's team each of yours beats or trades with one-on-one
          (Matrix verdicts). Win: a short Monte Carlo against the boss's AI ({runs} battles; open
          the boss for the full one). Green from two thirds, red under a third — the number is
          always printed.
        </Note>
      </Section>
    </div>
  )
}
