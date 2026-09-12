import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavContext, type NavState } from './navContext'
import { isDexId, type PageId } from './navConfig'
import { runNavGuard } from './navGuard'
import { goBack, initNavHistory, pushNavLocation, useNavDepth } from './navHistory'
import { DEFAULT_MODULE_ID, type DexModuleId } from './registry'

export function NavProvider({ children }: { children: ReactNode }) {
  const [moduleId, setModuleId] = useState<PageId>(DEFAULT_MODULE_ID)
  const [selection, setSelection] = useState<Partial<Record<DexModuleId, number | null>>>({})
  const [moduleNonce, setModuleNonce] = useState(0)
  const depth = useNavDepth()

  /*
    The open page, readable by a callback that did not close over this render.
    `pushNavLocation` needs "which page is this selection happening in", and the
    handlers below are memoised on purpose -- reading `moduleId` from the closure
    would give them whichever value was current when they were built.
  */
  const openPage = useRef<PageId>(moduleId)
  useEffect(() => {
    openPage.current = moduleId
  })

  /*
    ------------------------------------------------------------- the history

    Applying a location is the ONE thing the history cannot do for itself, so it
    is handed these two setters and nothing else. Both halves land in the same
    update for the same reason `navigate` does it: a page switch that arrives one
    render before its entry shows the newly mounted module its predecessor's
    selection first.

    The nonce is bumped here too. Going back INTO a module has to reach it the
    same way picking its nav entry does, or a module with its own sub-screens
    comes back showing whichever of them it was left on -- which is not the
    screen the step being undone was taken from.
  */
  const applyLocation = useCallback(({ page, entry }: { page: PageId; entry: number | null }) => {
    if (isDexId(page)) setSelection((prev) => ({ ...prev, [page]: entry }))
    setModuleId(page)
    setModuleNonce((n) => n + 1)
  }, [])

  useEffect(
    () => initNavHistory({ page: DEFAULT_MODULE_ID, entry: null }, applyLocation),
    [applyLocation],
  )

  /*
    EVERY setModule BUMPS THE NONCE, including one that sets the id it already
    holds. Picking the nav entry you are already on is a real request -- "take me
    back to that screen's root" -- and a bare useState setter swallows it, because
    the value did not change. That is invisible for a dex, which has one screen,
    and broken for a module with its own sub-screens: from inside a team, clicking
    "My Teams" did nothing at all. Modules that care depend on the nonce.

    AND EVERY ONE ASKS THE GUARD FIRST. This is the single door the app bar, the
    global search and the back control all go through, which is what makes one
    guard cover all of them -- see navGuard.ts. The state change is the guard's
    continuation rather than code that runs after it, because the answer can
    arrive several frames later from a dialog.
  */
  const setModule = useCallback((id: PageId) => {
    runNavGuard(() => {
      setModuleId(id)
      setModuleNonce((n) => n + 1)
      pushNavLocation({ page: id, entry: null })
    })
  }, [])

  const select = useCallback((id: DexModuleId, entryId: number | null) => {
    setSelection((prev) => ({ ...prev, [id]: entryId }))
    /*
      NO GUARD, and no need for one: this opens or closes an entry INSIDE the
      module already on screen, and the only screen with unsaved work is not a
      dex. The step is still recorded -- opening a species is exactly the
      transition the back control exists to undo.

      Guarded on the page being the open one. Nothing calls this for a module
      that is not mounted (cross-module opening is `navigate`), but a location
      naming a page the reader is not on would send back somewhere they had
      never been, so it is checked rather than assumed.
    */
    if (id === openPage.current) pushNavLocation({ page: id, entry: entryId })
  }, [])

  // One update for both halves: the tab switch and the entry it should open land
  // in the same render, so the newly mounted module never shows a stale entry.
  const navigate = useCallback((id: DexModuleId, entryId: number) => {
    runNavGuard(() => {
      setSelection((prev) => ({ ...prev, [id]: entryId }))
      setModuleId(id)
      setModuleNonce((n) => n + 1)
      pushNavLocation({ page: id, entry: entryId })
    })
  }, [])

  const value = useMemo<NavState>(
    () => ({
      moduleId,
      moduleNonce,
      setModule,
      selectionFor: (id) => selection[id] ?? null,
      select,
      navigate,
      canGoBack: depth > 0,
      back: goBack,
    }),
    [moduleId, moduleNonce, selection, setModule, select, navigate, depth],
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}
