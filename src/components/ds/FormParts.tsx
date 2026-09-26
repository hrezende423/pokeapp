import type { ReactNode } from 'react'

/**
 * The team-build form's structural pieces (DESIGN-SYSTEM.md §5 "Form section
 * label" and "Compact field strip"; §11 "compact strip + EV-dominant layout").
 *
 * FIRST REAL IMPLEMENTATION, BUILT TO BE SHARED. The damage calculator is the
 * first screen to use these; Team Building's Build Form predates them and still
 * draws its own (`.tb-form-*`), frozen by sign-off. Moving the Build Form onto
 * these is logged in CLAUDE.md as deferred work, so the two do not drift further.
 */

/**
 * Uppercase group header -- `--font-size-label`, `--text-secondary` -- breaking a
 * long form into named groups ("Battle setup", "EV allocation", "Moves") with
 * hairline-adjacent spacing. Never a boxed section: the label and a hairline
 * under it are the whole boundary.
 *
 * `aside` is an optional right-aligned slot on the same line, for a readout or a
 * control that belongs to the whole group (an EV total, a mode switch).
 */
export function FormSectionLabel({
  children,
  aside,
  testId,
}: {
  children: ReactNode
  aside?: ReactNode
  testId?: string
}) {
  return (
    <div className="ds-form-section-head" data-ds="form-section-label" data-testid={testId}>
      <h3 className="ds-section-label ds-form-section-label">{children}</h3>
      {aside != null && <div className="ds-form-section-aside">{aside}</div>}
    </div>
  )
}

/**
 * A flex-wrapped row of configuration fields compressed into minimal height so
 * a more important block (the EV table) can take the dominant position below it.
 * Only correct where one part of the form genuinely outranks the rest.
 *
 * Children are ds fields (TextField, SelectField, SearchSelect); each takes an
 * equal share of the row unless it declares `fieldSize` narrow or wide.
 */
export function CompactFieldStrip({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="ds-field-strip" data-ds="compact-field-strip" data-testid={testId}>
      {children}
    </div>
  )
}
