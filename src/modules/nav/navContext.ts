/**
 * Which dex is open, and which entry is open inside each one.
 *
 * Selection is held here rather than inside each module for one reason: the global
 * search has to be able to open an entry in a dex that is not currently mounted.
 * With the state lifted, "switch to the Abilitydex and open Levitate" is a single
 * synchronous update -- no effect that syncs a prop into local state after the
 * module mounts, and so no window where the module is showing the wrong entry.
 *
 * Selection is kept per module, so switching tabs and back returns to what was
 * open rather than resetting.
 *
 * Deliberately NOT a router. Deep links need one; that is a later pass.
 */

import { createContext, useContext } from 'react'
import type { DexModuleId } from './registry'
import type { PageId } from './navConfig'

/**
 * Every id here is a DexModuleId -- the union the registry actually declares --
 * rather than a string. A dex whose shell id does not match its registered id, or
 * a search result pointing at an unregistered module, is then a compile error
 * instead of a click that silently lands somewhere else.
 */
export interface NavState {
  /**
   * The open page. A PageId, not a DexModuleId: the nav reaches destinations
   * that are not dexes. Per-entry selection below stays DexModuleId-only, so a
   * search result can still only point at a module that actually has entries.
   */
  moduleId: PageId
  setModule: (moduleId: PageId) => void
  /** The open entry in `moduleId`, or null when nothing is open. */
  selectionFor: (moduleId: DexModuleId) => number | null
  select: (moduleId: DexModuleId, entryId: number | null) => void
  /** Switch to a module and open one of its entries, in one update. */
  navigate: (moduleId: DexModuleId, entryId: number) => void
}

export const NavContext = createContext<NavState | null>(null)

export function useNav(): NavState {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used inside <NavProvider>')
  return ctx
}

/** A module's own selection, in the shape local state used to have. */
export function useDexSelection(
  moduleId: DexModuleId,
): [number | null, (entryId: number | null) => void] {
  const nav = useNav()
  return [nav.selectionFor(moduleId), (entryId) => nav.select(moduleId, entryId)]
}
