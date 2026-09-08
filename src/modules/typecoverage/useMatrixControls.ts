import { useCallback, useState } from 'react'

/**
 * The Matrix view's three toggles and its type filter, as state the SHELL owns.
 *
 * WHY IT LEFT THE VIEW. The controls are rendered in the page's right-hand rail,
 * which is a sibling of the content column rather than part of it -- the rail
 * sits in the same place on every tab, so a control that only exists on Matrix
 * still has to be positioned by the shell. Holding this state inside
 * TypeMatrixView would mean either two rails that could drift apart or a portal
 * out of the view, and lifting it is cheaper than both.
 *
 * The same split the species detail page makes: the PAGE owns the scope, not the
 * tab that shows it. A side effect worth having is that leaving Matrix and coming
 * back does not throw the orientation away.
 */

export type MatrixLayout = 'custom' | 'standard'
export type MatrixDepth = 'full' | 'single'
export type MatrixExistence = 'existing' | 'all'

export interface MatrixControls {
  layout: MatrixLayout
  depth: MatrixDepth
  existence: MatrixExistence
  /** Defending type ids the reader picked. Empty means unfiltered. */
  picked: number[]
  /** Standard forces single types -- an attack brings one type. */
  effectiveDepth: MatrixDepth
  /** See the note below on why Standard does NOT force `existing`. */
  effectiveExistence: MatrixExistence
  /** True while the Custom-only controls should be on screen at all. */
  customControls: boolean
  setLayout: (next: MatrixLayout) => void
  setDepth: (next: MatrixDepth) => void
  setExistence: (next: MatrixExistence) => void
  togglePicked: (id: number) => void
  clearPicked: () => void
}

export function useMatrixControls(): MatrixControls {
  const [layout, setLayoutState] = useState<MatrixLayout>('custom')
  const [depth, setDepth] = useState<MatrixDepth>('full')
  const [existence, setExistence] = useState<MatrixExistence>('existing')
  const [picked, setPicked] = useState<number[]>([])

  /*
    SWITCHING ORIENTATION RESETS THE CUSTOM-ONLY CONTROLS, by explicit request:
    coming back from Standard lands on Full / Existing rather than resuming
    whatever was set before, so the reader is never looking at a matrix shaped by
    a control they cannot see and did not just touch.

    THE TYPE FILTER RESETS WITH THEM. It is hidden under Standard for exactly the
    same reason B and C are, so leaving it applied on the way back would be the
    same surprise the reset exists to prevent -- a matrix silently missing most
    of its rows because of a choice made before a round trip.
  */
  const setLayout = useCallback((next: MatrixLayout) => {
    setLayoutState(next)
    setDepth('full')
    setExistence('existing')
    setPicked([])
  }, [])

  const togglePicked = useCallback((id: number) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }, [])

  const clearPicked = useCallback(() => setPicked([]), [])

  return {
    layout,
    depth,
    existence,
    picked,
    effectiveDepth: layout === 'standard' ? 'single' : depth,
    /*
      AND STANDARD DOES NOT PRUNE ITS AXES BY WHAT EXISTS. This is the one place
      the brief contradicted itself and the resolution is written down rather
      than left in the code: Standard is specified as "the traditional layout",
      and it is also specified to force Existing -- but those cannot both hold,
      because the printed chart is a chart of the TYPE SYSTEM, not of extant
      species.

      Measured, not assumed: no species in Gen 1-4 scope is pure Flying, and in
      Gen 1 nothing is pure Rock, pure Ghost or pure Ice either. Pruning by
      existence turns the Gen 1 chart into 11 defending columns against 15
      attacking rows, and an 11x15 "traditional type chart" is simply wrong.

      So Existing keeps the meaning the brief gives it exactly where it is a
      CONTROL, which is Custom. In Standard, where it is not a control at all,
      the axes stay the full type system.
    */
    effectiveExistence: layout === 'standard' ? 'all' : existence,
    customControls: layout === 'custom',
    setLayout,
    setDepth,
    setExistence,
    togglePicked,
    clearPicked,
  }
}
