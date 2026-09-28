import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "About — India's Campus Community for CS Students",
  description:
    'ConnectToCampus brings notes, PYQs, hackathons, internships, DSA practice and campus networking together — free for every Computer Science student in India.',
  alternates: { canonical: '/about' },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
