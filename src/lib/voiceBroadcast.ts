/**
 * Live voice-call broadcast — one tiny client-side store that tracks the
 * platform's currently-active Live Voice Chat call so ANY page can show a
 * live "🎙 Room is live" card without joining it.
 *
 * Cost profile (deliberately cheap):
 *  - ONE Supabase Realtime channel per browser tab, shared by every mounted
 *    card (module-level singleton + refcount).
 *  - The channel listens to `live_voice_chat_calls` INSERT/UPDATE/DELETE
 *    events only. No presence, no storage, no extra tables.
 *  - When Realtime is unavailable it falls back to a SINGLE 45s head-count
 *    poll — comparable to the unread-count poll the shell already runs.
 *  - A tab hidden for >2 min unsubscribes entirely (battery + egress saver)
 *    and re-subscribes when visible again.
 *  - Zero cards mounted ⇒ full teardown, zero cost.
 *
 * RLS note: `live_voice_chat_calls` SELECT is restricted to group members, so
 * non-members never read participant rows. The broadcast card only needs
 * "a call is live in group X", which realtime events deliver without a read.
 */

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface LiveCallState {
  /** True when some group has an active call right now. */
  active: boolean
  groupId: string | null
  /** Call id when the current user can read the row (member); else null. */
  callId: string | null
  /** Epoch ms of the moment we first saw this call go live (0 = unknown). */
  since: number
}

type Listener = (state: LiveCallState) => void

const HIDDEN_UNSUBSCRIBE_MS = 120_000
const FALLBACK_POLL_MS = 45_000

interface LiveCallRow {
  id: string
  group_id: string
  status: string
}

const listeners = new Set<Listener>()
let channel: RealtimeChannel | null = null
let subCount = 0
let visibilityTimer: ReturnType<typeof setTimeout> | null = null
let fallbackPoll: ReturnType<typeof setInterval> | null = null
let started = false

const state: LiveCallState = { active: false, groupId: null, callId: null, since: 0 }
let lastEmit = JSON.stringify(state)

function emit(force = false) {
  const next = JSON.stringify(state)
  if (!force && next === lastEmit) return
  lastEmit = next
  for (const fn of Array.from(listeners)) {
    try {
      fn({ ...state })
    } catch {
      /* a bad listener must never kill the tracker */
    }
  }
}

function applyRow(row: LiveCallRow | null) {
  if (row && row.status === 'active') {
    state.active = true
    state.groupId = row.group_id
    state.callId = row.id
    if (!state.since) state.since = Date.now()
  } else {
    state.active = false
    state.groupId = null
    state.callId = null
    state.since = 0
  }
  emit()
}

/** One seed read on subscribe (member-RLS'd), then realtime keeps it fresh. */
async function seed() {
  try {
    const sb = createClient()
    const { data } = await sb
      .from('live_voice_chat_calls')
      .select('id, group_id, status')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    applyRow((data as unknown as LiveCallRow) || null)
  } catch {
    /* offline — realtime events or the poll will correct us */
  }
}

function ensureChannel() {
  if (channel || typeof window === 'undefined') return
  const sb = createClient()
  const ch: any = sb
    .channel('voice-broadcast:calls')
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'live_voice_chat_calls' },
      (payload: { new?: LiveCallRow | null; old?: LiveCallRow | null }) => {
        const newRow = payload?.new ?? null
        const oldRow = payload?.old ?? null
        // DELETE carries only `old`; UPDATE/INSERT carry `new`.
        applyRow(newRow || oldRow)
      }
    )
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        void seed()
        stopFallbackPoll()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startFallbackPoll()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Channel died — drop it so a future subscribe can rebuild cleanly.
        channel = null
      }
    })
  channel = ch
}

function startFallbackPoll() {
  if (fallbackPoll || typeof window === 'undefined') return
  fallbackPoll = setInterval(() => void seed(), FALLBACK_POLL_MS)
}

function stopFallbackPoll() {
  if (fallbackPoll) {
    clearInterval(fallbackPoll)
    fallbackPoll = null
  }
}

/** Tab hidden >2 min ⇒ unsubscribe everything; visible again ⇒ resubscribe. */
function handleVisibility() {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') {
    if (!visibilityTimer) {
      visibilityTimer = setTimeout(shutdown, HIDDEN_UNSUBSCRIBE_MS)
    }
  } else {
    if (visibilityTimer) {
      clearTimeout(visibilityTimer)
      visibilityTimer = null
    }
    if (subCount > 0 && !channel) ensureChannel()
  }
}

function shutdown() {
  stopFallbackPoll()
  if (channel) {
    const sb = createClient()
    void sb.removeChannel(channel)
    channel = null
  }
  if (state.active) {
    // Keep last-known state on screen but mark the timer unknown.
    state.since = 0
    emit(true)
  }
}

export function subscribeVoiceBroadcast(fn: Listener): () => void {
  listeners.add(fn)
  subCount++
  if (!started && typeof window !== 'undefined') {
    started = true
    ensureChannel()
    document.addEventListener('visibilitychange', handleVisibility)
  }
  // Deliver the current state immediately so the UI never flashes.
  fn({ ...state })
  return () => {
    listeners.delete(fn)
    subCount = Math.max(0, subCount - 1)
    if (subCount === 0 && !visibilityTimer) {
      // No cards mounted — tear down to keep zero cost when unused.
      shutdown()
      started = false
    }
  }
}

export function getVoiceBroadcastState(): LiveCallState {
  return { ...state }
}
