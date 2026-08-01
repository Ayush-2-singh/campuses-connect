'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function MeetingsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [meetings, setMeetings] = useState<any[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', meeting_date: '', meeting_time: '', location: '', meeting_link: '' })
  const router = useRouter()
  const supabase = createClient()

  const isFaculty = ['faculty', 'campus_admin', 'platform_admin'].includes(profile?.role)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const { data } = await supabase.from('meetings').select('*, profiles(full_name, username, role)').order('meeting_date', { ascending: true }).limit(30)
      setMeetings(data || [])
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.title || !form.meeting_date) return
    setPosting(true)
    await supabase.from('meetings').insert({ created_by: user.id, campus_id: profile?.campus_id, ...form })
    setForm({ title: '', description: '', meeting_date: '', meeting_time: '', location: '', meeting_link: '' })
    setShowCompose(false)
    const { data } = await supabase.from('meetings').select('*, profiles(full_name, username, role)').order('meeting_date', { ascending: true }).limit(30)
    setMeetings(data || [])
    setPosting(false)
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'white', boxSizing: 'border-box' as const }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button onClick={() => router.push('/more')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>←</button>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Faculty Meetings</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginLeft: 34 }}>Schedule and track meeting invites</p>
          </div>
          {isFaculty && <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Schedule</button>}
        </div>

        {showCompose && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Schedule Meeting</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Meeting title *" style={inputStyle} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description / agenda" rows={3} style={{ ...inputStyle, resize: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }} />
                <input type="time" value={form.meeting_time} onChange={e => setForm(f => ({ ...f, meeting_time: e.target.value }))} style={{ ...inputStyle, padding: '10px 12px' }} />
              </div>
              <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location (room/building)" style={inputStyle} />
              <input type="url" value={form.meeting_link} onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))} placeholder="Online meeting link (optional)" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.title || !form.meeting_date || posting} style={{ flex: 1, background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </div>
        )}

        {meetings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No meetings scheduled</p>
            {!isFaculty && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Faculty will post meeting invites here</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meetings.map(meeting => (
              <div key={meeting.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{meeting.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>by {meeting.profiles?.full_name} · {meeting.profiles?.role}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>{meeting.meeting_date && new Date(meeting.meeting_date).toLocaleDateString()}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{meeting.meeting_time}</p>
                  </div>
                </div>
                {meeting.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>{meeting.description}</p>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {meeting.location && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {meeting.location}</span>}
                  {meeting.meeting_link && <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>🔗 Join Online</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
