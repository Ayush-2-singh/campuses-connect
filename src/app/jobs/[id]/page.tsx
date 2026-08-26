'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Layout from '@/components/Layout'

export default function JobDetailPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [coverNote, setCoverNote] = useState('')
  const [showApply, setShowApply] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()
  const params = useParams()
  const jobId = params.id as string
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }

      // Fetch job
      const { data: jobData } = await supabase
        .from('job_postings')
        .select('*, companies(name, slug, logo_url, industry, website)')
        .eq('id', jobId)
        .single()

      setJob(jobData)

      // Check if already applied
      if (authUser && jobData) {
        const { data: existingApp } = await supabase
          .from('applications')
          .select('id')
          .eq('user_id', authUser.id)
          .eq('job_posting_id', jobId)
          .maybeSingle()
        if (existingApp) setApplied(true)
      }

      // Increment view count
      if (jobData) {
        await supabase.from('job_postings').update({ view_count: (jobData.view_count || 0) + 1 }).eq('id', jobId)
      }

      setLoading(false)
    }
    load()
  }, [jobId])

  const apply = async () => {
    setApplying(true)
    setError('')
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_posting_id: jobId, cover_note: coverNote || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setApplied(true)
      setShowApply(false)
      setSuccess('Application submitted! 🎉')
      setJob((j: any) => ({ ...j, apply_count: (j.apply_count || 0) + 1 }))
    } catch (err: any) {
      setError(err.message)
    }
    setApplying(false)
  }

  if (loading) return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading job...</p>
      </div>
    </Layout>
  )

  if (!job) return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Job not found</p>
      </div>
    </Layout>
  )

  const company = job.companies
  const jobTypeEmoji: Record<string, string> = { internship: '🎓', full_time: '💼', part_time: '⏰', contract: '📋', freelance: '🌐' }
  const isExpired = job.deadline && new Date(job.deadline) < new Date()

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <button onClick={() => router.push('/jobs')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--accent)', marginBottom: 16, fontFamily: 'inherit', padding: 0 }}>
          ← Back to Jobs
        </button>

        {/* Messages */}
        {error && <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--danger)', marginBottom: 16 }}>{error}</div>}
        {success && <div style={{ background: 'var(--success-light)', border: '1px solid var(--success-border, #16a34a33)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--success-text)', marginBottom: 16 }}>✅ {success}</div>}

        {/* Job header */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, cursor: 'pointer' }}
              onClick={() => company?.slug && router.push(`/companies/${company.slug}`)}>
              {company?.logo_url ? <img src={company.logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 12 }} /> : '🏢'}
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>{job.title}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, cursor: 'pointer' }}
                onClick={() => company?.slug && router.push(`/companies/${company.slug}`)}>
                {company?.name || '—'} · {company?.industry}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {jobTypeEmoji[job.job_type]} {job.job_type.replace('_', ' ')}
            </span>
            {job.location_type && (
              <span style={{ padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {job.location_type === 'remote' ? '🌍 Remote' : job.location_type === 'hybrid' ? '🔄 Hybrid' : '🏢 Onsite'}
              </span>
            )}
            {job.location && (
              <span style={{ padding: '5px 12px', borderRadius: 10, fontSize: 12, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                📍 {job.location}
              </span>
            )}
          </div>

          {(job.stipend || job.salary_range) && (
            <div style={{ background: 'var(--success-light)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--success-text)', fontWeight: 600, margin: 0 }}>
                💰 {job.stipend || job.salary_range}
              </p>
            </div>
          )}

          {job.deadline && (
            <p style={{ fontSize: 12, color: isExpired ? 'var(--danger)' : 'var(--text-muted)', margin: 0 }}>
              ⏰ Deadline: {new Date(job.deadline).toLocaleDateString()} {isExpired ? '(EXPIRED)' : ''}
            </p>
          )}
        </div>

        {/* Description */}
        {job.description && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>📋 Description</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{job.description}</p>
          </div>
        )}

        {/* Skills */}
        {job.skills_required?.length > 0 && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>🛠️ Skills Required</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {job.skills_required.map((s: string) => (
                <span key={s} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Apply section */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                👁️ {job.view_count} views · 📋 {job.apply_count} applicants
              </p>
            </div>
            {applied ? (
              <span style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--success-light)', color: 'var(--success-text)' }}>
                ✅ Applied
              </span>
            ) : isExpired ? (
              <span style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--danger-light)', color: 'var(--danger)' }}>
                ⏰ Expired
              </span>
            ) : !showApply ? (
              <button onClick={() => setShowApply(true)}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                📤 Apply Now
              </button>
            ) : null}
          </div>

          {showApply && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 10px' }}>✍️ Cover Note (optional)</h4>
              <textarea value={coverNote} onChange={e => setCoverNote(e.target.value)}
                placeholder="Why are you a good fit for this role? Mention relevant projects, skills, and experience..."
                rows={4}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => { setShowApply(false); setCoverNote('') }}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={apply} disabled={applying}
                  style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: applying ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {applying ? 'Applying...' : '📤 Submit Application'}
                </button>
              </div>
            </div>
          )}

          {job.apply_link && (
            <a href={job.apply_link} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
              🌐 Apply directly on company website
            </a>
          )}
        </div>
      </div>
    </Layout>
  )
}
