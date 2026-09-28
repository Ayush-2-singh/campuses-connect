import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Events & Hackathons — Workshops, Fests & Meets',
  description:
    'Discover campus events, workshops, seminars and hackathons across Indian colleges. RSVP, set reminders and never miss a deadline.',
  alternates: { canonical: '/events' },
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children
}
