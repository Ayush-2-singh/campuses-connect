'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import SectionShell from '@/components/SectionShell'
import { Icon } from '@/components/icons'

const JOB_TYPES = ['all', 'internship', 'full_time', 'part_time', 'contract', 'freelance']

const TYPE_LABEL: Record<string, string> = {
  all: 'All',
  internship: 'Internship',
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  freelance: 'Freelance',
}

const LOCATION_LABEL: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'Onsite',
}

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
    } catch {
      /* ignore */
    }
    setLoading(false)
  }, [jobType, search])

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
      loadJobs()
    }
    load()
  }, [])

  useEffect(() => {
    loadJobs()
  }, [jobType, search])

  return (
    <Layout user={user} profile={profile}>
      <SectionShell
        icon="briefcase"
        title="Job Openings"
        subtitle="Latest internships, full-time roles & more"
        stats={[{ value: jobs.length, label: 'Openings' }]}
        actions={[{ label: 'Companies', icon: 'more', onClick: () => router.push('/companies') }]}
      >
        <div className="hc-search">
          <span className="hc-search-ic">
            <Icon name="search" size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles, companies, skills…"
            aria-label="Search jobs"
          />
        </div>

        <div className="hc-chips">
          {JOB_TYPES.map((t) => (
            <button key={t} onClick={() => setJobType(t)} className="hc-chip" aria-pressed={jobType === t}>
              {TYPE_LABEL[t] ?? t.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="hc-grid">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="hc-card hc-reveal" style={{ '--hc-i': i } as React.CSSProperties}>
                <div className="hc-card-head">
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 11 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 13, width: '70%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: '45%' }} />
                  </div>
                </div>
                <div className="skeleton" style={{ height: 11, width: '80%' }} />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="hc-empty hc-reveal" style={{ '--hc-i': 0 } as React.CSSProperties}>
            <span className="hc-empty-ic">
              <Icon name="briefcase" size={28} strokeWidth={1.6} />
            </span>
            <p className="hc-empty-t">No roles here yet</p>
            <p className="hc-empty-s">
              {search ? 'Try a different search term.' : 'New openings land here as companies post them.'}
            </p>
            <button className="hc-btn" onClick={() => router.push('/companies')}>
              Browse companies
            </button>
          </div>
        ) : (
          <div className="hc-grid">
            {jobs.map((job, i) => {
              const company = job.companies
              return (
                <div
                  key={job.id}
                  className="hc-card hc-card--link hc-card--rail hc-reveal"
                  style={{ '--hc-i': i } as React.CSSProperties}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <div className="hc-card-head">
                    <div className="hc-avatar">
                      {company?.logo_url ? (
                        <img src={company.logo_url} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <Icon name="building" size={18} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="hc-title">{job.title}</h3>
                      <p className="hc-sub">{company?.name || '—'}</p>
                    </div>
                    {job.location_type && (
                      <span className="hc-tag hc-tag--ghost">
                        {LOCATION_LABEL[job.location_type] || job.location_type}
                      </span>
                    )}
                  </div>

                  <div className="hc-tags">
                    <span className="hc-tag hc-tag--accent">
                      {TYPE_LABEL[job.job_type] ?? job.job_type?.replace('_', ' ')}
                    </span>
                    {(job.stipend || job.salary_range) && (
                      <span className="hc-tag hc-tag--success">{job.stipend || job.salary_range}</span>
                    )}
                    {job.skills_required?.slice(0, 4).map((s: string) => (
                      <span key={s} className="hc-tag">
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="hc-foot">
                    {job.deadline && (
                      <span className="hc-meta" style={{ color: 'var(--danger-text)' }}>
                        <Icon name="clock" size={11} />
                        {new Date(job.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="hc-meta">
                      {job.view_count} views · {job.apply_count} applied
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionShell>
    </Layout>
  )
}
