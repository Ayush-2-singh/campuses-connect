'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { ListSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export default function MessagesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [chats, setChats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login?redirect=/messages'); return }
    setUser(user)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const { data: convs } = await supabase
      .from('conversations')
      .select('id, created_at, conversation_participants(profile_id, last_read_at, profiles(full_name, username, avatar_url))')
      .order('created_at', { ascending: false })
      .limit(50)

    const list = convs || []
    const rows = await Promise.all(list.map(async (c: any) => {
      const me = (c.conversation_participants || []).find((p: any) => p.profile_id === user.id)
      const peer = (c.conversation_participants || []).find((p: any) => p.profile_id !== user.id)
      const myLastRead = me?.last_read_at || '1970-01-01T00:00:00Z'
      const [lastRes, unreadRes] = await Promise.all([
        supabase.from('messages').select('content, created_at, sender_id')
          .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('messages').select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id).neq('sender_id', user.id).gt('created_at', myLastRead),
      ])
      return {
        id: c.id,
        peer: peer?.profiles || {},
        last: lastRes.data?.[0] || null,
        unread: unreadRes.count || 0,
      }
    }))
    rows.sort((a, b) => {
      const ta = a.last?.created_at || a.peer?.created_at || ''
      const tb = b.last?.created_at || b.peer?.created_at || ''
      return tb.localeCompare(ta)
    })
    setChats(rows)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="message" size={17} />
          </span>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Messages</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>Chats with people you&apos;re connected with</p>
          </div>
        </div>

        {loading ? (
          <ListSkeleton count={4} />
        ) : chats.length === 0 ? (
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
        )}
      </div>
    </Layout>
  )
}
