import HireLanding from '@/components/marketing/HireLanding'

/**
 * `/` — the recruiter-first landing (V4 pivot to campus hiring).
 *
 * The public home now sells the business: hire pre-vetted tier-2/3 engineers,
 * first batch of 10 free. The old social/voice "room discovery" home is retired
 * (the component still ships on disk; see src/lib/featureGates.ts).
 */
export default function Home() {
  return <HireLanding />
}
