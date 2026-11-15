import { IconPlus } from '@tabler/icons-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ScrollArea } from '../../../components/ScrollArea'
import { scrollKey } from '../../../components/scrollMemory'
import type { BrainAppearance, FacilityId, FrontierData, FrontierFormat, LevelMode } from '../data'
import { battleLabel, FACILITY_ORDER, FORMAT_LABEL, LEVEL_LABEL } from '../format'
import { speciesName } from '../names'
import { Appearance, Joined, Kv, MonCell, Muted, Num, SpeciesLink } from '../parts'
import { StreakLookup } from '../StreakLookup'
import { useFrontierData } from '../useFrontierData'
import {
  bpBalance,
  dateText,
  deriveTracker,
  domePairs,
  editLine,
  addLine,
  deleteLine,
  keyViewFor,
  ledgerBalances,
  mostSeen,
  newId,
  nextBrainFor,
  outcomeText,
  setOpening,
  startRun,
  symbolsText,
  today,
  toggleSymbol,
  undoLastBattle,
  UNIT_WORD,
  type Battle,
  type KeyView,
  type LedgerLine,
  type Rental,
  type RunView,
  type TrackerDoc,
  type TrackerView,
} from './model'
import { LogAdd, RunTeam, SymbolToggle } from './LogAdd'
import { trackerDocument } from './trackerStore'
import '../frontier.css'
import './tracker.css'

/**
 * The Challenge Tracker: the owner's runs, their battle logs, the symbols and
 * the Battle Points, on the frontier loader and one saved document
 * (trackerStore.ts). The wording and the regions are the APPROVED mockup's
 * (public/mockups/frontier-tracker.html, scripts/mockups/frontier.mjs).
 *
 * Home, a run's detail and the new-run form are screens INSIDE the module
 * (local state), never back-stack steps. Under any generation but Gen 3 the page
 * is the one notice and nothing loads.
 */
type Screen = { kind: 'home' } | { kind: 'new' } | { kind: 'run'; runId: string }
type Go = (s: Screen) => void
type Update = (fn: (d: TrackerDoc) => TrackerDoc) => void

const update: Update = (fn) => trackerDocument.update(fn)

export function TrackerPage() {
  const load = useFrontierData()
  const [screen, setScreen] = useState<Screen>({ kind: 'home' })
  const where = screen.kind === 'run' ? `run-${screen.runId}` : screen.kind
  return (
    <div className="bf" data-testid="frontier-tracker" data-status={load.status} data-screen={screen.kind}>
      <div className="bf-scroll" data-layout="frontier-scroll">
        {/* A new screen starts at its top: the scroller is keyed by it; home remembers its offset. */}
        <ScrollArea
          key={where}
          className="bf-scroll-area"
          testId="frontier-scroll-area"
          memoryKey={screen.kind === 'home' ? scrollKey('frontier', 'tracker') : undefined}
        >
          {load.status === 'ready' ? (
            <Tracker data={load.data} screen={screen} go={setScreen} />
          ) : (
            <div className="bf-page" data-layout="frontier-tracker">
              <header className="bf-head" data-layout="page-head">
                <h1 className="bf-title">Challenge Tracker</h1>
                {load.status !== 'other-generation' && <span className="bf-scope">Emerald · Gen 3</span>}
              </header>
              {load.status === 'other-generation' && (
                <p className="bf-notice" data-layout="frontier-notice" data-testid="frontier-notice">
                  Battle Frontier data covers Emerald (Gen 3).
                </p>
              )}
              {load.status === 'loading' && <p className="bf-notice">Loading the Battle Frontier…</p>}
              {load.status === 'error' && (
                <p className="bf-notice" role="alert">
                  Could not load the Battle Frontier data: {load.message}.{' '}
                  <button type="button" className="bf-link" onClick={load.retry}>
                    Try again
                  </button>
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}

function Tracker({ data, screen, go }: { data: FrontierData; screen: Screen; go: Go }) {
  const doc = trackerDocument.useDocument()
  const view = useMemo(() => deriveTracker(doc, data), [doc, data])
  const ctx: Ctx = { data, doc, view, go }
  if (screen.kind === 'new') return <NewRun ctx={ctx} />
  const run = screen.kind === 'run' ? view.runs.get(screen.runId) : undefined
  if (run) return <RunDetail ctx={ctx} v={run} />
  if (!doc.runs.length) {
    return (
      <div className="bf-page" data-layout="frontier-tracker">
        <PageHead actions={<NewRunButton go={go} />} />
        <p className="bf-notice" data-layout="tracker-empty" data-testid="tracker-empty">
          No runs yet. Start one, or import a tracker file from your saved documents.
        </p>
      </div>
    )
  }
  return (
    <div className="bf-page bf-page-one" data-layout="frontier-tracker">
      <div className="bf-tracker" data-layout="tracker">
        <PageHead actions={<NewRunButton go={go} />} />
        <div className="bf-tracker-main" data-layout="tracker-main">
          <RunList ctx={ctx} />
          <Insights ctx={ctx} />
        </div>
        <aside className="bf-tracker-side" data-layout="tracker-side">
          <BpPanel ctx={ctx} limit={12} />
        </aside>
      </div>
    </div>
  )
}

interface Ctx {
  data: FrontierData
  doc: TrackerDoc
  view: TrackerView
  go: Go
}

const facilityName = (data: FrontierData, id: FacilityId) => data.facilities().find((f) => f.id === id)?.name ?? id
const brainOf = (data: FrontierData, id: FacilityId) => data.brains().find((b) => b.facility === id)

/* ------------------------------------------------------------------ heads */

function PageHead({ actions }: { actions?: ReactNode }) {
  return (
    <header className="bf-head bf-tracker-head" data-layout="page-head">
      <h1 className="bf-title">Challenge Tracker</h1>
      <span className="bf-scope">Emerald · Gen 3</span>
      {actions && <div className="bf-actions">{actions}</div>}
    </header>
  )
}

function NewRunButton({ go }: { go: Go }) {
  return (
    <button type="button" className="bf-ghost" data-testid="tracker-new-run" onClick={() => go({ kind: 'new' })}>
      <IconPlus size={20} stroke={1.5} aria-hidden />
      New run
    </button>
  )
}

/* ------------------------------------------------------------------ home */

function RunList({ ctx }: { ctx: Ctx }) {
  const { data, view, go } = ctx
  const groups = FACILITY_ORDER.map((f) => [f, view.ordered.filter((v) => v.run.facility === f)] as const).filter(
    ([, list]) => list.length > 0,
  )
  return (
    <section data-layout="tracker-runs">
      <p className="bf-sec">Runs, newest first</p>
      <div className="bf-tw">
        <table className="bf-t" data-testid="tracker-runs">
          <thead>
            <tr>
              <th>Run</th>
              <th>Format</th>
              <th>Level</th>
              <th>Date</th>
              <th className="bf-r">Battles</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([f, list]) => (
              <Fragment key={f}>
                <tr className="bf-group">
                  <td colSpan={6}>
                    {facilityName(data, f)} · {list.length} run{list.length > 1 ? 's' : ''}
                  </td>
                </tr>
                {list
                  .slice()
                  .reverse()
                  .map((v) => (
                    <tr key={v.run.id} data-run-id={v.run.id}>
                      <td>
                        <button
                          type="button"
                          className="bf-link"
                          data-testid={`tracker-run-${v.run.id}`}
                          onClick={() => go({ kind: 'run', runId: v.run.id })}
                        >
                          Run {v.number}
                        </button>
                      </td>
                      <td>{FORMAT_LABEL[v.run.format]}</td>
                      <td>{LEVEL_LABEL[v.run.levelMode]}</td>
                      <td className="bf-nw">
                        {dateText(v.run.startedAt)}
                        {v.run.imported && (
                          <>
                            {' '}
                            <Muted>(imported)</Muted>
                          </>
                        )}
                      </td>
                      <td className="bf-r bf-mono">{v.battles.length}</td>
                      <td>{outcomeText(v)}</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Insights({ ctx }: { ctx: Ctx }) {
  const { data, doc, view } = ctx
  const history = FACILITY_ORDER.map((f) => [f, view.ordered.filter((v) => v.run.facility === f)] as const).filter(
    ([, list]) => list.length > 0,
  )
  const top = mostSeen(doc, speciesName)
  const pairs = domePairs(view)
  return (
    <section className="bf-three" data-layout="tracker-insights">
      <div style={{ gridArea: 'a' }} data-layout="insight-history">
        <p className="bf-sec">Run history</p>
        <table className="bf-t">
          <thead>
            <tr>
              <th>Facility</th>
              <th>Battles per run</th>
              <th className="bf-r">Best</th>
            </tr>
          </thead>
          <tbody>
            {history.map(([f, list]) => (
              <tr key={f}>
                <td>{facilityName(data, f)}</td>
                <td className="bf-nw">
                  <Joined sep={<Muted> · </Muted>} items={list.map((v) => <Num key={v.run.id} n={v.battles.length} />)} />
                </td>
                <td className="bf-r bf-mono">{Math.max(...list.map((v) => v.wins))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ gridArea: 'b' }} data-layout="insight-species">
        <p className="bf-sec">Most-seen opponents</p>
        <table className="bf-t">
          <tbody>
            {top.map(([id, n]) => (
              <tr key={id}>
                <td>
                  <SpeciesLink id={id} />
                </td>
                <td className="bf-r bf-mono">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ gridArea: 'c' }} data-layout="insight-dome-pairs">
        <p className="bf-sec">Dome: win rate per pair</p>
        <table className="bf-t">
          <thead>
            <tr>
              <th>Pair</th>
              <th className="bf-r">Won</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={p.pair.join()}>
                <td>{p.pair.map(speciesName).join(' + ')}</td>
                <td className="bf-r bf-mono">
                  {p.won} / {p.fought}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Battle Points */

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

function BpPanel({ ctx, limit }: { ctx: Ctx; limit: number }) {
  const { data, doc, view } = ctx
  const [all, setAll] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [openingText, setOpeningText] = useState(String(doc.bp.opening))
  const [seenOpening, setSeenOpening] = useState(doc.bp.opening)
  // The stored balance changed elsewhere (an import, the sync): show it (derived state).
  if (seenOpening !== doc.bp.opening) {
    setSeenOpening(doc.bp.opening)
    setOpeningText(String(doc.bp.opening))
  }
  const rows = ledgerBalances(data, doc)
  const shown = rows.slice().reverse().slice(0, all ? rows.length : limit)
  const older = Math.max(0, rows.length - limit)
  const cap = data.addBattlePoints(0, Number.MAX_SAFE_INTEGER)
  const brainName = (l: LedgerLine) => {
    const f = l.runId ? view.runs.get(l.runId)?.run.facility : undefined
    return f ? brainOf(data, f)?.name : undefined
  }

  return (
    <section data-layout="tracker-bp" data-testid="tracker-bp">
      <p className="bf-sec">Battle Points</p>
      <p data-testid="bp-balance">
        <Num n={bpBalance(data, doc)} /> BP{' '}
        <Muted>
          of <Num n={cap} /> max
        </Muted>
      </p>
      <label className="bf-field">
        <span className="bf-cap">Opening balance (your in-game BP before the first logged set)</span>
        <input
          className="bf-uf bf-num"
          inputMode="numeric"
          aria-label="Opening balance"
          data-testid="bp-opening"
          value={openingText}
          onChange={(e) => {
            const t = e.target.value
            setOpeningText(t)
            if (/^\d*$/.test(t.trim())) {
              const n = Number(t.trim() || 0)
              setSeenOpening(n)
              update((d) => setOpening(d, n))
            }
          }}
        />
      </label>
      <div className="bf-tw">
        <table className="bf-t" data-testid="bp-ledger">
          <thead>
            <tr>
              <th>Earned</th>
              <th className="bf-r">BP</th>
              <th className="bf-r">Balance</th>
            </tr>
          </thead>
          <tbody>
            {editing === 'new' && <LineEditor onDone={() => setEditing(null)} />}
            {shown.map(({ line: l, balance }) =>
              editing === l.id ? (
                <LineEditor key={l.id} line={l} onDone={() => setEditing(null)} />
              ) : (
                <tr key={l.id} data-line-id={l.id}>
                  <td>
                    <button
                      type="button"
                      className="bf-link"
                      title="Edit or delete this line"
                      data-testid={`bp-line-${l.id}`}
                      onClick={() => setEditing(l.id)}
                    >
                      {l.reason || 'Untitled'}
                      {l.brainBonus ? (
                        <>
                          {' '}
                          <span className="bf-nw">
                            · {brainName(l) ?? 'Brain'} +<Num n={l.brainBonus} />
                          </span>
                        </>
                      ) : null}
                    </button>
                  </td>
                  <td className="bf-r bf-mono">{signed(l.delta)}</td>
                  <td className="bf-r bf-mono">{balance}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="bf-cap">
        {rows.length} entries;{' '}
        {older > 0 ? (
          <button type="button" className="bf-link" data-testid="bp-show-all" onClick={() => setAll(!all)}>
            {all ? 'show the latest only' : `${older} older not shown`}
          </button>
        ) : (
          `${older} older not shown`
        )}
        . Spending at the Exchange Service Corner is a ledger line with a minus.
      </p>
      <div className="bf-actions bf-bp-actions">
        <button type="button" className="bf-ghost" data-testid="bp-add-line" onClick={() => setEditing('new')}>
          <IconPlus size={20} stroke={1.5} aria-hidden />
          Add a line
        </button>
      </div>
    </section>
  )
}

/** One ledger line being written: a new one (spending is a minus) or an existing one. */
function LineEditor({ line, onDone }: { line?: LedgerLine; onDone: () => void }) {
  const [reason, setReason] = useState(line?.reason ?? '')
  const [bp, setBp] = useState(line ? String(line.delta) : '')
  const delta = /^[+-]?\d+$/.test(bp.trim()) ? Number(bp.trim()) : null
  const save = () => {
    if (delta == null) return
    if (line) update((d) => editLine(d, line.id, { reason: reason.trim(), delta }))
    else update((d) => addLine(d, { id: newId('bp'), at: today(), delta, reason: reason.trim() }))
    onDone()
  }
  return (
    <tr className="bf-edit-row" data-testid="bp-editor">
      <td colSpan={3}>
        <div className="bf-line-edit">
          <label className="bf-field" style={{ gridArea: 'reason' }}>
            <span className="bf-cap">Line</span>
            <input
              className="bf-uf"
              placeholder="What it was for, e.g. Leftovers"
              data-testid="bp-editor-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="bf-field" style={{ gridArea: 'bp' }}>
            <span className="bf-cap">BP (minus for spending)</span>
            <input
              className="bf-uf bf-num"
              inputMode="numeric"
              placeholder="-48"
              data-testid="bp-editor-delta"
              value={bp}
              onChange={(e) => setBp(e.target.value)}
            />
          </label>
          <div className="bf-actions" style={{ gridArea: 'act' }}>
            <button type="button" className="bf-ghost" disabled={delta == null} data-testid="bp-editor-save" onClick={save}>
              Save
            </button>
            {line && (
              <button
                type="button"
                className="bf-ghost"
                data-testid="bp-editor-delete"
                onClick={() => {
                  update((d) => deleteLine(d, line.id))
                  onDone()
                }}
              >
                Delete
              </button>
            )}
            <button type="button" className="bf-ghost" onClick={onDone}>
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

/* ------------------------------------------------------------------ stats */

function StatsPanel({ ctx, k }: { ctx: Ctx; k: KeyView }) {
  const { data } = ctx
  const brain = brainOf(data, k.facility)
  const cur = k.current
  const next = nextBrainFor(data, k)
  const rows: [string, ReactNode][] = [
    [
      'Current streak',
      cur ? (
        <>
          <Num n={cur.wins} /> battles
          {k.facility === 'dome' && (
            <>
              {' '}
              · <Num n={cur.setsCompleted} /> tournaments
            </>
          )}{' '}
          <Muted>(run {cur.number})</Muted>
        </>
      ) : (
        '—'
      ),
    ],
    [
      'Best streak',
      <>
        <Num n={k.best} /> battles
      </>,
    ],
    [
      brain?.symbolName ?? 'Symbols',
      <>
        <SymbolToggle
          label="Silver"
          on={k.held.silver}
          testId={`symbol-${k.facility}-silver`}
          onClick={() => update((d) => toggleSymbol(d, k, 'silver'))}
        />{' '}
        <SymbolToggle
          label="Gold"
          on={k.held.gold}
          testId={`symbol-${k.facility}-gold`}
          onClick={() => update((d) => toggleSymbol(d, k, 'gold'))}
        />
      </>,
    ],
    [
      'Next Brain',
      <>
        {brain?.name}:{' '}
        {next ? (
          <>
            {next.symbol === 'silver' ? 'Silver' : 'Gold'} at <Appearance a={next} />
            {cur ? (
              <>
                , <Num n={next.battle - cur.wins} /> to go
              </>
            ) : null}
          </>
        ) : (
          'None in this streak'
        )}
      </>,
    ],
  ]
  return (
    <section data-layout="tracker-stats" data-testid="tracker-stats">
      <p className="bf-sec">
        {facilityName(data, k.facility)} · {FORMAT_LABEL[k.format]} · {LEVEL_LABEL[k.levelMode]}
      </p>
      <Kv rows={rows} />
      <p className="bf-cap">The symbols are set from the log; toggle one you won before using the app.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ a run */

function RunDetail({ ctx, v }: { ctx: Ctx; v: RunView }) {
  const { data, view, go } = ctx
  const k = keyViewFor(view, v.run)
  const done = v.setsCompleted
  const unit = UNIT_WORD[v.run.facility]
  const last = v.battles.at(-1)
  return (
    <div className="bf-page bf-page-one" data-layout="frontier-run">
      <div className="bf-tracker" data-layout="tracker">
        <header className="bf-run-head" data-layout="run-head">
          <button type="button" className="bf-link bf-backlink" data-testid="tracker-all-runs" onClick={() => go({ kind: 'home' })}>
            All runs
          </button>
          <h1 className="bf-title">
            {facilityName(data, v.run.facility)} · run {v.number}
          </h1>
          <span className="bf-facts" data-testid="run-facts">
            {FORMAT_LABEL[v.run.format]} · {LEVEL_LABEL[v.run.levelMode]} · {outcomeText(v)} ({done} {unit}
            {done === 1 ? '' : 's'}) · symbols: {symbolsText(v.symbolsAtEnd)}
          </span>
        </header>
        <div className="bf-tracker-main" data-layout="tracker-main">
          {v.run.facility === 'dome' && <RunTeam v={v} />}
          {v.run.outcome === 'ongoing' && <LogAdd key={`${v.run.id}-${last?.n ?? 0}`} data={data} v={v} />}
          <RunLog ctx={ctx} v={v} />
          {last && (
            <p className="bf-cap" data-layout="run-undo">
              <button
                type="button"
                className="bf-link"
                data-testid="run-undo"
                onClick={() => trackerDocument.update((d) => undoLastBattle(d, v.run.id, v.perSet))}
              >
                Undo battle {last.n}
              </button>
            </p>
          )}
        </div>
        <aside className="bf-tracker-side" data-layout="tracker-side">
          <StatsPanel ctx={ctx} k={k} />
          <BpPanel ctx={ctx} limit={4} />
        </aside>
      </div>
    </div>
  )
}

/** Three opponents (Unknown included), each with its Emerald sprite, as Trainer Dex parties. */
function Opponents({ ids }: { ids: (number | null)[] }) {
  return (
    <span className="bf-opps">
      <Joined sep={<Muted> · </Muted>} items={ids.map((id, i) => <MonCell key={i} speciesId={id ?? undefined} />)} />
    </span>
  )
}

/** Rentals with their sprites; a chosen set shows as its index. */
export function Rentals({ list }: { list: Rental[] }) {
  return (
    <span className="bf-opps">
      {list.map((r, i) => (
        <span key={i} className="bf-rental">
          <MonCell speciesId={r.species} />
          {r.setIndex != null && <span className="bf-mono bf-muted">#{r.setIndex}</span>}
          {/* The comma belongs to its name; its space is kept for the text, trimmed by the flex row. */}
          {i < list.length - 1 && <span>, </span>}
        </span>
      ))}
    </span>
  )
}

function BrainCell({
  data,
  facility,
  b,
  opponents,
}: {
  data: FrontierData
  facility: FacilityId
  b: BrainAppearance | undefined
  opponents: (number | null)[]
}) {
  if (!b) return null
  const who = brainOf(data, facility)
  if (!who) return null
  const label = `${who.name} · ${b.symbol === 'silver' ? 'Silver' : 'Gold'}`
  if (!who.teams) {
    return (
      <>
        {label}
        <br />
        <span className="bf-cap">Generated team: nothing to compare</span>
      </>
    )
  }
  const known = who.teams[b.symbol].map((m) => m.species_id)
  const match = known.join() === opponents.join()
  return (
    <>
      {label}
      <br />
      <span className="bf-cap">
        Known team: {known.map((id) => (id == null ? '—' : speciesName(id))).join(', ')} ·{' '}
        {match ? 'matches' : 'differs'}
      </span>
    </>
  )
}

function RunLog({ ctx, v }: { ctx: Ctx; v: RunView }) {
  const { data } = ctx
  const [open, setOpen] = useState<string | null>(null)
  const f = v.run.facility
  const dome = f === 'dome'
  const factory = f === 'factory'
  const cols = dome ? 7 : 5
  const team = v.run.dome?.team ?? []
  const draftAt = new Map((v.run.drafts ?? []).map((d) => [d.atBattle, d]))
  const swapsAt = new Map<number, NonNullable<typeof v.run.swaps>>()
  for (const s of v.run.swaps ?? []) swapsAt.set(s.atBattle, [...(swapsAt.get(s.atBattle) ?? []), s])

  const row = (b: Battle) => {
    const brain = v.brains.get(b.id)
    const isOpen = open === b.id
    return (
      <Fragment key={b.id}>
        <tr data-battle-n={b.n} data-brain={brain?.symbol}>
          <td className="bf-r bf-mono">{b.n}</td>
          <td className="bf-nw">
            <button
              type="button"
              className="bf-link"
              aria-expanded={isOpen}
              title="Open the Streak lookup for this battle"
              data-testid={`battle-${b.n}-lookup`}
              onClick={() => setOpen(isOpen ? null : b.id)}
            >
              {battleLabel(f, b.n)}
            </button>
          </td>
          <td className="bf-nw">
            <Opponents ids={b.opponents} />
            {b.note && <span className="bf-cap bf-note">{b.note}</span>}
          </td>
          {dome && (
            <>
              <td className="bf-nw">
                {b.dome?.dropped ? (
                  <>
                    <span className="bf-mono">{b.dome.dropped}</span>{' '}
                    <Muted>{b.opponents[b.dome.dropped - 1] == null ? 'Unknown' : speciesName(b.opponents[b.dome.dropped - 1] as number)}</Muted>
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="bf-nw">
                {(b.dome?.pair ?? [])
                  .slice()
                  .sort((x, y) => team.indexOf(x) - team.indexOf(y))
                  .map(speciesName)
                  .join(' + ')}
              </td>
            </>
          )}
          <td>{b.result === 'W' ? 'Won' : 'Lost'}</td>
          <td className="bf-brain-cell">
            <BrainCell data={data} facility={f} b={brain} opponents={b.opponents} />
          </td>
        </tr>
        {isOpen && (
          <tr className="bf-lookup-row" data-testid={`battle-${b.n}-lookup-row`}>
            <td colSpan={cols}>
              <StreakLookup
                key={b.id}
                data={data}
                initial={{
                  facility: f,
                  levelMode: v.run.levelMode,
                  format: v.run.format,
                  // The logged count of wins before it; the lookup converts at its own loader call.
                  streak: b.n - 1,
                  symbols: v.heldAt.get(b.id) ?? 0,
                }}
              />
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <section data-layout="run-log" data-testid="run-log">
      <p className="bf-sec">{factory ? 'Battle log · your rentals appear when they change' : 'Battle log'}</p>
      <div className="bf-tw">
        <table className="bf-t bf-log">
          <thead>
            <tr>
              <th className="bf-r">#</th>
              <th>Battle</th>
              <th>Opponent</th>
              {dome && (
                <>
                  <th>Dropped</th>
                  <th>Your pair</th>
                </>
              )}
              <th>Result</th>
              <th>Brain</th>
            </tr>
          </thead>
          <tbody>
            {v.battles.map((b) => {
              const draft = factory ? draftAt.get(b.n) : undefined
              const swaps = factory ? swapsAt.get(b.n) : undefined
              return (
                <Fragment key={b.id}>
                  {draft && (
                    <tr className="bf-group" data-draft-at={b.n}>
                      <td colSpan={cols}>
                        {battleLabel(f, b.n).split(' · ')[0]} rentals: <Rentals list={draft.rentals} />
                      </td>
                    </tr>
                  )}
                  {swaps && !draft && (
                    <tr className="bf-swap-row" data-swap-at={b.n}>
                      <td />
                      <td colSpan={cols - 1} className="bf-cap">
                        Swap before battle {b.n}: {swaps.map((s) => speciesName(s.out.species)).join(', ')} out,{' '}
                        <Rentals list={swaps.map((s) => s.in)} /> in
                      </td>
                    </tr>
                  )}
                  {row(b)}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ new run */

function Select<T extends string>({
  label,
  area,
  testId,
  value,
  options,
  onChange,
}: {
  label: string
  area: string
  testId: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <label className="bf-field" style={{ gridArea: area }}>
      <span className="bf-cap">{label}</span>
      <select className="bf-uf" data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function NewRun({ ctx }: { ctx: Ctx }) {
  const { data, go } = ctx
  const [facility, setFacility] = useState<FacilityId>('dome')
  const [format, setFormat] = useState<FrontierFormat>('singles')
  const [levelMode, setLevelMode] = useState<LevelMode>('lv50')
  const facilities = data.facilities()
  const formats = facilities.find((f) => f.id === facility)?.formats.map((x) => x.id) ?? ['singles']
  // Only the formats the facility has: one it lacks reads as its first.
  const fmt: FrontierFormat = formats.includes(format) ? format : formats[0]
  const start = () => {
    const id = newId('run')
    update((d) => startRun(d, { facility, format: fmt, levelMode }, today(), id))
    go({ kind: 'run', runId: id })
  }
  return (
    <div className="bf-page" data-layout="frontier-tracker">
      <PageHead />
      <div className="bf-stack bf-new-run" data-layout="new-run">
        <form className="bf-three" style={{ gridArea: 'form' }} data-layout="new-run-form" onSubmit={(e) => e.preventDefault()}>
          <Select
            label="Facility"
            area="a"
            testId="new-run-facility"
            value={facility}
            options={FACILITY_ORDER.map((id) => ({ value: id, label: facilityName(data, id) }))}
            onChange={setFacility}
          />
          <Select
            label="Format"
            area="b"
            testId="new-run-format"
            value={fmt}
            options={formats.map((id) => ({ value: id, label: FORMAT_LABEL[id] }))}
            onChange={setFormat}
          />
          <Select
            label="Level"
            area="c"
            testId="new-run-level"
            value={levelMode}
            options={(['lv50', 'open'] as const).map((m) => ({ value: m, label: LEVEL_LABEL[m] }))}
            onChange={setLevelMode}
          />
        </form>
        <div className="bf-actions" style={{ gridArea: 'start' }}>
          <button type="button" className="bf-ghost" data-testid="tracker-start-run" onClick={start}>
            Start run
          </button>
          <button type="button" className="bf-ghost" data-testid="tracker-cancel-run" onClick={() => go({ kind: 'home' })}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
