import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function checkAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}

/** GET /api/admin/analytics?section=overview|growth|heatmap|top_posts|top_colleges|feature_usage */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await checkAdmin(supabase)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const section = searchParams.get('section') || 'overview'

  try {
    switch (section) {
      case 'overview': {
        const { data, error } = await supabase.rpc('get_analytics_overview')
        if (error) throw new Error(error.message)
        return NextResponse.json(data)
      }
      case 'growth': {
        const { data, error } = await supabase.rpc('get_analytics_growth')
        if (error) throw new Error(error.message)
        return NextResponse.json(data)
      }
      case 'heatmap': {
        const { data, error } = await supabase.rpc('get_analytics_heatmap')
        if (error) throw new Error(error.message)
        return NextResponse.json({ heatmap: data })
      }
      case 'top_posts': {
        const { data, error } = await supabase.rpc('get_analytics_top_posts', { p_limit: 20 })
        if (error) throw new Error(error.message)
        return NextResponse.json({ posts: data })
      }
      case 'top_colleges': {
        const { data, error } = await supabase.rpc('get_analytics_top_colleges', { p_limit: 10 })
        if (error) throw new Error(error.message)
        return NextResponse.json({ colleges: data })
      }
      case 'feature_usage': {
        const { data, error } = await supabase.rpc('get_analytics_feature_usage')
        if (error) throw new Error(error.message)
        return NextResponse.json(data)
      }
      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
