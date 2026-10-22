'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'

const DIFF_TONE: Record<string, string> = {
  easy: 'hc-tag--success',
  medium: 'hc-tag--warn',
  hard: 'hc-tag--danger',
}

const RESULT: Record<string, { tone: string; icon: string; label: string }> = {
  selected: { tone: 'hc-tag--success', icon: 'check', label: 'Selected' },
  rejected: { tone: 'hc-tag--danger', icon: 'x', label: 'Rejected' },
  pending: { tone: 'hc-tag--warn', icon: 'clock', label: 'Pending' },
  withdrawn: { tone: 'hc-tag--ghost', icon: 'reply', label: 'Withdrawn' },
}

const EMPTY_FORM = {
  company_id: '',
  title: '',
  experience: '',
  role: '',
  round_count: '',
  result: '',
  difficulty: '',
  rating: '',
  tips: '',
}

export default function ExperiencesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [experiences, setExperiences] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
      const res = await fetch('/api/experiences', { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setExperiences(d.experiences || [])
      }
      // Load companies for form
      const { data: compData } = await supabase
        .from('companies')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name')
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
        headers: { 'Content-Type': 'application/json', credentials: 'include' },
        body: JSON.stringify({
          ...form,
          round_count: form.round_count ? parseInt(form.round_count) : undefined,
          rating: form.rating ? parseInt(form.rating) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(false)
      setForm(EMPTY_FORM)
      // Reload
      const r2 = await fetch('/api/experiences', { credentials: 'include' })
      if (r2.ok) {
        const d = await r2.json()
        setExperiences(d.experiences || [])
      }
    } catch (err: any) {
      setError(err.message)
    }
    setSubmitting(false)
  }

  const vote = async (expId: string, voteVal: number) => {
    await fetch('/api/experiences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', credentials: 'include' },
      body: JSON.stringify({ experience_id: expId, vote: voteVal }),
    })
    // Reload
    const res = await fetch('/api/experiences', { credentials: 'include' })
    if (res.ok) {
      const d = await res.json()
      setExperiences(d.experiences || [])
    }
  }

  return (
    <Layout user={user} profile={profile}>
      <div className="hc-page">
        <div className="hc-page-head hc-reveal">
          <button className="hc-back" onClick={() => router.push('/')} aria-label="Back">
            ←
          </button>
          <div style={{ minWidth: 0 }}>
            <span className="hc-eyebrow">Community</span>
            <h1 className="hc-h1">
              Interviews, <em className="hc-em">as they happened.</em>
            </h1>
            <p className="hc-lede">Learn from real interviews shared by students</p>
          </div>
        </div>

        {/* Blog is a SUBSECTION of Experiences, not a sibling page: one tab
            strip keeps the two together instead of two nav entries. */}
        <div className="hc-reveal" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="hc-btn hc-btn--primary" type="button" aria-current="page">
            Interview experiences
          </button>
          <button className="hc-btn" type="button" onClick={() => router.push('/blog')}>
            Guides &amp; blogs
          </button>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="hc-btn hc-btn--primary hc-btn--block hc-reveal"
          style={{ '--hc-i': 1, marginBottom: 16 } as React.CSSProperties}
        >
          <Icon name={showForm ? 'x' : 'pencil'} size={14} />
          {showForm ? 'Cancel' : 'Share your experience'}
        </button>

        {error && <div className="hc-alert">{error}</div>}

        {showForm && (
          <div className="hc-form">
            <h3 className="hc-form-title">Share your interview experience</h3>
            <div className="hc-form-row">
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Title (e.g. SDE Intern Interview)"
              />
            </div>

            <div className="hc-form-row">
              <input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Role (e.g. SDE Intern)"
              />
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="">Difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="hc-form-row">
              <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                <option value="">Result</option>
                <option value="selected">Selected</option>
                <option value="rejected">Rejected</option>
                <option value="pending">Pending</option>
              </select>
              <input
                value={form.round_count}
                onChange={(e) => setForm({ ...form, round_count: e.target.value })}
                placeholder="Number of rounds"
                type="number"
              />
            </div>

            <select value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
              <option value="">Rating</option>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r}/5
                </option>
              ))}
            </select>

            <textarea
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
              placeholder="Describe your interview — rounds, questions asked, how you prepared…"
              rows={6}
            />

            <textarea
              value={form.tips}
              onChange={(e) => setForm({ ...form, tips: e.target.value })}
              placeholder="Preparation tips for others (optional)"
              rows={2}
            />

            <button onClick={submitExperience} disabled={submitting} className="hc-btn hc-btn--primary hc-btn--block">
              {submitting ? 'Posting…' : 'Post experience'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="hc-grid hc-grid--list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="hc-card hc-reveal" style={{ '--hc-i': i } as React.CSSProperties}>
                <div className="skeleton" style={{ height: 14, width: '55%' }} />
                <div className="skeleton" style={{ height: 11, width: '75%' }} />
                <div className="skeleton" style={{ height: 46, width: '100%' }} />
              </div>
            ))}
          </div>
        ) : experiences.length === 0 ? (
          <div className="hc-empty hc-reveal" style={{ '--hc-i': 0 } as React.CSSProperties}>
            <span className="hc-empty-ic">
              <Icon name="pencil" size={28} strokeWidth={1.6} />
            </span>
            <p className="hc-empty-t">No experiences yet</p>
            <p className="hc-empty-s">Be the first to share what your interview was like.</p>
          </div>
        ) : (
          <div className="hc-grid hc-grid--list">
            {experiences.map((exp, i) => (
              <article key={exp.id} className="hc-card hc-reveal" style={{ '--hc-i': i } as React.CSSProperties}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="hc-title">{exp.title}</h3>
                    <p className="hc-sub">
                      {exp.companies?.name || '—'} {exp.role && `· ${exp.role}`} · by{' '}
                      {exp.profiles?.full_name || 'Anonymous'}
                    </p>
                  </div>
                  <div className="hc-tags" style={{ flexShrink: 0, justifyContent: 'flex-end' }}>
                    {exp.difficulty && (
                      <span className={`hc-tag ${DIFF_TONE[exp.difficulty] || ''}`}>{exp.difficulty}</span>
                    )}
                    {exp.result && RESULT[exp.result] && (
                      <span className={`hc-tag ${RESULT[exp.result].tone}`}>
                        <Icon name={RESULT[exp.result].icon} size={11} /> {RESULT[exp.result].label}
                      </span>
                    )}
                    {exp.rating && (
                      <span className="hc-tag hc-tag--warn">
                        <Icon name="star" size={11} /> {exp.rating}/5
                      </span>
                    )}
                  </div>
                </div>

                <p className="hc-body">{exp.experience}</p>

                {exp.tips && (
                  <p className="hc-note">
                    <strong>Tip:</strong> {exp.tips}
                  </p>
                )}

                <div className="hc-foot">
                  <button className="hc-chip" onClick={() => vote(exp.id, 1)} aria-label="Mark helpful">
                    <Icon name="check" size={12} /> Helpful
                  </button>
                  <button className="hc-chip" onClick={() => vote(exp.id, -1)} aria-label="Not helpful">
                    <Icon name="x" size={12} />
                  </button>
                  <span className="hc-meta" style={{ color: exp.upvotes > 0 ? 'var(--success-text)' : undefined }}>
                    {exp.upvotes} helpful
                  </span>
                  {exp.round_count && (
                    <span className="hc-meta">
                      <Icon name="layers" size={11} /> {exp.round_count} rounds
                    </span>
                  )}
                  {exp.offer_salary && (
                    <span className="hc-meta" style={{ color: 'var(--success-text)' }}>
                      <Icon name="trending-up" size={11} /> {exp.offer_salary}
                    </span>
                  )}
                  <span className="hc-spacer" />
                  <span className="hc-meta">{new Date(exp.created_at).toLocaleDateString()}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
