'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import { useAdminContext } from '@/lib/permissions'

const RESOURCE_TYPES = ['all', 'notes', 'pyq', 'assignment', 'book', 'cheatsheet', 'video_link']

export default function NotesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    subject: '',
    resource_type: 'notes',
    description: '',
    drive_link: '',
    external_link: '',
  })
  const supabase = createClient()
  const admin = useAdminContext(user?.id)

  // Only platform_admin can upload (V3: admin grants, not the dropped role column)
  const canUpload = admin.isPlatformAdmin

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

  const typeIcon: any = {
    notes: '📝', pyq: '📋', assignment: '📌', book: '📚',
    cheatsheet: '⚡', video_link: '🎥', other: '📎',
  }

  // Unique subjects for the subject filter dropdown
  const allSubjects = Array.from(new Set(notes.map(n => n.subject).filter(Boolean))).sort()

  const filtered = notes
    .filter(n => filter === 'all' || n.resource_type === filter)
    .filter(n => !subjectFilter || n.subject === subjectFilter)

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

  const filterBtn = (active: boolean) => ({
    flexShrink: 0,
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500 as const,
    border: active ? 'none' : '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg)',
    color: active ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer' as const,
  })

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Notes Library</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Subject-wise notes, PYQs and resources</p>
          </div>
          {canUpload && (
            <button
              onClick={() => setShowCompose(true)}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >+ Upload</button>
          )}
        </div>

        {/* Upload form — platform_admin only */}
        {showCompose && canUpload && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Upload Resource</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title *"
                style={inputStyle}
              />
              <input
                type="text"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Subject name *"
                style={inputStyle}
              />
              <select
                value={form.resource_type}
                onChange={e => setForm(f => ({ ...f, resource_type: e.target.value }))}
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
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                style={{ ...inputStyle, resize: 'none' }}
              />
              <input
                type="url"
                value={form.drive_link}
                onChange={e => setForm(f => ({ ...f, drive_link: e.target.value }))}
                placeholder="Google Drive Link"
                style={inputStyle}
              />
              <input
                type="url"
                value={form.external_link}
                onChange={e => setForm(f => ({ ...f, external_link: e.target.value }))}
                placeholder="Other Link"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => setShowCompose(false)}
                style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >Cancel</button>
              <button
                onClick={handlePost}
                disabled={!form.title.trim() || !form.subject.trim() || posting}
                style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {posting ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        )}

        {/* Subject filter */}
        <div style={{ marginBottom: 10 }}>
          <select
            value={subjectFilter}
            onChange={e => setSubjectFilter(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
              color: subjectFilter ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'var(--bg)',
              cursor: 'pointer',
            }}
          >
            <option value="">All Subjects</option>
            {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Resource type filter */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }} className="scrollbar-hide">
          {RESOURCE_TYPES.map(type => (
            <button key={type} onClick={() => setFilter(type)} style={filterBtn(filter === type)}>
              {type === 'all' ? 'All' : type === 'pyq' ? 'PYQ' : type === 'video_link' ? 'Video' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No resources found</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {subjectFilter ? 'Try a different subject' : 'Check back later'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(note => (
              <div
                key={note.id}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}
              >
                <span style={{ fontSize: 28, flexShrink: 0 }}>{typeIcon[note.resource_type] || '📎'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 2px' }}>{note.subject}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{note.profiles?.username}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  {note.drive_link && (
                    <a
                      href={note.drive_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: 'var(--accent)', color: 'white', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}
                    >Open →</a>
                  )}
                  {note.external_link && (
                    <a
                      href={note.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', padding: '7px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none', textAlign: 'center', border: '1px solid var(--border)' }}
                    >Link →</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
