/**
 * The little "i" beside a field label, and the panel it reveals on hover.
 *
 * CSS-ONLY REVEAL, no state and no listeners. A tooltip that mounts on
 * mouseenter needs a timer to stop it flickering, a second timer to let the
 * pointer travel into it, and cleanup for both -- and there are ten of these on
 * the Build Form. `:hover`/`:focus-within` on the wrapper is the same behaviour
 * with none of that, and it keeps the panel out of the DOM's event path
 * entirely, which matters because several of these sit inside <label> elements
 * that forward clicks to their control.
 *
 * FOCUSABLE, so the content is reachable without a pointer -- the trigger is a
 * real <button type="button"> that does nothing on click. `aria-describedby`
 * would be the fuller answer; the panel's text is duplicated into `title` here,
 * which is what the native tooltip and screen readers both already read.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. An "i" that opens an empty box
 * is worse than no "i" -- the caller passes null and the icon disappears.
 */

import { IconInfoCircle } from '@tabler/icons-react'
import type { ReactNode } from 'react'

export function InfoTip({
  /** Plain-text summary; also the native title. Null renders nothing at all. */
  summary,
  /** Optional richer body rendered above the summary (stat lines, type labels). */
  children,
  label,
  testId,
}: {
  summary: string | null
  children?: ReactNode
  /** Accessible name for the trigger, e.g. "Leftovers info". */
  label: string
  testId?: string
}) {
  if (!summary && !children) return null
  return (
    <span className="tb-infotip" data-testid={testId}>
      <button
        type="button"
        className="tb-infotip-trigger"
        aria-label={label}
        title={summary ?? undefined}
        /* Inside a <label>, a click would otherwise focus the field's control
           and, on a <select>, open it. */
        onClick={(e) => e.preventDefault()}
      >
        <IconInfoCircle size={13} stroke={1.6} />
      </button>
      <span className="tb-infotip-panel" role="tooltip">
        {children}
        {summary && <span className="tb-infotip-text">{summary}</span>}
      </span>
    </span>
  )
}

/** The stat line above a move's description: Power · PP · Acc · Type · Category. */
export function MoveTipFacts({
  power,
  pp,
  accuracy,
  category,
  type,
}: {
  power: number | null
  pp: number | null
  accuracy: number | null
  category: string | null
  type: ReactNode
}) {
  return (
    <span className="tb-infotip-facts">
      {/* An em dash, not "0" or "—%": a null accuracy means the move cannot miss
          and a null power means it has no fixed base power, and both are facts
          rather than missing data. */}
      <span>
        Power <b className="num">{power ?? '—'}</b>
      </span>
      <span>
        PP <b className="num">{pp ?? '—'}</b>
      </span>
      <span>
        Acc <b className="num">{accuracy == null ? '—' : `${accuracy}%`}</b>
      </span>
      {type}
      {category && <span className="tb-infotip-cat">{category}</span>}
    </span>
  )
}
