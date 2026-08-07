// Lightweight in-memory sliding-window rate limiter.
// Sufficient for a single-instance Next.js deployment at campus scale.
// NOTE: on multi-instance deploys (e.g. horizontal Vercel scaling), switch to
// a shared store (Redis/Postgres) — see /api/brain routes.

const buckets = new Map<string, number[]>()

/**
 * Returns true if the caller is within the limit, false otherwise.
 * Window is a sliding window of `limit` calls per `windowMs`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now()
  const bucket = (buckets.get(key) || []).filter(t => now - t < windowMs)
  if (bucket.length >= limit) {
    buckets.set(key, bucket)
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - bucket[0])) / 1000)) }
  }
  bucket.push(now)
  buckets.set(key, bucket)
  return { ok: true }
}
