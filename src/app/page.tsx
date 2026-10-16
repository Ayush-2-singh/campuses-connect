import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import HireLanding from '@/components/marketing/HireLanding'

/**
 * `/` — the public landing.
 *
 * Server component so the two proof bands can show GENUINE rows read from the
 * database rather than invented ones: the trust metrics, and the row of
 * companies that are actually hiring here. It uses a service-role client
 * (never exposed to the browser) and is cached for an hour, so the page stays
 * static and fast. If either read fails for any reason, that band is simply
 * omitted — the landing never falls back to fabricated numbers, logos or names.
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
 * Recommended reading. A post with a title is the proxy for "someone wrote
 * something" until the blog feeds the landing directly. When nothing qualifies
 * the band says so itself, rather than dressing up invented sources — the same
 * rule the wins band follows.
 */
type Reading = { tag: string; title: string; body: string; source: string }

async function getReading(): Promise<Reading[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('posts')
      .select('title, body, post_type, company_org, created_at')
      .not('title', 'is', null)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(3)
    return (data ?? [])
      .filter((p: any) => p?.title && p?.body)
      .map((p: any) => ({
        tag: p.company_org ? String(p.company_org) : 'From the community',
        title: String(p.title),
        body: String(p.body).replace(/\s+/g, ' ').trim().slice(0, 150),
        source: p.company_org ? String(p.company_org) : 'Posted on ConnectToCampus',
      }))
  } catch {
    return []
  }
}

export default async function Home() {
  const [stats, companies, problems, wins, reading] = await Promise.all([
    getStats(),
    getCompanies(),
    getProblems(),
    getWins(),
    getReading(),
  ])
  return <HireLanding stats={stats} companies={companies} problems={problems} wins={wins} reading={reading} />
}
