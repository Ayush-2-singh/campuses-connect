import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Games — Typing Battle & Quick Math',
  description:
    'Real-time 1v1 games for students — race a classmate in Typing Battle or Quick Math. No esports, just quick games.',
  alternates: { canonical: '/games' },
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children
}
