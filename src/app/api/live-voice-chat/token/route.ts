import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'

/**
 * Voice server URL: prefer the build-time public var, fall back to the
 * runtime-only LIVEKIT_URL. On Vercel the NEXT_PUBLIC_ name is only inlined
 * when it existed at BUILD time — if it was added later (or never set), the
 * server-side LIVEKIT_* vars still work here because this route runs on the
 * server and can read plain env vars at runtime.
 */
const livekitUrl = () => process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? null

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

    // Fail loudly with an actionable message when the voice server is not
    // configured — an opaque client-side connect error is much harder to
    // diagnose than this.
    const url = livekitUrl()
    if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
      console.error('[voice-token] LiveKit env incomplete:', {
        hasUrl: !!url,
        hasKey: !!process.env.LIVEKIT_API_KEY,
        hasSecret: !!process.env.LIVEKIT_API_SECRET,
      })
      return NextResponse.json(
        {
          error:
            'Voice chat is not configured on the server yet. Set NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET, then redeploy.',
        },
        { status: 500 }
      )
    }

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
      // Emoji reactions travel over the LiveKit data channel — no DB, no
      // polling, perfectly in sync with the voice room's lifetime.
      canPublishData: true,
      canSubscribe: true,
    })

    return NextResponse.json({
      token: await at.toJwt(),
      url,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Server error' }, { status: 500 })
  }
}
