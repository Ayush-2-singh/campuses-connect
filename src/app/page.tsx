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

export default async function Home() {
  const [stats, companies] = await Promise.all([getStats(), getCompanies()])
  return <HireLanding stats={stats} companies={companies} />
}
