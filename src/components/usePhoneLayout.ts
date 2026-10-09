import { useSyncExternalStore } from 'react'

/**
 * THE PHONE BREAKPOINT, in one place.
 *
 * `src/mobile.css` holds every phone-only rule under the same query, written out
 * as a literal because CSS has no custom media queries yet. If this number moves,
 * that file's `@media` lines move with it -- `npm run verify:mobile` drives the app
 * at 390px and would catch the two disagreeing.
 *
 * 640px covers every phone held upright (320-430px wide) and nothing that is a
 * tablet in portrait (768px and up), so a desktop window narrowed by hand only
 * meets this layout once it is genuinely phone-sized.
 */
export const PHONE_QUERY = '(max-width: 640px)'

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

const read = () => window.matchMedia(PHONE_QUERY).matches

/**
 * True while the window is phone-sized.
 *
 * For the few places where the phone layout needs a DIFFERENT ELEMENT rather than
 * different CSS -- the menu button. Everything else is `mobile.css`, so the
 * desktop DOM stays exactly what the suites assert and only the phone grows a
 * control.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, read, () => false)
}
