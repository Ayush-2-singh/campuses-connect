import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Discovery — Startups, Projects, Hackathons & Collaboration',
  description:
    'Swipe-matched discovery for student startups, side projects, hackathon teams and collaborators. Post an idea or find people to build with.',
  alternates: { canonical: '/discover' },
}

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children
}
