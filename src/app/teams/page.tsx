'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import Avatar from '@/components/Avatar'
import EmptyState from '@/components/EmptyState'

type TeamRequest = {
  id: string
  posted_by: string
  event_name: string
  description?: string
  skills_needed?: string
  team_size?: number
  contact_info?: string
  is_open: boolean
  created_at: string
  profiles?: { full_name: string; username: string; avatar_url?: string }
  team_request_interests?: Interest[]
}

type Interest = {
  request_id: string
  user_id: string
  message?: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  profiles?: { full_name: string; username: string; avatar_url?: string }
}

const emptyForm = { event_name: '', description: '', skills_needed: '', team_size: '4', contact_info: '' }

export default function TeamsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [teams, setTeams] = useState<TeamRequest[]>([])
  const [myRequests, setMyRequests] = useState<TeamRequest[]>([])
  const [myInterests, setMyInterests] = useState<Record<string, string>>({}) // request_id -> status
  const [showCompose, setShowCompose] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [requestTarget, setRequestTarget] = useState<TeamRequest | null>(null)
  const [requestMsg, setRequestMsg] = useState('')
  const [requestSending, setRequestSending] = useState(false)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const router = useRouter()
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
    setUser(user)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)

    const [{ data: open }, { data: mine }, { data: interests }] = await Promise.all([
      supabase.from('team_requests').select('*, profiles(full_name, username, avatar_url)').eq('is_open', true).order('created_at', { ascending: false }).limit(30),
      supabase.from('team_requests').select('*, team_request_interests(*, profiles(full_name, username, avatar_url))').eq('posted_by', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('team_request_interests').select('request_id, status').eq('user_id', user.id),
    ])

    setTeams(open || [])
    setMyRequests(mine || [])
    const map: Record<string, string> = {}
    for (const i of interests || []) map[i.request_id] = i.status
    setMyInterests(map)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  const handlePost = async () => {
    if (!form.event_name || posting) return
    setPosting(true)
    try {
      await supabase.from('team_requests').insert({
        posted_by: user.id,
        campus_id: profile?.campus_id,
        ...form,
        team_size: parseInt(form.team_size) || 4,
        is_open: true,
      })
      setForm({ ...emptyForm })
      setShowCompose(false)
      await load()
    } catch { /* UI stays in current state */ }
    setPosting(false)
  }

  const handleCloseRequest = async (id: string) => {
    try {
      await supabase.from('team_requests').update({ is_open: false }).eq('id', id).eq('posted_by', user.id)
      await load()
    } catch { /* UI stays in current state */ }
  }

  const openRequestModal = (team: TeamRequest) => {      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
    setRequestTarget(team)
    setRequestMsg('')
  }

  const sendRequest = async () => {
    if (!requestTarget) return
    setRequestSending(true)
    try {
      await supabase.rpc('request_team_join', { p_request_id: requestTarget.id, p_message: requestMsg.trim() || null })
      setRequestTarget(null)
      await load()
    } catch { /* UI stays in current state */ }
    setRequestSending(false)
  }

  const respond = async (reqId: string, userId: string, accept: boolean) => {
    setBusy(b => ({ ...b, [`${reqId}:${userId}`]: true }))
    try {
      await supabase.rpc('respond_team_join', { p_request_id: reqId, p_user_id: userId, p_accept: accept })
      await load()
    } catch { /* UI stays in current state */ }
    setBusy(b => ({ ...b, [`${reqId}:${userId}`]: false }))
  }

  const inputStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const }

  const interestStatus = (reqId: string) => myInterests[reqId]
  const pendingCount = (t: TeamRequest) => (t.team_request_interests || []).filter(i => i.status === 'pending').length

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button onClick={() => router.push('/more')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Find Teammates</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, marginLeft: 34 }}>Post for a hackathon, request to join, accept — you&apos;re connected.</p>
          </div>
          {user && <button onClick={() => setShowCompose(s => !s)} style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{showCompose ? 'Cancel' : '+ Post'}</button>}
        </div>

        {showCompose && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
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
              <button onClick={() => setShowCompose(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handlePost} disabled={!form.event_name || posting} style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        )}

        {/* ── My requests: inbox of join requests ── */}
        {myRequests.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>📥 Your team requests</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myRequests.map(t => (
                <div key={t.id} style={{ background: 'var(--bg)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{t.event_name}</p>
                    <span style={{ fontSize: 12, background: 'var(--accent-light)', color: 'var(--accent)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                      {pendingCount(t) > 0 ? `${pendingCount(t)} pending` : 'No pending requests'}
                    </span>
                  </div>
                  {(t.team_request_interests || []).length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>No one has requested to join yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(t.team_request_interests || []).map(i => (
                        <div key={i.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 12px' }}>
                          <Avatar name={i.profiles?.full_name} avatarUrl={i.profiles?.avatar_url} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{i.profiles?.full_name || 'Student'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>@{i.profiles?.username}</span></p>
                            {i.message && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{i.message}”</p>}
                          </div>
                          {i.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button onClick={() => respond(t.id, i.user_id, true)} disabled={busy[`${t.id}:${i.user_id}`]}
                                style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✓ Accept</button>
                              <button onClick={() => respond(t.id, i.user_id, false)} disabled={busy[`${t.id}:${i.user_id}`]}
                                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-light)', color: 'var(--danger-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Decline</button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: i.status === 'accepted' ? 'var(--success-text)' : 'var(--text-muted)' }}>
                              {i.status === 'accepted' ? '🎉 Accepted — connected' : 'Declined'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.is_open && (
                    <button onClick={() => handleCloseRequest(t.id)} style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Close this request
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Open requests ── */}
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>🚀 Open team requests</h3>
        {teams.length === 0 ? (
          <EmptyState icon="users" title="No team requests yet" body={user ? 'Be the first to post!' : 'Join to post or request a spot on a team.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {teams.map(team => {
              const isMine = team.posted_by === user?.id
              const status = interestStatus(team.id)
              return (
                <div key={team.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Avatar name={team.profiles?.full_name} avatarUrl={team.profiles?.avatar_url} size={34} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{team.event_name}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>@{team.profiles?.username}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, background: 'var(--accent-light)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>👥 {team.team_size} members</span>
                  </div>
                  {team.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>{team.description}</p>}
                  {team.skills_needed && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {team.skills_needed.split(',').map((skill: string, i: number) => (
                        <span key={i} style={{ fontSize: 11, background: 'var(--purple-light)', color: 'var(--purple-text)', padding: '3px 8px', borderRadius: 20, fontWeight: 500 }}>{skill.trim()}</span>
                      ))}
                    </div>
                  )}
                  {team.contact_info && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      📱 <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{team.contact_info}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    {isMine ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Your post · {pendingCount(team)} pending request{pendingCount(team) === 1 ? '' : 's'}</span>
                    ) : status ? (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: status === 'accepted' ? 'var(--success-text)' : status === 'pending' ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {status === 'accepted' ? '🎉 Request accepted — you&apos;re connected!' : status === 'pending' ? '✓ Request sent — waiting for the poster' : 'Request declined'}
                      </span>
                    ) : (
                      <button onClick={() => openRequestModal(team)}
                        style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Request to Join
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Request-to-join modal ── */}
      {requestTarget && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => { if (!requestSending) setRequestTarget(null) }}>
          <div className="modal-sheet" style={{ width: '100%', maxWidth: 400, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Request to join team">
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🤝 Request to join</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>Join <strong>{requestTarget.event_name}</strong> — the poster will get your request and can accept you.</p>
            <textarea
              value={requestMsg}
              onChange={e => setRequestMsg(e.target.value)}
              placeholder="Tell them why you'd be a great fit (skills, projects, availability)..."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setRequestTarget(null)} disabled={requestSending}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={sendRequest} disabled={requestSending}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: requestSending ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {requestSending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
