import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PublicNav from '@/components/marketing/PublicNav'
import PublicFooter from '@/components/marketing/PublicFooter'
import { getApprovedExperiences, getCompaniesWithExperiences } from '@/lib/publicExperiences'

/**
 * `/companies/[slug]` — every approved write-up for one company.
 *
 * This is the page that answers the exact search "amazon interview experience":
 * one company, its rounds, and the roles students interviewed for. It is built
 * from approved rows only, so it can never show a pending or seeded lead as if
 * it were published.
 *
 * A company with no approved write-up has no page at all (404) — an empty page
 * with a logo on it is a thin page, and the directory refuses to generate them.
 */

export const revalidate = 600

/** Absolute urls in structured data — see /companies. */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

type PageProps = { params: Promise<{ slug: string }> }

async function getCompany(slug: string) {
  // The approved rows are the source of truth for "does this company have a
  // page" — the same query the directory uses, so the two can never disagree.
  const companies = await getCompaniesWithExperiences()
  const company = companies.find((c) => c.slug === slug)
  if (!company) return null
  const experiences = await getApprovedExperiences({ companySlug: slug, limit: 50 })
  return { company, experiences }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const found = await getCompany(slug)
  if (!found) return { title: 'Company not found', robots: { index: false, follow: false } }

  const { company, experiences } = found
  const roles = [...new Set(experiences.map((e) => e.role).filter(Boolean))].slice(0, 4) as string[]
  const description = `${
    company.count
  } real ${company.name} interview ${company.count === 1 ? 'experience' : 'experiences'} shared by students${
    roles.length ? ` (${roles.join(', ')})` : ''
  } — the rounds they faced, written round by round.`

  return {
    title: `${company.name} interview experience`,
    description,
    alternates: { canonical: `/companies/${company.slug}` },
    openGraph: {
      type: 'website',
      title: `${company.name} interview experience · ConnectToCampus`,
      description,
      url: `/companies/${company.slug}`,
      siteName: 'ConnectToCampus',
      locale: 'en_IN',
      // A page-level `openGraph` replaces the root one, images included.
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: `${company.name} interview experience · ConnectToCampus`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${company.name} interview experience · ConnectToCampus`,
      description,
      images: ['/og.png'],
    },
  }
}

export default async function CompanyPage({ params }: PageProps) {
  const { slug } = await params
  const found = await getCompany(slug)
  if (!found) notFound()

  const { company, experiences } = found

  const canonical = `${APP_URL}/companies/${company.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${company.name} interview experiences`,
    description: `Real ${company.name} interview experiences shared by students — the rounds they faced, written round by round.`,
    url: canonical,
    inLanguage: 'en-IN',
    isPartOf: { '@type': 'WebSite', name: 'ConnectToCampus', url: APP_URL },
    about: { '@type': 'Organization', name: company.name },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${APP_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Companies', item: `${APP_URL}/companies` },
        { '@type': 'ListItem', position: 3, name: company.name, item: canonical },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: experiences.length,
      itemListElement: experiences.map((exp, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${APP_URL}/experiences/${exp.id}`,
        name: exp.title,
      })),
    },
  }

  return (
    <div className="hl-page">
      <PublicNav />

      <main className="hc-page">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />

        <div className="hc-page-head">
          <Link href="/companies" className="hc-eyebrow" style={{ textDecoration: 'none' }}>
            ← All companies
          </Link>
          <h1 className="hc-h1">
            {company.name} <em className="hc-em">interview experiences.</em>
          </h1>
          <p className="hc-lede">
            {company.count} {company.count === 1 ? 'write-up' : 'write-ups'} from students who sat the drive. Each one
            is a personal account, not {company.name}’s official process.
          </p>
        </div>

        <div className="hc-grid hc-grid--list">
          {experiences.map((exp) => (
            <article key={exp.id} className="hc-card">
              <h3 className="hc-title">
                <Link href={`/experiences/${exp.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {exp.title}
                </Link>
              </h3>
              <p className="hc-sub">
                {exp.role || 'Role not stated'} · {new Date(exp.created_at).toLocaleDateString('en-IN')}
              </p>
              <p className="hc-body">{exp.experience.slice(0, 220)}</p>

              <div className="hc-foot">
                <Link href={`/experiences/${exp.id}`} className="hc-chip">
                  Read the full round-by-round account
                </Link>
                {/* A seeded write-up always points back at the source it came
                    from. rel="nofollow" because we are crediting, not vouching. */}
                {exp.source_url && (
                  <a
                    className="hc-meta"
                    href={exp.source_url}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    style={{ textDecoration: 'underline' }}
                  >
                    Original source
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* Back up to the newest-first list, so the company hub is not a dead
            end for a reader — or for a crawler. */}
        <p className="hc-note" style={{ marginTop: 22 }}>
          <Link href="/experiences" style={{ textDecoration: 'underline' }}>
            Read every interview experience, newest first
          </Link>
          {' · '}
          <Link href="/companies" style={{ textDecoration: 'underline' }}>
            Browse another company
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  )
}
