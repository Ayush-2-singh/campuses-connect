'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'

const STATUS_CONFIG: Record<string, { color: string; tone: string; icon: string; label: string }> = {
  applied: { color: 'var(--accent-text)', tone: 'hc-tag--accent', icon: 'send', label: 'Applied' },
  shortlisted: { color: 'var(--warning-text)', tone: 'hc-tag--warn', icon: 'star', label: 'Shortlisted' },
  interview: { color: 'var(--purple-text)', tone: 'hc-tag--purple', icon: 'mic', label: 'Interview' },
  offer: { color: 'var(--success-text)', tone: 'hc-tag--success', icon: 'trophy', label: 'Offer' },
  rejected: { color: 'var(--danger-text)', tone: 'hc-tag--danger', icon: 'x', label: 'Rejected' },
  withdrawn: { color: 'var(--text-muted)', tone: 'hc-tag--ghost', icon: 'reply', label: 'Withdrawn' },
}

const STATUSES = ['all', 'applied', 'shortlisted', 'interview', 'offer', 'rejected', 'withdrawn']

export default function ApplicationsPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) {
        router.replace('/auth/login?redirect=/applications')
        return
      }
      setUser(authUser)
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(data)

      const res = await fetch('/api/applications', { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setApplications(d.applications || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = filter === 'all' ? applications : applications.filter((a) => a.status === filter)

  const counts = STATUSES.slice(1).reduce(
    (acc, s) => {
      acc[s] = applications.filter((a) => a.status === s).length
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <Layout user={user} profile={profile}>
      <div className="hc-page" style={{ maxWidth: 720 }}>
        <div className="hc-page-head hc-reveal">
          <button className="hc-back" onClick={() => router.push('/companies')} aria-label="Back">
            ←
          </button>
          <div style={{ minWidth: 0 }}>
            <span className="hc-eyebrow">Hiring</span>
            <h1 className="hc-h1">
              Every application, <em className="hc-em">one place.</em>
            </h1>
            <p className="hc-lede">Track your job applications and their status</p>
          </div>
        </div>

        {/* Status counts */}
        <div className="hc-stats hc-reveal" style={{ '--hc-i': 1 } as React.CSSProperties}>
          {STATUSES.slice(1).map((s) => {
            const cfg = STATUS_CONFIG[s]
            return (
              <div className="hc-card" key={s}>
                <p className="hc-stat-v" style={{ color: cfg.color }}>
                  {counts[s]}
                </p>
                <p className="hc-stat-l">
                  <Icon name={cfg.icon} size={11} />
                  {cfg.label}
                </p>
              </div>
            )
          })}
        </div>

        {/* Status filter */}
        <div className="hc-chips hc-reveal" style={{ '--hc-i': 2 } as React.CSSProperties}>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setFilter(s)} className="hc-chip" aria-pressed={filter === s}>
              {s === 'all' ? (
                <>
                  <Icon name="layers" size={12} /> All
                </>
              ) : (
                <>
                  <Icon name={STATUS_CONFIG[s].icon} size={12} />
                  {STATUS_CONFIG[s].label} ({counts[s]})
                </>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="hc-grid hc-grid--list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="hc-card hc-reveal" style={{ '--hc-i': i } as React.CSSProperties}>
                <div className="hc-card-head">
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 11 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: '70%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="hc-empty hc-reveal" style={{ '--hc-i': 0 } as React.CSSProperties}>
            <span className="hc-empty-ic">
              <Icon name="layers" size={28} strokeWidth={1.6} />
            </span>
            <p className="hc-empty-t">{filter === 'all' ? 'No applications yet' : `No ${filter} applications`}</p>
            <p className="hc-empty-s">
              {filter === 'all' ? 'Start applying to jobs from the Companies page.' : 'Try a different filter.'}
            </p>
            {filter === 'all' && (
              <button className="hc-btn hc-btn--primary" onClick={() => router.push('/companies')}>
                <Icon name="building" size={14} /> Browse companies
              </button>
            )}
          </div>
        ) : (
          <div className="hc-grid hc-grid--list">
            {filtered.map((app, i) => {
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.applied
              const job = app.job_postings
              const company = job?.companies
              return (
                <div
                  key={app.id}
                  className="hc-card hc-card--link hc-card--rail hc-reveal"
                  style={{ '--hc-i': i } as React.CSSProperties}
                  onClick={() => router.push(`/jobs/${app.job_posting_id}`)}
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
                      <h3 className="hc-title">{job?.title || 'Unknown Job'}</h3>
                      <p className="hc-sub">
                        {company?.name || '—'} · Applied {new Date(app.applied_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`hc-tag ${cfg.tone}`}>
                      <Icon name={cfg.icon} size={11} /> {cfg.label}
                    </span>
                  </div>

                  {app.cover_note && (
                    <p
                      className="hc-body"
                      style={{
                        borderTop: '1px solid var(--border)',
                        paddingTop: 9,
                        marginTop: 2,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {app.cover_note.slice(0, 120)}
                      {app.cover_note.length > 120 ? '…' : ''}
                    </p>
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
