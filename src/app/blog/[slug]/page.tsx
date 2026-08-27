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
  parent_id: string | null
  like_count: number
  liked_by_me: boolean
  replies?: Comment[]
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

// Build nested comment tree (YouTube style)
function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map<string, Comment>()
  const roots: Comment[] = []
  comments.forEach(c => { map.set(c.id, { ...c, replies: [] }) })
  comments.forEach(c => {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

// Single comment component (YouTube style)
function CommentItem({
  comment,
  postId,
  currentUserId,
  isAuthor,
  onReply,
  onLike,
  onDelete,
  depth = 0,
}: {
  comment: Comment
  postId: string
  currentUserId?: string
  isAuthor: boolean
  onReply: (parentId: string) => void
  onLike: (commentId: string) => void
  onDelete: (commentId: string) => void
  depth?: number
}) {
  const [showReplies, setShowReplies] = useState(depth === 0)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const supabase = createClient()
  const haptic = useHaptic()

  const submitReply = async () => {
    if (!replyText.trim() || !currentUserId) return
    setSubmittingReply(true)
    haptic.tap()
    try {
      await supabase.from('blog_comments').insert({
        post_id: postId,
        author_id: currentUserId,
        body: replyText.trim(),
        parent_id: comment.id,
      })
      setReplyText('')
      setShowReplyInput(false)
      onReply(comment.id) // Trigger reload
    } catch { /* ignore */ }
    setSubmittingReply(false)
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 48 : 0 }}>
      <div style={{ display: 'flex', gap: 12, padding: '12px 0' }}>
        {/* Avatar */}
        <Avatar name={comment.author_name} avatarUrl={comment.author_avatar} size={depth > 0 ? 28 : 36} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: depth > 0 ? 12 : 13, fontWeight: 600, color: 'var(--text-primary)',
            }}>
              @{comment.author_username}
            </span>
            {isAuthor && (
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                background: 'var(--accent-light)', color: 'var(--accent)',
                fontWeight: 700, textTransform: 'uppercase',
              }}>
                Author
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {timeAgo(comment.created_at)}
            </span>
          </div>

          {/* Body */}
          <p style={{
            fontSize: depth > 0 ? 13 : 14, color: 'var(--text-secondary)',
            margin: '0 0 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            {comment.body}
          </p>

          {/* Actions — YouTube style stroke icons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            {/* Like */}
            <button
              onClick={() => { haptic.tap(); onLike(comment.id) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 16,
                border: 'none', background: 'transparent',
                color: comment.liked_by_me ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={comment.liked_by_me ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              {comment.like_count > 0 && comment.like_count}
            </button>

            {/* Reply */}
            {currentUserId && depth === 0 && (
              <button
                onClick={() => { haptic.tap(); setShowReplyInput(!showReplyInput) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 16,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7"/>
                  <path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
                Reply
              </button>
            )}

            {/* Delete (own comments) */}
            {currentUserId === comment.author_id && (
              <button
                onClick={() => { haptic.tap(); onDelete(comment.id) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 16,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
          </div>

          {/* Reply input */}
          {showReplyInput && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 4 }}>
              <input
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitReply() }}
                placeholder="Add a reply..."
                autoFocus
                style={{
                  flex: 1, border: '1px solid var(--border)', borderRadius: 20,
                  padding: '8px 14px', fontSize: 13, outline: 'none',
                  fontFamily: 'inherit', color: 'var(--text-primary)',
                  background: 'var(--bg-secondary)',
                }}
              />
              <button
                onClick={submitReply}
                disabled={!replyText.trim() || submittingReply}
                style={{
                  padding: '8px 14px', borderRadius: 20, border: 'none',
                  background: !replyText.trim() ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)', fontSize: 12, fontWeight: 600,
                  cursor: !replyText.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {submittingReply ? '…' : 'Reply'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Replies (nested) */}
      {comment.replies && comment.replies.length > 0 && (
        <>
          {!showReplies ? (
            <button
              onClick={() => setShowReplies(true)}
              style={{
                marginLeft: 48, marginBottom: 8, padding: '6px 12px',
                borderRadius: 20, border: 'none', background: 'transparent',
                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ▶ {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
            </button>
          ) : (
            <div style={{ borderLeft: '2px solid var(--border)', marginLeft: 18, paddingLeft: 0 }}>
              {comment.replies.map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  currentUserId={currentUserId}
                  isAuthor={reply.author_id === postId}
                  onReply={onReply}
                  onLike={onLike}
                  onDelete={onDelete}
                  depth={1}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
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
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [sortBy, setSortBy] = useState<'top' | 'newest'>('top')
  const [reloadKey, setReloadKey] = useState(0)

  const catInfo = CATEGORY_LABELS[post?.category || 'general'] || CATEGORY_LABELS.general

  const loadComments = useCallback(async (postId: string) => {
    const { data } = await supabase
      .from('blog_comments')
      .select('*, profiles!blog_comments_author_id_fkey(full_name, username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    const commentsList = (data || []).map((c: any) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author_name: c.profiles?.full_name || 'Anonymous',
      author_username: c.profiles?.username || 'unknown',
      author_avatar: c.profiles?.avatar_url,
      author_id: c.author_id,
      parent_id: c.parent_id,
      like_count: 0,
      liked_by_me: false,
    }))

    // Fetch like counts and user likes
    if (commentsList.length > 0) {
      const commentIds = commentsList.map(c => c.id)
      const [{ data: likeCounts }, { data: userLikes }] = await Promise.all([
        supabase.from('blog_comment_likes').select('comment_id').in('comment_id', commentIds),
        user ? supabase.from('blog_comment_likes').select('comment_id').in('comment_id', commentIds).eq('user_id', user.id) : Promise.resolve({ data: [] }),
      ])

      // Count likes per comment
      const countMap = new Map<string, number>()
      ;(likeCounts || []).forEach((l: any) => {
        countMap.set(l.comment_id, (countMap.get(l.comment_id) || 0) + 1)
      })

      // Set of liked by current user
      const likedSet = new Set((userLikes || []).map((l: any) => l.comment_id))

      commentsList.forEach(c => {
        c.like_count = countMap.get(c.id) || 0
        c.liked_by_me = likedSet.has(c.id)
      })
    }

    setComments(commentsList)
  }, [supabase, user])

  const loadPost = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }

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

      await supabase.rpc('increment_blog_views', { post_id: p.id })

      if (user) {
        const { data: likeData } = await supabase
          .from('blog_likes')
          .select('id')
          .eq('post_id', p.id)
          .eq('user_id', user.id)
          .maybeSingle()
        setLiked(!!likeData)
      }

      await loadComments(p.id)
    } catch { /* page shows not found */ }
    setLoading(false)
  }, [slug, supabase, loadComments])

  useEffect(() => { loadPost() }, [loadPost]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (post) loadComments(post.id) }, [reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerReload = () => setReloadKey(k => k + 1)

  const toggleLike = async () => {
    if (!user || !post) { router.push('/auth/login'); return }
    haptic.medium()
    const { data } = await supabase.rpc('toggle_blog_like', { p_post_id: post.id })
    setLiked(!!data)
    setPost(p => p ? { ...p, like_count: p.like_count + (data ? 1 : -1) } : p)
  }

  const toggleCommentLike = async (commentId: string) => {
    if (!user) { router.push('/auth/login'); return }
    haptic.tap()
    const { data } = await supabase.rpc('toggle_blog_comment_like', { p_comment_id: commentId })
    setComments(cs => cs.map(c =>
      c.id === commentId
        ? { ...c, liked_by_me: !!data, like_count: c.like_count + (data ? 1 : -1) }
        : c
    ))
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
        setPost(p => p ? { ...p, comment_count: p.comment_count + 1 } : p)
        triggerReload()
      }
    } catch { /* ignore */ }
    setSubmittingComment(false)
  }

  const deleteComment = async (commentId: string) => {
    if (!user) return
    haptic.tap()
    await supabase.from('blog_comments').delete().eq('id', commentId).eq('author_id', user.id)
    setPost(p => p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p)
    triggerReload()
  }

  // Sort comments
  const sortedComments = [...comments]
    .filter(c => !c.parent_id) // Only top-level
    .sort((a, b) => {
      if (sortBy === 'top') return b.like_count - a.like_count
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const tree = buildCommentTree(sortedComments)

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
        <EmptyState icon="notebook" title="Blog post not found" body="This post may have been removed." cta="Back to blog" onCta={() => router.push('/blog')} />
      </div>
    </Layout>
  )

  return (
    <Layout user={user} profile={profile}>
      <article style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Back */}
        <button onClick={() => router.push('/blog')} style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
          background: 'none', border: 'none', color: 'var(--accent)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>← Back to Blog</button>

        {/* Cover */}
        {post.cover_url && (
          <div style={{ width: '100%', height: 280, borderRadius: 14, overflow: 'hidden', marginBottom: 24, background: 'var(--bg-tertiary)' }}>
            <img src={post.cover_url} alt={post.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent-text)', fontWeight: 600 }}>
            {catInfo.icon} {catInfo.label}
          </span>
          {post.company_name && (
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--purple-light)', color: 'var(--purple-text)', fontWeight: 600 }}>
              🏢 {post.company_name}
            </span>
          )}
          {post.role && (
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--orange-light)', color: 'var(--orange-text)', fontWeight: 600 }}>
              💼 {post.role}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px', lineHeight: 1.3 }}>
          {post.title}
        </h1>

        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <Avatar name={post.author_name} avatarUrl={post.author_avatar} size={40} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{post.author_name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{post.author_username} · {timeAgo(post.published_at)}</p>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>👁 {post.view_count}</span>
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
            {post.tags.map(tag => (
              <span key={tag} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 32, whiteSpace: 'pre-wrap' }}>
          {post.body}
        </div>

        {/* Action Bar — YouTube exact style: pill chips + bare icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 0', marginBottom: 24 }}>
          {/* Like — pill chip with border */}
          <button onClick={toggleLike} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 14px', borderRadius: 18,
            border: '1px solid var(--border)', background: liked ? 'var(--bg-tertiary)' : 'transparent',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Like
            {post.like_count > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 2 }}>{post.like_count}</span>
            )}
          </button>

          {/* Dislike — bare icon, no border, no background (YouTube exact) */}
          <button style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '50%',
            border: 'none', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'all 0.15s ease', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>
          </button>

          {/* Share — pill chip with border */}
          <button onClick={() => { haptic.tap(); navigator.clipboard?.writeText(window.location.href) }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 14px', borderRadius: 18,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </button>

          {/* Save / Bookmark — pill chip with border */}
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 14px', borderRadius: 18,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Save
          </button>

          {/* Three dots — bare icon, no border (YouTube exact) */}
          <button style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '50%',
            border: 'none', background: 'transparent',
            color: 'var(--text-muted)', cursor: 'pointer',
            transition: 'all 0.15s ease', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            COMMENTS SECTION — YouTube Style
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          {/* Header + Sort */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Comments {comments.length > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({comments.length})</span>}
            </h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setSortBy('top')} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', background: sortBy === 'top' ? 'var(--accent-light)' : 'transparent', color: sortBy === 'top' ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Top
              </button>
              <button onClick={() => setSortBy('newest')} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', background: sortBy === 'newest' ? 'var(--accent-light)' : 'transparent', color: sortBy === 'newest' ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Newest
              </button>
            </div>
          </div>

          {/* Comment Input (YouTube style) */}
          {user ? (
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={40} />
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleComment() }}
                  placeholder="Add a comment..."
                  style={{
                    width: '100%', border: 'none', borderBottom: '1px solid var(--border)',
                    padding: '10px 0', fontSize: 14, outline: 'none',
                    fontFamily: 'inherit', color: 'var(--text-primary)', background: 'transparent',
                  }}
                />
                {commentText.trim() && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setCommentText('')} style={{
                      padding: '8px 16px', borderRadius: 20, border: 'none',
                      background: 'transparent', color: 'var(--text-muted)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>Cancel</button>
                    <button
                      onClick={handleComment}
                      disabled={submittingComment}
                      style={{
                        padding: '8px 16px', borderRadius: 20, border: 'none',
                        background: 'var(--accent)', color: 'var(--on-accent)',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {submittingComment ? 'Posting…' : 'Comment'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 12, padding: 16,
              textAlign: 'center', marginBottom: 24, border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                <span onClick={() => router.push('/auth/login')} style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Sign in</span> to leave a comment
              </p>
            </div>
          )}

          {/* Comment List (YouTube style) */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tree.map(comment => (
              <CommentItem
                key={comment.id}
                comment={comment}
                postId={post.id}
                currentUserId={user?.id}
                isAuthor={comment.author_id === post.author_id}
                onReply={() => triggerReload()}
                onLike={toggleCommentLike}
                onDelete={deleteComment}
              />
            ))}
          </div>

          {comments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>💬</p>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No comments yet — be the first!</p>
            </div>
          )}
        </div>

      </article>
    </Layout>
  )
}
