/**
 * A field label that explains itself (owner's item 3: no ⓘ icons). Hover the
 * label or keyboard-focus it and the explanation appears above it.
 *
 * THE LABEL TEXT IS THE TRIGGER: tabindex=0, the text in `data-tip`, drawn by
 * CSS (`.tb-labeltip::after { content: attr(data-tip) }`), and the same text in
 * a `hidden` span the trigger names with aria-describedby. `hidden` matters: the
 * span sits inside the field's <label>, and hidden content is left out of the
 * control's accessible NAME, while aria-describedby still reads it.
 *
 * Inside a <label> a click on the text would focus (and on a select, open) the
 * control; the text is a tooltip trigger now, so that click is swallowed.
 * Escape blurs a keyboard-opened tip.
 */

import { useId, type ReactNode } from 'react'

export function LabelTip({
  children,
  tip,
  testId,
}: {
  /** The label text. */
  children: ReactNode
  /** Plain-text explanation. Null or empty renders the plain label. */
  tip: string | null
  testId?: string
}) {
  const id = useId()
  if (!tip) return <>{children}</>
  return (
    <>
      <span
        className="tb-labeltip"
        tabIndex={0}
        data-tip={tip}
        aria-describedby={id}
        data-testid={testId}
        onClick={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur()
        }}
      >
        {children}
      </span>
      <span id={id} hidden>
        {tip}
      </span>
    </>
  )
}
