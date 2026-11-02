import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import BlogApp from './BlogApp'

/**
 * `/blog` — the public blog index.
 *
 * WHY THIS IS A SERVER ROUTE
 *
 * The list used to be fetched in the browser, so the HTML Google received had
 * the heading and then a skeleton: no post titles, no excerpts and — because
 * each card was an `<article onClick>` — not a single link into
 * `/blog/[slug]`. Posts were only discoverable through the sitemap, and an
 * unlinked page that nobody can crawl from the site itself does not earn any
 * internal authority.
 *
 * The first page of published posts is now read here with the service-role
 * client (same RPC the client uses, so the row shape is identical), rendered
 * into the HTML, and handed to the interactive component as its starting
 * state. Filtering, search and "load more" still run in the browser.
 *
 * Metadata lives in ./layout.tsx; this file adds the collection structured
 * data.
 */

export const revalidate = 600

type BlogListItem = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  category: string
  tags: string[] | null
  company_name: string | null
  role: string | null
  cover_url: string | null
  view_count: number
  like_count: number
  comment_count: number
  published_at: string
  author_name: string
  author_username: string
  author_avatar: string | null
}

/** Absolute urls in structured data — Google drops relative `url` / `item`. */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

/**
 * The same `search_blog_posts` RPC the browser calls, with the same defaults
 * (all categories, newest first) — so the server-rendered list and the list a
 * client filter produces can never disagree about what "the blog" contains.
 */
async function getInitialPosts(): Promise<BlogListItem[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db.rpc('search_blog_posts', {
      search_query: '',
      p_category: null,
      p_limit: 12,
      p_offset: 0,
    })
    return (data ?? []) as BlogListItem[]
  } catch {
    return []
  }
}

export default async function BlogIndexPage() {
  const posts = await getInitialPosts()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Blog — interview experiences, tech and campus stories',
    description:
      'Interview experiences, tech deep-dives, how-to guides and campus stories written by students, for students.',
    url: `${APP_URL}/blog`,
    inLanguage: 'en-IN',
    isPartOf: { '@type': 'WebSite', name: 'ConnectToCampus', url: APP_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${APP_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${APP_URL}/blog` },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${APP_URL}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <BlogApp initialPosts={posts.map((post) => ({ ...post, excerpt: post.excerpt ?? '', tags: post.tags ?? [] }))} />
    </>
  )
}
