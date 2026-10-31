import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { serverError } from '@/lib/api/errors'

/**
 * The upvote TOTAL lives on `interview_experiences`, whose UPDATE policy only
 * lets the author touch their own row. A reader therefore cannot write the
 * aggregate themselves — the update silently affected zero rows, so the count
 * never moved. The tally is recalculated here with the service role, after the
 * caller's session (and their own vote row) has been verified above.
 */
let _service: SupabaseClient | null = null
function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!_service) _service = createServiceClient(url, key, { auth: { persistSession: false } })
  return _service
}

/** GET /api/experiences?company=google */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companySlug = searchParams.get('company')

  let query = supabase
    .from('interview_experiences')
    // NOTE: the author's profile is deliberately NOT embedded here.
    // `interview_experiences.user_id` references auth.users(id), not
    // public.profiles(id), so PostgREST cannot resolve `profiles:user_id(...)` —
    // the old embedded query errored with PGRST200, this route returned 500,
    // and the page showed "No experiences yet" no matter how many rows
    // existed. Profiles are fetched separately below and merged in.
    .select('*, companies(name, slug, logo_url)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (companySlug) {
    const { data: company } = await supabase.from('companies').select('id').eq('slug', companySlug).single()
    if (company) query = query.eq('company_id', company.id)
  }

  const { data, error } = await query
  if (error) return serverError('experiences', error)

  const rows = data || []

  // Author profiles in one follow-up query. `campuses(name)` rides along so
  // the page can group write-ups gang-wise (by campus) without a third call.
  const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))] as string[]
  const profilesById = new Map<string, any>()
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, campus_id, campuses(name)')
      .in('id', userIds)
    for (const p of profs || []) profilesById.set(p.id, p)
  }

  const experiences = rows.map((r: any) => {
    const p = profilesById.get(r.user_id) || null
    return {
      ...r,
      profiles: p
        ? {
            full_name: p.full_name,
            username: p.username,
            avatar_url: p.avatar_url,
            campus_id: p.campus_id,
            campuses: p.campuses ?? null,
          }
        : null,
    }
  })

  return NextResponse.json({ experiences })
}

/** POST /api/experiences — post an interview experience */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { company_id, title, experience, role, round_count, result, difficulty, rating, tips, offer_salary } = body
  if (!company_id || !title || !experience) {
    return NextResponse.json({ error: 'company_id, title, and experience required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('interview_experiences')
    .insert({
      user_id: user.id,
      company_id,
      title,
      experience,
      role,
      round_count,
      result,
      difficulty,
      rating,
      tips,
      offer_salary,
    })
    .select('*, companies(name, slug)')
    .single()

  if (error) return serverError('experiences', error)
  return NextResponse.json({ experience: data }, { status: 201 })
}

/** PATCH /api/experiences — vote on an experience */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { experience_id, vote } = body
  if (!experience_id || (vote !== 1 && vote !== -1)) {
    return NextResponse.json({ error: 'experience_id and vote (1 or -1) required' }, { status: 400 })
  }

  // 1) The reader writes their OWN vote row (RLS enforces auth.uid = user_id).
  const { error: voteError } = await supabase.from('interview_votes').upsert(
    {
      experience_id,
      user_id: user.id,
      vote,
    },
    { onConflict: 'experience_id,user_id' }
  )
  if (voteError) return serverError('experiences PATCH vote', voteError, 400)

  // 2) Recalculate the public total with the service role — the row belongs to
  // the author, so the voter's client can never update it under RLS.
  const admin = serviceClient()
  if (!admin) {
    return NextResponse.json({ error: 'Voting is temporarily unavailable' }, { status: 503 })
  }

  const { data: votes, error: tallyError } = await admin
    .from('interview_votes')
    .select('vote')
    .eq('experience_id', experience_id)
  if (tallyError) return serverError('experiences PATCH tally', tallyError)

  const upvotes = (votes || []).reduce((sum: number, v: any) => sum + v.vote, 0)
  const { error: updateError } = await admin.from('interview_experiences').update({ upvotes }).eq('id', experience_id)
  if (updateError) return serverError('experiences PATCH total', updateError)

  return NextResponse.json({ ok: true, upvotes })
}
