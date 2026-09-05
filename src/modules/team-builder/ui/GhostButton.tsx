/**
 * The module's two button shapes: a text ghost button, and a bare icon button.
 *
 * GHOST ONLY, NEVER FILLED. Every visible action in Team Building is a ghost
 * button per the spec -- there is exactly one filled-button token in the system
 * (`--button-primary-fill`) and nothing here is the page's primary call to
 * action, because the module has no Save button to be primary in the first place.
 */

import type { ReactNode } from 'react'

export function GhostButton({
  children,
  onClick,
  testId,
  size = 'md',
  danger = false,
  disabled = false,
  /**
   * Drops the outline entirely, leaving glyph and text on the page background.
   * The screen's own back control: it is a way out, not an action, and a boxed
   * button beside a bare page header reads as the loudest thing on the screen.
   */
  bare = false,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  testId?: string
  size?: 'sm' | 'md'
  danger?: boolean
  disabled?: boolean
  bare?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`tb-ghost tb-ghost-${size}`}
      data-bare={bare ? 'true' : undefined}
      data-danger={danger ? 'true' : undefined}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  )
}

/**
 * A hover-revealed icon control.
 *
 * `data-danger` is what the dock and kebab use to place the separator, so the
 * destructive item is identified by the same attribute that colours it rather
 * than by its position in a list.
 */
export function IconButton({
  icon,
  label,
  onClick,
  testId,
  danger = false,
  active = false,
}: {
  icon: ReactNode
  /** Accessible name and tooltip. These controls are icon-only by design. */
  label: string
  onClick?: (e: React.MouseEvent) => void
  testId?: string
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      className="tb-icon-btn"
      data-danger={danger ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      data-testid={testId}
      aria-label={label}
      title={label}
      onClick={(e) => {
        // Cards are clickable surfaces; an icon on one must not also open it.
        e.stopPropagation()
        onClick?.(e)
      }}
    >
      {icon}
    </button>
  )
}
