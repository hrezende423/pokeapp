/**
 * Select many, delete once. The phone photo-library gesture, on a desktop grid.
 *
 * TWO GESTURES, ONE STATE. A click toggles one item; a press-and-sweep across
 * several applies ONE decision to all of them. The decision is taken from the
 * item the sweep STARTED on -- press an unselected card and you are selecting,
 * press a selected one and you are deselecting -- which is what makes a sweep
 * feel like a highlighter rather than a toggle repeated N times. Toggling per
 * item would flip anything already selected back off as the pointer crossed it.
 *
 * SELECTION MODE IS EXPLICIT. Outside it a card opens on click, and a grid where
 * clicking sometimes opens and sometimes selects is a grid you cannot trust. The
 * dock turns it on; leaving it clears the selection, because a selection you
 * cannot see is a delete waiting to surprise someone.
 *
 * THE POINTER-UP LISTENER IS ON THE WINDOW, not on the items. A sweep that ends
 * outside the grid -- which is most of them, since you let go wherever the last
 * card was -- would otherwise leave the drag latched on, and the next innocent
 * hover would keep selecting.
 *
 * The hook lives apart from the two components it drives because
 * `react-refresh/only-export-components` rejects a file that exports both --
 * the same split usePrompt and ConfirmPrompt already use.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface BulkSelect {
  /** Is the grid in selection mode at all? */
  active: boolean
  selected: Set<string>
  enter: () => void
  exit: () => void
  toggle: (id: string) => void
  /** Props for an item's check circle. Spread them onto <SelectCircle>. */
  itemProps: (id: string) => {
    selected: boolean
    onPointerDown: (e: React.PointerEvent) => void
    onPointerEnter: () => void
  }
}

export function useBulkSelect(): BulkSelect {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  /** Which way the current sweep is painting, or null when nothing is held. */
  const sweep = useRef<'select' | 'deselect' | null>(null)

  useEffect(() => {
    const end = () => {
      sweep.current = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const apply = useCallback((id: string, mode: 'select' | 'deselect') => {
    setSelected((prev) => {
      const has = prev.has(id)
      if (mode === 'select' ? has : !has) return prev
      const next = new Set(prev)
      if (mode === 'select') next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const enter = useCallback(() => setActive(true), [])
  const exit = useCallback(() => {
    setActive(false)
    setSelected(new Set())
  }, [])

  const itemProps = useCallback(
    (id: string) => ({
      selected: selected.has(id),
      onPointerDown: (e: React.PointerEvent) => {
        /* Only the primary button starts a sweep, and the press must not also
           reach the card underneath and open it. */
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const mode = selected.has(id) ? 'deselect' : 'select'
        sweep.current = mode
        apply(id, mode)
      },
      onPointerEnter: () => {
        if (sweep.current) apply(id, sweep.current)
      },
    }),
    [selected, apply],
  )

  return { active, selected, enter, exit, toggle, itemProps }
}
