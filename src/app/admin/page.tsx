'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'

const TABS = ['Overview', 'Users', 'Posts', 'Moderation', 'Colleges']

export default function AdminPage() {
  const [profile, setProfile] = useState<any>(null)
  const [grants, setGrants] = useState<any[]>([])
  const [allGrants, setAllGrants] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('Overview')
  const [users, setUsers] = useState<any[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementScope, setAnnouncementScope] = useState('global')
  const [campuses, setCampuses] = useState<any[]>([])
  const [selectedCampusId, setSelectedCampusId] = useState('')
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)
  const [colleges, setColleges] = useState<any[]>([])
  const [stats, setStats] = useState({ users: 0, posts: 0, colleges: 0 })
  const [adminError, setAdminError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modItems, setModItems] = useState<any[]>([])
  const [modLoading, setModLoading] = useState(false)
  const [modBusy, setModBusy] = useState<string | null>(null)
  const [modDigest, setModDigest] = useState('')
  const [digestLoading, setDigestLoading] = useState(false)
  const [aiNotes, setAiNotes] = useState<Record<string, any>>({})
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      // V3: admin identity comes from admin_grants (my_admin_grants RPC),
      // not the dropped profiles.role column.
      const { data: grantData } = await supabase.rpc('my_admin_grants')
      const grantsArr = (grantData as any[]) || []
      const isAdmin = grantsArr.some(
        (g: any) => g.admin_type === 'platform_admin' || g.admin_type === 'campus_admin'
      )
      if (!isAdmin) {
        router.push('/feed')
        return
      }
      setGrants(grantsArr)

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
    const { data: allGrants } = await supabase.from('admin_grants').select('user_id, admin_type')
    setAllGrants(allGrants || [])
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

  /** V3: grant/revoke admin access through the admin_grants table */
  const setAdminAccess = async (userId: string, access: string) => {
    setAdminError('')

    // Self-lockout guards
    if (userId === profile?.id && access !== 'platform_admin') {
      setAdminError('You cannot remove your own platform admin access.')
      return
    }
    const target = users.find(u => u.id === userId)
    const isLastPlatformAdmin =
      allGrants.filter(g => g.admin_type === 'platform_admin').length <= 1 &&
      allGrants.some(g => g.user_id === userId && g.admin_type === 'platform_admin')
    if (isLastPlatformAdmin && access !== 'platform_admin') {
      setAdminError('Cannot revoke the last platform admin — you would lock everyone out.')
      return
    }
    let failed = false

    const { error: delErr } = await supabase
      .from('admin_grants')
      .delete()
      .eq('user_id', userId)
      .in('admin_type', ['platform_admin', 'campus_admin'])
    if (delErr) failed = true

    if (access !== 'none' && !failed) {
      const { error: insErr } = await supabase.from('admin_grants').insert({
        user_id: userId,
        admin_type: access,
        // scope campus_admin to the target user's own campus/college
        campus_id: access === 'campus_admin' ? target?.campus_id || profile?.campus_id || null : null,
        college_id: access === 'campus_admin' ? target?.college_id || profile?.college_id || null : null,
        granted_by: profile?.id,
      })
      if (insErr) failed = true
    }

    if (failed) setAdminError('Could not update admin access. This requires the users.manage permission (seed 009).')
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

  const postAnnouncement = async () => {
    if (!announcementText.trim()) return
    setPostingAnnouncement(true)
    await supabase.from('posts').insert({
      author_id: profile?.id,
      body: announcementText,
      post_type: 'announcement',
      scope: announcementScope === 'global' ? 'global' : 'campus',
      is_official: true,
      is_pinned: true,
      campus_id: announcementScope !== 'global' ? announcementScope : null,
      college_id: profile?.college_id,
    })
    setAnnouncementText('')
    setShowAnnouncement(false)
    setPostingAnnouncement(false)
    loadPosts()
  }

  const loadModeration = async () => {
    setModLoading(true)
    try {
      const res = await fetch('/api/admin/copilot/queue')
      if (res.ok) {
        const data = await res.json()
        setModItems(data.items || [])
      }
    } catch { /* ignore */ }
    setModLoading(false)
  }

  const resolveMod = async (itemId: string, action: string) => {
    setModBusy(itemId)
    await fetch('/api/admin/copilot/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, action }),
    })
    setModBusy(null)
    loadModeration()
  }

  const aiAnalyze = async (item: any) => {
    setModBusy(item.item_id)
    const res = await fetch('/api/admin/copilot/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: item.preview || '', contentType: item.content_type }),
    })
    if (res.ok) {
      const data = await res.json()
      setAiNotes(n => ({ ...n, [item.item_id]: data.verdict }))
    }
    setModBusy(null)
  }

  const aiDigest = async () => {
    setDigestLoading(true)
    setModDigest('')
    const res = await fetch('/api/admin/copilot/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: modItems.map(i => ({ type: i.content_type, preview: i.preview || '', reason: i.reason || '' })),
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setModDigest(data.digest || '')
    }
    setDigestLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'Users') loadUsers()
    if (activeTab === 'Posts') loadPosts()
    if (activeTab === 'Colleges') loadColleges()
    if (activeTab === 'Moderation') loadModeration()
  }, [activeTab])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading admin panel…</p>
    </div>
  )

  const isPlatformAdmin = grants.some((g: any) => g.admin_type === 'platform_admin')

  const ADMIN_OPTIONS = [
    { value: 'none', label: 'No admin access' },
    { value: 'campus_admin', label: 'Campus Admin' },
    { value: 'platform_admin', label: 'Platform Admin' },
  ]

  const userAccess = (userId: string) => {
    const gs = allGrants.filter((g: any) => g.user_id === userId)
    if (gs.some((g: any) => g.admin_type === 'platform_admin')) return 'platform_admin'
    if (gs.some((g: any) => g.admin_type === 'campus_admin')) return 'campus_admin'
    return 'none'
  }

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="admin-header" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
              Campus<span style={{ color: 'var(--accent)' }}>Connect</span> Admin
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              {grants.some((g: any) => g.admin_type === 'platform_admin') ? 'Platform Admin' : 'Campus Admin'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle mode="inline" />
            <button onClick={() => router.push('/feed')}
              style={{ background: 'none', border: '1px solid var(--border)', padding: '7px 14px', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back to Feed
            </button>
          </div>
        </div>
      </div>

      <div className="admin-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        {/* Tabs */}
        <div className="admin-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
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
                <div key={s.label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>{s.emoji}</p>
                  <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', margin: '0 0 4px' }}>{s.value}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                Welcome to the admin panel. Use the tabs above to manage <strong>Users</strong> (grant or revoke admin access),
                <strong> Posts</strong> (pin or delete), and <strong>Colleges</strong> (view registered institutions).
              </p>
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === 'Users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {adminError && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 4 }}>
                {adminError}
              </div>
            )}
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading users…</p>
            ) : users.map(u => (
              <div key={u.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{u.full_name || 'No name'}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    @{u.username || '—'} · {u.colleges?.name || 'No college'}
                  </p>
                </div>
                {isPlatformAdmin ? (
                  <select
                    value={userAccess(u.id)}
                    onChange={e => setAdminAccess(u.id, e.target.value)}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {ADMIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Platform admins manage access</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Global Announcement */}
        {activeTab === 'Posts' && (
          <div style={{ marginBottom: 16 }}>
            {!showAnnouncement ? (
              <button onClick={() => setShowAnnouncement(true)}
                style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🌐 Post Global Announcement
              </button>
            ) : (
              <div style={{ background: 'var(--bg)', border: '2px solid var(--accent-text)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>🌐 Post Official Announcement</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => setAnnouncementScope('global')} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: announcementScope === 'global' ? 'var(--accent)' : 'var(--border-strong)', color: announcementScope === 'global' ? 'var(--on-accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>🌐 All Campuses</button>
                  {campuses.map(c => (
                    <button key={c.id} onClick={() => setAnnouncementScope(c.id)} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: announcementScope === c.id ? 'var(--success)' : 'var(--border-strong)', color: announcementScope === c.id ? 'var(--on-accent)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>🏫 {c.name}</button>
                  ))}
                </div>
                <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)}
                  placeholder="Write your official announcement..." rows={4}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => setShowAnnouncement(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={postAnnouncement} disabled={!announcementText.trim() || postingAnnouncement}
                    style={{ flex: 2, background: postingAnnouncement ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '9px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {postingAnnouncement ? 'Posting...' : announcementScope === 'global' ? '🌐 Post Global Announcement' : '🏫 Post Campus Announcement'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Posts */}
        {activeTab === 'Posts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {posts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading posts…</p>
            ) : posts.map(p => (
              <div key={p.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
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
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: p.is_pinned ? 'var(--orange-light)' : 'var(--bg)', color: p.is_pinned ? 'var(--orange-text)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {p.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button onClick={() => deletePost(p.id)}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Moderation — AI Admin Copilot */}
        {activeTab === 'Moderation' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🤖 AI Admin Copilot</h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {modItems.length} open {modItems.length === 1 ? 'item' : 'items'} (AI flags + user reports)
                </p>
              </div>
              <button onClick={aiDigest} disabled={digestLoading || !modItems.length}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: digestLoading || !modItems.length ? 'var(--purple-border)' : 'var(--accent-purple)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {digestLoading ? 'Thinking...' : '✨ AI Summary'}
              </button>
            </div>

            {modDigest && (
              <div style={{ background: 'var(--purple-light)', border: '1px solid var(--purple-border)', borderRadius: 14, padding: '16px 18px', marginBottom: 16, fontSize: 13, color: 'var(--purple-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                <strong>🤖 Copilot digest:</strong>
                {'\n'}{modDigest}
              </div>
            )}

            {modLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading moderation queue…</p>
            ) : modItems.length === 0 ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>🛡️</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Queue is clear</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  No content waiting for review. New posts are AI-checked automatically.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {modItems.map(item => {
                  const aiNote = aiNotes[item.item_id]
                  const severityColor =
                    item.ai_verdict?.severity === 'high' ? 'var(--danger)'
                    : item.ai_verdict?.severity === 'medium' ? '#d97706' : 'var(--success-text)'
                  return (
                    <div key={item.item_id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, background: item.source === 'ai' ? 'var(--purple-light)' : 'var(--warning-light)', color: item.source === 'ai' ? 'var(--purple-text)' : 'var(--warning-text)', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>
                            {item.source === 'ai' ? '🤖 AI Flag' : '🚩 User Report'}
                          </span>
                          <span style={{ fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{item.content_type}</span>
                          {item.ai_verdict?.severity && (
                            <span style={{ fontSize: 11, background: 'var(--danger-light)', color: severityColor, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                              {item.ai_verdict.severity}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.source === 'ai' ? (item.author_name || 'Anonymous') : `reported by ${item.author_name || 'Anonymous'}`} ·{' '}
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {item.preview ? item.preview.slice(0, 300) : '(no preview)'}
                        {item.preview?.length > 300 ? '…' : ''}
                      </p>

                      {(item.reason || item.ai_verdict?.reason) && (
                        <p style={{ fontSize: 12, color: 'var(--warning-text)', background: 'var(--warning-light)', border: '1px solid var(--warning-border)', borderRadius: 8, padding: '6px 10px', margin: '0 0 8px', lineHeight: 1.5 }}>
                          ⚠️ {item.ai_verdict?.reason || item.reason}
                        </p>
                      )}

                      {aiNote && (
                        <div style={{ fontSize: 12, color: 'var(--purple-text)', background: 'var(--purple-light)', border: '1px solid var(--purple-border)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.5 }}>
                          🤖 Fresh analysis: {aiNote.flagged ? `${aiNote.reason} (action: ${aiNote.action})` : 'Looks fine to publish.'}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => resolveMod(item.item_id, 'approve')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => resolveMod(item.item_id, 'remove')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ✕ Remove
                        </button>
                        <button onClick={() => resolveMod(item.item_id, 'dismiss')} disabled={modBusy === item.item_id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Dismiss
                        </button>
                        {item.source === 'user_report' && (
                          <button onClick={() => aiAnalyze(item)} disabled={modBusy === item.item_id}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--purple-border)', background: 'var(--purple-light)', color: 'var(--purple-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {modBusy === item.item_id ? 'Analyzing...' : '🤖 AI Analyze'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Colleges */}
        {activeTab === 'Colleges' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {colleges.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading colleges…</p>
            ) : colleges.map(c => (
              <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'var(--shadow-sm)' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{c.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{c.slug}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: c.is_active ? 'var(--success-light)' : 'var(--danger-light)',
                  color: c.is_active ? 'var(--success-text)' : 'var(--danger)',
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
