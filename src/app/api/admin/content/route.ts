import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null
/** Lazy, request-time init — module-scope createClient() throws at build when
 *  SUPABASE_SERVICE_ROLE_KEY is absent, and a shared client risks cross-user
 *  state. One instance per server process is safe for service-role use. */
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }
  return _supabaseAdmin!
}

// ── Verify admin ──────────────────────────────────────────────
async function verifyAdmin(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const cookieHeader = request.headers.get('cookie') || ''
  const tokenMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
  if (!tokenMatch) return null
  try {
    const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]))
    const accessToken = tokenData.access_token
    if (!accessToken) return null
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken)
    if (error || !user) return null
    const { data: grants } = await getSupabaseAdmin().rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin')
    if (!isAdmin) return null
    return user
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// GET — List all content of a given type
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'notes' // notes, comments, events, polls
  const search = searchParams.get('search') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')

  if (type === 'notes') {
    let query = getSupabaseAdmin()
      .from('notes')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`title.ilike.%${search}%,subject.ilike.%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('notes').select('*', { count: 'exact', head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [], total: count || 0, type: 'notes' })
  }

  if (type === 'posts') {
    let query = getSupabaseAdmin()
      .from('posts')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('body', `%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('posts').select('*', { count: 'exact', head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [], total: count || 0, type: 'posts' })
  }

  if (type === 'comments') {
    let query = getSupabaseAdmin()
      .from('comments')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('body', `%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('comments').select('*', { count: 'exact', head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [], total: count || 0, type: 'comments' })
  }

  if (type === 'events') {
    let query = getSupabaseAdmin()
      .from('events')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('events').select('*', { count: 'exact', head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [], total: count || 0, type: 'events' })
  }

  if (type === 'polls') {
    let query = getSupabaseAdmin()
      .from('polls')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('question', `%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('polls').select('*', { count: 'exact', head: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [], total: count || 0, type: 'polls' })
  }

  // ── Summary counts for all types ──────────────────────────
  if (type === 'summary') {
    const [notes, posts, comments, events, polls] = await Promise.all([
      getSupabaseAdmin().from('notes').select('*', { count: 'exact', head: true }),
      getSupabaseAdmin().from('posts').select('*', { count: 'exact', head: true }),
      getSupabaseAdmin().from('comments').select('*', { count: 'exact', head: true }),
      getSupabaseAdmin().from('events').select('*', { count: 'exact', head: true }),
      getSupabaseAdmin().from('polls').select('*', { count: 'exact', head: true }),
    ])
    return NextResponse.json({
      summary: {
        notes: notes.count || 0,
        posts: posts.count || 0,
        comments: comments.count || 0,
        events: events.count || 0,
        polls: polls.count || 0,
      },
    })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// ═══════════════════════════════════════════════════════════════
// DELETE — Delete content items
// ═══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { type, ids } = body

  if (!type || !ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'type and ids[] required' }, { status: 400 })
  }

  const validTypes = ['notes', 'posts', 'comments', 'events', 'polls']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin().from(type).delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log
  await getSupabaseAdmin()
    .from('audit_log')
    .insert({
      actor_id: admin.id,
      action: `content.delete_${type}`,
      entity_type: type,
      metadata: { ids, count: ids.length },
    })

  return NextResponse.json({ success: true, deleted: ids.length, type })
}
