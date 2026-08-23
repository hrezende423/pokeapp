import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { NavContext, type NavState } from './navContext'
import { DEFAULT_MODULE_ID, type DexModuleId } from './registry'

export function NavProvider({ children }: { children: ReactNode }) {
  const [moduleId, setModuleId] = useState(DEFAULT_MODULE_ID)
  const [selection, setSelection] = useState<Partial<Record<DexModuleId, number | null>>>({})

  const select = useCallback((id: DexModuleId, entryId: number | null) => {
    setSelection((prev) => ({ ...prev, [id]: entryId }))
  }, [])

  // One update for both halves: the tab switch and the entry it should open land
  // in the same render, so the newly mounted module never shows a stale entry.
  const navigate = useCallback((id: DexModuleId, entryId: number) => {
    setSelection((prev) => ({ ...prev, [id]: entryId }))
    setModuleId(id)
  }, [])

  const value = useMemo<NavState>(
    () => ({
      moduleId,
      setModule: setModuleId,
      selectionFor: (id) => selection[id] ?? null,
      select,
      navigate,
    }),
    [moduleId, selection, select, navigate],
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}
