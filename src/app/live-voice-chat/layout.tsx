import type { Metadata } from 'next'

/**
 * STUDENT GROUPS — the route where a student CREATES their own group: a live
 * voice room filed under a topic (DSA, Web Dev, English practice, …), campus
 * or global, optionally locked, and classmates join it. "Anyone can create a
 * group" is the whole pitch, so it is the phrasing the title leads with.
 *
 * The page itself is a client component, so it cannot export `metadata` —
 * without this layout the whole branch inherited the root title and a crawler
 * could not tell the groups route from the experiences one.
 */
export const metadata: Metadata = {
  title: 'Create Your Own Student Group — Live Voice Chat Rooms',
  description:
    'Anyone can create a group in seconds: a free study room for DSA doubts, Web Dev, English practice or your whole campus — lock it if you want it private, classmates join in one tap. Grow together.',
  alternates: { canonical: '/live-voice-chat' },
}

export default function LiveVoiceChatLayout({ children }: { children: React.ReactNode }) {
  return children
}
