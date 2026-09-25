import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

/**
 * Instant boot user for client pages.
 *
 * `supabase.auth.getUser()` makes a network round-trip to the Auth server on
 * EVERY page load before the page can render user-aware UI. The session is
 * already stored locally (cookie/localStorage), so we can serve it instantly
 * and let the supabase-js token auto-refresh run in the background as usual.
 *
 * - Signed-in users: real user object on the next tick (no network wait).
 * - Guests: null immediately — pages stop blocking on auth.
 * - `validate: true` (default) still confirms the token with the server in
 *   the background; pass `validate: false` for read-only boot paths.
 */
export async function getBootUser(supabase: SupabaseClient, opts: { validate?: boolean } = {}): Promise<User | null> {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user ?? null
  if (opts.validate === false || typeof window === 'undefined') return user
  // Fire-and-forget background validation — never blocks the page.
  supabase.auth.getUser().catch(() => {})
  return user
}
