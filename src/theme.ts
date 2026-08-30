/**
 * Theme resolution: an explicit user choice if there is one, the OS otherwise.
 *
 * WHAT THIS REPLACED. Until now this file only mirrored `prefers-color-scheme`
 * onto `data-theme`, with a note saying a user-facing override "belongs to the
 * Settings domain, which does not exist yet". There was no in-app control and
 * nothing persisted. Both are now here.
 *
 * THE CONTRACT design-tokens.css declares is `data-theme="light" | "dark"` on
 * :root -- its light values live on `:root, [data-theme="light"]` and its dark
 * values on `[data-theme="dark"]`, so the attribute is not optional: without it a
 * dark-preferring OS gets the light palette.
 *
 * PRECEDENCE, and why it is this way round:
 *
 *   stored choice  ->  wins, forever, across reloads and sessions
 *   no stored      ->  follow the OS, and keep following it if it changes
 *
 * Once someone has said "I want dark", a later OS switch to light must not
 * silently undo them -- so the media-query listener only applies when nothing is
 * stored. That is the whole reason `choice` and `effective` are separate: the
 * control needs to show what is displayed, while the listener needs to know
 * whether it is still allowed to speak.
 *
 * PERSISTENCE IS THE POINT, not a nice-to-have. The version-group selector
 * shipped without it, did not survive a reload, and had to be logged as a bug.
 * verify-app.mjs now reloads the page for real and asserts the choice came back,
 * rather than asserting that setTheme wrote to localStorage.
 *
 * Every localStorage access is wrapped: it throws outright in Safari private mode
 * and can be disabled by policy, and a theme preference is not worth a blank app.
 * A storage failure degrades to "follow the OS", which is the pre-existing
 * behaviour.
 */

export type ThemeChoice = 'light' | 'dark'

/** Namespaced, because it is the first key this app has ever stored. */
export const THEME_STORAGE_KEY = 'pokeapp:theme'

const query = window.matchMedia?.('(prefers-color-scheme: dark)')

function readStored(): ThemeChoice | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'light' || raw === 'dark' ? raw : null
  } catch {
    return null
  }
}

function writeStored(choice: ThemeChoice): boolean {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
    return true
  } catch {
    return false
  }
}

/** What the OS is asking for, independent of what the user chose. */
export function systemTheme(): ThemeChoice {
  return query?.matches ? 'dark' : 'light'
}

let choice: ThemeChoice | null = readStored()

/** The explicit user choice, or null while still following the OS. */
export function themeChoice(): ThemeChoice | null {
  return choice
}

/** The theme actually on screen. */
export function effectiveTheme(): ThemeChoice {
  return choice ?? systemTheme()
}

const listeners = new Set<() => void>()

function apply() {
  document.documentElement.dataset.theme = effectiveTheme()
  for (const fn of listeners) fn()
}

/**
 * Record an explicit choice. Applies even if storage failed, so the control still
 * works for the session in a browser that refuses to persist.
 */
export function setTheme(next: ThemeChoice): void {
  choice = next
  writeStored(next)
  apply()
}

/**
 * Forget the choice and go back to following the OS.
 *
 * Not reachable from the segmented control, which per the component spec has two
 * segments and no "System" option. Kept because it is the honest inverse of
 * setTheme and because a Settings screen will want it.
 */
export function clearThemeChoice(): void {
  choice = null
  try {
    localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    /* nothing stored to remove */
  }
  apply()
}

/** Subscribe to theme changes. Returns an unsubscribe. */
export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

apply()

// Only while no explicit choice is in force -- see the precedence note above.
query?.addEventListener('change', () => {
  if (choice == null) apply()
})
