'use client'

/**
 * Canonical-origin guard.
 *
 * Production serves the app at https://www.connecttocampus.com (Site URL in
 * Supabase). The apex domain redirects to www at the edge, but cached pages
 * can still run on the apex origin — and an OAuth flow started there stores
 * its PKCE code-verifier in cookies scoped to THAT origin. The callback then
 * runs on www, never sees the verifier, and the code exchange fails
 * ("We could not complete Google sign-in").
 *
 * Fix: before any auth interaction, move the user to the canonical origin
 * (preserving path + query) so the whole flow — start, Google, callback —
 * happens on one origin. No-op in dev (localhost) and on www itself.
 */
export const CANONICAL_ORIGIN = 'https://www.connecttocampus.com'

export function isCanonicalOrigin(origin: string = window.location.origin): boolean {
  if (origin === CANONICAL_ORIGIN) return true
  // Local development — never redirect.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  // Vercel preview deployments — allowed origins of their own.
  if (origin.endsWith('.vercel.app')) return true
  return false
}

/**
 * If we're not on the canonical origin, redirect there with the exact
 * path + query string preserved and return true (caller should stop).
 */
export function redirectToCanonicalOrigin(): boolean {
  if (typeof window === 'undefined') return false
  if (isCanonicalOrigin()) return false
  const dest = CANONICAL_ORIGIN + window.location.pathname + window.location.search + window.location.hash
  window.location.replace(dest)
  return true
}
