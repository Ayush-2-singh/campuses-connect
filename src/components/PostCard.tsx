'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import Avatar from '@/components/Avatar'
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
  onChanged,
}: {
  post: Post
  currentUserId?: string
  canInteract?: boolean
  onChanged?: () => void
}) {
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentCount, setCommentCount] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body || '')
  const [saving, setSaving] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [joined, setJoined] = useState(false)
  const [joinCount, setJoinCount] = useState(0)
  const [joining, setJoining] = useState(false)
  const { show: toast } = useToast()

  const isHackathon = post.categories?.key === 'hackathon'

  // Load like + comment counts (visible to anyone who can see the post).
  useEffect(() => {
    let alive = true
    const load = async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const [likeRes, commRes] = await Promise.all([
        supabase.from('post_reactions').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
        supabase.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
      ])
      if (!alive) return
      setLikeCount(likeRes.count || 0)
      setCommentCount(commRes.count || 0)
    }
    load()
    return () => { alive = false }
  }, [post.id])

  // Load whether the current user already liked this post.
  useEffect(() => {
    if (!currentUserId) return
    let alive = true
    const load = async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const { data } = await supabase.from('post_reactions').select('id').eq('post_id', post.id).eq('profile_id', currentUserId).maybeSingle()
      if (!alive) return
      setLiked(!!data)
    }
    load()
    return () => { alive = false }
  }, [currentUserId, post.id])

  // Load hackathon join state (count is visible to anyone who can see the post).
  useEffect(() => {
    if (!isHackathon || !currentUserId) return
    let alive = true
    const load = async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const [{ count }, { data: mine }] = await Promise.all([
        supabase.from('post_joins').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
        supabase.from('post_joins').select('user_id').eq('post_id', post.id).eq('user_id', currentUserId).maybeSingle(),
      ])
      if (!alive) return
      setJoinCount(count || 0)
      setJoined(!!mine)
    }
    load()
    return () => { alive = false }
  }, [isHackathon, currentUserId, post.id])

  const handleJoinToggle = async () => {
    if (!currentUserId || !canInteract || joining) return
    setJoining(true)
    const supabase = (await import('@/lib/supabase/client')).createClient()
    if (joined) {
      await supabase.rpc('leave_hackathon', { p_post_id: post.id })
      setJoined(false)
      setJoinCount(c => Math.max(0, c - 1))
    } else {
      await supabase.rpc('join_hackathon', { p_post_id: post.id })
      setJoined(true)
      setJoinCount(c => c + 1)
    }
    setJoining(false)
  }

  // Close the report modal with the Escape key.
  useEffect(() => {
    if (!reportOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setReportOpen(false); setReportReason('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reportOpen])

  const sc = SCOPE_CONFIG[post.scope] || SCOPE_CONFIG.global
  const catIcon = CATEGORY_ICONS[post.categories?.key || ''] || '📄'

  // Like toggle — tap to like, tap again to remove (unlike).
  const handleLike = async () => {
    if (!currentUserId || !canInteract) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    if (liked) {
      const { error } = await supabase.from('post_reactions').delete().eq('post_id', post.id).eq('profile_id', currentUserId)
      if (error) return
      setLiked(false)
      setLikeCount(c => Math.max(0, c - 1))
    } else {
      const { error } = await supabase.from('post_reactions').upsert(
        { post_id: post.id, profile_id: currentUserId, reaction: 'like' },
        { onConflict: 'post_id,profile_id' }
      )
      if (error) return
      setLiked(true)
      setLikeCount(c => c + 1)
    }
  }

  const handleSave = async () => {
    if (!currentUserId) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    if (saved) {
      await supabase.from('saved_posts').delete().eq('user_id', currentUserId).eq('post_id', post.id)
      setSaved(false)
      toast('Removed from saved')
    } else {
      await supabase.from('saved_posts').insert({ user_id: currentUserId, post_id: post.id })
      setSaved(true)
      toast('Saved to bookmarks', { tone: 'success' })
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title || 'Post', text: post.body, url: window.location.href })
      } catch { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard?.writeText(window.location.href)
        toast('Link copied', { tone: 'success' })
      } catch {
        toast('Could not copy link')
      }
    }
  }

  const submitReport = async () => {
    if (!currentUserId || !reportReason.trim()) return
    setReportSending(true)
    try {
      const res = await fetch('/api/admin/copilot/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: 'post', content_id: post.id, reason: reportReason.trim() }),
      })
      if (res.ok) {
        toast('Thanks — our moderators will review it.', { tone: 'success' })
        setReportOpen(false)
        setReportReason('')
      } else {
        toast('Could not submit the report.', { tone: 'danger' })
      }
    } catch {
      toast('Could not submit the report.', { tone: 'danger' })
    }
    setReportSending(false)
  }

  const loadComments = async () => {
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { data } = await supabase
      .from('post_comments')
      .select('*, profiles(full_name, username, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  const handleComment = async () => {
    if (!commentText.trim() || !currentUserId) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { error } = await supabase.from('post_comments').insert({ post_id: post.id, author_id: currentUserId, body: commentText })
    if (error) return
    setCommentText('')
    setCommentCount(c => c + 1)
    loadComments()
  }

  // Authors can delete their own comments (RLS allows it).
  const deleteComment = async (id: string) => {
    if (!currentUserId) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('post_comments').delete().eq('id', id).eq('author_id', currentUserId)
    setComments(cs => cs.filter(c => c.id !== id))
    setCommentCount(c => Math.max(0, c - 1))
  }

  const toggleComments = async () => {
    setShowComments(s => !s)
    if (!showComments && comments.length === 0) loadComments()
  }

  const isAuthor = !!currentUserId && post.author_id === currentUserId

  const handleEditSave = async () => {
    if (!isAuthor || !editBody.trim() || saving) return
    setSaving(true)
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('posts').update({ body: editBody.trim() }).eq('id', post.id).eq('author_id', currentUserId)
    setSaving(false)
    setEditing(false)
    onChanged?.()
  }

  const handleDelete = async () => {
    if (!isAuthor) return
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('posts').update({ status: 'removed' }).eq('id', post.id).eq('author_id', currentUserId)
    onChanged?.()
  }

  return (
    <div className="post-card" style={{ background: 'var(--bg)', borderRadius: 14, border: post.is_pinned ? '1px solid var(--accent-border)' : '1px solid var(--border)', padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <Avatar
            name={post.profiles?.full_name}
            avatarUrl={post.profiles?.avatar_url}
            size={38}
            onClick={() => post.profiles?.username && router.push(`/profile/${post.profiles.username}`)}
          />
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
      {editing ? (
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Edit your post..."
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--accent-border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setEditing(false); setEditBody(post.body || '') }} disabled={saving}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={handleEditSave} disabled={!editBody.trim() || saving}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: !editBody.trim() || saving ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{post.body}</p>
      )}        {post.apply_link && (
        <a href={post.apply_link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--on-accent)', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>
          Apply →
        </a>
      )}

      {isHackathon && currentUserId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={handleJoinToggle} disabled={!canInteract || joining}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: !canInteract || joining ? 'default' : 'pointer', border: 'none', fontFamily: 'inherit', background: joined ? 'var(--success)' : 'var(--accent)', color: 'var(--on-accent)' }}>
            {joining ? '…' : joined ? '✓ Joined' : '⚡ Join Hackathon'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👥 {joinCount} joined</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 4, rowGap: 2, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={handleLike} disabled={!canInteract}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: liked ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: canInteract ? 'pointer' : 'not-allowed', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit', fontWeight: liked ? 700 : 500 }}>
          <span className={liked ? 'like-pop' : ''} style={{ display: 'inline-block' }}>👍</span> {liked ? 'Liked' : 'Like'}{likeCount > 0 ? ` · ${likeCount}` : ''}
        </button>
        <button onClick={toggleComments}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: showComments ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
          💬 Comment{commentCount > 0 ? ` · ${commentCount}` : ''}
        </button>
        <button onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: saved ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
          {saved ? '🔖 Saved' : '🔖 Save'}
        </button>
        <button onClick={handleShare}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
          ↗ Share
        </button>
        {currentUserId && (
          <button onClick={() => setReportOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
            🚩 Report
          </button>
        )}
        {isAuthor && !editing && (
          <button onClick={() => { setEditBody(post.body || ''); setEditing(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
            ✏️ Edit
          </button>
        )}
        {isAuthor && !editing && (
          <button onClick={handleDelete}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--danger-text)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, minHeight: 40, fontFamily: 'inherit' }}>
            🗑️ Delete
          </button>
        )}
      </div>

      {reportOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { if (!reportSending) { setReportOpen(false); setReportReason('') } }}>
          <div className="modal-sheet" style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Report post">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🚩 Report this post</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>Our moderators will review it. False reports hurt the community.</p>
            <textarea
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Why are you reporting this? (spam, harassment, etc.)"
              rows={3}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => { setReportOpen(false); setReportReason('') }} disabled={reportSending}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={submitReport} disabled={!reportReason.trim() || reportSending}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: !reportReason.trim() || reportSending ? 'var(--disabled)' : 'var(--danger)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {reportSending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showComments && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar name={c.profiles?.full_name} avatarUrl={c.profiles?.avatar_url} size={28} />
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 12px', flex: 1, position: 'relative' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>@{c.profiles?.username}</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{c.body}</p>
              </div>
              {c.author_id === currentUserId && (
                <button onClick={() => deleteComment(c.id)} aria-label="Delete comment" title="Delete comment"
                  style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '6px', minHeight: 32, fontFamily: 'inherit', lineHeight: 1 }}>
                  🗑️
                </button>
              )}
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
