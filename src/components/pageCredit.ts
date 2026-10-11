import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

/**
 * A page's source credit, shown behind the app's "i" control in the bottom-right
 * corner instead of as a paragraph on the page (owner, 2026-10-11: the Trainer
 * Dex's "Parties from the pret disassembly ... Bulbapedia (CC BY-NC-SA)").
 *
 * The info panel is rendered by App, far above any module, so a module cannot
 * hand it a child. This is the smallest channel that crosses that gap: one slot,
 * set by whichever page is mounted and cleared when it unmounts. One slot, not a
 * list, because one page is on screen at a time.
 */
let current: ReactNode = null
const listeners = new Set<() => void>()

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const set = (note: ReactNode) => {
  current = note
  for (const fn of listeners) fn()
}

/** Read by the info panel. */
export function usePageCreditSlot(): ReactNode {
  return useSyncExternalStore(subscribe, () => current)
}

/**
 * Called by a page to put its credit in the panel while it is mounted. `key`
 * says when the content changed (a different game's disassembly), since a fresh
 * ReactNode every render must not re-publish on every render.
 */
export function usePageCredit(note: ReactNode, key: string | null) {
  useEffect(() => {
    if (key == null) return
    set(note)
    return () => set(null)
    // The note is derived from `key`; re-publishing per render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
