'use client'

/**
 * LIVE PULSE — the floating "what is happening right now" flash card.
 *
 * One compact card pinned bottom-right (the same corner as the voice broadcast
 * pill) on EVERY page. Contract, in order of preference:
 *
 *   1. REAL fresh activity (chat ≤15min, live voice rooms, events ±2h, game
 *      winners ≤30min, mentions) — rotates one fact every minute.
 *   2. NOTHING fresh? The card still shows ONCE per visit with the platform's
 *      LAST known message or voice room, honestly labelled ("last message
 *      3h ago") — so a quiet campus reads as quiet, never as broken.
 *   3. A brand-new platform with no history at all stays silent.
 *
 * Irritation control: 45s after it appears it dismisses itself (unless the
 * pointer rests on it), navigation/hover pauses the timer, and the ⋯ menu
 * offers Hide for now (this session) or Turn off — reversible from the More
 * page switch. No 24h pause: a card silenced once and forgotten read like a
 * broken feature.
 *
 * Yield rules: hidden while a live voice call is running (the voice pill owns
 * that corner then), and on surfaces it would sit on top of — voice call
 * pages, live chat rooms and the auth pages.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms } from '@/lib/liveVoice'
import { subscribeVoiceBroadcast } from '@/lib/voiceBroadcast'
import { Icon } from '@/components/icons'
import {
  isPulseVisible,
  mentionFlash,
  readPulsePrefs,
  readSessionHidden,
  setPulseMuted,
  setSessionHidden,
  timeAgoLabel,
  type PulsePrefs,
} from '@/lib/livePulsePrefs'

type PulseKind = 'chat' | 'voice' | 'event' | 'aura' | 'mention' | 'last'

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
  last: { icon: 'message', tint: 'var(--text-muted)' },
}

const ROTATE_MS = 60_000
const REFRESH_MS = 60_000
/** "Live" means live: fresh sources never surface anything older. */
const ACTIVITY_WINDOW_MS = 15 * 60_000
/** Card dismisses itself this long after appearing — attention, not nagging. */
const AUTO_DISMISS_MS = 45_000

/** Surfaces where a bottom-right card would sit on top of real work. */
const HIDDEN_PREFIXES = ['/live-voice-chat', '/chat', '/auth']

function truncate(s: string, n = 90): string {
  const flat = (s || '').replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

/**
 * A source that BREAKS must say so — "skip, never fabricate" means skip the
 * card, not swallow the reason. Every query here is best-effort, but silence
 * is not the same as no data: an ambiguous embed (a bare `profiles(...)` on
 * chat_messages, which has two FKs to profiles) returned PGRST201, so `data`
 * was null and this card vanished from EVERY page with nothing in the console.
 * A source with genuinely nothing to say reports `error === null`.
 */
function warnSource(source: string, error: unknown) {
  if (error) console.warn(`[live-pulse] ${source} source skipped:`, error)
}

export default function LivePulseFeed({ userId }: { userId: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const [items, setItems] = useState<PulseItem[]>([])
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  // Prefs are read after mount: the card is client-only, and this keeps the
  // first paint identical for everyone until the stored choice is known.
  const [prefs, setPrefs] = useState<PulsePrefs | null>(null)
  const [hiddenNow, setHiddenNow] = useState(false)
  // MENTION FLASH: a brand-new @tag surfaces the card for 5s even when the
  // card is muted or session-hidden — a direct notification deserves eyes.
  // `until` gates both prefs and hiddenNow; `seenMentions` persists this
  // session so nothing replays on navigation.
  const [mentionUntil, setMentionUntil] = useState(0)
  const seenMentionsRef = useRef<Set<string>>(new Set())
  const bootstrappedRef = useRef(false)
  const [voiceLive, setVoiceLive] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const usernameRef = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    return supabaseRef.current
  }, [])

  // Stored choices (hide-for-now / off).
  useEffect(() => {
    setPrefs(readPulsePrefs())
    setHiddenNow(readSessionHidden())
  }, [])

  // The voice pill owns this corner whenever a call is genuinely live.
  useEffect(() => subscribeVoiceBroadcast((next) => setVoiceLive(next.active)), [])

  // Close the ⋯ menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const collect = useCallback(async () => {
    const sb = getSupabase()
    const found: PulseItem[] = []
    const mentionKeys: string[] = []
    const sinceIso = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString()

    // Usernames for mention detection (cheap: only when signed in).
    if (userId && !usernameRef.current) {
      const { data: prof } = await sb.from('profiles').select('username, full_name').eq('id', userId).single()
      usernameRef.current = prof?.username || null
    }

    // 1 + 2. Chat messages from the LAST 15 MINUTES, newest first. The window
    //   is what keeps the copy honest: without it the card called week-old
    //   messages "just messaged" on every page.
    //   (The same query doubles as the quiet-campus fallback further down —
    //   re-queried without the window only if nothing fresh was found.)
    let latestMessages: any[] = []
    try {
      // `profiles!chat_messages_author_id_fkey` is MANDATORY here, not
      // cosmetic: chat_messages has TWO foreign keys to profiles (author_id
      // and pinned_by), so a bare `profiles(...)` embed is ambiguous —
      // PostgREST answers PGRST201, `data` is null, the card silently
      // renders nothing. Same form the chat thread uses (MESSAGE_SELECT).
      const { data: msgs, error: msgsError } = await sb
        .from('chat_messages')
        .select(
          'id, body, created_at, community_id, communities(key, name), profiles!chat_messages_author_id_fkey(username, full_name)'
        )
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(12)
      warnSource('chat messages', msgsError)
      latestMessages = (msgs as any[]) || []
      const seenRooms = new Set<string>()
      for (const m of latestMessages) {
        const key = m.communities?.key
        if (!key || seenRooms.has(key)) continue
        seenRooms.add(key)
        const room = m.communities?.name || 'Community'
        const author = m.profiles?.full_name || m.profiles?.username || 'Someone'

        // Mention detection: @username in a room names ME → its own kind.
        const isMention =
          userId &&
          usernameRef.current &&
          typeof m.body === 'string' &&
          m.body.toLowerCase().includes(`@${usernameRef.current.toLowerCase()}`)

        found.push({
          key: `chat-${m.id}`,
          kind: isMention ? 'mention' : 'chat',
          text: isMention ? `You were tagged in ${room}` : `${author} just messaged in ${room}`,
          detail: truncate(m.body || '', 80),
          href: `/chat/${key}`,
          at: new Date(m.created_at).getTime(),
        })
        if (isMention) mentionKeys.push(`chat-${m.id}`)
        if (seenRooms.size >= 5) break
      }
    } catch (err) {
      warnSource('chat messages', err) // source unavailable — skip, never fabricate
    }

    // 2. Live voice — rooms with a user ACTUALLY inside right now (heartbeat-
    //    verified). Nothing inside ⇒ this source is simply skipped.
    const liveVoiceItems: PulseItem[] = []
    try {
      const rooms = await fetchLiveVoiceRooms(sb)
      for (const r of rooms.slice(0, 3)) {
        liveVoiceItems.push({
          key: `voice-${r.callId}`,
          kind: 'voice',
          text: `${r.name} is live — ${r.participantCount} in call`,
          detail: 'Tap to join the conversation',
          href: `/live-voice-chat/${r.groupId}`,
          at: r.startedAt || Date.now(),
        })
      }
    } catch (err) {
      warnSource('live voice', err)
    }
    found.push(...liveVoiceItems)

    // 3. Events starting within ±2h window — "just started" or "starting soon".
    try {
      const soon = new Date(Date.now() + 2 * 3600_000).toISOString()
      const { data: events, error: eventsError } = await sb
        .from('campus_events')
        .select('id, title, starts_at')
        .eq('status', 'published')
        .gte('starts_at', new Date(Date.now() - 2 * 3600_000).toISOString())
        .lte('starts_at', soon)
        .order('starts_at', { ascending: true })
        .limit(2)
      warnSource('events', eventsError)
      for (const e of (events as any[]) || []) {
        const started = new Date(e.starts_at).getTime() <= Date.now()
        found.push({
          key: `event-${e.id}`,
          kind: 'event',
          text: started ? `${e.title} just started!` : `${e.title} starts soon`,
          detail: started ? 'Happening now — jump in' : 'Get the details before it begins',
          href: '/events',
          at: new Date(e.starts_at).getTime(),
        })
      }
    } catch (err) {
      warnSource('events', err)
    }

    // 4. Aura in motion: recent game winners (last 30 minutes).
    try {
      const since = new Date(Date.now() - 30 * 60_000).toISOString()
      const { data: winners, error: winnersError } = await sb
        .from('game_winners')
        .select('id, winner_nickname, winner_score, won_at')
        .gte('won_at', since)
        .order('won_at', { ascending: false })
        .limit(3)
      warnSource('game winners', winnersError)
      for (const g of (winners as any[]) || []) {
        found.push({
          key: `aura-${g.id}`,
          kind: 'aura',
          text: `${g.winner_nickname} just won a game — ${g.winner_score} pts`,
          detail: 'Think you can beat that? The arena is open',
          href: '/compete?tab=clash',
          at: new Date(g.won_at).getTime(),
        })
      }
    } catch (err) {
      warnSource('game winners', err) // table may not exist in older schemas
    }

    // Quiet-campus FALLBACK: nothing fresh anywhere, but the platform has
    // history? Show the last known message/voice room ONCE per visit, with
    // an honest age ("last message 3h ago") — quiet must never read broken.
    if (found.length === 0) {
      // Latest message ever (cheap single query, indexed on created_at).
      try {
        const { data: last, error: lastError } = await sb
          .from('chat_messages')
          .select(
            'id, body, created_at, communities(key, name), profiles!chat_messages_author_id_fkey(username, full_name)'
          )
          .order('created_at', { ascending: false })
          .limit(1)
        warnSource('last message fallback', lastError)
        const m = (last as any[])?.[0]
        if (m?.communities?.key) {
          found.push({
            key: `last-${m.id}`,
            kind: 'last',
            text: `Last message ${timeAgoLabel(new Date(m.created_at).getTime())} in ${m.communities.name || 'Community'}`,
            detail: truncate(m.body || '', 80),
            href: `/chat/${m.communities.key}`,
            at: new Date(m.created_at).getTime(),
          })
        }
      } catch (err) {
        warnSource('last message fallback', err)
      }
      // Or the last voice room that actually had someone in it.
      if (found.length === 0) {
        try {
          const { data: lastCall, error: lastCallError } = await sb
            .from('live_voice_chat_calls')
            .select('id, room_name, started_at, ended_at')
            .not('ended_at', 'is', null)
            .order('started_at', { ascending: false })
            .limit(1)
          warnSource('last voice fallback', lastCallError)
          const c = (lastCall as any[])?.[0]
          if (c?.room_name) {
            found.push({
              key: `lastvoice-${c.id}`,
              kind: 'last',
              text: `Last voice room ${timeAgoLabel(new Date(c.ended_at).getTime())} — ${c.room_name}`,
              detail: 'Start a room and bring the campus together',
              href: '/live-voice-chat',
              at: new Date(c.ended_at).getTime(),
            })
          }
        } catch (err) {
          // Table/columns may differ across schemas — the fallback is optional.
        }
      }
    }

    // Newest first; keep the carousel tight.
    found.sort((a, b) => b.at - a.at)
    setItems(found.slice(0, 8))
    setIdx((i) => (found.length ? i % found.length : 0))

    // MENTION FLASH decision — after the first load, any @tag not yet seen
    // this session flashes the card for 5s (even muted). The first load's
    // mentions are marked seen WITHOUT flashing: a refresh must not replay
    // old tags; only tags arriving while the page is open are notifications.
    if (mentionKeys.length > 0) {
      if (!bootstrappedRef.current) {
        for (const k of mentionKeys) seenMentionsRef.current.add(k)
      } else {
        const flash = mentionFlash(seenMentionsRef.current, mentionKeys, true, Date.now())
        if (flash) {
          seenMentionsRef.current.add(flash.key)
          setMentionUntil(flash.until)
        }
      }
    }
    if (!bootstrappedRef.current) bootstrappedRef.current = true
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

  // Auto-dismiss: the card leaves on its own 45s after appearing, so it
  // catches the eye without ever becoming furniture. Hover/touch pauses the
  // countdown, an open menu pauses it, fresh data (a new top item arriving)
  // restarts it — new information deserves fresh attention.
  useEffect(() => {
    if (dismissed || menuOpen) return
    if (!items.length) return
    const t = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [dismissed, menuOpen, items.length])

  // Navigating to a new page re-surfaces the card: each page gets one
  // appearance, keeping "shows on every visit" true without nagging.
  useEffect(() => {
    setDismissed(false)
  }, [pathname])

  const hideForNow = useCallback(() => {
    setSessionHidden(true)
    setHiddenNow(true)
    setMenuOpen(false)
  }, [])

  const turnOff = useCallback(() => {
    setPrefs(setPulseMuted(true))
    setMenuOpen(false)
  }, [])

  // Not allowed on screen: user choice, a live voice call, a surface the card
  // would cover, or the user dismissed it this session — UNLESS a brand-new
  // @tag is flashing (a notification overrides hide/mute for 5s, never for
  // keeps, and only on surfaces where the card is normally welcome).
  const coveredSurface = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))
  const mentionActive = mentionUntil > Date.now()
  useEffect(() => {
    if (!mentionActive) return
    const t = setTimeout(() => setMentionUntil(0), mentionUntil - Date.now())
    return () => clearTimeout(t)
  }, [mentionActive, mentionUntil])
  if (!prefs) return null
  if (!mentionActive && (!isPulseVisible(prefs) || hiddenNow || voiceLive || coveredSurface || dismissed)) return null
  if (voiceLive || coveredSurface) return null

  if (items.length === 0) return null // a brand-new platform stays silent

  const item = items[idx % items.length]
  const style = KIND_STYLE[item.kind]
  const isFallback = item.kind === 'last'

  return (
    <div className="cc-float-pulse" ref={rootRef}>
      <div style={{ position: 'relative' }}>
        {menuOpen && (
          <div role="menu" aria-label="Live updates options" className="cc-pulse-menu">
            <button role="menuitem" onClick={hideForNow}>
              <span className="cc-pulse-menu-label">Hide for now</span>
              <span className="cc-pulse-menu-hint">Back on your next visit</span>
            </button>
            <button role="menuitem" onClick={turnOff}>
              <span className="cc-pulse-menu-label">Turn off live updates</span>
              <span className="cc-pulse-menu-hint">Switch it back on in More</span>
            </button>
          </div>
        )}

        <button
          onClick={() => router.push(item.href)}
          aria-label={`${item.text}. Tap to open.`}
          key={item.key} // re-key per item so the flash animation replays
          className="cc-pulse-card"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setTimeout(() => setPaused(false), 8000)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            textAlign: 'left',
            background: 'var(--bg)',
            border: '1px solid var(--accent-border, var(--border))',
            borderRadius: 14,
            padding: '11px 62px 11px 12px', // right padding clears the ⋯ / ✕
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-sm)',
            animation: 'ccPulseIn 0.35s ease',
            opacity: isFallback ? 0.92 : 1,
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'var(--accent-light)',
              color: style.tint,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name={style.icon} size={16} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              <span className="cc-pulse-title">{item.text}</span>
            </span>
            {item.detail && (
              <span className="cc-pulse-detail" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {item.detail}
              </span>
            )}
          </span>
        </button>

        {/* Controls sit OUTSIDE the tappable card: a button inside a button is
            invalid HTML and swallows the navigation tap. */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <button
            className="cc-pulse-icon-btn"
            aria-label="Live updates options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name="more" size={15} />
          </button>
          <button className="cc-pulse-icon-btn" aria-label="Hide live updates for now" onClick={hideForNow}>
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* carousel dots — show where you are in the rotation */}
        {items.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 6 }}>
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
    </div>
  )
}
