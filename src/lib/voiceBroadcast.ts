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
 * TRUTH note: an 'active' call row is NOT a live room — crashed tabs leave
 * ghost participants and active rows with nobody inside. Realtime events are
 * therefore only HINTS: a DELETE/ended event hides the card immediately, but
 * the card only turns ON after fetchLiveVoiceRooms() confirms at least one
 * heartbeat-fresh participant is really inside (20260927_voice_live_truth).
 */

import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms, type LiveVoiceRoom } from '@/lib/liveVoice'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface LiveCallState {
  /** True when a room has at least one real user inside it right now. */
  active: boolean
  groupId: string | null
  /** Id of the live call (joinable via RPC after joining the group). */
  callId: string | null
  /** People actually inside the call (fresh heartbeat). 0 = unknown. */
  count: number
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

const state: LiveCallState = { active: false, groupId: null, callId: null, count: 0, since: 0 }
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

/** Apply the honest read path's answer (rooms with someone inside). */
function applyRooms(rooms: LiveVoiceRoom[]) {
  const room = rooms[0] ?? null
  if (room) {
    state.active = true
    state.groupId = room.groupId
    state.callId = room.callId
    state.count = room.participantCount
    if (!state.since) state.since = Date.now()
  } else {
    state.active = false
    state.groupId = null
    state.callId = null
    state.count = 0
    state.since = 0
  }
  emit()
}

/** One seed read on subscribe; realtime events + the fallback poll re-run it. */
async function seed() {
  try {
    const sb = createClient()
    applyRooms(await fetchLiveVoiceRooms(sb))
  } catch {
    /* offline — realtime events or the poll will correct us */
  }
}

/**
 * Realtime events only say "a call row moved", never "somebody is inside" —
 * so an ON hint is debounced into ONE honest re-read instead of being
 * trusted directly.
 */
let reseedTimer: ReturnType<typeof setTimeout> | null = null
function scheduleReseed() {
  if (reseedTimer || typeof window === 'undefined') return
  reseedTimer = setTimeout(() => {
    reseedTimer = null
    void seed()
  }, 600)
}

function ensureChannel() {
  if (channel || typeof window === 'undefined') return
  const sb = createClient()
  const ch: any = sb
    .channel('voice-broadcast:calls')
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'live_voice_chat_calls' },
      (payload: { eventType?: string; new?: LiveCallRow | null; old?: LiveCallRow | null }) => {
        const row = payload?.new ?? payload?.old ?? null
        if (payload?.eventType === 'DELETE' || row?.status === 'ended') {
          applyRooms([]) // the call is over — hide immediately
        } else {
          // A call row appeared/changed — verify real presence before showing.
          scheduleReseed()
        }
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
  if (reseedTimer) {
    clearTimeout(reseedTimer)
    reseedTimer = null
  }
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
