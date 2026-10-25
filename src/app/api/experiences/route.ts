import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverError } from '@/lib/api/errors'

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
    .limit(30)

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
  if (!experience_id || vote === undefined) {
    return NextResponse.json({ error: 'experience_id and vote required' }, { status: 400 })
  }

  // Upsert vote
  await supabase.from('interview_votes').upsert(
    {
      experience_id,
      user_id: user.id,
      vote,
    },
    { onConflict: 'experience_id,user_id' }
  )

  // Recalculate upvotes
  const { data: votes } = await supabase.from('interview_votes').select('vote').eq('experience_id', experience_id)

  const upvotes = (votes || []).reduce((sum: number, v: any) => sum + v.vote, 0)
  await supabase.from('interview_experiences').update({ upvotes }).eq('id', experience_id)

  return NextResponse.json({ ok: true, upvotes })
}
