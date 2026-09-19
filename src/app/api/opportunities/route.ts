/**
 * GET  /api/opportunities  — authenticated users only
 * POST /api/opportunities  — admin only (platform_admin | campus_admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthLite } from '@/lib/api/middleware'
import { getSupabaseAdmin } from '@/lib/auth'

// ─── GET /api/opportunities ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const authRes = await requireAuthLite(request)
  if (!authRes.ok) return authRes.response
  const user = { id: authRes.auth.userId }

  try {
    const admin = getSupabaseAdmin()
    const { searchParams } = new URL(request.url)
    const oppType = searchParams.get('opp_type')
    const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 100)

    let query = admin
      .from('opportunities')
      .select('*, profiles(full_name, username)')
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
  } catch (err) {
    console.error('[GET /api/opportunities] Unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ─── POST /api/opportunities ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const authRes = await requireAuthLite(request)
  if (!authRes.ok) return authRes.response
  const user = { id: authRes.auth.userId }

  try {
    const admin = getSupabaseAdmin()

    // Check admin status
    const { data: grants } = await admin.rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
    }

    const { data: profile } = await admin.from('profiles').select('campus_id, college_id').eq('id', user.id).single()

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const {
      title,
      description,
      opp_type,
      company_org,
      apply_link,
      deadline,
      is_paid,
      stipend_range,
      location_type,
      skills_required,
      visibility,
    } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required.' }, { status: 422 })
    }

    const vis = visibility === 'campus' ? 'campus' : 'global'

    const { data, error } = await admin
      .from('opportunities')
      .insert({
        posted_by: user.id,
        campus_id: profile?.campus_id ?? null,
        college_id: profile?.college_id ?? null,
        title: title.trim(),
        description: description ?? null,
        opp_type: opp_type ?? 'other',
        company_org: company_org ?? null,
        apply_link: apply_link ?? null,
        deadline: deadline || null,
        is_paid: Boolean(is_paid),
        stipend_range: stipend_range ?? null,
        location_type: location_type ?? 'remote',
        skills_required: Array.isArray(skills_required)
          ? skills_required.map(String).filter(Boolean).slice(0, 12)
          : null,
        visibility: profile?.campus_id ? vis : 'global',
        is_active: true,
      })
      .select('*, profiles(full_name, username)')
      .single()

    if (error) {
      console.error('[POST /api/opportunities]', error.message)
      return NextResponse.json({ error: 'Failed to create opportunity.' }, { status: 500 })
    }

    await admin.rpc('reward_opportunity_post', { p_opportunity_id: data.id })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/opportunities] Unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
