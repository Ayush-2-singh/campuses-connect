import FeedView from '@/components/feed/FeedView'

/**
 * `/` — the default homepage.
 *
 * Renders the SAME Feed UI as `/feed` (spec: the product IS the homepage —
 * no marketing wall, no redirect). Opening connecttocampus.com shows the
 * Feed while the address bar stays clean at `/`.
 *
 * Both routes share the single FeedView component, so auth, layout and
 * behavior are identical; there is no redirect and no duplicated code.
 */
export default function Home() {
  return <FeedView />
}
