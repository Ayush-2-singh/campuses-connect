'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function TeamsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ event_name: '', description: '', skills_needed: '', team_size: '4', contact_info: '' })
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) { setUser(user); const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); setProfile(data) }
      const { data } = await supabase.from('team_requests').select('*, profiles(full_name, username)').eq('is_open', true).order('created_at', { ascending: false }).limit(30)
      setTeams(data || [])
    }
    load()
  }, [])

  const handlePost = async () => {
    if (!form.event_name) return
    setPosting(true)
    await supabase.from('team_requests').insert({ posted_by: user.id, campus_id: profile?.campus_id, ...form, team_size: parseInt(form.team_size), is_open: true })
    setForm({ event_name: '', description: '', skills_needed: '', team_size: '4', contact_info: '' })
    setShowCompose(false)
    const { data } = await supabase.from('team_requests').select('*, profiles(full_name, username)').eq('is_open', true).order('created_at', { ascending: false }).limit(30)
    setTeams(data || [])
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
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Find Teammates</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginLeft: 34 }}>Build your dream team for hackathons</p>
          </div>
          {user && <button onClick={() => setShowCompose(true)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Post</button>}
        </div>

        {showCompose && (
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>Looking for Teammates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="text" value={form.event_name} onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))} placeholder="Event/Hackathon name *" style={inputStyle} />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What are you building?" rows={3} style={{ ...inputStyle, resize: 'none' }} />
              <input type="text" value={form.skills_needed} onChange={e => setForm(f => ({ ...f, skills_needed: e.target.value }))} placeholder="Skills needed (e.g. React, ML, UI/UX)" style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="number" value={form.team_size} onChange={e => setForm(f => ({ ...f, team_size: e.target.value }))} placeholder="Team size" min="2" max="10" style={inputStyle} />
                <input type="text" value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} placeholder="Contact (WhatsApp/Discord)" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.event_name || posting} style={{ flex: 1, background: posting ? '#93c5fd' : 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {teams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No team requests yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Be the first to post!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {teams.map(team => (
              <div key={team.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>{team.event_name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{team.profiles?.username}</p>
                  </div>
                  <span style={{ fontSize: 12, background: '#eff6ff', color: 'var(--accent)', padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>👥 {team.team_size} members</span>
                </div>
                {team.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{team.description}</p>}
                {team.skills_needed && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {team.skills_needed.split(',').map((skill: string, i: number) => (
                      <span key={i} style={{ fontSize: 11, background: '#f5f3ff', color: '#6d28d9', padding: '3px 8px', borderRadius: 20, fontWeight: 500 }}>{skill.trim()}</span>
                    ))}
                  </div>
                )}
                {team.contact_info && (
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                    📱 <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{team.contact_info}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
