import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Games — Typing Battle & Quick Math',
  description:
    'Real-time multiplayer games for students — race up to 8 students in Typing Battle or duel a classmate in Quick Math.',
  alternates: { canonical: '/games' },
}

export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return children
}
