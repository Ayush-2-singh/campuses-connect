import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/admin/campus-change — list all campus change requests */
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
  const status = searchParams.get('status') || 'all'

  let query = supabase
    .from('campus_change_requests')
    .select('*, profiles:user_id(full_name, username, avatar_url, email), campuses!current_campus_id(name, slug), campuses!requested_campus_id(name, slug)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: requests, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: requests || [] })
}

/** POST /api/admin/campus-change — approve or reject a request */
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
  const { request_id, action, reason } = body

  if (!request_id || !action) {
    return NextResponse.json({ error: 'request_id and action required' }, { status: 400 })
  }

  if (action === 'approve') {
    const { error } = await supabase.rpc('approve_campus_change', {
      p_request_id: request_id,
      p_admin_id: user.id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    const { error } = await supabase.rpc('reject_campus_change', {
      p_request_id: request_id,
      p_admin_id: user.id,
      p_reason: reason || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
