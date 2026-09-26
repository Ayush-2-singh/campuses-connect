'use client'

/**
 * VOICE CHAT BROADCAST CARD — "who is live right now", visible on every page.
 *
 * Behaviour (WhatsApp/Discord-style):
 *  - A compact pill floats bottom-right on every page showing "🎙 Room live · N in call".
 *  - It collapses into a small round mic badge; tapping expands a dropdown card
 *    with the room details and a Join button. Expanded/collapsed state persists
 *    in sessionStorage so navigating pages does not force it open again.
 *  - Fully dismissible per-tab: ✕ hides it until a NEW call starts (the dismissal
 *    is keyed to the call id, so a genuinely new broadcast reappears).
 *  - Live updates arrive over ONE shared realtime channel (see voiceBroadcast.ts)
 *    — participant count, "live for Xm", start/end all update dynamically.
 *  - Auto-hides on the call page itself and on the /live-voice-chat hub
 *    (the hub has its own LIVE badges; showing the card there is noise).
 *
 * Cost: one shared realtime subscription for the whole tab; no polling while
 * realtime is healthy; unsubscribes when the tab is hidden for >2 min.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'
import { subscribeVoiceBroadcast, type LiveCallState } from '@/lib/voiceBroadcast'

const DISMISS_KEY = 'cc-voice-card-dismissed-call'

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function readExpanded(): boolean {
  try {
    return sessionStorage.getItem('cc-voice-card-expanded') === '1'
  } catch {
    return false
  }
}

export default function VoiceChatCard() {
  const router = useRouter()
  const [state, setState] = useState<LiveCallState>({ active: false, groupId: null, callId: null, since: 0 })
  const [open, setOpen] = useState(false)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [group, setGroup] = useState<{
    id: string
    name: string
    icon: string | null
    section: string
    scope: string
  } | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [isMember, setIsMember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [canReadRow, setCanReadRow] = useState(false)
  const seenCallRef = useRef<string | null>(null)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }, [])

  // ── Live call state (one shared realtime channel for the whole tab) ──
  useEffect(() => {
    const unsub = subscribeVoiceBroadcast((next) => {
      setState(next)
      if (next.callId && next.callId !== seenCallRef.current) {
        // A NEW call started — revive a previously dismissed card.
        seenCallRef.current = next.callId
        setDismissedFor((d) => (d === next.callId ? null : d))
      }
      if (!next.active) seenCallRef.current = null
    })
    // Restore persisted UI state after mount (SSR-safe).
    setDismissedFor(readDismissed())
    setOpen(readExpanded())
    return unsub
  }, [])

  // "Live for Xm" ticker — only while a card is actually on screen.
  useEffect(() => {
    if (!state.active || !open) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [state.active, open])

  // ── Room details + membership + live participant count ──
  // Non-members cannot read the call row (RLS), but they still see the card —
  // they just get "room is live" without participant names/counts.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!state.active || !state.groupId) {
        setGroup(null)
        setParticipantCount(0)
        setIsMember(false)
        setCanReadRow(false)
        return
      }
      const sb = getSupabase()
      const { data: g } = await sb
        .from('live_voice_chat_groups')
        .select('id, name, icon, section, scope')
        .eq('id', state.groupId!)
        .maybeSingle()
      if (cancelled) return
      setGroup(
        (g as typeof group) || {
          id: state.groupId!,
          name: 'Voice room',
          icon: '🎙️',
          section: 'random',
          scope: 'global',
        }
      )

      // Membership check (cheap, indexed).
      const {
        data: { user },
      } = await sb.auth.getUser()
      if (cancelled) return
      let member = false
      if (user) {
        const { data: mem } = await sb
          .from('live_voice_chat_members')
          .select('group_id')
          .eq('group_id', state.groupId!)
          .eq('user_id', user.id)
          .maybeSingle()
        member = !!mem
      }
      setIsMember(member)

      // Participant count only resolves for members (RLS gates the read).
      if (state.callId && member) {
        const { data: parts } = await sb
          .from('live_voice_chat_participants')
          .select('user_id, left_at')
          .eq('call_id', state.callId!)
        if (cancelled) return
        setCanReadRow(true)
        setParticipantCount((parts || []).filter((p: any) => !p.left_at).length)
      } else {
        setCanReadRow(false)
        setParticipantCount(0)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [state.active, state.groupId, state.callId, getSupabase])

  // Refresh the participant count while the card is open (members only).
  useEffect(() => {
    if (!state.active || !open || !isMember || !state.callId) return
    const sb = getSupabase()
    const refresh = async () => {
      const { data: parts } = await sb
        .from('live_voice_chat_participants')
        .select('user_id, left_at')
        .eq('call_id', state.callId!)
      setParticipantCount((parts || []).filter((p: any) => !p.left_at).length)
    }
    const t = setInterval(refresh, 20_000)
    return () => clearInterval(t)
  }, [state.active, open, isMember, state.callId, getSupabase])

  // ── Join flow (mirrors the room page: join group → start/join call → go) ──
  const join = async () => {
    if (!state.groupId || busy) return
    setBusy(true)
    const sb = getSupabase()

    let callId: string | null = state.callId
    if (!isMember) {
      const { error: joinErr } = await sb.rpc('join_live_voice_chat_group', { p_group_id: state.groupId })
      if (joinErr) {
        setBusy(false)
        router.push('/live-voice-chat')
        return
      }
    }
    if (callId) {
      await sb.rpc('join_live_voice_chat_call', { p_call_id: callId })
    } else {
      const { data: started } = await sb.rpc('start_live_voice_chat_call', { p_group_id: state.groupId })
      callId = (started as string) || null
    }
    setBusy(false)
    if (!callId) {
      router.push(`/live-voice-chat/${state.groupId}`)
      return
    }
    router.push(`/live-voice-chat/${state.groupId}/call?callId=${callId}`)
  }

  const dismiss = () => {
    setDismissedFor(state.callId || 'current')
    try {
      sessionStorage.setItem(DISMISS_KEY, state.callId || 'current')
    } catch {
      /* ignore */
    }
  }

  const toggle = () => {
    setOpen((o) => {
      try {
        sessionStorage.setItem('cc-voice-card-expanded', o ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !o
    })
  }

  const liveFor = useMemo(() => {
    if (!state.since) return null
    const mins = Math.max(1, Math.floor((now - state.since) / 60_000))
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
  }, [state.since, now])

  // Hidden while nothing is live, while dismissed for this call, or on the
  // voice-chat pages themselves (the hub + room + call already show state).
  const hideOnPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/live-voice-chat')
  if (!state.active || hideOnPath || (dismissedFor && dismissedFor === (state.callId || 'current'))) return null

  const label = group?.name || 'Voice room'
  const countLabel = canReadRow && participantCount > 0 ? `${participantCount} in call` : 'Live now'

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 84, // above the mobile bottom nav / desktop padding
        zIndex: 60,
        maxWidth: 'calc(100vw - 32px)',
      }}
      className="cc-voice-card"
      data-open={open ? '1' : '0'}
    >
      {open ? (
        <div
          role="dialog"
          aria-label="Live voice room"
          style={{
            width: 288,
            background: 'var(--bg)',
            border: '1px solid var(--accent-border)',
            borderRadius: 14,
            boxShadow: 'var(--accent-glow), var(--shadow-md, 0 8px 24px rgba(0,0,0,0.35))',
            overflow: 'hidden',
            animation: 'ccCardUp 0.18s ease',
          }}
        >
          {/* Card header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: 'var(--accent-light)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{group?.icon || '🎙️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                🔴 {countLabel}
                {liveFor ? ` · ${liveFor}` : ''}
              </p>
            </div>
            <button
              onClick={toggle}
              aria-label="Collapse voice card"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
                borderRadius: 8,
              }}
            >
              <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
                <Icon name="chevron" size={14} />
              </span>
            </button>
            <button
              onClick={dismiss}
              aria-label="Hide voice card until the next call"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
                borderRadius: 8,
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Card body */}
          <div style={{ padding: '10px 12px 12px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              A live voice room is running right now. Tap join to listen in and talk — mic stays muted until you unmute.
            </p>
            <button
              onClick={join}
              disabled={busy}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 10,
                padding: '10px 12px',
                background: busy ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {busy ? 'Connecting…' : '🎙️ Join voice room'}
            </button>
            <button
              onClick={() => router.push(`/live-voice-chat/${state.groupId}`)}
              style={{
                width: '100%',
                marginTop: 6,
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 11.5,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 2,
              }}
            >
              View room details →
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={toggle}
          aria-label={`Live voice room: ${label}. ${countLabel}. Tap to expand.`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent-border)',
            borderRadius: 999,
            padding: '8px 14px 8px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: 'var(--accent-glow), var(--shadow-md, 0 8px 24px rgba(0,0,0,0.35))',
            animation: 'ccCardUp 0.18s ease',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'var(--accent-light)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              position: 'relative',
            }}
          >
            🎙️
            <span
              style={{
                position: 'absolute',
                top: -1,
                right: -1,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--danger)',
                boxShadow: '0 0 0 2px var(--bg)',
              }}
            />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>Voice live</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {countLabel}
            {liveFor ? ` · ${liveFor}` : ''}
          </span>
        </button>
      )}
    </div>
  )
}
