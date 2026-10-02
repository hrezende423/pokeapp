/**
 * The small pieces every tab uses: the verdict mark (M2 -- symbol and word, never
 * colour alone), ranges, a Pokemon's name with its spread provenance (S7f), the
 * provenance line, notes, and job progress.
 */

import type { ReactNode } from 'react'
import type { BattlerSpec } from '../battle/battler'
import { effectiveLevel } from '../battle/battler'
import type { Verdict } from '../battle/analysis/matrix'
import { VERDICT } from './format'
import type { JobState } from './useJob'

export function VerdictMark({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict]
  return (
    <span className="tm-verdict" data-verdict={verdict} title={v.title}>
      <span aria-hidden>{v.symbol}</span> {v.word}
    </span>
  )
}

/** A Pokemon's name with what its numbers rest on (S7f), as plain secondary text. */
export function MonName({ spec, showLevel = true }: { spec: BattlerSpec; showLevel?: boolean }) {
  const marks: string[] = []
  if (spec.spreadMode === 'custom') marks.push('custom spread')
  if (spec.spread.ceiling) marks.push('ceiling')
  if (spec.levelOverride != null && spec.levelOverride !== spec.level)
    marks.push(`what-if Lv ${spec.levelOverride}`)
  return (
    <span className="tm-mon" data-key={spec.key}>
      <span className="tm-mon-name">{spec.label}</span>
      {showLevel && <span className="tm-mon-level">Lv {effectiveLevel(spec)}</span>}
      {marks.length > 0 && <span className="tm-mon-marks">{marks.join(' · ')}</span>}
    </span>
  )
}

export function Note({
  children,
  tone = 'plain',
  testId,
}: {
  children: ReactNode
  tone?: 'plain' | 'warn' | 'low'
  testId?: string
}) {
  return (
    <p className="tm-note" data-tone={tone} data-testid={testId}>
      {tone === 'low' && <span className="tm-note-tag">Low confidence: </span>}
      {tone === 'warn' && <span className="tm-note-tag">Note: </span>}
      {children}
    </p>
  )
}

export function Section({
  title,
  children,
  testId,
  aside,
}: {
  title: string
  children: ReactNode
  testId?: string
  aside?: ReactNode
}) {
  return (
    <section className="tm-section" data-testid={testId}>
      <div className="tm-section-head">
        <h2 className="tm-section-title">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function JobStatus<T>({
  state,
  onCancel,
  label,
}: {
  state: JobState<T>
  onCancel: () => void
  label: string
}) {
  if (state.status === 'idle') return null
  if (state.status === 'running')
    return (
      <p className="tm-job" data-testid="tm-job-running">
        {label}: {state.total ? `${state.done} / ${state.total}` : 'starting'}{' '}
        <button type="button" className="tm-link" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  if (state.status === 'error')
    return (
      <p className="tm-job" data-tone="error" data-testid="tm-job-error">
        {label} failed: {state.message}
      </p>
    )
  return (
    <p className="tm-job" data-testid="tm-job-done">
      {label}: done in {(state.ms / 1000).toFixed(1)} s
    </p>
  )
}

/** A two-or-more-way choice as a row of ghost labels (no fill): the active one is underlined in the accent. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  testId,
}: {
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
  label: string
  testId?: string
}) {
  return (
    <div className="tm-choice" role="radiogroup" aria-label={label} data-testid={testId}>
      <span className="tm-choice-label">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          className="tm-choice-option"
          data-value={o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
