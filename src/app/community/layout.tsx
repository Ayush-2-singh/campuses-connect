import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Community — Confessions, Live Chat & Games',
  description:
    'Anonymous confessions, live chat rooms, games and campus polls — the social side of your college, all in one place.',
  alternates: { canonical: '/community' },
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return children
}
