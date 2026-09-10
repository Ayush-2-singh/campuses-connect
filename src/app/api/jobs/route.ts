import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/jobs?company=google&type=internship&search=frontend */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companySlug = searchParams.get('company')
  const jobType = searchParams.get('type')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50)

  let query = supabase
    .from('job_postings')
    .select('*, companies(id, name, slug, logo_url, industry)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (companySlug) {
    const { data: company } = await supabase.from('companies').select('id').eq('slug', companySlug).single()
    if (company) query = query.eq('company_id', company.id)
  }
  if (jobType && jobType !== 'all') query = query.eq('job_type', jobType)
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

  const { data, error } = await query.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs: data || [] })
}

/** POST /api/jobs — create a job posting (admin or company creator) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { company_id, title, description, job_type, location, location_type, stipend, salary_range, skills_required, apply_link, deadline } = body
  if (!company_id || !title) return NextResponse.json({ error: 'company_id and title required' }, { status: 400 })

  const { data, error } = await supabase.from('job_postings').insert({
    company_id, title, description, job_type: job_type || 'internship',
    location, location_type, stipend, salary_range,
    skills_required: skills_required || [],
    apply_link, deadline: deadline || null,
    posted_by: user.id,
  }).select('*, companies(name, slug, logo_url)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data }, { status: 201 })
}
