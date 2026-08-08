'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Post } from '@/types'

const SCOPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  campus: { label: 'Campus', bg: 'var(--accent-light)', text: 'var(--accent-text)' },
  college_network: { label: 'College', bg: 'var(--success-light)', text: 'var(--success-text)' },
  global: { label: 'Global', bg: 'var(--purple-light)', text: 'var(--purple-text)' },
}

const CATEGORY_ICONS: Record<string, string> = {
  discussion: '💬', resource: '🔗', notes: '📚', hackathon: '⚡',
  internship: '💼', event: '📅', announcement: '📢', project: '🚀', opportunity: '🎯',
}

const avatarColor = (name: string) => {
  const colors = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', 'var(--danger)', '#0891b2']
  return colors[(name?.charCodeAt(0) || 0) % colors.length]
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

export default function PostCard({
  post,
  currentUserId,
  canInteract,
}: {
  post: Post
  currentUserId?: string
  canInteract?: boolean
}) {
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')

  const sc = SCOPE_CONFIG[post.scope] || SCOPE_CONFIG.global
  const catIcon = CATEGORY_ICONS[post.categories?.key || ''] || '📄'

  const handleLike = async () => {
    if (!currentUserId || !canInteract) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('post_reactions').upsert(
      { post_id: post.id, profile_id: currentUserId, reaction: 'like' },
      { onConflict: 'post_id,profile_id' }
    )
    setLiked(true)
  }

  const handleSave = async () => {
    if (!currentUserId) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    if (saved) {
      await supabase.from('saved_posts').delete().eq('user_id', currentUserId).eq('post_id', post.id)
      setSaved(false)
    } else {
      await supabase.from('saved_posts').insert({ user_id: currentUserId, post_id: post.id })
      setSaved(true)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title || 'Post', text: post.body, url: window.location.href })
      } catch { /* cancelled */ }
    } else {
      navigator.clipboard?.writeText(window.location.href)
    }
  }

  const handleReport = async () => {
    if (!currentUserId) return
    const reason = window.prompt('Report this post to moderators — why? (spam, harassment, etc.)')
    if (!reason?.trim()) return
    try {
      const res = await fetch('/api/admin/copilot/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: 'post', content_id: post.id, reason: reason.trim() }),
      })
      window.alert(res.ok ? 'Thanks — our moderators will review it.' : 'Could not submit the report.')
    } catch {
      window.alert('Could not submit the report.')
    }
  }

  const loadComments = async () => {
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { data } = await supabase
      .from('post_comments')
      .select('*, profiles(full_name, username)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  const handleComment = async () => {
    if (!commentText.trim() || !currentUserId) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('post_comments').insert({ post_id: post.id, author_id: currentUserId, body: commentText })
    setCommentText('')
    loadComments()
  }

  const toggleComments = async () => {
    setShowComments(s => !s)
    if (!showComments && comments.length === 0) loadComments()
  }

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 14, border: post.is_pinned ? '1px solid var(--accent-border)' : '1px solid var(--border)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div
            onClick={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}`)}
            style={{ width: 38, height: 38, borderRadius: '50%', background: avatarColor(post.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
            {post.profiles?.full_name?.[0] || '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span onClick={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}`)} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {post.profiles?.full_name || 'Anonymous'}
              </span>
              {post.profiles?.is_verified && <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>✓</span>}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{post.profiles?.username} · {timeAgo(post.created_at)}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, rowGap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, background: sc.bg, color: sc.text, padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>{sc.label}</span>
          <span style={{ fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>{catIcon} {post.categories?.label || 'Post'}</span>
        </div>
      </div>

      {post.is_pinned && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>📌 Pinned</div>}
      {post.status === 'held' && (
        <div style={{ fontSize: 11, background: 'var(--warning-light)', border: '1px solid var(--warning-border)', color: 'var(--warning-text)', padding: '5px 10px', borderRadius: 8, fontWeight: 600, marginBottom: 8 }}>
          🛡️ Pending review{post.held_reason ? ` — ${post.held_reason}` : ''}
        </div>
      )}
      {post.title && <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{post.title}</h3>}
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{post.body}</p>

      {post.apply_link && (
        <a href={post.apply_link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--on-accent)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>
          Apply →
        </a>
      )}

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 18, rowGap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={handleLike} disabled={!canInteract}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: liked ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: canInteract ? 'pointer' : 'not-allowed', padding: 0, fontFamily: 'inherit' }}>
          👍 {liked ? 'Liked' : 'Like'}
        </button>
        <button onClick={toggleComments}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: showComments ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          💬 Comment
        </button>
        <button onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: saved ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          {saved ? '🔖 Saved' : '🔖 Save'}
        </button>
        <button onClick={handleShare}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          ↗ Share
        </button>
        {currentUserId && (
          <button onClick={handleReport}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            🚩 Report
          </button>
        )}
      </div>

      {showComments && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(c.profiles?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {c.profiles?.full_name?.[0] || '?'}
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 12px', flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>@{c.profiles?.username}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{c.body}</p>
              </div>
            </div>
          ))}
          {canInteract && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleComment()}
                placeholder="Write a comment..." style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }} />
              <button onClick={handleComment} disabled={!commentText.trim()}
                style={{ padding: '8px 14px', borderRadius: 20, border: 'none', background: commentText.trim() ? 'var(--accent)' : 'var(--disabled)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
