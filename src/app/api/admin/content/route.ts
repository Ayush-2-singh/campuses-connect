import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin, requireAuth, scopeFilterFor, MODERATOR_ROLES } from '@/lib/api/middleware'

/**
 * API `type` → real table name.
 * The API keeps the friendly `comments` type, but the table is `post_comments`
 * (there is no `comments` table — that mismatch made every comment listing and
 * comment delete fail against PostgREST).
 */
const TABLE_BY_TYPE: Record<string, string> = {
  notes: 'notes',
  posts: 'posts',
  comments: 'post_comments',
  events: 'events',
  polls: 'polls',
}

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

// ═══════════════════════════════════════════════════════════════
// GET — List all content of a given type
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

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
      .from('post_comments')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('body', `%${search}%`)
    }
    const { data, error } = await query.range(offset, offset + limit - 1)
    const { count } = await getSupabaseAdmin().from('post_comments').select('*', { count: 'exact', head: true })
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
      getSupabaseAdmin().from('post_comments').select('*', { count: 'exact', head: true }),
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
  // Moderators (incl. community admins) may reach this handler; scopeFilterFor()
  // below decides row by row whether this admin owns the target. requireAdmin()
  // alone excluded community admins, who do see the delete button in the UI.
  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response
  const admin = auth.auth

  if (!admin.adminTypes.some((t) => (MODERATOR_ROLES as readonly string[]).includes(t))) {
    return NextResponse.json({ error: 'Forbidden. Moderator access required.' }, { status: 403 })
  }

  const body = await request.json()
  const { type, ids } = body

  if (!type || !ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'type and ids[] required' }, { status: 400 })
  }

  const validTypes = ['notes', 'posts', 'comments', 'events', 'polls']
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const { isPlatform, canModerateRow } = scopeFilterFor(admin)
  const table = TABLE_BY_TYPE[type]
  const selectScope = 'id, campus_id, college_id, community_id'
  let allowedIds: string[] = ids

  if (type === 'posts') {
    const { data, error } = await getSupabaseAdmin().from('posts').select(selectScope).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    allowedIds = (data || []).filter(canModerateRow).map((r: any) => r.id)
  } else if (type === 'comments') {
    // A comment inherits the scope of the post it lives on.
    const { data: commentRows, error } = await getSupabaseAdmin()
      .from('post_comments')
      .select('id, post_id')
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const postIds = [...new Set((commentRows || []).map((c: any) => c.post_id))]
    const { data: postRows, error: postError } = postIds.length
      ? await getSupabaseAdmin().from('posts').select(selectScope).in('id', postIds)
      : { data: [] as any[], error: null }
    if (postError) return NextResponse.json({ error: postError.message }, { status: 500 })

    const allowedPosts = new Set((postRows || []).filter(canModerateRow).map((p: any) => p.id))
    allowedIds = (commentRows || []).filter((c: any) => allowedPosts.has(c.post_id)).map((c: any) => c.id)
  } else if (!isPlatform && !admin.adminTypes.includes('campus_admin')) {
    return NextResponse.json(
      { error: 'Forbidden. Only platform or campus admins may delete this content type.' },
      { status: 403 }
    )
  }

  if (allowedIds.length === 0) {
    return NextResponse.json(
      { error: 'Forbidden. You can only moderate content inside your own campus or community.' },
      { status: 403 }
    )
  }

  const { error } = await getSupabaseAdmin().from(table).delete().in('id', allowedIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log (best-effort — don't fail the delete if audit_log insert fails)
  try {
    await getSupabaseAdmin()
      .from('audit_log')
      .insert({
        actor_id: admin.userId,
        action: `content.delete_${type}`,
        entity_type: type,
        metadata: { ids: allowedIds, count: allowedIds.length, skipped: ids.length - allowedIds.length },
      })
  } catch (auditErr) {
    console.warn('[admin/content] audit_log insert failed:', auditErr)
  }

  return NextResponse.json({
    success: true,
    deleted: allowedIds.length,
    skipped: ids.length - allowedIds.length,
    type,
  })
}
