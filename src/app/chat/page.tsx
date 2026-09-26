'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import LivePulseFeed from '@/components/LivePulseFeed'
import ErrorBoundary from '@/components/ErrorBoundary'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'
import { activeLabel, formatCount, unreadLabel } from '@/lib/chat'

/**
 * Live Chat — the category list.
 *
 * Categories are `communities` with `chat_enabled` (see 20261017_live_chat.sql),
 * so this screen and the Communities screen show the same groups rather than two
 * parallel lists.
 *
 * Mobile-first: every row is a full-width ~68px tap target, not a table. On
 * desktop the same rows reflow into a grid. Presence is real — it comes from
 * `chat_activity_counts()` (chat read heartbeats), and a quiet room shows
 * nothing instead of a fabricated "1 online".
 */

interface ChatCategory {
  id: string
  key: string
  name: string
  tagline: string | null
  description: string | null
  icon: string | null
}

interface ActivityRow {
  community_id: string
  active_count: number
  member_count: number
}

export default function ChatCategoriesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [categories, setCategories] = useState<ChatCategory[]>([])
  const [activity, setActivity] = useState<Record<string, ActivityRow>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [memberships, setMemberships] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const load = useCallback(async () => {
    setError('')
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      // Categories and presence are public; unread and membership are personal.
      const [catsRes, actRes] = await Promise.all([
        supabase
          .from('communities')
          .select('id, key, name, tagline, description, icon')
          .eq('is_active', true)
          .eq('chat_enabled', true)
          .order('name'),
        supabase.rpc('chat_activity_counts', { p_window_minutes: 15 }),
      ])

      if (catsRes.error) throw new Error(catsRes.error.message)
      setCategories((catsRes.data as ChatCategory[]) || [])

      const actMap: Record<string, ActivityRow> = {}
      for (const row of (actRes.data as ActivityRow[]) || []) actMap[row.community_id] = row
      setActivity(actMap)

      if (authUser) {
        setUser(authUser)

        const [profRes, unreadRes, memRes] = await Promise.all([
          supabase.from('profiles').select('*, campuses(name)').eq('id', authUser.id).single(),
          supabase.rpc('chat_unread_counts'),
          supabase.from('community_members').select('community_id').eq('user_id', authUser.id),
        ])

        setProfile(profRes.data)

        const unreadMap: Record<string, number> = {}
        for (const r of (unreadRes.data as { community_id: string; unread_count: number }[]) || []) {
          if (Number(r.unread_count) > 0) unreadMap[r.community_id] = Number(r.unread_count)
        }
        setUnread(unreadMap)
        setMemberships(((memRes.data as { community_id: string }[]) || []).map((m) => m.community_id))
      } else {
        setUser(null)
        setProfile(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load chat rooms.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  // ~8 rows — filtering here is cheaper than a round trip per keystroke.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tagline || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
    )
  }, [categories, query])

  const open = (key: string) => router.push(`/chat/${key}`)

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="chat">
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>
          {/* Header — sticky so the search stays reachable while scrolling */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 24 }}>💬</span>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Live Chat</h1>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Global rooms for every student — join the conversation.
            </p>
          </div>

          {/* LIVE PULSE — a rotating flash card of genuine platform activity
              (chat messages, live voice rooms, starting events, aura wins,
              mentions). Refreshes + advances every 60s, deep-links to source. */}
          <LivePulseFeed userId={user?.id ?? null} />

          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                display: 'flex',
              }}
            >
              <Icon name="search" size={17} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms…"
              aria-label="Search chat rooms"
              style={{
                width: '100%',
                minHeight: 48,
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '12px 14px 12px 42px',
                fontSize: 15,
                outline: 'none',
                fontFamily: 'inherit',
                color: 'var(--text-primary)',
                background: 'var(--bg)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              {error}
              <button
                onClick={load}
                style={{
                  marginLeft: 10,
                  background: 'none',
                  border: 'none',
                  color: 'var(--danger)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textDecoration: 'underline',
                  minHeight: 44,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <ListSkeleton count={5} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="message"
              title={query ? `No rooms match “${query}”` : 'No chat rooms yet'}
              body={
                query
                  ? 'Try a different word — DSA, notes, internships…'
                  : 'Rooms will appear here once an admin enables them.'
              }
              cta={query ? 'Clear search' : undefined}
              onCta={query ? () => setQuery('') : undefined}
            />
          ) : (
            <div className="chat-cat-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((c) => {
                const act = activity[c.id]
                const active = activeLabel(act?.active_count)
                const unreadCount = unreadLabel(unread[c.id])
                const isMember = memberships.includes(c.id)

                return (
                  <button
                    key={c.id}
                    onClick={() => open(c.key)}
                    aria-label={`Open ${c.name}${unreadCount ? `, ${unreadCount} unread` : ''}`}
                    className="card-hover"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      width: '100%',
                      minHeight: 68,
                      textAlign: 'left',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }} aria-hidden="true">
                      {c.icon || '💬'}
                    </span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        {isMember && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: 'var(--accent-text)',
                              background: 'var(--accent-light)',
                              padding: '1px 6px',
                              borderRadius: 20,
                              flexShrink: 0,
                            }}
                          >
                            JOINED
                          </span>
                        )}
                      </span>

                      {/* Honest presence: only rendered when someone is actually here. */}
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          flexWrap: 'wrap',
                        }}
                      >
                        {active && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              color: 'var(--success-text)',
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--success-text)',
                                display: 'inline-block',
                              }}
                            />
                            {active}
                          </span>
                        )}
                        <span>{formatCount(act?.member_count)} members</span>
                      </span>
                    </span>

                    {unreadCount && (
                      <span
                        style={{
                          minWidth: 22,
                          height: 22,
                          padding: '0 7px',
                          borderRadius: 20,
                          background: 'var(--accent)',
                          color: 'var(--on-accent)',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {unreadCount}
                      </span>
                    )}

                    <span style={{ color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }} aria-hidden="true">
                      <Icon name="chevron" size={17} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}
