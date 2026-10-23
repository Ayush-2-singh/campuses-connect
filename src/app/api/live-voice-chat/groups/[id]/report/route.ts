import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/live-voice-chat/groups/[id]/report — flag a room.
 *
 * The report is written with the caller's own session, so RLS enforces the two
 * rules that matter: you are a member of the room, and the report is yours.
 * Admins read reports through the service-role client.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Room id required.' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (reason.length < 3)
    return NextResponse.json({ error: 'Tell us what is wrong (at least 3 characters).' }, { status: 400 })

  const { error } = await supabase.from('live_voice_chat_reports').insert({
    group_id: id,
    reporter_id: user.id,
    target_id: null,
    reason,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
