/* CampusConnect service worker — minimal & safe.
   Network-first: always try the network (no stale caches), fall back to cache
   when offline. This keeps updates instant while enabling the install prompt. */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('/feed'))
    )
  )
})
