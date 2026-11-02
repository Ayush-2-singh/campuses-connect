import type { Metadata } from 'next'

/**
 * AUTH SECTION — never indexed.
 *
 * These routes had no metadata at all, so they inherited the root layout's
 * homepage title, description and canonical: `/auth/login` was published to
 * Google as a duplicate of `/`, and the sitemap asked for it to be crawled.
 * Signing in is not a search result; the useful page is the one behind it.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
