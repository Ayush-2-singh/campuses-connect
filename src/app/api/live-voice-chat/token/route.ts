import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const { callId } = await req.json()
    if (!callId) {
      return NextResponse.json({ error: 'callId missing' }, { status: 400 })
    }

    // Scope the client to the caller's own JWT so RLS applies as that user.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    const user = userData.user

    // RLS means the call is only visible when the caller is a group member.
    const { data: call } = await supabase
      .from('live_voice_chat_calls')
      .select('id, group_id')
      .eq('id', callId)
      .maybeSingle()
    if (!call) {
      return NextResponse.json({ error: 'Call not found or not allowed' }, { status: 403 })
    }

    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: user.id,
      name: user.user_metadata?.full_name ?? user.email ?? 'Student',
    })
    at.addGrant({
      roomJoin: true,
      room: `live-voice-chat-${call.id}`,
      canPublish: true,
      canSubscribe: true,
    })

    return NextResponse.json({
      token: await at.toJwt(),
      url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Server error' }, { status: 500 })
  }
}
