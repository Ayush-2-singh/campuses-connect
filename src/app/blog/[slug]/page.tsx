'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'
import { CardSkeleton } from '@/components/Skeleton'
import { useHaptic } from '@/hooks/useMobile'

type BlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  body: string
  cover_url: string | null
  category: string
  tags: string[]
  company_name: string | null
  role: string | null
  view_count: number
  like_count: number
  comment_count: number
  published_at: string
  created_at: string
  author_id: string
  author_name: string
  author_username: string
  author_avatar: string | null
}

type Comment = {
  id: string
  body: string
  created_at: string
  author_name: string
  author_username: string
  author_avatar: string | null
  author_id: string
}

const CATEGORY_LABELS: Record<string, { icon: string; label: string }> = {
  interview_experience: { icon: '🎯', label: 'Interview Experience' },
  tech_blog: { icon: '💻', label: 'Tech Blog' },
  campus_life: { icon: '🏫', label: 'Campus Life' },
  how_to: { icon: '📚', label: 'How-To Guide' },
  project: { icon: '🚀', label: 'Project' },
  review: { icon: '⭐', label: 'Review' },
  general: { icon: '📄', label: 'Blog' },
}

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 7 ? `${days}d ago` : new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BlogPostPage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const supabase = createClient()
  const haptic = useHaptic()

  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [post, setPost] = useState<BlogPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [liked, setLiked] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const catInfo = CATEGORY_LABELS[post?.category || 'general'] || CATEGORY_LABELS.general

  const loadPost = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }

      // Fetch post by slug
      const { data: postData } = await supabase
        .from('blog_posts')
        .select('*, profiles!blog_posts_author_id_fkey(full_name, username, avatar_url)')
        .eq('slug', slug)
        .eq('status', 'published')
        .single()

      if (!postData) { setLoading(false); return }

      const p = postData as any
      setPost({
        ...p,
        author_name: p.profiles?.full_name || 'Anonymous',
        author_username: p.profiles?.username || 'unknown',
        author_avatar: p.profiles?.avatar_url,
      })

      // Increment view count
      await supabase.rpc('increment_blog_views', { post_id: p.id })

      // Check if user liked/bookmarked
      if (user) {
        const { data: likeData } = await supabase
          .from('blog_likes')
          .select('id')
          .eq('post_id', p.id)
          .eq('user_id', user.id)
          .maybeSingle()
        setLiked(!!likeData)
      }

      // Load comments
      const { data: commentData } = await supabase
        .from('blog_comments')
        .select('*, profiles!blog_comments_author_id_fkey(full_name, username, avatar_url)')
        .eq('post_id', p.id)
        .order('created_at', { ascending: true })

      setComments((commentData || []).map((c: any) => ({
        id: c.id,
        body: c.body,
        created_at: c.created_at,
        author_name: c.profiles?.full_name || 'Anonymous',
        author_username: c.profiles?.username || 'unknown',
        author_avatar: c.profiles?.avatar_url,
        author_id: c.author_id,
      })))
    } catch { /* page shows not found */ }
    setLoading(false)
  }, [slug, supabase])

  useEffect(() => { loadPost() }, [loadPost])

  const toggleLike = async () => {
    if (!user || !post) { router.push('/auth/login'); return }
    haptic.medium()
    const { data } = await supabase.rpc('toggle_blog_like', { p_post_id: post.id })
    setLiked(!!data)
    setPost(p => p ? { ...p, like_count: p.like_count + (data ? 1 : -1) } : p)
  }

  const handleComment = async () => {
    if (!commentText.trim() || !user || !post) return
    setSubmittingComment(true)
    haptic.tap()
    try {
      const { error } = await supabase.from('blog_comments').insert({
        post_id: post.id,
        author_id: user.id,
        body: commentText.trim(),
      })
      if (!error) {
        setCommentText('')
        // Reload comments
        const { data } = await supabase
          .from('blog_comments')
          .select('*, profiles!blog_comments_author_id_fkey(full_name, username, avatar_url)')
          .eq('post_id', post.id)
          .order('created_at', { ascending: true })
        setComments((data || []).map((c: any) => ({
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          author_name: c.profiles?.full_name || 'Anonymous',
          author_username: c.profiles?.username || 'unknown',
          author_avatar: c.profiles?.avatar_url,
          author_id: c.author_id,
        })))
        setPost(p => p ? { ...p, comment_count: p.comment_count + 1 } : p)
      }
    } catch { /* ignore */ }
    setSubmittingComment(false)
  }

  const deleteComment = async (commentId: string) => {
    if (!user) return
    await supabase.from('blog_comments').delete().eq('id', commentId).eq('author_id', user.id)
    setComments(cs => cs.filter(c => c.id !== commentId))
    setPost(p => p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p)
  }

  if (loading) return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>
        <CardSkeleton rows={8} />
      </div>
    </Layout>
  )

  if (!post) return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>
        <EmptyState
          icon="notebook"
          title="Blog post not found"
          body="This post may have been removed or doesn't exist."
          cta="Back to blog"
          onCta={() => router.push('/blog')}
        />
      </div>
    </Layout>
  )

  return (
    <Layout user={user} profile={profile}>
      <article style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Back button */}
        <button
          onClick={() => router.push('/blog')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
            background: 'none', border: 'none', color: 'var(--accent)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ← Back to Blog
        </button>

        {/* Cover image */}
        {post.cover_url && (
          <div style={{
            width: '100%', height: 280, borderRadius: 14, overflow: 'hidden',
            marginBottom: 24, background: 'var(--bg-tertiary)',
          }}>
            <img
              src={post.cover_url}
              alt={post.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {/* Category & Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 20,
            background: 'var(--accent-light)', color: 'var(--accent-text)', fontWeight: 600,
          }}>
            {catInfo.icon} {catInfo.label}
          </span>
          {post.company_name && (
            <span style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 20,
              background: 'var(--purple-light)', color: 'var(--purple-text)', fontWeight: 600,
            }}>
              🏢 {post.company_name}
            </span>
          )}
          {post.role && (
            <span style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 20,
              background: 'var(--orange-light)', color: 'var(--orange-text)', fontWeight: 600,
            }}>
              💼 {post.role}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 16px', lineHeight: 1.3, letterSpacing: '-0.02em',
        }}>
          {post.title}
        </h1>

        {/* Author & Stats */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
          paddingBottom: 20, borderBottom: '1px solid var(--border)',
        }}>
          <Avatar name={post.author_name} avatarUrl={post.author_avatar} size={40} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {post.author_name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              @{post.author_username} · {timeAgo(post.published_at)}
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            <span>👁 {post.view_count}</span>
            <span>💬 {post.comment_count}</span>
          </div>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
            {post.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 20,
                background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                fontWeight: 500,
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{
          fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8,
          marginBottom: 32, whiteSpace: 'pre-wrap',
        }}>
          {post.body}
        </div>

        {/* Action Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0',
          borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
          marginBottom: 32,
        }}>
          <button
            onClick={toggleLike}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 10, border: liked ? 'none' : '1px solid var(--border)',
              background: liked ? 'var(--accent)' : 'var(--bg)',
              color: liked ? 'var(--on-accent)' : 'var(--text-secondary)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {liked ? '❤️' : '🤍'} {post.like_count}
          </button>
          <button
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            💬 {post.comment_count}
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(window.location.href) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
              borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ↗ Share
          </button>
        </div>

        {/* Comments */}
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            💬 Comments ({comments.length})
          </h3>

          {/* Comment input */}
          {user ? (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={36} />
              <div style={{ flex: 1 }}>
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  rows={2}
                  style={{
                    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '10px 14px', fontSize: 14, outline: 'none', resize: 'none',
                    fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)',
                    boxSizing: 'border-box' as const,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    onClick={handleComment}
                    disabled={!commentText.trim() || submittingComment}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: !commentText.trim() || submittingComment ? 'var(--disabled)' : 'var(--accent)',
                      color: 'var(--on-accent)', fontSize: 13, fontWeight: 600,
                      cursor: !commentText.trim() || submittingComment ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {submittingComment ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 10, padding: 16,
              textAlign: 'center', marginBottom: 20,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                <span
                  onClick={() => router.push('/auth/login')}
                  style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Sign in
                </span> to leave a comment
              </p>
            </div>
          )}

          {/* Comment list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comments.map(comment => (
              <div key={comment.id} style={{ display: 'flex', gap: 10 }}>
                <Avatar name={comment.author_name} avatarUrl={comment.author_avatar} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 10,
                    padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {comment.author_name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      {comment.body}
                    </p>
                  </div>
                  {user?.id === comment.author_id && (
                    <button
                      onClick={() => deleteComment(comment.id)}
                      style={{
                        fontSize: 11, color: 'var(--text-muted)', background: 'none',
                        border: 'none', cursor: 'pointer', padding: '4px 0',
                        fontFamily: 'inherit', marginTop: 4,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </article>
    </Layout>
  )
}
