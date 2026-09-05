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

/** Where a Build Form was opened from: decides its back path and its right rail. */
export type BuildOrigin = { kind: 'team'; teamId: string } | { kind: 'library' }

export type TbScreen =
  | { kind: 'my-teams' }
  | { kind: 'team-viewer'; teamId: string }
  | { kind: 'build-library' }
  | { kind: 'build-form'; buildId: string; origin: BuildOrigin }

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

export function goTo(next: TbScreen) {
  screen = next
  listeners.forEach((fn) => fn())
}

export function resetTbScreen() {
  goTo(INITIAL)
}
