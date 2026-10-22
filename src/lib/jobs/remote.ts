import type { ExternalJob, ExternalJobFeed } from './types'

/**
 * FREE, KEYLESS SOURCES — Remotive + Himalayas.
 *
 * Adzuna has India coverage but is not free: a new account gets 25 test calls
 * and then £8/month. Until that is paid for, the board would be empty, so these
 * two feeds carry it. Neither needs a key, both publish a public JSON endpoint,
 * and both are remote-first — which is what a student can actually apply to
 * from a tier-2/3 campus without relocating.
 *
 * ── Rules ───────────────────────────────────────────────────────────────────
 *  1. Never invent a row: a listing without a title, an employer and a real
 *     apply URL is dropped.
 *  2. Keep `source` on every row — Remotive's terms require attribution.
 *  3. Cache hard (an hour per query). Remotive asks for at most a couple of
 *     requests a minute, so one scheduled fetch per hour is the whole budget.
 */

const CACHE_SECONDS = 3600
const LIMIT = 20

const clean = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ') // strip HTML from descriptions
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

const isHttp = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v)

type RemotiveJob = {
  id?: number | string
  url?: string
  title?: string
  company_name?: string
  category?: string
  job_type?: string
  publication_date?: string
  candidate_required_location?: string
  salary?: string
  description?: string
}

async function fetchRemotive(what: string | undefined, limit: number): Promise<ExternalJob[]> {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (what) qs.set('search', what.slice(0, 60))
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?${qs.toString()}`, {
      headers: { accept: 'application/json' },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { jobs?: RemotiveJob[] }
    return (data.jobs ?? [])
      .filter((j) => j?.title && j?.company_name && isHttp(j.url))
      .map<ExternalJob>((j) => ({
        id: `remotive-${j.id ?? j.url}`,
        title: clean(j.title, 140),
        company: clean(j.company_name, 90),
        location: clean(j.candidate_required_location, 90) || 'Remote',
        excerpt: clean(j.description, 180),
        applyUrl: j.url as string,
        postedAt: j.publication_date ?? null,
        salaryMin: null,
        salaryMax: null,
        currency: null,
        contractTime: j.job_type ? clean(j.job_type, 20) : null,
        category: j.category ? clean(j.category, 60) : null,
        source: 'remotive',
      }))
  } catch {
    return []
  }
}

type HimalayasJob = {
  guid?: string
  title?: string
  companyName?: string
  applicationLink?: string
  excerpt?: string
  description?: string
  locationRestrictions?: string[]
  employmentType?: string
  minSalary?: number | null
  maxSalary?: number | null
  currency?: string | null
  categories?: string[]
  pubDate?: number | string
}

async function fetchHimalayas(what: string | undefined, limit: number): Promise<ExternalJob[]> {
  try {
    const res = await fetch(`https://himalayas.app/jobs/api?limit=${limit}&offset=0`, {
      headers: { accept: 'application/json' },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { jobs?: HimalayasJob[] }
    const needle = what?.trim().toLowerCase()

    return (
      (data.jobs ?? [])
        // This endpoint has no search parameter, so the query is applied to the
        // title here rather than pretending the provider filtered it.
        .filter((j) => !needle || clean(j.title, 200).toLowerCase().includes(needle))
        .filter((j) => j?.title && j?.companyName && isHttp(j.applicationLink))
        .map<ExternalJob>((j) => ({
          id: `himalayas-${j.guid ?? j.applicationLink}`,
          title: clean(j.title, 140),
          company: clean(j.companyName, 90),
          location: clean(j.locationRestrictions?.join(', '), 90) || 'Remote',
          excerpt: clean(j.excerpt ?? j.description, 180),
          applyUrl: j.applicationLink as string,
          postedAt: typeof j.pubDate === 'number' ? new Date(j.pubDate * 1000).toISOString() : (j.pubDate ?? null),
          salaryMin: typeof j.minSalary === 'number' ? Math.round(j.minSalary) : null,
          salaryMax: typeof j.maxSalary === 'number' ? Math.round(j.maxSalary) : null,
          currency: j.currency ?? null,
          contractTime: j.employmentType ? clean(j.employmentType, 20) : null,
          category: j.categories?.[0] ? clean(j.categories[0], 60) : null,
          source: 'himalayas',
        }))
    )
  } catch {
    return []
  }
}

/** Both free feeds, in parallel. One failing never hides the other. */
export async function searchRemoteJobs(params: { what?: string; limit?: number }): Promise<ExternalJobFeed> {
  const limit = Math.min(Math.max(params.limit ?? LIMIT, 1), 50)
  const [remotive, himalayas] = await Promise.all([
    fetchRemotive(params.what, limit),
    fetchHimalayas(params.what, limit),
  ])
  return {
    jobs: [...remotive, ...himalayas],
    totals: { remotive: remotive.length, himalayas: himalayas.length },
  }
}
