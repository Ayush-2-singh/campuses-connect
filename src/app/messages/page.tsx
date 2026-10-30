'use client'

/**
 * /messages — the student network, in one screen.
 *
 * WHY THIS PAGE EXISTS
 *
 * A campus network is only worth joining if a request is one tap and the reply
 * is a real conversation. The social plane was retired in V4, but 1:1 DMs are
 * the part students actually use: find a senior from your branch, connect, and
 * ask about the drive. So the network comes back on its own, connection-gated
 * by the SQL in 029_dms_connections / 030_fix_chat_policies — no feed, no
 * communities, no public rooms.
 *
 * The hub mirrors the messaging tabs students already know (WhatsApp/LinkedIn):
 *   Chats · Requests · Sent · Connections · Find people
 *
 * `Find people` is the request shortcut: search public profiles by name or
 * @username and the action adapts to the relationship — Connect, Requested,
 * Accept, or Message — instead of making people hunt for a profile page.
 */

import { useCallback, useEffect, useMemo, useState, Suspense, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useToast } from '@/components/Toast'
import { Icon } from '@/components/icons'
import { requestResultCopy, sendConnectionRequest } from '@/lib/connectionRequest'
import {
  buildNetwork,
  canRequestConnection,
  connectionBetween,
  connectionState,
  conversationPreview,
  formatRelativeTime,
  latestByConversation,
  peerOf,
  unreadByConversation,
  type ConnState,
  type ConnectionRow,
  type MessageRow,
} from '@/lib/messaging'

type TabKey = 'chats' | 'requests' | 'sent' | 'connections' | 'find'

type ChatEntry = {
  id: string
  peerId: string
  peer: any | null
  last: MessageRow | null
  unread: number
}

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'chats', label: 'Chats', icon: 'message' },
  { key: 'requests', label: 'Requests', icon: 'users' },
  { key: 'sent', label: 'Sent', icon: 'send' },
  { key: 'connections', label: 'Connections', icon: 'check' },
  { key: 'find', label: 'Find people', icon: 'search' },
]

/** `/connections?tab=received` and old links still land on the right tab. */
const TAB_FROM_URL: Record<string, TabKey> = {
  chats: 'chats',
  messages: 'chats',
  requests: 'requests',
  received: 'requests',
  sent: 'sent',
  connections: 'connections',
  find: 'find',
  people: 'find',
  discover: 'find',
}

const TAB_URL: Record<TabKey, string> = {
  chats: 'chats',
  requests: 'requests',
  sent: 'sent',
  connections: 'connections',
  find: 'find',
}

/** PostgREST `.or()` splits on these, so a stray comma must not change the query. */
const sanitizeSearch = (q: string) => q.replace(/[(),]/g, ' ').trim()

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

function MessagesPageInner() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [rows, setRows] = useState<ConnectionRow[]>([])
  const [chats, setChats] = useState<ChatEntry[]>([])
  const [people, setPeople] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // Find people
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const { show: toast } = useToast()

  const initialTab = TAB_FROM_URL[searchParams.get('tab') || ''] || 'chats'
  const [tab, setTab] = useState<TabKey>(initialTab)

  const changeTab = useCallback(
    (next: TabKey) => {
      setTab(next)
      router.replace(`/messages?tab=${TAB_URL[next]}`, { scroll: false })
    },
    [router]
  )

  const loadPeople = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))]
      if (!unique.length) return
      const { data } = await supabase
        .from('profiles')
        .select(
          'id, full_name, username, avatar_url, bio, batch_year, interaction_scope, campus_id, campuses(name), colleges(name)'
        )
        .in('id', unique)
      if (!data) return
      setPeople((prev) => {
        const next = { ...prev }
        for (const p of data as any[]) next[p.id] = p
        return next
      })
    },
    [supabase]
  )

  const loadChats = useCallback(
    async (uid: string) => {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select(
          'id, created_at, conversation_participants(profile_id, last_read_at, profiles(full_name, username, avatar_url))'
        )
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        setChats([])
        return
      }

      const list = (convs || []) as any[]
      const convIds = list.map((c) => c.id)
      if (!convIds.length) {
        setChats([])
        return
      }

      // One batch for the whole list: latest preview + unread counts.
      const { data: msgs } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, message_type, is_deleted, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(500)

      const messages = (msgs || []) as MessageRow[]
      const latest = latestByConversation(messages)
      const unread = unreadByConversation(list, messages, uid)

      const entries: ChatEntry[] = list.map((c) => {
        const peerRow = (c.conversation_participants || []).find((p: any) => p.profile_id !== uid)
        const last = latest[c.id] || null
        // If the participants policy only exposes my own row, the peer is still
        // recoverable from who last wrote in the thread.
        const peerId = peerRow?.profile_id || (last && last.sender_id !== uid ? last.sender_id : null)
        return {
          id: c.id,
          peerId,
          peer: one(peerRow?.profiles),
          last,
          unread: unread[c.id] || 0,
        }
      })

      const known = entries.filter((e) => e.peerId && !e.peer).map((e) => e.peerId)
      if (known.length) await loadPeople(known)

      entries.sort((a, b) => {
        const at = a.last?.created_at || ''
        const bt = b.last?.created_at || ''
        return bt.localeCompare(at)
      })
      setChats(entries.filter((e) => Boolean(e.peerId)) as ChatEntry[])
    },
    [supabase, loadPeople]
  )

  const loadNetwork = useCallback(
    async (uid: string) => {
      // Both directions in one query — the tabs split them in memory.
      const { data, error } = await supabase
        .from('connections')
        .select('id, requester_id, receiver_id, status, created_at')
        .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)

      if (error) return
      const list = (data || []) as ConnectionRow[]
      setRows(list)
      await loadPeople(list.map((r) => peerOf(r, uid)))
    },
    [supabase, loadPeople]
  )

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/login?redirect=' + encodeURIComponent('/messages'))
          return
        }
        setUser(user)
        await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
            .then(({ data }) => setProfile(data)),
          loadChats(user.id),
          loadNetwork(user.id),
        ])
      } catch {
        /* the page shows its empty states */
      }
      setLoading(false)
    }
    init()
  }, [supabase, router, loadChats, loadNetwork])

  // Debounced people search — 300ms, the same rhythm the talent search used.
  useEffect(() => {
    const q = sanitizeSearch(query)
    if (!user || tab !== 'find' || q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select(
          'id, full_name, username, avatar_url, bio, batch_year, interaction_scope, campus_id, campuses(name), colleges(name)'
        )
        .eq('is_public', true)
        .neq('id', user.id)
        .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(20)
      if (cancelled) return
      const list = (data || []) as any[]
      setResults(list)
      setSearching(false)
      setPeople((prev) => {
        const next = { ...prev }
        for (const p of list) next[p.id] = p
        return next
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, tab, user, supabase])

  const network = useMemo(() => buildNetwork(rows, user?.id || ''), [rows, user?.id])
  const unread = useMemo(() => chats.reduce((sum, c) => sum + (c.unread || 0), 0), [chats])
  const pendingTotal = network.received.length

  const respond = async (row: { id: string }, accept: boolean) => {
    if (!user || busy) return
    setBusy(row.id)
    const { data: ok, error } = await supabase.rpc('respond_to_connection', {
      p_connection_id: row.id,
      p_accept: accept,
    })
    setBusy(null)
    if (error || !ok) {
      toast('Could not update the request', { tone: 'danger' })
      return
    }
    if (accept) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'accepted' } : r)))
      toast('Connected — you can message each other now', { tone: 'success' })
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      toast('Request declined')
    }
  }

  const withdraw = async (row: { id: string }) => {
    if (!user || busy) return
    setBusy(row.id)
    const { error } = await supabase.from('connections').delete().eq('id', row.id).eq('requester_id', user.id)
    setBusy(null)
    if (error) {
      toast('Could not withdraw the request', { tone: 'danger' })
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    toast('Request withdrawn')
  }

  /**
   * Send a request through the server route. It re-checks the interaction
   * scope and returns a reason for every refusal, so this button can never
   * surface the old opaque "could not send" dead end.
   */
  const connect = async (peerId: string) => {
    if (!user || busy) return
    setBusy(peerId)
    const result = await sendConnectionRequest(peerId)
    await loadNetwork(user.id)
    setBusy(null)
    const copy = requestResultCopy(result)
    toast(copy.message, { tone: copy.tone })
  }

  const openConversation = async (peerId: string) => {
    if (!user || busy) return
    setBusy(peerId)
    const { data: convId, error } = await supabase.rpc('start_or_get_conversation', { p_peer_id: peerId })
    setBusy(null)
    if (error || !convId) {
      toast('You can only message students you are connected with', { tone: 'danger' })
      return
    }
    router.push(`/messages/${convId}`)
  }

  const actionFor = (peerId: string): { state: ConnState; label: string; run: () => void } => {
    const state = connectionState(rows, user?.id || '', peerId)
    if (state === 'accepted') return { state, label: 'Message', run: () => openConversation(peerId) }
    if (state === 'pending_sent') {
      // Only MY row can be withdrawn (the DB enforces requester_id on delete).
      const row = rows.find((r) => r.requester_id === user?.id && r.receiver_id === peerId && r.status !== 'accepted')
      return {
        state,
        label: 'Requested',
        run: () => row && withdraw(row),
      }
    }
    if (state === 'pending_received') {
      // Only THEIR row can be accepted (respond_to_connection checks receiver).
      const row = rows.find((r) => r.receiver_id === user?.id && r.requester_id === peerId && r.status !== 'accepted')
      return {
        state,
        label: 'Accept',
        run: () => row && respond(row, true),
      }
    }
    // The database policy refuses this pair; say so instead of offering a
    // button that can only fail (campus-only profile on another campus).
    if (!canRequestConnection(profile, people[peerId])) {
      return { state, label: 'Campus only', run: () => {} }
    }
    return { state, label: 'Connect', run: () => connect(peerId) }
  }

  const personName = (id: string) => {
    const p = people[id]
    return p?.full_name || (p?.username ? `@${p.username}` : 'Student')
  }

  const personMeta = (id: string) => {
    const p = people[id]
    if (!p) return ''
    const campus = one(p.campuses)?.name || one(p.colleges)?.name
    const batch = p.batch_year ? `Batch ${p.batch_year}` : ''
    return [campus, batch].filter(Boolean).join(' · ')
  }

  const renderPersonRow = (id: string, actions: ReactNode) => {
    const p = people[id]
    return (
      <div
        key={id}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 4px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Avatar
          name={p?.full_name}
          avatarUrl={p?.avatar_url}
          size={44}
          onClick={() => p?.username && router.push(`/profile/${p.username}`)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            onClick={() => p?.username && router.push(`/profile/${p.username}`)}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              cursor: p?.username ? 'pointer' : 'default',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {personName(id)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '1px 0 0' }}>
            {p?.username ? `@${p.username}` : 'Student'}
            {personMeta(id) ? ` · ${personMeta(id)}` : ''}
          </p>
        </div>
        {actions}
      </div>
    )
  }

  const tabCount = (key: TabKey): number => {
    if (key === 'chats') return unread
    if (key === 'requests') return network.received.length
    if (key === 'sent') return network.sent.length
    if (key === 'connections') return network.accepted.length
    return 0
  }

  const actionButton = (peerId: string) => {
    const action = actionFor(peerId)
    const isBusy = busy === peerId || busy === connectionBetween(rows, user?.id || '', peerId)?.id
    const blocked = action.label === 'Campus only'
    const primary =
      !blocked && (action.state === 'none' || action.state === 'pending_received' || action.state === 'accepted')
    return (
      <button
        onClick={action.run}
        disabled={isBusy || blocked}
        title={blocked ? 'This student only accepts requests from their own campus' : undefined}
        style={{
          flexShrink: 0,
          minWidth: 86,
          padding: '8px 14px',
          borderRadius: 8,
          border: primary ? 'none' : '1px solid var(--border)',
          background: primary ? 'var(--accent)' : 'var(--bg)',
          color: primary ? 'var(--on-accent)' : 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 600,
          cursor: isBusy || blocked ? 'default' : 'pointer',
          fontFamily: 'inherit',
          opacity: isBusy ? 0.65 : blocked ? 0.8 : 1,
        }}
      >
        {isBusy ? '…' : action.label}
      </button>
    )
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="messages">
        <div className="page-wrap">
          {/* Header */}
          <div className="hc-page-head">
            <div style={{ minWidth: 0 }}>
              <h1 className="hc-h1">
                Your <em className="hc-em">campus circle.</em>
              </h1>
              <p className="hc-lede">
                Send a request, accept one, and chat with students across campuses — messaging unlocks when you connect.
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Messaging sections"
            className="chip-scroll"
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 18,
              borderBottom: '1px solid var(--border)',
              overflowX: 'auto',
            }}
          >
            {TABS.map((t) => {
              const count = tabCount(t.key)
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeTab(t.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '9px 14px',
                    fontSize: 13.5,
                    fontWeight: 600,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  <Icon name={t.icon} size={15} />
                  {t.label}
                  {count > 0 && (
                    <span
                      style={{
                        minWidth: 17,
                        height: 17,
                        padding: '0 5px',
                        borderRadius: 9,
                        background: t.key === 'chats' ? 'var(--accent)' : 'var(--bg-tertiary)',
                        color: t.key === 'chats' ? 'var(--on-accent)' : 'var(--text-secondary)',
                        fontSize: 10.5,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--radius)' }} />
              ))}
            </div>
          ) : tab === 'chats' ? (
            chats.length === 0 ? (
              <EmptyState
                icon="message"
                title="No conversations yet"
                body="Connect with a student first — once they accept, your chat opens here and you can message each other."
                cta="Find people to connect with"
                onCta={() => changeTab('find')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {pendingTotal > 0 && (
                  <button
                    onClick={() => changeTab('requests')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 14px',
                      marginBottom: 8,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--accent-border, var(--border))',
                      background: 'var(--accent-light)',
                      color: 'var(--accent-text)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon name="users" size={16} />
                    {pendingTotal === 1 ? '1 connection request' : `${pendingTotal} connection requests`} waiting
                    <span style={{ marginLeft: 'auto' }}>Review →</span>
                  </button>
                )}
                {chats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/messages/${c.id}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid transparent',
                      background: c.unread > 0 ? 'var(--accent-light)' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Avatar
                      name={c.peer?.full_name || people[c.peerId]?.full_name}
                      avatarUrl={c.peer?.avatar_url}
                      size={46}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: c.unread > 0 ? 700 : 600,
                            color: 'var(--text-primary)',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.peer?.full_name || people[c.peerId]?.full_name || 'Student'}
                        </p>
                        {c.last && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatRelativeTime(c.last.created_at)}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p
                          style={{
                            fontSize: 12.5,
                            color: c.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {conversationPreview(c.last, user?.id || '')}
                        </p>
                        {c.unread > 0 && (
                          <span
                            style={{
                              minWidth: 18,
                              height: 18,
                              padding: '0 5px',
                              borderRadius: 10,
                              background: 'var(--accent)',
                              color: 'var(--on-accent)',
                              fontSize: 10.5,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : tab === 'requests' ? (
            network.received.length === 0 ? (
              <EmptyState
                icon="users"
                title="No pending requests"
                body="When someone asks to connect, their request appears here. Accept it and messaging opens for both of you."
                cta="Find people to connect with"
                onCta={() => changeTab('find')}
              />
            ) : (
              <div>
                {network.received.map((c) =>
                  renderPersonRow(
                    c.peerId,
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => respond(c, true)}
                        disabled={busy === c.id}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: 'var(--success)',
                          color: 'var(--on-accent)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: busy === c.id ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(c, false)}
                        disabled={busy === c.id}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--text-secondary)',
                          fontSize: 13,
                          cursor: busy === c.id ? 'default' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  )
                )}
              </div>
            )
          ) : tab === 'sent' ? (
            network.sent.length === 0 ? (
              <EmptyState
                icon="send"
                title="No sent requests"
                body="Requests you send wait here until the other student responds. You can withdraw one any time."
                cta="Find people to connect with"
                onCta={() => changeTab('find')}
              />
            ) : (
              <div>
                {network.sent.map((c) =>
                  renderPersonRow(
                    c.peerId,
                    <button
                      onClick={() => withdraw(c)}
                      disabled={busy === c.id}
                      style={{
                        flexShrink: 0,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text-secondary)',
                        fontSize: 13,
                        cursor: busy === c.id ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Withdraw
                    </button>
                  )
                )}
              </div>
            )
          ) : tab === 'connections' ? (
            network.accepted.length === 0 ? (
              <EmptyState
                icon="users"
                title="No connections yet"
                body="Your accepted connections live here. Open a chat without leaving the page."
                cta="Find people to connect with"
                onCta={() => changeTab('find')}
              />
            ) : (
              <div>
                {network.accepted.map((c) =>
                  renderPersonRow(
                    c.peerId,
                    <button
                      onClick={() => openConversation(c.peerId)}
                      disabled={busy === c.peerId}
                      style={{
                        flexShrink: 0,
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: busy === c.peerId ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Icon name="message" size={14} />
                      Message
                    </button>
                  )
                )}
              </div>
            )
          ) : (
            /* Find people — search public profiles, then act on the relationship */
            <div>
              <label
                htmlFor="people-search"
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                Search students by name or @username
              </label>
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
                  <Icon name="search" size={16} />
                </span>
                <input
                  id="people-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Ayush, @ayush_21, CSE senior"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px 12px 40px',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: 'inherit',
                    color: 'var(--text-primary)',
                    background: 'var(--bg)',
                  }}
                />
              </div>

              {sanitizeSearch(query).length < 2 ? (
                <EmptyState
                  icon="users"
                  title="Find your people"
                  body="Type at least two letters of a name or username. You can connect with anyone whose profile is public, then start a chat once they accept."
                  compact
                />
              ) : searching ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                  Searching…
                </p>
              ) : results.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No students found"
                  body="Try a different spelling, or search by @username. Only public profiles appear here."
                  compact
                />
              ) : (
                <div>{results.map((p) => renderPersonRow(p.id, actionButton(p.id)))}</div>
              )}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}

/**
 * `useSearchParams` needs a Suspense boundary in the app router, otherwise the
 * whole route is forced to client-side rendering at build time.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 'var(--app-vh)' }} />}>
      <MessagesPageInner />
    </Suspense>
  )
}
