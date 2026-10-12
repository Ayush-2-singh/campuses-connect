/**
 * PHASE-1 FEATURE GATE — V4 pivot to campus-hiring infrastructure.
 *
 * The social / engagement layer is **retired, not deleted**. Retired page
 * routes are redirected to a kept hub so old links never dead-end, while every
 * file and table stays on disk.
 *
 * ── Reversibility ──────────────────────────────────────────────────────────
 * Set `SOCIAL_LAYER_RETIRED = false` (or delete this file + its import in
 * src/middleware.ts) to bring every feature straight back. Nothing else needs
 * to change. Migration 054 mirrors this in public.feature_flags for the admin
 * panel, but THIS const is the runtime source of truth.
 *
 * ── What is retired (social plane) ─────────────────────────────────────────
 *   /global (feed) · /community + /communities · /chat · /messages ·
 *   /connections · /groups · /live-voice-chat · /meetings · /watch · /games ·
 *   /polls · /saved · /weekly · /badges · /teams · /post/[id]
 *
 * ── What stays (hiring plane) ──────────────────────────────────────────────
 *   /jobs · /companies · /applications · /experiences · /opportunities ·
 *   /talent · /leaderboard · /compete (→ assessment engine) · /brain (→ coach)
 *   · /integrations · /profile · /campus-change · /admin · /notifications ·
 *   /reminders · /premium · /blog
 */

export const SOCIAL_LAYER_RETIRED = true

/** Where retired routes send the user — a kept, on-brand hub. */
export const FALLBACK_ROUTE = '/jobs'

/** Page-route prefixes that are part of the retired social plane. */
export const RETIRED_ROUTES = [
  '/global',
  '/community',
  '/communities',
  '/chat',
  '/messages',
  '/connections',
  '/groups',
  '/live-voice-chat',
  '/meetings',
  '/watch',
  '/games',
  '/polls',
  '/saved',
  '/weekly',
  '/badges',
  '/teams',
  '/post',
] as const

/**
 * True when `pathname` is a retired route. Matches the exact segment only, so
 * `/communities` is not caught by `/community` (and vice-versa).
 */
export function isRetiredPath(pathname: string): boolean {
  if (!SOCIAL_LAYER_RETIRED) return false
  return RETIRED_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))
}
