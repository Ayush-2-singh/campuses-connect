import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { partnerStatusOf } from '@/lib/company-status'

/** GET /api/companies?industry=tech&search=google */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const industry = searchParams.get('industry')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  let query = supabase.from('companies').select('*').eq('is_active', true).order('name')

  if (industry && industry !== 'all') query = query.eq('industry', industry)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const ids = rows.map((c: any) => c.id)

  /** Tally rows by company id — one query per signal instead of one per card. */
  const tally = (list: { company_id: string }[] | null) => {
    const counts = new Map<string, number>()
    for (const row of list || []) counts.set(row.company_id, (counts.get(row.company_id) || 0) + 1)
    return counts
  }

  // Real activity only: an open role, or an interview experience a student
  // filed. Follower counts are real too, but they say nothing about whether the
  // company works with us — see src/lib/company-status.ts.
  let openRoles: { company_id: string }[] | null = null
  let experiences: { company_id: string }[] | null = null
  let followers: { company_id: string }[] | null = null
  if (ids.length > 0) {
    const [rolesRes, expRes, followRes] = await Promise.all([
      supabase.from('job_postings').select('company_id').in('company_id', ids).eq('is_active', true),
      supabase.from('interview_experiences').select('company_id').in('company_id', ids),
      supabase.from('company_followers').select('company_id').in('company_id', ids),
    ])
    openRoles = rolesRes.data
    experiences = expRes.data
    followers = followRes.data
  }

  const roleCount = tally(openRoles)
  const expCount = tally(experiences)
  const followCount = tally(followers)

  const companies = rows.map((c: any) => {
    const open_roles = roleCount.get(c.id) || 0
    const experience_count = expCount.get(c.id) || 0
    return {
      ...c,
      follower_count: followCount.get(c.id) || 0,
      open_roles,
      experience_count,
      partner_status: partnerStatusOf({ openRoles: open_roles, experienceCount: experience_count }),
    }
  })

  return NextResponse.json({ companies })
}

/** POST /api/companies — create a new company (platform_admin only) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  if (!(grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, slug, logo_url, website, description, industry, hq_location, company_size, tech_stack } = body
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })

  const { data, error } = await supabase
    .from('companies')
    .insert({
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      logo_url,
      website,
      description,
      industry,
      hq_location,
      company_size,
      tech_stack: tech_stack || [],
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'Company with this slug already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ company: data }, { status: 201 })
}
