'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const JOB_TYPES = ['all', 'internship', 'full_time', 'part_time', 'contract', 'freelance']
const TYPE_EMOJI: Record<string, string> = { internship: '🎓', full_time: '💼', part_time: '⏰', contract: '📋', freelance: '🌐' }

export default function JobsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [jobType, setJobType] = useState('all')
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/jobs?limit=30'
      if (jobType !== 'all') url += `&type=${jobType}`
      if (search) url += `&search=${encodeURIComponent(search)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setJobs(data.jobs || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [jobType, search])

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
      loadJobs()
    }
    load()
  }, [])

  useEffect(() => { loadJobs() }, [jobType, search])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/companies')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>💼 Job Openings</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Latest internships, full-time roles & more
        </p>

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search jobs..."
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)', marginBottom: 12, boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {JOB_TYPES.map(t => (
            <button key={t} onClick={() => setJobType(t)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: jobType === t ? 'var(--accent)' : 'var(--bg)', color: jobType === t ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
              {t === 'all' ? '🌐 All' : `${TYPE_EMOJI[t]} ${t.replace('_', ' ')}`}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : jobs.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>💼</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No jobs found</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.map(job => {
              const company = job.companies
              return (
                <div key={job.id} onClick={() => router.push(`/jobs/${job.id}`)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {company?.logo_url ? <img src={company.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10 }} /> : '🏢'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{job.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{company?.name || '—'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 }}>
                      {TYPE_EMOJI[job.job_type]} {job.job_type.replace('_', ' ')}
                    </span>
                    {job.location_type && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {job.location_type === 'remote' ? '🌍 Remote' : job.location_type === 'hybrid' ? '🔄 Hybrid' : '🏢 Onsite'}
                      </span>
                    )}
                    {(job.stipend || job.salary_range) && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--success-light)', color: 'var(--success-text)', fontWeight: 600 }}>
                        💰 {job.stipend || job.salary_range}
                      </span>
                    )}
                  </div>
                  {job.skills_required?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {job.skills_required.slice(0, 5).map((s: string) => (
                        <span key={s} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{s}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    {job.deadline && <span style={{ fontSize: 11, color: 'var(--danger)' }}>⏰ {new Date(job.deadline).toLocaleDateString()}</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>👁️ {job.view_count} · 📋 {job.apply_count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
