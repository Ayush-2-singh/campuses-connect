'use client'

/**
 * Idea detail (STEP 6) — the long-form read experience.
 * Summary cards never load `content`; it is fetched only here.
 * Primary CTA is "Interested" and goes through the SAME recordDiscoveryAction
 * layer as swipe/buttons/keyboard (STEP 8). Owner gets edit + delete, both
 * RLS-enforced server-side (author_id = auth.uid()).
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useHaptic } from '@/hooks/useMobile'
import {
  fetchDiscoveryPost,
  updateDiscoveryPost,
  deleteDiscoveryPost,
  recordDiscoveryAction,
  DISCOVERY_CATEGORIES,
  DISCOVERY_STAGES,
  LOOKING_FOR_OPTIONS,
  CATEGORY_LABELS,
  STAGE_LABELS,
  type DiscoveryPost,
  type DiscoveryCategory,
  type DiscoveryStage,
} from '@/lib/discovery'

export default function DiscoveryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const haptic = useHaptic()

  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profile, setProfile] = useState<{
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  } | null>(null)
  const [post, setPost] = useState<DiscoveryPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [acted, setActed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const { data: auth } = await supabase.auth.getUser()
      const u = auth.user
      if (!cancelled) setUser(u ? { id: u.id } : null)
      if (u) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .eq('id', u.id)
          .single()
        if (!cancelled) setProfile(prof)
      }
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const res = await fetchDiscoveryPost(id)
    setLoading(false)
    if (res.error) {
      setLoadError(res.error)
      return
    }
    setPost(res.post)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const isOwner = !!user && !!post && post.author_id === user.id

  const markInterested = async () => {
    if (!user || !post || busy || acted) return
    setBusy(true)
    const res = await recordDiscoveryAction(post.id, 'interested')
    setBusy(false)
    if (!res.ok) {
      toast.show(res.error || 'Could not send interest', { tone: 'danger' })
      return
    }
    haptic.medium()
    setActed(true)
    setPost((p) => (p ? { ...p, interested_count: p.interested_count + 1 } : p))
    toast.show('Interest sent — the builder will see it', { tone: 'success' })
  }

  // ---- owner edit ----
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    short_desc: '',
    content: '',
    category: 'startup' as DiscoveryCategory,
    stage: 'idea' as DiscoveryStage,
    tagsInput: '',
    looking_for: [] as string[],
  })

  const startEdit = () => {
    if (!post) return
    setForm({
      title: post.title,
      short_desc: post.short_desc,
      content: post.content || '',
      category: post.category,
      stage: post.stage,
      tagsInput: post.tags.join(', '),
      looking_for: post.looking_for,
    })
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!post || saving) return
    setSaving(true)
    const res = await updateDiscoveryPost(post.id, {
      title: form.title.trim(),
      short_desc: form.short_desc.trim(),
      content: form.content.trim() || undefined,
      category: form.category,
      stage: form.stage,
      tags: form.tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      looking_for: form.looking_for,
    })
    setSaving(false)
    if (!res.ok) {
      toast.show(res.error || 'Could not save', { tone: 'danger' })
      return
    }
    toast.show('Saved', { tone: 'success' })
    setEditing(false)
    load()
  }

  const [deleting, setDeleting] = useState(false)
  const removePost = async () => {
    if (!post || deleting) return
    if (!window.confirm('Delete this idea? This cannot be undone.')) return
    setDeleting(true)
    const res = await deleteDiscoveryPost(post.id)
    setDeleting(false)
    if (!res.ok) {
      toast.show(res.error || 'Could not delete', { tone: 'danger' })
      return
    }
    toast.show('Idea deleted', { tone: 'success' })
    router.push('/discover')
  }

  const timeAgo = (iso: string) => {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="discover-detail">
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 96px' }}>
          <Link
            href="/discover"
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'inline-block',
              marginBottom: 12,
            }}
          >
            ← Discover
          </Link>

          {loading ? (
            <ListSkeleton count={3} />
          ) : loadError ? (
            <EmptyState icon="⚠️" title="Could not load this idea" body={loadError} cta="Retry" onCta={load} />
          ) : !post ? (
            <EmptyState icon="🔍" title="Idea not found" body="It may have been removed by its author." />
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    padding: '3px 9px',
                  }}
                >
                  {CATEGORY_LABELS[post.category]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '3px 9px',
                  }}
                >
                  {STAGE_LABELS[post.stage]}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(post.created_at)}</span>
                {isOwner && <span style={{ flex: 1 }} />}
                {isOwner && (
                  <>
                    <button
                      onClick={startEdit}
                      style={{
                        minHeight: 34,
                        padding: '5px 12px',
                        borderRadius: 9,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text-secondary)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={removePost}
                      disabled={deleting}
                      style={{
                        minHeight: 34,
                        padding: '5px 12px',
                        borderRadius: 9,
                        border: '1px solid var(--danger-light)',
                        background: 'var(--bg)',
                        color: 'var(--danger)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {deleting ? '…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>

              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: '10px 0 6px',
                  lineHeight: 1.2,
                }}
              >
                {post.title}
              </h1>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                {post.short_desc}
              </p>

              {/* Creator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 16px' }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 800,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {post.author_avatar ? (
                    <img
                      src={post.author_avatar}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    (post.author_name || post.author_username || '?').charAt(0).toUpperCase()
                  )}
                </span>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {post.author_name || 'Student builder'}
                  </p>
                  {post.author_username && (
                    <Link
                      href={`/profile/${post.author_username}`}
                      style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}
                    >
                      @{post.author_username} · view profile
                    </Link>
                  )}
                </div>
              </div>

              {/* Looking for */}
              {post.looking_for.length > 0 && (
                <div style={{ background: 'var(--accent-light)', borderRadius: 12, padding: 12, margin: '0 0 16px' }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: 'var(--accent-text)',
                      margin: '0 0 6px',
                    }}
                  >
                    Looking for
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {post.looking_for.map((s) => (
                      <span
                        key={s}
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--accent-text)',
                          background: 'var(--bg)',
                          borderRadius: 8,
                          padding: '4px 10px',
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {post.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 16px' }}>
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-secondary)',
                        borderRadius: 7,
                        padding: '3px 9px',
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Long-form content — render ## headings, preserve paragraphs */}
              {post.content ? (
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {post.content.split('\n').map((line, i) => {
                    const t = line.trim()
                    if (!t) return null
                    if (t.startsWith('## ') || t.startsWith('# '))
                      return (
                        <h3
                          key={i}
                          style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 0' }}
                        >
                          {t.replace(/^#+\s*/, '')}
                        </h3>
                      )
                    return (
                      <p
                        key={i}
                        style={{
                          fontSize: 14,
                          color: 'var(--text-secondary)',
                          margin: 0,
                          lineHeight: 1.65,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {t}
                      </p>
                    )
                  })}
                </div>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    borderTop: '1px solid var(--border)',
                    paddingTop: 14,
                  }}
                >
                  The builder hasn&apos;t added a detailed write-up yet.
                </p>
              )}

              {/* CTA */}
              <div style={{ position: 'sticky', bottom: 0, paddingTop: 12, paddingBottom: 4 }}>
                {isOwner ? (
                  <div
                    style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '12px 2px 2px' }}
                  >
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                      🔥 {post.interested_count} interested — manage them from the Interests inbox on Discover.
                    </p>
                  </div>
                ) : user ? (
                  <button
                    onClick={markInterested}
                    disabled={busy || acted}
                    style={{
                      width: '100%',
                      minHeight: 50,
                      borderRadius: 14,
                      border: 'none',
                      background: acted ? 'var(--success)' : busy ? 'var(--disabled)' : 'var(--accent)',
                      color: 'var(--on-accent)',
                      fontSize: 15,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {acted ? '✓ Interest sent' : busy ? 'Sending…' : '❤️ Interested — build together'}
                  </button>
                ) : (
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                    Sign in to mark yourself interested.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Edit sheet */}
        {editing && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit idea"
            onClick={() => !saving && setEditing(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 60,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 720,
                margin: '0 auto',
                background: 'var(--bg)',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
                maxHeight: '88vh',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Edit idea
              </h3>

              <label style={labelStyle}>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                style={inputStyle}
              />

              <label style={labelStyle}>Short description</label>
              <textarea
                value={form.short_desc}
                onChange={(e) => setForm({ ...form, short_desc: e.target.value })}
                rows={2}
                maxLength={280}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              <label style={labelStyle}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {DISCOVERY_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, category: c })}
                    style={chipStyle(form.category === c)}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Stage</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {DISCOVERY_STAGES.map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, stage: s })} style={chipStyle(form.stage === s)}>
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Looking for</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {LOOKING_FOR_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setForm({
                        ...form,
                        looking_for: form.looking_for.includes(s)
                          ? form.looking_for.filter((x) => x !== s)
                          : [...form.looking_for, s],
                      })
                    }
                    style={chipStyle(form.looking_for.includes(s))}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <label style={labelStyle}>Tags (comma separated)</label>
              <input
                value={form.tagsInput}
                onChange={(e) => setForm({ ...form, tagsInput: e.target.value })}
                style={inputStyle}
              />

              <label style={labelStyle}>Full write-up</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={7}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    minHeight: 46,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving || !form.title.trim() || form.title.trim().length < 3 || !form.short_desc.trim()}
                  style={{
                    flex: 2,
                    minHeight: 46,
                    borderRadius: 12,
                    border: 'none',
                    background:
                      saving || !form.title.trim() || form.title.trim().length < 3 || !form.short_desc.trim()
                        ? 'var(--disabled)'
                        : 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </Layout>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-muted)',
  margin: '12px 0 5px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  minHeight: 34,
  padding: '5px 12px',
  borderRadius: 17,
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-light)' : 'var(--bg)',
  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
})
