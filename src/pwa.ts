import { registerSW } from 'virtual:pwa-register'

// Shell-only service worker for now: it precaches the built assets so the app
// is installable and works offline. Data caching arrives with the data layer.
export const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.info(`[pwa] service worker registered: ${swUrl}`)
    if (registration) keepCurrent(registration)
  },
  onRegisterError(error) {
    console.error('[pwa] service worker registration failed', error)
  },
})

/**
 * Keep the open app on the deployed build (2026-10-12). Two gaps closed:
 * - A worker found WAITING is told to take over (public/sw-skip-waiting.js);
 *   its own skipWaiting() does not survive the worker being stopped first.
 * - The browser only looks for a new worker on a navigation, and this app never
 *   navigates -- a tab or an installed PWA left open never saw a deploy. It now
 *   looks whenever the app comes back to the foreground, and hourly.
 * The take-over reloads the page through registerSW's autoUpdate, as before.
 */
function keepCurrent(registration: ServiceWorkerRegistration) {
  const promote = () => registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
  promote()
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') promote()
    })
  })
  const check = () => {
    if (navigator.onLine) registration.update().catch(() => {})
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  setInterval(check, 60 * 60 * 1000)
}
