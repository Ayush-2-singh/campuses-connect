/**
 * Server-side API middleware helpers.
 * Use inside Next.js Route Handlers to enforce authentication and role checks.
 *
 * Admin identity comes from the admin_grants table via the self-scoped
 * `my_admin_grants()` RPC — never from a `profiles.role` column (dropped in V3).
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const ADMIN_ROLES = ['platform_admin', 'campus_admin'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export interface AuthResult {
  userId: string
  profile: { id: string; campus_id?: string; college_id?: string }
  adminTypes: string[]
}

/**
 * Lightweight auth — skips the admin-grants RPC call.
 * Use for non-admin API routes (Brain, etc.) to save one DB round-trip.
 */
export async function requireAuthLite(): Promise<
  | { ok: true; auth: Pick<AuthResult, 'userId' | 'profile'> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }
  const { data: profile, error: pe } = await supabase
    .from('profiles').select('id, campus_id, college_id').eq('id', user.id).single()
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
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('is_user_premium', { p_user_id: userId })
  if (error) return { ok: false, error: 'Could not verify premium status.' }
  if (data === true) return { ok: true }
  return { ok: false, error: 'This feature requires CampusConnect Pro.' }
}

/**
 * Verify the incoming request carries a valid Supabase session.
 * Returns `{ ok: true, auth }` or a ready-to-return 401 NextResponse.
 */
export async function requireAuth(): Promise<
  | { ok: true; auth: AuthResult }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 },
      ),
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, campus_id, college_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'User profile not found.' },
        { status: 401 },
      ),
    }
  }

  // Self-scoped grants only — never caller-supplied ids.
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const adminTypes = ((grants as any[]) || []).map((g: any) => g.admin_type)

  return { ok: true, auth: { userId: user.id, profile, adminTypes } }
}

/**
 * Verify the request is from an authenticated admin.
 * Returns `{ ok: true, auth }` or a ready-to-return 401/403 NextResponse.
 */
export async function requireAdmin(): Promise<
  | { ok: true; auth: AuthResult }
  | { ok: false; response: NextResponse }
> {
  const result = await requireAuth()
  if (!result.ok) return result

  const { auth } = result

  if (!auth.adminTypes.some(t => (ADMIN_ROLES as readonly string[]).includes(t))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 },
      ),
    }
  }

  return { ok: true, auth }
}
