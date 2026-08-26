'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const DIFF_COLORS: Record<string, string> = { easy: 'var(--success-text)', medium: 'var(--yellow-text)', hard: 'var(--danger)' }
const RESULT_EMOJI: Record<string, string> = { selected: '✅', rejected: '❌', pending: '⏳', withdrawn: '↩️' }

export default function ExperiencesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [experiences, setExperiences] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [form, setForm] = useState({ company_id: '', title: '', experience: '', role: '', round_count: '', result: '', difficulty: '', rating: '', tips: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
      const res = await fetch('/api/experiences')
      if (res.ok) {
        const d = await res.json()
        setExperiences(d.experiences || [])
      }
      // Load companies for form
      const { data: compData } = await supabase.from('companies').select('id, name, slug').eq('is_active', true).order('name')
      setCompanies(compData || [])
      setLoading(false)
    }
    load()
  }, [])

  const submitExperience = async () => {
    if (!form.company_id || !form.title || !form.experience) {
      setError('Company, title, and experience are required')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          round_count: form.round_count ? parseInt(form.round_count) : undefined,
          rating: form.rating ? parseInt(form.rating) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(false)
      setForm({ company_id: '', title: '', experience: '', role: '', round_count: '', result: '', difficulty: '', rating: '', tips: '' })
      // Reload
      const r2 = await fetch('/api/experiences')
      if (r2.ok) { const d = await r2.json(); setExperiences(d.experiences || []) }
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const vote = async (expId: string, voteVal: number) => {
    await fetch('/api/experiences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experience_id: expId, vote: voteVal }),
    })
    // Reload
    const res = await fetch('/api/experiences')
    if (res.ok) { const d = await res.json(); setExperiences(d.experiences || []) }
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/companies')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📝 Interview Experiences</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', marginLeft: 34 }}>
          Learn from real interview experiences shared by students
        </p>

        <button onClick={() => setShowForm(!showForm)}
          style={{ width: '100%', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          ✍️ {showForm ? 'Cancel' : 'Share Your Experience'}
        </button>

        {error && <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}

        {/* Form */}
        {showForm && (
          <div style={{ background: 'var(--bg)', border: '2px solid var(--accent)', borderRadius: 16, padding: 20, marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>✍️ Share Your Interview Experience</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <select value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="">Select Company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title (e.g. SDE Intern Interview)"
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role (e.g. SDE Intern)"
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="">Difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="">Result</option>
                <option value="selected">Selected</option>
                <option value="rejected">Rejected</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={form.round_count} onChange={e => setForm({ ...form, round_count: e.target.value })} placeholder="Number of rounds" type="number"
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              <select value={form.rating} onChange={e => setForm({ ...form, rating: e.target.value })}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                <option value="">Rating</option>
                {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>⭐ {r}/5</option>)}
              </select>
            </div>
            <textarea value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })}
              placeholder="Describe your interview experience in detail — rounds, questions asked, how you prepared..." rows={6}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <textarea value={form.tips} onChange={e => setForm({ ...form, tips: e.target.value })}
              placeholder="Preparation tips for others (optional)" rows={2}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <button onClick={submitExperience} disabled={submitting}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: submitting ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {submitting ? 'Posting...' : '📤 Post Experience'}
            </button>
          </div>
        )}

        {/* Experiences list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : experiences.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>📝</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No experiences yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {experiences.map(exp => (
              <div key={exp.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{exp.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                      {exp.companies?.name || '—'} {exp.role && `· ${exp.role}`} · by {exp.profiles?.full_name || 'Anonymous'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {exp.difficulty && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 600, background: 'var(--bg-secondary)', color: DIFF_COLORS[exp.difficulty] }}>{exp.difficulty}</span>}
                    {exp.result && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, fontWeight: 600, background: 'var(--bg-secondary)' }}>{RESULT_EMOJI[exp.result]} {exp.result}</span>}
                    {exp.rating && <span style={{ fontSize: 12, color: 'var(--yellow-text)' }}>⭐ {exp.rating}/5</span>}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {exp.experience}
                </p>
                {exp.tips && (
                  <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
                    <p style={{ fontSize: 12, color: 'var(--accent-text)', margin: 0, lineHeight: 1.5 }}>💡 <strong>Tips:</strong> {exp.tips}</p>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => vote(exp.id, 1)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>👍</button>
                    <button onClick={() => vote(exp.id, -1)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>👎</button>
                  </div>
                  <span style={{ fontSize: 12, color: exp.upvotes > 0 ? 'var(--success-text)' : 'var(--text-muted)' }}>
                    {exp.upvotes} helpful
                  </span>
                  {exp.round_count && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📋 {exp.round_count} rounds</span>}
                  {exp.offer_salary && <span style={{ fontSize: 11, color: 'var(--success-text)' }}>💰 {exp.offer_salary}</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {new Date(exp.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
