'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ROOM DISCOVERY — the standalone landing surface (route `/`).
//
// Modelled on the free4talk "community" board: its own header (logo + brand +
// Sign in), a centred title, a row of quick actions, a search bar with card
// size controls, category chips with counts, and a grid of room cards with
// participant slots and a Join CTA.
//
// It deliberately renders WITHOUT the app shell (Layout) — no sidebar, no
// bottom bar.
// Signed-in users reach the app through the header's "Open app" button.
//
// Data comes from the EXISTING live-voice API:
//   • groups   → live_voice_chat_groups (RLS-scoped discovery)
//   • liveness → fetchLiveVoiceRooms(), the same honest read path every other
//                LIVE badge uses. A room is live only with a real participant.
// Pure mapping lives in src/lib/rooms.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms, voiceIcon } from '@/lib/liveVoice'
import { Icon } from '@/components/icons'
import BrandName from '@/components/BrandName'
import { getLogoSrc } from '@/components/LogoToggle'
import { ROOM_CATEGORIES, buildDiscovery, type DiscoverRoom, type RoomFilter, type VoiceGroupRow } from '@/lib/rooms'

/** Quick links across the top — the free4talk action row, mapped to our routes. */
const QUICK_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'About Us', href: '/about' },
  { label: 'Communities', href: '/communities' },
]

export default function RoomDiscovery() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [logoSrc, setLogoSrc] = useState('/connect-to-campus-logo-dark.png')
  const [groups, setGroups] = useState<VoiceGroupRow[]>([])
  const [liveByGroup, setLiveByGroup] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<RoomFilter>('all')
  const [query, setQuery] = useState('')
  // Card size: 3x → three columns, 2x → two, 1x → one. Mirrors the board's
  // 3x/2x/1x controls; overridden to a single column on phones (see landing.css).
  const [density, setDensity] = useState(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Theme-aware logo (dark variant while the theme attribute is unknown).
  useEffect(() => {
    setLogoSrc(getLogoSrc())
    const sync = () => setLogoSrc(getLogoSrc())
    window.addEventListener('cc-theme-change', sync)
    return () => window.removeEventListener('cc-theme-change', sync)
  }, [])

  const loadGroups = useCallback(async () => {
    const { data, error: groupsError } = await supabase
      .from('live_voice_chat_groups')
      .select('id, name, description, icon, section, scope, is_private')
      .order('created_at', { ascending: false })
      .limit(100)
    if (groupsError) {
      setError(groupsError.message)
      setGroups([])
      return
    }
    setError('')
    setGroups((data as VoiceGroupRow[]) || [])
  }, [supabase])

  /** Same single source of truth for "who is inside right now" as the hub. */
  const loadLive = useCallback(async () => {
    const rooms = await fetchLiveVoiceRooms(supabase)
    const next: Record<string, number> = {}
    for (const r of rooms) next[r.groupId] = r.participantCount
    setLiveByGroup(next)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      setUser(authUser ?? null)
      await loadGroups()
      await loadLive()
      setLoading(false)
    }
    void init()
  }, [loadGroups, loadLive, supabase])

  // Liveness must never go stale: realtime on call rows, tab focus, and a
  // gentle tick while visible (realtime only reaches members of a group).
  useEffect(() => {
    const channel = supabase
      .channel('rd-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_voice_chat_calls' }, () => {
        void loadLive()
      })
      .subscribe()
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadLive()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [supabase, loadLive])

  const view = useMemo(
    () => buildDiscovery({ groups, liveByGroup, filter, query }),
    [groups, liveByGroup, filter, query]
  )

  const rooms = useMemo(() => [...view.active, ...view.open], [view])
  const isEmpty = rooms.length === 0

  const openRoom = (room: DiscoverRoom) => {
    if (!user) {
      router.push(`/auth/login?redirect=${encodeURIComponent(room.href)}`)
      return
    }
    router.push(room.href)
  }

  const gridStyle = { ['--f4-cols' as string]: String(density) } as React.CSSProperties

  return (
    <div className="f4-page">
      {/* ── Header: logo + wordmark, Sign in / Open app ── */}
      <header className="f4-topbar">
        <div className="f4-brand">
          <img src={logoSrc} alt="ConnectToCampus" width={38} height={38} className="f4-logo" />
          <BrandName className="f4-word" />
        </div>
        <button className="f4-signin" onClick={() => router.push(user ? '/global' : '/auth/login')}>
          {user ? 'Open app' : 'Sign in'}
        </button>
      </header>

      {/* ── Hero ── */}
      <h1 className="f4-hero">Campus Voice Community</h1>
      <p className="f4-hero-sub">
        {view.onlineNow > 0
          ? `${view.onlineNow} ${view.onlineNow === 1 ? 'student' : 'students'} talking right now`
          : 'Drop into a room and start talking'}
      </p>

      {/* ── Quick actions ── */}
      <div className="f4-actions">
        <button className="f4-btn f4-btn-primary" onClick={() => router.push('/live-voice-chat')}>
          <Icon name="plus" size={16} strokeWidth={2.4} /> Create a new group
        </button>
        <button className="f4-btn f4-btn-amber" onClick={() => router.push('/premium')}>
          <Icon name="sparkles" size={16} strokeWidth={2.2} /> Go Premium
        </button>
        {QUICK_LINKS.map((l) => (
          <button key={l.href} className="f4-btn" onClick={() => router.push(l.href)}>
            {l.label}
          </button>
        ))}
      </div>

      {/* ── Search + card size ── */}
      <div className="f4-searchbar">
        <span className="f4-search-icon" aria-hidden="true">
          <Icon name="search" size={16} strokeWidth={2.2} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by topic, room or activity…"
          aria-label="Search rooms"
        />
        <button className="f4-search-btn" onClick={() => (document.activeElement as HTMLElement)?.blur()}>
          Search
        </button>
        <div className="f4-zoom" role="group" aria-label="Card size">
          {[3, 2, 1].map((z) => (
            <button
              key={z}
              className={density === z ? 'is-active' : ''}
              aria-pressed={density === z}
              onClick={() => setDensity(z)}
            >
              {z}x
            </button>
          ))}
        </div>
      </div>

      {/* ── Category chips with counts ── */}
      <div className="f4-chips scrollbar-hide">
        <button
          className={`f4-chip${filter === 'all' ? ' is-active' : ''}`}
          aria-pressed={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All <span className="f4-chip-count">{view.counts.all}</span>
        </button>
        {ROOM_CATEGORIES.map((c) => {
          const active = filter === c.id
          return (
            <button
              key={c.id}
              className={`f4-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={c.blurb}
              onClick={() => setFilter(c.id)}
            >
              {c.label} <span className="f4-chip-count">{view.counts[c.id]}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div role="alert" className="f4-error">
          Could not load rooms — {error}
        </div>
      )}

      {loading ? (
        <div className="f4-grid" style={gridStyle}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton f4-skeleton" />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="f4-empty">
          <div className="f4-empty-icon">
            <Icon name="mic" size={26} strokeWidth={1.8} />
          </div>
          <p className="f4-empty-title">{query ? 'No groups match that search' : 'No groups here yet'}</p>
          <p className="f4-empty-body">
            {query
              ? 'Try a different topic, or start the room yourself.'
              : 'Be the first — create a group and your classmates can join.'}
          </p>
          <button className="f4-btn f4-btn-primary" onClick={() => router.push('/live-voice-chat')}>
            <Icon name="plus" size={15} strokeWidth={2.4} /> Create a new group
          </button>
        </div>
      ) : (
        <div className="f4-grid" style={gridStyle}>
          {rooms.map((r) => (
            <RoomCard key={r.id} room={r} onJoin={() => openRoom(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** One room card — logo + name + category, participant slots, count, Join CTA. */
function RoomCard({ room, onJoin }: { room: DiscoverRoom; onJoin: () => void }) {
  const live = room.status === 'live'
  const full = room.participantCount >= room.capacity
  const slots = 3
  const filled = Math.min(room.participantCount, slots)

  return (
    <article className="f4-card">
      <div className="f4-card-head">
        <span className="f4-card-logo" aria-hidden="true">
          <Icon name={voiceIcon(room.icon)} size={18} strokeWidth={2.1} />
        </span>
        <div className="f4-card-title">
          <p className="f4-card-name">
            {room.isPrivate && <Icon name="lock" size={11} strokeWidth={2.4} />}
            {room.name}
          </p>
          <p className="f4-card-level">{room.categoryLabel}</p>
        </div>
        {live && (
          <span className="f4-live">
            <span className="f4-live-dot" /> LIVE
          </span>
        )}
      </div>

      {/* Participant slots — filled for people inside, dashed while empty. */}
      <div className="f4-avatars" aria-hidden="true">
        {Array.from({ length: slots }).map((_, i) => (
          <span key={i} className={`f4-ava${i < filled ? ' is-filled' : ''}`}>
            {i < filled && <Icon name="user" size={18} strokeWidth={2} />}
          </span>
        ))}
      </div>

      <div className="f4-card-foot">
        <span className="f4-meta">
          <Icon name="users" size={13} strokeWidth={2.2} />
          {room.participantCount} / {room.capacity} in room
        </span>
        <button className="f4-join" disabled={full} onClick={onJoin}>
          {full ? 'This group is full.' : 'Join and talk now!'}
        </button>
      </div>
    </article>
  )
}
