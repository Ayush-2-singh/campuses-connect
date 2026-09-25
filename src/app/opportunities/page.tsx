import { redirect } from 'next/navigation'

/**
 * Opportunities → Discovery (spec STEP 19).
 *
 * The Opportunity page was retired when Discovery became the app's
 * idea/builder discovery layer. This route stays alive so old links,
 * bookmarks and deep links land on Discovery instead of 404ing.
 * The legacy opportunities REST API is untouched — the Global page still
 * reads internship cards from it.
 */
export default async function OpportunitiesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = params.type ?? params.opp_type
  const type = Array.isArray(raw) ? raw[0] : raw

  // Known discovery categories map onto tabs; everything else (internship,
  // jobs, …) falls back to the For You queue.
  const known = ['startup', 'project', 'hackathon', 'collab']
  redirect(type && known.includes(type) ? `/discover?tab=${type}` : '/discover')
}
