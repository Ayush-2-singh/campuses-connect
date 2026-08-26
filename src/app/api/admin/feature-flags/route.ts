import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET /api/admin/feature-flags — list all feature flags */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check platform admin
  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flags: data })
}

/** PATCH /api/admin/feature-flags — toggle a feature flag */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { key, enabled } = body
  if (!key || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'key and enabled (boolean) required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('feature_flags')
    .update({ enabled })
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log the action
  await supabase.rpc('log_admin_action', {
    p_action: `feature_flag.${enabled ? 'enable' : 'disable'}`,
    p_entity_type: 'feature_flag',
    p_metadata: { key, enabled },
  })

  return NextResponse.json({ ok: true })
}

/** POST /api/admin/feature-flags — create a new feature flag */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { key, label, description, category, enabled, sort_order } = body
  if (!key || !label) {
    return NextResponse.json({ error: 'key and label required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('feature_flags')
    .insert({
      key,
      label,
      description: description || null,
      category: category || 'custom',
      enabled: enabled !== false,
      sort_order: sort_order || 100,
    })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A feature with this key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.rpc('log_admin_action', {
    p_action: 'feature_flag.create',
    p_entity_type: 'feature_flag',
    p_metadata: { key, label, category },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

/** DELETE /api/admin/feature-flags?key=xxx — delete a custom feature flag */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: grants } = await supabase.rpc('my_admin_grants')
  const isAdmin = (grants as any[])?.some((g: any) => g.admin_type === 'platform_admin')
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const { error } = await supabase
    .from('feature_flags')
    .delete()
    .eq('key', key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.rpc('log_admin_action', {
    p_action: 'feature_flag.delete',
    p_entity_type: 'feature_flags',
    p_metadata: { key },
  })

  return NextResponse.json({ ok: true })
}
