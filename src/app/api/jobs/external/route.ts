import { NextResponse } from 'next/server'
import { isAdzunaConfigured, missingAdzunaEnv, searchAdzuna } from '@/lib/jobs/adzuna'
import { searchRemoteJobs } from '@/lib/jobs/remote'
import type { ExternalJob, JobSource } from '@/lib/jobs/types'
import { checkRateLimitByIp } from '@/lib/rateLimit'

/**
 * GET /api/jobs/external?what=&where=&page=
 *
 * The ONLY route that touches any job-provider key. Read-only: nothing is
 * written, and every row keeps the apply URL that belongs to its source.
 *
 * ── Sources, in the order they are trusted ──────────────────────────────────
 *   1. remotive + himalayas — free, keyless, remote-first. Always on.
 *   2. adzuna — India coverage, but a NEW ACCOUNT IS NOT FREE (25 test calls,
 *      then £8/month for 5,000 calls). Only called when the key is configured.
 *
 * ── Why the response carries `warnings` ─────────────────────────────────────
 * Returning an empty list when Adzuna is simply not paid for would look like
 * "there are no jobs" — the exact failure this project keeps fixing. Instead the
 * feed reports which sources answered and what is still missing, and the caller
 * keeps working with whatever did answer.
 */

export const revalidate = 1800

const dedupe = (jobs: ExternalJob[]): ExternalJob[] => {
  const seen = new Set<string>()
  const out: ExternalJob[] = []
  for (const job of jobs) {
    if (seen.has(job.applyUrl)) continue
    seen.add(job.applyUrl)
    out.push(job)
  }
  return out
}

export async function GET(request: Request) {
  // Public endpoint with no session: the bucket is the caller's IP. This feed
  // spends a third-party quota (Adzuna is paid per call), so an unthrottled
  // scrape is a bill, not just load.
  if (!(await checkRateLimitByIp(request.headers, 'jobs:external', 30, 60))) {
    return NextResponse.json({ error: 'Too many requests — try again in a few minutes.' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(parsed) ? parsed : 1
  const what = searchParams.get('what')?.slice(0, 80) || undefined
  const where = searchParams.get('where')?.slice(0, 60) || undefined

  const [remote, adzuna] = await Promise.all([
    searchRemoteJobs({ what }),
    isAdzunaConfigured() ? searchAdzuna({ what, where, page }) : Promise.resolve(null),
  ])

  const jobs = dedupe([...(adzuna?.jobs ?? []), ...remote.jobs])

  const warnings: { code: string; message: string; missing?: string[] }[] = []
  if (!isAdzunaConfigured()) {
    warnings.push({
      code: 'adzuna_not_configured',
      message: 'India-specific listings are off until the Adzuna key is set (paid: 25 test calls, then £8/month).',
      missing: missingAdzunaEnv(),
    })
  } else if (!adzuna) {
    warnings.push({
      code: 'adzuna_upstream_error',
      message: 'The India provider did not respond; showing the free remote feeds only.',
    })
  }
  if (!remote.jobs.length) {
    warnings.push({
      code: 'remote_feeds_empty',
      message: 'The free remote feeds returned nothing for this query.',
    })
  }

  const sources = [...new Set(jobs.map((j) => j.source))] as JobSource[]

  return NextResponse.json(
    {
      jobs,
      total: jobs.length,
      page,
      sources,
      // One row per provider, before de-duplication.
      counts: {
        remotive: remote.totals.remotive ?? 0,
        himalayas: remote.totals.himalayas ?? 0,
        adzuna: adzuna?.total ?? 0,
      },
      warnings,
    },
    // Cached at the edge for the same window the fetches use, so a viral link
    // cannot hammer a provider that asks for a couple of calls a minute.
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' } }
  )
}
