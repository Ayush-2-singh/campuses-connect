import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/badges — get all badges with user's progress */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id') || user.id

  const { data: badges, error } = await supabase.rpc('get_badge_progress', { p_user_id: userId })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get user's earned badges
  const { data: userBadges } = await supabase.rpc('get_user_badges', { p_user_id: userId })

  // Get streak info
  const { data: profile } = await supabase
    .from('profiles')
    .select('streak_days, karma_points')
    .eq('id', userId)
    .single()

  // Get daily activity for the last 30 days
  const { data: activity } = await supabase
    .from('daily_activity')
    .select('activity_date, posts_created, comments_made, reactions_given')
    .eq('user_id', userId)
    .gte('activity_date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
    .order('activity_date')

  return NextResponse.json({
    badges: badges || [],
    user_badges: userBadges || [],
    streak_days: profile?.streak_days || 0,
    karma_points: profile?.karma_points || 0,
    recent_activity: activity || [],
  })
}

/** POST /api/badges — record daily activity */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { activity_type } = body
  if (!activity_type) return NextResponse.json({ error: 'activity_type required' }, { status: 400 })

  await supabase.rpc('record_daily_activity', { p_activity_type: activity_type })

  return NextResponse.json({ ok: true })
}
