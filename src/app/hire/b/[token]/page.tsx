'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import BrandName from '@/components/BrandName'

/**
 * /hire/b/[token] — the public recruiter shortlist.
 *
 * This is the page the operator sends a recruiter: N pre-screened candidates
 * with their verified skill signals. Token-gated; read via /api/batch/[token]
 * so batch RLS never hides a shared batch.
 */

interface Candidate {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  headline: string | null
  college: string | null
  skills: string[]
  github_contributions: number
  leetcode_solved: number
  leetcode_rating: number
  profile_href: string | null
}

export default function BatchPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [batch, setBatch] = useState<{ title: string | null } | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  useEffect(() => {
    if (!token) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/batch/${token}`)
        if (!alive) return
        if (!res.ok) {
          setNotFound(true)
          return
        }
        const json = await res.json()
        setBatch(json.batch)
        setCandidates(json.candidates || [])
      } catch {
        if (alive) setNotFound(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  return (
    <div style={{ minHeight: 'var(--app-vh)', background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <header
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--text-primary)', fontWeight: 800 }}>
          <BrandName />
        </Link>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Pre-screened shortlist</span>
      </header>

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '12px 20px 64px' }}>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading candidates…</p>}

        {notFound && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>This shortlist isn&apos;t available</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>The link may have expired or been mistyped.</p>
          </div>
        )}

        {!loading && !notFound && (
          <>
            <h1
              style={{
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                margin: '0 0 6px',
              }}
            >
              {batch?.title || 'Your pre-screened shortlist'}
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 26px' }}>
              {candidates.length} candidate{candidates.length === 1 ? '' : 's'} · screened on their connected GitHub /
              LeetCode signals. Assessment scores appear here once a candidate has taken an assessment. Reply to the
              email that sent this link to arrange interviews.
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              {candidates.map((c) => (
                <article
                  key={c.id}
                  style={{
                    display: 'flex',
                    gap: 16,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 18,
                  }}
                >
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt=""
                      width={52}
                      height={52}
                      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: 'var(--accent-light)',
                        color: 'var(--accent-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {(c.full_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{c.full_name}</h2>
                      {c.college && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{c.college}</span>}
                    </div>
                    {c.headline && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{c.headline}</p>
                    )}

                    {c.skills.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {c.skills.slice(0, 8).map((s) => (
                          <span
                            key={s}
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: 'var(--accent-text)',
                              background: 'var(--accent-light)',
                              padding: '3px 9px',
                              borderRadius: 999,
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
                      <Stat label="GitHub contributions" value={c.github_contributions} />
                      <Stat label="LeetCode solved" value={c.leetcode_solved} />
                      {c.leetcode_rating > 0 && <Stat label="Contest rating" value={c.leetcode_rating} />}
                    </div>

                    {c.profile_href && (
                      <Link
                        href={c.profile_href}
                        style={{
                          display: 'inline-block',
                          marginTop: 12,
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--accent-text)',
                        }}
                      >
                        View full profile →
                      </Link>
                    )}
                  </div>
                </article>
              ))}

              {candidates.length === 0 && (
                <p style={{ color: 'var(--text-muted)' }}>No candidates in this batch yet.</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}
