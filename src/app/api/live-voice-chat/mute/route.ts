import { NextRequest, NextResponse } from 'next/server'
import { RoomServiceClient, TrackType } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { serverError } from '@/lib/api/errors'

/**
 * HOST MUTE — an owner, an admin or a co-admin silences somebody in the call.
 *
 * Two layers, deliberately:
 *   1. `set_live_voice_chat_host_mute()` writes the flag. That RPC is the ONLY
 *      authorisation the single-person case has: it checks the caller's role
 *      in SQL, so a hand-crafted request from a plain member fails there and
 *      nowhere else. The flag is what the muted client reads to keep its own
 *      microphone off, and what every tile shows.
 *   2. The same flag is pushed to LiveKit itself, which mutes the published
 *      microphone track at the server. That way the audio stops even when the
 *      person's tab is in the background and can not run its own client code.
 *
 * `all: true` is MUTE EVERYONE (the roster panel's button): it runs the same
 * role check first — there the answer is not a count, so the check is done
 * explicitly — then mutes every active participant except the moderator who
 * pressed it, in the database and on LiveKit.
 *
 * LiveKit is best-effort on purpose: if the voice server is not configured or
 * somebody is not connected right now, the flag still stands and the
 * client-side enforcement still applies.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = (await req.json()) as { callId?: string; targetUserId?: string; muted?: boolean; all?: boolean }
    const { callId, targetUserId, muted } = body
    const muteAll = body.all === true
    if (!callId || typeof muted !== 'boolean' || (muteAll ? false : !targetUserId)) {
      return NextResponse.json({ error: 'callId, targetUserId and muted are required' }, { status: 400 })
    }

    // Scope the client to the caller's own JWT so every read runs as them.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    const user = userData.user

    if (muteAll) {
      // "Nobody to mute" and "not allowed" both come back as 0 from the RPC,
      // so the role is decided HERE, before anything is touched.
      const { data: call } = await supabase
        .from('live_voice_chat_calls')
        .select('id, group_id')
        .eq('id', callId)
        .maybeSingle()
      if (!call) {
        return NextResponse.json({ error: 'Call not found or not allowed' }, { status: 403 })
      }
      const [{ data: group }, { data: member }] = await Promise.all([
        supabase.from('live_voice_chat_groups').select('created_by').eq('id', call.group_id).maybeSingle(),
        supabase
          .from('live_voice_chat_members')
          .select('role')
          .eq('group_id', call.group_id)
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
      const role = (member?.role ?? '') as string
      const moderator = group?.created_by === user.id || role === 'admin' || role === 'co-admin'
      if (!moderator) {
        return NextResponse.json(
          { error: 'Only the owner, an admin or a co-admin can mute everybody' },
          { status: 403 }
        )
      }

      const { data: count, error: rpcErr } = await supabase.rpc('set_live_voice_chat_host_mute_all', {
        p_call_id: callId,
        p_muted: muted,
      })
      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 400 })
      }

      await applyLiveKitMute(callId, user.id, muted, true)
      return NextResponse.json({ ok: true, count: typeof count === 'number' ? count : 0 })
    }

    const { data: allowed, error: rpcErr } = await supabase.rpc('set_live_voice_chat_host_mute', {
      p_call_id: callId,
      p_target: targetUserId,
      p_muted: muted,
    })
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 })
    }
    if (allowed !== true) {
      return NextResponse.json({ error: 'Only the owner, an admin or a co-admin can mute somebody' }, { status: 403 })
    }

    await applyLiveKitMute(callId, user.id, muted, false, targetUserId)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return serverError('live-voice-chat/mute', e)
  }
}

/**
 * Ask LiveKit to mute the published microphone tracks itself. Best-effort:
 * if the voice server is not configured, or somebody is not in the room right
 * now, the database flag is already the source of truth and the client
 * enforces it — neither case is worth failing the request over.
 */
async function applyLiveKitMute(
  callId: string,
  actorId: string,
  muted: boolean,
  everyone: boolean,
  targetUserId?: string
) {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? null
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) return

  try {
    const roomService = new RoomServiceClient(url, apiKey, apiSecret)
    const roomName = `live-voice-chat-${callId}`
    const participants = await roomService.listParticipants(roomName)
    const wanted = everyone
      ? // Whoever pressed it keeps their own microphone: mute ALL means the
        // room, not the moderator.
        participants.filter((p) => p.identity !== actorId)
      : participants.filter((p) => p.identity === targetUserId)

    for (const participant of wanted) {
      const microphone = participant.tracks.find((t) => t.type === TrackType.AUDIO)
      if (!microphone) continue
      try {
        await roomService.mutePublishedTrack(roomName, participant.identity, microphone.sid, muted)
      } catch {
        // Not publishing right now (or the server shrugged) — the flag stands.
      }
    }
  } catch {
    // Same: the database is the source of truth.
  }
}
