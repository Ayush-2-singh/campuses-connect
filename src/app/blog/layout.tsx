import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog — Interview Experiences, Tech & Campus Stories',
  description:
    'Interview experiences at top companies, tech deep-dives, how-to guides and campus stories — written by students, for students.',
  alternates: { canonical: '/blog' },
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children
}
