import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Public reads for the interview directory — the ONE place that decides what a
 * visitor may see.
 *
 * `review_status = 'approved'` is the whole rule (see
 * 20261113_interview_experience_sources.sql): a seeded research lead, a
 * pending submission and a rejected write-up are all invisible here, and
 * therefore also invisible to the sitemap, the company pages and Google.
 *
 * Read with the service-role client on the server only; nothing here is ever
 * shipped to the browser.
 */

export type PublicCompany = { name: string; slug: string; logo_url: string | null }

export type PublicExperience = {
  id: string
  title: string
  experience: string
  role: string | null
  created_at: string
  source_url: string | null
  companies: PublicCompany | null
}

export type CompanyEntry = PublicCompany & { count: number }

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

/** Approved write-ups, newest first, optionally for one company slug. */
export async function getApprovedExperiences(
  opts: { companySlug?: string; limit?: number } = {}
): Promise<PublicExperience[]> {
  const db = getAdmin()
  if (!db) return []
  const limit = Math.min(opts.limit ?? 30, 100)
  try {
    let query = db
      .from('interview_experiences')
      .select('id, title, experience, role, created_at, source_url, companies(name, slug, logo_url)')
      .eq('review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (opts.companySlug) {
      const { data: company } = await db.from('companies').select('id').eq('slug', opts.companySlug).maybeSingle()
      if (!company) return []
      query = query.eq('company_id', company.id)
    }

    const { data } = await query
    // PostgREST answers a to-one embed as an ARRAY, so normalise it here rather
    // than making every caller remember.
    type Row = Omit<PublicExperience, 'title' | 'companies'> & {
      title: string | null
      companies: PublicCompany | PublicCompany[] | null
    }
    return ((data ?? []) as unknown as Row[])
      .filter((row) => Boolean(row?.id && row?.title))
      .map((row) => ({
        ...row,
        title: String(row.title),
        companies: Array.isArray(row.companies) ? (row.companies[0] ?? null) : row.companies,
      }))
  } catch {
    return []
  }
}

/**
 * Companies that actually have an approved write-up, most-covered first.
 * A company with nothing to show never gets a page — an empty company page is a
 * thin page, and this directory refuses to generate those.
 */
export async function getCompaniesWithExperiences(): Promise<CompanyEntry[]> {
  const rows = await getApprovedExperiences({ limit: 100 })
  const bySlug = new Map<string, CompanyEntry>()
  for (const row of rows) {
    const company = row.companies
    if (!company?.slug) continue
    const existing = bySlug.get(company.slug)
    if (existing) existing.count += 1
    else bySlug.set(company.slug, { ...company, count: 1 })
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
