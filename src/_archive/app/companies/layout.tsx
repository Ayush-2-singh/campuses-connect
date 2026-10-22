import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Companies — future & assisting partners',
  // No hiring claim: the directory is an onboarding list, so the snippet says so
  // rather than advertising roles that do not exist yet.
  description:
    'The real companies ConnectToCampus is onboarding — Google, Microsoft, Amazon and Indian startups. Each card shows whether a company posts roles here, has shared interview experiences, or is still a future partner.',
  alternates: { canonical: '/companies' },
}

export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return children
}
