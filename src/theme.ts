/**
 * Sets data-theme on <html>, which is the contract design-tokens.css declares:
 * its light values live on `:root, [data-theme="light"]` and its dark values on
 * `[data-theme="dark"]`, so without the attribute a dark-preferring OS would get
 * the light palette.
 *
 * Follows the OS preference, which is what the app did before the design system
 * arrived (index.css keys off prefers-color-scheme). A user-facing override
 * belongs to the Settings domain, which does not exist yet -- so this only
 * mirrors the system, and stays in sync if it changes mid-session.
 */

const query = window.matchMedia?.('(prefers-color-scheme: dark)')

function apply(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

apply(query?.matches ?? false)
query?.addEventListener('change', (e) => apply(e.matches))
