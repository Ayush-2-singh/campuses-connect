'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const STATUS_CONFIG: Record<string, { color: string; bg: string; emoji: string }> = {
  applied: { color: 'var(--accent)', bg: 'var(--accent-light)', emoji: '📤' },
  shortlisted: { color: 'var(--yellow-text)', bg: 'var(--yellow-light, #fef3c7)', emoji: '⭐' },
  interview: { color: 'var(--purple-text)', bg: 'var(--purple-light)', emoji: '🎤' },
  offer: { color: 'var(--success-text)', bg: 'var(--success-light)', emoji: '🎉' },
  rejected: { color: 'var(--danger)', bg: 'var(--danger-light)', emoji: '❌' },
  withdrawn: { color: 'var(--text-muted)', bg: 'var(--bg-secondary)', emoji: '↩️' },
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
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) { router.replace('/auth/login?redirect=/applications'); return }
      setUser(authUser)
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
      setProfile(data)

      const res = await fetch('/api/applications')
      if (res.ok) {
        const d = await res.json()
        setApplications(d.applications || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = filter === 'all' ? applications : applications.filter(a => a.status === filter)

  const counts = STATUSES.slice(1).reduce((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length
    return acc
  }, {} as Record<string, number>)

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/companies')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>My Applications</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Track your job applications and their status
        </p>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 16 }}>
          {STATUSES.slice(1).map(s => {
            const cfg = STATUS_CONFIG[s]
            return (
              <div key={s} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: cfg.color, margin: 0 }}>{counts[s]}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0' }}>{cfg.emoji} {s.charAt(0).toUpperCase() + s.slice(1)}</p>
              </div>
            )
          })}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: filter === s ? 'var(--accent)' : 'var(--bg)',
                color: filter === s ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
              {s === 'all' ? 'All' : `${STATUS_CONFIG[s].emoji} ${s.charAt(0).toUpperCase() + s.slice(1)}`}
              {s !== 'all' && ` (${counts[s]})`}
            </button>
          ))}
        </div>

        {/* Applications list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              {filter === 'all' ? 'No applications yet' : `No ${filter} applications`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {filter === 'all' ? 'Start applying to jobs from the Companies page' : 'Try a different filter'}
            </p>
            {filter === 'all' && (
              <button onClick={() => router.push('/companies')}
                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                🏢 Browse Companies
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(app => {
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.applied
              const job = app.job_postings
              const company = job?.companies
              return (
                <div key={app.id} onClick={() => router.push(`/jobs/${app.job_posting_id}`)}
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {company?.logo_url ? <img src={company.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10 }} /> : '🏢'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>{job?.title || 'Unknown Job'}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        {company?.name || '—'} · Applied {new Date(app.applied_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                      {cfg.emoji} {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </span>
                  </div>
                  {app.cover_note && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      📝 {app.cover_note.slice(0, 120)}{app.cover_note.length > 120 ? '...' : ''}
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
