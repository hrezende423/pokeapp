/**
 * THE SANDBOX (P2, with P3-P5 inside it): the battle one turn at a time.
 *
 *   The reader picks every roll and chance by policy -- damage roll (min, mean,
 *   max, random or an exact roll), crits, misses, secondary effects, status
 *   checks -- and their own action; the opponent is the game's AI (its pick is
 *   drawn from its own random checks, or the reader forces one).
 *   Every turn is kept: UNDO steps back, and choosing a different action at any
 *   earlier turn BRANCHES -- the old line stays, listed beside the new one.
 *   The opponent's send-out after a faint (P4) and its item use and switching
 *   (P5) are the AI's, as in the game.
 *
 *   A DOUBLE battle (S6) shows all four battlers; each of mine gets an action and,
 *   for a single-target move, a target (a foe or the ally); each of theirs is the
 *   AI's doubles routine or a forced action; emptied slots are refilled one by one.
 */

import { useMemo, useState } from 'react'
import { getMove } from '../../data'
import { predictAi, predictAiDoubles, actionLabel, actionLabelAt } from '../battle/ai'
import type { BattleData } from '../battle/battleData'
import type { GameContext } from '../battle/game'
import { canSwitch, usableMoveSlots, type Action, type LogLine } from '../battle/engine/turn'
import { Rng, type EventPolicy, type Policies, type RollPolicy } from '../battle/engine/rng'
import {
  activeMon,
  monAt,
  partnerPos,
  standing,
  type BattleState,
  type CornerPick,
  type MonState,
  type Pos,
  type Slot,
} from '../battle/engine/state'
import { needsTarget, standingFoes } from '../battle/engine/doubles'
import {
  greedyDoubles,
  newBattle,
  playerSwitch,
  stepTurn,
  stepTurnDoubles,
} from '../battle/session'
import type { MatchupView } from './TeamMatchup'
import { PredictionView } from './SwitchTab'
import { Choice, Note, Section } from './parts'

interface Node {
  id: number
  parent: number | null
  state: BattleState
  log: LogLine[]
  /** What led here from the parent. */
  label: string
}

const EVENT_OPTIONS: { value: EventPolicy; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'random', label: 'Random' },
  { value: 'always', label: 'Always' },
]

export function SandboxTab({ view }: { view: MatchupView }) {
  const { ctx, data, resolved, setup } = view
  const [minePick, setMinePick] = useState<CornerPick>('high')
  const [theirsPick, setTheirsPick] = useState<CornerPick>('high')
  const [roll, setRoll] = useState<'min' | 'avg' | 'max' | 'random' | 'index'>('avg')
  const [rollIndex, setRollIndex] = useState(0)
  const [crit, setCrit] = useState<EventPolicy>('never')
  const [miss, setMiss] = useState<EventPolicy>('never')
  const [secondary, setSecondary] = useState<EventPolicy>('never')
  const [status, setStatus] = useState<EventPolicy>('never')
  const [forced, setForced] = useState<string>('ai')
  const [seed, setSeed] = useState(1)
  const [tree, setTree] = useState<{ nodes: Node[]; current: number; key: string } | null>(null)

  const startKey = JSON.stringify([
    resolved.mine.map((m) => m.key + m.level + m.levelOverride),
    resolved.theirs.map((t) => t.key),
    setup.lead,
    setup.lead2,
    resolved.doubles,
    minePick,
    theirsPick,
    resolved.field,
    setup.badges,
  ])
  const fresh = useMemo(() => {
    if (!resolved.mine.length || !resolved.theirs.length) return null
    const { state, log } = newBattle(ctx, data, resolved.mine, resolved.theirs, resolved.trainer, {
      badges: setup.badges,
      minePick,
      theirsPick,
      mineLead: setup.lead,
      mineLead2: setup.lead2,
      field: resolved.field,
      doubles: resolved.doubles,
    })
    return {
      nodes: [{ id: 0, parent: null, state, log, label: 'Start' }],
      current: 0,
      key: startKey,
    }
  }, [startKey, ctx, data, resolved, setup.badges, setup.lead, setup.lead2, minePick, theirsPick])
  const t = tree && tree.key === startKey ? tree : fresh
  const node = t?.nodes.find((n) => n.id === t.current) ?? null
  const st = node?.state ?? null
  const prediction = useMemo(
    () =>
      st && !st.doubles && !st.winner && !st.pendingSwitch.length
        ? predictAi(ctx, data, st, 200, 0x5eed + st.turn)
        : null,
    [ctx, data, st],
  )
  // Doubles: one prediction per opposing battler standing.
  const predictions = useMemo(
    () =>
      st && st.doubles && !st.winner
        ? ([0, 1] as Slot[])
            .filter((s) => standing(st, { side: 'theirs', slot: s }))
            .map((s) => ({ slot: s, p: predictAiDoubles(ctx, data, st, s, 200, 0x5eed + st.turn) }))
        : [],
    [ctx, data, st],
  )

  if (!t || !node || !st) return <Note>Choose your team and an opponent in Setup.</Note>

  const policies: Policies = {
    roll: (roll === 'index' ? { index: rollIndex } : roll) as RollPolicy,
    crit,
    miss,
    secondary,
    status,
  }
  const path: Node[] = []
  for (
    let n: Node | undefined = node;
    n;
    n = n.parent == null ? undefined : t.nodes.find((x) => x.id === n!.parent)
  )
    path.unshift(n)
  const push = (state: BattleState, log: LogLine[], label: string) => {
    const id = Math.max(...t.nodes.map((n) => n.id)) + 1
    setTree({
      nodes: [...t.nodes, { id, parent: node.id, state, log, label }],
      current: id,
      key: startKey,
    })
  }
  const act = (a: Action) => {
    const rng = new Rng(seed * 7919 + st.turn)
    const aiRng = new Rng(seed * 104729 + st.turn)
    let forcedAi: Action | undefined
    if (forced.startsWith('m')) forcedAi = { kind: 'move', slot: Number(forced.slice(1)) }
    else if (forced.startsWith('s')) forcedAi = { kind: 'switch', to: Number(forced.slice(1)) }
    const r = stepTurn(ctx, data, st, a, policies, rng, aiRng, forcedAi)
    const foeLabel = r.ai ? actionLabel(st, r.ai.action) : forcedAi ? actionLabel(st, forcedAi) : ''
    push(
      r.state,
      r.log,
      `T${st.turn + 1}: ${labelOf(st, a)}${foeLabel ? ` / foe: ${foeLabel}` : ''}`,
    )
    setForced('ai')
  }
  const replace = (to: number) => {
    const r = playerSwitch(ctx, data, st, to, policies, new Rng(seed + st.turn))
    push(r.state, r.log, `Send out ${st.sides.mine.mons[to].spec.label}`)
  }
  const children = t.nodes.filter((n) => n.parent === node.parent && n.id !== node.id)
  const mine = activeMon(st, 'mine')
  const foe = activeMon(st, 'theirs')
  const mustReplace = st.pendingSwitch.includes('mine') && !st.winner

  return (
    <div className="tm-sandbox" data-layout="tm-sandbox">
      <Section title="Rolls and chances" testId="tm-sb-policies">
        <div className="tm-row">
          <Choice
            label="Damage roll"
            value={roll}
            testId="tm-sb-roll"
            options={[
              { value: 'min', label: 'Min' },
              { value: 'avg', label: 'Mean' },
              { value: 'max', label: 'Max' },
              { value: 'random', label: 'Random' },
              { value: 'index', label: 'Exact' },
            ]}
            onChange={setRoll}
          />
          {roll === 'index' && (
            <label className="tm-inline-field">
              <span>Roll #</span>
              <input
                type="number"
                className="tm-input tm-input-num"
                min={1}
                max={ctx.rolls.count}
                value={rollIndex + 1}
                onChange={(e) =>
                  setRollIndex(
                    Math.max(0, Math.min(ctx.rolls.count - 1, Number(e.target.value) - 1)),
                  )
                }
              />
            </label>
          )}
        </div>
        <div className="tm-row">
          <Choice
            label="Crits"
            value={crit}
            options={EVENT_OPTIONS}
            onChange={setCrit}
            testId="tm-sb-crit"
          />
          <Choice
            label="Misses"
            value={miss}
            options={EVENT_OPTIONS}
            onChange={setMiss}
            testId="tm-sb-miss"
          />
          <Choice
            label="Side effects"
            value={secondary}
            options={EVENT_OPTIONS}
            onChange={setSecondary}
          />
          <Choice
            label="Status checks"
            value={status}
            options={EVENT_OPTIONS}
            onChange={setStatus}
          />
        </div>
        <div className="tm-row">
          <Choice
            label="Your spread end"
            value={minePick}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'high', label: 'High' },
            ]}
            onChange={setMinePick}
          />
          <Choice
            label="Theirs"
            value={theirsPick}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'high', label: 'High' },
            ]}
            onChange={setTheirsPick}
          />
          <label className="tm-inline-field">
            <span>Seed</span>
            <input
              type="number"
              className="tm-input tm-input-num"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 1)}
            />
          </label>
        </div>
      </Section>

      <Section
        title={st.winner ? (st.winner === 'mine' ? 'You won' : 'You lost') : `Turn ${st.turn + 1}`}
        testId="tm-sb-turn"
        aside={
          <span className="tm-row">
            <button
              type="button"
              className="tm-link"
              data-testid="tm-sb-undo"
              disabled={node.parent == null}
              onClick={() => setTree({ ...t, current: node.parent! })}
            >
              Undo
            </button>
            <button
              type="button"
              className="tm-link"
              data-testid="tm-sb-reset"
              onClick={() => setTree(fresh)}
            >
              Restart
            </button>
          </span>
        }
      >
        {st.doubles ? (
          <div className="tm-sb-field tm-sb-field-doubles" data-layout="tm-sb-field">
            {([0, 1] as Slot[]).map((s) => {
              const m = monAt(st, { side: 'mine', slot: s })
              return m ? (
                <MonPanel
                  key={'m' + s}
                  mon={m}
                  side={s === 0 ? 'Yours, left' : 'Yours, right'}
                  testId={'tm-sb-mine' + s}
                />
              ) : null
            })}
            {([0, 1] as Slot[]).map((s) => {
              const m = monAt(st, { side: 'theirs', slot: s })
              return m ? (
                <MonPanel
                  key={'t' + s}
                  mon={m}
                  side={s === 0 ? 'Theirs, left' : 'Theirs, right'}
                  testId={'tm-sb-theirs' + s}
                />
              ) : null
            })}
          </div>
        ) : (
          <div className="tm-sb-field" data-layout="tm-sb-field">
            <MonPanel mon={mine} side="Yours" testId="tm-sb-mine" />
            <MonPanel mon={foe} side="Theirs" testId="tm-sb-theirs" />
          </div>
        )}
        {st.doubles && (
          <DoublesTurn
            key={node.id}
            ctx={ctx}
            data={data}
            st={st}
            policies={policies}
            seed={seed}
            push={push}
          />
        )}
        {!st.doubles && !st.winner && mustReplace && (
          <div className="tm-row" data-testid="tm-sb-replace">
            <span>Send out:</span>
            {canSwitch(st, 'mine').map((i) => (
              <button key={i} type="button" className="tm-link" onClick={() => replace(i)}>
                {st.sides.mine.mons[i].spec.label}
              </button>
            ))}
          </div>
        )}
        {!st.doubles && !st.winner && !mustReplace && (
          <>
            <div className="tm-row" data-testid="tm-sb-actions">
              {usableMoveSlots(ctx, data, st, 'mine').map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="tm-action"
                  data-testid={`tm-sb-move-${slot}`}
                  onClick={() => act({ kind: 'move', slot })}
                >
                  {getMove(mine.spec.moves[slot])?.display_name}{' '}
                  <span className="tm-muted">{mine.pp[slot]} PP</span>
                </button>
              ))}
              {usableMoveSlots(ctx, data, st, 'mine').length === 0 && (
                <button
                  type="button"
                  className="tm-action"
                  onClick={() => act({ kind: 'move', slot: 0 })}
                >
                  Struggle
                </button>
              )}
              {canSwitch(st, 'mine').map((i) => (
                <button
                  key={i}
                  type="button"
                  className="tm-action"
                  onClick={() => act({ kind: 'switch', to: i })}
                >
                  Switch to {st.sides.mine.mons[i].spec.label}
                </button>
              ))}
            </div>
            <label className="tm-inline-field">
              <span>Opponent does</span>
              <select
                className="tm-select"
                data-testid="tm-sb-forced"
                value={forced}
                onChange={(e) => setForced(e.target.value)}
              >
                <option value="ai">What its AI picks</option>
                {foe.spec.moves.map((id, slot) => (
                  <option key={slot} value={`m${slot}`}>
                    {getMove(id)?.display_name}
                  </option>
                ))}
                {canSwitch(st, 'theirs').map((i) => (
                  <option key={`s${i}`} value={`s${i}`}>
                    Switch to {st.sides.theirs.mons[i].spec.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <ol className="tm-log" data-testid="tm-sb-log">
          {path
            .flatMap((n) => n.log)
            .map((l, k) => (
              <li key={k} data-kind={l.kind} data-side={l.side}>
                <span className="tm-muted tm-mono">T{l.turn}</span> {l.text}
                {l.hp && (
                  <span className="tm-muted tm-mono">
                    {' '}
                    ({l.hp.hp}/{l.hp.maxHp})
                  </span>
                )}
              </li>
            ))}
        </ol>
      </Section>

      <Section title="Line and branches" testId="tm-sb-branches">
        <ol className="tm-list">
          {path.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="tm-link"
                aria-current={n.id === node.id}
                onClick={() => setTree({ ...t, current: n.id })}
              >
                {n.label}
              </button>
            </li>
          ))}
        </ol>
        {children.length > 0 && (
          <p data-testid="tm-sb-alt">
            Other branches from here:{' '}
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                className="tm-link"
                onClick={() => setTree({ ...t, current: c.id })}
              >
                {c.label}
              </button>
            ))}
          </p>
        )}
        <Note>Go back to any turn and choose differently to branch; the old line stays here.</Note>
      </Section>

      {prediction && <PredictionView prediction={prediction} testId="tm-sb-prediction" />}
      {predictions.map(({ slot, p }) => (
        <PredictionView key={slot} prediction={p} testId={'tm-sb-prediction-' + slot} />
      ))}
    </div>
  )
}

/** An action as a select value: 'm2@theirs1' (a move at a target), 's4' (a switch). */
function encode(a: Action): string {
  if (a.kind === 'move') return 'm' + a.slot + (a.target ? '@' + a.target.side + a.target.slot : '')
  if (a.kind === 'switch') return 's' + a.to
  return 'n'
}

function decode(v: string): Action {
  if (v.startsWith('s')) return { kind: 'switch', to: Number(v.slice(1)) }
  if (v.startsWith('m')) {
    const [slot, at] = v.slice(1).split('@')
    const target: Pos | undefined = at
      ? { side: at.startsWith('mine') ? 'mine' : 'theirs', slot: Number(at.slice(-1)) as Slot }
      : undefined
    return { kind: 'move', slot: Number(slot), target }
  }
  return { kind: 'none' }
}

/** What one battler can do this turn, for a select (each move at each target it can take). */
function optionsFor(
  ctx: GameContext,
  data: BattleData,
  st: BattleState,
  side: 'mine' | 'theirs',
  slot: Slot,
): { value: string; label: string }[] {
  const at: Pos = { side, slot }
  const m = monAt(st, at)
  if (!m || m.fainted) return []
  const foes = standingFoes(st, at)
  const ally = partnerPos(at)
  const out: { value: string; label: string }[] = []
  const usable =
    side === 'mine' ? usableMoveSlots(ctx, data, st, side, slot) : m.spec.moves.map((_, i) => i)
  for (const ms of usable) {
    const id = m.spec.moves[ms]
    if (!id) continue
    const name = getMove(id)?.display_name ?? 'Move'
    if (needsTarget(data, id)) {
      const targets = [...foes, ...(standing(st, ally) ? [ally] : [])]
      for (const t of targets) {
        const tm = monAt(st, t)!
        out.push({
          value: encode({ kind: 'move', slot: ms, target: t }),
          label: name + ' → ' + tm.spec.label + (t.side === side ? ' (ally)' : ''),
        })
      }
    } else out.push({ value: encode({ kind: 'move', slot: ms, target: foes[0] }), label: name })
  }
  if (!out.length && side === 'mine')
    out.push({ value: encode({ kind: 'move', slot: 0, target: foes[0] }), label: 'Struggle' })
  for (const i of canSwitch(st, side, slot))
    out.push({ value: 's' + i, label: 'Switch to ' + st.sides[side].mons[i].spec.label })
  return out
}

/** S6: the controls for one turn of a double battle. */
function DoublesTurn({
  ctx,
  data,
  st,
  policies,
  seed,
  push,
}: {
  ctx: GameContext
  data: BattleData
  st: BattleState
  policies: Policies
  seed: number
  push: (state: BattleState, log: LogLine[], label: string) => void
}) {
  // Each of mine starts on the greedy suggestion; the reader changes what they like.
  const [picks, setPicks] = useState<Partial<Record<Slot, string>>>(() => {
    const g = greedyDoubles(ctx, data, st)
    return { 0: g[0] ? encode(g[0]) : undefined, 1: g[1] ? encode(g[1]) : undefined }
  })
  const [forced, setForced] = useState<Record<Slot, string>>({ 0: 'ai', 1: 'ai' })
  if (st.winner) return null
  const pending = (st.pendingSlots ?? []).filter((p) => p.side === 'mine')
  if (pending.length) {
    const p = pending[0]
    return (
      <div className="tm-row" data-testid="tm-sb-replace">
        <span>Send out on the {p.slot === 0 ? 'left' : 'right'}:</span>
        {canSwitch(st, 'mine', p.slot).map((i) => (
          <button
            key={i}
            type="button"
            className="tm-link"
            data-testid={'tm-sb-replace-' + i}
            onClick={() => {
              const r = playerSwitch(ctx, data, st, i, policies, new Rng(seed + st.turn), p.slot)
              push(r.state, r.log, 'Send out ' + st.sides.mine.mons[i].spec.label)
            }}
          >
            {st.sides.mine.mons[i].spec.label}
          </button>
        ))}
      </div>
    )
  }
  const mineSlots = ([0, 1] as Slot[]).filter((s) => standing(st, { side: 'mine', slot: s }))
  const theirSlots = ([0, 1] as Slot[]).filter((s) => standing(st, { side: 'theirs', slot: s }))
  const run = () => {
    const mine: Partial<Record<Slot, Action>> = {}
    for (const s of mineSlots) {
      const v = picks[s] ?? optionsFor(ctx, data, st, 'mine', s)[0]?.value
      if (v) mine[s] = decode(v)
    }
    const force: Partial<Record<Slot, Action>> = {}
    for (const s of theirSlots) if (forced[s] !== 'ai') force[s] = decode(forced[s])
    const r = stepTurnDoubles(
      ctx,
      data,
      st,
      mine,
      policies,
      new Rng(seed * 7919 + st.turn),
      new Rng(seed * 104729 + st.turn),
      force,
    )
    const mineLabel = mineSlots
      .map((s) => {
        const a = mine[s]!
        const m = monAt(st, { side: 'mine', slot: s })!
        if (a.kind !== 'move') return m.spec.label + ': switch'
        const t = a.target ? monAt(st, a.target) : undefined
        const name = getMove(m.spec.moves[a.slot])?.display_name ?? 'Move'
        return m.spec.label + ': ' + name + (t ? ' → ' + t.spec.label : '')
      })
      .join(', ')
    const foeLabel = theirSlots
      .map((s) => {
        const a = force[s] ?? r.ai.find((x) => x.slot === s)?.choice.action
        return a ? actionLabelAt(st, a, s) : ''
      })
      .filter(Boolean)
      .join(', ')
    push(
      r.state,
      r.log,
      'T' + (st.turn + 1) + ': ' + mineLabel + (foeLabel ? ' / foe: ' + foeLabel : ''),
    )
  }
  return (
    <div className="tm-sb-doubles" data-testid="tm-sb-actions">
      {mineSlots.map((s) => (
        <label key={'m' + s} className="tm-inline-field">
          <span>{monAt(st, { side: 'mine', slot: s })!.spec.label}</span>
          <select
            className="tm-select"
            data-testid={'tm-sb-act-' + s}
            value={picks[s] ?? ''}
            onChange={(e) => setPicks({ ...picks, [s]: e.target.value })}
          >
            {optionsFor(ctx, data, st, 'mine', s).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {theirSlots.map((s) => (
        <label key={'t' + s} className="tm-inline-field">
          <span>{monAt(st, { side: 'theirs', slot: s })!.spec.label} does</span>
          <select
            className="tm-select"
            data-testid={'tm-sb-forced-' + s}
            value={forced[s]}
            onChange={(e) => setForced({ ...forced, [s]: e.target.value })}
          >
            <option value="ai">What its AI picks</option>
            {optionsFor(ctx, data, st, 'theirs', s).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {ctx.generation === 3 && (
        <Note>
          Generation 3 refills an emptied slot at once, mid-turn: one of yours that faints is
          replaced by the best matchup there and then (Undo to play it differently).
        </Note>
      )}
      <button type="button" className="tm-action" data-testid="tm-sb-go" onClick={run}>
        Play turn {st.turn + 1}
      </button>
    </div>
  )
}

function labelOf(st: BattleState, a: Action): string {
  const m = activeMon(st, 'mine')
  if (a.kind === 'move') return getMove(m.spec.moves[a.slot])?.display_name ?? 'Move'
  if (a.kind === 'switch') return `Switch to ${st.sides.mine.mons[a.to].spec.label}`
  return 'Nothing'
}

function MonPanel({ mon, side, testId }: { mon: MonState; side: string; testId: string }) {
  const boosts = Object.entries(mon.boosts).filter(([, v]) => v !== 0)
  return (
    <div className="tm-sb-mon" data-testid={testId}>
      <span className="tm-muted">{side}</span>
      <b>{mon.spec.label}</b>
      <span className="tm-mono" data-testid={`${testId}-hp`}>
        {mon.hp}/{mon.maxHp} HP ({Math.round((100 * mon.hp) / mon.maxHp)}%)
      </span>
      <span>{mon.status === 'healthy' ? 'No status' : mon.status.toUpperCase()}</span>
      {boosts.length > 0 && (
        <span className="tm-mono">
          {boosts.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' ')}
        </span>
      )}
    </div>
  )
}
