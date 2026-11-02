import { notFound } from 'next/navigation'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import BlogPostView from './BlogPostView'

/**
 * `/blog/[slug]` — the server half of a blog post.
 *
 * The page was a client component that fetched its own row, so the HTML a
 * crawler received contained the heading and then nothing: no headline, no
 * article text, no shareable preview (the JSON-LD in ./layout.tsx was the only
 * place the body existed). This route reads the post with the service-role
 * client — same `status = 'published'` filter the client query used — and hands
 * it to <BlogPostView>, which renders the body on the server and keeps the
 * interactive parts (likes, comments, view counter) on the client.
 *
 * Metadata and the BlogPosting JSON-LD live in ./layout.tsx, which performs its
 * own read; both are cached by the segment's `revalidate`.
 */

export const revalidate = 600

interface AuthorRow {
  full_name?: string | null
  username?: string | null
  avatar_url?: string | null
}

interface PostRow {
  id: string
  author_id: string
  title: string
  slug: string
  excerpt: string | null
  body: string
  cover_url: string | null
  category: string
  tags: string[] | null
  company_name: string | null
  role: string | null
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  published_at: string | null
  created_at: string
  profiles?: AuthorRow | AuthorRow[] | null
}

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

/** Only a published post is public — a draft must 404 here, exactly as it does
 *  in the layout and in the sitemap. */
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

function authorOf(row: PostRow): AuthorRow {
  const profiles = row.profiles
  if (!profiles) return {}
  return Array.isArray(profiles) ? (profiles[0] ?? {}) : profiles
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const row = await getPost(slug)
  if (!row) notFound()

  const author = authorOf(row)
  const post = {
    ...row,
    excerpt: row.excerpt ?? '',
    tags: row.tags ?? [],
    view_count: row.view_count ?? 0,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    published_at: row.published_at ?? row.created_at,
    author_name: author.full_name?.trim() || 'Anonymous',
    author_username: author.username?.trim() || 'unknown',
    author_avatar: author.avatar_url ?? null,
  }

  return <BlogPostView initialPost={post} />
}
