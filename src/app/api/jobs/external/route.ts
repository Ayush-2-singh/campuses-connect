import { NextResponse } from 'next/server'
import { isAdzunaConfigured, missingAdzunaEnv, searchAdzuna } from '@/lib/jobs/adzuna'

/**
 * GET /api/jobs/external?what=&where=&page=
 *
 * The ONLY route that touches the aggregator key. It is a read-only proxy: no
 * user input is written anywhere, nothing is stored, and the provider's
 * attribution is passed through on every row.
 *
 * Three honest outcomes, no silent empty lists:
 *   200  feed rows (possibly zero, which is a real answer)
 *   503  `code: 'not_configured'` + the exact env vars still missing
 *   502  the provider was unreachable or rejected the key
 */

export const revalidate = 1800

export async function GET(request: Request) {
  if (!isAdzunaConfigured()) {
    return NextResponse.json(
      {
        code: 'not_configured',
        error: 'External jobs feed is not configured.',
        missing: missingAdzunaEnv(),
      },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10)

  const data = await searchAdzuna({
    what: searchParams.get('what') ?? undefined,
    where: searchParams.get('where') ?? undefined,
    page: Number.isFinite(page) ? page : 1,
  })

  if (!data) {
    return NextResponse.json(
      { code: 'upstream_error', error: 'The jobs provider did not respond. Try again shortly.' },
      { status: 502 }
    )
  }

  return NextResponse.json(data)
}
