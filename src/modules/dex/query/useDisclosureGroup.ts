import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A set of mutually exclusive disclosures, and the outside click that closes them.
 *
 * Every dex now carries two triggers -- Search/filter and Sort -- hanging panels
 * off the same row. Two independent `useState(false)` toggles would let both
 * panels be open at once, overlapping each other over the list; one open id means
 * opening either closes the other by construction rather than by a handler that
 * has to remember to.
 *
 * DISMISS ON OUTSIDE CLICK IS OPT-IN, and the default is off, because the app bar
 * panel must not have it. That panel contains the cross-dex search, whose results
 * dropdown already owns Escape and whose hits are clicked from inside a floating
 * layer; a panel that vanished on any outside press would take the results with
 * it. The per-dex panels float directly over their own list and do want it: the
 * mockup review locked "click the trigger again, or click away".
 *
 * `mousedown`, not `click`: a press that begins outside should dismiss before the
 * click lands, so the press that closes the panel is also the press that reaches
 * the row underneath. Capture is deliberately NOT used -- a control inside the
 * panel must be able to stop the event from being read as an outside press, and
 * capture would run before it could.
 */
/**
 * DESTRUCTURE THE RESULT AT THE CALL SITE. `ref` travels in the returned object,
 * and the react-hooks lint (rightly) refuses to let an object carrying a ref be
 * passed into a function during render -- which a convenience `isOpen(id)`
 * method would have been. So the group hands back the open id and the callers
 * compare it themselves.
 */
export interface DisclosureGroup {
  openId: string | null
  toggle: (id: string) => void
  close: () => void
  /** Put this on the element that contains every trigger and every panel. */
  ref: React.RefObject<HTMLDivElement | null>
}

export function useDisclosureGroup({
  dismissOnOutsideClick = false,
}: { dismissOnOutsideClick?: boolean } = {}): DisclosureGroup {
  const [openId, setOpenId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dismissOnOutsideClick || openId == null) return
    const onPointerDown = (event: MouseEvent) => {
      const root = ref.current
      if (root && event.target instanceof Node && !root.contains(event.target)) setOpenId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [dismissOnOutsideClick, openId])

  const toggle = useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }, [])

  const close = useCallback(() => setOpenId(null), [])

  return { openId, toggle, close, ref }
}
