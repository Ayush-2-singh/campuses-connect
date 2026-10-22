import { redirect } from 'next/navigation'

/**
 * Opportunities → Communities.
 *
 * The Opportunity page was retired along with the Discovery section.
 * This route stays alive so old links, bookmarks and deep links land
 * somewhere useful instead of 404ing.
 */
export default async function OpportunitiesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  void searchParams
  redirect('/communities')
}
