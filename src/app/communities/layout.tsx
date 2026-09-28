import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Communities — DSA, Web Dev, Startups, AI/ML & Design',
  description:
    'Join student communities by interest — DSA, web development, startups, AI/ML and design. Ask doubts, share knowledge and grow together.',
  alternates: { canonical: '/communities' },
}

export default function CommunitiesLayout({ children }: { children: React.ReactNode }) {
  return children
}
