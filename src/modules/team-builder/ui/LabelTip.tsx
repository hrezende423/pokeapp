/**
 * A field label that explains itself: hover it or keyboard-focus it and a
 * tooltip opens above it. Replaces the Build Form's InfoTip, whose "i" icon sat
 * beside the label -- the design system has no info icons; the label IS the
 * trigger (team-builder redesign, item 3).
 *
 * FOCUSABLE TEXT, tabindex=0, described by the panel through aria-describedby.
 * The panel is `display: none` until shown, which matters twice over: it keeps
 * the tooltip's text out of the accessible NAME of the control the surrounding
 * <label> labels (hidden content is skipped by name computation), while
 * aria-describedby can still read it (referenced content is read even when
 * hidden).
 *
 * CSS-ONLY REVEAL, for the reason InfoTip gave: no timers, no listeners for the
 * pointer path. Escape dismisses a keyboard-opened tip (WCAG 1.4.13) by blurring
 * the trigger; a hovered one closes when the pointer leaves.
 *
 * Inside a <label>, a click on the text would otherwise focus -- and on a
 * select, open -- the control. The text is a tooltip trigger now, so the click
 * is swallowed.
 */

import { useId, type ReactNode } from 'react'

export function LabelTip({
  children,
  tip,
  testId,
}: {
  /** The label text. */
  children: ReactNode
  /** Tooltip body. Null renders the plain label, not a trigger. */
  tip: ReactNode | null
  testId?: string
}) {
  const id = useId()
  if (tip == null || tip === '') return <span className="tb-labeltip-text">{children}</span>
  return (
    <span className="tb-labeltip" data-testid={testId}>
      <span
        className="tb-labeltip-trigger"
        tabIndex={0}
        aria-describedby={id}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur()
        }}
      >
        {children}
      </span>
      <span className="tb-labeltip-panel" role="tooltip" id={id}>
        {tip}
      </span>
    </span>
  )
}
