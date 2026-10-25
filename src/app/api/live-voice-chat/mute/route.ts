import { NextRequest, NextResponse } from 'next/server'
import { RoomServiceClient, TrackType } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { serverError } from '@/lib/api/errors'

/**
 * HOST MUTE — an owner, an admin or a co-admin silences somebody in the call.
 *
 * Two layers, deliberately:
 *   1. `set_live_voice_chat_host_mute()` writes the flag. That RPC is the ONLY
 *      authorisation this feature has: it checks the caller's role in SQL, so
 *      a hand-crafted request from a plain member fails there and nowhere
 *      else. The flag is what the muted client reads to keep its own
 *      microphone off, and what every tile shows.
 *   2. The same flag is pushed to LiveKit itself, which mutes the published
 *      microphone track at the server. That way the audio stops even when the
 *      person's tab is in the background and can not run its own client code.
 *
 * LiveKit is best-effort on purpose: if the voice server is not configured or
 * that person is not connected right now, the flag still stands and the
 * client-side enforcement still applies.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const { callId, targetUserId, muted } = await req.json()
    if (!callId || !targetUserId || typeof muted !== 'boolean') {
      return NextResponse.json({ error: 'callId, targetUserId and muted are required' }, { status: 400 })
    }

    // Scope the client to the caller's own JWT so the RPC runs as them.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
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

    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? null
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    if (url && apiKey && apiSecret) {
      try {
        const roomService = new RoomServiceClient(url, apiKey, apiSecret)
        const roomName = `live-voice-chat-${callId}`
        const participants = await roomService.listParticipants(roomName)
        const target = participants.find((p) => p.identity === targetUserId)
        const microphone = target?.tracks.find((t) => t.type === TrackType.AUDIO)
        if (target && microphone) {
          await roomService.mutePublishedTrack(roomName, target.identity, microphone.sid, muted)
        }
      } catch {
        // Not in the room (or the voice server shrugged): the flag above is
        // already the source of truth, and the client enforces it.
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return serverError('live-voice-chat/mute', e)
  }
}
