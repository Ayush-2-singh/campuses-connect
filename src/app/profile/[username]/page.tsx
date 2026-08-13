'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams, usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import MobileBottomNav from '@/components/MobileBottomNav'
import MobileMenu from '@/components/MobileMenu'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { CardSkeleton } from '@/components/Skeleton'
import { Icon } from '@/components/icons'

export default function UserProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('posts')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const params = useParams()
  const pathname = usePathname()
  const username = params.username as string
  const supabase = createClient()

  useEffect(() => { setMenuOpen(false) }, [pathname])

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

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }

  const postTypeConfig: Record<string, { bg: string; text: string; label: string }> = {
    announcement: { bg: 'var(--orange-light)', text: 'var(--orange-text)', label: 'Announcement' },
    opportunity: { bg: 'var(--success-light)', text: 'var(--success-text)', label: 'Opportunity' },
    resource: { bg: 'var(--accent-light)', text: 'var(--accent-text)', label: 'Resource' },
    discussion: { bg: 'var(--purple-light)', text: 'var(--purple-text)', label: 'Discussion' },
    general: { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)', label: 'General' },
    event: { bg: 'var(--orange-light)', text: 'var(--orange-text)', label: 'Event' },
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', padding: '24px 16px', maxWidth: 640, margin: '0 auto' }}>
      <CardSkeleton rows={3} />
      <div style={{ height: 12 }} />
      <CardSkeleton rows={2} />
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
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '13px 16px', zIndex: 30 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()}
            aria-label="Back" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)', flex: 1 }}>@{profile.username}</h1>
          <ThemeToggle mode="inline" />
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            style={{ width: 30, height: 30, borderRadius: '50%', border: menuOpen ? '1px solid var(--accent)' : '1px solid var(--border)', background: menuOpen ? 'var(--accent-light)' : 'var(--bg)', color: menuOpen ? 'var(--accent-text)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="menu" size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        {/* Profile card — premium with gradient banner */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ height: 68, background: 'linear-gradient(120deg, #E0A83C 0%, #41C8D8 55%, #A97BF0 100%)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(260px 80px at 85% 20%, rgba(255,255,255,0.35), transparent 70%)' }} />
          </div>
          <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, marginTop: -30, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} size={64} ring fontSize={24} />
              <div style={{ paddingBottom: 2 }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{profile.full_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>@{profile.username}</p>
              </div>
            </div>

            {!isOwnProfile && user && (
              <button onClick={handleConnect} disabled={connected || connecting}
                style={{ padding: '8px 18px', borderRadius: 8, border: connected ? '1px solid var(--border)' : '1px solid var(--accent)', background: connected ? 'var(--bg)' : 'var(--accent)', color: connected ? 'var(--text-secondary)' : 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: connected ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {connected ? 'Connected ✓' : connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
            {isOwnProfile && (
              <button onClick={() => router.push('/profile')}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--bg)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Edit Profile
              </button>
            )}
          </div>

          {profile.headline && (
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent-text)', margin: '0 0 8px' }}>{profile.headline}</p>
          )}

          {profile.bio && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>{profile.bio}</p>
          )}

          {Array.isArray(profile.skills) && profile.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {profile.skills.map((s: string) => (
                <span key={s} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', background: 'var(--accent-light)', border: '1px solid var(--accent-border)', padding: '3px 10px', borderRadius: 20 }}>{s}</span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            {profile.campuses?.name && <span>🏫 {profile.campuses.name}</span>}
            {profile.departments?.short_name && <span>· {profile.departments.short_name}</span>}
            {profile.current_year && <span>· Year {profile.current_year}</span>}
            {profile.batch_year && <span>· Batch {profile.batch_year}</span>}
          </div>

          {(profile.karma_points > 0 || profile.streak_days > 0 || profile.aura_points > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              {profile.aura_points > 0 && (
                <div style={{ background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-text)', margin: 0 }}>⚡ {profile.aura_points}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Aura · Season</p>
                </div>
              )}
              {profile.karma_points > 0 && (
                <div style={{ background: 'var(--yellow-light)', border: '1px solid var(--warning-border)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--yellow-text)', margin: 0 }}>⭐ {profile.karma_points}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Karma · Lifetime</p>
                </div>
              )}
              {profile.streak_days > 0 && (
                <div style={{ background: 'var(--orange-light)', border: '1px solid var(--orange-border)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange-text)', margin: 0 }}>🔥 {profile.streak_days}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>Day Streak</p>
                </div>
              )}
            </div>
          )}

          {(profile.github_url || profile.linkedin_url || profile.portfolio_url) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {profile.github_url && <a href={profile.github_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: 'var(--accent-light)', padding: '4px 10px', borderRadius: 6 }}>GitHub →</a>}
              {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: 'var(--accent-light)', padding: '4px 10px', borderRadius: 6 }}>LinkedIn →</a>}
              {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', background: 'var(--accent-light)', padding: '4px 10px', borderRadius: 6 }}>Portfolio →</a>}
            </div>
          )}
          </div>
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
              <EmptyState icon="message" title="No posts yet" body="When this person shares something on campus, it will show up here." />
            ) : posts.map(post => {
              const pc = postTypeConfig[post.post_type] || postTypeConfig.general
              return (
                <div key={post.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
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
              <EmptyState icon="book" title="No notes uploaded yet" body="Notes this person adds to the library will appear here." />
            ) : notes.map(note => (
              <div key={note.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px' }}>{note.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{note.subject} · Sem {note.semester}</p>
                </div>
                {note.drive_link && (
                  <a href={note.drive_link} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, textDecoration: 'none', background: 'var(--accent-light)', padding: '6px 12px', borderRadius: 8 }}>
                    Open →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <MobileBottomNav pathname={pathname} onNavigate={href => router.push(href)} />
      <MobileMenu open={menuOpen} top={52} pathname={pathname} onClose={() => setMenuOpen(false)} onNavigate={href => router.push(href)} />
    </div>
  )
}
