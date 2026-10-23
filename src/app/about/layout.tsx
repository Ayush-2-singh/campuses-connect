import type { Metadata } from 'next'

/**
 * `/about` is a client component (it does a live campus read), so it cannot
 * export its own `metadata`. This layout gives the page the title and summary
 * it needs in search results, instead of falling back to the site-wide ones.
 */
export const metadata: Metadata = {
  title: 'About',
  description:
    'What ConnectToCampus is: round-by-round interview experiences from Indian campuses, the companies behind them, and the practice that goes with them.',
  alternates: { canonical: '/about' },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
