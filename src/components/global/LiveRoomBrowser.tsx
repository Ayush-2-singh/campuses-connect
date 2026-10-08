'use client'

// ═══════════════════════════════════════════════════════════════════════════
// LiveRoomBrowser — the free4talk-style voice board at the top of /global.
//
// Browse every voice room by topic, see who is actually talking RIGHT NOW, and
// drop into a room with one tap. Live rooms float to the top, exactly like a
// language-exchange board.
//
// The section keys mirror the CHECK constraint on live_voice_chat_groups.section
// (supabase/migrations/20260920_live_voice_chat.sql) — the DB rejects anything
// else. LIVE means a heartbeat-fresh participant, read through the shared
// fetchLiveVoiceRooms() path, so a badge here can never disagree with the room
// page. Joining (including private-room passwords) is handled by the room page
// itself, so a card is just a link.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchLiveVoiceRooms, voiceIcon } from '@/lib/liveVoice'
import { Icon } from '@/components/icons'

const SECTIONS = [
  { key: 'all', label: 'All', icon: 'sparkles' },
  { key: 'dsa', label: 'DSA', icon: 'layers' },
  { key: 'discussion', label: 'Discussion', icon: 'message' },
  { key: 'web-dev', label: 'Web Dev', icon: 'globe' },
  { key: 'english', label: 'English', icon: 'type' },
  { key: 'random', label: 'Random', icon: 'shuffle' },
] as const

interface VoiceGroup {
  id: string
  name: string
  description: string | null
  icon: string | null
  section: string | null
  scope: string | null
  is_private: boolean | null
}

function RoomCard({ group, count, onOpen }: { group: VoiceGroup; count: number; onOpen: (g: VoiceGroup) => void }) {
  const sectionLabel = SECTIONS.find((s) => s.key === group.section)?.label || 'Random'
  const isLive = count > 0

  return (
    <button
      onClick={() => onOpen(group)}
      className="card-hover"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        background: 'var(--bg)',
        border: isLive ? '1px solid var(--success-border, var(--border))' : '1px solid var(--border)',
        borderRadius: 14,
        padding: '13px 14px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: 'var(--shadow-sm)',
        width: '100%',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--accent-light)',
          color: 'var(--accent-text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={voiceIcon(group.icon)} size={21} strokeWidth={2} />
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {group.is_private && (
            <span
              aria-label="Private room"
              style={{ display: 'inline-flex', color: 'var(--warning-text)', flexShrink: 0 }}
            >
              <Icon name="lock" size={12} strokeWidth={2.4} />
            </span>
          )}
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {group.name}
          </span>
          {isLive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.05em',
                padding: '2px 7px',
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
              LIVE
            </span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {sectionLabel} · {group.scope === 'global' ? 'Global' : 'Campus'}
          {isLive ? ` · ${count} talking` : ' · empty'}
        </span>
      </span>

      <span
        style={{
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 800,
          color: isLive ? 'var(--on-accent)' : 'var(--accent-text)',
          background: isLive ? 'var(--accent)' : 'var(--accent-light)',
          borderRadius: 9,
          padding: '7px 13px',
        }}
      >
        Join
      </span>
    </button>
  )
}

export default function LiveRoomBrowser({ userId }: { userId: string | null }) {
  const supabase = createClient()
  const router = useRouter()

  const [groups, setGroups] = useState<VoiceGroup[]>([])
  const [liveByGroup, setLiveByGroup] = useState<Record<string, number>>({})
  const [section, setSection] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadLive = useCallback(async () => {
    const rooms = await fetchLiveVoiceRooms(supabase)
    const next: Record<string, number> = {}
    for (const r of rooms) next[r.groupId] = r.participantCount
    setLiveByGroup(next)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const { data, error: groupsError } = await supabase
        .from('live_voice_chat_groups')
        .select('id, name, description, icon, section, scope, is_private')
        .order('created_at', { ascending: false })
        .limit(100)
      if (cancelled) return
      if (groupsError) {
        setError(groupsError.message)
        setGroups([])
      } else {
        setGroups((data as VoiceGroup[]) || [])
      }
      await loadLive()
      if (!cancelled) setLoading(false)
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [supabase, loadLive])

  // LIVE must never go stale: realtime call events, tab focus, and a gentle 30s
  // tick while visible (realtime only reaches group members — the tick keeps
  // everyone else's badges honest too).
  useEffect(() => {
    const channel = supabase
      .channel('global-live-rooms')
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

  const visible = useMemo(
    () => (section === 'all' ? groups : groups.filter((g) => g.section === section)),
    [groups, section]
  )

  // Live rooms first (busiest on top), then the quiet ones — free4talk ordering.
  const live = useMemo(
    () =>
      visible
        .filter((g) => (liveByGroup[g.id] || 0) > 0)
        .sort((a, b) => (liveByGroup[b.id] || 0) - (liveByGroup[a.id] || 0)),
    [visible, liveByGroup]
  )
  const rest = useMemo(() => visible.filter((g) => (liveByGroup[g.id] || 0) === 0), [visible, liveByGroup])

  const open = useCallback(
    (g: VoiceGroup) => {
      if (!userId) {
        router.push('/auth/login?redirect=' + encodeURIComponent('/global'))
        return
      }
      // The room page owns the join (and the private-room password prompt).
      router.push(`/live-voice-chat/${g.id}`)
    },
    [router, userId]
  )

  const livePeople = live.reduce((n, g) => n + (liveByGroup[g.id] || 0), 0)
  const activeSection = SECTIONS.find((s) => s.key === section) || SECTIONS[0]

  return (
    <section style={{ marginBottom: 24 }} aria-label="Live voice rooms">
      {/* Header — the free4talk promise: see who is talking, join in one tap */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="mic" size={19} />
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            Live Rooms
            {live.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'var(--success-text)',
                  background: 'var(--success-light)',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {live.length} live · {livePeople} talking
              </span>
            )}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Pick a topic and talk with students right now.
          </p>
        </div>
        <button
          onClick={() => router.push('/live-voice-chat')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <Icon name="plus" size={15} />
          Create room
        </button>
      </div>

      {/* Topic filter — the same sections the rooms page uses */}
      <div
        className="scrollbar-hide chip-scroll"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}
      >
        {SECTIONS.map((s) => {
          const active = s.key === section
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              style={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                padding: '7px 13px',
                borderRadius: 999,
                border: active ? 'none' : '1px solid var(--border)',
                background: active ? 'var(--accent)' : 'var(--bg)',
                color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name={s.icon} size={13} strokeWidth={2.2} />
              {s.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--danger-light)',
            color: 'var(--danger)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px dashed var(--border-strong, var(--border))',
            borderRadius: 14,
            padding: '18px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>
            No rooms in {activeSection.label} yet
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Be the first — open a room and students will see it here.
          </p>
          <button
            onClick={() => router.push('/live-voice-chat')}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 10,
              padding: '9px 16px',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Go live
          </button>
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--success-text)',
                  margin: '0 0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--danger)',
                    boxShadow: '0 0 6px var(--danger)',
                  }}
                />
                Live now
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {live.map((g) => (
                  <RoomCard key={g.id} group={g} count={liveByGroup[g.id] || 0} onOpen={open} />
                ))}
              </div>
            </>
          )}

          {rest.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  margin: '0 0 8px',
                }}
              >
                {live.length > 0 ? 'Quiet rooms' : 'All rooms'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {rest.map((g) => (
                  <RoomCard key={g.id} group={g} count={0} onOpen={open} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
