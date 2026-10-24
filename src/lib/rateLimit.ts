import { createHash } from 'node:crypto'
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

/**
 * ipToKey — a stable UUID for an IP address.
 *
 * `check_rate_limit` is keyed by uuid (migration 043), which is right for a
 * signed-in caller. Anonymous endpoints still need a bucket, and they have no
 * user id, so the IP is hashed into a deterministic UUID: same address, same
 * bucket, no PII stored (the raw IP never reaches the database).
 */
export function ipToKey(ip: string): string {
  const h = createHash('sha256')
    .update(ip || 'unknown')
    .digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for') || ''
  const first = fwd.split(',')[0]?.trim()
  return first || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || 'unknown'
}

/**
 * checkRateLimitByIp — the anonymous counterpart of checkRateLimit.
 *
 * Used by public read endpoints that spend a third-party quota (the external
 * job feed). Same Postgres-backed limiter, same fail-open behaviour.
 */
export async function checkRateLimitByIp(
  headers: Headers,
  endpoint: string,
  limit: number,
  windowMinutes: number = 60
): Promise<boolean> {
  return checkRateLimit(ipToKey(clientIpFrom(headers)), endpoint, limit, windowMinutes)
}
