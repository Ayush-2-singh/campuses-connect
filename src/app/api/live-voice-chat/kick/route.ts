import { NextRequest, NextResponse } from 'next/server'
import { RoomServiceClient } from 'livekit-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { serverError } from '@/lib/api/errors'

/**
 * KICK — an owner, an admin or a co-admin removes somebody from the call.
 *
 * Two layers, same shape as the mute route:
 *   1. `kick_live_voice_chat_participant()` is the authorisation. It checks the
 *      caller's rank in SQL, refuses anybody at or above that rank (so a
 *      co-admin can not remove an admin, and nobody removes the owner), closes
 *      the participant's row and records the removal in `live_voice_chat_kicks`
 *      — the list the token route reads, so the person can not rejoin this call
 *      at all.
 *   2. LiveKit is then asked to drop their connection, so they leave NOW
 *      instead of when their tab next notices. Best-effort: when the voice
 *      server is unreachable the kick still stands — the token route is what
 *      keeps them out.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = (await req.json()) as { callId?: string; targetUserId?: string }
    const { callId, targetUserId } = body
    if (!callId || !targetUserId) {
      return NextResponse.json({ error: 'callId and targetUserId are required' }, { status: 400 })
    }

    // Scope the client to the caller's own JWT so every read runs as them.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const { data: allowed, error: rpcErr } = await supabase.rpc('kick_live_voice_chat_participant', {
      p_call_id: callId,
      p_target: targetUserId,
    })
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 })
    }
    if (allowed !== true) {
      return NextResponse.json({ error: 'Only somebody who runs this room can remove that person.' }, { status: 403 })
    }

    await removeFromLiveKit(callId, targetUserId)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return serverError('live-voice-chat/kick', e)
  }
}

/**
 * Ask LiveKit to disconnect them. Best-effort by design: the database already
 * remembers the removal, and the token route will not let them back in, so a
 * missing voice-server config is not worth failing the request over.
 */
async function removeFromLiveKit(callId: string, targetUserId: string) {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? null
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!url || !apiKey || !apiSecret) return

  try {
    const roomService = new RoomServiceClient(url, apiKey, apiSecret)
    await roomService.removeParticipant(`live-voice-chat-${callId}`, targetUserId)
  } catch {
    // Not in the room right now (or the server shrugged) — the kick stands.
  }
}
