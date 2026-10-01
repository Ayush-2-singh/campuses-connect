'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Layout from '@/components/Layout'
import { Icon } from '@/components/icons'

export default function CompanyPage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [experiences, setExperiences] = useState<any[]>([])
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [avgRating, setAvgRating] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'jobs' | 'experiences'>('jobs')
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
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
      try {
        const res = await fetch(`/api/companies/${slug}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setCompany(data.company)
          setJobs(data.jobs)
          setExperiences(data.experiences)
          setFollowerCount(data.follower_count)
          setIsFollowing(data.is_following)
          setAvgRating(data.avg_rating)
        }
      } catch {
        /* ignore */
      }
      setLoading(false)
    }
    load()
  }, [slug])

  const toggleFollow = async () => {
    if (!company) return
    if (isFollowing) {
      await supabase.from('company_followers').delete().eq('company_id', company.id).eq('user_id', user.id)
      setFollowerCount((f) => f - 1)
    } else {
      await supabase.from('company_followers').insert({ company_id: company.id, user_id: user.id })
      setFollowerCount((f) => f + 1)
    }
    setIsFollowing(!isFollowing)
  }

  if (loading)
    return (
      <Layout user={user} profile={profile}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading company...</p>
        </div>
      </Layout>
    )

  if (!company)
    return (
      <Layout user={user} profile={profile}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Company not found</p>
        </div>
      </Layout>
    )

  // Result pill: token color carries the verdict — no emoji glyphs.
  const resultStyle: Record<string, { bg: string; fg: string }> = {
    selected: { bg: 'var(--success-light)', fg: 'var(--success-text)' },
    rejected: { bg: 'var(--danger-light)', fg: 'var(--danger-text)' },
    pending: { bg: 'var(--warning-light)', fg: 'var(--warning-text)' },
    withdrawn: { bg: 'var(--bg-secondary)', fg: 'var(--text-muted)' },
  }
  const diffColor: Record<string, string> = {
    easy: 'var(--success-text)',
    medium: 'var(--yellow-text)',
    hard: 'var(--danger)',
  }

  return (
    <Layout user={user} profile={profile}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
        {/* Back */}
        <button
          onClick={() => router.push('/companies')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: 'var(--accent)',
            marginBottom: 16,
            fontFamily: 'inherit',
            padding: 0,
          }}
        >
          ← Back to Companies
        </button>

        {/* Company header */}
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                flexShrink: 0,
              }}
            >
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }}
                />
              ) : (
                <Icon name="building" size={28} style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {company.name}
                </h2>
                {company.is_verified && <Icon name="check" size={15} style={{ color: 'var(--success-text)' }} />}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                {company.industry} · {company.company_size} · {company.hq_location || 'Global'}
              </p>
              {company.description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6 }}>
                  {company.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <button
                  onClick={toggleFollow}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: isFollowing ? 'var(--danger-light)' : 'var(--accent)',
                    color: isFollowing ? 'var(--danger)' : 'var(--on-accent)',
                  }}
                >
                  {isFollowing ? 'Unfollow' : 'Follow'} ({followerCount})
                </button>
                {avgRating && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--yellow-text)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Icon name="star" size={11} /> {avgRating}
                  </span>
                )}
                {company.website && (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    <Icon name="link" size={11} style={{ verticalAlign: '-1px' }} /> Website
                  </a>
                )}
              </div>
            </div>
          </div>
          {company.tech_stack?.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
              }}
            >
              {company.tech_stack.map((t: string) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          {(['jobs', 'experiences'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 500,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                fontFamily: 'inherit',
              }}
            >
              {tab === 'jobs' ? `Jobs (${jobs.length})` : `Experiences (${experiences.length})`}
            </button>
          ))}
        </div>

        {/* Jobs */}
        {activeTab === 'jobs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {jobs.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '30px 20px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ margin: '0 0 8px', color: 'var(--accent-text)', display: 'flex', justifyContent: 'center' }}
                >
                  <Icon name="briefcase" size={28} strokeWidth={1.6} />
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>No active job postings yet</p>
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {job.title}
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 8,
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            fontWeight: 600,
                          }}
                        >
                          {job.job_type.replace('_', ' ')}
                        </span>
                        {job.location_type && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 8,
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {job.location_type === 'remote'
                              ? 'Remote'
                              : job.location_type === 'hybrid'
                                ? 'Hybrid'
                                : 'Onsite'}
                          </span>
                        )}
                        {job.stipend && (
                          <span style={{ fontSize: 11, color: 'var(--success-text)', fontWeight: 600 }}>
                            {job.stipend}
                          </span>
                        )}
                        {job.salary_range && (
                          <span style={{ fontSize: 11, color: 'var(--success-text)', fontWeight: 600 }}>
                            {job.salary_range}
                          </span>
                        )}
                      </div>
                      {job.skills_required?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {job.skills_required.slice(0, 5).map((s: string) => (
                            <span
                              key={s}
                              style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 6,
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {job.deadline && (
                        <p
                          style={{
                            fontSize: 11,
                            color: 'var(--danger)',
                            margin: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Icon name="clock" size={10} /> {new Date(job.deadline).toLocaleDateString()}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        {job.view_count} views · {job.apply_count} applied
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Experiences */}
        {activeTab === 'experiences' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => router.push(`/experiences?company=${slug}`)}
              style={{
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '10px 16px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: 4,
              }}
            >
              <Icon name="pencil" size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Share your experience
            </button>
            {experiences.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  padding: '30px 20px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{ margin: '0 0 8px', color: 'var(--accent-text)', display: 'flex', justifyContent: 'center' }}
                >
                  <Icon name="pencil" size={28} strokeWidth={1.6} />
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                  No interview experiences yet. Be the first!
                </p>
              </div>
            ) : (
              experiences.map((exp) => (
                <div
                  key={exp.id}
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: '16px 18px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {exp.title}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        {exp.role && `${exp.role} · `}
                        {exp.profiles?.full_name || 'Anonymous'} · {new Date(exp.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                      {exp.difficulty && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                            color: diffColor[exp.difficulty] || 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {exp.difficulty}
                        </span>
                      )}
                      {exp.result && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 8,
                            background: resultStyle[exp.result]?.bg || 'var(--bg-secondary)',
                            color: resultStyle[exp.result]?.fg || 'var(--text-secondary)',
                            fontWeight: 600,
                          }}
                        >
                          {exp.result}
                        </span>
                      )}
                      {exp.rating && (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--yellow-text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Icon name="star" size={11} /> {exp.rating}/5
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      margin: '0 0 8px',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {exp.experience.length > 300 ? exp.experience.slice(0, 300) + '...' : exp.experience}
                  </p>
                  {exp.tips && (
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--accent-text)',
                        background: 'var(--accent-light)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        margin: '0 0 8px',
                        lineHeight: 1.5,
                      }}
                    >
                      <Icon name="sparkles" size={12} style={{ verticalAlign: '-2px', marginRight: 5 }} /> {exp.tips}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: exp.upvotes > 0 ? 'var(--success-text)' : 'var(--text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="heart" size={11} /> {exp.upvotes} helpful
                    </span>
                    {exp.round_count && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{exp.round_count} rounds</span>
                    )}
                    {exp.offer_salary && (
                      <span style={{ fontSize: 11, color: 'var(--success-text)' }}>{exp.offer_salary}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
