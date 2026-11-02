import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ConnectToCampus collects, uses and protects student data — profiles, interview experiences, study rooms, Compete and Live Battle results, and your privacy controls.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children
}
