import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/admin/verify — search users + get their verifications */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify platform admin
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const g = (grants as any[]) || []
  if (!g.some((x: any) => x.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const userId = searchParams.get('user_id')
  const type = searchParams.get('type') || 'all'

  // If user_id is provided, get their verifications
  if (userId) {
    const { data: verifications } = await supabase.rpc('get_user_verifications', { p_user_id: userId })
    return NextResponse.json({ verifications: verifications || [] })
  }

  // Search users
  const { data: users, error } = await supabase.rpc('admin_search_users_for_verification', {
    p_search: search,
    p_limit: 30,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get all campuses for campus change dropdown
  const { data: campuses } = await supabase
    .from('campuses')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ users: users || [], campuses: campuses || [] })
}

/** POST /api/admin/verify — perform verification action */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify platform admin
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const g = (grants as any[]) || []
  if (!g.some((x: any) => x.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, user_id, notes } = body

  if (!action || !user_id) {
    return NextResponse.json({ error: 'action and user_id required' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'change_campus': {
        const { campus_id } = body
        if (!campus_id) return NextResponse.json({ error: 'campus_id required' }, { status: 400 })
        const { error } = await supabase.rpc('admin_change_user_campus', {
          p_user_id: user_id,
          p_new_campus_id: campus_id,
          p_admin_id: user.id,
          p_notes: notes || null,
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: 'Campus changed successfully' })
      }

      case 'verify_identity': {
        const { error } = await supabase.rpc('admin_verify_user', {
          p_user_id: user_id,
          p_verification_type: 'identity',
          p_metadata: { method: 'admin_manual' },
          p_admin_id: user.id,
          p_notes: notes || 'Identity verified by admin',
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: 'Identity verified' })
      }

      case 'verify_email': {
        const { email } = body
        const { error } = await supabase.rpc('admin_verify_user', {
          p_user_id: user_id,
          p_verification_type: 'email',
          p_metadata: { email: email || '', method: 'admin_manual' },
          p_admin_id: user.id,
          p_notes: notes || 'Email verified by admin',
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: 'Email verified' })
      }

      case 'endorse_skill': {
        const { skill } = body
        if (!skill) return NextResponse.json({ error: 'skill name required' }, { status: 400 })
        const { error } = await supabase.rpc('admin_verify_user', {
          p_user_id: user_id,
          p_verification_type: 'skill',
          p_metadata: { skill, method: 'admin_manual' },
          p_admin_id: user.id,
          p_notes: notes || `Skill "${skill}" endorsed by admin`,
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: `Skill "${skill}" endorsed` })
      }

      case 'assign_role': {
        const { role } = body
        if (!role) return NextResponse.json({ error: 'role name required' }, { status: 400 })
        const { error } = await supabase.rpc('admin_verify_user', {
          p_user_id: user_id,
          p_verification_type: 'role',
          p_metadata: { role, method: 'admin_manual' },
          p_admin_id: user.id,
          p_notes: notes || `Role "${role}" assigned by admin`,
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: `Role "${role}" assigned` })
      }

      case 'custom': {
        const { label, value } = body
        if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
        const { error } = await supabase.rpc('admin_verify_user', {
          p_user_id: user_id,
          p_verification_type: 'custom',
          p_metadata: { label, value: value || '', method: 'admin_manual' },
          p_admin_id: user.id,
          p_notes: notes || `Custom verification: ${label}`,
        })
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, message: `${label} verified` })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('Verify error:', err)
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}

/** PATCH /api/admin/verify — revoke a verification */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const g = (grants as any[]) || []
  if (!g.some((x: any) => x.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { verification_id, notes } = body

  if (!verification_id) return NextResponse.json({ error: 'verification_id required' }, { status: 400 })

  const { error } = await supabase.rpc('admin_revoke_verification', {
    p_verification_id: verification_id,
    p_admin_id: user.id,
    p_notes: notes || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'Verification revoked' })
}
