import type { Metadata } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ExperiencesApp from './ExperiencesApp'

/**
 * `/experiences` — the public interview directory.
 *
 * WHY THIS IS A SERVER ROUTE AGAIN
 *
 * The list used to be fetched in the browser through /api/experiences, which
 * requires a session. A crawler (and a signed-out visitor on a slow phone) got
 * an empty shell and the "No experiences yet" empty state, so the one page this
 * product is named after had nothing indexable on it. The approved rows are now
 * read here, rendered into the HTML and handed to the interactive client as its
 * starting state — the same cards, links and copy, but present before any
 * JavaScript runs.
 *
 * Only `review_status = 'approved'` rows are public (see 20261113), and seeded
 * research leads stay out until a human approves them.
 */

export const revalidate = 600

type PublicExperience = {
  id: string
  title: string | null
  experience: string
  role: string | null
  created_at: string
  companies: { name: string; slug: string; logo_url: string | null } | null
}

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

async function getApprovedExperiences(): Promise<PublicExperience[]> {
  const db = getAdmin()
  if (!db) return []
  try {
    const { data } = await db
      .from('interview_experiences')
      .select('id, title, experience, role, created_at, companies(name, slug, logo_url)')
      .eq('review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(30)
    // PostgREST answers a to-one embed as an ARRAY, so normalise it here rather
    // than making every caller remember.
    type Row = Omit<PublicExperience, 'title' | 'companies'> & {
      title: string | null
      companies: PublicExperience['companies'] | NonNullable<PublicExperience['companies']>[] | null
    }
    return ((data ?? []) as unknown as Row[])
      .filter((row) => Boolean(row?.id && row?.title))
      .map((row) => ({
        ...row,
        title: String(row.title),
        companies: Array.isArray(row.companies) ? (row.companies[0] ?? null) : row.companies,
      }))
  } catch {
    return []
  }
}

export const metadata: Metadata = {
  alternates: { canonical: '/experiences' },
}

export default async function ExperiencesRoute() {
  const experiences = await getApprovedExperiences()

  // CollectionPage + ItemList: the list itself is the thing that ranks for
  // "interview experiences", so it says so in a shape a crawler understands.
  // Only the rows actually on the page are listed — no invented entries.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Interview experiences — ConnectToCampus',
    description:
      'Round-by-round interview experiences written by students who sat the drive, with the company, role and questions they faced.',
    inLanguage: 'en-IN',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: experiences.length,
      itemListElement: experiences.map((exp, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `/experiences/${exp.id}`,
        name: exp.title,
      })),
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <ExperiencesApp initialExperiences={experiences} />
    </>
  )
}
