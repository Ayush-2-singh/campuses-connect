'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'

type NotifGroup = { label: string; icon: string; items: any[] }

/** Derive a meaningful type from the notification's own text — no fake metadata. */
function classify(body: string): { label: string; icon: string; tone: string } {
  const t = (body || '').toLowerCase()
  if (/(accepted|connection|request|follow)/.test(t)) return { label: 'Network', icon: 'users', tone: 'var(--accent-text)' }
  if (/(due|assignment|class|lesson|deadline)/.test(t)) return { label: 'Classroom', icon: 'book', tone: 'var(--purple-text)' }
  if (/(replied|comment|answered|discussion|question)/.test(t)) return { label: 'Discussion', icon: 'message', tone: 'var(--success-text)' }
  if (/(internship|hackathon|opportunity|scholarship|job|closes|opens)/.test(t)) return { label: 'Opportunity', icon: 'briefcase', tone: 'var(--orange-text)' }
  return { label: 'Update', icon: 'bell', tone: 'var(--text-secondary)' }
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function groupLabel(dateStr: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = startOfToday - d.getTime()
  if (diff < 0) return 'today'
  if (diff < 86400000) return 'yesterday'
  return 'earlier'
}

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUser(user)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data } = await supabase
        .from('notifications')
        .select('*, profiles!notifications_actor_id_fkey(full_name, username)')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setNotifications(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const markAllRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', user.id).eq('is_read', false)
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
  }

  /** Where does this notification point? null = no destination. */
  const targetFor = (n: any): string | null => {
    if (n.ref_type === 'post' && n.ref_id) return `/post/${n.ref_id}`
    if (n.ref_type === 'team_request') return '/teams'
    switch (n.type) {
      case 'answer': return '/ask'
      case 'new_opportunity': return '/opportunities'
      case 'new_event': return '/events'
      case 'new_note': return '/notes'
      case 'connection_request':
      case 'connection_accepted':
        return n.profiles?.username ? `/profile/${n.profiles.username}` : '/profile'
      case 'moderation':
        return n.ref_type === 'post' && n.ref_id ? `/post/${n.ref_id}` : '/more'
      default:
        return null
    }
  }

  const openNotification = async (n: any) => {
    // Mark as read first (fire-and-forget) so the badge clears.
    if (!n.is_read) {
      supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    }
    const target = targetFor(n)
    if (target) router.push(target)
  }

  const groups = useMemo<NotifGroup[]>(() => {
    const g: Record<string, NotifGroup> = {
      today: { label: 'Today', icon: 'clock', items: [] },
      yesterday: { label: 'Yesterday', icon: 'calendar', items: [] },
      earlier: { label: 'Earlier', icon: 'bell', items: [] },
    }
    for (const n of notifications) g[groupLabel(n.created_at)].items.push(n)
    return Object.values(g).filter(gr => gr.items.length > 0)
  }, [notifications])

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/more')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Notifications</h2>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ background: 'var(--accent-light)', color: 'var(--accent-text)', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Mark all as read
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          {unreadCount > 0 ? `${unreadCount} unread · ${notifications.length} total` : 'You’re all caught up'}
        </p>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius)' }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            body="Deadlines, replies, connections and campus updates will show up here as they happen."
            cta="Explore your campus"
            onCta={() => router.push('/feed')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map(gr => (
              <div key={gr.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ display: 'flex', color: 'var(--text-muted)' }}><Icon name={gr.icon} size={13} /></span>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{gr.label}</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gr.items.map(n => {
                    const cls = classify(n.body || n.title || '')
                    const target = targetFor(n)
                    return (
                      <div
                        key={n.id}
                        role={target ? 'button' : undefined}
                        tabIndex={target ? 0 : undefined}
                        onClick={() => openNotification(n)}
                        onKeyDown={e => { if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNotification(n) } }}
                        className="card-hover"
                        style={{ background: n.is_read ? 'var(--bg)' : 'var(--accent-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '13px 16px', boxShadow: 'var(--shadow-sm)', cursor: target ? 'pointer' : 'default' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: cls.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon name={cls.icon} size={15} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: cls.tone }}>{cls.label}</span>
                              {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                              {target && <span style={{ fontSize: 10.5, color: 'var(--accent)', marginLeft: 'auto', fontWeight: 700 }}>Open →</span>}
                            </div>
                            <p style={{ fontSize: 13.5, color: 'var(--text-primary)', margin: '0 0 3px', lineHeight: 1.5 }}>{n.body || n.title || 'New notification'}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
