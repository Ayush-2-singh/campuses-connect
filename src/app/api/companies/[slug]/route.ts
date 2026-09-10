import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/companies/[slug] — company detail with jobs, experiences, followers */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  // Get follower count
  const { count: followerCount } = await supabase
    .from('company_followers')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', company.id)

  // Check if current user follows
  const { data: followData } = await supabase
    .from('company_followers')
    .select('user_id')
    .eq('company_id', company.id)
    .eq('user_id', user.id)
    .maybeSingle()

  // Get active job postings
  const { data: jobs } = await supabase
    .from('job_postings')
    .select('*')
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  // Get interview experiences
  const { data: experiences } = await supabase
    .from('interview_experiences')
    .select('*, profiles:user_id(full_name, username)')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Get average rating
  const avgRating = experiences?.length
    ? (experiences.reduce((s: number, e: any) => s + (e.rating || 0), 0) / experiences.length).toFixed(1)
    : null

  return NextResponse.json({
    company,
    follower_count: followerCount || 0,
    is_following: !!followData,
    jobs: jobs || [],
    experiences: experiences || [],
    avg_rating: avgRating,
  })
}
