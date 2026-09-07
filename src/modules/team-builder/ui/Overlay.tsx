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

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from '@tabler/icons-react'
import { IconButton } from './GhostButton'

/* The gap between the trigger and the panel hanging off it. */
const ANCHOR_GAP = 6
/* Breathing room kept between a placed panel and the window edge. */
const EDGE = 8
/* A floor for the panel's room, so an anchor squeezed against one edge of a
   short window still gets a panel worth reading rather than a 4px sliver. */
const MIN_ROOM = 140

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

/**
 * A PANEL IN THE WINDOW, NOT IN THE CARD.
 *
 * This was `position: absolute` inside the wrapper that holds its trigger, and
 * that is how every edge of it came to be cut off. Two different ancestors did
 * the cutting:
 *
 *   `.tb-card` sets `overflow: hidden` -- it has to, the ghost watermark and the
 *   artwork both bleed to the card's edge -- so a member's coverage panel was
 *   clipped to the card it hung off. On the Team Display the card is 264px wide
 *   and the panel is wider than that AND taller than a grid row, so it lost its
 *   right edge and its bottom rows.
 *
 *   the window itself, for a panel anchored near an edge. The team's own panel
 *   hangs off a dock that now sits in the narrow left column, and a right-
 *   aligned panel there starts at a NEGATIVE x.
 *
 * So the panel is portalled to the body and placed in viewport coordinates,
 * which is the only frame of reference that can be checked against the window.
 * It keeps the same anchor contract as before -- it hangs off the positioned
 * wrapper it is written inside, from the edge `align` names -- and then:
 *
 *   it is PUSHED BACK INSIDE horizontally rather than flipped, because a
 *   coverage chart's left edge is its labels and flipping would move the panel
 *   out from under the icon that opened it,
 *
 *   it FLIPS ABOVE the trigger when there is more room above than below, and
 *   takes a `max-height` of whatever room that side has, so a panel taller than
 *   the window scrolls inside itself instead of running off the bottom.
 *
 * A side effect worth having: the panel no longer inherits `.tb-corner`'s
 * `opacity: 0`, so moving the mouse off the card no longer makes an open panel
 * invisible while it is still open.
 */
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
  /* Rendered where the panel used to be, so its parent IS the anchor -- no call
     site has to pass a ref, and each keeps the wrapper it already hangs off. */
  const mark = useRef<HTMLSpanElement>(null)
  const [placed, setPlaced] = useState<{ left: number; top: number; maxHeight: number } | null>(
    null,
  )
  useDismiss(onClose, ref)

  const place = useCallback(() => {
    const panel = ref.current
    const anchor = mark.current?.parentElement
    if (!panel || !anchor) return
    const a = anchor.getBoundingClientRect()
    /*
      THE APP FRAME, not the window, is what a panel is kept inside. `.panel`
      is the surface every module draws on and it does not fill the window --
      clamped to the window instead, the team's own panel (aligned right off a
      dock that now sits in a narrow left column) came to rest OUTSIDE the app,
      hanging over the page background beside it. clientWidth/Height, not
      innerWidth/Height: they exclude a classic scrollbar, which innerWidth
      counts as space the panel could sit in.
    */
    const frame = anchor.closest('.panel')?.getBoundingClientRect()
    const minX = Math.max(EDGE, (frame?.left ?? 0) + EDGE)
    const maxX = Math.min(
      document.documentElement.clientWidth - EDGE,
      (frame?.right ?? Infinity) - EDGE,
    )
    const minY = Math.max(EDGE, (frame?.top ?? 0) + EDGE)
    const maxY = Math.min(
      document.documentElement.clientHeight - EDGE,
      (frame?.bottom ?? Infinity) - EDGE,
    )

    const below = maxY - a.bottom - ANCHOR_GAP
    const above = a.top - ANCHOR_GAP - minY
    const down = below >= above
    const maxHeight = Math.max(down ? below : above, MIN_ROOM)
    /* scrollHeight is the CONTENT height, so it survives a max-height set by an
       earlier pass -- measuring the box would ratchet the panel smaller. */
    const height = Math.min(panel.scrollHeight + 2, maxHeight)
    const top = down ? a.bottom + ANCHOR_GAP : Math.max(minY, a.top - ANCHOR_GAP - height)

    const width = panel.offsetWidth
    const wanted = align === 'right' ? a.right - width : a.left
    const left = Math.max(minX, Math.min(wanted, maxX - width))
    setPlaced({ left, top, maxHeight })
  }, [align])

  useLayoutEffect(() => {
    place()
    /* Capture, because the thing that scrolls is `.scroll-area`, not the window. */
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [place])

  return (
    <>
      <span className="tb-popover-anchor" ref={mark} aria-hidden />
      {createPortal(
        <div
          className="tb-popover"
          data-align={align}
          data-testid={testId}
          ref={ref}
          role="dialog"
          style={
            placed
              ? { left: placed.left, top: placed.top, maxHeight: placed.maxHeight }
              : /* First pass only: on screen to be measured, not yet to be seen. */
                { left: 0, top: 0, visibility: 'hidden' }
          }
        >
          {children}
        </div>,
        document.body,
      )}
    </>
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
