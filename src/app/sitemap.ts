import type { MetadataRoute } from 'next'

/**
 * SITEMAP — every public route, submitted to Google/Bing via Search Console.
 * Dynamic route templates (e.g. /post/[id]) are skipped — search engines
 * discover those through internal links and the blog's slug URLs, which all
 * live under routes listed here.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const core: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'daily' },
    { path: '/global', priority: 0.9, changeFrequency: 'daily' },
    { path: '/blog', priority: 0.9, changeFrequency: 'daily' },
    { path: '/community', priority: 0.8, changeFrequency: 'daily' },
    { path: '/compete', priority: 0.8, changeFrequency: 'daily' },
    { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
    { path: '/communities', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/companies', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/jobs', priority: 0.8, changeFrequency: 'daily' },
    { path: '/experiences', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/more', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ]

  const auth: { path: string; priority: number }[] = [
    { path: '/auth/login', priority: 0.4 },
    { path: '/auth/signup', priority: 0.5 },
  ]

  return [
    ...core.map((c) => ({
      url: `${APP_URL}${c.path}`,
      lastModified: now,
      changeFrequency: c.changeFrequency,
      priority: c.priority,
    })),
    ...auth.map((a) => ({
      url: `${APP_URL}${a.path}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: a.priority,
    })),
  ]
}
