import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compete — DSA Challenges, Contests & Campus Rankings',
  description:
    'Solve daily DSA challenges, join weekly contests, climb the leaderboard and clash with other campuses. Track your Easy/Medium/Hard progress.',
  alternates: { canonical: '/compete' },
}

export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  return children
}
