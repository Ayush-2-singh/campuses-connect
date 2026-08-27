'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useToast } from '@/components/Toast'

type ConnRow = { id: string; requester_id: string; receiver_id: string; profile?: any; created_at?: string }

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

type TabKey = 'chats' | 'connections' | 'received' | 'sent'

export default function ConnectionsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [tab, setTab] = useState<TabKey>('chats')
  const [chats, setChats] = useState<any[]>([])
  const [connections, setConnections] = useState<ConnRow[]>([])
  const [received, setReceived] = useState<ConnRow[]>([])
  const [sent, setSent] = useState<ConnRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const { show: toast } = useToast()

  // Support deep links like /connections?tab=chats
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t && ['chats', 'connections', 'received', 'sent'].includes(t)) setTab(t as TabKey)
    } catch { /* ignore */ }
  }, [])

  const loadChats = useCallback(async (uid: string) => {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, created_at, conversation_participants(profile_id, last_read_at, profiles(full_name, username, avatar_url))')
      .order('created_at', { ascending: false })
      .limit(50)

    const list = convs || []
    const convIds = list.map((c: any) => c.id)
    if (!convIds.length) { setChats([]); return }

    // Batch: fetch last messages for ALL conversations in one query
    const [{ data: lastMessages }, { data: allMessages }] = await Promise.all([
      supabase.from('messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabase.from('messages')
        .select('conversation_id, sender_id, created_at')
        .in('conversation_id', convIds)
        .neq('sender_id', uid),
    ])

    // Deduplicate: keep only the latest message per conversation
    const lastMap = new Map<string, any>()
    for (const m of (lastMessages || []) as any[]) {
      if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m)
    }

    // Count unread per conversation using each user's last_read_at
    const unreadMap = new Map<string, number>()
    for (const c of list) {
      const me = (c.conversation_participants || []).find((p: any) => p.profile_id === uid)
      const myLastRead = me?.last_read_at || '1970-01-01T00:00:00Z'
      const unread = (allMessages || []).filter(
        (m: any) => m.conversation_id === c.id && m.created_at > myLastRead
      ).length
      unreadMap.set(c.id, unread)
    }

    const rows = list.map((c: any) => {
      const peer = (c.conversation_participants || []).find((p: any) => p.profile_id !== uid)
      return {
        id: c.id,
        peer: peer?.profiles || {},
        last: lastMap.get(c.id) || null,
        unread: unreadMap.get(c.id) || 0,
      }
    })
    rows.sort((a, b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || ''))
    setChats(rows)
  }, [supabase])

  const loadNetwork = useCallback(async (uid: string) => {
    const [connRes, recRes, sentRes] = await Promise.all([
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`).eq('status', 'accepted'),
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .eq('receiver_id', uid).eq('status', 'pending'),
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .eq('requester_id', uid).eq('status', 'pending'),
    ])
    const conns = connRes.data || []
    const recs = recRes.data || []
    const sents = sentRes.data || []
    const peerIds = [...new Set([
      ...conns.map((c: any) => c.requester_id === uid ? c.receiver_id : c.requester_id),
      ...recs.map((r: any) => r.requester_id),
      ...sents.map((s: any) => s.receiver_id),
    ])]
    let profs: any[] = []
    if (peerIds.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name, username, avatar_url, headline').in('id', peerIds)
      profs = p || []
    }
    const profMap = Object.fromEntries(profs.map((p: any) => [p.id, p]))
    setConnections(conns.map((c: any) => ({ id: c.id, requester_id: c.requester_id, receiver_id: c.receiver_id, profile: profMap[c.requester_id === uid ? c.receiver_id : c.requester_id] })))
    setReceived(recs.map((r: any) => ({ id: r.id, requester_id: r.requester_id, receiver_id: r.receiver_id, profile: profMap[r.requester_id] })))
    setSent(sents.map((s: any) => ({ id: s.id, requester_id: s.requester_id, receiver_id: s.receiver_id, profile: profMap[s.receiver_id] })))
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      await Promise.all([loadChats(user.id), loadNetwork(user.id)])
      setLoading(false)
    }
    init()
  }, [supabase, router, loadChats, loadNetwork])

  const respond = async (id: string, accept: boolean) => {
    setBusy(id)
    const { data: ok } = await supabase.rpc('respond_to_connection', { p_connection_id: id, p_accept: accept })
    setBusy(null)
    if (!ok) { toast('Could not update the request', { tone: 'danger' }); return }
    if (accept) {
      setReceived(prev => prev.filter(r => r.id !== id))
      toast('Connected! You can now message each other', { tone: 'success' })
      loadNetwork(user.id)
    } else {
      setReceived(prev => prev.filter(r => r.id !== id))
      toast('Request declined')
    }
  }

  const withdraw = async (id: string) => {
    setBusy(id)
    await supabase.from('connections').delete().eq('id', id).eq('requester_id', user.id)
    setBusy(null)
    setSent(prev => prev.filter(r => r.id !== id))
    toast('Request withdrawn')
  }

  const openConversation = async (peerId: string) => {
    const { data: convId, error } = await supabase.rpc('start_or_get_conversation', { p_peer_id: peerId })
    if (error || !convId) { toast('You can only message people you are connected with', { tone: 'danger' }); return }
    router.push(`/messages/${convId}`)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = tab === 'received' ? received : tab === 'sent' ? sent : connections
    if (!q) return list
    return list.filter(c => (c.profile?.full_name || '').toLowerCase().includes(q) || (c.profile?.username || '').toLowerCase().includes(q))
  }, [tab, connections, received, sent, query])

  const totalUnread = chats.reduce((sum, c) => sum + (c.unread || 0), 0)

  const TABS = [
    { key: 'chats' as const, label: '💬 Chats', count: totalUnread, showBadge: true },
    { key: 'connections' as const, label: 'Connections', count: connections.length },
    { key: 'received' as const, label: 'Received', count: received.length },
    { key: 'sent' as const, label: 'Sent', count: sent.length },
  ]

  return (
    <Layout user={user} profile={profile}>
    <ErrorBoundary pageName="network">
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>🤝 My Network</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Chats, connections and requests — only connected students can message each other.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }} className="scrollbar-hide">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flexShrink: 0, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'none', border: 'none', color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t.label}
              {t.count > 0 && (
                <span style={{ background: tab === t.key ? 'var(--accent-light)' : 'var(--bg-tertiary)', color: t.showBadge ? 'var(--accent)' : (tab === t.key ? 'var(--accent-text)' : 'var(--text-secondary)'), borderRadius: 20, padding: '1px 8px', fontSize: 11.5, marginLeft: 2, fontWeight: 700 }}>
                  {t.showBadge && t.count > 9 ? '9+' : t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search (connections tab) */}
        {tab === 'connections' && connections.length > 0 && (
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your connections…"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 13.5, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)', marginBottom: 12 }} />
        )}

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>Loading your network…</p>
        ) : tab === 'chats' ? (
          chats.length === 0 ? (
            <EmptyState
              icon="message"
              title="No conversations yet"
              body="Connect with people first — once they accept, you can message each other here."
              cta="Find people to connect with"
              onCta={() => router.push('/talent')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {chats.map(c => (
                <button key={c.id} onClick={() => router.push(`/messages/${c.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: 'none', background: c.unread > 0 ? 'var(--accent-light)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Avatar name={c.peer.full_name} avatarUrl={c.peer.avatar_url} size={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: c.unread > 0 ? 700 : 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.peer.full_name || '@' + c.peer.username}
                      </p>
                      {c.last && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(c.last.created_at)}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 12.5, color: c.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.last ? (c.last.sender_id === user.id ? `You: ${c.last.content}` : c.last.content) : 'Say hi 👋'}
                      </p>
                      {c.unread > 0 && (
                        <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title={tab === 'connections' ? 'No connections yet' : tab === 'received' ? 'No pending requests' : 'No sent requests'}
            body={tab === 'connections' ? 'Send connect requests from the Talent directory — only connected people can message each other.' : tab === 'received' ? 'When someone sends you a connect request, it will appear here for you to accept or decline.' : 'Requests you send will show up here until the other person responds.'}
            cta={tab === 'connections' ? 'Find people' : undefined}
            onCta={tab === 'connections' ? () => router.push('/talent') : undefined}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--border)' }}>
                <Avatar name={c.profile?.full_name} avatarUrl={c.profile?.avatar_url} size={44}
                  onClick={() => c.profile?.username && router.push(`/profile/${c.profile.username}`)}
                  style={{ cursor: 'pointer' } as any} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, cursor: 'pointer' }}
                    onClick={() => c.profile?.username && router.push(`/profile/${c.profile.username}`)}>
                    {c.profile?.full_name || 'Student'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '1px 0 0' }}>@{c.profile?.username}</p>
                  {c.profile?.headline && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.profile.headline}</p>}
                </div>

                {tab === 'connections' && (
                  <button onClick={() => c.profile?.id && openConversation(c.profile.id)}
                    style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    💬 Message
                  </button>
                )}
                {tab === 'received' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => respond(c.id, true)} disabled={busy === c.id}
                      style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Accept
                    </button>
                    <button onClick={() => respond(c.id, false)} disabled={busy === c.id}
                      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Decline
                    </button>
                  </div>
                )}
                {tab === 'sent' && (
                  <button onClick={() => withdraw(c.id)} disabled={busy === c.id}
                    style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Withdraw
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
    </Layout>
  )
}
