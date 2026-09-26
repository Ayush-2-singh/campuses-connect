/**
 * Server-side API middleware helpers.
 * Use inside Next.js Route Handlers to enforce authentication and role checks.
 *
 * Uses shared getVerifiedUserFromCookie from @/lib/auth which handles chunked cookies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getVerifiedUserFromCookie, getSupabaseAdmin } from '@/lib/auth'

/**
 * Resolve the signed-in user for a route handler.
 *
 * Most routes here call the guards without an argument (`requireAuth()`), which
 * used to resolve to `null` and answer 401 on every request. `next/headers`
 * exposes the incoming cookies inside a handler, so the session survives. This
 * module is server-only, which is why the fallback lives here rather than in
 * `@/lib/auth` (imported by client pages too).
 */
async function resolveUser(request?: NextRequest) {
  try {
    const headerList = await headers()
    const authHeader = request ? request.headers.get('authorization') : headerList.get('authorization')

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const admin = getSupabaseAdmin()
        const {
          data: { user },
        } = await admin.auth.getUser(token)
        if (user) return user
      } catch (err) {
        console.error('[auth] Bearer token validation failed:', err)
      }
    }

    return await getVerifiedUserFromCookie(headerList.get('cookie') || '')
  } catch {
    return null
  }
}

export const ADMIN_ROLES = ['platform_admin', 'campus_admin', 'community_admin'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

/** Every role that may moderate content (community admins only inside their community). */
export const MODERATOR_ROLES = ['platform_admin', 'campus_admin', 'community_admin'] as const

export interface AdminGrantRow {
  admin_type: string
  community_id: string | null
  campus_id: string | null
  college_id: string | null
}

export interface AuthResult {
  userId: string
  profile: { id: string; campus_id?: string; college_id?: string }
  adminTypes: string[]
  grants: AdminGrantRow[]
}

/**
 * Scope guard for moderation.
 *
 * platform_admin moderates anywhere; campus_admin only on rows belonging to
 * one of their campuses/colleges; community_admin only inside their community.
 * Rows are matched on the scope columns the caller resolved from the target
 * table — never on anything the client supplied.
 */
export function scopeFilterFor(auth: AuthResult) {
  const isPlatform = auth.adminTypes.includes('platform_admin')
  const idsFor = (type: string, column: keyof AdminGrantRow) =>
    auth.grants
      .filter((g) => g.admin_type === type)
      .map((g) => g[column])
      .filter((v): v is string => !!v)

  const campusIds = idsFor('campus_admin', 'campus_id')
  const collegeIds = idsFor('campus_admin', 'college_id')
  const communityIds = idsFor('community_admin', 'community_id')

  return {
    isPlatform,
    canModerateRow: (row: {
      campus_id?: string | null
      college_id?: string | null
      community_id?: string | null
    }): boolean => {
      if (isPlatform) return true
      if (row.community_id && communityIds.includes(row.community_id)) return true
      if (row.campus_id && campusIds.includes(row.campus_id)) return true
      if (row.college_id && collegeIds.includes(row.college_id)) return true
      return false
    },
  }
}

/**
 * Lightweight auth — skips the admin-grants RPC call.
 * Use for non-admin API routes (Brain, etc.) to save one DB round-trip.
 */
export async function requireAuthLite(
  request?: NextRequest
): Promise<{ ok: true; auth: Pick<AuthResult, 'userId' | 'profile'> } | { ok: false; response: NextResponse }> {
  const user = await resolveUser(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const admin = getSupabaseAdmin()
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('id, campus_id, college_id')
    .eq('id', user.id)
    .single()
  if (pe || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found.' }, { status: 401 }) }
  }
  return { ok: true, auth: { userId: user.id, profile } }
}

/**
 * Check if a user is a Pro/Enterprise subscriber.
 * Uses the `is_user_premium` RPC — a single indexed query.
 */
export async function requirePremium(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.rpc('is_user_premium', { p_user_id: userId })
  if (error) return { ok: false, error: 'Could not verify premium status.' }
  if (data === true) return { ok: true }
  return { ok: false, error: 'This feature requires ConnectToCampus Pro.' }
}

/**
 * Verify the incoming request carries a valid Supabase session.
 * Returns `{ ok: true, auth }` or a ready-to-return 401 NextResponse.
 */
export async function requireAuth(
  request?: NextRequest
): Promise<{ ok: true; auth: AuthResult } | { ok: false; response: NextResponse }> {
  const user = await resolveUser(request)
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    }
  }

  const admin = getSupabaseAdmin()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, campus_id, college_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User profile not found.' }, { status: 401 }),
    }
  }

  // Self-scoped grants only — never caller-supplied ids.
  // NOTE: read the table instead of calling my_admin_grants(). That RPC filters
  // on auth.uid(), which is NULL on a service-role client, so it returned zero
  // rows and every admin request was rejected with 403.
  const { data: grantRows } = await admin
    .from('admin_grants')
    .select('admin_type, community_id, campus_id, college_id')
    .eq('user_id', user.id)
  const grants = (grantRows as AdminGrantRow[] | null) || []
  const adminTypes = grants.map((g) => g.admin_type)

  return { ok: true, auth: { userId: user.id, profile, adminTypes, grants } }
}

/**
 * Verify the request is from an authenticated admin (any admin type = full access).
 * Returns `{ ok: true, auth }` or a ready-to-return 401/403 NextResponse.
 */
export async function requireAdmin(
  request?: NextRequest
): Promise<{ ok: true; auth: AuthResult } | { ok: false; response: NextResponse }> {
  const result = await requireAuth(request)
  if (!result.ok) return result

  const { auth } = result

  // Any admin grant (platform, campus, community) = full admin access
  if (auth.adminTypes.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 }),
    }
  }

  return { ok: true, auth }
}
