import type { MetadataRoute } from 'next'

/**
 * ROBOTS — allow all crawlers, point them at the sitemap.
 *
 * Authenticated areas are disallowed because they render nothing useful for a
 * search result and may expose user content in cached snippets. The list is
 * kept to routes that actually exist: `/applications` and `/saved` were left
 * over from the retired job board and pointed at 404s, while notifications,
 * connections and the AI brain were missing.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/onboarding',
          '/messages',
          '/connections',
          '/notifications',
          '/brain',
          '/profile',
          '/compete/live',
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
