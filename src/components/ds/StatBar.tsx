import type { ReactNode } from 'react'

/**
 * Stat bar, per design-system/components/stat-bar.md: label, value, then a
 * neutral 8px bar. No ticks, no accent, no colour per stat -- the value label
 * carries the reading and the bar only shows proportion.
 *
 * THE FIRST SHARED IMPLEMENTATION OF THAT SPEC. The species page's base-stat
 * bars predate it and are still drawn inline in SpeciesInfoTab, in --dp-u units
 * and with the retired --accent fill; that screen moves onto this component when
 * it is migrated, not as a side effect of this one landing.
 *
 * `max` is the scale's real ceiling, passed by the caller, because it differs by
 * what is measured: 255 for a base stat, 40 for a berry's flavour potency.
 */
export function StatBar({
  label,
  value,
  max,
  display,
  testId,
}: {
  label: string
  value: number
  max: number
  /** What the value cell prints, when it should differ from the bare number. */
  display?: ReactNode
  testId?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      className="ds-statbar"
      data-ds="stat-bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      data-value={value}
      data-testid={testId}
    >
      <span className="ds-statbar-label">{label}</span>
      <span className="ds-statbar-value">{display ?? value}</span>
      <span className="ds-statbar-track" aria-hidden>
        <span className="ds-statbar-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

/** A stack of stat bars sharing one column grid, so labels and values align. */
export function StatBarList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="ds-statbars" data-testid={testId}>
      {children}
    </div>
  )
}
