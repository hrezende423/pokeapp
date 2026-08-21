import { registerSW } from 'virtual:pwa-register'

// Shell-only service worker for now: it precaches the built assets so the app
// is installable and works offline. Data caching arrives with the data layer.
export const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl) {
    console.info(`[pwa] service worker registered: ${swUrl}`)
  },
  onRegisterError(error) {
    console.error('[pwa] service worker registration failed', error)
  },
})
