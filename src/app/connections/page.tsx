'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { useToast } from '@/components/Toast'

type ConnRow = { id: string; requester_id: string; receiver_id: string; profile?: any; created_at?: string }

export default function ConnectionsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [connections, setConnections] = useState<ConnRow[]>([])
  const [received, setReceived] = useState<ConnRow[]>([])
  const [sent, setSent] = useState<ConnRow[]>([])
  const [tab, setTab] = useState<'connections' | 'received' | 'sent'>('connections')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const { show: toast } = useToast()

  const load = useCallback(async () => {
    if (!user) return
    const [connRes, recRes, sentRes] = await Promise.all([
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status', 'accepted'),
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .eq('receiver_id', user.id).eq('status', 'pending'),
      supabase.from('connections').select('id, requester_id, receiver_id, created_at')
        .eq('requester_id', user.id).eq('status', 'pending'),
    ])
    const conns = connRes.data || []
    const recs = recRes.data || []
    const sents = sentRes.data || []
    const peerIds = [...new Set([
      ...conns.map((c: any) => c.requester_id === user.id ? c.receiver_id : c.requester_id),
      ...recs.map((r: any) => r.requester_id),
      ...sents.map((s: any) => s.receiver_id),
    ])]
    let profs: any[] = []
    if (peerIds.length) {
      const { data: p } = await supabase.from('profiles').select('id, full_name, username, avatar_url, headline').in('id', peerIds)
      profs = p || []
    }
    const profMap = Object.fromEntries(profs.map((p: any) => [p.id, p]))
    setConnections(conns.map((c: any) => ({ id: c.id, requester_id: c.requester_id, receiver_id: c.receiver_id, profile: profMap[c.requester_id === user.id ? c.receiver_id : c.requester_id] })))
    setReceived(recs.map((r: any) => ({ id: r.id, requester_id: r.requester_id, receiver_id: r.receiver_id, profile: profMap[r.requester_id] })))
    setSent(sents.map((s: any) => ({ id: s.id, requester_id: s.requester_id, receiver_id: s.receiver_id, profile: profMap[s.receiver_id] })))
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      setLoading(false)
    }
    init()
  }, [supabase, router])

  useEffect(() => { if (user) load() }, [user, load])

  const respond = async (id: string, accept: boolean) => {
    setBusy(id)
    const { data: ok } = await supabase.rpc('respond_to_connection', { p_connection_id: id, p_accept: accept })
    setBusy(null)
    if (!ok) { toast('Could not update the request', { tone: 'danger' }); return }
    if (accept) {
      setReceived(prev => prev.filter(r => r.id !== id))
      toast('Connected! You can now message each other', { tone: 'success' })
      load()
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

  const TABS = [
    { key: 'connections' as const, label: 'Connections', count: connections.length },
    { key: 'received' as const, label: 'Received', count: received.length },
    { key: 'sent' as const, label: 'Sent', count: sent.length },
  ]

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>🤝 My Network</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Manage your connections, pending requests and DMs — only connected students can message each other.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }} className="scrollbar-hide">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flexShrink: 0, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'none', border: 'none', color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t.label} <span style={{ background: tab === t.key ? 'var(--accent-light)' : 'var(--bg-tertiary)', color: tab === t.key ? 'var(--accent-text)' : 'var(--text-secondary)', borderRadius: 20, padding: '1px 8px', fontSize: 11.5, marginLeft: 2 }}>{t.count}</span>
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
    </Layout>
  )
}
