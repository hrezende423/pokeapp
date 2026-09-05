/**
 * The two overlay shapes, and the split between them is a spec rule rather than
 * a styling choice:
 *
 *   POPOVER for type coverage -- a small, read-only, glanceable answer anchored
 *   to the icon that asked for it. Taking over the screen for it would lose the
 *   card you are comparing against.
 *
 *   MODAL for info/notes -- free-text editing needs room and focus, and a
 *   textarea in a 280px popover that closes on outside click would eat edits.
 *
 * Both close on Escape and on an outside click. Neither traps focus, which is a
 * known simplification: the app has no focus-trap utility yet and inventing one
 * here would be the wrong place for it.
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'
import { IconButton } from './GhostButton'

function useDismiss(onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    // Deferred a tick: the click that OPENED this would otherwise close it
    // immediately, since it is still propagating when the listener attaches.
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      clearTimeout(id)
    }
  }, [onClose, ref])
}

export function Popover({
  children,
  onClose,
  testId,
  align = 'right',
}: {
  children: ReactNode
  onClose: () => void
  testId?: string
  /** Which edge of the trigger the panel hangs from. */
  align?: 'left' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(onClose, ref)
  return (
    <div className="tb-popover" data-align={align} data-testid={testId} ref={ref} role="dialog">
      {children}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  testId,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  testId?: string
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(onClose, ref)
  return (
    <div className="tb-modal-scrim" data-testid={testId ? `${testId}-scrim` : undefined}>
      <div
        className="tb-modal"
        data-wide={wide ? 'true' : undefined}
        data-testid={testId}
        ref={ref}
        role="dialog"
        aria-label={title}
      >
        <div className="tb-modal-head">
          <span className="tb-modal-title">{title}</span>
          <IconButton
            icon={<IconX size={18} stroke={1.5} />}
            label="Close"
            onClick={onClose}
            testId={testId ? `${testId}-close` : undefined}
          />
        </div>
        <div className="tb-modal-body">{children}</div>
      </div>
    </div>
  )
}
