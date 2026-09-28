import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Companies — Recruiter Profiles for CS Students',
  description:
    'Profiles for Google, Microsoft, Amazon, and top Indian startups hiring CS students — roles, interview experiences and application tracking in one place.',
  alternates: { canonical: '/companies' },
}

export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return children
}
