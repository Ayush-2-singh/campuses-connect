import type { MetadataRoute } from 'next'

/**
 * ROBOTS — allow all crawlers, point them at the sitemap.
 * Authenticated areas (admin, onboarding, messages, API) are disallowed:
 * they render nothing useful for search and may expose user content in
 * cached snippets.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/onboarding', '/messages', '/applications', '/profile', '/saved'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
