import type { Metadata } from 'next'

/**
 * STUDENT GROUPS — the route where a student CREATES their own group: a live
 * voice room filed under a topic (DSA, Web Dev, English practice, …), campus
 * or global, optionally locked, and classmates join it.
 *
 * The page itself is a client component, so it cannot export `metadata` —
 * without this layout the whole branch inherited the root title and a crawler
 * could not tell the groups route from the experiences one.
 */
export const metadata: Metadata = {
  title: 'Create or Join a Student Group — Live Voice Chat',
  description:
    'Create your own student group — a live voice room for DSA doubts, Web Dev, English practice or your whole campus — and let classmates join. Peer learning for CSE & SDE aspirants, grow together.',
  alternates: { canonical: '/live-voice-chat' },
}

export default function LiveVoiceChatLayout({ children }: { children: React.ReactNode }) {
  return children
}
