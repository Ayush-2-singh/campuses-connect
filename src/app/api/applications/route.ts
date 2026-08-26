import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/applications — get user's applications */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('applications')
    .select('*, job_postings(*, companies(name, slug, logo_url))')
    .eq('user_id', user.id)
    .order('applied_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ applications: data || [] })
}

/** POST /api/applications — apply to a job */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { job_posting_id, cover_note } = body
  if (!job_posting_id) return NextResponse.json({ error: 'job_posting_id required' }, { status: 400 })

  // Check if already applied
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('user_id', user.id)
    .eq('job_posting_id', job_posting_id)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already applied to this job' }, { status: 409 })

  const { data, error } = await supabase.from('applications').insert({
    user_id: user.id,
    job_posting_id,
    cover_note: cover_note || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Increment apply_count (fire-and-forget)
  const { data: jobData } = await supabase.from('job_postings').select('apply_count').eq('id', job_posting_id).single()
  await supabase.from('job_postings').update({ apply_count: (jobData?.apply_count || 0) + 1 }).eq('id', job_posting_id)

  return NextResponse.json({ application: data }, { status: 201 })
}

/** PATCH /api/applications — update application status (admin only) */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  if (!(grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, status, notes } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const update: any = { status }
  if (notes !== undefined) update.notes = notes

  const { error } = await supabase.from('applications').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
