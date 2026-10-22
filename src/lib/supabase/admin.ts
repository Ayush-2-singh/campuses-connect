import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * GUARDED SERVICE-ROLE CLIENT — for public, read-only server rendering.
 *
 * Public pages (`/`, `/colleges`, `/college/[slug]`) render proof bands from
 * real rows. They use the service role because the anon role cannot read the
 * cross-table joins those bands need (profiles × interview_experiences ×
 * companies), but the key must never reach the browser.
 *
 * Returns `null` when the environment is not configured, so a caller can omit
 * its data band instead of crashing the page — the same contract `/` already
 * follows. Never use this for a write from a public route.
 */

let _admin: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_admin) _admin = createClient(url, key, { auth: { persistSession: false } })
  return _admin
}
