import type { Metadata } from 'next'

/** The sign-up page: a real (own) title for the tab, still noindex. */
export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a free ConnectToCampus account to read round-by-round interview experiences, join live study rooms and practise the questions they asked.',
  alternates: { canonical: '/auth/signup' },
  robots: { index: false, follow: true },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
