/**
 * SWITCHING (P1, P3, P6, P7, P8): with one of theirs on the field and one of
 * yours, what the AI will do (P3, with each move's score breakdown), what each
 * of yours takes coming in and how it fares after (P1), the safe ones first
 * (P6), where a boosting move has room (P7), and U-turn / Baton Pass (P8).
 */

import { useMemo, useState } from 'react'
import { getMove } from '../../data'
import { predictAi, type AiPrediction } from '../battle/ai'
import { pivotOptions, setupWindows, switchInTable } from '../battle/analysis/switching'
import { newBattle } from '../battle/session'
import type { MatchupView } from './TeamMatchup'
import { MonName, Note, Section, VerdictMark } from './parts'
import { pct, prob, probRange } from './format'

export function SwitchTab({ view }: { view: MatchupView }) {
  const { ctx, data, resolved, setup, badges } = view
  const [mineIdx, setMineIdx] = useState(setup.lead)
  const [theirIdx, setTheirIdx] = useState(0)
  const mine = resolved.mine[Math.min(mineIdx, resolved.mine.length - 1)]
  const foe = resolved.theirs[Math.min(theirIdx, resolved.theirs.length - 1)]

  const prediction = useMemo<AiPrediction | null>(() => {
    if (!mine || !foe || !resolved.trainer) return null
    const { state } = newBattle(ctx, data, resolved.mine, resolved.theirs, resolved.trainer, {
      badges: setup.badges,
      mineLead: resolved.mine.indexOf(mine),
      field: setup.field,
    })
    state.sides.theirs.active = resolved.theirs.indexOf(foe)
    return predictAi(ctx, data, state, 300)
  }, [ctx, data, resolved, mine, foe, setup.badges, setup.field])

  const inp = useMemo(
    () => ({
      ctx,
      data,
      mine: resolved.mine,
      theirs: resolved.theirs,
      field: setup.field,
      badges,
      residual: true,
    }),
    [ctx, data, resolved, setup.field, badges],
  )
  const predicted = useMemo(() => {
    if (!prediction || !foe) return undefined
    const m = new Map<number, number>()
    prediction.moves.forEach((mv) => m.set(mv.moveId, mv.pChosen))
    return m
  }, [prediction, foe])
  const rows = useMemo(
    () => (foe ? switchInTable({ ...inp, foe, activeKey: mine?.key ?? null, predicted }) : []),
    [inp, foe, mine, predicted],
  )
  const setups = useMemo(() => setupWindows(inp), [inp])
  const pivots = useMemo(() => (foe ? pivotOptions(inp, foe) : []), [inp, foe])

  if (!mine || !foe) return <Note>Choose your team and an opponent in Setup.</Note>
  const nameOf = (k: string) => [...resolved.mine, ...resolved.theirs].find((s) => s.key === k)
  return (
    <div className="tm-switch-page" data-layout="tm-switch-page">
      <Section title="On the field" testId="tm-switch-field">
        <div className="tm-row">
          <label className="tm-inline-field">
            <span>Yours</span>
            <select
              className="tm-select"
              data-testid="tm-sw-mine"
              value={resolved.mine.indexOf(mine)}
              onChange={(e) => setMineIdx(Number(e.target.value))}
            >
              {resolved.mine.map((m, i) => (
                <option key={m.key} value={i}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tm-inline-field">
            <span>Theirs</span>
            <select
              className="tm-select"
              data-testid="tm-sw-theirs"
              value={resolved.theirs.indexOf(foe)}
              onChange={(e) => setTheirIdx(Number(e.target.value))}
            >
              {resolved.theirs.map((m, i) => (
                <option key={m.key} value={i}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Section>

      {prediction && <PredictionView prediction={prediction} testId="tm-prediction" />}

      <Section title={`Switching in on ${foe.label}`} testId="tm-switch-ins">
        <table className="tm-table" data-testid="tm-switch-table">
          <thead>
            <tr>
              <th>Yours</th>
              <th>Its moves into it</th>
              <th className="tm-num">Hazards</th>
              <th className="tm-num">Worst entry</th>
              <th>Then</th>
              <th>Safe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mineKey} data-safe={r.safe || undefined}>
                <td>
                  <MonName spec={nameOf(r.mineKey)!} />
                </td>
                <td>
                  {r.hits.map((h) => (
                    <span key={h.moveId} className="tm-hit">
                      {h.name}{' '}
                      {h.damage.status === 'ok'
                        ? pct(h.damage.percent, 0)
                        : h.damage.status === 'immune'
                          ? 'immune'
                          : '—'}
                      {h.p != null && <span className="tm-muted"> ({prob(h.p)})</span>}
                    </span>
                  ))}
                </td>
                <td className="tm-num tm-mono">
                  {r.hazards.percent.max > 0 ? pct(r.hazards.percent, 0) : '—'}
                  {r.hazards.status && ` + ${r.hazards.status === 'tox' ? 'bad poison' : 'poison'}`}
                </td>
                <td className="tm-num tm-mono">{pct(r.worstEntry, 0)}</td>
                <td>
                  <VerdictMark verdict={r.after.verdict} />{' '}
                  <span className="tm-muted">{r.after.why}</span>
                </td>
                <td>{r.safe ? 'Safe' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>
          "Safe": survives the worst entry with more than half its HP and then wins or trades. Odds
          in brackets are the AI's move choice above.
        </Note>
      </Section>

      <Section title="Setup windows" testId="tm-setup-windows">
        {setups.length === 0 ? (
          <p>No boosting move of yours turns more matchups into wins.</p>
        ) : (
          <ol className="tm-list">
            {setups.slice(0, 12).map((w, k) => (
              <li key={k}>
                <b>
                  {nameOf(w.mineKey)?.label} on {nameOf(w.onKey)?.label}
                </b>
                : {w.why}. After: {w.sweeps.map((s) => nameOf(s)?.label).join(', ')}.
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="U-turn and Baton Pass" testId="tm-pivots">
        {pivots.length === 0 ? (
          <p>No U-turn or Baton Pass on your team.</p>
        ) : (
          <ol className="tm-list">
            {pivots.map((p, k) => (
              <li key={k}>
                <b>
                  {nameOf(p.userKey)?.label}: {p.moveName}
                </b>{' '}
                — {p.why}; moves first {probRange(p.first)}.
                {p.passes &&
                  ` Passes ${Object.entries(p.passes)
                    .map(([s, v]) => `${s} ${v! > 0 ? '+' : ''}${v}`)
                    .join(', ')}.`}{' '}
                Best landing:{' '}
                {p.landing.slice(0, 2).map((l) => (
                  <span key={l.mineKey}>
                    {nameOf(l.mineKey)?.label} <VerdictMark verdict={l.cell.verdict} />{' '}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

/** P3: the AI's predicted action, and how each move's score was built. */
export function PredictionView({
  prediction,
  testId,
}: {
  prediction: AiPrediction
  testId: string
}) {
  return (
    <Section title="What the AI will do" testId={testId}>
      {prediction.lowConfidence.map((l) => (
        <Note key={l} tone="low">
          {l}
        </Note>
      ))}
      <ol className="tm-list" data-testid={`${testId}-odds`}>
        {prediction.odds.map((o, k) => (
          <li key={k}>
            <b>{o.label}</b> <span className="tm-mono">{prob(o.p)}</span>
          </li>
        ))}
      </ol>
      {prediction.pre.length > 0 && (
        <p className="tm-muted">
          Before choosing a move:{' '}
          {prediction.pre.map((p) => `${p.label} (${prob(p.p)})`).join('; ')}
        </p>
      )}
      <table className="tm-table" data-testid={`${testId}-scores`}>
        <thead>
          <tr>
            <th>Move</th>
            <th className="tm-num">Chosen</th>
            <th className="tm-num">Score</th>
            <th>Adjustments (how often · average change)</th>
          </tr>
        </thead>
        <tbody>
          {prediction.moves.map((m) => (
            <tr key={m.slot}>
              <td>{getMove(m.moveId)?.display_name ?? m.name}</td>
              <td className="tm-num tm-mono">{prob(m.pChosen)}</td>
              <td className="tm-num tm-mono">
                {m.scoreMin === m.scoreMax ? m.scoreMin : `${m.scoreMin}–${m.scoreMax}`}
              </td>
              <td>
                {m.contributions.length === 0
                  ? '—'
                  : m.contributions.slice(0, 6).map((c) => (
                      <span key={c.label} className="tm-contrib">
                        {c.label} {c.meanDelta > 0 ? '+' : ''}
                        {c.meanDelta.toFixed(1)} · {prob(c.frequency)}
                      </span>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        From {prediction.samples} runs of the game's own AI (
        {prediction.better === 'lower'
          ? 'lower score is better; base'
          : 'higher score is better; base'}{' '}
        {prediction.base}). The AI's random checks are part of its choice, so the answer is a
        distribution.
      </Note>
    </Section>
  )
}
