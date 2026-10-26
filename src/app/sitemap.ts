import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getCompaniesWithExperiences } from '@/lib/publicExperiences'

/**
 * SITEMAP — every public route, submitted to Google/Bing via Search Console.
 * Dynamic route templates (e.g. /post/[id]) are skipped — search engines
 * discover those through internal links and the blog's slug URLs, which all
 * live under routes listed here.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

/**
 * Without this the sitemap is frozen at BUILD time: a write-up approved (or a
 * post published) an hour after the deploy would not be submitted until the
 * next one. Ten minutes matches the pages it lists.
 */
export const revalidate = 600

/**
 * Every APPROVED write-up has its own URL (see /experiences/[id]), so the
 * sitemap carries them: a detail route Google cannot discover is a detail route
 * that cannot rank.
 *
 * `review_status = 'approved'` is not optional. A pending or rejected row is
 * not readable by a visitor (see 20261113_interview_experience_sources.sql), so
 * listing it here would ask Google to index a page that 404s for everyone — the
 * definition of a soft 404. Seeded research leads stay out until somebody
 * approves them.
 *
 * `updated_at` is used as lastModified so a crawl reflects when the write-up
 * actually changed, not when this sitemap was generated.
 */
async function experiencePaths(): Promise<{ path: string; lastModified: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await db
      .from('interview_experiences')
      .select('id, updated_at')
      .eq('review_status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(500)
    return (data ?? []).map((row: { id: string; updated_at: string }) => ({
      path: `/experiences/${row.id}`,
      lastModified: row.updated_at,
    }))
  } catch {
    return []
  }
}

/**
 * Published blog posts have their own URLs (/blog/[slug]) and their own
 * BlogPosting metadata, but the old comment here assumed crawlers would find
 * them "through internal links". They are the long-tail content this site
 * writes for — a post a crawler has to guess at is a post that does not rank. —
 * so they are listed. `status = 'published'` mirrors the layout's own filter: a
 * draft 404s for a visitor, and must never be advertised.
 */
async function blogPaths(): Promise<{ path: string; lastModified: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await db
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(500)
    return ((data ?? []) as { slug: string | null; updated_at: string | null; published_at: string | null }[])
      .filter((row) => Boolean(row.slug))
      .map((row) => ({
        path: `/blog/${row.slug}`,
        lastModified: row.updated_at ?? row.published_at ?? new Date().toISOString(),
      }))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const core: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }[] = [
    // NOTE: the retired routes (/jobs, /community, /communities, /global …) are
    // deliberately absent — they 307-redirect to /experiences (see
    // lib/featureGates.ts), and listing a redirecting URL in a sitemap is an
    // SEO error. Only routes that render are listed.
    { path: '/', priority: 1, changeFrequency: 'daily' },
    { path: '/blog', priority: 0.9, changeFrequency: 'daily' },
    { path: '/compete', priority: 0.8, changeFrequency: 'daily' },
    { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
    { path: '/experiences', priority: 0.7, changeFrequency: 'weekly' },
    // The company directory: "amazon interview experience" searches land here.
    { path: '/companies', priority: 0.7, changeFrequency: 'weekly' },
    // The group feature — "anyone can create a group" — is a public, listing
    // page with real search demand ("create a study group online", "group
    // study room"), so it belongs in the sitemap next to the write-ups.
    { path: '/live-voice-chat', priority: 0.8, changeFrequency: 'daily' },
    { path: '/premium', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/refund', priority: 0.3, changeFrequency: 'yearly' },
  ]

  const auth: { path: string; priority: number }[] = [
    { path: '/auth/login', priority: 0.4 },
    { path: '/auth/signup', priority: 0.5 },
  ]

  const experiences = await experiencePaths()
  const posts = await blogPaths()
  // One page per company that HAS an approved write-up — the directory pages
  // this site wants to rank for "<company> interview experience".
  const companyPaths = (await getCompaniesWithExperiences()).map((c) => `/companies/${c.slug}`)

  return [
    ...experiences.map((e) => ({
      url: `${APP_URL}${e.path}`,
      lastModified: new Date(e.lastModified),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...companyPaths.map((path) => ({
      url: `${APP_URL}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.map((p) => ({
      url: `${APP_URL}${p.path}`,
      lastModified: new Date(p.lastModified),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
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
