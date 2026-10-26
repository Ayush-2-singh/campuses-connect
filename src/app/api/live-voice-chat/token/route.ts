import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { serverError } from '@/lib/api/errors'

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

    // Rate limit per user: a LiveKit token is real server cost, and this
    // route is the only place that mints them. 60/minute is generous for
    // reconnect churn and impossible to keep up as a token mill.
    // (Inline RPC on the JWT-scoped client — this route is Bearer-auth, so
    // the cookie-based rateLimit helper cannot see the caller.)
    const { data: rlAllowed } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_endpoint: 'voice:token',
      p_limit: 60,
      p_window_minutes: 1,
    })
    if (rlAllowed === false) {
      return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 })
    }

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
      .select('id, group_id, locked')
      .eq('id', callId)
      .maybeSingle()
    if (!call) {
      return NextResponse.json({ error: 'Call not found or not allowed' }, { status: 403 })
    }

    // ── ROOM LOCK + ROOM SIZE — the actual door ───────────────────────────
    // A locked room, or one already at its cap, hands out no token to anyone
    // NEW: being shut out therefore means never reaching the LiveKit room at
    // all, rather than joining a call that then ignores you. Whoever runs the
    // room (owner/admin/co-admin) and anybody already inside always keep
    // their way back in — a lock must never lock the host out.
    const [{ data: group }, { data: member }] = await Promise.all([
      supabase
        .from('live_voice_chat_groups')
        .select('created_by, max_participants')
        .eq('id', call.group_id)
        .maybeSingle(),
      supabase
        .from('live_voice_chat_members')
        .select('role')
        .eq('group_id', call.group_id)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    const myRole = (member?.role ?? '') as string
    const runsRoom = group?.created_by === user.id || myRole === 'admin' || myRole === 'co-admin'
    if (!runsRoom) {
      // ── KICKED — the door stays shut for the rest of THIS call ───────────
      // Checked before the "already inside" shortcut below: a removed person's
      // participant row still exists (with left_at set), so without this they
      // would be treated as someone who left and may walk back in.
      const { data: kicked } = await supabase
        .from('live_voice_chat_kicks')
        .select('user_id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (kicked) {
        return NextResponse.json(
          { error: 'A moderator removed you from this call. You can join the next one.' },
          { status: 403 }
        )
      }

      const { data: mine } = await supabase
        .from('live_voice_chat_participants')
        .select('user_id')
        .eq('call_id', callId)
        .eq('user_id', user.id)
        .maybeSingle()
      const alreadyIn = !!mine
      if (call.locked && !alreadyIn) {
        return NextResponse.json({ error: 'This room is locked — the host has to let you in.' }, { status: 403 })
      }
      const max = (group?.max_participants ?? null) as number | null
      if (max !== null && !alreadyIn) {
        const { count } = await supabase
          .from('live_voice_chat_participants')
          .select('user_id', { count: 'exact', head: true })
          .eq('call_id', callId)
          .is('left_at', null)
        if ((count ?? 0) >= max) {
          return NextResponse.json({ error: 'This room is full. An admin has to make it bigger.' }, { status: 409 })
        }
      }
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
    return serverError('live-voice-chat/token', e)
  }
}
