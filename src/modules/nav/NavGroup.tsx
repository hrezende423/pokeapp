import { useCallback, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * One top-level nav item, optionally with a dropdown under it.
 *
 * Opens on hover, on focus and on click, all three. Hover alone would make the
 * dropdown unreachable without a pointer, so the same state is driven by focus
 * entering the group and by clicking the trigger, and Escape closes it. The
 * items stay in the DOM when closed and are hidden with `display: none`, so they
 * are not in the tab order until the group opens -- which is what makes tabbing
 * to the trigger and then straight into the first item work.
 *
 * `role="menu"` is deliberately NOT used: these are links to pages, and a real menu
 * would owe us arrow-key roving focus and a menuitem role on each child. A plain
 * group with aria-expanded describes what this actually is, and Tab already moves
 * through the items in order.
 */
export function NavGroup({
  id,
  label,
  active = false,
  onActivate,
  children,
}: {
  id: string
  label: string
  /** Marks the trigger as the current page. */
  active?: boolean
  /** Clicking the trigger itself, where the trigger is also a destination. */
  onActivate?: () => void
  /** Dropdown items. Omit for a nav item with nothing under it. */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  /*
    Escape closes the dropdown and puts focus back on the trigger -- and focus
    landing on the trigger is itself an "open it" signal, so without this the
    panel reopened on the same keystroke. One-shot: the next focus after an
    Escape is ignored, and every one after that behaves normally.
  */
  const justEscaped = useRef(false)
  const panelId = useId()
  const hasPanel = children != null

  // Focus moving *within* the group must not close it, so this checks where focus
  // actually went rather than closing on every blur.
  const onBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
  }, [])

  return (
    <div
      ref={wrap}
      className="nav-group"
      data-testid={`nav-group-${id}`}
      data-open={hasPanel && open}
      onMouseEnter={() => {
        justEscaped.current = false
        if (hasPanel) setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (justEscaped.current) {
          justEscaped.current = false
          return
        }
        if (hasPanel) setOpen(true)
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          justEscaped.current = true
          setOpen(false)
          wrap.current?.querySelector<HTMLButtonElement>('.nav-trigger')?.focus()
        }
      }}
    >
      <button
        type="button"
        className={active ? 'nav-trigger nav-trigger-active' : 'nav-trigger'}
        data-testid={`nav-tab-${id}`}
        aria-current={active ? 'page' : undefined}
        aria-expanded={hasPanel ? open : undefined}
        aria-controls={hasPanel ? panelId : undefined}
        onClick={() => {
          if (onActivate) onActivate()
          else if (hasPanel) setOpen((v) => !v)
        }}
      >
        {label}
      </button>

      {hasPanel && (
        <div className="nav-dropdown" id={panelId} data-testid={`nav-dropdown-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}
