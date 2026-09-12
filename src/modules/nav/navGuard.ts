/**
 * The question every nav transition has to ask before it happens.
 *
 * THIS IS THE CROSS-MODULE NAVIGATION GUARD the deferred-debt note in CLAUDE.md
 * describes, and it lives here rather than in the module that needed it first
 * for the reason that note gives: a Team-Building-local version would only cover
 * the doors Team Building knows about. Every way the open page changes goes
 * through NavProvider -- the app bar, the global search's cross-module jump, and
 * now the back control -- so a guard consulted there covers all of them at once,
 * and covers whatever the fourth door turns out to be.
 *
 * IT DOES NOT OWN A QUESTION OR A DIALOG. A screen with unsaved work already
 * knows what to ask and has the only copy of the answer's consequences -- the
 * Build Form's three-way prompt names the teams a save would reach. So the
 * blocker is a callback the screen supplies, and this file's whole job is to run
 * it before the transition and to hand it the transition to resume.
 *
 * WHY NOT A CONFIRM RETURN VALUE. `() => boolean` was the obvious shape and it
 * cannot work here: the answer arrives from a dialog, several frames after the
 * question, so there is nothing to return. Handing the blocker the continuation
 * is what lets the transition survive that gap -- and lets a reader who dismisses
 * the question simply stay, by never calling it.
 */

/**
 * Registered by a screen that has something to lose.
 *
 * Called with the navigation it is standing in front of, and returns which of
 * the two things it did:
 *
 *   'go'       nothing to ask. The transition proceeds immediately, and
 *              `proceed` must NOT have been called.
 *   'handled'  the blocker has taken the transition on. It calls `proceed()`
 *              once the reader has answered -- or never, if they answered by
 *              dismissing the question, which is how "stay here" is expressed.
 */
export type NavBlocker = (proceed: () => void) => 'go' | 'handled'

/*
  A SET, THOUGH IN PRACTICE ONE SCREEN IS MOUNTED AT A TIME. A single slot would
  be smaller and has a failure mode a set does not: an unmount cleanup running
  after the next screen has already registered would clear the NEW screen's
  blocker, and the symptom is an unasked question rather than an error. Deleting
  your own entry cannot do that.
*/
const blockers = new Set<NavBlocker>()

/** Register a blocker. Call the returned function to remove it. */
export function registerNavBlocker(blocker: NavBlocker): () => void {
  blockers.add(blocker)
  return () => {
    blockers.delete(blocker)
  }
}

/**
 * Ask every blocker, then navigate.
 *
 * Chained rather than collected: each blocker's `proceed` continues from the
 * NEXT one, so two screens with unsaved work would ask in turn instead of
 * stacking two dialogs on top of each other.
 *
 * The `settled` flag is not defensive noise -- it is what stops a blocker that
 * both calls `proceed()` and returns 'go' from running the rest of the chain
 * twice, and a double-run here is a double navigation.
 */
export function runNavGuard(proceed: () => void) {
  const queue = Array.from(blockers)

  const step = (i: number) => {
    if (i >= queue.length) {
      proceed()
      return
    }
    let settled = false
    const next = () => {
      if (settled) return
      settled = true
      step(i + 1)
    }
    if (queue[i](next) === 'go') next()
  }

  step(0)
}

/** Drop every blocker. Exported for tests; nothing in the app calls it. */
export function clearNavBlockers() {
  blockers.clear()
}
