/* CampusConnect enhanced service worker — offline-first for static pages,
   network-first for dynamic content. Caches key pages for offline access. */

const CACHE_NAME = 'campus-connect-v2'
const STATIC_CACHE = 'campus-static-v2'
const DYNAMIC_CACHE = 'campus-dynamic-v2'

// Pages to pre-cache for offline access
const PRECACHE_URLS = [
  '/',
  '/feed',
  '/more',
  '/badges',
  '/companies',
  '/integrations',
  '/leaderboard',
  '/notifications',
  '/manifest.webmanifest',
  '/favicon.ico',
]

// Install: pre-cache essential pages
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Fetch: stale-while-revalidate for pages, network-first for API
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // API calls: network-first, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      }))
    )
    return
  }

  // Static assets: cache-first
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' ||
      url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached
        return fetch(req).then(response => {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then(cache => cache.put(req, clone))
          return response
        })
      })
    )
    return
  }

  // Pages: stale-while-revalidate (show cached, update in background)
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(response => {
        const clone = response.clone()
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone))
        return response
      }).catch(() => {
        // If both cache and network fail, show offline page for navigation
        if (req.mode === 'navigate') {
          return caches.match('/') || new Response(offlineHTML(), {
            headers: { 'Content-Type': 'text/html' }
          })
        }
        return cached
      })
      return cached || fetchPromise
    })
  )
})

// Push notification handler
self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  const options = {
    body: data.body || 'New notification',
    icon: '/icon-192.png',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/notifications' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }
  event.waitUntil(self.registration.showNotification(data.title || 'CampusConnect', options))
})

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return
  const url = event.notification.data?.url || '/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})

function offlineHTML() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CampusConnect — Offline</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0F1115;color:#fff;text-align:center;padding:20px}
.box{max-width:400px}.emoji{font-size:64px;margin-bottom:16px}h1{font-size:24px;margin:0 0 8px}p{color:#888;font-size:14px;line-height:1.6}
a{color:#F59E0B;text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><div class="emoji">📡</div><h1>You're offline</h1>
<p>CampusConnect needs internet for most features.<br>Check your connection and try again.</p>
<p style="margin-top:20px"><a href="/">Retry</a></p></div></body></html>`
}
