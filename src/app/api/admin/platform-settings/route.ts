import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/admin/platform-settings — list all platform settings */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .order('key')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalize jsonb values to strings for the frontend
  const normalized = (data || []).map((s: any) => ({
    ...s,
    value: typeof s.value === 'string' ? s.value : String(s.value),
  }))

  return NextResponse.json({ settings: normalized })
}

/** PATCH /api/admin/platform-settings — update a setting */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { key, value } = body
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  // value column is jsonb — store booleans/numbers as-is, wrap strings in quotes
  const jsonbValue = (value === 'true' || value === 'false')
    ? value === 'true'
    : !isNaN(Number(value)) ? Number(value) : value

  const { error } = await supabase
    .from('platform_settings')
    .update({ value: jsonbValue, updated_by: user.id })
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log the action
  await supabase.rpc('log_admin_action', {
    p_action: 'platform_setting.update',
    p_entity_type: 'platform_settings',
    p_metadata: { key, value: String(value) },
  })

  return NextResponse.json({ ok: true })
}
