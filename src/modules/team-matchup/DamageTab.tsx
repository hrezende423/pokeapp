/**
 * DAMAGE (D1-D5) for one attacker, one defender, one move: every roll, the KO
 * chance over several uses with accuracy, crits, multi-hit counts and end-of-turn
 * residual folded in, under the field and stat stages set here -- and the
 * investment that would change the answer.
 */

import { useMemo, useState } from 'react'
import { getMove } from '../../data'
import type { Boosts, StatusId } from '../calculators/damage'
import { analyzeMove } from '../battle/damage'
import { solveAttack, solveBulk } from '../battle/analysis/solver'
import type { MatchupView } from './TeamMatchup'
import { MonName, Note, Section } from './parts'
import { hits, pct, prob, probRange } from './format'

const STATUSES: StatusId[] = ['healthy', 'par', 'brn', 'psn', 'tox', 'slp', 'frz']

export function DamageTab({ view }: { view: MatchupView }) {
  const { ctx, data, resolved, badges } = view
  const all = [...resolved.mine, ...resolved.theirs]
  const [atkKey, setAtkKey] = useState('')
  const [defKey, setDefKey] = useState('')
  const [moveId, setMoveId] = useState(0)
  const [atkBoost, setAtkBoost] = useState(0)
  const [defBoost, setDefBoost] = useState(0)
  const [atkStatus, setAtkStatus] = useState<StatusId>('healthy')
  const [defStatus, setDefStatus] = useState<StatusId>('healthy')
  const [hp, setHp] = useState(100)
  const [residual, setResidual] = useState(true)
  const [focus, setFocus] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [uses, setUses] = useState(4)
  const [solverUses, setSolverUses] = useState(1)
  const attacker = all.find((s) => s.key === atkKey) ?? resolved.mine[0]
  const defenders = attacker ? (attacker.side === 'mine' ? resolved.theirs : resolved.mine) : []
  const defender = defenders.find((s) => s.key === defKey) ?? defenders[0]
  const move = attacker?.moves.includes(moveId) ? moveId : (attacker?.moves[0] ?? 0)

  const result = useMemo(() => {
    if (!attacker || !defender || !move) return null
    const boosts = (stat: 'atk' | 'def', v: number, category: string): Boosts =>
      v === 0
        ? {}
        : stat === 'atk'
          ? { [category === 'special' ? 'spa' : 'atk']: v }
          : { [category === 'special' ? 'spd' : 'def']: v }
    const probe = analyzeMove({
      ctx,
      data,
      attacker,
      defender,
      moveId: move,
      attackerSide: attacker.side,
      field: resolved.field,
      atk: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      def: { status: 'healthy', boosts: {}, currentHp: null, abilityOn: false },
      badges,
      fast: true,
    })
    return analyzeMove({
      ctx,
      data,
      attacker,
      defender,
      moveId: move,
      attackerSide: attacker.side,
      field: resolved.field,
      atk: {
        status: atkStatus,
        boosts: boosts('atk', atkBoost, probe.category),
        currentHp: null,
        abilityOn: false,
        focusEnergy: focus,
      },
      def: {
        status: defStatus,
        boosts: boosts('def', defBoost, probe.category),
        currentHp: null,
        abilityOn: false,
        hpPct: hp >= 100 ? null : hp,
        leechSeeded: seeded,
      },
      badges,
      uses,
      residual,
    })
  }, [
    ctx,
    data,
    attacker,
    defender,
    move,
    resolved.field,
    atkStatus,
    defStatus,
    atkBoost,
    defBoost,
    hp,
    residual,
    focus,
    seeded,
    uses,
    badges,
  ])

  const solver = useMemo(() => {
    if (!attacker || !defender || !move || !result || result.status !== 'ok') return null
    const inp = { ctx, data, field: resolved.field, badges }
    return attacker.side === 'mine'
      ? { kind: 'attack' as const, a: solveAttack(inp, attacker, defender, move, solverUses) }
      : { kind: 'bulk' as const, b: solveBulk(inp, defender, attacker, move, solverUses) }
  }, [ctx, data, attacker, defender, move, result, resolved.field, badges, solverUses])

  if (!attacker || !defender) return <Note>Choose your team and an opponent in Setup.</Note>
  const unit = ctx.spreadModel === 'ev' ? 'EVs' : 'Stat Exp'
  return (
    <div className="tm-damage-page" data-layout="tm-damage-page">
      <Section title="Matchup" testId="tm-damage-inputs">
        <div className="tm-row">
          <label className="tm-inline-field">
            <span>Attacker</span>
            <select
              className="tm-select"
              data-testid="tm-dmg-attacker"
              value={attacker.key}
              onChange={(e) => setAtkKey(e.target.value)}
            >
              <optgroup label="Yours">
                {resolved.mine.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Theirs">
                {resolved.theirs.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="tm-inline-field">
            <span>Move</span>
            <select
              className="tm-select"
              data-testid="tm-dmg-move"
              value={move}
              onChange={(e) => setMoveId(Number(e.target.value))}
            >
              {attacker.moves.map((id) => (
                <option key={id} value={id}>
                  {getMove(id)?.display_name ?? id}
                </option>
              ))}
            </select>
          </label>
          <label className="tm-inline-field">
            <span>Defender</span>
            <select
              className="tm-select"
              data-testid="tm-dmg-defender"
              value={defender.key}
              onChange={(e) => setDefKey(e.target.value)}
            >
              {defenders.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tm-row">
          <Stage label="Attack stage" value={atkBoost} onChange={setAtkBoost} />
          <Stage label="Defence stage" value={defBoost} onChange={setDefBoost} />
          <StatusSel label="Attacker status" value={atkStatus} onChange={setAtkStatus} />
          <StatusSel label="Defender status" value={defStatus} onChange={setDefStatus} />
          <label className="tm-inline-field">
            <span>Defender HP %</span>
            <input
              type="number"
              className="tm-input tm-input-num"
              min={1}
              max={100}
              value={hp}
              data-testid="tm-dmg-hp"
              onChange={(e) => setHp(Math.max(1, Math.min(100, Number(e.target.value) || 100)))}
            />
          </label>
          <label className="tm-inline-field">
            <span>Uses</span>
            <select
              className="tm-select"
              value={uses}
              onChange={(e) => setUses(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tm-row">
          <label className="tm-check">
            <input
              type="checkbox"
              data-testid="tm-dmg-residual"
              checked={residual}
              onChange={(e) => setResidual(e.target.checked)}
            />
            Residual damage between uses (status, weather, Leech Seed, Leftovers)
          </label>
          <label className="tm-check">
            <input type="checkbox" checked={seeded} onChange={(e) => setSeeded(e.target.checked)} />
            Defender seeded
          </label>
          <label className="tm-check">
            <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
            Focus Energy
          </label>
        </div>
        <Note>Weather, screens and hazards come from the Field in Setup.</Note>
      </Section>

      {result && (
        <Section
          title={`${attacker.label} → ${defender.label}: ${result.name}`}
          testId="tm-damage-result"
        >
          <p className="tm-damage-names">
            <MonName spec={attacker} /> → <MonName spec={defender} />
          </p>
          {result.status !== 'ok' ? (
            <Note tone="warn">
              {result.status === 'status'
                ? 'A status move: no damage.'
                : result.status === 'immune'
                  ? 'It is immune.'
                  : 'Damage not calculated for this move (its power depends on the battle).'}
            </Note>
          ) : (
            <>
              <dl className="tm-facts" data-testid="tm-damage-facts">
                <dt>Damage</dt>
                <dd className="tm-mono">
                  {result.damage.min}–{result.damage.max} ({pct(result.percent)})
                </dd>
                <dt>Critical hit</dt>
                <dd className="tm-mono">
                  {pct(result.critPercent)} · chance {prob(result.critChance)}
                </dd>
                <dt>Accuracy</dt>
                <dd className="tm-mono">{prob(result.accuracy)}</dd>
                {result.hitCounts.length > 1 && (
                  <>
                    <dt>Hits</dt>
                    <dd className="tm-mono">
                      {result.hitCounts.map((h) => `${h.hits}: ${prob(h.p)}`).join(' · ')}
                    </dd>
                  </>
                )}
                <dt>Hits to KO</dt>
                <dd className="tm-mono">
                  {hits(result.hitsToKO)} (from rolls alone; no misses or crits)
                </dd>
                <dt>Expected per use</dt>
                <dd className="tm-mono">
                  {result.expectedPct.toFixed(1)}% (accuracy and crits included)
                </dd>
              </dl>
              <table className="tm-table" data-testid="tm-ko-table">
                <thead>
                  <tr>
                    <th>Uses</th>
                    {result.koChance.map((_, i) => (
                      <th key={i} className="tm-num">
                        {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>P(KO)</th>
                    {result.koChance.map((r, i) => (
                      <td key={i} className="tm-num tm-mono">
                        {probRange(r)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {(['low', 'high'] as const).map((c) => {
                const corner = result[c]
                if (!corner) return null
                return (
                  <div key={c} className="tm-rolls" data-testid={`tm-rolls-${c}`}>
                    <p className="tm-muted">
                      {c === 'low' ? 'Least damage' : 'Most damage'} end of the spreads —{' '}
                      {corner.rolls.length} rolls of {corner.maxHp} HP
                      {corner.startHp !== corner.maxHp ? ` (at ${corner.startHp})` : ''}:
                    </p>
                    <p className="tm-mono tm-roll-list">{corner.rolls.join(' ')}</p>
                    {corner.critRolls.length > 0 && (
                      <p className="tm-mono tm-roll-list tm-muted">
                        crit: {corner.critRolls.join(' ')}
                      </p>
                    )}
                  </div>
                )
              })}
              <p className="tm-muted tm-desc">{result.low?.description}</p>
              {result.notes.map((n) => (
                <Note key={n} tone="warn">
                  {n}
                </Note>
              ))}
              <Note>
                {ctx.generation <= 2 ? '39 rolls, 217–255 of 255' : '16 rolls, 85–100%'}, each
                equally likely; a range covers the spreads' extremes (S7c). KO chances are exact (a
                convolution over every roll, crit, hit count and miss), not sampled.
              </Note>
            </>
          )}
        </Section>
      )}

      {solver && (
        <Section
          title={
            solver.kind === 'attack' ? 'Attack investment to KO' : 'Bulk investment to survive'
          }
          testId="tm-damage-solver"
        >
          <label className="tm-inline-field">
            <span>{solver.kind === 'attack' ? 'KO within' : 'Survive'}</span>
            <select
              className="tm-select"
              value={solverUses}
              onChange={(e) => setSolverUses(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'use' : 'uses'}
                </option>
              ))}
            </select>
          </label>
          {solver.kind === 'attack' ? (
            <dl className="tm-facts" data-testid="tm-solver-attack">
              <dt>Now</dt>
              <dd>
                {solver.a.koNow
                  ? `guaranteed in ${solver.a.uses}`
                  : `needs ${solver.a.currentHitsToKO} at worst`}
              </dd>
              <dt>
                Least {solver.a.attackStat.replace('-', ' ')} {unit}
              </dt>
              <dd className="tm-mono">{solver.a.effort ?? 'not reachable'}</dd>
              {ctx.hasNatures && (
                <>
                  <dt>With a raising nature</dt>
                  <dd className="tm-mono">{solver.a.effortPlusNature ?? 'not reachable'}</dd>
                </>
              )}
            </dl>
          ) : (
            <dl className="tm-facts" data-testid="tm-solver-bulk">
              <dt>Now</dt>
              <dd>
                {solver.b.survivesNow
                  ? `survives ${solver.b.uses}`
                  : `KOed in ${solver.b.currentHitsToKO} at best for it`}
              </dd>
              <dt>HP {unit} alone</dt>
              <dd className="tm-mono">{solver.b.hpOnly ?? 'not enough'}</dd>
              <dt>
                {solver.b.defenseStat.replace('-', ' ')} {unit} alone
              </dt>
              <dd className="tm-mono">{solver.b.defOnly ?? 'not enough'}</dd>
              <dt>Cheapest mix</dt>
              <dd className="tm-mono">
                {solver.b.mix
                  ? `${solver.b.mix.hp} HP / ${solver.b.mix.def} ${solver.b.defenseStat.replace('-', ' ')}`
                  : 'none'}
                {solver.b.exceedsCap && ' — over the 510 EV total with the rest of the spread'}
              </dd>
            </dl>
          )}
          <Note>
            Guaranteed means every roll at every end of the spreads; investment steps are the game's
            own ({ctx.spreadModel === 'ev' ? 'EVs in 4s' : 'Stat Exp where the stat steps up'}).
          </Note>
        </Section>
      )}
    </div>
  )
}

function Stage({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="tm-inline-field">
      <span>{label}</span>
      <select
        className="tm-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {Array.from({ length: 13 }, (_, i) => i - 6).map((s) => (
          <option key={s} value={s}>
            {s > 0 ? `+${s}` : s}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusSel({
  label,
  value,
  onChange,
}: {
  label: string
  value: StatusId
  onChange: (v: StatusId) => void
}) {
  return (
    <label className="tm-inline-field">
      <span>{label}</span>
      <select
        className="tm-select"
        value={value}
        onChange={(e) => onChange(e.target.value as StatusId)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === 'healthy' ? 'Healthy' : s.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  )
}
