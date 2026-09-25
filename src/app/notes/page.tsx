'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Icon } from '@/components/icons'
import { isNativePlatform } from '@/lib/native'

/**
 * Android: pull the file into the app and open Android's share/save sheet.
 * On the web this returns immediately, leaving the anchor's normal behaviour
 * (new tab) untouched.
 */
async function openNoteResource(event: React.MouseEvent<HTMLAnchorElement>, url: string, title?: string) {
  if (!isNativePlatform()) return
  event.preventDefault()
  try {
    const { openOrDownloadFile } = await import('@/lib/native')
    await openOrDownloadFile(url, title)
  } catch (err) {
    console.error('[notes] could not open resource:', err)
  }
}

const RESOURCE_TYPES = ['all', 'notes', 'pyq', 'assignment', 'book', 'cheatsheet', 'video_link']

/** Live Chat categories a resource can be discussed in (communities.key). */
const DISCUSS_CATEGORIES = [
  { key: '', label: 'Auto (from subject)' },
  { key: 'dsa', label: 'DSA' },
  { key: 'web-development', label: 'Web Development' },
  { key: 'ai-ml', label: 'AI / ML' },
  { key: 'academics', label: 'Academics' },
  { key: 'career', label: 'Career' },
  { key: 'compete', label: 'Compete' },
  { key: 'general', label: 'General' },
]

/**
 * Pick a sensible Live Chat category for a resource when the contributor did
 * not choose one, so `[ Discuss ]` never lands the user in an unrelated room.
 */
function defaultDiscussCategory(note: {
  discuss_category?: string | null
  subject?: string | null
  resource_type?: string | null
}) {
  if (note.discuss_category) return note.discuss_category
  const s = (note.subject || '').toLowerCase()
  if (/dsa|data structure|algorithm|\bcpp\b|java|python|competitive/.test(s)) return 'dsa'
  if (/web|react|node|javascript|css|html|frontend|backend/.test(s)) return 'web-development'
  if (/\bai\b|machine learning|\bml\b|deep learning|neural|nlp/.test(s)) return 'ai-ml'
  if (/placement|intern|resume|interview|aptitude/.test(s)) return 'career'
  return 'academics'
}

const EXAMPLE_PROMPTS = ['Explain deadlock simply', 'Find notes about normalization', 'What matters for my DBMS exam?']

const typeIcon: Record<string, string> = {
  notes: '📝',
  pyq: '📋',
  assignment: '📌',
  book: '📚',
  cheatsheet: '⚡',
  video_link: '🎥',
  other: '📎',
}

export default function NotesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [tab, setTab] = useState<'recent' | 'popular' | 'subject'>('recent')
  const [query, setQuery] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    subject: '',
    resource_type: 'notes',
    description: '',
    author: '',
    discuss_category: '',
    drive_link: '',
    external_link: '',
    visibility: 'campus' as 'global' | 'campus',
  })
  const supabase = createClient()
  const admin = useAdminContext(user?.id)
  const [ai, setAi] = useState<{ answer: string; sources: string[]; asked: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showPendingOnly, setShowPendingOnly] = useState(false)

  // Phase 3: the Library is community-owned. Any signed-in student contributes;
  // their material is queued for review, admins publish immediately.
  const canSubmitLink = Boolean(user)
  const canVerify = admin.isPlatformAdmin || admin.isCampusAdmin // admin verifies notes
  // Material is published as a link, so at least one link is mandatory.
  const hasLink = Boolean(form.drive_link.trim() || form.external_link.trim())

  const deleteNote = async (note: any) => {
    if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return

    await fetch('/api/admin/content', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: 'notes', ids: [note.id] }),
    })
    const { data } = await supabase
      .from('notes')
      .select('*, profiles!notes_uploaded_by_fkey(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotes(data || [])
  }

  const verifyNote = async (noteId: string, approved: boolean) => {
    await fetch('/api/notes/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ note_id: noteId, is_verified: approved }),
    })
    const { data } = await supabase
      .from('notes')
      .select('*, profiles!notes_uploaded_by_fkey(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotes(data || [])
  }

  const askAI = async () => {
    const q = query.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAi(null)
    try {
      const res = await fetch('/api/notes/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', credentials: 'include' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'AI search failed')
      setAi({ answer: data.answer || '', sources: data.sources || [], asked: q })
    } catch {
      setAi({ answer: '', sources: [], asked: q })
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // Fire auth + notes ALL AT ONCE — no sequential waterfall
      const [authResult, notesResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from('notes')
          .select('*, profiles!notes_uploaded_by_fkey(full_name, username)')
          .order('created_at', { ascending: false })
          .limit(100),
      ])

      if (cancelled) return
      setNotes(notesResult.data || [])
      setLoading(false)

      const user = authResult.data.user
      if (user) {
        setUser(user)
        // Profile can wait — not needed for initial render
        const { data: prof } = await supabase.from('profiles').select('*, campuses(name)').eq('id', user.id).single()
        if (!cancelled) setProfile(prof)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handlePost = async () => {
    if (!form.title.trim() || !form.subject.trim() || !hasLink) return
    setPosting(true)
    try {
      const formData = new FormData()
      formData.append('title', form.title)
      formData.append('subject', form.subject)
      formData.append('resource_type', form.resource_type)
      formData.append('description', form.description)
      formData.append('author', form.author.trim())
      formData.append('discuss_category', form.discuss_category)
      formData.append('drive_link', form.drive_link.trim())
      formData.append('external_link', form.external_link.trim())
      formData.append('visibility', profile?.campus_id ? form.visibility : 'global')

      const res = await fetch('/api/notes/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to submit')
      alert(data?.message || 'Submitted!')
    } catch (err: any) {
      alert(err?.message || 'Failed to submit note')
    }
    setForm({
      title: '',
      subject: '',
      resource_type: 'notes',
      description: '',
      author: '',
      discuss_category: '',
      drive_link: '',
      external_link: '',
      visibility: 'campus',
    })
    setShowCompose(false)
    const { data } = await supabase
      .from('notes')
      .select('*, profiles!notes_uploaded_by_fkey(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotes(data || [])
    setPosting(false)
  }

  // ─── Derived views ────────────────────────────────────────────────────────────
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = notes.filter((n) => filter === 'all' || n.resource_type === filter)
    // Regular users see verified material plus their OWN pending contributions
    // (so a contributor gets feedback that their upload is in review).
    if (!canVerify) list = list.filter((n) => n.is_verified !== false || n.uploaded_by === user?.id)
    // Admin 'pending' filter
    if (showPendingOnly && canVerify) list = list.filter((n) => n.is_verified === false)
    if (q)
      list = list.filter(
        (n) =>
          (n.title || '').toLowerCase().includes(q) ||
          (n.subject || '').toLowerCase().includes(q) ||
          (n.author || '').toLowerCase().includes(q)
      )
    return list
  }, [notes, filter, query, canVerify, showPendingOnly, user?.id])

  const byTab = useMemo(() => {
    if (tab === 'popular') return [...searchFiltered].sort((a, b) => (b.download_count || 0) - (a.download_count || 0))
    if (tab === 'subject') {
      const groups = new Map<string, any[]>()
      for (const n of searchFiltered) {
        const key = n.subject || 'Other'
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(n)
      }
      return Array.from(groups.entries()).map(([subject, items]) => ({ subject, items }))
    }
    return searchFiltered
  }, [tab, searchFiltered])

  const inputStyle = {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--bg)',
    boxSizing: 'border-box' as const,
  }

  const tabBtn = (active: boolean) => ({
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600 as const,
    border: 'none',
    background: active ? 'var(--accent)' : 'none',
    color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
    cursor: 'pointer' as const,
    fontFamily: 'inherit' as const,
  })

  return (
    <Layout user={user} profile={profile}>
      <ErrorBoundary pageName="notes">
        <div className="ambient" style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px 48px' }}>
          {/* Header strip — homepage SectionShell pattern */}
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-sm)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="notebook" size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                Library
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Books, notes, PYQs and resources — contributed by students everywhere
              </p>
            </div>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'flex', gap: 16 }}>
              <span style={{ textAlign: 'center' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    lineHeight: 1.15,
                  }}
                >
                  {notes.length}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Resources</span>
              </span>
              {canVerify && notes.filter((n) => n.is_verified === false).length > 0 && (
                <span style={{ textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--orange-text)',
                      lineHeight: 1.15,
                    }}
                  >
                    {notes.filter((n) => n.is_verified === false).length}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Pending</span>
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {canVerify && notes.filter((n) => n.is_verified === false).length > 0 && (
                <button
                  onClick={() => setShowPendingOnly(!showPendingOnly)}
                  style={{
                    minHeight: 38,
                    padding: '0 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    border: showPendingOnly ? 'none' : '1px solid var(--orange-text)',
                    background: showPendingOnly ? 'var(--orange-text)' : 'var(--orange-light)',
                    color: showPendingOnly ? '#fff' : 'var(--orange-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ⏳ Pending Review
                </button>
              )}
              {canSubmitLink && (
                <button
                  onClick={() => {
                    setShowCompose(true)
                    setForm((f) => ({ ...f, resource_type: 'notes' }))
                  }}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    minHeight: 38,
                    padding: '0 16px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ＋ Add Resource
                </button>
              )}
            </div>
          </div>

          {/* AI knowledge search */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--accent)',
                  display: 'flex',
                }}
              >
                <Icon name="sparkles" size={16} />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setAi(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') askAI()
                }}
                placeholder="Ask your academic knowledge..."
                aria-label="Search academic knowledge"
                className="ai-search-input"
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '13px 90px 13px 42px',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                  color: 'var(--text-primary)',
                  background: 'var(--bg)',
                  boxSizing: 'border-box' as const,
                  boxShadow: 'var(--shadow-sm)',
                }}
              />
              <button
                onClick={askAI}
                disabled={aiLoading || !query.trim()}
                className={`ai-search-btn${aiLoading || !query.trim() ? '' : ' grad-ai'}`}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: aiLoading || !query.trim() ? 'default' : 'pointer',
                  background: aiLoading ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontFamily: 'inherit',
                }}
              >
                {aiLoading ? 'Asking…' : 'Ask AI'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setQuery(p)
                    setAi(null)
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 20,
                    fontSize: 11.5,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* AI answer with sources */}
          {ai && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius)',
                padding: 18,
                marginBottom: 20,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="sparkles" size={14} />
                </span>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>AI Answer</p>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· “{ai.asked}”</span>
              </div>
              {ai.answer ? (
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                  {ai.answer}
                </p>
              ) : (
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                  AI search isn&apos;t available right now. The list below is filtered to your closest local matches —
                  try the sources or rephrase.
                </p>
              )}
              {ai.sources.length > 0 && (
                <div>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      margin: '0 0 6px',
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                    }}
                  >
                    Sources
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {ai.sources.map((s) => (
                      <div
                        key={s}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12.5,
                          color: 'var(--accent)',
                          fontWeight: 500,
                        }}
                      >
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        />
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add a resource — link based, no file upload. Anyone signed in. */}
          {showCompose && canSubmitLink && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 20,
                marginBottom: 20,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                Add a resource
              </h3>
              {!admin.isAdmin && (
                <div
                  style={{
                    background: 'var(--accent-light)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: 'var(--accent-text)',
                    marginBottom: 12,
                    lineHeight: 1.5,
                  }}
                >
                  You’re a contributor 💚 — your resource is reviewed by an admin before it appears for everyone.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Title *"
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Subject name *"
                  style={inputStyle}
                />
                <select
                  value={form.resource_type}
                  onChange={(e) => setForm((f) => ({ ...f, resource_type: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                >
                  <option value="notes">Notes</option>
                  <option value="pyq">Previous Year Questions</option>
                  <option value="assignment">Assignment</option>
                  <option value="book">Book</option>
                  <option value="cheatsheet">Cheatsheet</option>
                  <option value="video_link">Video Link</option>
                  <option value="other">Other</option>
                </select>
                {profile?.campus_id && (
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as 'global' | 'campus' }))}
                    style={{ ...inputStyle, padding: '10px 12px' }}
                  >
                    <option value="campus">🏫 My campus — only {profile?.campuses?.name || 'your campus'}</option>
                    <option value="global">🌐 Global — every student in India</option>
                  </select>
                )}
                <input
                  type="text"
                  value={form.author}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="Author / publisher (optional)"
                  style={inputStyle}
                />
                <select
                  value={form.discuss_category}
                  onChange={(e) => setForm((f) => ({ ...f, discuss_category: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                >
                  {DISCUSS_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      Discuss in: {c.label}
                    </option>
                  ))}
                </select>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Description (optional)"
                  rows={2}
                  style={{ ...inputStyle, resize: 'none' }}
                />
                <input
                  type="url"
                  value={form.drive_link}
                  onChange={(e) => setForm((f) => ({ ...f, drive_link: e.target.value }))}
                  placeholder="Google Drive link *"
                  style={inputStyle}
                />
                <input
                  type="url"
                  value={form.external_link}
                  onChange={(e) => setForm((f) => ({ ...f, external_link: e.target.value }))}
                  placeholder="Other link — YouTube, Notion, etc."
                  style={inputStyle}
                />
                <div
                  style={{
                    background: 'var(--orange-light)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 12,
                    color: 'var(--orange-text)',
                    lineHeight: 1.5,
                  }}
                >
                  🔗 One of the two links above is required. Students are sent straight to it — nothing is uploaded
                  here, so share the link as “anyone with the link”.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setShowCompose(false)}
                  style={{
                    flex: 1,
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePost}
                  disabled={!form.title.trim() || !form.subject.trim() || !hasLink || posting}
                  style={{
                    flex: 1,
                    background: posting ? 'var(--disabled)' : 'var(--accent)',
                    color: 'var(--on-accent)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {posting ? 'Submitting...' : 'Publish resource'}
                </button>
              </div>
            </div>
          )}

          {/* Tabs + type filter — swipeable chips on mobile */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                gap: 2,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                padding: 3,
                overflowX: 'auto',
              }}
              className="scrollbar-hide chip-scroll"
              role="tablist"
              aria-label="Browse notes"
            >
              {(['recent', 'popular', 'subject'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ ...tabBtn(tab === t), flexShrink: 0, whiteSpace: 'nowrap' }}
                  role="tab"
                  aria-selected={tab === t}
                >
                  {t === 'recent' ? 'Recently Added' : t === 'popular' ? 'Popular' : 'By Subject'}
                </button>
              ))}
            </div>
            <div
              className="scrollbar-hide fade-x chips-wrap"
              style={{ display: 'flex', gap: 6, paddingBottom: 4 }}
              role="tablist"
              aria-label="Filter by resource type"
            >
              {RESOURCE_TYPES.map((t) => {
                const label =
                  t === 'all'
                    ? 'All types'
                    : t === 'pyq'
                      ? 'PYQ'
                      : t === 'video_link'
                        ? 'Video'
                        : t.charAt(0).toUpperCase() + t.slice(1)
                return (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    role="tab"
                    aria-selected={filter === t}
                    style={{
                      flexShrink: 0,
                      padding: '6px 14px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 500,
                      border: filter === t ? 'none' : '1px solid var(--border)',
                      background: filter === t ? 'var(--accent)' : 'var(--bg)',
                      color: filter === t ? 'var(--on-accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <ListSkeleton count={3} />
          ) : searchFiltered.length === 0 ? (
            <EmptyState
              icon="notebook"
              title={query ? 'No notes match that search' : 'No resources yet'}
              body={
                query
                  ? 'Try a different subject or topic — new notes are added every week.'
                  : 'Check back later — notes are added regularly.'
              }
            />
          ) : tab === 'subject' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(byTab as { subject: string; items: any[] }[]).map((group) => (
                <div key={group.subject}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                    {group.subject} · {group.items.length}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.items.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        canDelete={canVerify || note.uploaded_by === user?.id}
                        onDelete={deleteNote}
                        canVerify={canVerify}
                        onVerify={verifyNote}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(byTab as any[]).map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  canDelete={canVerify || note.uploaded_by === user?.id}
                  onDelete={deleteNote}
                  canVerify={canVerify}
                  onVerify={verifyNote}
                />
              ))}
            </div>
          )}
        </div>
      </ErrorBoundary>
    </Layout>
  )
}
function NoteRow({
  note,
  canDelete,
  onDelete,
  canVerify,
  onVerify,
}: {
  note: any
  canDelete?: boolean
  onDelete?: (note: any) => void
  canVerify?: boolean
  onVerify?: (id: string, approved: boolean) => void
}) {
  const isPending = note.is_verified === false
  return (
    <div
      className="card-hover"
      style={{
        background: isPending ? 'var(--orange-light)' : 'var(--bg)',
        border: isPending ? '1px solid var(--orange-text)' : '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: 'var(--shadow-sm)',
        opacity: isPending ? 0.85 : 1,
      }}
    >
      <span style={{ fontSize: 26, flexShrink: 0 }}>{typeIcon[note.resource_type] || '📎'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {note.subject && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
              }}
            >
              {note.subject}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {note.semester
              ? `Sem ${note.semester}`
              : typeIcon[note.resource_type] === '📋'
                ? 'PYQ'
                : note.resource_type}
          </span>
          {isPending && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'var(--orange-light)',
                color: 'var(--orange-text)',
              }}
            >
              ⏳ Pending
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '0 0 2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {note.title}
        </p>
        {note.author && (
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 3px' }}>by {note.author}</p>
        )}
        {/* Contributor identity — deliberately prominent, never buried metadata. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {note.profiles?.username ? (
            <a
              href={`/profile/${note.profiles.username}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--accent-text)',
                textDecoration: 'none',
              }}
            >
              👤 {note.profiles.full_name || note.profiles.username}
              <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>· contributor</span>
            </a>
          ) : null}
          {(note.download_count || 0) > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>↓ {note.download_count}</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {/* Library -> Chat: every resource has a home to discuss it in. */}
        {note.is_verified !== false && (
          <a
            href={`/chat/${defaultDiscussCategory(note)}?resource=${note.id}`}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            💬 Discuss
          </a>
        )}
        {canVerify && isPending && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => onVerify?.(note.id, true)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--success-text)',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              ✓ Verify
            </button>
            <button
              onClick={() => onVerify?.(note.id, false)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--danger-border)',
                background: 'var(--danger-light)',
                color: 'var(--danger)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete?.(note)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--danger-border)',
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            🗑 Delete
          </button>
        )}

        {/* Open button — priority: external_file_url > drive_link > external_link */}
        {note.external_file_url && (
          <a
            href={note.external_file_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openNoteResource(e, note.external_file_url, note.title)}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Open →
          </a>
        )}
        {!note.external_file_url && note.drive_link && (
          <a
            href={note.drive_link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Open →
          </a>
        )}
        {!note.external_file_url && !note.drive_link && note.external_link && (
          <a
            href={note.external_link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 13,
              textDecoration: 'none',
              textAlign: 'center',
              border: '1px solid var(--border)',
            }}
          >
            Link →
          </a>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete?.(note)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--danger-border)',
              background: 'var(--danger-light)',
              color: 'var(--danger-text)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
