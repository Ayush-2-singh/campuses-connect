import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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

    const { data: grants } = await supabaseAdmin.rpc('my_admin_grants')
    const grantsArr = (grants as any[]) || []
    const isAdmin = grantsArr.some((g: any) => g.admin_type === 'platform_admin')
    if (!isAdmin) return null

    return user
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// GET — List all conversations with last message & participant info
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const conversationId = searchParams.get('conversation_id') || ''
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const offset = parseInt(searchParams.get('offset') || '0')

  // ── Get specific conversation messages ────────────────────
  if (conversationId) {
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*, profiles!messages_sender_id_fkey(full_name, username, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get participants
    const { data: participants } = await supabaseAdmin
      .from('conversation_participants')
      .select('profile_id, profiles(full_name, username, avatar_url)')
      .eq('conversation_id', conversationId)

    // Get total count
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)

    return NextResponse.json({
      messages: messages || [],
      participants: participants || [],
      total: count || 0,
    })
  }

  // ── List all conversations ────────────────────────────────
  const query = supabaseAdmin
    .from('conversations')
    .select(
      `
      id,
      created_at,
      updated_at,
      conversation_participants(
        profile_id,
        profiles(full_name, username, avatar_url, campus_id)
      )
    `
    )
    .order('updated_at', { ascending: false })

  const { data: conversations, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get last message for each conversation
  const convIds = (conversations || []).map((c: any) => c.id)
  let lastMessages: any[] = []
  if (convIds.length > 0) {
    // Use raw query via RPC or subquery for last message per conversation
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, sender_id, created_at, message_type, is_deleted')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 3) // get some recent messages per conv

    // Deduplicate: keep only the latest per conversation
    const seen = new Set<string>()
    lastMessages = (msgs || []).filter((m: any) => {
      if (seen.has(m.conversation_id)) return false
      seen.add(m.conversation_id)
      return true
    })
  }

  // Get message counts per conversation
  const convCounts: Record<string, number> = {}
  if (convIds.length > 0) {
    for (const cid of convIds) {
      const { count } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', cid)
      convCounts[cid] = count || 0
    }
  }

  // Merge
  const enriched = (conversations || []).map((c: any) => {
    const lastMsg = lastMessages.find((m: any) => m.conversation_id === c.id)
    const participantNames = (c.conversation_participants || [])
      .map((p: any) => p.profiles?.full_name || p.profiles?.username || 'Unknown')
      .join(', ')

    return {
      id: c.id,
      created_at: c.created_at,
      updated_at: c.updated_at,
      participant_names: participantNames,
      participants: c.conversation_participants || [],
      last_message: lastMsg || null,
      message_count: convCounts[c.id] || 0,
    }
  })

  // Total conversation count
  const { count: totalConvs } = await supabaseAdmin.from('conversations').select('*', { count: 'exact', head: true })

  // Search filter (client-side for now since conversations don't have text)
  let filtered = enriched
  if (search) {
    const q = search.toLowerCase()
    filtered = enriched.filter(
      (c: any) => c.participant_names.toLowerCase().includes(q) || c.last_message?.content?.toLowerCase().includes(q)
    )
  }

  return NextResponse.json({
    conversations: filtered,
    total: totalConvs || 0,
  })
}

// ═══════════════════════════════════════════════════════════════
// DELETE — Delete messages (single, conversation, or bulk)
// ═══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { message_ids, conversation_id, action } = body

  // ── Delete single messages ────────────────────────────────
  if (message_ids && Array.isArray(message_ids)) {
    // Soft delete: mark as deleted
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ is_deleted: true, content: '[Message deleted by admin]' })
      .in('id', message_ids)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log the action
    await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: admin.id,
      action: 'messages.delete',
      entity_type: 'message',
      metadata: { message_ids, count: message_ids.length },
    })

    return NextResponse.json({ success: true, deleted: message_ids.length })
  }

  // ── Delete all messages in a conversation ──────────────────
  if (conversation_id && action === 'delete_conversation') {
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversation_id)

    // Soft delete all messages
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ is_deleted: true, content: '[Message deleted by admin]' })
      .eq('conversation_id', conversation_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also delete conversation participants
    await supabaseAdmin.from('conversation_participants').delete().eq('conversation_id', conversation_id)

    // Delete the conversation itself
    await supabaseAdmin.from('conversations').delete().eq('id', conversation_id)

    // Log
    await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: admin.id,
      action: 'messages.delete_conversation',
      entity_type: 'conversation',
      entity_id: conversation_id,
      metadata: { message_count: count || 0 },
    })

    return NextResponse.json({ success: true, deleted: count || 0 })
  }

  // ── Hard delete (permanent) ───────────────────────────────
  if (conversation_id && action === 'hard_delete_conversation') {
    // Delete all messages permanently
    await supabaseAdmin.from('messages').delete().eq('conversation_id', conversation_id)

    await supabaseAdmin.from('conversation_participants').delete().eq('conversation_id', conversation_id)

    await supabaseAdmin.from('conversations').delete().eq('id', conversation_id)

    await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: admin.id,
      action: 'messages.hard_delete_conversation',
      entity_type: 'conversation',
      entity_id: conversation_id,
      metadata: { permanent: true },
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
