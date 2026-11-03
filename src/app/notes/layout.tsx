import type { Metadata } from 'next'

/**
 * ROUTE METADATA — title/description for a 'use client' page.
 * Client pages can't export metadata, so each public section gets one of
 * these tiny server layouts. Keep them in sync with the page's real content.
 */
export const metadata: Metadata = {
  title: 'Notes Library — PYQs, Study Material & Resources',
  description:
    'Browse subject-wise notes, previous year questions (PYQs) and study material shared by students across Indian colleges. Free for every CS student.',
  alternates: { canonical: '/notes' },
}

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return children
}
