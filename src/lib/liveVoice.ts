/**
 * LIVE VOICE — the one client-side read path for "is anybody actually inside
 * a voice room RIGHT NOW?".
 *
 * Every surface that says LIVE (the hub badges, the room header, the floating
 * voice card, the chat page flash card, the home cards) goes through here, so
 * they can never disagree with each other or claim a room is live when it
 * emptied out.
 *
 * Primary path: the live_voice_chat_live_rooms() RPC (migration
 * 20260927_voice_live_truth.sql) — a room qualifies only when its call is
 * active AND at least one participant was heartbeat-seen in the last 150s,
 * scoped to the groups the caller may see (global / own campus; anon sees
 * global only). The RPC also heals ghost rows as a side effect.
 *
 * Fallback path: when the migration is not applied yet (PGRST202 / missing
 * function), fall back to reading active calls + participant rows directly.
 * RLS only exposes participant rows for groups you belong to, so a room whose
 * presence we cannot verify is DROPPED rather than assumed live — honest
 * silence beats a fake LIVE badge.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface LiveVoiceRoom {
  groupId: string
  callId: string
  name: string
  icon: string | null
  /** Participants actually inside right now — always ≥ 1 by construction. */
  participantCount: number
  /** Epoch ms of call start (0 when unknown). */
  startedAt: number
}

interface LiveRoomsRpcRow {
  group_id?: string
  call_id?: string
  group_name?: string | null
  group_icon?: string | null
  participant_count?: number | string | null
  started_at?: string | null
}

function fromRpcRow(r: LiveRoomsRpcRow): LiveVoiceRoom | null {
  if (!r.group_id || !r.call_id) return null
  const count = Number(r.participant_count ?? 0)
  if (!Number.isFinite(count) || count < 1) return null // never surface an empty room
  return {
    groupId: r.group_id,
    callId: r.call_id,
    name: r.group_name || 'Voice room',
    icon: r.group_icon ?? null,
    participantCount: count,
    startedAt: r.started_at ? new Date(r.started_at).getTime() : 0,
  }
}

/**
 * Rooms with at least one real user inside them right now.
 * Never throws — a failure degrades to fewer claimed-live rooms, never to a
 * wrong "LIVE".
 */
export async function fetchLiveVoiceRooms(sb: SupabaseClient): Promise<LiveVoiceRoom[]> {
  // ── Primary: the honest RPC ───────────────────────────────────────────────
  try {
    const { data, error } = await sb.rpc('live_voice_chat_live_rooms')
    if (!error && Array.isArray(data)) {
      return (data as LiveRoomsRpcRow[]).map(fromRpcRow).filter((r): r is LiveVoiceRoom => r !== null)
    }
  } catch {
    /* RPC not deployed yet (or offline) — fall through to the direct read */
  }

  // ── Fallback: direct tables, presence verified within RLS ─────────────────
  try {
    const { data: calls } = await sb
      .from('live_voice_chat_calls')
      .select('id, group_id, started_at, live_voice_chat_groups(name, icon)')
      .eq('status', 'active')
      .limit(20)
    const callRows = (calls as any[]) || []
    if (callRows.length === 0) return []

    const { data: parts } = await sb
      .from('live_voice_chat_participants')
      .select('call_id, left_at')
      .in(
        'call_id',
        callRows.map((c) => c.id)
      )

    const present = new Map<string, number>()
    for (const p of (parts as any[]) || []) {
      if (p.left_at) continue
      present.set(p.call_id, (present.get(p.call_id) || 0) + 1)
    }

    return callRows.flatMap((c): LiveVoiceRoom[] => {
      const n = present.get(c.id) || 0
      // 0 present means either "empty" or "RLS hides the rows from me" —
      // both mean we must NOT claim this room is live.
      if (n < 1) return []
      return [
        {
          groupId: c.group_id,
          callId: c.id,
          name: c.live_voice_chat_groups?.name || 'Voice room',
          icon: c.live_voice_chat_groups?.icon ?? null,
          participantCount: n,
          startedAt: c.started_at ? new Date(c.started_at).getTime() : 0,
        },
      ]
    })
  } catch {
    return []
  }
}
