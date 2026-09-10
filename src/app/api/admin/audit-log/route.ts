import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/admin/audit-log — list recent audit log entries */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  const { data, error } = await supabase
    .from('audit_log')
    .select(`
      *,
      profiles:actor_id ( full_name, username )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get total count
  const { count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({ entries: data, total: count || 0 })
}
