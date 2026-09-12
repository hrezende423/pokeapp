/**
 * Where the reader has been, so one press can undo one step.
 *
 * STILL NOT A ROUTER, and deliberately: nothing here writes a URL, so there are
 * no deep links, no path parsing and no `?ds=1` / `?layout=1` to preserve
 * through a navigation. What it uses the History API for is the browser's STACK
 * -- one entry per screen, carrying nothing but a depth number -- which is what
 * makes the Android back gesture and the browser's own back button drive the
 * same steps as the control in the app bar. That was the whole reason to involve
 * the platform at all: this app is reviewed on a phone, where the gesture is how
 * people go back, and an in-app-only button would leave that gesture exiting the
 * app mid-task.
 *
 * ONE PATH FOR EVERY BACK. The app-bar control does not apply a location itself
 * -- it calls `history.back()` and lets the `popstate` handler do the work, the
 * same handler the gesture reaches. So the guard, the depth bookkeeping and the
 * application of a location exist once. A second implementation for the button
 * is exactly how the two would drift.
 *
 * A LOCATION IS A PAGE PLUS THE ENTRY OPEN IN IT, which is precisely what the
 * nav context owns. Module-internal screens are NOT steps: Team Building's four
 * screens live in `tbNav` and the species page's tabs in local state, so leaving
 * Team Building goes back to whatever preceded Team Building rather than walking
 * out through My Teams. Those screens have their own back controls, which is why
 * this was left alone rather than plumbed through -- and adding them later is
 * pushing a location from `goTo`, not a change of shape here.
 *
 * KNOWN AND DELIBERATE: the species page's own "All species" control is a
 * destination ("show me the grid"), not an undo, so it pushes a step like any
 * other navigation. Grid -> detail -> All species leaves three entries, and a
 * back press from there re-opens the detail. That is what a browser does with
 * links and it keeps the two controls independent -- "All species" has to reach
 * the grid even when the reader arrived at the species from the global search in
 * another module, which an undo cannot promise.
 */

import { useSyncExternalStore } from 'react'
import type { PageId } from './navConfig'
import { runNavGuard } from './navGuard'

export interface NavLocation {
  page: PageId
  /** The open entry in that page, or null when the page is showing its list. */
  entry: number | null
}

/** What we put on each browser history entry. Nothing else is stored there. */
interface DepthState {
  pokeappDepth: number
}

let stack: NavLocation[] = []
let depth = 0
let applyLocation: ((location: NavLocation) => void) | null = null

/*
  REENTRANCY. Applying a location calls the nav context's own setters, and those
  setters are what push history -- so without this flag, restoring a location
  would push it as a new step and back would never get anywhere.
*/
let applying = false

/*
  Set by a blocker's `proceed`, consumed by the next popstate. The reader has
  already been asked and has already answered; asking again on the way through
  would be the same question twice for one press.
*/
let bypassGuard = false

const listeners = new Set<() => void>()

function announce() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function sameLocation(a: NavLocation, b: NavLocation) {
  return a.page === b.page && a.entry === b.entry
}

function readDepth(state: unknown): number {
  if (state && typeof state === 'object' && 'pokeappDepth' in state) {
    const value = (state as DepthState).pokeappDepth
    if (typeof value === 'number') return value
  }
  // No state of ours on the entry: this is the document the app was opened on.
  return 0
}

/**
 * How many steps back there are. 0 means this is where the reader came in.
 *
 * The app-bar control reads this to decide whether it exists at all. It is not
 * disabled at zero, it is absent -- the same call the back-to-top control makes
 * in ScrollArea, and for the same reason: a dead button is worse than none.
 */
export function useNavDepth(): number {
  return useSyncExternalStore(
    subscribe,
    () => depth,
    () => 0,
  )
}

/**
 * Hand the history the root location and the means to apply one.
 *
 * `apply` is the nav context's own state setters. Passing them in rather than
 * importing them keeps the dependency one-way -- the provider knows about the
 * history, the history knows nothing about React state.
 */
export function initNavHistory(
  root: NavLocation,
  apply: (location: NavLocation) => void,
): () => void {
  applyLocation = apply
  stack = [root]
  depth = 0

  if (typeof window === 'undefined') return () => undefined

  window.history.replaceState({ pokeappDepth: 0 } satisfies DepthState, '')

  const onPopState = (event: PopStateEvent) => {
    const target = readDepth(event.state)
    if (target === depth) return

    /*
      A location we have never held. Two ways to get here: the reader pressed
      forward past where we have been (we truncate the tail on a new push, and
      the browser keeps its entries), or something else on the page pushed
      state. Either way there is nothing honest to show, so the depth is
      re-synced and nothing moves.
    */
    const next = stack[target]
    if (!next) {
      window.history.replaceState({ pokeappDepth: depth } satisfies DepthState, '')
      return
    }

    const move = () => {
      applying = true
      depth = target
      applyLocation?.(next)
      applying = false
      announce()
    }

    if (bypassGuard) {
      bypassGuard = false
      move()
      return
    }

    /*
      TWO WAYS A GUARD CAN SAY YES, and they need opposite handling.

      With nothing to ask, `proceed` runs inside `runNavGuard` and the location
      can be applied on the spot. With something to ask, it runs frames later,
      from a dialog -- and by then the BROWSER HAS ALREADY MOVED, because
      popstate is fired after the fact and cannot be prevented. So the two
      cases cannot share a resumption: applying directly in the late case would
      leave our depth and the browser's disagreeing.

      `asking` is what tells them apart. The late case re-enters this handler
      through the platform instead, with the question already answered, so the
      one path that applies a location stays the one path.
    */
    let asking = true
    let allowNow = false

    runNavGuard(() => {
      if (asking) {
        allowNow = true
        return
      }
      bypassGuard = true
      window.history.back()
    })
    asking = false

    if (allowNow) {
      move()
      return
    }

    /*
      A blocker took it. The reader is still on the page they were on, so the
      browser is put back level with us -- one entry forward again, carrying the
      depth we never left. If they dismiss the question and stay, the next back
      press is then measured from the right place and asks again; if they
      answer it, the `history.back()` above pops this entry and lands on the one
      the original press had reached.
    */
    window.history.pushState({ pokeappDepth: depth } satisfies DepthState, '')
  }

  window.addEventListener('popstate', onPopState)
  return () => {
    window.removeEventListener('popstate', onPopState)
    applyLocation = null
  }
}

/**
 * Record a step forward.
 *
 * Called by the nav context AFTER it has changed its own state, so this only
 * ever describes something that has already happened -- which is what makes the
 * `applying` guard sufficient rather than needing a queue.
 *
 * A location identical to the one we are on is NOT a step. Picking the nav entry
 * you are already on is a real request and the module nonce carries it, but it
 * does not move the page: pushing it would put an entry in the stack whose back
 * press does nothing visible, which reads as a broken button.
 */
export function pushNavLocation(location: NavLocation) {
  if (applying) return
  if (typeof window === 'undefined') return
  const current = stack[depth]
  if (current && sameLocation(current, location)) return

  // The tail goes, exactly as a browser drops the forward history when you
  // navigate from part-way back through it.
  stack = stack.slice(0, depth + 1)
  stack.push(location)
  depth = stack.length - 1
  window.history.pushState({ pokeappDepth: depth } satisfies DepthState, '')
  announce()
}

/**
 * Go back one step, through the platform.
 *
 * `history.back()` rather than applying the location here: the gesture and the
 * browser button already arrive as `popstate`, and that handler holds the guard
 * and the bookkeeping. Routing the button through it too is what keeps a single
 * definition of what going back means.
 */
export function goBack() {
  if (typeof window === 'undefined') return
  if (depth <= 0) return
  window.history.back()
}

/** Reset. Exported for tests; nothing in the app calls it. */
export function resetNavHistory(root: NavLocation) {
  stack = [root]
  depth = 0
  bypassGuard = false
  announce()
}
