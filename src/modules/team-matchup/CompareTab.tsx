/**
 * SCENARIOS SIDE BY SIDE (S7e), which is also how two team variants are compared
 * (R3): each scenario is a saved setup -- its own team, spreads, opponent, field
 * -- and both are computed the same way, next to each other. Scenarios keep link
 * fields for Notes, Journal, the Nuzlocke Tracker and the Collection (R7).
 */

import { useMemo, useState } from 'react'
import { computeMatrix, type Verdict } from '../battle/analysis/matrix'
import type { McResult } from '../battle/analysis/outcome'
import type { MatchupView } from './TeamMatchup'
import type { MatchupSetup, Scenario, ScenarioLinks } from './model'
import { resolveSetup } from './resolve'
import { deleteScenario, loadScenario, updateScenario } from './store'
import { McView } from './OutcomeTab'
import { jobInput } from './jobInput'
import { JobStatus, Note, Section, VerdictMark } from './parts'
import { useJob } from './useJob'

const WORKING = '__working__'

export function CompareTab({ view }: { view: MatchupView }) {
  const { scenarios } = view
  const [a, setA] = useState<string>(WORKING)
  const [b, setB] = useState<string>(scenarios[0]?.id ?? WORKING)
  const pick = (id: string): { name: string; setup: MatchupSetup } =>
    id === WORKING
      ? { name: 'Working setup', setup: view.setup }
      : (() => {
          const s = scenarios.find((x) => x.id === id)
          return s ? { name: s.name, setup: s.setup } : { name: 'Working setup', setup: view.setup }
        })()
  const options = [
    { id: WORKING, name: 'Working setup' },
    ...scenarios.map((s) => ({ id: s.id, name: s.name })),
  ]
  return (
    <div className="tm-compare" data-layout="tm-compare">
      <Section title="Saved scenarios" testId="tm-scenarios">
        {scenarios.length === 0 ? (
          <p>
            None yet. Name and save the setup from the head of the page; each scenario keeps its
            team, spreads, opponent and field.
          </p>
        ) : (
          <ol className="tm-list" data-testid="tm-scenario-list">
            {scenarios.map((s) => (
              <ScenarioRow key={s.id} s={s} />
            ))}
          </ol>
        )}
      </Section>
      <Section title="Side by side" testId="tm-side-by-side">
        <div className="tm-row">
          {(['A', 'B'] as const).map((which) => (
            <label key={which} className="tm-inline-field">
              <span>{which}</span>
              <select
                className="tm-select"
                data-testid={`tm-compare-${which}`}
                value={which === 'A' ? a : b}
                onChange={(e) => (which === 'A' ? setA(e.target.value) : setB(e.target.value))}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="tm-compare-grid" data-layout="tm-compare-grid">
          <Column view={view} {...pick(a)} testId="tm-compare-col-a" />
          <Column view={view} {...pick(b)} testId="tm-compare-col-b" />
        </div>
      </Section>
    </div>
  )
}

function ScenarioRow({ s }: { s: Scenario }) {
  const [open, setOpen] = useState(false)
  const linkLabel: Record<keyof ScenarioLinks, string> = {
    noteId: 'Note',
    journalEntryId: 'Journal entry',
    nuzlockeRunId: 'Nuzlocke run',
    collectionId: 'Collection',
  }
  return (
    <li data-testid={`tm-scenario-${s.id}`}>
      <b>{s.name}</b>{' '}
      <span className="tm-muted">saved {new Date(s.updatedAt).toLocaleString()}</span>{' '}
      <button type="button" className="tm-link" onClick={() => loadScenario(s)}>
        Load
      </button>{' '}
      <button type="button" className="tm-link" onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Notes & links'}
      </button>{' '}
      <button type="button" className="tm-link" onClick={() => deleteScenario(s.id)}>
        Delete
      </button>
      {open && (
        <div className="tm-scenario-detail">
          <label className="tm-inline-field">
            <span>Name</span>
            <input
              className="tm-input"
              defaultValue={s.name}
              onBlur={(e) => updateScenario(s.id, { name: e.target.value.trim() || s.name })}
            />
          </label>
          <label className="tm-inline-field tm-wide">
            <span>Notes</span>
            <textarea
              className="tm-input"
              rows={3}
              defaultValue={s.notes}
              onBlur={(e) => updateScenario(s.id, { notes: e.target.value })}
            />
          </label>
          <dl className="tm-facts">
            {(Object.keys(linkLabel) as (keyof ScenarioLinks)[]).map((k) => (
              <div key={k} className="tm-fact-pair">
                <dt>{linkLabel[k]}</dt>
                <dd>{s.links[k] ?? 'not linked — that module is not built yet'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  )
}

function Column({
  view,
  name,
  setup,
  testId,
}: {
  view: MatchupView
  name: string
  setup: MatchupSetup
  testId: string
}) {
  const { ctx, data, tb, partition } = view
  const resolved = useMemo(
    () => resolveSetup(ctx, setup, tb, partition),
    [ctx, setup, tb, partition],
  )
  const badges = useMemo(() => new Set(setup.badges), [setup.badges])
  const matrix = useMemo(
    () =>
      resolved.mine.length && resolved.theirs.length
        ? computeMatrix({
            ctx,
            data,
            mine: resolved.mine,
            theirs: resolved.theirs,
            field: setup.field,
            badges,
            residual: true,
          })
        : null,
    [ctx, data, resolved, setup.field, badges],
  )
  const mc = useJob<McResult>()
  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { wins: 0, trades: 0, roll: 0, loses: 0 }
    matrix?.cells.flat().forEach((x) => c[x.verdict]++)
    return c
  }, [matrix])
  const colView = { ...view, resolved, setup }
  return (
    <div className="tm-compare-col" data-testid={testId}>
      <h3 className="tm-subhead">{name}</h3>
      <dl className="tm-facts">
        <dt>Team</dt>
        <dd>{resolved.team ? resolved.team.name || `Team #${resolved.team.seq}` : 'none'}</dd>
        <dt>Opponent</dt>
        <dd>{resolved.opponentTitle}</dd>
        <dt>Spreads</dt>
        <dd>
          yours {setup.mySpreadMode === 'custom' ? 'customised' : 'current'}
          {resolved.mine.some((m) => m.spreadMode === 'custom') && setup.mySpreadMode === 'current'
            ? ' (some customised)'
            : ''}{' '}
          · theirs {setup.theirSpreadMode === 'custom' ? 'customised' : 'game data'}
          {[...resolved.mine, ...resolved.theirs].some((m) => m.spread.ceiling) && (
            <span className="tm-ceiling"> · ceiling</span>
          )}
        </dd>
        <dt>Matrix</dt>
        <dd data-testid={`${testId}-verdicts`}>
          {(['wins', 'trades', 'roll', 'loses'] as Verdict[]).map((v) => (
            <span key={v}>
              <VerdictMark verdict={v} /> {counts[v]}{' '}
            </span>
          ))}
        </dd>
        <dt>No answer to</dt>
        <dd>{matrix ? matrix.unanswered.length : '—'}</dd>
      </dl>
      {matrix && (
        <button
          type="button"
          className="tm-link"
          data-testid={`${testId}-run`}
          onClick={() => mc.run({ kind: 'mc', vg: view.vg, input: jobInput(colView, 300) })}
        >
          Run 300 battles
        </button>
      )}
      <JobStatus state={mc.state} onCancel={mc.cancel} label="Monte Carlo" />
      {mc.state.status === 'done' && (
        <McView r={mc.state.value} view={colView} testId={`${testId}-mc`} />
      )}
      {!matrix && <Note>This setup has no team or no opponent.</Note>}
    </div>
  )
}
