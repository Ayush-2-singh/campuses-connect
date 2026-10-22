import type { Metadata } from 'next'
import HireLanding from '@/_archive/components/marketing/HireLanding'

export const metadata: Metadata = {
  title: 'Hire pre-vetted engineers — ConnectToCampus',
  description:
    'Get a free batch of 10 pre-screened tier-2/3 engineering students, verified by a coding assessment. Pay only when you hire.',
}

/** /hire — the dedicated recruiter storefront (also served at `/`). */
export default function HirePage() {
  return <HireLanding />
}
