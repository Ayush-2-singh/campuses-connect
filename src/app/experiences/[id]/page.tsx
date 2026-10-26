import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Icon } from '@/components/icons'

/**
 * EXPERIENCE DETAIL — one write-up, one URL.
 *
 * Until this route existed every interview experience lived only inside the
 * /experiences list: nothing could be shared ("read what Amazon actually
 * asked me"), nothing could be indexed, and every write-up competed for the
 * same generic title. This is the page that lets a single drive's story rank
 * for the search that actually gets typed — "<company> interview experience".
 *
 * WHY IT IS A SERVER COMPONENT
 *
 * Every other page in this app is a client component that reads through
 * /api/experiences, which requires a session — so a crawler saw a shell. This
 * one renders the write-up into the HTML, and carries its own title,
 * description, canonical, Open Graph card and Article JSON-LD via
 * generateMetadata + <script type="application/ld+json">.
 *
 * Data comes from the same service-role client the landing page uses (see
 * getAdmin there): these rows are public by definition — the whole point is
 * that they are read — and RLS is not involved in a read that nobody owns.
 */

/** Same shape the list API returns, minus the vote/join fields. */
interface ExperienceRow {
  id: string
  user_id: string | null
  title: string | null
  experience: string
  role: string | null
  round_count: number | null
  result: string | null
  difficulty: string | null
  rating: number | null
  tips: string | null
  offer_salary: string | null
  created_at: string
  updated_at: string | null
  review_status: 'pending_review' | 'approved' | 'rejected'
  /** Present only on a seeded lead — the page always credits it. */
  source_url: string | null
  source_platform: string | null
  source_credit: string | null
  companies: { name: string; slug: string; logo_url: string | null } | null
}

interface AuthorRow {
  full_name: string | null
  username: string | null
  avatar_url: string | null
  /** PostgREST answers a to-one relation as a one-element ARRAY. */
  campuses: { name: string }[] | null
}

/** Ten minutes: a write-up is read far more often than it is written, and a
 *  new one must not wait for the next deploy to become visible. */
export const revalidate = 600

/**
 * Structured data needs ABSOLUTE urls: Google's validator drops `url`, `item`
 * and `@id` that are relative, which silently costs the breadcrumb and the
 * canonical in the rich result.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

async function getExperience(id: string): Promise<{ experience: ExperienceRow; author: AuthorRow | null } | null> {
  const db = getAdmin()
  // Not a UUID → PostgREST would answer with an error, which must read as a
  // 404 rather than a 500.
  if (!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null

  try {
    const { data } = await db
      .from('interview_experiences')
      .select('*, companies(name, slug, logo_url)')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    // Only an APPROVED write-up is public (see 20261113). Anything else must
    // 404 rather than render: a page a visitor can not read is a page Google
    // must not index, and rendering it here would also put unmoderated text
    // into a cached snippet.
    if (data.review_status !== 'approved') return null

    // Author in a second query on purpose: interview_experiences.user_id
    // references auth.users(id), so PostgREST cannot embed profiles across it
    // (that mistake 500'd the list API once — see /api/experiences).
    let author: AuthorRow | null = null
    if (data.user_id) {
      const { data: profile } = await db
        .from('profiles')
        .select('full_name, username, avatar_url, campuses(name)')
        .eq('id', data.user_id)
        .maybeSingle()
      author = (profile as AuthorRow) ?? null
    }

    return { experience: data as ExperienceRow, author }
  } catch {
    return null
  }
}

/** The headline Google shows: company first, role when we have it. */
function headlineFor(exp: ExperienceRow): string {
  const company = exp.companies?.name || 'Campus'
  if (exp.title?.trim()) return exp.title.trim()
  return exp.role ? `${company} interview experience — ${exp.role}` : `${company} interview experience`
}

/**
 * The <title> Google prints. It is NOT `headlineFor` alone: the author's own
 * headline is often "SDE Interview", which names neither the company nor the
 * product and so competes with nothing. Company first, then role, then the
 * round count — that is the shape of the query ("amazon interview experience,
 * sde, how many rounds").
 */
function seoTitleFor(exp: ExperienceRow): string {
  const company = exp.companies?.name || 'Campus'
  const role = exp.role?.trim()
  const rounds = exp.round_count ? `, ${exp.round_count} rounds` : ''
  return `${company} interview experience${role ? ` — ${role}` : ''}${rounds}`
}

function summaryFor(exp: ExperienceRow): string {
  const company = exp.companies?.name || 'a company'
  const role = exp.role ? ` for ${exp.role}` : ''
  const bits = [
    `Real ${company} interview experience${role}, written round by round by a student who sat the drive.`,
    exp.round_count ? `${exp.round_count} rounds.` : null,
    exp.difficulty ? `Difficulty: ${exp.difficulty}.` : null,
    exp.result ? `Result: ${exp.result}.` : null,
  ].filter(Boolean)
  return bits.join(' ').slice(0, 300)
}

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const found = await getExperience(id)
  if (!found) return { title: 'Experience not found' }

  const { experience: exp } = found
  const description = summaryFor(exp)
  // The brand suffix is written out because /experiences/layout.tsx declares a
  // plain-string title, which stops Next from applying the root template to
  // this segment's children (verified in the rendered HTML: no suffix).
  const title = `${seoTitleFor(exp)} · ConnectToCampus`

  return {
    title,
    description,
    alternates: { canonical: `/experiences/${id}` },
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/experiences/${id}`,
      siteName: 'ConnectToCampus',
      locale: 'en_IN',
      publishedTime: exp.created_at,
      modifiedTime: exp.updated_at ?? exp.created_at,
      // A child's `openGraph` REPLACES the root layout's, images included —
      // without this line every shared write-up previewed with no picture.
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  }
}

const RESULT_LABEL: Record<string, string> = {
  selected: 'Selected',
  rejected: 'Not selected',
  ongoing: 'In progress',
}

export default async function ExperienceDetailPage({ params }: PageProps) {
  const { id } = await params
  const found = await getExperience(id)
  if (!found) notFound()

  const { experience: exp, author } = found
  const company = exp.companies?.name || 'Campus'
  const authorName = author?.full_name?.trim() || author?.username?.trim() || 'Anonymous student'
  const campus = author?.campuses?.[0]?.name || null
  const published = new Date(exp.created_at)
  const dateText = published.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const canonical = `${APP_URL}/experiences/${id}`
  const companyHref = exp.companies?.slug ? `${APP_URL}/companies/${exp.companies.slug}` : `${APP_URL}/companies`

  const breadcrumbTrail = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${APP_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Companies', item: `${APP_URL}/companies` },
    ...(exp.companies?.slug ? [{ '@type': 'ListItem', position: 3, name: company, item: companyHref }] : []),
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: headlineFor(exp),
    description: summaryFor(exp),
    // Article rich results want an image; without one Google falls back to a
    // bare blue link. The site card is the honest default (it is not a photo
    // of an interview we do not have).
    image: [`${APP_URL}/og.png`],
    datePublished: exp.created_at,
    dateModified: exp.updated_at ?? exp.created_at,
    inLanguage: 'en-IN',
    url: canonical,
    author: { '@type': 'Person', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: 'ConnectToCampus',
      logo: { '@type': 'ImageObject', url: `${APP_URL}/icon-512.png`, width: 512, height: 512 },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    about: { '@type': 'Organization', name: company, url: companyHref },
    // Home › Companies › <Company> › this write-up, so the company page shows
    // in the URL path Google prints under the result.
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        ...breadcrumbTrail,
        {
          '@type': 'ListItem',
          position: breadcrumbTrail.length + 1,
          name: headlineFor(exp),
          item: canonical,
        },
      ],
    },
  }

  return (
    <div className="hc-page">
      {/* Crawlers read JSON-LD; the markup below is what a student reads. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="hc-page-head">
        <Link href="/experiences" className="hc-back" aria-label="Back to all experiences">
          <Icon name="chevron" size={16} strokeWidth={2.2} style={{ transform: 'rotate(180deg)' }} />
        </Link>
        <span className="hc-eyebrow">
          Interview experience ·{' '}
          {/* Internal link to the company hub: it is the page built for
              "<company> interview experience", and a crawler only finds it if
              something he can follow points at it. */}
          {exp.companies?.slug ? (
            <Link href={`/companies/${exp.companies.slug}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
              {company}
            </Link>
          ) : (
            company
          )}
        </span>
        <h1 className="hc-h1">
          {headlineFor(exp)}
          <em className="hc-em">, round by round.</em>
        </h1>
        <p className="hc-lede">
          By {authorName}
          {campus ? ` · ${campus}` : ''} · {dateText}
        </p>
      </div>

      {/* Facts strip — the four things a scanner looks for before reading. */}
      <div className="hc-tags" style={{ margin: '0 0 18px', flexWrap: 'wrap' }}>
        {exp.difficulty && <span className="hc-tag">{exp.difficulty}</span>}
        {exp.result && RESULT_LABEL[exp.result] && <span className="hc-tag">{RESULT_LABEL[exp.result]}</span>}
        {exp.round_count ? <span className="hc-tag">{exp.round_count} rounds</span> : null}
        {exp.rating ? <span className="hc-tag hc-tag--warn">{exp.rating}/5</span> : null}
        {exp.offer_salary && <span className="hc-tag hc-tag--ghost">{exp.offer_salary}</span>}
      </div>

      <article className="hc-card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: 15 }}>
        {exp.experience}
      </article>

      {/* A seeded write-up is a summary of something somebody posted elsewhere.
          Crediting the original is both the honest thing to do and the correct
          SEO move for a page built from a source: rel="nofollow" because we are
          pointing at it, not vouching for it. */}
      {exp.source_url && (
        <p className="hc-note" style={{ marginTop: 14 }}>
          Originally reported on {exp.source_platform || 'the source page'} —{' '}
          <a
            href={exp.source_url}
            target="_blank"
            rel="nofollow noopener noreferrer"
            style={{ textDecoration: 'underline' }}
          >
            read the full account there
          </a>
          {exp.source_credit ? `. Credit: ${exp.source_credit}.` : '.'}
        </p>
      )}

      {exp.tips?.trim() && (
        <section className="hc-card" style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>Tips from this drive</h2>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {exp.tips}
          </p>
        </section>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 40px' }}>
        <Link href="/experiences" className="hc-btn hc-btn--primary">
          Read more experiences
        </Link>
        <Link href="/experiences" className="hc-btn">
          Share yours
        </Link>
        {exp.companies?.slug && (
          <Link href={`/companies/${exp.companies.slug}`} className="hc-btn">
            More {company} experiences
          </Link>
        )}
      </div>
    </div>
  )
}
