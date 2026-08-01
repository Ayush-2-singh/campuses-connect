'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const TABS = ['Overview', 'Users', 'Posts', 'Colleges']

export default function AdminPage() {
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('Overview')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [colleges, setColleges] = useState<any[]>([])
  const [stats, setStats] = useState({ users: 0, posts: 0, colleges: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()

      if (!prof || !['platform_admin', 'campus_admin'].includes(prof.role)) {
        router.push('/feed')
        return
      }
      setProfile(prof)

      const [{ count: userCount }, { count: postCount }, { count: collegeCount }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('colleges').select('*', { count: 'exact', head: true }),
      ])
      setStats({ users: userCount || 0, posts: postCount || 0, colleges: collegeCount || 0 })
      setLoading(false)
    }
    load()
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, colleges(name), campuses(name)')
      .order('created_at', { ascending: false })
      .limit(50)
    setUsers(data || [])
  }

  const loadPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }

  const loadColleges = async () => {
    const { data } = await supabase.from('colleges').select('*').order('name')
    setColleges(data || [])
  }

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    loadUsers()
  }

  const togglePin = async (postId: string, current: boolean) => {
    await supabase.from('posts').update({ is_pinned: !current }).eq('id', postId)
    loadPosts()
  }

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return
    await supabase.from('posts').delete().eq('id', postId)
    loadPosts()
  }

  useEffect(() => {
    if (activeTab === 'Users') loadUsers()
    if (activeTab === 'Posts') loadPosts()
    if (activeTab === 'Colleges') loadColleges()
  }, [activeTab])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading admin panel…</p>
    </div>
  )

  const ROLE_OPTIONS = ['student', 'faculty', 'ambassador', 'club_lead', 'campus_admin', 'platform_admin']

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
              Campus<span style={{ color: 'var(--accent)' }}>Connect</span> Admin
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{profile?.role}</p>
          </div>
          <button onClick={() => router.push('/feed')}
            style={{ background: 'none', border: '1px solid var(--border)', padding: '7px 14px', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Back to Feed
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px', fontSize: 14, fontWeight: 500,
                border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit',
              }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'Overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Users', value: stats.users, emoji: '👥' },
                { label: 'Total Posts', value: stats.posts, emoji: '📝' },
                { label: 'Colleges', value: stats.colleges, emoji: '🏫' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>{s.emoji}</p>
                  <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', margin: '0 0 4px' }}>{s.value}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                Welcome to the admin panel. Use the tabs above to manage <strong>Users</strong> (assign roles),
                <strong> Posts</strong> (pin or delete), and <strong>Colleges</strong> (view registered institutions).
              </p>
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === 'Users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading users…</p>
            ) : users.map(u => (
              <div key={u.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{u.full_name || 'No name'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    @{u.username || '—'} · {u.colleges?.name || 'No college'}
                  </p>
                </div>
                <select
                  value={u.role}
                  onChange={e => updateRole(u.id, e.target.value)}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Posts */}
        {activeTab === 'Posts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {posts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading posts…</p>
            ) : posts.map(p => (
              <div key={p.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.5 }}>
                      {p.body?.slice(0, 160)}{p.body?.length > 160 ? '…' : ''}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      @{p.profiles?.username} · {p.post_type} {p.is_pinned ? '· 📌 Pinned' : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => togglePin(p.id, p.is_pinned)}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: p.is_pinned ? '#fff7ed' : 'white', color: p.is_pinned ? '#c2410c' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {p.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={() => deletePost(p.id)}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Colleges */}
        {activeTab === 'Colleges' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {colleges.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading colleges…</p>
            ) : colleges.map(c => (
              <div key={c.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{c.slug}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: c.is_active ? '#f0fdf4' : '#fef2f2',
                  color: c.is_active ? '#15803d' : '#dc2626',
                }}>
                  {c.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
