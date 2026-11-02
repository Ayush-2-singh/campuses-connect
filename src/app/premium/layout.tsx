import type { Metadata } from 'next'

/**
 * `/premium` — kept as a shareable "everything is free" page, but not indexed.
 *
 * It had no metadata, so it published the root layout's title, description and
 * canonical: Google read it as a duplicate of the homepage built out of a
 * feature grid. There is no premium product and nothing to rank for here, so
 * it gets its own title and a noindex instead of competing with `/`.
 */
export const metadata: Metadata = {
  title: 'Free for students',
  description:
    'Every ConnectToCampus feature is free for students: interview experiences, study rooms and timed practice.',
  // Own canonical: without it the root layout's homepage canonical stayed on
  // the page, which told Google "this is /" while the tag said "do not index".
  alternates: { canonical: '/premium' },
  robots: { index: false, follow: true },
}

export default function PremiumLayout({ children }: { children: React.ReactNode }) {
  return children
}
