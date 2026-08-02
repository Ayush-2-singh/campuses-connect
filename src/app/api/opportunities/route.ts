/**
 * GET  /api/opportunities  — authenticated users only
 * POST /api/opportunities  — admin only (platform_admin | campus_admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/api/middleware'

// ─── GET /api/opportunities ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // Must be signed in
  const authResult = await requireAuth()
  if (!authResult.ok) return authResult.response

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const oppType = searchParams.get('opp_type')
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100)

  let query = supabase
    .from('opportunities')
    .select('*, profiles(full_name, username, role)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (oppType && oppType !== 'all') {
    query = query.eq('opp_type', oppType)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/opportunities]', error.message)
    return NextResponse.json({ error: 'Failed to fetch opportunities.' }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ─── POST /api/opportunities ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Must be an admin
  const authResult = await requireAdmin()
  if (!authResult.ok) return authResult.response

  const { auth } = authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { title, description, opp_type, company_org, apply_link, deadline, is_paid, stipend_range, location_type } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required.' }, { status: 422 })
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      posted_by: auth.userId,
      campus_id: auth.profile.campus_id ?? null,
      college_id: auth.profile.college_id ?? null,
      title: title.trim(),
      description: description ?? null,
      opp_type: opp_type ?? 'other',
      company_org: company_org ?? null,
      apply_link: apply_link ?? null,
      deadline: deadline || null,
      is_paid: Boolean(is_paid),
      stipend_range: stipend_range ?? null,
      location_type: location_type ?? 'remote',
      visibility: 'platform',
      is_active: true,
    })
    .select('*, profiles(full_name, username, role)')
    .single()

  if (error) {
    console.error('[POST /api/opportunities]', error.message)
    return NextResponse.json({ error: 'Failed to create opportunity.' }, { status: 500 })
  }

  // Award karma and update streak for the admin who posted
  await Promise.all([
    supabase.rpc('add_karma', { user_id: auth.userId, points: 8 }),
    supabase.rpc('update_streak', { user_id: auth.userId }),
  ])

  return NextResponse.json({ data }, { status: 201 })
}
