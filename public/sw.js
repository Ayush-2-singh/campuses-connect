/* ConnectToCampus service worker — network-first pages with offline
   fallback, cache-first static assets, auth pages always network. */

// Cache version bumped to v9: v8 clients were stuck on a pre-Games bundle, so
// a nav/footer change shipped but never appeared on phones that already had
// the PWA installed. Bumping flushes v8's cached bundles on activate.
const STATIC_CACHE = 'campus-static-v9'
const DYNAMIC_CACHE = 'campus-dynamic-v9'

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

// Install: pre-cache essential pages.
// NOTE: allSettled, NOT addAll. addAll rejects the WHOLE install if a single
// URL 404s or errors — and a failed install means the PREVIOUS service worker
// stays in control, still serving its old cached bundles, so a shipped nav
// change never reaches the client. A missed precache entry is far better than
// a permanently stale app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
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

  // Static assets: cache-first, but revalidated in the background.
  //
  // Plain cache-first never refreshes: a student who changed their avatar, or
  // an icon we re-shipped under the same URL, kept the old bytes until they
  // cleared site data. So the cached copy answers immediately and the network
  // quietly replaces it for next time (stale-while-revalidate). No waitUntil:
  // a fire-and-forget update cannot throw InvalidStateError on a settled event.
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'image' ||
      url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const refresh = fetch(req).then(response => {
          // Only cache successful responses — never errors (500/429 etc.).
          if (response.ok) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then(cache => cache.put(req, clone))
          }
          return response
        })

        if (cached) {
          refresh.catch(() => undefined) // background refresh, best effort
          return cached
        }
        return refresh.catch(() => Response.error())
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
      caches.match(req).then(cached => {
        if (cached) return cached
        if (req.mode !== 'navigate') return Response.error()
        // OFFLINE NAVIGATION. This used to be `caches.match('/') || new
        // Response(offlineHTML())` — caches.match() returns a Promise, which is
        // always truthy, so the || never took the offline page and a visitor
        // without a cached '/' got `undefined` (a dead response) instead of the
        // branded offline screen. Await it, then fall back for real.
        return caches.match('/').then(root =>
          root || new Response(offlineHTML(), { headers: { 'Content-Type': 'text/html' } })
        )
      })
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
