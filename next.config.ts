import type { NextConfig } from "next";

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
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Public assets — 7 day cache
      {
        source: '/:all*(svg|jpg|png|webp|avif|ico|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
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
          // Control referrer information
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — disable unnecessary browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
