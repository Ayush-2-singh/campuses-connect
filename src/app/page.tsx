import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import HireLanding from '@/components/marketing/HireLanding'

/**
 * `/` — the public landing.
 *
 * Server component so the trust strip can show GENUINE counts read from the
 * database rather than invented ones. It uses a service-role client (never
 * exposed to the browser) and is cached for an hour, so the page stays static
 * and fast. If the counts cannot be read for any reason, the landing simply
 * omits the strip — it never falls back to fabricated numbers.
 *
 * The retired social "room discovery" home still ships on disk but is gated
 * off (see src/lib/featureGates.ts).
 */

export const revalidate = 3600

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

export default async function Home() {
  const stats = await getStats()
  return <HireLanding stats={stats} />
}
