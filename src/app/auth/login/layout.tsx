import type { Metadata } from 'next'

/** The sign-in page: a real (own) title for the tab, still noindex. */
export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to ConnectToCampus to read interview experiences, join study rooms and practise timed questions.',
  alternates: { canonical: '/auth/login' },
  robots: { index: false, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
