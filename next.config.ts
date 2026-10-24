import type { NextConfig } from 'next'

/**
 * Content-Security-Policy.
 *
 * Scoped to what the app actually uses:
 *   • Supabase REST + Realtime (https/wss) for data and live channels;
 *   • the LiveKit websocket the voice rooms signal over;
 *   • Plausible and Google Analytics, which `Analytics` injects only AFTER the
 *     cookie banner is accepted;
 *   • the YouTube embed the room music player uses (frame-src).
 *
 * `'unsafe-inline'` in script-src is deliberate for this first step: the theme
 * and service-worker bootstraps in app/layout.tsx are inline, and a nonce-based
 * policy would make every page dynamic (the landing is statically rendered and
 * cached for an hour). What this still blocks is the thing that matters most:
 * any script, frame, object or form action from an origin not listed here.
 */
function contentSecurityPolicy(): string {
  const connect = new Set<string>([
    "'self'",
    'https://plausible.io',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
  ])

  const addOrigin = (raw: string | undefined, fallback: string[]) => {
    if (!raw) return fallback.forEach((f) => connect.add(f))
    try {
      const u = new URL(raw)
      connect.add(u.origin)
      connect.add(u.origin.replace(/^http/, 'ws'))
    } catch {
      /* misconfigured env: the fallbacks below still apply */
      fallback.forEach((f) => connect.add(f))
    }
  }

  addOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL, ['https://*.supabase.co', 'wss://*.supabase.co'])
  addOrigin(process.env.NEXT_PUBLIC_LIVEKIT_URL, ['wss://*.livekit.cloud'])

  const dev = process.env.NODE_ENV === 'development'
  if (dev) {
    connect.add('ws://localhost:*')
    connect.add('http://localhost:*')
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' https://plausible.io https://www.googletagmanager.com${dev ? " 'unsafe-eval'" : ''}`,
    `connect-src ${[...connect].join(' ')}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ')
}

const nextConfig: NextConfig = {
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },

  // Compress responses
  compress: true,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Cache optimized images for 30 days
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Headers for caching and security
  async headers() {
    return [
      // API routes — NO shared/public caching. Most endpoints are
      // authenticated and return user-specific data (brain, applications,
      // admin analytics…); `public, s-maxage` would let a shared/CDN cache
      // serve one user's private response to the next requester. The service
      // worker already does network-first for /api, so nothing is cached here.
      // (Restore a scoped rule only for genuinely public, idempotent GETs.)
      // Static assets — immutable long cache
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Public assets — 7 day cache
      {
        source: '/:all*(svg|jpg|png|webp|avif|ico|woff|woff2)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      // Security headers — applied to all routes
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent page from being embedded in iframes (clickjacking protection)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Enable XSS protection in older browsers
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Force HTTPS for 2 years once the browser has seen one secure
          // response (Vercel terminates TLS; this hardens every visit after).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — disable unnecessary browser features.
          // microphone/camera=(self): a live room uses getUserMedia for both, and
          // the call screen has a working camera button. The old camera=() blocked
          // it on every origin, so "Turn camera on" was guaranteed to fail.                    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()' },
          // Content-Security-Policy — see contentSecurityPolicy() above
          // for what is allowed and why 'unsafe-inline' is still here.
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
        ],
      },
    ]
  },
}

export default nextConfig
