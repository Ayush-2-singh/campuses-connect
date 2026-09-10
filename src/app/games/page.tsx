import { redirect } from 'next/navigation'

// Games now live inside the Compete section (/compete?tab=clash) — this
// standalone page redirects so old links and bookmarks keep working.
export default function GamesPage() {
  redirect('/compete?tab=clash')
}
