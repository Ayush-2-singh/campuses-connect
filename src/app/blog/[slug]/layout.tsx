import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * BLOG POST SEO — the metadata and structured data for /blog/[slug].
 *
 * The post page itself stays a client component (likes, comments, the view
 * counter), but `generateMetadata` only exists on the SERVER, so the labels
 * live here in a layout: same route params, zero rewrite of the page, and
 * every post gets a title, description, canonical, Open Graph article card and
 * a BlogPosting payload Google can put in a rich result.
 *
 * The JSON-LD carries the excerpt and (truncated) the body, because the page's
 * own text arrives from a client fetch — structured data is the one place a
 * crawler is handed the article without running the app.
 *
 * Data comes from the service-role client the landing page uses: only
 * `status = 'published'` rows are readable here, exactly like the page.
 */

interface PostAuthor {
  full_name?: string | null
  username?: string | null
}

interface PostRow {
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  category: string | null
  tags: string[] | null
  company_name: string | null
  role: string | null
  published_at: string | null
  created_at: string
  // PostgREST answers a to-one relation as an OBJECT at runtime, but the
  // generated type is an array — accept both rather than guessing.
  profiles?: PostAuthor | PostAuthor[] | null
}

/** Fresh enough for a blog: a new post must not wait for the next deploy. */
export const revalidate = 600

/** Absolute urls in structured data (relative ones are dropped by Google). */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

async function getPost(slug: string): Promise<PostRow | null> {
  const db = getAdmin()
  if (!db || !slug) return null
  try {
    const { data } = await db
      .from('blog_posts')
      .select('*, profiles!blog_posts_author_id_fkey(full_name, username, avatar_url)')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    return (data as PostRow | null) ?? null
  } catch {
    return null
  }
}

function authorOf(post: PostRow): PostAuthor | null {
  const profiles = post.profiles
  if (!profiles) return null
  return Array.isArray(profiles) ? (profiles[0] ?? null) : profiles
}

function authorNameOf(post: PostRow): string {
  const author = authorOf(post)
  return author?.full_name?.trim() || author?.username?.trim() || 'ConnectToCampus'
}

/** One clean line for a description — Google truncates around 155–160. */
function summaryOf(post: PostRow, max = 155): string {
  const text = (post.excerpt || post.body || '').replace(/\s+/g, ' ').trim()
  if (!text) return post.company_name ? `${post.title} — ${post.company_name}` : post.title
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

type SlugProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: SlugProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: 'Post not found' }

  // Brand suffix written out: /blog/layout.tsx declares a plain-string title,
  // which stops Next applying the root template here (the rendered post had no
  // suffix at all until this was added).
  const title = `${post.title} · ConnectToCampus`
  const description = summaryOf(post)
  const published = post.published_at ?? post.created_at

  return {
    title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/blog/${slug}`,
      siteName: 'ConnectToCampus',
      locale: 'en_IN',
      publishedTime: published,
      authors: [authorNameOf(post)],
      tags: post.tags?.length ? post.tags : undefined,
      // A page-level `openGraph` replaces the root one, images included — a
      // post with no cover would otherwise preview as an empty box.
      images: post.cover_url ? [{ url: post.cover_url }] : [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: post.cover_url ? [post.cover_url] : ['/og.png'],
    },
  }
}

/** `blog_posts.category` key → the section a reader (and Google) understands. */
const CATEGORY_LABEL: Record<string, string> = {
  interview_experience: 'Interview Experience',
  tech_blog: 'Tech Blog',
  campus_life: 'Campus Life',
  how_to: 'How-To Guide',
  project: 'Project',
  review: 'Review',
  general: 'Blog',
}

export default async function BlogPostLayout({ children, params }: SlugProps & { children: React.ReactNode }) {
  const { slug } = await params
  const post = await getPost(slug)
  // A draft, a typo'd slug or a deleted post must 404 here too — the page
  // below would otherwise render an empty shell that still returns 200.
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: summaryOf(post, 300),
    // Truncated: long enough for Google to see the article, short enough that
    // the response never balloons for a 10k-word post.
    articleBody: (post.body ?? '').slice(0, 60_000),
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.published_at ?? post.created_at,
    inLanguage: 'en-IN',
    // Absolute, because Google's validator ignores a relative `@id` / `url`
    // and the post then links to nothing.
    url: `${APP_URL}/blog/${slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${APP_URL}/blog/${slug}` },
    author: { '@type': 'Person', name: authorNameOf(post) },
    publisher: {
      '@type': 'Organization',
      name: 'ConnectToCampus',
      logo: { '@type': 'ImageObject', url: `${APP_URL}/icon-512.png`, width: 512, height: 512 },
    },
    image: post.cover_url ?? `${APP_URL}/og.png`,
    keywords: post.tags?.length ? post.tags.join(', ') : undefined,
    articleSection: CATEGORY_LABEL[post.category ?? ''] ?? 'Blog',
  }

  return (
    <>
      {/* Escaped, so a `<` inside a post cannot break out of the script tag. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      {children}
    </>
  )
}
