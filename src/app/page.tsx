import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import PlacementLanding from '@/components/marketing/PlacementLanding'

/**
 * `/` — the public student landing.
 *
 * Server component so every proof band can show GENUINE rows read from the
 * database rather than invented ones: the counts, the companies on record, the
 * published interview write-ups, and the live practice problems. It uses a
 * service-role client (never exposed to the browser) and is cached for an hour,
 * so the page stays static and fast. If a read fails for any reason that band
 * is simply omitted — the landing never falls back to fabricated numbers,
 * logos or names.
 *
 * The recruiter storefront (`HireLanding`, now parked in src/_archive with the
 * archived `/hire` route) is hidden while the product is student-facing — see
 * RECRUITER_SALES_HIDDEN in src/lib/featureGates.ts.
 *
 * The retired social "room discovery" home still ships on disk but is gated
 * off (see src/lib/featureGates.ts).
 */

export const revalidate = 3600

type Company = { name: string; slug: string; logo_url: string | null }
type Problem = { title: string; slug: string; difficulty: string | null; topics: string[] | null }
type Win = {
  id: string
  title: string
  role: string | null
  result: string | null
  difficulty: string | null
  upvotes: number | null
  excerpt: string
  company: string
  initials: string
}
type Post = {
  title: string
  slug: string
  excerpt: string | null
  category: string
  author: string | null
}
/** A member who has actually uploaded a profile photo — nothing else qualifies. */
type StudentFace = { name: string; avatar_url: string }

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

async function getStats() {
  const db = getAdmin()
  if (!db) return null
  try {
    const [students, campuses, companies] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }).eq('is_public', true),
      db.from('campuses').select('*', { count: 'exact', head: true }),
      db.from('companies').select('*', { count: 'exact', head: true }),
    ])
    if (typeof students.count !== 'number') return null
    return {
      students: students.count,
      campuses: campuses.count ?? 0,
      companies: companies.count ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Companies hiring here — real rows only, newest first. A strip built from the
 * live table is honest proof; a wall of borrowed brand logos would not be, and
 * this page never invents one.
 */
async function getCompanies(): Promise<Company[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('companies')
      .select('name, slug, logo_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(12)
    return (data ?? []).filter((c): c is Company => Boolean(c?.name && c?.slug))
  } catch {
    return []
  }
}

/**
 * Real assessment problems, for the "Compete" block's list. Titles, difficulty
 * and topics come straight from public.dsa_problems — no invented questions.
 */
async function getProblems(): Promise<Problem[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('dsa_problems')
      .select('title, slug, difficulty, topics')
      .eq('is_active', true)
      .limit(5)
    return (data ?? []).filter((p): p is Problem => Boolean(p?.title && p?.slug))
  } catch {
    return []
  }
}

/**
 * The members' wins band. These are REAL interview write-ups posted by members
 * (public.interview_experiences) — the band renders nothing until there is at
 * least one, because inventing candidates, quotes or employers is not an option
 * on this page. The excerpt is trimmed in SQL-free fashion here so the query
 * never ships a wall of text to the browser.
 */
async function getWins(): Promise<Win[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('interview_experiences')
      .select('id, title, role, result, difficulty, upvotes, experience, companies(name)')
      .order('upvotes', { ascending: false })
      .limit(6)
    const rows = data ?? []
    return rows
      .filter((r: any) => r?.title && r?.experience && r?.companies?.name)
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        role: r.role,
        result: r.result,
        difficulty: r.difficulty,
        upvotes: r.upvotes,
        excerpt: String(r.experience).replace(/\s+/g, ' ').trim().slice(0, 150),
        company: r.companies.name,
        initials: String(r.companies.name)
          .split(/\s+/)
          .map((w: string) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
      }))
  } catch {
    return []
  }
}
/**
 * The orbit's member faces. Only students who have UPLOADED a photo qualify:
 * `avatar_url IS NOT NULL` and the profile is public. There is no fallback, so
 * a member who has not set a photo simply never appears here — no initials, no
 * stock face, no third-party placeholder. The hero hides the face ring entirely
 * when this returns nothing.
 */
async function getStudentFaces(): Promise<StudentFace[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('is_public', true)
      .not('avatar_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(12)
    return (data ?? [])
      .filter((p: any) => Boolean(p?.avatar_url))
      .map((p: any) => ({
        name: String(p.full_name || p.username || '').trim() || 'Student',
        avatar_url: String(p.avatar_url),
      }))
  } catch {
    return []
  }
}

/**
 * Published blog posts for the landing's reading rail. Same honesty rule as
 * every other band: only `status = 'published'` rows, and the rail falls back to
 * cards that say "preview — not published" when this returns nothing.
 */
async function getPosts(): Promise<Post[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('blog_posts')
      .select('title, slug, excerpt, category, published_at, profiles(full_name, username)')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(8)
    return (data ?? [])
      .filter((p: any) => Boolean(p?.title))
      .map((p: any) => ({
        title: p.title,
        slug: p.slug ?? '',
        excerpt: p.excerpt ?? null,
        category: p.category ?? 'Blog',
        author: p.profiles?.full_name || p.profiles?.username || null,
      }))
  } catch {
    return []
  }
}

export default async function Home() {
  const [stats, companies, problems, wins, posts, faces] = await Promise.all([
    getStats(),
    getCompanies(),
    getProblems(),
    getWins(),
    getPosts(),
    getStudentFaces(),
  ])
  return (
    <PlacementLanding stats={stats} companies={companies} problems={problems} wins={wins} posts={posts} faces={faces} />
  )
}
