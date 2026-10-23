import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cleanChatText, CALL_CHAT_MAX_THREAD } from '@/lib/callChat'

/**
 * In-call chat history.
 *
 * The live delivery is still the call's data channel — a message appears
 * instantly for everyone already in the room. This route exists for the two
 * gaps that made chat feel broken in a study room:
 *   • a late joiner now loads the thread when the panel opens;
 *   • a link shared before they arrived is still there afterwards.
 *
 * Authorization is the database's: the caller's Supabase session is used for
 * the read/write, and RLS only allows members of the room. The client never
 * sends its own user id — the row's `user_id` is taken from the session.
 */

async function serverClient(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
  return supabase
}

export async function GET(request: NextRequest) {
  const supabase = await serverClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const callId = new URL(request.url).searchParams.get('callId')
  if (!callId) return NextResponse.json({ error: 'callId required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('live_voice_chat_messages')
    .select('id, call_id, group_id, user_id, body, created_at')
    .eq('call_id', callId)
    .order('created_at', { ascending: false })
    .limit(CALL_CHAT_MAX_THREAD)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    // Newest-first in SQL (so LIMIT keeps the latest), oldest-first on the wire.
    messages: (data || []).reverse(),
    me: user.id,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await serverClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const callId = typeof body?.callId === 'string' ? body.callId : ''
  const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
  const text = cleanChatText(body?.body)

  if (!callId || !groupId) return NextResponse.json({ error: 'callId and groupId required.' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Empty message.' }, { status: 400 })

  const { error } = await supabase.from('live_voice_chat_messages').insert({
    call_id: callId,
    group_id: groupId,
    user_id: user.id,
    body: text,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
