'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

export default function PollsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [polls, setPolls] = useState<any[]>([])
  const [votes, setVotes] = useState<Record<string, number[]>>({})   // poll_id -> option_index -> count
  const [myVotes, setMyVotes] = useState<Record<string, number>>({}) // poll_id -> my option_index
  const [showCreate, setShowCreate] = useState(false)
  const [posting, setPosting] = useState(false)
  const [form, setForm] = useState({ question: '', options: ['', ''] })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const loadVotes = async () => {
    const { data } = await supabase.from('poll_votes').select('poll_id, option_index')
    const counts: Record<string, number[]> = {}
    ;(data || []).forEach((v: any) => {
      if (!counts[v.poll_id]) counts[v.poll_id] = []
      counts[v.poll_id][v.option_index] = (counts[v.poll_id][v.option_index] || 0) + 1
    })
    setVotes(counts)
  }

  useEffect(() => {
    let alive = true
    const channel = supabase
      .channel('poll-votes-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => {
        if (alive) loadVotes()
      })
      .subscribe()

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
        const { data: mine } = await supabase.from('poll_votes').select('poll_id, option_index').eq('user_id', user.id)
        const m: Record<string, number> = {}
        ;(mine || []).forEach((v: any) => { m[v.poll_id] = v.option_index })
        setMyVotes(m)
      }
      const { data } = await supabase
        .from('polls')
        .select('*, profiles(full_name)')
        .eq('is_active', true)
        .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(30)
      setPolls(data || [])
      await loadVotes()
      setLoading(false)
    }
    load()

    return () => { alive = false; supabase.removeChannel(channel) }
  }, [])

  const vote = async (pollId: string, optionIndex: number) => {      if (!user) { router.replace('/auth/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')); return }
    const { error } = await supabase.from('poll_votes').upsert(
      { poll_id: pollId, user_id: user.id, option_index: optionIndex },
      { onConflict: 'poll_id,user_id' }
    )
    if (!error) {
      setMyVotes(m => ({ ...m, [pollId]: optionIndex }))
      loadVotes()
    }
  }

  const handleCreate = async () => {
    const opts = form.options.map(o => o.trim()).filter(Boolean)
    if (!form.question.trim() || opts.length < 2 || !user) return
    setPosting(true)
    await supabase.from('polls').insert({
      question: form.question.trim(),
      options: opts,
      created_by: user.id,
      campus_id: profile?.campus_id,
    })
    setForm({ question: '', options: ['', ''] })
    setShowCreate(false)
    const { data } = await supabase
      .from('polls')
      .select('*, profiles(full_name)')
      .eq('is_active', true)
      .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(30)
    setPolls(data || [])
    setPosting(false)
  }

  const setOption = (i: number, value: string) => {
    setForm(f => ({ ...f, options: f.options.map((o, idx) => idx === i ? value : o) }))
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const,
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>📊 Campus Polls</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Vote on what matters — results update live</p>
          </div>
          {user && (
            <button onClick={() => setShowCreate(s => !s)}
              style={{ background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '9px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Create Poll
            </button>
          )}
        </div>

        {/* Create */}
        {showCreate && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Create a poll</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Question * (e.g. Which movie for movie night?)" style={inputStyle} />
              {form.options.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="text" value={opt} onChange={e => setOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`} style={inputStyle} />
                  {form.options.length > 2 && (
                    <button onClick={() => setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))}
                      style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
                  )}
                </div>
              ))}
              {form.options.length < 4 && (
                <button onClick={() => setForm(f => ({ ...f, options: [...f.options, ''] }))}
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: 10, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Add option
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleCreate} disabled={!form.question.trim() || form.options.filter(o => o.trim()).length < 2 || posting}
                style={{ flex: 1, background: posting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {posting ? 'Creating...' : 'Create Poll'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : polls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No polls yet</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Create the first one and get the campus talking!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {polls.map(poll => {
              const opts: string[] = Array.isArray(poll.options) ? poll.options : []
              const counts = votes[poll.id] || []
              const total = counts.reduce((s, c) => s + (c || 0), 0)
              const myPick = myVotes[poll.id]
              return (
                <div key={poll.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{poll.question}</p>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 10 }}>{total} vote{total === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {opts.map((opt, i) => {
                      const c = counts[i] || 0
                      const pct = total > 0 ? Math.round((c / total) * 100) : 0
                      const isMine = myPick === i
                      return (
                        <button key={i} onClick={() => vote(poll.id, i)} disabled={!user}
                          style={{
                            width: '100%', textAlign: 'left', position: 'relative', overflow: 'hidden',
                            border: isMine ? '2px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 10, padding: '11px 14px', cursor: user ? 'pointer' : 'not-allowed',
                            background: 'var(--bg)', fontFamily: 'inherit',
                          }}>
                          <div style={{
                            position: 'absolute', inset: 0, background: isMine ? 'var(--accent-light)' : 'var(--bg-secondary)',
                            width: `${pct}%`, transition: 'width 0.5s ease', zIndex: 0,
                          }} />
                          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 14, color: isMine ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isMine ? 700 : 500 }}>
                              {isMine ? '✓ ' : ''}{opt}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{pct}%</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 0' }}>by {poll.profiles?.full_name || 'Someone'} · {new Date(poll.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
