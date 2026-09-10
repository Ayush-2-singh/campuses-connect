'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'

const INDUSTRIES = ['all', 'tech', 'finance', 'consulting', 'startup', 'ecommerce', 'fintech', 'edtech', 'other']

const INDUSTRY_EMOJIS: Record<string, string> = {
  tech: '💻', finance: '💰', consulting: '🏢', startup: '🚀',
  ecommerce: '🛒', fintech: '💳', edtech: '📚', other: '🏢',
}

export default function CompaniesPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [industry, setIndustry] = useState('all')
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const loadCompanies = useCallback(async () => {
    setLoading(true)
    try {
      let url = '/api/companies?limit=50'
      if (industry !== 'all') url += `&industry=${industry}`
      if (search) url += `&search=${encodeURIComponent(search)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setCompanies(data.companies || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [industry, search])

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        setUser(authUser)
        const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single()
        setProfile(data)
      }
      loadCompanies()
    }
    load()
  }, [])

  useEffect(() => { loadCompanies() }, [industry, search])

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={() => router.push('/opportunities')} aria-label="Back"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: '-10px 0 -10px -12px', flexShrink: 0 }}>←</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🏢 Companies</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px', marginLeft: 34 }}>
          Explore companies, job openings & interview experiences
        </p>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search companies..."
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text-primary)', marginBottom: 12, boxSizing: 'border-box' }}
        />

        {/* Industry filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
          {INDUSTRIES.map(ind => (
            <button key={ind} onClick={() => setIndustry(ind)}
              style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: industry === ind ? 'var(--accent)' : 'var(--bg)',
                color: industry === ind ? 'var(--on-accent)' : 'var(--text-secondary)' }}>
              {ind === 'all' ? '🌐 All' : `${INDUSTRY_EMOJIS[ind] || '🏢'} ${ind.charAt(0).toUpperCase() + ind.slice(1)}`}
            </button>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 20 }}>              <button onClick={() => router.push('/jobs')}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 20, margin: '0 0 4px' }}>💼</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>All Jobs</p>
          </button>
          <button onClick={() => router.push('/applications')}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 20, margin: '0 0 4px' }}>📋</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Applications</p>
          </button>
          <button onClick={() => router.push('/experiences')}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 20, margin: '0 0 4px' }}>📝</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Experiences</p>
          </button>
        </div>

        {/* Company list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Loading companies...</p>
        ) : companies.length === 0 ? (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 32, margin: '0 0 8px' }}>🏢</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>No companies found</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Try a different search or filter</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {companies.map(c => (
              <div key={c.id} onClick={() => router.push(`/companies/${c.slug}`)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                {/* Logo placeholder */}
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                  {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} /> : INDUSTRY_EMOJIS[c.industry] || '🏢'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{c.name}</p>
                    {c.is_verified && <span style={{ fontSize: 12 }}>✅</span>}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {c.industry} · {c.company_size} · {c.hq_location || 'Global'}
                  </p>
                  {c.tech_stack?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {c.tech_stack.slice(0, 4).map((t: string) => (
                        <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>👥 {c.follower_count}</p>
                  {c.glassdoor_rating && <p style={{ fontSize: 12, color: 'var(--yellow-text)', margin: '2px 0 0' }}>⭐ {c.glassdoor_rating}</p>}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
