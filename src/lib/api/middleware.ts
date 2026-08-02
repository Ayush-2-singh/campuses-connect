/**
 * Server-side API middleware helpers.
 * Use inside Next.js Route Handlers to enforce authentication and role checks.
 *
 * Admin roles in this app: platform_admin | campus_admin
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const ADMIN_ROLES = ['platform_admin', 'campus_admin'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export interface AuthResult {
  userId: string
  profile: { id: string; role: string; campus_id?: string; college_id?: string }
}

/**
 * Verify the incoming request carries a valid Supabase session.
 * Returns `{ ok: true, auth }` or a ready-to-return 401 NextResponse.
 */
export async function requireAuth(
): Promise<{ ok: true; auth: AuthResult } | { ok: false; response: NextResponse }> {
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
    .select('id, role, campus_id, college_id')
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

  return { ok: true, auth: { userId: user.id, profile } }
}

/**
 * Verify the request is from an authenticated admin.
 * Returns `{ ok: true, auth }` or a ready-to-return 401/403 NextResponse.
 */
export async function requireAdmin(
): Promise<{ ok: true; auth: AuthResult } | { ok: false; response: NextResponse }> {
  const result = await requireAuth()
  if (!result.ok) return result

  const { auth } = result

  if (!(ADMIN_ROLES as readonly string[]).includes(auth.profile.role)) {
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
