'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const RESOURCE_TYPES = ['all', 'notes', 'pyq', 'assignment', 'book', 'cheatsheet', 'video_link']
const SEMESTERS = [1,2,3,4,5,6,7,8]

export default function NotesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [notes, setNotes] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [semFilter, setSemFilter] = useState<number | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '', semester: '1', resource_type: 'notes', description: '', drive_link: '', external_link: '' })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(prof)
      }
      const { data } = await supabase.from('notes').select('*, profiles(full_name, username)').order('created_at', { ascending: false }).limit(50)
      setNotes(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.title.trim() || !form.subject.trim()) return
    setPosting(true)
    await supabase.from('notes').insert({
      uploaded_by: user.id, campus_id: profile?.campus_id, college_id: profile?.college_id,
      department_id: profile?.department_id, title: form.title, subject: form.subject,
      semester: parseInt(form.semester), resource_type: form.resource_type,
      description: form.description, drive_link: form.drive_link || null, external_link: form.external_link || null,
    })
    await supabase.rpc('add_karma', { user_id: user.id, points: 10 })
    await supabase.rpc('update_streak', { user_id: user.id })
    setForm({ title: '', subject: '', semester: '1', resource_type: 'notes', description: '', drive_link: '', external_link: '' })
    setShowCompose(false)
    const { data } = await supabase.from('notes').select('*, profiles(full_name, username)').order('created_at', { ascending: false }).limit(50)
    setNotes(data || [])
    setPosting(false)
  }

  const typeIcon: any = { notes: '📝', pyq: '📋', assignment: '📌', book: '📚', cheatsheet: '⚡', video_link: '🎥', other: '📎' }
  const filtered = notes.filter(n => filter === 'all' || n.resource_type === filter).filter(n => !semFilter || n.semester === semFilter)
  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const }
  const filterBtn = (active: boolean) => ({ flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500 as const, border: active ? 'none' : '1px solid var(--border)', background: active ? 'var(--accent)' : 'white', color: active ? 'white' : 'var(--text-secondary)', cursor: 'pointer' as const })

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Notes Library</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Semester-wise notes, PYQs and resources</p>
          </div>
          {user && profile?.campus_id && (
            <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Upload</button>
          )}
        </div>

        {showCompose && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Upload Resource</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title *" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="text" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Subject *" style={inputStyle} />
                <select value={form.semester} onChange={e => setForm(f => ({ ...f, semester: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }}>
                  {SEMESTERS.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>
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
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.title.trim() || !form.subject.trim() || posting} style={{ flex: 1, background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Uploading...' : 'Upload +10⭐'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }} className="scrollbar-hide">
          <button onClick={() => setSemFilter(null)} style={filterBtn(!semFilter)}>All Sems</button>
          {SEMESTERS.map(s => <button key={s} onClick={() => setSemFilter(s)} style={filterBtn(semFilter === s)}>Sem {s}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }} className="scrollbar-hide">
          {RESOURCE_TYPES.map(type => (
            <button key={type} onClick={() => setFilter(type)} style={filterBtn(filter === type)}>
              {type === 'pyq' ? 'PYQ' : type === 'video_link' ? 'Video' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {loading ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading...</p>
        : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No resources yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to upload!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(note => (
              <div key={note.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--shadow-sm)' }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{typeIcon[note.resource_type] || '📎'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 3px' }}>{note.subject} · Sem {note.semester}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{note.profiles?.username}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  {note.drive_link && <a href={note.drive_link} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--accent)', color: 'white', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>Open →</a>}
                  {note.external_link && <a href={note.external_link} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', padding: '7px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none', textAlign: 'center', border: '1px solid var(--border)' }}>Link →</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
