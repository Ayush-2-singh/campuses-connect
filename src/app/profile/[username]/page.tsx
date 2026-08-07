'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

export default function UserProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('posts')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const router = useRouter()
  const params = useParams()
  const username = params.username as string
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, colleges(name), campuses(name), departments(name, short_name)')
        .eq('username', username)
        .single()

      if (!prof) { router.push('/talent'); return }
      setProfile(prof)

      const [postsRes, notesRes] = await Promise.all([
        supabase.from('posts').select('*').eq('author_id', prof.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('notes').select('*').eq('uploaded_by', prof.id).order('created_at', { ascending: false }).limit(10),
      ])

      setPosts(postsRes.data || [])
      setNotes(notesRes.data || [])

      if (user) {
        const { data: conn } = await supabase
          .from('connections')
          .select('id, status')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'accepted')
          .limit(1)
        setConnected((conn || []).length > 0)
      }

      setLoading(false)
    }
    load()
  }, [username])

  const handleConnect = async () => {
    if (!user || !profile) return
    setConnecting(true)
    await supabase.from('connections').insert({
      requester_id: user.id,
      receiver_id: profile.id,
      status: 'pending',
    })
    setConnecting(false)
    setConnected(true)
  }

  const avatarColor = (name: string) => {
    const colors = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }

  const postTypeConfig: Record<string, { bg: string; text: string; label: string }> = {
    announcement: { bg: '#fff7ed', text: '#c2410c', label: 'Announcement' },
    opportunity: { bg: '#f0fdf4', text: '#15803d', label: 'Opportunity' },
    resource: { bg: '#eff6ff', text: '#1d4ed8', label: 'Resource' },
    discussion: { bg: '#f5f3ff', text: '#6d28d9', label: 'Discussion' },
    general: { bg: '#f8f9fa', text: '#495057', label: 'General' },
    event: { bg: '#fff7ed', text: '#c2410c', label: 'Event' },
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading profile…</p>
    </div>
  )

  if (!profile) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 48, marginBottom: 12 }}>🔍</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>User not found</p>
        <button onClick={() => router.push('/talent')} style={{ marginTop: 16, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>← Back to Talent</button>
      </div>
    </div>
  )

  const isOwnProfile = user?.id === profile.id

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: 'white', borderBottom: '1px solid var(--border)', padding: '13px 16px', zIndex: 10 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>←</button>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>@{profile.username}</h1>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Profile card */}
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: avatarColor(profile.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
                {profile.full_name?.[0] || '?'}
              </div>
              <div>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{profile.full_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>@{profile.username}</p>
              </div>
            </div>

            {!isOwnProfile && user && (
              <button onClick={handleConnect} disabled={connected || connecting}
                style={{ padding: '8px 18px', borderRadius: 8, border: connected ? '1px solid var(--border)' : '1px solid var(--accent)', background: connected ? 'white' : 'var(--accent)', color: connected ? 'var(--text-secondary)' : 'white', fontSize: 13, fontWeight: 600, cursor: connected ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {connected ? 'Connected ✓' : connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
            {isOwnProfile && (
              <button onClick={() => router.push('/profile')}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--accent)', background: 'white', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Edit Profile
              </button>
            )}
          </div>

          {profile.bio && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>{profile.bio}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            {profile.campuses?.name && <span>🏫 {profile.campuses.name}</span>}
            {profile.departments?.short_name && <span>· {profile.departments.short_name}</span>}
            {profile.current_year && <span>· Year {profile.current_year}</span>}
            {profile.batch_year && <span>· Batch {profile.batch_year}</span>}
          </div>

          {(profile.karma_points > 0 || profile.streak_days > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              {profile.karma_points > 0 && (
                <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#a16207', margin: 0 }}>⭐ {profile.karma_points}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Karma</p>
                </div>
              )}
              {profile.streak_days > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#c2410c', margin: 0 }}>🔥 {profile.streak_days}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Day Streak</p>
                </div>
              )}
            </div>
          )}

          {(profile.github_url || profile.linkedin_url || profile.portfolio_url) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {profile.github_url && <a href={profile.github_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>GitHub →</a>}
              {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>LinkedIn →</a>}
              {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: '#eff6ff', padding: '4px 10px', borderRadius: 6 }}>Portfolio →</a>}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          {['posts', 'notes'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '10px 18px', fontSize: 14, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer', color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {tab} ({tab === 'posts' ? posts.length : notes.length})
            </button>
          ))}
        </div>

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📝</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No posts yet</p>
              </div>
            ) : posts.map(post => {
              const pc = postTypeConfig[post.post_type] || postTypeConfig.general
              return (
                <div key={post.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ background: pc.bg, color: pc.text, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{pc.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(post.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    {post.body?.slice(0, 200)}{post.body?.length > 200 ? '…' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Notes tab */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ fontSize: 36, marginBottom: 8 }}>📚</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notes uploaded yet</p>
              </div>
            ) : notes.map(note => (
              <div key={note.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>{note.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{note.subject} · Sem {note.semester}</p>
                </div>
                {note.drive_link && (
                  <a href={note.drive_link} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, textDecoration: 'none', background: '#eff6ff', padding: '6px 12px', borderRadius: 8 }}>
                    Open →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid var(--border)', zIndex: 10 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex' }}>
          {[
            { icon: '🏠', label: 'Feed', href: '/feed' },
            { icon: '💼', label: 'Jobs', href: '/opportunities' },
            { icon: '📚', label: 'Notes', href: '/notes' },
            { icon: '🔍', label: 'Talent', href: '/talent' },
            { icon: '⋯', label: 'More', href: '/more' },
          ].map(item => (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
