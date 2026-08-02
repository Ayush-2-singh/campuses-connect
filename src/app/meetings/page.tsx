'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'

type MeetingKind = 'faculty' | 'club'

const TABS: { key: MeetingKind; label: string; icon: string; desc: string }[] = [
  { key: 'faculty', label: 'Faculty Meetings', icon: '🎓', desc: 'Scheduled by faculty / admin' },
  { key: 'club', label: 'Club President Meetings', icon: '🏛️', desc: 'Scheduled by club leads' },
]

export default function MeetingsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<MeetingKind>('faculty')
  const [meetings, setMeetings] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    meeting_date: '',
    meeting_time: '',
    venue: '',
    meeting_link: '',
  })
  const [taggedStudents, setTaggedStudents] = useState<string[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [showStudentDrop, setShowStudentDrop] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const isFaculty = ['faculty', 'campus_admin', 'platform_admin'].includes(profile?.role)
  const isClubLead = ['club_lead', 'campus_admin', 'platform_admin'].includes(profile?.role)
  const canPost = activeTab === 'faculty' ? isFaculty : isClubLead

  const loadMeetings = async (kind: MeetingKind) => {
    const { data } = await supabase
      .from('meetings')
      .select('*, profiles(full_name, username, role)')
      .eq('meeting_type', kind)
      .order('meeting_date', { ascending: true })
      .limit(30)
    setMeetings(data || [])
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
        if (data?.campus_id) {
          const { data: campusStudents } = await supabase
            .from('profiles')
            .select('id, full_name, username, role')
            .eq('campus_id', data.campus_id)
            .neq('id', user.id)
            .order('full_name', { ascending: true })
          setStudents(campusStudents || [])
        }
      }
      loadMeetings('faculty')
    }
    load()
  }, [])

  useEffect(() => {
    loadMeetings(activeTab)
    setShowCompose(false)
  }, [activeTab])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowStudentDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handlePost = async () => {
    if (!form.title || !form.meeting_date) return
    setPosting(true)
    await supabase.from('meetings').insert({
      created_by: user.id,
      campus_id: profile?.campus_id,
      meeting_type: activeTab,
      title: form.title,
      description: form.description,
      meeting_date: form.meeting_date,
      meeting_time: form.meeting_time,
      location: form.venue,
      meeting_link: form.meeting_link,
      tagged_students: taggedStudents.length ? taggedStudents : null,
    })
    setForm({ title: '', description: '', meeting_date: '', meeting_time: '', venue: '', meeting_link: '' })
    setTaggedStudents([])
    setStudentSearch('')
    setShowCompose(false)
    loadMeetings(activeTab)
    setPosting(false)
  }

  const toggleStudent = (id: string) =>
    setTaggedStudents(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase()
    return s.full_name?.toLowerCase().includes(q) || s.username?.toLowerCase().includes(q)
  })

  const taggedNames = taggedStudents.map(id => {
    const s = students.find(st => st.id === id)
    return { id, name: s ? (s.full_name || s.username || 'Unknown') : 'Unknown' }
  })

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const,
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Meetings</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Faculty and Club meeting schedules</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'white', border: '1px solid var(--border)', borderRadius: 12, padding: 4, boxShadow: 'var(--shadow-sm)' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 7, padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease',
                background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Active tab description + Schedule button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {TABS.find(t => t.key === activeTab)?.desc}
          </p>
          {canPost && (
            <button
              onClick={() => setShowCompose(v => !v)}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >+ Schedule</button>
          )}
        </div>

        {/* Compose form */}
        {showCompose && canPost && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>
              Schedule {activeTab === 'faculty' ? 'Faculty' : 'Club President'} Meeting
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Meeting title *" style={inputStyle}
              />
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Description / agenda" rows={3}
                style={{ ...inputStyle, resize: 'none' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="date" value={form.meeting_date}
                  onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                />
                <input type="time" value={form.meeting_time}
                  onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))}
                  style={{ ...inputStyle, padding: '10px 12px' }}
                />
              </div>
              <input
                type="text" value={form.venue}
                onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="Venue (room / building / hall)" style={inputStyle}
              />
              <input
                type="url" value={form.meeting_link}
                onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))}
                placeholder="Online meeting link (optional)" style={inputStyle}
              />

              {/* Tag Students */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Tag Students</p>
                {taggedNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {taggedNames.map(({ id, name }) => (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
                        {name}
                        <button onClick={() => toggleStudent(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }} ref={dropRef}>
                  <input
                    type="text" value={studentSearch}
                    onChange={e => { setStudentSearch(e.target.value); setShowStudentDrop(true) }}
                    onFocus={() => setShowStudentDrop(true)}
                    placeholder="Search by name or username…"
                    style={inputStyle}
                  />
                  {showStudentDrop && filteredStudents.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'white', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-sm)', marginTop: 4 }}>
                      {filteredStudents.map(s => {
                        const tagged = taggedStudents.includes(s.id)
                        return (
                          <div key={s.id} onClick={() => { toggleStudent(s.id); setStudentSearch('') }}
                            style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: tagged ? '#eff6ff' : 'white', borderBottom: '1px solid var(--border)' }}>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{s.full_name || s.username}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{s.username} · {s.role}</p>
                            </div>
                            {tagged && <span style={{ fontSize: 14, color: '#1d4ed8' }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => { setShowCompose(false); setTaggedStudents([]); setStudentSearch('') }}
                style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handlePost} disabled={!form.title || !form.meeting_date || posting}
                style={{ flex: 1, background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </div>
        )}

        {/* Meeting cards */}
        {meetings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{activeTab === 'faculty' ? '🎓' : '🏛️'}</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No meetings scheduled</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              {canPost ? 'Use the Schedule button above to add one' : `${activeTab === 'faculty' ? 'Faculty' : 'Club leads'} will post meeting invites here`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meetings.map(meeting => {
              const taggedInCard: string[] = Array.isArray(meeting.tagged_students)
                ? meeting.tagged_students.map((id: string) => {
                    const s = students.find(st => st.id === id)
                    return s ? (s.full_name || s.username || id) : id
                  })
                : []

              return (
                <div key={meeting.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{meeting.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>by {meeting.profiles?.full_name} · {meeting.profiles?.role}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>
                        {meeting.meeting_date && new Date(meeting.meeting_date).toLocaleDateString()}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{meeting.meeting_time}</p>
                    </div>
                  </div>
                  {meeting.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{meeting.description}</p>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: taggedInCard.length ? 10 : 0 }}>
                    {meeting.location && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {meeting.location}</span>}
                    {meeting.meeting_link && (
                      <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>🔗 Join Online</a>
                    )}
                  </div>
                  {taggedInCard.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tagged:</span>
                      {taggedInCard.map((name, i) => (
                        <span key={i} style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>{name}</span>
                      ))}
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
