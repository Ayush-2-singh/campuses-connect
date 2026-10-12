import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description:
    'The rules for using ConnectToCampus — student accounts, assessments, company and recruiter obligations, fees, acceptable use and disclaimers.',
  alternates: { canonical: '/terms' },
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
