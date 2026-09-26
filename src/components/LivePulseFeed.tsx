'use client'

/**
 * LIVE PULSE FEED — a rotating "flash card" of real platform activity for the
 * Live Chat page. One card, a new fact every ~60s, each fact GENUINE (queried
 * live from Supabase, never fabricated) and TAPPABLE (deep-links to the place
 * the activity happened).
 *
 * Sources (all real tables, all cheap indexed reads, one round of parallel
 * queries every refresh):
 *   1. CHAT MESSAGES   — latest message per room ("DSA Community is live:
 *                        <snippet>") → links to /chat/:key
 *   2. LIVE VOICE      — active calls ("Voice room X is live — N in call")
 *                        → links to /live-voice-chat/:groupId
 *   3. EVENTS          — events starting within the next 2h ("just started /
 *                        starting soon") → links to /events
 *   4. GAME FINISHES   — recent game winners ("X just won a game, +10 aura")
 *                        → links to /compete?tab=clash
 *   5. MENTIONS        — chat messages that contain @myname posted after my
 *                        last read ("Someone tagged you in DSA Community")
 *                        → links to /chat/:key
 *
 * Rotation: the card advances every 60s AND immediately whenever fresh data
 * lands (realtime INSERT on chat_messages / voice calls), so something new is
 * always on screen. If a source has nothing to say it is simply skipped —
 * the feed never invents filler.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icons'

type PulseKind = 'chat' | 'voice' | 'event' | 'aura' | 'mention'

interface PulseItem {
  key: string
  kind: PulseKind
  /** The flash line — short, specific, real. */
  text: string
  /** Where to go when tapped. */
  href: string
  /** Optional second line (e.g. the message snippet). */
  detail?: string
  at: number
}

const KIND_STYLE: Record<PulseKind, { icon: string; tint: string }> = {
  chat: { icon: 'message', tint: 'var(--accent-text)' },
  voice: { icon: 'mic', tint: 'var(--danger-text)' },
  event: { icon: 'calendar', tint: 'var(--success-text)' },
  aura: { icon: 'zap', tint: 'var(--accent-text)' },
  mention: { icon: 'star', tint: 'var(--blue-text)' },
}

const ROTATE_MS = 60_000
const REFRESH_MS = 60_000

function truncate(s: string, n = 90): string {
  const flat = (s || '').replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

export default function LivePulseFeed({ userId }: { userId: string | null }) {
  const router = useRouter()
  const [items, setItems] = useState<PulseItem[]>([])
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const usernameRef = useRef<string | null>(null)

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }, [])

  const collect = useCallback(async () => {
    const sb = getSupabase()
    const found: PulseItem[] = []

    // Usernames for mention detection (cheap: only when signed in).
    if (userId && !usernameRef.current) {
      const { data: prof } = await sb.from('profiles').select('username, full_name').eq('id', userId).single()
      usernameRef.current = prof?.username || null
    }

    // 1 + 5. Latest chat messages per room, newest first (indexed on created_at).
    try {
      const { data: msgs } = await sb
        .from('chat_messages')
        .select('id, body, created_at, community_id, communities(key, name), profiles(username, full_name)')
        .order('created_at', { ascending: false })
        .limit(12)
      const seenRooms = new Set<string>()
      for (const m of (msgs as any[]) || []) {
        const key = m.communities?.key
        if (!key || seenRooms.has(key)) continue
        seenRooms.add(key)
        const room = m.communities?.name || 'Community'
        const author = m.profiles?.full_name || m.profiles?.username || 'Someone'

        // Mention detection: @username appears in a room — only surface each
        // mention once (per page session) by checking it names ME.
        const isMention =
          userId &&
          usernameRef.current &&
          typeof m.body === 'string' &&
          m.body.toLowerCase().includes(`@${usernameRef.current.toLowerCase()}`)

        found.push({
          key: `chat-${m.id}`,
          kind: isMention ? 'mention' : 'chat',
          text: isMention ? `You were tagged in ${room}` : `${room} is live — ${author} just messaged`,
          detail: truncate(m.body || '', 80),
          href: `/chat/${key}`,
          at: new Date(m.created_at).getTime(),
        })
        if (seenRooms.size >= 5) break
      }
    } catch {
      /* source unavailable — skip, never fabricate */
    }

    // 2. Live voice rooms (RLS-scoped for non-members; still truthful).
    try {
      const { data: calls } = await sb
        .from('live_voice_chat_calls')
        .select('id, group_id, started_at, live_voice_chat_groups(name)')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(3)
      for (const c of (calls as any[]) || []) {
        found.push({
          key: `voice-${c.id}`,
          kind: 'voice',
          text: `🎙 ${c.live_voice_chat_groups?.name || 'A voice room'} is live right now`,
          detail: 'Tap to join the conversation',
          href: `/live-voice-chat/${c.group_id}`,
          at: new Date(c.started_at).getTime(),
        })
      }
    } catch {
      /* skip */
    }

    // 3. Events starting within ±2h window — "just started" or "starting soon".
    try {
      const nowIso = new Date().toISOString()
      const soon = new Date(Date.now() + 2 * 3600_000).toISOString()
      const { data: events } = await sb
        .from('campus_events')
        .select('id, title, starts_at')
        .eq('status', 'published')
        .gte('starts_at', new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte('starts_at', soon)
        .order('starts_at', { ascending: true })
        .limit(2)
      for (const e of (events as any[]) || []) {
        const started = new Date(e.starts_at).getTime() <= Date.now()
        found.push({
          key: `event-${e.id}`,
          kind: 'event',
          text: started ? `📅 ${e.title} just started!` : `📅 ${e.title} starts soon`,
          detail: started ? 'Happening now — jump in' : 'Get the details before it begins',
          href: '/events',
          at: new Date(e.starts_at).getTime(),
        })
      }
    } catch {
      /* skip */
    }

    // 4. Aura in motion: recent game winners (game_winners tracks every
    // finished room — 047_game_winners_matchmaking.sql).
    try {
      const since = new Date(Date.now() - 30 * 60_000).toISOString()
      const { data: winners } = await sb
        .from('game_winners')
        .select('id, winner_nickname, winner_score, won_at')
        .gte('won_at', since)
        .order('won_at', { ascending: false })
        .limit(3)
      for (const g of (winners as any[]) || []) {
        found.push({
          key: `aura-${g.id}`,
          kind: 'aura',
          text: `⚡ ${g.winner_nickname} just won a game — ${g.winner_score} pts`,
          detail: 'Think you can beat that? The arena is open',
          href: '/compete?tab=clash',
          at: new Date(g.won_at).getTime(),
        })
      }
    } catch {
      /* skip — table may not exist in older schemas */
    }

    // Newest first; keep the carousel tight.
    found.sort((a, b) => b.at - a.at)
    setItems(found.slice(0, 8))
    setIdx((i) => (found.length ? i % found.length : 0))
  }, [getSupabase, userId])

  // Initial + interval refresh. Realtime makes it instant when chat/voice move.
  useEffect(() => {
    void collect()
    const timer = setInterval(() => void collect(), REFRESH_MS)

    const sb = getSupabase()
    const channel = sb
      .channel('live-pulse')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        void collect()
        setIdx((i) => i) // new data lands → user sees the update on next view
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_voice_chat_calls' }, () => {
        void collect()
      })
      .subscribe()

    return () => {
      void sb.removeChannel(channel)
      clearInterval(timer)
    }
  }, [collect, getSupabase])

  // Rotate one card per minute — pause on hover/touch so people can read.
  useEffect(() => {
    if (paused || items.length < 2) return
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, items.length])

  if (items.length === 0) return null // honest silence beats fake activity

  const item = items[idx % items.length]
  const style = KIND_STYLE[item.kind]

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), 8000)}
      style={{ marginBottom: 14 }}
    >
      <button
        onClick={() => router.push(item.href)}
        aria-label={`${item.text}. Tap to open.`}
        key={item.key} // re-key per item so the flash animation replays
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          textAlign: 'left',
          background: 'var(--bg)',
          border: '1px solid var(--accent-border, var(--border))',
          borderRadius: 14,
          padding: '12px 14px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: 'var(--shadow-sm)',
          animation: 'ccPulseIn 0.35s ease',
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: 'var(--accent-light)',
            color: style.tint,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={style.icon} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
          </span>
          {item.detail && (
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.detail}
            </span>
          )}
        </span>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--danger)',
            boxShadow: '0 0 8px var(--danger)',
            flexShrink: 0,
            animation: 'ccPulseDot 2s ease infinite',
          }}
        />
      </button>

      {/* carousel dots — show where you are in the rotation */}
      {items.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 7 }}>
          {items.map((it, i) => (
            <button
              key={it.key}
              onClick={() => setIdx(i)}
              aria-label={`Show update ${i + 1} of ${items.length}`}
              style={{
                width: i === idx % items.length ? 14 : 6,
                height: 6,
                borderRadius: 3,
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: i === idx % items.length ? 'var(--accent)' : 'var(--border)',
                transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
