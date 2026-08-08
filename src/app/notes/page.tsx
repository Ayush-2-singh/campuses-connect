'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'
import { ListSkeleton } from '@/components/Skeleton'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'

const RESOURCE_TYPES = ['all', 'notes', 'pyq', 'assignment', 'book', 'cheatsheet', 'video_link']

const EXAMPLE_PROMPTS = ['Explain deadlock simply', 'Find notes about normalization', 'What matters for my DBMS exam?']

const typeIcon: Record<string, string> = {
  notes: '📝', pyq: '📋', assignment: '📌', book: '📚',
  cheatsheet: '⚡', video_link: '🎥', other: '📎',
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
    title: '', subject: '', resource_type: 'notes', description: '', drive_link: '', external_link: '',
  })
  const supabase = createClient()
  const admin = useAdminContext(user?.id)
  const [ai, setAi] = useState<{ answer: string; sources: string[]; asked: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const canUpload = admin.isPlatformAdmin

  const askAI = async () => {
    const q = query.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAi(null)
    try {
      const res = await fetch('/api/notes/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data } = await supabase
        .from('notes')
        .select('*, profiles(full_name, username)')
        .order('created_at', { ascending: false })
        .limit(100)
      setNotes(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.title.trim() || !form.subject.trim()) return
    setPosting(true)
    await supabase.from('notes').insert({
      uploaded_by: user.id,
      campus_id: profile?.campus_id,
      college_id: profile?.college_id,
      department_id: profile?.department_id,
      title: form.title,
      subject: form.subject,
      resource_type: form.resource_type,
      description: form.description,
      drive_link: form.drive_link || null,
      external_link: form.external_link || null,
    })
    await supabase.rpc('add_karma', { p_points: 10 })
    await supabase.rpc('update_streak')
    setForm({ title: '', subject: '', resource_type: 'notes', description: '', drive_link: '', external_link: '' })
    setShowCompose(false)
    const { data } = await supabase
      .from('notes')
      .select('*, profiles(full_name, username)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotes(data || [])
    setPosting(false)
  }

  // ─── Derived views ────────────────────────────────────────────────────────────
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = notes.filter(n => filter === 'all' || n.resource_type === filter)
    if (q) list = list.filter(n => (n.title || '').toLowerCase().includes(q) || (n.subject || '').toLowerCase().includes(q))
    return list
  }, [notes, filter, query])

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
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  const tabBtn = (active: boolean) => ({
    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 as const,
    border: 'none', background: active ? 'var(--accent)' : 'none',
    color: active ? 'var(--on-accent)' : 'var(--text-secondary)', cursor: 'pointer' as const, fontFamily: 'inherit' as const,
  })

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Notes Library</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Subject-wise notes, PYQs and resources from your campus</p>
          </div>
          {canUpload && (
            <button onClick={() => setShowCompose(true)}
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Upload
            </button>
          )}
        </div>

        {/* AI knowledge search */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)', display: 'flex' }}>
              <Icon name="sparkles" size={16} />
            </span>
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setAi(null) }}
              onKeyDown={e => { if (e.key === 'Enter') askAI() }}
              placeholder="Ask your academic knowledge..."
              aria-label="Search academic knowledge"
              className="ai-search-input"
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '13px 90px 13px 42px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const, boxShadow: 'var(--shadow-sm)' }}
            />
            <button onClick={askAI} disabled={aiLoading || !query.trim()}
              className={`ai-search-btn${aiLoading || !query.trim() ? '' : ' grad-ai'}`}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: aiLoading || !query.trim() ? 'default' : 'pointer', background: aiLoading ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'inherit' }}>
              {aiLoading ? 'Asking…' : 'Ask AI'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {EXAMPLE_PROMPTS.map(p => (
              <button key={p} onClick={() => { setQuery(p); setAi(null) }}
                style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11.5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* AI answer with sources */}
        {ai && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sparkles" size={14} />
              </span>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>AI Answer</p>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· “{ai.asked}”</span>
            </div>
            {ai.answer ? (
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>{ai.answer}</p>
            ) : (
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                AI search isn&apos;t available right now. The list below is filtered to your closest local matches — try the sources or rephrase.
              </p>
            )}
            {ai.sources.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Sources</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ai.sources.map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--accent)', fontWeight: 500 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload form — platform_admin only */}
        {showCompose && canUpload && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Upload Resource</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *" style={inputStyle} />
              <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject name *" style={inputStyle} />
              <select value={form.resource_type} onChange={e => setForm(f => ({ ...f, resource_type: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                <option value="notes">Notes</option>
                <option value="pyq">Previous Year Questions</option>
                <option value="assignment">Assignment</option>
                <option value="book">Book</option>
                <option value="cheatsheet">Cheatsheet</option>
                <option value="video_link">Video Link</option>
                <option value="other">Other</option>
              </select>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, resize: 'none' }} />
              <input type="url" value={form.drive_link} onChange={e => setForm(f => ({ ...f, drive_link: e.target.value }))} placeholder="Google Drive Link" style={inputStyle} />
              <input type="url" value={form.external_link} onChange={e => setForm(f => ({ ...f, external_link: e.target.value }))} placeholder="Other Link" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.title.trim() || !form.subject.trim() || posting}
                style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        )}

        {/* Tabs + type filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 3 }} role="tablist" aria-label="Browse notes">
            {(['recent', 'popular', 'subject'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)} role="tab" aria-selected={tab === t}>
                {t === 'recent' ? 'Recently Added' : t === 'popular' ? 'Popular' : 'By Subject'}
              </button>
            ))}
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Resource type"
            style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)' }}>
            {RESOURCE_TYPES.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t === 'pyq' ? 'PYQ' : t === 'video_link' ? 'Video' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        {loading ? (
          <ListSkeleton count={3} />
        ) : searchFiltered.length === 0 ? (
          <EmptyState
            icon="notebook"
            title={query ? 'No notes match that search' : 'No resources yet'}
            body={query ? 'Try a different subject or topic — new notes are added every week.' : canUpload ? 'Upload the first resource for your campus.' : 'Check back later — notes are added regularly.'}
          />
        ) : tab === 'subject' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(byTab as { subject: string; items: any[] }[]).map(group => (
              <div key={group.subject}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{group.subject} · {group.items.length}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map(note => <NoteRow key={note.id} note={note} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(byTab as any[]).map(note => <NoteRow key={note.id} note={note} />)}
          </div>
        )}
      </div>
    </Layout>
  )
}

function NoteRow({ note }: { note: any }) {
  return (
    <div className="card-hover" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
      <span style={{ fontSize: 26, flexShrink: 0 }}>{typeIcon[note.resource_type] || '📎'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          {note.subject && (
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent-text)' }}>{note.subject}</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note.semester ? `Sem ${note.semester}` : typeIcon[note.resource_type] === '📋' ? 'PYQ' : note.resource_type}</span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
          @{note.profiles?.username}
          {(note.download_count || 0) > 0 && <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>↓ {note.download_count}</span>}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        {note.drive_link && (
          <a href={note.drive_link} target="_blank" rel="noopener noreferrer"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
            Open →
          </a>
        )}
        {note.external_link && (
          <a href={note.external_link} target="_blank" rel="noopener noreferrer"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', padding: '7px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none', textAlign: 'center', border: '1px solid var(--border)' }}>
            Link →
          </a>
        )}
      </div>
    </div>
  )
}
