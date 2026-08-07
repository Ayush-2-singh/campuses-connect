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
