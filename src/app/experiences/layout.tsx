import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Interview Experiences — Verified Student Reviews',
  description:
    'Real interview experiences with tips, difficulty ratings and round breakdowns — shared by students placed at top companies.',
  alternates: { canonical: '/experiences' },
}

export default function ExperiencesLayout({ children }: { children: React.ReactNode }) {
  return children
}
