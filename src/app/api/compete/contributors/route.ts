import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/compete/contributors?campus_id=<uuid>&limit=50
 *
 * The Creator ladder behind Compete. Points are DERIVED from rows that already
 * exist, so there is no counter to backfill or drift:
 *
 *   approved interview experience (with an author)  50
 *   published blog post                             40
 *   blog review / comment on a published post        5
 *   helpful vote received on an experience           3
 *   like received on a blog post                     1
 *
 * Reads through the service role because the aggregate spans owner-scoped RLS
 * tables. Only public profile fields and aggregate counts leave the server.
 */

const EXPERIENCE_POINTS = 50
const BLOG_POINTS = 40
const REVIEW_POINTS = 5
const HELPFUL_POINTS = 3
const LIKE_POINTS = 1

type ProfileRow = {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  departments?: { short_name?: string | null } | { short_name?: string | null }[] | null
}

function tierFor(score: number): string {
  if (score >= 1000) return 'Legend'
  if (score >= 500) return 'Trailblazer'
  if (score >= 200) return 'Author'
  if (score >= 50) return 'Contributor'
  return 'Rookie'
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getAdminClient()
  if (!db) return NextResponse.json({ entries: [] })

  const url = new URL(req.url)
  const requested = Number(url.searchParams.get('limit')) || 50
  const limit = Math.min(Math.max(requested, 1), 100)
  const campusParam = url.searchParams.get('campus_id')
  const campusId =
    campusParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusParam)
      ? campusParam
      : null

  let profileQuery = db
    .from('profiles')
    .select('id, full_name, username, avatar_url, campus_id, departments(short_name)')
    .eq('status', 'active')
    .eq('is_public', true)
    .limit(1000)
  if (campusId) profileQuery = profileQuery.eq('campus_id', campusId)

  const [profilesRes, experiencesRes, blogsRes, commentsRes] = await Promise.all([
    profileQuery,
    db
      .from('interview_experiences')
      .select('user_id, upvotes')
      .eq('review_status', 'approved')
      .not('user_id', 'is', null),
    db.from('blog_posts').select('id, author_id, like_count').eq('status', 'published'),
    db.from('blog_comments').select('author_id, post_id'),
  ])

  if (profilesRes.error || experiencesRes.error || blogsRes.error || commentsRes.error) {
    return NextResponse.json({ error: 'Could not build the creator ranking.' }, { status: 500 })
  }

  const experiences = new Map<string, { count: number; helpful: number }>()
  for (const row of experiencesRes.data ?? []) {
    if (!row.user_id) continue
    const bucket = experiences.get(row.user_id) ?? { count: 0, helpful: 0 }
    bucket.count += 1
    bucket.helpful += Math.max(Number(row.upvotes) || 0, 0)
    experiences.set(row.user_id, bucket)
  }

  const blogs = new Map<string, { count: number; likes: number }>()
  const publishedPostIds = new Set<string>()
  for (const row of blogsRes.data ?? []) {
    if (!row.author_id) continue
    publishedPostIds.add(row.id)
    const bucket = blogs.get(row.author_id) ?? { count: 0, likes: 0 }
    bucket.count += 1
    bucket.likes += Math.max(Number(row.like_count) || 0, 0)
    blogs.set(row.author_id, bucket)
  }

  const reviews = new Map<string, number>()
  for (const row of commentsRes.data ?? []) {
    if (!row.author_id || !publishedPostIds.has(row.post_id)) continue
    reviews.set(row.author_id, (reviews.get(row.author_id) ?? 0) + 1)
  }

  const entries = ((profilesRes.data as ProfileRow[] | null) ?? [])
    .map((profile) => {
      const exp = experiences.get(profile.id) ?? { count: 0, helpful: 0 }
      const blog = blogs.get(profile.id) ?? { count: 0, likes: 0 }
      const reviewCount = reviews.get(profile.id) ?? 0
      const score =
        exp.count * EXPERIENCE_POINTS +
        blog.count * BLOG_POINTS +
        reviewCount * REVIEW_POINTS +
        exp.helpful * HELPFUL_POINTS +
        blog.likes * LIKE_POINTS
      const dept = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments
      return {
        user_id: profile.id,
        full_name: profile.full_name || 'Anonymous',
        username: profile.username || '',
        avatar_url: profile.avatar_url,
        department: dept?.short_name || null,
        experience_count: exp.count,
        blog_count: blog.count,
        review_count: reviewCount,
        helpful_received: exp.helpful,
        blog_likes_received: blog.likes,
        contribution_score: score,
      }
    })
    .filter((entry) => entry.contribution_score > 0)
    .sort(
      (a, b) =>
        b.contribution_score - a.contribution_score ||
        b.experience_count - a.experience_count ||
        b.blog_count - a.blog_count ||
        a.user_id.localeCompare(b.user_id)
    )
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, tier: tierFor(entry.contribution_score), rank_position: index + 1 }))

  return NextResponse.json(
    { entries },
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } }
  )
}
