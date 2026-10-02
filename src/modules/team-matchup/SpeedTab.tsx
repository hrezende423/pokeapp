/**
 * SPEED: one ladder for both teams, exact ties flagged 50/50 (V1), the modifiers
 * that move a Pokemon on it (V2), the exceptions to it -- priority, Quick Claw,
 * always-last (V3) -- and the solver for "what does it take to outspeed" (V4).
 */

import { useMemo, useState } from 'react'
import { speedLadder, speedThreshold, noMods, type SpeedMods } from '../battle/speed'
import { fmtRange } from '../battle/range'
import type { MatchField } from '../battle/damage'
import type { MatchupView } from './TeamMatchup'
import { MonName, Note, Section } from './parts'
import { prob } from './format'

interface ModState {
  stage: number
  paralyzed: boolean
}

function modsFor(
  mods: Record<string, ModState>,
  field: MatchField,
  key: string,
  side: 'mine' | 'theirs',
): SpeedMods {
  const m = mods[key]
  return {
    ...noMods(field.weather),
    stage: m?.stage ?? 0,
    paralyzed: !!m?.paralyzed,
    statused: !!m?.paralyzed,
    tailwind: !!field.sides[side].tailwind,
  }
}

export function SpeedTab({ view }: { view: MatchupView }) {
  const { ctx, data, resolved, setup, badges } = view
  const [mods, setMods] = useState<Record<string, ModState>>({})
  const all = useMemo(() => [...resolved.mine, ...resolved.theirs], [resolved])
  const ladder = useMemo(
    () =>
      speedLadder(
        ctx,
        data,
        all.map((spec) => ({ spec, mods: modsFor(mods, setup.field, spec.key, spec.side) })),
        badges,
        setup.field.trickRoom,
      ),
    [ctx, data, all, badges, setup.field, mods],
  )
  const [mineKey, setMineKey] = useState<string>('')
  const [targetKey, setTargetKey] = useState<string>('')
  const me = resolved.mine.find((m) => m.key === mineKey) ?? resolved.mine[0]
  const target = resolved.theirs.find((m) => m.key === targetKey) ?? resolved.theirs[0]
  const solved = useMemo(
    () =>
      me && target
        ? speedThreshold(
            ctx,
            data,
            me,
            modsFor(mods, setup.field, me.key, 'mine'),
            target,
            modsFor(mods, setup.field, target.key, 'theirs'),
            badges,
          )
        : null,
    [ctx, data, me, target, badges, mods, setup.field],
  )
  if (!all.length) return <Note>Choose your team and an opponent in Setup.</Note>
  const nameOf = (k: string) => all.find((s) => s.key === k)?.label ?? k
  const setMod = (key: string, patch: Partial<ModState>) =>
    setMods((m) => ({ ...m, [key]: { ...(m[key] ?? { stage: 0, paralyzed: false }), ...patch } }))
  return (
    <div className="tm-speed-page" data-layout="tm-speed-page">
      <Section
        title={
          setup.field.trickRoom && ctx.trickRoom
            ? 'Speed ladder — Trick Room: slowest moves first'
            : 'Speed ladder — fastest first'
        }
        testId="tm-ladder"
      >
        <table className="tm-table" data-testid="tm-ladder-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pokemon</th>
              <th>Side</th>
              <th className="tm-num">Speed</th>
              <th>Stage</th>
              <th>Para</th>
              <th>Exceptions</th>
              <th>Ties and overlaps</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((r) => {
              const spec = all.find((s) => s.key === r.key)!
              return (
                <tr key={r.key} data-side={r.side} data-testid={`tm-ladder-${r.key}`}>
                  <td className="tm-num">{r.rank + 1}</td>
                  <td>
                    <MonName spec={spec} />
                  </td>
                  <td>{r.side === 'mine' ? 'Yours' : 'Theirs'}</td>
                  <td className="tm-num tm-mono">{fmtRange(r.speed)}</td>
                  <td>
                    <select
                      className="tm-select"
                      aria-label="Speed stage"
                      value={mods[r.key]?.stage ?? 0}
                      onChange={(e) => setMod(r.key, { stage: Number(e.target.value) })}
                    >
                      {Array.from({ length: 13 }, (_, i) => i - 6).map((s) => (
                        <option key={s} value={s}>
                          {s > 0 ? `+${s}` : s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Paralysed"
                      checked={!!mods[r.key]?.paralyzed}
                      onChange={(e) => setMod(r.key, { paralyzed: e.target.checked })}
                    />
                  </td>
                  <td>
                    {r.exceptions.map((x) => (
                      <span key={x.label + x.kind} className="tm-exception" data-kind={x.kind}>
                        {x.kind === 'priority'
                          ? `${x.label} (priority ${x.value > 0 ? '+' : ''}${x.value})`
                          : x.kind === 'quick-claw'
                            ? `${x.label} ${prob(x.value)}`
                            : `${x.label}: always last`}
                      </span>
                    ))}
                  </td>
                  <td data-testid={`tm-ladder-ties-${r.key}`}>
                    {r.ties.length > 0 && (
                      <span className="tm-tie">50/50 tie with {r.ties.map(nameOf).join(', ')}</span>
                    )}
                    {r.overlaps.length > 0 && (
                      <span className="tm-muted">
                        {' '}
                        Overlaps {r.overlaps.map(nameOf).join(', ')} (depends on the spread)
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Note>
          {ctx.generation <= 2
            ? `Gen ${ctx.generation}: stat stage, then the Soul/Plain Badge's +1/8 (capped at 999), then paralysis ÷4.`
            : ctx.generation === 3
              ? 'Gen 3: Swift Swim / Chlorophyll ×2 in their weather, stage, the Dynamo/Thunder Badge ×1.1, Macho Brace ÷2, paralysis ÷4; Quick Claw is one 20% roll per turn for everyone.'
              : 'Gen 4: Simple doubles stages, weather abilities ×2, Choice Scarf ×1.5, Iron Ball and the Power items ÷2, Quick Feet ×1.5 or paralysis ÷4, Slow Start ÷2, Unburden ×2, Tailwind ×2, Trick Room reverses; Lagging Tail and Stall move last.'}{' '}
          Weather, Tailwind and Trick Room come from the Field in Setup; Choice Scarf and Quick Claw
          from the held item.
        </Note>
      </Section>

      {me && target && solved && (
        <Section title="What it takes to outspeed" testId="tm-speed-solver">
          <div className="tm-row">
            <label className="tm-inline-field">
              <span>Yours</span>
              <select
                className="tm-select"
                data-testid="tm-solver-mine"
                value={me.key}
                onChange={(e) => setMineKey(e.target.value)}
              >
                {resolved.mine.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tm-inline-field">
              <span>Target</span>
              <select
                className="tm-select"
                data-testid="tm-solver-target"
                value={target.key}
                onChange={(e) => setTargetKey(e.target.value)}
              >
                {resolved.theirs.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <dl className="tm-facts" data-testid="tm-solver-result">
            <dt>Target's Speed (its fastest)</dt>
            <dd className="tm-mono">{solved.target}</dd>
            <dt>Yours (fastest)</dt>
            <dd className="tm-mono">
              {solved.current} —{' '}
              {solved.outspeedsNow
                ? 'outspeeds now'
                : solved.current === solved.target
                  ? 'ties now (50/50)'
                  : 'slower now'}
            </dd>
            <dt>Lowest level that outspeeds</dt>
            <dd className="tm-mono">{solved.minLevel ?? 'none up to 100'}</dd>
            <dt>Least Speed {ctx.spreadModel === 'ev' ? 'EVs' : 'Stat Exp'} (this nature)</dt>
            <dd className="tm-mono">
              {solved.minEffort ?? (solved.bestIsTie ? 'only a tie at the cap' : 'cannot')}
            </dd>
            {ctx.hasNatures && (
              <>
                <dt>With a +Speed nature</dt>
                <dd className="tm-mono">{solved.minEffortPlusNature ?? 'cannot'}</dd>
              </>
            )}
          </dl>
          <Note>
            Priority moves and Quick Claw bypass the comparison — see the Exceptions column.
          </Note>
        </Section>
      )}
    </div>
  )
}
