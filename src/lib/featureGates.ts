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
 *   /connections · /groups · /meetings · /watch · /games ·
 *   /polls · /saved · /weekly · /badges · /teams · /post/[id]
 *
 * `/live-voice-chat` was on this list and has been RE-ENABLED: the LiveKit
 * study rooms are a kept feature of the student product (read together, quiz
 * each other in a room), not part of the retired social plane.
 *
 * ── What stays (hiring plane) ──────────────────────────────────────────────
 *   /jobs · /companies · /applications · /experiences · /opportunities ·
 *   /talent · /leaderboard · /compete (→ assessment engine) · /brain (→ coach)
 *   · /integrations · /profile · /campus-change · /admin · /notifications ·
 *   /reminders · /premium · /blog · /live-voice-chat
 */

export const SOCIAL_LAYER_RETIRED = true

/** Where retired routes send the user — a kept, on-brand hub. */
export const FALLBACK_ROUTE = '/colleges'

/** Page-route prefixes that are part of the retired social plane. */
export const RETIRED_ROUTES = [
  '/global',
  '/community',
  '/communities',
  '/chat',
  '/messages',
  '/connections',
  '/groups',
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

/**
 * RECRUITER SALES SURFACE — hidden, not deleted.
 *
 * The product is a student-facing placement-information platform right now:
 * interview experiences, company rounds and campus data. The B2B *storefront*
 * (`/hire`, which asked recruiters to request a demo batch) advertised a
 * console that was never built, so it is hidden until that console exists.
 *
 * ── What is hidden vs what stays ───────────────────────────────────────────
 *   HIDDEN : `/hire` only — the lead-capture landing.
 *   STAYS  : `/companies`, `/jobs`, `/applications` — the *data* plane.
 *            Interview experiences and blog posts reference companies, so
 *            removing those tables would break the student product.
 *   STAYS  : `/hire/b/[token]` — an already-delivered shortlist link. It is a
 *            shared deliverable, not a storefront, and must keep working.
 *
 * Set `RECRUITER_SALES_HIDDEN = false` to restore the landing and its links.
 */
export const RECRUITER_SALES_HIDDEN = true

/** Where a hidden sales page sends the visitor — the student landing. */
export const SALES_FALLBACK_ROUTE = '/'

/** True only for the storefront itself — exact match, so `/hire/b/…` survives. */
export function isHiddenSalesPath(pathname: string): boolean {
  if (!RECRUITER_SALES_HIDDEN) return false
  return pathname === '/hire'
}

/**
 * JOB BOARD + APPLICATION TRACKER — hidden, not deleted.
 *
 * The product is now placement INFORMATION: what happened at your campus, the
 * rounds, the practice, and the study rooms. A job board is a different product
 * with a different supply problem (recruiters), and `job_postings` has never had
 * a single row — so the empty board was promising something that did not exist.
 * `/applications` is the tracker for that board, so it goes with it.
 *
 * Files, tables and the `/api/jobs/*` adapters all stay on disk: flipping this
 * to false (and `FALLBACK_ROUTE`) brings the whole hiring plane back.
 */
export const JOBS_BOARD_HIDDEN = true

/** Where a hidden job route sends the visitor — the campus directory. */
export const JOBS_FALLBACK_ROUTE = '/colleges'

export function isHiddenJobsPath(pathname: string): boolean {
  if (!JOBS_BOARD_HIDDEN) return false
  return ['/jobs', '/applications'].some((r) => pathname === r || pathname.startsWith(r + '/'))
}
