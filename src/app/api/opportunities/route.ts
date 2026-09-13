/**
 * GET  /api/opportunities  — authenticated users only
 * POST /api/opportunities  — admin only (platform_admin | campus_admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Service-role client (bypasses RLS, always available) ─────
let _supabaseAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

/** Extract verified user from request cookies via service-role client. */
async function getVerifiedUser(request: NextRequest) {
  const allCookies = request.cookies.getAll()
  const tokenCookie = allCookies.find((c) => c.name.match(/^sb-.*-auth-token$/))
  if (!tokenCookie) return null

  let accessToken: string | undefined
  try {
    const parsed = JSON.parse(decodeURIComponent(tokenCookie.value))
    accessToken = parsed.access_token
  } catch {
    accessToken = tokenCookie.value
  }
  if (!accessToken) return null

  const admin = getSupabaseAdmin()
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

// ─── GET /api/opportunities ───────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

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
}

// ─── POST /api/opportunities ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getVerifiedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  // Check admin status
  const admin = getSupabaseAdmin()
  const { data: grants } = await admin.rpc('my_admin_grants')
  const grantsArr = (grants as any[]) || []
  const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 })
  }

  // Get profile
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
      skills_required: Array.isArray(skills_required) ? skills_required.map(String).filter(Boolean).slice(0, 12) : null,
      visibility: profile?.campus_id ? vis : 'global',
      is_active: true,
    })
    .select('*, profiles(full_name, username)')
    .single()

  if (error) {
    console.error('[POST /api/opportunities]', error.message)
    return NextResponse.json({ error: 'Failed to create opportunity.' }, { status: 500 })
  }

  // Award karma via the validated wrapper
  await admin.rpc('reward_opportunity_post', { p_opportunity_id: data.id })

  return NextResponse.json({ data }, { status: 201 })
}
