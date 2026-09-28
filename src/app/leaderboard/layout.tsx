import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leaderboard — Top Students by Karma, GitHub & LeetCode',
  description:
    'Weekly and all-time rankings combining karma, GitHub contributions, LeetCode progress and contest ratings. See which campus dominates.',
  alternates: { canonical: '/leaderboard' },
}

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
