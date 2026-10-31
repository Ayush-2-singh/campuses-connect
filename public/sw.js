/* ConnectToCampus service worker — network-first pages with offline
   fallback, cache-first static assets, auth pages always network. */

// Cache version bumped to v10: v9 precached routes that no longer exist
// (/jobs, /more, /integrations) and never cached the Next.js chunks those
// pages load, so an offline reload showed an unstyled shell. Bumping drops the
// stale caches on activate.
const STATIC_CACHE = 'campus-static-v10'
const DYNAMIC_CACHE = 'campus-dynamic-v10'
const RSC_CACHE = 'campus-rsc-v10'
const KEEP_CACHES = [STATIC_CACHE, DYNAMIC_CACHE, RSC_CACHE]

// Public pages to pre-cache for offline access. NOTE: auth pages (/auth/*) are
// NEVER cached (see fetch handler) and personal pages (/messages,
// /notifications, /profile, /admin…) are intentionally NOT precached — their
// content is user-specific and must not be served from a shared cache to
// another session. They are still cached per-visit at runtime.
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/experiences',
  '/companies',
  '/leaderboard',
  '/compete',
  '/premium',
  '/blog',
  '/about',
]

// Shell files that are not discovered from page HTML.
const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/whatsapp-doodles-light.svg',
  '/whatsapp-doodles-dark.svg',
]

/**
 * Cache one asset and, for stylesheets, the fonts/images they reference.
 * Hashed Next.js URLs never change contents, so a name hit is final.
 */
async function precacheAsset(cache, url) {
  try {
    if (await cache.match(url)) return
    const response = await fetch(url, { cache: 'reload' })
    if (!response.ok) return
    await cache.put(url, response.clone())

    if (/\.css(\?|$)/.test(url)) {
      const css = await response.text()
      const refs = new Set()
      const re = /url\((['"]?)(\/_next\/static\/[^)'"?#]+)\1\)/g
      let match
      while ((match = re.exec(css))) refs.add(match[2])
      await Promise.allSettled([...refs].map(ref => precacheAsset(cache, ref)))
    }
  } catch {
    /* a missing optional asset must never fail the install */
  }
}

/**
 * Cache a page's HTML *and* the build chunks it references. Caching only the
 * HTML was the old bug: offline the document loaded but every script/style
 * request missed, so the app arrived unstyled and non-interactive.
 */
async function precachePage(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' })
    if (!response.ok) return
    await cache.put(url, response.clone())

    const type = response.headers.get('content-type') || ''
    if (!type.includes('text/html')) return

    const html = await response.text()
    const assets = new Set()
    const re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g
    let match
    while ((match = re.exec(html))) assets.add(match[1])
    await Promise.allSettled([...assets].map(asset => precacheAsset(cache, asset)))
  } catch {
    /* see precacheAsset: one bad URL must not wedge the install */
  }
}

// Install: pre-cache essential pages and their assets.
// NOTE: per-URL error handling, NOT addAll. addAll rejects the WHOLE install
// if a single URL 404s — and a failed install means the PREVIOUS service worker
// stays in control, still serving old cached bundles. A missed precache entry
// is far better than a permanently stale app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      await Promise.allSettled(PRECACHE_URLS.map(url => precachePage(cache, url)))
      await Promise.allSettled(PRECACHE_ASSETS.map(url => precacheAsset(cache, url)))
      await self.skipWaiting()
    })
  )
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Fetch: network-only for auth, network-first for API + pages, cache-first assets
self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Only same-origin requests belong to this app's caches. Supabase/analytics
  // calls must go straight to the network or fail on their own.
  if (url.origin !== self.location.origin) return

  // Auth pages and the OAuth callback: network ONLY — never cached, never
  // served from cache. A stale /auth/callback or /auth/login would break
  // sign-in (old bundles, eaten query params) and lock users out.
  if (url.pathname.startsWith('/auth/')) return

  // API calls: network-first, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
      )
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
  if (
    req.destination === 'style' ||
    req.destination === 'script' ||
    req.destination === 'image' ||
    req.destination === 'font' ||
    url.pathname.match(/\.(css|js|mjs|png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?)$/)
  ) {
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

  // Navigation data for the App Router (client-side transitions). It is a
  // different payload from the HTML at the same URL, so it gets its own cache
  // key and cache — never mixed with documents.
  if (req.headers.get('RSC') === '1') {
    const key = new Request(`${url.pathname}${url.search}${url.search ? '&' : '?'}__rsc=1`)
    event.respondWith(
      fetch(req)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(RSC_CACHE).then(cache => cache.put(key, clone))
          }
          return response
        })
        .catch(() => caches.match(key).then(cached => cached || Response.error()))
    )
    return
  }

  // Pages: network-first with offline fallback (was stale-while-revalidate —
  // that served outdated HTML/bundles right after each deploy).
  event.respondWith(
    fetch(req)
      .then(response => {
        // Only cache successful, non-redirected pages — never error responses
        // or auth redirects (a cached 500/307 would be served stale later).
        if (response.ok && !response.redirected && req.mode === 'navigate') {
          const clone = response.clone()
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, clone))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        if (req.mode !== 'navigate') return Response.error()

        // OFFLINE NAVIGATION. Prefer the branded /offline page, then the
        // cached landing page, then an inline copy for a first visit where
        // neither made it into the cache. Each is awaited: a Promise is always
        // truthy and used to short-circuit into a dead `undefined` response.
        const offline = await caches.match('/offline')
        if (offline) return offline
        const root = await caches.match('/')
        if (root) return root
        return new Response(offlineHTML(), { headers: { 'Content-Type': 'text/html' } })
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
