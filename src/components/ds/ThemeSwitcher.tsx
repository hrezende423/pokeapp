/**
 * Theme switcher -- the segmented Light/Dark pill from the full-95 library
 * (Utility & Misc).
 *
 * THE SPEC, verbatim from ds-component-library-full95.html:
 *
 *   track     inline-flex, background #eee, border-radius 10px, padding 3px
 *   selected  background #fff, padding 6px 12px, border-radius 8px,
 *             font-size 12px, font-weight 700
 *   other     padding 6px 12px, font-size 12px, colour #888
 *
 * Two segments, both always visible and labelled -- deliberately not the
 * single icon-only moon/sun button, which never says which state it is showing
 * (is the moon what you get, or what you are in?).
 *
 * TOKENS, and the one place the spec's flat hexes could not be used directly:
 * #eee -> --hairline (light #e5e5e5), #fff -> --surface-raised (light #ffffff),
 * #888 -> --text-secondary (light #6b6b6b). Light mode lands on the spec almost
 * exactly. In dark the tone relationship flips -- --hairline is #2c2c2e and
 * --surface-raised is #1c1c1e, so the selected segment reads slightly DARKER than
 * its track rather than lighter. That is left as-is rather than papered over with
 * a new token: selection is carried by the bold --text-primary label against a
 * regular --text-secondary one, which is legible in both modes and does not rely
 * on the fill at all. Relying on fill alone would have been the accessibility bug.
 *
 * There is no "System" segment, because the spec has two. Consequence worth
 * knowing: this control cannot hand tracking of the OS setting back once someone
 * has chosen. clearThemeChoice() in theme.ts is the inverse, waiting for a
 * Settings screen.
 *
 * A11Y: two real buttons with aria-pressed inside a named group, matching the
 * existing ds Toggle's convention. aria-pressed rather than radio semantics keeps
 * both segments individually tabbable and needs no arrow-key handling; the
 * trade-off is that a reader announces two toggles rather than one choice of two.
 */

import { useSyncExternalStore } from 'react'
import { effectiveTheme, setTheme, subscribeTheme, themeChoice } from '../../theme'
import type { ThemeChoice } from '../../theme'

const SEGMENTS: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * Reads the theme store rather than holding its own state.
 *
 * useSyncExternalStore is the right hook here and not ceremony: the store is
 * genuinely external -- theme.ts applies the attribute at boot before React
 * exists, and the OS media query can change it with no React involvement. A
 * useState copy would drift the moment either happened.
 */
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribeTheme, effectiveTheme, effectiveTheme)
  const chosen = useSyncExternalStore(subscribeTheme, themeChoice, themeChoice)

  return (
    <div
      className="ds-theme-switcher"
      data-ds="theme-switcher"
      data-theme-value={theme}
      /* Whether this reflects an explicit choice or the OS default, so
         verification can tell first-visit-follows-OS from user-has-chosen. */
      data-theme-source={chosen == null ? 'system' : 'user'}
      role="group"
      aria-label="Theme"
      data-testid="theme-switcher"
    >
      {SEGMENTS.map((seg) => {
        const active = theme === seg.value
        return (
          <button
            key={seg.value}
            type="button"
            className="ds-theme-segment"
            data-testid={`theme-${seg.value}`}
            data-active={active}
            aria-pressed={active}
            onClick={() => setTheme(seg.value)}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
