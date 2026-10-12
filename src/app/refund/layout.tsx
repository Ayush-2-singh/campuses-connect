import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy',
  description:
    'How cancellations and refunds work on ConnectToCampus — free for students, and company fees tied to a hire as agreed in writing.',
  alternates: { canonical: '/refund' },
}

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return children
}
