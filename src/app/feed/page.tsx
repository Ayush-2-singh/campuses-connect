'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const POST_TYPES = ['all', 'announcement', 'opportunity', 'resource', 'discussion', 'general']
const typeConfig: any = {
  announcement: { bg: '#fff7ed', text: '#c2410c', label: 'Announcement' },
  opportunity: { bg: '#f0fdf4', text: '#15803d', label: 'Opportunity' },
  resource: { bg: '#eff6ff', text: '#1d4ed8', label: 'Resource' },
  discussion: { bg: '#f5f3ff', text: '#6d28d9', label: 'Discussion' },
  general: { bg: '#f8f9fa', text: '#495057', label: 'General' },
  event: { bg: '#fff7ed', text: '#c2410c', label: 'Event' },
}

export default function FeedPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [filter, setFilter] = useState('announcement')
  const [showCompose, setShowCompose] = useState(false)
  const [newPost, setNewPost] = useState({ body: '', post_type: 'general' })
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [commentingOn, setCommentingOn] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState<Record<string, any[]>>({})
  const router = useRouter()
  const supabase = createClient()

  const isMember = profile?.campus_id !== null && profile?.campus_id !== undefined

  const awardKarma = async (userId: string, points: number) => {
    await supabase.rpc('add_karma', { user_id: userId, points })
  }

  const updateStreak = async (userId: string) => {
    await supabase.rpc('update_streak', { user_id: userId })
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
        await updateStreak(user.id)
      }
      await fetchPosts()
      setLoading(false)
    }
    load()
  }, [])

  const fetchPosts = async () => {
    const { data } = await supabase
      .from('posts')
      .select('*, profiles(full_name, username, avatar_url, role)')
      .order('is_pinned', { ascending: false })
      .order('is_official', { ascending: false })
      .order('is_official', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)
    setPosts(data || [])
  }

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from('post_comments')
      .select('*, profiles(full_name, username)')
      .eq('post_id', postId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    setComments(prev => ({ ...prev, [postId]: data || [] }))
  }

  const handlePost = async () => {
    if (!newPost.body.trim() || !isMember) return
    setPosting(true)
    await supabase.from('posts').insert({
      author_id: user.id,
      campus_id: profile?.campus_id,
      college_id: profile?.college_id,
      body: newPost.body,
      post_type: newPost.post_type,
      visibility: 'campus'
    })
    await awardKarma(user.id, 5)
    await updateStreak(user.id)
    setNewPost({ body: '', post_type: 'general' })
    setShowCompose(false)
    await fetchPosts()
    setPosting(false)
  }

  const handleReaction = async (postId: string, authorId: string) => {
    if (!user || !isMember) return
    await supabase.from('post_reactions').upsert({ post_id: postId, profile_id: user.id, reaction: 'like' }, { onConflict: 'post_id,profile_id' })
    if (authorId !== user.id) await awardKarma(authorId, 1)
  }

  const handleComment = async (postId: string, authorId: string) => {
    if (!commentText.trim() || !isMember) return
    await supabase.from('post_comments').insert({ post_id: postId, author_id: user.id, body: commentText })
    await awardKarma(user.id, 2)
    if (authorId !== user.id) await awardKarma(authorId, 1)
    await updateStreak(user.id)
    setCommentText('')
    await fetchComments(postId)
  }

  const toggleComments = async (postId: string) => {
    if (commentingOn === postId) { setCommentingOn(null) }
    else { setCommentingOn(postId); if (!comments[postId]) await fetchComments(postId) }
  }

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
    const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.post_type === filter)

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px' }}>

        {/* Guest banners */}
        {user && !isMember && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: '#1d4ed8', margin: '0 0 4px' }}>👋 Complete your profile</p>
            <p style={{ fontSize: 13, color: '#3b82f6', margin: '0 0 10px' }}>Select your campus to post and interact.</p>
            <button onClick={() => router.push('/onboarding')}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Complete setup →
            </button>
          </div>
        )}

        {!user && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', margin: '0 0 4px' }}>Browse CampusConnect</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>Sign up to post, comment and connect.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => router.push('/auth/signup')} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Join free</button>
              <button onClick={() => router.push('/auth/login')} style={{ background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Sign in</button>
            </div>
          </div>
        )}

        {/* Compose */}
        {user && isMember && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16, boxShadow: 'var(--shadow-sm)' }}>
            {!showCompose ? (
              <div onClick={() => setShowCompose(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {profile?.full_name?.[0] || '?'}
                </div>
                <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: 'var(--text-muted)' }}>
                  Share something with your campus...
                </div>
              </div>
            ) : (
              <div>
                <textarea autoFocus value={newPost.body} onChange={e => setNewPost(n => ({ ...n, body: e.target.value }))}
                  placeholder="What's on your mind?" rows={4}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', resize: 'none', fontFamily: 'inherit', marginBottom: 10, background: 'var(--bg-secondary)', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <select value={newPost.post_type} onChange={e => setNewPost(n => ({ ...n, post_type: e.target.value }))}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-secondary)', background: 'white', outline: 'none', fontFamily: 'inherit' }}>
                    <option value="general">General</option>
                    {['ambassador','faculty','campus_admin','platform_admin'].includes(profile?.role) && <option value="announcement">Announcement</option>}
                    <option value="opportunity">Opportunity</option>
                    <option value="resource">Resource</option>
                    <option value="discussion">Discussion</option>
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowCompose(false); setNewPost({ body: '', post_type: 'general' }) }}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                    <button onClick={handlePost} disabled={!newPost.body.trim() || posting}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: posting || !newPost.body.trim() ? '#93c5fd' : 'var(--accent)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {posting ? 'Posting...' : 'Post +5⭐'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }} className="scrollbar-hide">
          {POST_TYPES.map(type => (
            <button key={type} onClick={() => setFilter(type)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: filter === type ? 'none' : '1px solid var(--border)', background: filter === type ? 'var(--accent)' : 'white', color: filter === type ? 'white' : 'var(--text-secondary)', cursor: 'pointer', textTransform: 'capitalize' }}>
              {type}
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        ) : filteredPosts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No posts yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post something!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredPosts.map(post => {
              const tc = typeConfig[post.post_type] || typeConfig.general
              return (
                <div key={post.id} style={{ background: 'white', borderRadius: 14, border: post.is_pinned ? '1px solid #bfdbfe' : '1px solid var(--border)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  {post.is_official && (
                    <div style={{ fontSize: 11, background: post.scope === 'global' ? '#1d4ed8' : '#15803d', color: 'white', padding: '3px 10px', borderRadius: 20, fontWeight: 600, marginBottom: 8, display: 'inline-block' }}>
                      {post.scope === 'global' ? '🌐 PW Official' : '🏫 Campus Official'}
                    </div>
                  )}
                  {post.is_pinned && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 10 }}>📌 Pinned</div>}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div onClick={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}`)}
                        style={{ width: 38, height: 38, borderRadius: '50%', background: avatarColor(post.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
                        {post.profiles?.full_name?.[0] || '?'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span onClick={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}`)}
                            style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                            {post.profiles?.full_name || 'Anonymous'}
                          </span>
                          {post.profiles?.role === 'ambassador' && <span style={{ fontSize: 10, background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>Ambassador</span>}
                          {post.profiles?.role === 'faculty' && <span style={{ fontSize: 10, background: '#f0fdf4', color: '#15803d', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>Faculty</span>}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{post.profiles?.username} · {timeAgo(post.created_at)}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, background: tc.bg, color: tc.text, padding: '3px 8px', borderRadius: 20, fontWeight: 500, flexShrink: 0 }}>{tc.label}</span>
                  </div>

                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>{post.body}</p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {isMember ? (
                      <>
                        <button onClick={() => handleReaction(post.id, post.author_id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                          👍 Like
                        </button>
                        <button onClick={() => toggleComments(post.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: commentingOn === post.id ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                          💬 {comments[post.id]?.length ? `${comments[post.id].length} comments` : 'Comment'}
                        </button>
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        <span onClick={() => router.push('/auth/signup')} style={{ color: 'var(--accent)', cursor: 'pointer' }}>Join</span> to like and comment
                      </p>
                    )}
                  </div>

                  {commentingOn === post.id && (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(comments[post.id] || []).map(comment => (
                        <div key={comment.id} style={{ display: 'flex', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(comment.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {comment.profiles?.full_name?.[0] || '?'}
                          </div>
                          <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 12px', flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>@{comment.profiles?.username}</p>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{comment.body}</p>
                          </div>
                        </div>
                      ))}
                      {isMember && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {profile?.full_name?.[0] || '?'}
                          </div>
                          <div style={{ display: 'flex', flex: 1, gap: 6 }}>
                            <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleComment(post.id, post.author_id)}
                              placeholder="Write a comment..."
                              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }} />
                            <button onClick={() => handleComment(post.id, post.author_id)} disabled={!commentText.trim()}
                              style={{ padding: '8px 14px', borderRadius: 20, border: 'none', background: commentText.trim() ? 'var(--accent)' : '#93c5fd', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Send
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
