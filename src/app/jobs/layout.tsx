import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jobs & Internships — Internships, PPOs & Full-time Roles',
  description:
    'Curated internships, full-time roles and PPOs for Indian CS students. Apply directly, track applications and follow companies for new openings.',
  alternates: { canonical: '/jobs' },
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
