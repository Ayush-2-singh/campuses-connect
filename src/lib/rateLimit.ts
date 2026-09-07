import { createClient } from '@/lib/supabase/server'

/**
 * Postgres-backed rate limiter using the `check_rate_limit` RPC
 * (rate_limits table — migration 043). Consistent across every Vercel
 * instance, so a 10k-user load can't bypass limits by hitting different
 * servers (the old in-memory Map reset per instance and was bypassable).
 *
 * Fail-open: if the RPC/DB errors, we allow the request and log, so a
 * transient DB issue never locks users out of uploads/submissions.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowMinutes: number = 60
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_limit: limit,
    p_window_minutes: windowMinutes,
  })
  if (error) {
    console.error(`rate-limit error (${endpoint}):`, error.message)
    return true
  }
  return data !== false
}
