import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/companies?industry=tech&search=google */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const industry = searchParams.get('industry')
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  let query = supabase
    .from('companies')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (industry && industry !== 'all') query = query.eq('industry', industry)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query.limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get follower counts
  const companiesWithCounts = await Promise.all(
    (data || []).map(async (c: any) => {
      const { count } = await supabase
        .from('company_followers')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', c.id)
      return { ...c, follower_count: count || 0 }
    })
  )

  return NextResponse.json({ companies: companiesWithCounts })
}

/** POST /api/companies — create a new company (platform_admin only) */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  if (!(grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, slug, logo_url, website, description, industry, hq_location, company_size, tech_stack } = body
  if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })

  const { data, error } = await supabase.from('companies').insert({
    name, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    logo_url, website, description, industry, hq_location, company_size,
    tech_stack: tech_stack || [],
    created_by: user.id,
  }).select().single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Company with this slug already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ company: data }, { status: 201 })
}
