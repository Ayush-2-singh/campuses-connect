/* ConnectToCampus service worker — network-first pages with offline
   fallback, cache-first static assets, auth pages always network. */

const CACHE_NAME = 'connecttocampus-v3'
// Cache version bumped to v7: auth pages (/auth/*) are now NEVER cached and
// navigations are network-first, so users always get the current login UI
// and the newest app bundles after a deploy (no stale-offline code).
const STATIC_CACHE = 'campus-static-v7'
const DYNAMIC_CACHE = 'campus-dynamic-v7'

// Pages to pre-cache for offline access. NOTE: auth pages (/auth/*) are
// NEVER cached (see fetch handler) and personal pages (e.g. /feed,
// /notifications) are intentionally NOT precached — their content is
// user-specific and must not be served from a shared cache to other sessions.
const PRECACHE_URLS = [
  '/',
  '/more',
  '/badges',
  '/companies',
  '/integrations',
  '/leaderboard',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/whatsapp-doodles-light.svg',
  '/whatsapp-doodles-dark.svg',
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

// Fetch: network-only for auth, network-first for API + pages, cache-first assets
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Auth pages and the OAuth callback: network ONLY — never cached, never
  // served from cache. A stale /auth/callback or /auth/login would break
  // sign-in (old bundles, eaten query params) and lock users out.
  if (url.pathname.startsWith('/auth/')) return

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
          // Only cache successful responses — never errors (500/429 etc.).
          if (response.ok) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then(cache => cache.put(req, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Pages: network-first with offline fallback (was stale-while-revalidate —
  // that served outdated HTML/bundles right after each deploy).
  event.respondWith(
    fetch(req).then(response => {
      // Only cache successful, non-redirected pages — never error responses
      // or auth redirects (a cached 500/307 would be served stale later).
      if (response.ok && !response.redirected && req.mode === 'navigate') {
        const clone = response.clone()
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone))
      }
      return response
    }).catch(() =>
      caches.match(req).then(cached => cached || (
        req.mode === 'navigate'
          ? (caches.match('/') || new Response(offlineHTML(), { headers: { 'Content-Type': 'text/html' } }))
          : (cached || Response.error())
      ))
    )
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
  event.waitUntil(self.registration.showNotification(data.title || 'ConnectToCampus', options))
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
<title>ConnectToCampus — Offline</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0F1115;color:#fff;text-align:center;padding:20px}
.box{max-width:400px}.emoji{font-size:64px;margin-bottom:16px}h1{font-size:24px;margin:0 0 8px}p{color:#888;font-size:14px;line-height:1.6}
a{color:#F59E0B;text-decoration:none;font-weight:600}</style></head>
<body><div class="box"><div class="emoji">📡</div><h1>You're offline</h1>
<p>ConnectToCampus needs internet for most features.<br>Check your connection and try again.</p>
<p style="margin-top:20px"><a href="/">Retry</a></p></div></body></html>`
}
