/**
 * THE MATRIX (M1-M4), with the level what-if (R4) and improvement suggestions (R5).
 */

import { useMemo, useState } from 'react'
import { useNav } from '../nav/navContext'
import { computeMatrix, type MatrixCell } from '../battle/analysis/matrix'
import type { Suggestion } from '../battle/analysis/suggest'
import type { BattlerSpec } from '../battle/battler'
import { effectiveLevel } from '../battle/battler'
import type { MatchupView } from './TeamMatchup'
import { openInDamageCalculator } from './handoff'
import { MonName, Note, Section, VerdictMark, JobStatus } from './parts'
import { hits, pct, probRange } from './format'
import { useJob } from './useJob'

export function MatrixTab({ view }: { view: MatchupView }) {
  const { ctx, data, resolved, setup, badges } = view
  const nav = useNav()
  const [shift, setShift] = useState(0)
  const [who, setWho] = useState<string>('all')
  // R4: a what-if level shift on top of whatever levels the setup holds.
  const mine = useMemo<BattlerSpec[]>(
    () =>
      resolved.mine.map((m) =>
        shift && (who === 'all' || who === m.key)
          ? { ...m, levelOverride: Math.max(1, Math.min(100, effectiveLevel(m) + shift)) }
          : m,
      ),
    [resolved.mine, shift, who],
  )
  const matrix = useMemo(
    () =>
      mine.length && resolved.theirs.length
        ? computeMatrix({
            ctx,
            data,
            mine,
            theirs: resolved.theirs,
            field: setup.field,
            badges,
            residual: true,
          })
        : null,
    [ctx, data, mine, resolved.theirs, setup.field, badges],
  )
  const suggest = useJob<Suggestion[]>()

  if (!resolved.mine.length || !resolved.theirs.length)
    return <Note>Choose your team and an opponent in Setup.</Note>
  const label = (key: string) =>
    [...mine, ...resolved.theirs].find((s) => s.key === key)?.label ?? key
  return (
    <div className="tm-matrix-page" data-layout="tm-matrix-page">
      <Section
        title={`Matrix — ${mine.length} × ${resolved.theirs.length}`}
        testId="tm-matrix"
        aside={
          <span className="tm-legend" data-testid="tm-legend">
            <VerdictMark verdict="wins" /> <VerdictMark verdict="trades" />{' '}
            <VerdictMark verdict="roll" /> <VerdictMark verdict="loses" />
          </span>
        }
      >
        <div className="tm-whatif" data-testid="tm-whatif">
          <label className="tm-inline-field">
            <span>What-if level</span>
            <select className="tm-select" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="all">All of yours</option>
              {resolved.mine.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="range"
            min={-10}
            max={10}
            step={1}
            value={shift}
            aria-label="Level shift"
            data-testid="tm-level-shift"
            onChange={(e) => setShift(Number(e.target.value))}
          />
          <span className="tm-mono">{shift > 0 ? `+${shift}` : shift} levels</span>
          {shift !== 0 && (
            <button type="button" className="tm-link" onClick={() => setShift(0)}>
              Reset
            </button>
          )}
        </div>
        {matrix && (
          <div className="tm-matrix-wrap">
            <table className="tm-matrix" data-testid="tm-matrix-table">
              <thead>
                <tr>
                  <th className="tm-matrix-corner">You ↓ / Them →</th>
                  {resolved.theirs.map((t) => (
                    <th key={t.key} scope="col">
                      <MonName spec={t} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mine.map((m, i) => (
                  <tr key={m.key}>
                    <th scope="row">
                      <MonName spec={m} />
                    </th>
                    {matrix.cells[i].map((c, j) => (
                      <td key={c.theirsKey}>
                        <Cell
                          cell={c}
                          onOpen={() =>
                            openInDamageCalculator(
                              ctx,
                              m,
                              resolved.theirs[j],
                              setup.field,
                              c.myBest?.moveId ?? null,
                              nav.setModule,
                            )
                          }
                          testId={`tm-cell-${i}-${j}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          Each cell: your best move and its damage, theirs, the chance you move first, and hits to
          KO each way (worst–best case over rolls and spread ranges, residual damage included).
          Click a cell to open that pair in the Damage Calculator (ranged values go over at their
          high end; badge boosts do not go over).
        </Note>
      </Section>

      {matrix && (
        <Section title="Coverage gaps" testId="tm-gaps">
          {matrix.unanswered.length === 0 && matrix.noSafeMatchup.length === 0 && (
            <p>Every one of theirs has an answer, and every one of yours has a winning matchup.</p>
          )}
          {matrix.unanswered.length > 0 && (
            <p data-testid="tm-unanswered">
              <b>No answer</b> (nothing of yours wins or trades):{' '}
              {matrix.unanswered.map(label).join(', ')}
            </p>
          )}
          {matrix.noSafeMatchup.length > 0 && (
            <p data-testid="tm-no-safe">
              <b>No winning matchup</b>: {matrix.noSafeMatchup.map(label).join(', ')}
            </p>
          )}
        </Section>
      )}

      <Section
        title="Improvements"
        testId="tm-suggestions"
        aside={
          <button
            type="button"
            className="tm-link"
            data-testid="tm-suggest-run"
            onClick={() =>
              suggest.run({
                kind: 'suggest',
                vg: view.vg,
                input: { mine, theirs: resolved.theirs, badges: setup.badges, field: setup.field },
              })
            }
          >
            Find improvements
          </button>
        }
      >
        <JobStatus state={suggest.state} onCancel={suggest.cancel} label="Suggestions" />
        {suggest.state.status === 'done' && (
          <ol className="tm-list" data-testid="tm-suggestion-list">
            {suggest.state.value.length === 0 && (
              <li>Nothing found that turns a loss into a win.</li>
            )}
            {suggest.state.value.map((s, k) => (
              <li key={k} data-kind={s.kind}>
                <b>{s.title}</b> — {s.detail}
              </li>
            ))}
          </ol>
        )}
        <Note>
          Moves your Pokemon can learn in {ctx.label} (level-up at or below its level, TM/HM,
          tutor), the Speed or bulk investment that flips a close cell, and the level that wins.
          Each is checked by recomputing the cell; none is applied.
        </Note>
      </Section>
    </div>
  )
}

function Cell({ cell, onOpen, testId }: { cell: MatrixCell; onOpen: () => void; testId: string }) {
  const f = cell.first
  const first = f.min >= 1 ? 'you first' : f.max <= 0 ? 'it first' : `you first ${probRange(f)}`
  return (
    <button
      type="button"
      className="tm-cell"
      data-verdict={cell.verdict}
      data-testid={testId}
      onClick={onOpen}
      title={cell.why}
    >
      <VerdictMark verdict={cell.verdict} />
      <span className="tm-cell-line">
        {cell.myBest ? (
          <>
            {cell.myBest.name} <span className="tm-mono">{pct(cell.myBest.percent, 0)}</span>
          </>
        ) : (
          'No damaging move'
        )}
      </span>
      <span className="tm-cell-line tm-muted">
        {cell.theirBest ? (
          <>
            {cell.theirBest.name} <span className="tm-mono">{pct(cell.theirBest.percent, 0)}</span>
          </>
        ) : (
          'It cannot damage you'
        )}
      </span>
      <span className="tm-cell-line tm-mono">
        {hits(cell.myBest?.hitsToKO ?? { min: Infinity, max: Infinity })} /{' '}
        {hits(cell.theirBest?.hitsToKO ?? { min: Infinity, max: Infinity })} HKO · {first}
      </span>
      {cell.ceiling && <span className="tm-ceiling">ceiling</span>}
    </button>
  )
}
