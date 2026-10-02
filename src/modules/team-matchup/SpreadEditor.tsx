/**
 * S7a-S7d for one Pokemon.
 *
 *   Use current (S7a): the saved numbers, READ-ONLY -- shown, never editable.
 *   Customize (S7b): an editable COPY held in the matchup's state; the saved
 *     build or the game's trainer data is never touched.
 *   Ranges (S7c): every field takes one value ("31") or a range ("0-31"); an
 *     unknown nature is "Any". Every output widens to cover the range.
 *   Maximize all EVs (S7d): every stat to the cap. Legal in Gen 1-2 (Stat Exp has
 *     no total); in Gen 3-4 it is 1512 against 510, so it is labelled a best-case
 *     ceiling here and on every output that uses it.
 */

import { useState } from 'react'
import { listNatures } from '../../data'
import {
  maximizeEffort,
  spreadExceedsCap,
  spreadKeys,
  statAt,
  STAT_IDS,
  type BattlerSpec,
  type SpreadMode,
  type SpreadSpec,
} from '../battle/battler'
import type { GameContext } from '../battle/game'
import { fmtRange, range, type Range } from '../battle/range'
import type { StatKey } from '../team-builder/statMath'
import type { MonOverride } from './model'
import { Choice } from './parts'

const STAT_LABEL: Record<string, string> = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  'special-attack': 'SpA',
  'special-defense': 'SpD',
  special: 'Spc',
  speed: 'Spe',
}

function parseRange(text: string, max: number): Range | null {
  const m = text.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/)
  if (!m) return null
  const a = Math.min(max, Number(m[1]))
  const b = m[2] != null ? Math.min(max, Number(m[2])) : a
  return range(a, b)
}

function RangeField({
  value,
  max,
  label,
  readOnly,
  onCommit,
  testId,
}: {
  value: Range | undefined
  max: number
  label: string
  readOnly: boolean
  onCommit: (r: Range) => void
  testId: string
}) {
  const shown = value ? fmtRange(value, 0, '-') : '0'
  const [draft, setDraft] = useState<string | null>(null)
  const bad = draft != null && parseRange(draft, max) == null
  return (
    <input
      className="tm-input tm-input-num"
      aria-label={label}
      data-testid={testId}
      readOnly={readOnly}
      aria-invalid={bad || undefined}
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft == null) return
        const r = parseRange(draft, max)
        if (r) onCommit(r)
        setDraft(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function SpreadEditor({
  spec,
  ctx,
  override,
  teamMode,
  onChange,
  testId,
}: {
  spec: BattlerSpec
  ctx: GameContext
  override: MonOverride | undefined
  teamMode: SpreadMode
  onChange: (next: MonOverride) => void
  testId: string
}) {
  const gen = ctx.generation
  const mode = override?.spreadMode ?? teamMode
  const readOnly = mode === 'current'
  const spread = spec.spread
  const keys = spreadKeys(gen)
  const setSpread = (next: SpreadSpec) =>
    onChange({ ...override, spreadMode: 'custom', spread: next })
  const edit = (part: 'individual' | 'effort', k: StatKey, r: Range) =>
    setSpread({
      ...spread,
      [part]: { ...spread[part], [k]: r },
      ceiling: part === 'effort' ? false : spread.ceiling,
    })
  const natures = listNatures()
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  const total = Object.values(spread.effort).reduce((s, r) => s + (r?.max ?? 0), 0)
  const over = spreadExceedsCap(spread, ctx)
  return (
    <div className="tm-spread" data-testid={testId} data-mode={mode}>
      <Choice
        label="Spread"
        value={override?.spreadMode ?? 'team'}
        testId={`${testId}-mode`}
        options={[
          {
            value: 'team',
            label: `Team default (${teamMode === 'current' ? 'current' : 'customize'})`,
          },
          { value: 'current', label: 'Use current' },
          { value: 'custom', label: 'Customize' },
        ]}
        onChange={(v) =>
          onChange({
            ...override,
            spreadMode: v === 'team' ? undefined : (v as SpreadMode),
            spread: v === 'current' ? undefined : (override?.spread ?? spread),
          })
        }
      />
      <table className="tm-spread-table">
        <thead>
          <tr>
            <th />
            {STAT_IDS.filter((s) => !(gen === 1 && s === 'spd')).map((s) => (
              <th key={s}>
                {s === 'spa' && gen === 1
                  ? 'Spc'
                  : STAT_LABEL[
                      s === 'atk'
                        ? 'attack'
                        : s === 'def'
                          ? 'defense'
                          : s === 'spa'
                            ? 'special-attack'
                            : s === 'spd'
                              ? 'special-defense'
                              : s === 'spe'
                                ? 'speed'
                                : 'hp'
                    ]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>{gen <= 2 ? 'DV' : 'IV'}</th>
            {STAT_IDS.filter((s) => !(gen === 1 && s === 'spd')).map((s) => {
              const k = keyFor(s, gen)
              if (!keys.individual.includes(k))
                return (
                  <td
                    key={s}
                    className="tm-spread-derived"
                    title="Gen 1-2: the HP DV is derived from the other four"
                  >
                    {gen <= 2 && s === 'hp' ? 'from DVs' : ''}
                  </td>
                )
              if (gen === 2 && s === 'spd')
                return (
                  <td key={s} className="tm-spread-derived">
                    = SpA
                  </td>
                )
              return (
                <td key={s}>
                  <RangeField
                    value={spread.individual[k]}
                    max={ctx.maxIndividual}
                    label={`${STAT_LABEL[k]} ${gen <= 2 ? 'DV' : 'IV'}`}
                    readOnly={readOnly}
                    onCommit={(r) => edit('individual', k, r)}
                    testId={`${testId}-iv-${k}`}
                  />
                </td>
              )
            })}
          </tr>
          <tr>
            <th>{gen <= 2 ? 'Stat Exp' : 'EV'}</th>
            {STAT_IDS.filter((s) => !(gen === 1 && s === 'spd')).map((s) => {
              const k = keyFor(s, gen)
              if (gen === 2 && s === 'spd')
                return (
                  <td key={s} className="tm-spread-derived">
                    = SpA
                  </td>
                )
              return (
                <td key={s}>
                  <RangeField
                    value={spread.effort[k]}
                    max={ctx.maxEffort}
                    label={`${STAT_LABEL[k]} ${gen <= 2 ? 'Stat Exp' : 'EV'}`}
                    readOnly={readOnly}
                    onCommit={(r) => edit('effort', k, r)}
                    testId={`${testId}-ev-${k}`}
                  />
                </td>
              )
            })}
          </tr>
          <tr className="tm-spread-stats">
            <th>Stat</th>
            {STAT_IDS.filter((s) => !(gen === 1 && s === 'spd')).map((s) => {
              const lo = statAt(spec, gen, s, 'low')
              const hi = statAt(spec, gen, s, 'high')
              return <td key={s}>{fmtRange({ min: Math.min(lo, hi), max: Math.max(lo, hi) })}</td>
            })}
          </tr>
        </tbody>
      </table>
      <div className="tm-spread-foot">
        {ctx.hasNatures && (
          <label className="tm-inline-field">
            <span>Nature</span>
            <select
              className="tm-select"
              disabled={readOnly}
              data-testid={`${testId}-nature`}
              value={
                spread.natureIds.length === 1
                  ? String(spread.natureIds[0])
                  : spread.natureIds.length
                    ? 'many'
                    : 'any'
              }
              onChange={(e) =>
                setSpread({
                  ...spread,
                  natureIds: e.target.value === 'any' ? [] : [Number(e.target.value)],
                })
              }
            >
              <option value="any">Any (unknown)</option>
              {spread.natureIds.length > 1 && (
                <option value="many">One of {spread.natureIds.length}</option>
              )}
              {natures.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {ctx.effortTotalCap != null && (
          <span className="tm-spread-total" data-over={over || undefined}>
            EV total {total} / {ctx.effortTotalCap}
          </span>
        )}
        {!readOnly && (
          <button
            type="button"
            className="tm-link"
            data-testid={`${testId}-maximize`}
            onClick={() => setSpread(maximizeEffort(spread, ctx))}
          >
            Maximize all {gen <= 2 ? 'Stat Exp' : 'EVs'}
          </button>
        )}
        {spread.ceiling && (
          <span className="tm-ceiling" data-testid={`${testId}-ceiling`}>
            Best-case ceiling, not a legal spread
          </span>
        )}
        {readOnly && (
          <span className="tm-muted">
            Read-only: the saved values. Choose Customize to edit a copy.
          </span>
        )}
      </div>
    </div>
  )
}

function keyFor(s: (typeof STAT_IDS)[number], gen: number): StatKey {
  switch (s) {
    case 'hp':
      return 'hp'
    case 'atk':
      return 'attack'
    case 'def':
      return 'defense'
    case 'spe':
      return 'speed'
    case 'spa':
      return gen <= 2 ? 'special' : 'special-attack'
    case 'spd':
      return gen <= 2 ? 'special' : 'special-defense'
  }
}
