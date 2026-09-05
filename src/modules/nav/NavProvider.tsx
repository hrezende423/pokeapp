import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { NavContext, type NavState } from './navContext'
import type { PageId } from './navConfig'
import { DEFAULT_MODULE_ID, type DexModuleId } from './registry'

export function NavProvider({ children }: { children: ReactNode }) {
  const [moduleId, setModuleId] = useState<PageId>(DEFAULT_MODULE_ID)
  const [selection, setSelection] = useState<Partial<Record<DexModuleId, number | null>>>({})
  const [moduleNonce, setModuleNonce] = useState(0)

  /*
    EVERY setModule BUMPS THE NONCE, including one that sets the id it already
    holds. Picking the nav entry you are already on is a real request -- "take me
    back to that screen's root" -- and a bare useState setter swallows it, because
    the value did not change. That is invisible for a dex, which has one screen,
    and broken for a module with its own sub-screens: from inside a team, clicking
    "My Teams" did nothing at all. Modules that care depend on the nonce.
  */
  const setModule = useCallback((id: PageId) => {
    setModuleId(id)
    setModuleNonce((n) => n + 1)
  }, [])

  const select = useCallback((id: DexModuleId, entryId: number | null) => {
    setSelection((prev) => ({ ...prev, [id]: entryId }))
  }, [])

  // One update for both halves: the tab switch and the entry it should open land
  // in the same render, so the newly mounted module never shows a stale entry.
  const navigate = useCallback((id: DexModuleId, entryId: number) => {
    setSelection((prev) => ({ ...prev, [id]: entryId }))
    setModuleId(id)
    setModuleNonce((n) => n + 1)
  }, [])

  const value = useMemo<NavState>(
    () => ({
      moduleId,
      moduleNonce,
      setModule,
      selectionFor: (id) => selection[id] ?? null,
      select,
      navigate,
    }),
    [moduleId, moduleNonce, selection, setModule, select, navigate],
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}
