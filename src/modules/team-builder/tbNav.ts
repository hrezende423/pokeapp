/**
 * Which screen the module is showing, held OUTSIDE React.
 *
 * WHY NOT `useState` IN THE SHELL, which is where this obviously belongs: two of
 * the four nav ids are verbs (`new-team`, `new-build`). Handling one means
 * reacting to a nav change by creating a team or a build and then landing on the
 * screen that shows it -- and doing that with local state is a synchronous
 * `setState` inside an effect, which this project's lint rules reject and React
 * documents as a cascading-render smell.
 *
 * Making the screen an external store resolves it honestly rather than by
 * silencing the rule: the effect now only pushes to an external system, which is
 * exactly what effects are for, and every screen transition -- click handlers
 * included -- goes through one path instead of two.
 *
 * DELIBERATELY NOT PERSISTED. This is where you are, not what you have. It resets
 * on reload, and `resetTbScreen` exists so tests can start from a known place.
 */

import { useSyncExternalStore } from 'react'
import type { Build } from './model'

/** Where a Build Form was opened from: decides its back path and its right rail. */
export type BuildOrigin = { kind: 'team'; teamId: string } | { kind: 'library' }

export type TbScreen =
  | { kind: 'my-teams' }
  | { kind: 'team-viewer'; teamId: string }
  /*
    `pickFor` turns the library into a PICKER for one team slot. Choosing "Pick
    an existing build" used to send the reader here with no memory of why, so
    clicking a card opened the Build Form and the team they were assembling was
    simply left behind. Carrying the slot means the card click can put the build
    where it was going and hand the reader back to the team.
  */
  | { kind: 'build-library'; pickFor?: { teamId: string; slot: number } }
  /*
    THE FORM'S TARGET IS NOT ALWAYS A RECORD.

    `buildId: null` means "a member that does not exist yet" -- nothing has
    been written and nothing will be until the reader does something that
    counts as saving. This replaced creating the build up front and flagging it
    `draft`, which had three separate failure modes: the record existed in
    storage before a single field was filled, an exit that did not resolve it
    left an orphan, and the id it consumed pushed every later number along.

    `slot` is the rail slot the form occupies. It has to be carried rather than
    derived, because a member that is not in the store cannot be found in a
    team's slot array -- and the rail still has to show it in its place while
    it is being built.

    `seed` opens a new member with values that came from somewhere else: the
    "move my changes to the new member" answer, which puts the edit in the next
    slot and leaves the member it came from as it was.
  */
  | {
      kind: 'build-form'
      buildId: string | null
      origin: BuildOrigin
      slot?: number | null
      seed?: Omit<Build, 'id'> | null
    }

const INITIAL: TbScreen = { kind: 'my-teams' }

let screen: TbScreen = INITIAL
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useTbScreen(): TbScreen {
  return useSyncExternalStore(
    subscribe,
    () => screen,
    () => INITIAL,
  )
}

/**
 * The current screen, outside React.
 *
 * For effects that must read the screen as it is NOW rather than as it was when
 * their render closed over it. The module shell's prune needs exactly that: on
 * re-entry the nav effect has just redirected the screen, and the stale value
 * would still name the Build Form the reader has already left.
 */
export function readTbScreen(): TbScreen {
  return screen
}

export function goTo(next: TbScreen) {
  screen = next
  listeners.forEach((fn) => fn())
}

export function resetTbScreen() {
  goTo(INITIAL)
}
