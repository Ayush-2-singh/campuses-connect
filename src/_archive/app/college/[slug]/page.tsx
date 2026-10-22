import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PublicNav from '@/components/marketing/PublicNav'
import PublicFooter from '@/components/marketing/PublicFooter'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * `/college/[slug]` — one campus, told by the students who sit there.
 *
 * This is the page no competitor can copy: it is scoped to a single college and
 * filled from first-hand write-ups by students of THAT college. Company blogs
 * and national prep sites cannot produce it, because they do not know who
 * studied where.
 *
 * ── How the join works ──────────────────────────────────────────────────────
 * `interview_experiences` has no college column — it has `user_id`. So the
 * college is resolved through the author's profile (`profiles.college_id`):
 *   1. read the public student ids of this college,
 *   2. read those students' write-ups, with the company embedded.
 * Two queries, both small. Nothing is inferred.
 *
 * ── Honesty rules ───────────────────────────────────────────────────────────
 * Counts are real, and every band hides itself when its query is empty. A
 * campus with no write-ups says so and invites the first one — it never dresses
 * up placeholder rows as content.
 */

export const revalidate = 3600

type College = {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  website: string | null
  logo_url: string | null
  is_verified: boolean | null
}

type Campus = { id: string; name: string; slug: string; city: string | null }

type Experience = {
  id: string
  title: string
  role: string | null
  result: string | null
  difficulty: string | null
  round_count: number | null
  upvotes: number | null
  created_at: string | null
  companies: { name: string; slug: string } | null
}

const DIFF_TAG: Record<string, string> = {
  easy: 'hl-tag hl-tag--easy',
  medium: 'hl-tag hl-tag--medium',
  hard: 'hl-tag hl-tag--hard',
}

const tagFor = (difficulty?: string | null) =>
  (difficulty && DIFF_TAG[difficulty.toLowerCase()]) || 'hl-tag hl-tag--type'

const placeOf = (c: College) => [c.city, c.state].filter(Boolean).join(', ')

function getDb() {
  const db = getAdminClient()
  if (!db) notFound()
  return db
}

async function getCollege(slug: string): Promise<College | null> {
  const db = getDb()
  try {
    const { data } = await db
      .from('colleges')
      .select('id, name, slug, city, state, website, logo_url, is_verified')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    return (data as College) ?? null
  } catch {
    return null
  }
}

async function getCampuses(collegeId: string): Promise<Campus[]> {
  const db = getDb()
  try {
    const { data } = await db
      .from('campuses')
      .select('id, name, slug, city')
      .eq('college_id', collegeId)
      .eq('is_active', true)
      .order('name')
    return (data as Campus[]) ?? []
  } catch {
    return []
  }
}

async function getStudentIds(collegeId: string): Promise<string[]> {
  const db = getDb()
  try {
    const { data } = await db.from('profiles').select('id').eq('college_id', collegeId).eq('is_public', true).limit(300)
    return (data ?? []).map((r) => (r as { id: string }).id)
  } catch {
    return []
  }
}

async function getExperiences(studentIds: string[]): Promise<Experience[]> {
  if (!studentIds.length) return []
  const db = getDb()
  try {
    const { data } = await db
      .from('interview_experiences')
      .select('id, title, role, result, difficulty, round_count, upvotes, created_at, companies(name, slug)')
      .in('user_id', studentIds)
      .order('upvotes', { ascending: false })
      .limit(20)
    return ((data ?? []) as unknown as Experience[]).filter((e) => Boolean(e?.title))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const college = await getCollege(slug)
  // The root layout appends `· ConnectToCampus`, so the brand is not repeated here.
  if (!college) return { title: 'College not found' }

  const place = placeOf(college)
  const title = `${college.name} placements — interview experiences`
  const description = `What placements actually look like at ${college.name}${
    place ? `, ${place}` : ''
  }: the companies that came, the rounds students sat through, and how it ended. Written by students of the college.`

  return {
    title,
    description,
    alternates: { canonical: `/college/${college.slug}` },
    openGraph: { title, description, type: 'website' },
  }
}

export default async function CollegePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const college = await getCollege(slug)
  if (!college) notFound()

  const [campuses, studentIds] = await Promise.all([getCampuses(college.id), getStudentIds(college.id)])
  const experiences = await getExperiences(studentIds)

  // Companies that actually interviewed this campus's students, de-duplicated.
  const visited = new Map<string, { name: string; slug: string; count: number }>()
  for (const e of experiences) {
    const c = e.companies
    if (!c?.slug) continue
    const hit = visited.get(c.slug) ?? { name: c.name, slug: c.slug, count: 0 }
    hit.count += 1
    visited.set(c.slug, hit)
  }
  const companies = [...visited.values()].sort((a, b) => b.count - a.count)

  const place = placeOf(college)

  return (
    <div className="hl-page">
      <div className="hl-bg" aria-hidden="true" />

      <PublicNav />

      {/* ── Identity ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">{place || 'India'}</p>
        <h1 className="hl-h2">{college.name}</h1>
        <p className="hl-lead hl-measure">
          {experiences.length > 0
            ? `What placements look like here, written by the students who sat through them.`
            : `Placement information for ${college.name}. Nobody from this campus has written a round up yet — yours would be the first.`}
        </p>

        <div className="hl-pill-row">
          <span className="hl-pill">
            {studentIds.length} {studentIds.length === 1 ? 'student' : 'students'}
          </span>
          <span className="hl-pill">
            {experiences.length} write-up{experiences.length === 1 ? '' : 's'}
          </span>
          <span className="hl-pill">
            {companies.length} compan{companies.length === 1 ? 'y' : 'ies'}
          </span>
        </div>

        <div className="hl-cta-row">
          <Link className="hl-btn hl-btn--brand" href="/experiences">
            Write your experience
          </Link>
          {college.website && (
            <a
              className="hl-btn hl-btn--ghost"
              href={college.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              College website
            </a>
          )}
        </div>
      </section>

      {/* ── Companies that came ── */}
      {companies.length > 0 && (
        <section className="hl-section hl-wrap">
          <p className="hl-eyebrow">On record</p>
          <h2 className="hl-h2">Companies students here have written about</h2>
          <div className="hl-list-rows">
            {companies.map((c) => (
              <Link className="hl-list-row" href={`/companies/${c.slug}`} key={c.slug}>
                <span className="hl-list-mark" aria-hidden="true">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="hl-list-main">
                  <span className="hl-list-title">{c.name}</span>
                  <span className="hl-list-sub">
                    {c.count} write-up{c.count === 1 ? '' : 's'} from this campus
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Write-ups ── */}
      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">From {college.name}</p>
        <h2 className="hl-h2">The rounds, as they happened</h2>

        {experiences.length > 0 ? (
          <div className="hl-list-rows">
            {experiences.map((e) => (
              <div className="hl-list-row" key={e.id}>
                <span className="hl-list-mark" aria-hidden="true">
                  {(e.companies?.name ?? '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="hl-list-main">
                  <span className="hl-list-title">{e.title}</span>
                  <span className="hl-list-sub">
                    {e.companies?.name ?? 'Company'}
                    {e.role ? ` · ${e.role}` : ''}
                    {e.round_count ? ` · ${e.round_count} rounds` : ''}
                    {e.result ? ` · ${e.result}` : ''}
                  </span>
                </span>
                <span className={tagFor(e.difficulty)}>{e.difficulty || 'Write-up'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="hl-empty">
            No write-ups from {college.name} yet. If you have sat through a drive, yours would be the first one here —{' '}
            <Link className="hl-nav-link" href="/experiences">
              add it in two minutes
            </Link>
            .
          </p>
        )}
      </section>

      {/* ── Campuses belonging to this college ── */}
      {campuses.length > 0 && (
        <section className="hl-section hl-wrap">
          <p className="hl-eyebrow">Campuses</p>
          <h2 className="hl-h2">Where students here study</h2>
          <div className="hl-list-rows">
            {campuses.map((c) => (
              <div className="hl-list-row" key={c.id}>
                <span className="hl-list-mark" aria-hidden="true">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="hl-list-main">
                  <span className="hl-list-title">{c.name}</span>
                  <span className="hl-list-sub">{c.city || place || 'India'}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="hl-section hl-wrap">
        <p className="hl-eyebrow">Keep going</p>
        <div className="hl-cta-row">
          <Link className="hl-btn hl-btn--brand" href="/colleges">
            Browse all colleges
          </Link>
          <Link className="hl-btn hl-btn--ghost" href="/experiences">
            All experiences
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
