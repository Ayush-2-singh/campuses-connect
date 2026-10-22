import Link from 'next/link'
import type { Metadata } from 'next'
import BrandName from '@/components/BrandName'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * `/colleges` — the public campus directory.
 *
 * This is the entry point of the college-first model: a student lands here,
 * finds their campus, and reads what actually happened there. It is a SERVER
 * component on purpose — 185 rows render as plain links, so the page is
 * indexable, needs no JS, and costs one query instead of one per card.
 *
 * The student count is the only number shown, and it is a real count of public
 * profiles. A college with no students on the platform shows 0 rather than a
 * flattering placeholder.
 */

export const revalidate = 3600

export const metadata: Metadata = {
  // The root layout appends `· ConnectToCampus`, so the brand is not repeated here.
  title: 'Colleges — placement information by campus',
  description:
    'Browse Indian colleges and see the placement information students have written down for their own campus — the companies, the rounds and the results.',
  alternates: { canonical: '/colleges' },
}

type College = {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  is_verified: boolean | null
}

async function getColleges(q: string): Promise<College[]> {
  const db = getAdminClient()
  if (!db) return []

  let query = db
    .from('colleges')
    .select('id, name, slug, city, state, is_verified')
    .eq('is_active', true)
    .order('name')
    .limit(400)

  // Server-side filter — no client JS, and the URL stays shareable.
  if (q) query = query.ilike('name', `%${q}%`)

  try {
    const { data } = await query
    return (data ?? []).filter((c): c is College => Boolean(c?.name && c?.slug))
  } catch {
    return []
  }
}

/**
 * Students per college, in ONE query: read the public profile rows and count
 * them here. 100 public profiles today; paging keeps it correct as it grows
 * without firing 185 `count` queries.
 */
async function getStudentCounts(): Promise<Record<string, number>> {
  const db = getAdminClient()
  if (!db) return {}
  try {
    const counts: Record<string, number> = {}
    const pageSize = 1000
    for (let from = 0; from < 20000; from += pageSize) {
      const { data } = await db
        .from('profiles')
        .select('college_id')
        .eq('is_public', true)
        .range(from, from + pageSize - 1)
      if (!data?.length) break
      for (const row of data) {
        const id = (row as { college_id: string | null }).college_id
        if (id) counts[id] = (counts[id] ?? 0) + 1
      }
      if (data.length < pageSize) break
    }
    return counts
  } catch {
    return {}
  }
}

export default async function CollegesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q: rawQ } = await searchParams
  const q = (rawQ ?? '').trim().slice(0, 80)

  const [colleges, counts] = await Promise.all([getColleges(q), getStudentCounts()])
  const total = colleges.length

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      <header className="hl-nav">
        <div className="hl-wrap hl-nav-inner">
          <Link className="hl-brand" href="/" aria-label="ConnectToCampus home">
            <BrandName className="hl-brand-name" />
          </Link>
          <div className="hl-nav-right">
            <Link className="hl-nav-signin" href="/experiences">
              Experiences
            </Link>
            <Link className="hl-btn hl-btn--brand hl-btn--sm" href="/auth/signup">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Campus directory</p>
        <h1 className="hl-h2">Find your college</h1>
        <p className="hl-lead hl-measure">
          Placement advice only helps when it comes from the campus it happened at. Pick yours to see what students
          there have written down.
        </p>

        <form className="hl-cta-row" action="/colleges" method="get" role="search">
          <input
            className="hl-input"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search a college name…"
            aria-label="Search colleges"
          />
          <button className="hl-btn hl-btn--brand" type="submit">
            Search
          </button>
          {q && (
            <Link className="hl-btn hl-btn--ghost" href="/colleges">
              Clear
            </Link>
          )}
        </form>

        <p className="hl-micro">
          {q ? `${total} result${total === 1 ? '' : 's'} for “${q}”` : `${total} colleges listed`}
        </p>

        {total > 0 ? (
          <div className="hl-list-rows">
            {colleges.map((c) => {
              const students = counts[c.id] ?? 0
              const place = [c.city, c.state].filter(Boolean).join(', ')
              return (
                <Link className="hl-list-row" href={`/college/${c.slug}`} key={c.id}>
                  <span className="hl-list-mark" aria-hidden="true">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="hl-list-main">
                    <span className="hl-list-title">{c.name}</span>
                    <span className="hl-list-sub">{place || 'India'}</span>
                  </span>
                  <span className="hl-tag hl-tag--type">
                    {students} {students === 1 ? 'student' : 'students'}
                  </span>
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="hl-empty">
            No college matches “{q}”.{' '}
            <Link className="hl-nav-link" href="/colleges">
              See the full list
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  )
}
