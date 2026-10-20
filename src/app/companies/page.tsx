'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'
import {
  PARTNER_STATUS_LABEL,
  PARTNER_STATUS_TONE,
  foundedLabel,
  partnerStatusOf,
  type PartnerStatus,
} from '@/lib/company-status'

const INDUSTRIES = ['all', 'tech', 'finance', 'consulting', 'startup', 'ecommerce', 'fintech', 'edtech', 'other']

const INDUSTRY_LABEL: Record<string, string> = {
  all: 'All',
  tech: 'Tech',
  finance: 'Finance',
  consulting: 'Consulting',
  startup: 'Startup',
  ecommerce: 'E-commerce',
  fintech: 'Fintech',
  edtech: 'Ed-tech',
  other: 'Other',
}

const QUICK_LINKS = [
  { label: 'All Jobs', icon: 'briefcase', href: '/jobs' },
  { label: 'Applications', icon: 'copy', href: '/applications' },
  { label: 'Experiences', icon: 'pencil', href: '/experiences' },
]

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
    } catch {
      /* ignore */
    }
    setLoading(false)
  }, [industry, search])

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
      loadCompanies()
    }
    load()
  }, [])

  useEffect(() => {
    loadCompanies()
  }, [industry, search])

  return (
    <Layout user={user} profile={profile}>
      <div className="hc-page">
        <div className="hc-page-head hc-reveal">
          <button className="hc-back" onClick={() => router.push('/jobs')} aria-label="Back">
            ←
          </button>
          <div style={{ minWidth: 0 }}>
            <span className="hc-eyebrow">Hiring</span>
            <h1 className="hc-h1">
              Companies &amp; <em className="hc-em">future partners.</em>
            </h1>
            <p className="hc-lede">
              Real companies we&rsquo;re onboarding for campus hiring — every card says where the relationship actually
              stands.
            </p>
          </div>
        </div>

        {/* Search and the industry filters share one row, so the options sit in
            the same place as on every other section. */}
        <div className="hc-bar hc-reveal" style={{ '--hc-i': 1 } as React.CSSProperties}>
          <div className="hc-search">
            <span className="hc-search-ic">
              <Icon name="search" size={16} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              aria-label="Search companies"
            />
          </div>

          <div className="hc-chips" role="group" aria-label="Industry">
            {INDUSTRIES.map((ind) => (
              <button key={ind} onClick={() => setIndustry(ind)} className="hc-chip" aria-pressed={industry === ind}>
                {INDUSTRY_LABEL[ind] ?? ind.charAt(0).toUpperCase() + ind.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="hc-quick hc-reveal" style={{ '--hc-i': 2 } as React.CSSProperties}>
          {QUICK_LINKS.map((q) => (
            <button key={q.href} className="hc-card hc-card--link" onClick={() => router.push(q.href)}>
              <span className="hc-q-ic">
                <Icon name={q.icon} size={20} />
              </span>
              <p className="hc-q-label">{q.label}</p>
            </button>
          ))}
        </div>

        <p className="hc-note hc-reveal" style={{ '--hc-i': 3, marginBottom: 20 } as React.CSSProperties}>
          A company is labelled <strong>hiring partner</strong> only after it posts a role here, and{' '}
          <strong>assisting partner</strong> once students have filed interview experiences for it. Everything else is a{' '}
          <strong>future partner</strong> we are onboarding — never a logo we borrowed.
        </p>

        {loading ? (
          <div className="hc-grid hc-grid--pairs">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="hc-card hc-reveal" style={{ '--hc-i': i } as React.CSSProperties}>
                <div className="hc-card-head">
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 13, width: '45%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: '65%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="hc-empty hc-reveal" style={{ '--hc-i': 0 } as React.CSSProperties}>
            <span className="hc-empty-ic">
              <Icon name="building" size={28} strokeWidth={1.6} />
            </span>
            <p className="hc-empty-t">No companies found</p>
            <p className="hc-empty-s">Try a different search or industry filter.</p>
          </div>
        ) : (
          <div className="hc-grid hc-grid--pairs">
            {companies.map((c, i) => {
              const status: PartnerStatus =
                c.partner_status ?? partnerStatusOf({ openRoles: c.open_roles, experienceCount: c.experience_count })
              // Only facts the directory actually holds — no "Global" stand-in,
              // no invented follower or rating figure.
              const facts = [
                c.industry ? (INDUSTRY_LABEL[c.industry] ?? c.industry) : null,
                c.hq_location,
                foundedLabel(c.founded_year),
              ].filter(Boolean)
              const roles = c.open_roles ?? 0
              return (
                <div
                  key={c.id}
                  className="hc-card hc-card--link hc-card--rail hc-reveal"
                  style={{ '--hc-i': i } as React.CSSProperties}
                  onClick={() => router.push(`/companies/${c.slug}`)}
                >
                  <div className="hc-card-head">
                    <div className="hc-avatar" style={{ width: 48, height: 48, borderRadius: 12 }}>
                      {c.logo_url ? (
                        <img loading="lazy" decoding="async" src={c.logo_url} alt="" />
                      ) : (
                        <Icon name="building" size={22} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="hc-title">{c.name}</h3>
                      {facts.length > 0 && <p className="hc-sub">{facts.join(' · ')}</p>}
                    </div>

                    <Icon name="chevron" size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>

                  <div className="hc-tags">
                    <span className={`hc-tag ${PARTNER_STATUS_TONE[status]}`}>{PARTNER_STATUS_LABEL[status]}</span>
                    {c.company_size && <span className="hc-tag">{c.company_size} employees</span>}
                    <span className="hc-tag hc-tag--ghost">
                      {roles > 0 ? `${roles} open ${roles === 1 ? 'role' : 'roles'}` : 'No open roles yet'}
                    </span>
                    {c.follower_count > 0 && (
                      <span className="hc-meta">
                        <Icon name="users" size={11} /> {c.follower_count}
                      </span>
                    )}
                    {c.glassdoor_rating && (
                      <span className="hc-meta" style={{ color: 'var(--warning-text)' }}>
                        <Icon name="star" size={11} /> {c.glassdoor_rating}
                      </span>
                    )}
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
