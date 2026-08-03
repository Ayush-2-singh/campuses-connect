'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const supabase = createClient()

export default function FeedPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [mainTab, setMainTab] = useState<'announcements' | 'community'>('announcements')
  const [filter, setFilter] = useState('all')
  const [posts, setPosts] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<{ global: any[], campus: any[], department: any[] }>({ global: [], campus: [], department: [] })
  const [showCompose, setShowCompose] = useState(false)
  const [newPost, setNewPost] = useState({ body: '', post_type: 'general' })
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*, campuses(name), departments(name)').eq('id', user.id).single()
        setProfile(prof)
        await fetchAnnouncements(prof)
        await fetchPosts()
      } else {
        await fetchPosts()
      }
      setLoading(false)
    }
    load()
  }, [])

  const fetchAnnouncements = async (prof: any) => {
    // Global announcements
    const { data: globalAnn } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username, role)')
      .eq('scope', 'global')
      .eq('is_official', true)
      .order('created_at', { ascending: false })
      .limit(20)

    // Campus announcements
    const { data: campusAnn } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username, role)')
      .eq('scope', 'campus')
      .eq('is_official', true)
      .eq('campus_id', prof?.campus_id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Department announcements
    const { data: deptAnn } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username, role)')
      .eq('scope', 'department')
      .eq('is_official', true)
      .eq('department_id', prof?.department_id)
      .order('created_at', { ascending: false })
      .limit(20)

    setAnnouncements({
      global: globalAnn || [],
      campus: campusAnn || [],
      department: deptAnn || []
    })
  }

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username, role)')
      .eq('is_official', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
    setPosts(data || [])
  }

  const handlePost = async () => {
    if (!newPost.body.trim() || !user) return
    setPosting(true)
    await supabase.from('posts').insert({
      author_id: user.id,
      body: newPost.body,
      post_type: newPost.post_type,
      campus_id: profile?.campus_id,
      college_id: profile?.college_id,
      scope: 'campus',
      is_official: false,
    })
    setNewPost({ body: '', post_type: 'general' })
    setShowCompose(false)
    await fetchPosts()
    setPosting(false)
  }

  const handleLike = async (postId: string) => {
    if (!user) return
    const { data: existing } = await supabase.from('post_reactions').select('id').eq('post_id', postId).eq('user_id', user.id).single()
    if (existing) {
      await supabase.from('post_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction_type: 'like' })
    }
  }

  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.post_type === filter)

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const avatarColor = (name: string) => {
    const colors = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  const AnnouncementCard = ({ post, badge, badgeColor }: { post: any, badge: string, badgeColor: string }) => (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border)', padding: '18px', boxShadow: 'var(--shadow-sm)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, background: badgeColor, color: 'white', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{badge}</span>
        {post.is_pinned && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>📌 Pinned</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(post.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {post.profiles?.full_name?.[0] || '?'}
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{post.profiles?.full_name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{timeAgo(post.created_at)}</p>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0, lineHeight: 1.6 }}>{post.body}</p>
    </div>
  )

  const PostCard = ({ post }: { post: any }) => (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border)', padding: '18px', boxShadow: 'var(--shadow-sm)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor(post.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {post.profiles?.full_name?.[0] || '?'}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{post.profiles?.full_name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{post.profiles?.username} · {timeAgo(post.created_at)}</p>
          </div>
        </div>
        <span style={{ fontSize: 11, color: post.post_type === 'announcement' ? '#d97706' : 'var(--text-muted)', fontWeight: 500, textTransform: 'capitalize' }}>{post.post_type}</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: '0 0 14px', lineHeight: 1.6 }}>{post.body}</p>
      <div style={{ display: 'flex', gap: 16, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <button onClick={() => handleLike(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
          👍 Like
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
          💬 Comment
        </button>
      </div>
    </div>
  )

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* Profile incomplete banner */}
        {user && !profile?.campus_id && (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#92400e', margin: '0 0 4px' }}>👋 Complete your profile</p>
              <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>Select your campus to post and interact.</p>
            </div>
            <button onClick={() => router.push('/onboarding')}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Complete setup →
            </button>
          </div>
        )}

        {/* Main Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 12, padding: 4, marginBottom: 20 }}>
          <button onClick={() => setMainTab('announcements')}
            style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: mainTab === 'announcements' ? 'white' : 'transparent', color: mainTab === 'announcements' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: mainTab === 'announcements' ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, boxShadow: mainTab === 'announcements' ? 'var(--shadow-sm)' : 'none' }}>
            📢 Announcements
          </button>
          <button onClick={() => setMainTab('community')}
            style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', background: mainTab === 'community' ? 'white' : 'transparent', color: mainTab === 'community' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: mainTab === 'community' ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, boxShadow: mainTab === 'community' ? 'var(--shadow-sm)' : 'none' }}>
            💬 Community
          </button>
        </div>

        {/* ANNOUNCEMENTS TAB */}
        {mainTab === 'announcements' && (
          <div>
            {/* Global */}
            {announcements.global.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🌐</span>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>PW Official</h3>
                </div>
                {announcements.global.map(post => (
                  <AnnouncementCard key={post.id} post={post} badge="🌐 PW Official" badgeColor="#1d4ed8" />
                ))}
              </div>
            )}

            {/* Campus */}
            {announcements.campus.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🏫</span>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {profile?.campuses?.name || 'Campus'} Official
                  </h3>
                </div>
                {announcements.campus.map(post => (
                  <AnnouncementCard key={post.id} post={post} badge="🏫 Campus Official" badgeColor="#15803d" />
                ))}
              </div>
            )}

            {/* Department */}
            {announcements.department.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>📚</span>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Department Notices</h3>
                </div>
                {announcements.department.map(post => (
                  <AnnouncementCard key={post.id} post={post} badge="📚 Department" badgeColor="#7c3aed" />
                ))}
              </div>
            )}

            {announcements.global.length === 0 && announcements.campus.length === 0 && announcements.department.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No announcements yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Official announcements will appear here</p>
              </div>
            )}
          </div>
        )}

        {/* COMMUNITY TAB */}
        {mainTab === 'community' && (
          <div>
            {/* Compose */}
            {user && profile?.campus_id && (
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--border)', padding: '16px', marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
                {!showCompose ? (
                  <button onClick={() => setShowCompose(true)}
                    style={{ width: '100%', textAlign: 'left', background: 'var(--bg-secondary)', border: 'none', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700 }}>
                      {profile?.full_name?.[0] || '?'}
                    </div>
                    Share something with your campus...
                  </button>
                ) : (
                  <div>
                    <textarea value={newPost.body} onChange={e => setNewPost(n => ({ ...n, body: e.target.value }))}
                      placeholder="What's on your mind?" rows={3} autoFocus
                      style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', resize: 'none', color: 'var(--text-primary)', background: 'transparent', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <select value={newPost.post_type} onChange={e => setNewPost(n => ({ ...n, post_type: e.target.value }))}
                        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 13, color: 'var(--text-secondary)', background: 'white', fontFamily: 'inherit', cursor: 'pointer' }}>
                        <option value="general">💬 General</option>
                        <option value="opportunity">💼 Opportunity</option>
                        <option value="resource">📖 Resource</option>
                        <option value="discussion">🗣️ Discussion</option>
                      </select>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setShowCompose(false); setNewPost({ body: '', post_type: 'general' }) }}
                          style={{ background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={handlePost} disabled={!newPost.body.trim() || posting}
                          style={{ background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {posting ? 'Posting...' : 'Post'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
              {['all', 'opportunity', 'resource', 'discussion', 'general'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, border: filter === f ? 'none' : '1px solid var(--border)', background: filter === f ? 'var(--accent)' : 'white', color: filter === f ? 'white' : 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize', fontFamily: 'inherit' }}>
                  {f === 'all' ? 'All' : f === 'opportunity' ? '💼 Opportunity' : f === 'resource' ? '📖 Resource' : f === 'discussion' ? '🗣️ Discussion' : '💬 General'}
                </button>
              ))}
            </div>

            {/* Posts */}
            {filteredPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No posts yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post!</p>
              </div>
            ) : filteredPosts.map(post => <PostCard key={post.id} post={post} />)}
          </div>
        )}
      </div>
    </Layout>
  )
}
