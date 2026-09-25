import FeedView from '@/components/feed/FeedView'

/**
 * `/feed` — direct/legacy link to the Home feed.
 *
 * The homepage now lives at `/` (same FeedView component), but old links,
 * bookmarks and the sidebar's Home entry all target /feed, so this route
 * stays alive and renders the identical UI with zero duplication.
 */
export default function FeedPage() {
  return <FeedView />
}
