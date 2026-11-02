import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description:
    'The rules for using ConnectToCampus — student accounts, profiles, interview experiences, study rooms, Compete and Live Battle, acceptable use and disclaimers.',
  alternates: { canonical: '/terms' },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
