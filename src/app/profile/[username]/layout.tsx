import type { Metadata } from 'next'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * PROFILE METADATA — what a shared profile link looks like.
 *
 * /profile/[username] is a client page, so without this every shared link
 * announced itself as "ConnectToCampus — Interview Experiences…" with no
 * avatar: the person's name, handle and headline are what a link preview is
 * FOR. A server layout over the route supplies them (plus a canonical and an
 * Open Graph `profile` card) without touching the page.
 *
 * NOTE ON INDEXING: robots.txt already disallows /profile, deliberately — these
 * pages are for humans who were sent the link, not for search. So this is
 * metadata for a preview, not a ranking play, and there is NO notFound() here:
 * deciding whether a profile may be seen is the client page's job (owners see
 * their own, the rest get its "not available" state), and a server 404 would
 * contradict that rule from a service-role read that bypasses RLS.
 */

interface ProfileRow {
  full_name: string | null
  username: string | null
  headline: string | null
  bio: string | null
  avatar_url: string | null
  campuses: { name: string }[] | null
}

/** Fresh enough for a profile: a new headline must not wait for a deploy. */
export const revalidate = 300

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}

async function getProfile(username: string): Promise<ProfileRow | null> {
  const db = getAdmin()
  // Handles are hand-written; anything that cannot be one is a miss, not a
  // query that PostgREST will answer with an error.
  if (!db || !username || !/^[a-zA-Z0-9._-]{1,40}$/.test(username)) return null
  try {
    const { data } = await db
      .from('profiles')
      // Only the fields a preview may show — never `*`: a profile row carries
      // flags and ids that have no business in a share card.
      .select('full_name, username, headline, bio, avatar_url, campuses(name)')
      .eq('username', username)
      .maybeSingle()
    return (data as ProfileRow | null) ?? null
  } catch {
    return null
  }
}

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfile(username)

  const name = profile?.full_name?.trim() || `@${username}`
  const title = `${name} (@${username}) · ConnectToCampus`
  const campus = profile?.campuses?.[0]?.name || null
  const description =
    profile?.headline?.trim() ||
    profile?.bio?.replace(/\s+/g, ' ').trim().slice(0, 155) ||
    (campus
      ? `${name} — ${campus} student on ConnectToCampus.`
      : `${name} on ConnectToCampus — interview experiences, practice and student groups.`)

  return {
    title,
    description,
    alternates: { canonical: `/profile/${username}` },
    // Never indexed (see the note above): the point is a correct preview.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `/profile/${username}`,
      siteName: 'ConnectToCampus',
      locale: 'en_IN',
      firstName: profile?.full_name?.split(' ')[0] || username,
      username: profile?.username || username,
      images: profile?.avatar_url ? [{ url: profile.avatar_url }] : undefined,
    },
    twitter: {
      card: profile?.avatar_url ? 'summary' : 'summary',
      title,
      description,
      images: profile?.avatar_url ? [profile.avatar_url] : undefined,
    },
  }
}

export default function ProfileUsernameLayout({ children }: { children: React.ReactNode }) {
  return children
}
