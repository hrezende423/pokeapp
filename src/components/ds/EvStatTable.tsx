import type { CSSProperties, ReactNode } from 'react'

/**
 * The EV/stat editable table (DESIGN-SYSTEM.md §5 "EV/stat editable row").
 *
 * SAME SHAPE AS THE READ-ONLY STAT ROW -- label left, value right, a hairline
 * under each row -- with the effort and individual values editable in
 * `--font-numeric` bold. The running total is plain secondary text under the
 * list, NOT a bar: the species page's base-stat bars are a separate, settled
 * exception that does not extend to a form.
 *
 * THE SLIDER IS THE BUILD FORM'S, by decision: §5 called the plain number field a
 * placeholder until sliders were designed, and Team Building then designed them
 * (SpreadControls.Range). This is that control -- the oblong thumb, the track cut
 * at `--fill`, number box beside it so a value can still be typed -- rather than
 * the placeholder. Its filled run is `--accent`, the same as the Build Form's:
 * stat magnitude, the fourth sanctioned use.
 *
 * ERA-AGNOSTIC BY CONSTRUCTION. A row takes an effort cell and an individual cell,
 * either of which may be absent or read-only, and says nothing about EVs vs Stat
 * Exp: the caller decides which columns an era has (Gen 1-2 Stat Exp takes no
 * slider -- 65,536 values cannot be aimed -- and the HP DV is derived, so it is
 * read-only).
 */

export interface EvCell {
  value: number
  max: number
  onChange: (next: number) => void
  /** Draw the slider after the number box. */
  slider?: boolean
  testId?: string
}

export interface IvCell {
  value: number
  max: number
  /** Omit for a derived, read-only value (the Gen 1-2 HP DV). */
  onChange?: (next: number) => void
  testId?: string
}

export function EvStatTable({
  columns,
  children,
  footer,
  testId,
}: {
  /** Header text for [stat, base, effort, individual, total]; null hides that header cell. */
  columns: [string, string | null, string | null, string | null, string]
  children: ReactNode
  /** The running total / notes line, plain secondary text. */
  footer?: ReactNode
  testId?: string
}) {
  return (
    <div className="ds-ev-table" data-ds="ev-stat-table" data-testid={testId}>
      <div className="ds-ev-row ds-ev-head" aria-hidden>
        {columns.map((c, i) => (
          <span key={i} className={`ds-ev-h ds-ev-h-${i}`}>
            {c ?? ''}
          </span>
        ))}
      </div>
      {children}
      {footer != null && <p className="ds-ev-footer">{footer}</p>}
    </div>
  )
}

const clamp = (n: number, max: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : 0

export function EvStatRow({
  label,
  base,
  effort,
  individual,
  total,
  testId,
}: {
  label: string
  base?: number | null
  effort?: EvCell | null
  individual?: IvCell | null
  /** The computed stat. */
  total: number
  testId?: string
}) {
  return (
    <div className="ds-ev-row" data-ds="ev-stat-row" data-testid={testId}>
      <span className="ds-ev-label">{label}</span>
      <span className="ds-ev-base num">{base ?? ''}</span>
      <span className="ds-ev-effort">
        {effort && (
          <>
            <input
              type="number"
              className="ds-ev-input"
              min={0}
              max={effort.max}
              step={1}
              value={effort.value}
              aria-label={`${label} effort`}
              data-testid={effort.testId}
              onChange={(e) => effort.onChange(clamp(Number(e.target.value), effort.max))}
            />
            {effort.slider && (
              <RangeSlider
                max={effort.max}
                value={effort.value}
                label={`${label} effort slider`}
                testId={effort.testId ? `${effort.testId}-slider` : undefined}
                onChange={effort.onChange}
              />
            )}
          </>
        )}
      </span>
      <span className="ds-ev-individual">
        {individual &&
          (individual.onChange ? (
            <input
              type="number"
              className="ds-ev-input"
              min={0}
              max={individual.max}
              step={1}
              value={individual.value}
              aria-label={`${label} individual value`}
              data-testid={individual.testId}
              onChange={(e) => individual.onChange!(clamp(Number(e.target.value), individual.max))}
            />
          ) : (
            <span
              className="ds-ev-readonly num"
              data-testid={individual.testId}
              title="Derived from the other DVs"
            >
              {individual.value}
            </span>
          ))}
      </span>
      <span className="ds-ev-total num" data-testid={testId ? `${testId}-total` : undefined}>
        {total}
      </span>
    </div>
  )
}

/** The Build Form's slider, as a shared control. */
export function RangeSlider({
  max,
  value,
  onChange,
  label,
  testId,
  disabled = false,
}: {
  max: number
  value: number
  onChange: (next: number) => void
  label: string
  testId?: string
  disabled?: boolean
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <input
      type="range"
      className="ds-range"
      min={0}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      aria-label={label}
      style={{ '--fill': `${pct}%` } as CSSProperties}
      data-testid={testId}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
