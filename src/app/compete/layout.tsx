import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compete — DSA Challenges, Contests & Campus Rankings',
  description:
    'Solve daily DSA challenges, join weekly contests, climb the leaderboard and clash with other campuses. Track your Easy/Medium/Hard progress.',
  alternates: { canonical: '/compete' },
}

export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  // The whole Compete section speaks GREEN (homepage feature-card identity:
  // "green for compete"). One shell sets the accent family so every button,
  // badge, active tab, hover glow and icon tile inside inherits it — no
  // per-component hex colors.
  return <div data-accent="green">{children}</div>
}
