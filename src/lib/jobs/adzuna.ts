/**
 * ADZUNA JOB FEED — server-only adapter.
 *
 * `/jobs` has an empty `job_postings` table, so the board shows nothing. This
 * adapter fills it from a LICENSED aggregator (Adzuna) instead of scraping
 * LinkedIn / Naukri / Indeed, which have no public API and whose terms forbid
 * it — a scrape gets the domain blocked and the listings are unusable anyway.
 *
 * ── Rules this file follows ─────────────────────────────────────────────────
 *  1. The key never reaches the browser: only `/api/jobs/external` calls this.
 *  2. Nothing is invented. Every field is passed through from the provider, and
 *     a listing without a real `redirect_url` is dropped, because "Apply" must
 *     always land on the original posting.
 *  3. Attribution stays intact (`source: 'adzuna'` + the provider's own apply
 *     URL) — that is a condition of using the feed, not a nicety.
 *  4. Missing credentials are a normal state, not an error: `isAdzunaConfigured`
 *     lets the UI hide the feed and keep the campus board working.
 */

const COUNTRY = 'in' // Adzuna India
const PAGE_SIZE = 20
const CACHE_SECONDS = 3600

export type ExternalJob = {
  /** Stable id from the provider — used to de-duplicate across refreshes. */
  id: string
  title: string
  company: string
  location: string
  /** Short plain-text blurb; the full description lives on the source page. */
  excerpt: string
  /** Always an external URL — this is where "Apply" sends the student. */
  applyUrl: string
  postedAt: string | null
  salaryMin: number | null
  salaryMax: number | null
  contractTime: string | null
  category: string | null
  source: 'adzuna'
}

export type ExternalJobPage = {
  jobs: ExternalJob[]
  total: number
  page: number
}

export function isAdzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)
}

/** Which env vars are missing — for the honest "feed not configured" message. */
export function missingAdzunaEnv(): string[] {
  const missing: string[] = []
  if (!process.env.ADZUNA_APP_ID) missing.push('ADZUNA_APP_ID')
  if (!process.env.ADZUNA_APP_KEY) missing.push('ADZUNA_APP_KEY')
  return missing
}

type RawJob = {
  id?: string | number
  title?: string
  company?: { display_name?: string }
  location?: { display_name?: string }
  description?: string
  redirect_url?: string
  created?: string
  salary_min?: number
  salary_max?: number
  contract_time?: string
  category?: { label?: string }
}

const clean = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

function normalise(raw: RawJob): ExternalJob | null {
  // A listing with no title, no employer or no real apply URL is not a job the
  // student can act on — drop it rather than render a dead card.
  if (!raw?.title || !raw?.redirect_url || !raw?.company?.display_name) return null
  if (!/^https?:\/\//i.test(raw.redirect_url)) return null

  const salaryMin = typeof raw.salary_min === 'number' ? Math.round(raw.salary_min) : null
  const salaryMax = typeof raw.salary_max === 'number' ? Math.round(raw.salary_max) : null

  return {
    id: String(raw.id ?? raw.redirect_url),
    title: clean(raw.title, 140),
    company: clean(raw.company.display_name, 90),
    location: clean(raw.location?.display_name, 90) || 'India',
    excerpt: clean(raw.description, 180),
    applyUrl: raw.redirect_url,
    postedAt: raw.created ?? null,
    salaryMin,
    salaryMax,
    contractTime: raw.contract_time ? clean(raw.contract_time, 20) : null,
    category: raw.category?.label ? clean(raw.category.label, 60) : null,
    source: 'adzuna',
  }
}

/**
 * One page of live listings. Returns `null` when the feed is not configured or
 * the provider fails — the caller keeps the campus board and simply omits this
 * band, the same contract the landing page's proof bands follow.
 */
export async function searchAdzuna(params: {
  what?: string
  where?: string
  page?: number
}): Promise<ExternalJobPage | null> {
  if (!isAdzunaConfigured()) return null

  const page = Math.min(Math.max(params.page ?? 1, 1), 20) // provider caps pages
  const qs = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID as string,
    app_key: process.env.ADZUNA_APP_KEY as string,
    results_per_page: String(PAGE_SIZE),
    'content-type': 'application/json',
  })
  if (params.what?.trim()) qs.set('what', params.what.trim().slice(0, 80))
  if (params.where?.trim()) qs.set('where', params.where.trim().slice(0, 60))

  const url = `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/${page}?${qs.toString()}`

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      // Hourly: one upstream call per hour per query, not per visitor.
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: RawJob[]; count?: number }
    const jobs = (data.results ?? []).map(normalise).filter((j): j is ExternalJob => Boolean(j))
    return { jobs, total: typeof data.count === 'number' ? data.count : jobs.length, page }
  } catch {
    return null
  }
}
