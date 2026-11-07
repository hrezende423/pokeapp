// Imported by the generated service worker (vite.config.ts, workbox.importScripts).
//
// The generated worker calls skipWaiting() when its script first runs, which is
// meant to make every deploy take over at once. It does not always: a worker
// that finished installing and was then stopped (a browser restart, an idle
// tab) comes back WAITING, and nothing runs that call again -- so the open app
// stayed on the old build until every tab was closed. The preview reviewed a
// build two deploys old for exactly this reason (2026-10-12).
//
// This lets the page promote a waiting worker itself (src/pwa.ts).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
