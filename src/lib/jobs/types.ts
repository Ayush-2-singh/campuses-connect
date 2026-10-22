/**
 * Shared shapes for every external job source.
 *
 * Each adapter (Adzuna, Remotive, Himalayas) normalises into these, so the API
 * route and the UI never learn a provider's field names. `source` is kept on
 * every row because attribution is a condition of using these feeds.
 */

export type JobSource = 'adzuna' | 'remotive' | 'himalayas'

export type ExternalJob = {
  /** Stable id from the provider — de-duplicates across refreshes. */
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
  currency: string | null
  contractTime: string | null
  category: string | null
  source: JobSource
}

export type ExternalJobFeed = {
  jobs: ExternalJob[]
  /** What each provider reported before we trimmed the page. */
  totals: Partial<Record<JobSource, number>>
}
