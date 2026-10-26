import type { Metadata } from 'next'
import Link from 'next/link'
import PublicNav from '@/components/marketing/PublicNav'
import PublicFooter from '@/components/marketing/PublicFooter'
import { getCompaniesWithExperiences } from '@/lib/publicExperiences'

/**
 * `/companies` — the directory, by company.
 *
 * The query a student actually types is "<company> interview experience", so the
 * company is the entrance to the directory, not an afterthought on a card.
 *
 * Honesty rules, same as everywhere else on this site:
 *   • A company appears here only when it has at least one APPROVED write-up.
 *     No logo wall of companies nobody has written about — those pages would be
 *     thin, and the sitemap must not carry them.
 *   • The logo comes from the companies table; when there is none, the initial
 *     is drawn instead of borrowing a brand asset we do not have.
 */

export const revalidate = 600

/** Absolute urls in structured data — relative `url` / `item` are dropped by
 *  Google's validator, which costs the entry its link in the rich result. */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.connecttocampus.com').replace(/\/$/, '')

export const metadata: Metadata = {
  title: 'Interview experiences by company',
  description:
    'Browse real interview experiences company by company — Amazon, Microsoft, Google, Flipkart, Uber and more — written round by round by students who sat the drive.',
  alternates: { canonical: '/companies' },
  openGraph: {
    type: 'website',
    title: 'Interview experiences by company · ConnectToCampus',
    description: 'Every company with a write-up on ConnectToCampus, and the rounds students actually faced there.',
    url: '/companies',
    siteName: 'ConnectToCampus',
    locale: 'en_IN',
    // Set explicitly: a page-level `openGraph` replaces the root one wholesale,
    // so leaving images out here would ship a share card with no picture.
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Interview experiences by company · ConnectToCampus',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Interview experiences by company · ConnectToCampus',
    description: 'Every company with a write-up on ConnectToCampus, and the rounds students actually faced there.',
    images: ['/og.png'],
  },
}

export default async function CompaniesPage() {
  const companies = await getCompaniesWithExperiences()
  const total = companies.reduce((n, c) => n + c.count, 0)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Interview experiences by company',
    description:
      'Every company with an approved interview write-up on ConnectToCampus, and the rounds students faced there.',
    url: `${APP_URL}/companies`,
    inLanguage: 'en-IN',
    isPartOf: { '@type': 'WebSite', name: 'ConnectToCampus', url: APP_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${APP_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Companies', item: `${APP_URL}/companies` },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: companies.length,
      itemListElement: companies.map((company, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${APP_URL}/companies/${company.slug}`,
        name: `${company.name} interview experiences`,
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
          <span className="hc-eyebrow">Directory</span>
          <h1 className="hc-h1">
            Interview experiences, <em className="hc-em">company by company.</em>
          </h1>
          <p className="hc-lede">
            {companies.length > 0
              ? `${total} approved ${total === 1 ? 'write-up' : 'write-ups'} across ${companies.length} ${
                  companies.length === 1 ? 'company' : 'companies'
                }.`
              : 'Every account here is one student’s own experience of their own drive — never the company’s official process.'}
          </p>
        </div>

        {companies.length === 0 ? (
          <div className="hc-empty">
            <p className="hc-empty-t">No company pages yet</p>
            <p className="hc-empty-s">
              A company gets a page as soon as one write-up for it is approved. Read the{' '}
              <Link href="/experiences">interview experiences</Link> or share your own.
            </p>
          </div>
        ) : (
          <div className="hc-grid">
            {companies.map((company) => (
              <Link
                key={company.slug}
                href={`/companies/${company.slug}`}
                className="hc-card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      style={{ borderRadius: 10, objectFit: 'contain', background: 'var(--bg-secondary)' }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        background: 'var(--accent-light)',
                        color: 'var(--accent-text)',
                      }}
                    >
                      {company.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <h2 className="hc-title" style={{ margin: 0 }}>
                      {company.name}
                    </h2>
                    <p className="hc-sub" style={{ margin: 0 }}>
                      {company.count} {company.count === 1 ? 'interview experience' : 'interview experiences'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* The directory is one entrance to the write-ups; the list is the
            other. Linking both ways is what keeps either one crawlable. */}
        <p className="hc-note" style={{ marginTop: 22 }}>
          Looking for the write-ups themselves, newest first?{' '}
          <Link href="/experiences" style={{ textDecoration: 'underline' }}>
            Read all interview experiences
          </Link>
          .
        </p>
      </main>

      <PublicFooter />
    </div>
  )
}
