'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { Icon } from '@/components/icons'

type Entry = {
  user_id: string
  full_name: string
  username: string
  avatar_url: string | null
  department: string | null
  experience_count: number
  blog_count: number
  review_count: number
  helpful_received: number
  blog_likes_received: number
  contribution_score: number
  tier: string
  rank_position: number
}

const TIER_COLOR: Record<string, { color: string; bg: string }> = {
  Legend: { color: 'var(--yellow-text)', bg: 'var(--yellow-light)' },
  Trailblazer: { color: 'var(--purple-text)', bg: 'var(--purple-light)' },
  Author: { color: 'var(--cyan-text)', bg: 'var(--cyan-light)' },
  Contributor: { color: 'var(--success-text)', bg: 'var(--success-light)' },
  Rookie: { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' },
}

const POINTS = [
  { label: 'Experience', points: 50, icon: 'pencil' },
  { label: 'Blog', points: 40, icon: 'notebook' },
  { label: 'Review', points: 5, icon: 'message' },
  { label: 'Helpful', points: 3, icon: 'check' },
  { label: 'Blog like', points: 1, icon: 'heart' },
]

function ScorePill({ entry, size = 16 }: { entry: Entry; size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, color: 'var(--accent)' }}>
      {entry.contribution_score.toLocaleString()}
      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 3 }}>pts</span>
    </span>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const tone = TIER_COLOR[tier] || TIER_COLOR.Rookie
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 20,
        background: tone.bg,
        color: tone.color,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.02em',
      }}
    >
      <Icon name="sparkles" size={10} /> {tier}
    </span>
  )
}

export default function ContributorsTab({ user, profile }: { user: any; profile: any }) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'global' | 'campus'>('global')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const campus =
        scope === 'campus' && profile?.campus_id ? `?campus_id=${encodeURIComponent(profile.campus_id)}` : ''
      const res = await fetch(`/api/compete/contributors${campus}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Creator rankings are not available right now.')
        setEntries([])
      } else {
        setEntries((data.entries || []) as Entry[])
      }
    } catch {
      setError('Creator rankings are not available right now.')
      setEntries([])
    }
    setLoading(false)
  }, [scope, profile?.campus_id])

  useEffect(() => {
    load()
  }, [load])

  const myEntry = useMemo(() => entries.find((entry) => entry.user_id === user?.id) || null, [entries, user?.id])
  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)

  return (
    <div>
      {/* Hero */}
      <div
        className="hc-card hc-reveal"
        style={{
          background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
          borderColor: 'var(--accent-border)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              flexShrink: 0,
            }}
          >
            <Icon name="pencil" size={21} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 190 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Creator Arena</p>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Share an interview experience, write a blog, or review someone else&apos;s. Every useful contribution
              earns points and moves you up this ladder.
            </p>
          </div>
          {user && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>
                {myEntry ? `#${myEntry.rank_position}` : '—'}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>your creator rank</p>
            </div>
          )}
        </div>
      </div>

      {/* Scoring formula */}
      <div className="hc-tags" style={{ marginBottom: 14, gap: 6 }}>
        {POINTS.map((point) => (
          <span key={point.label} className="hc-tag hc-tag--ghost" style={{ gap: 4 }}>
            <Icon name={point.icon} size={11} /> {point.label} +{point.points}
          </span>
        ))}
      </div>

      {/* Scope */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Top contributors
        </p>
        <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Contributor ranking scope">
          {(['global', 'campus'] as const).map((value) => {
            if (value === 'campus' && !profile?.campus_id) return null
            return (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                aria-pressed={scope === value}
                className="hc-chip"
                style={{
                  background: scope === value ? 'var(--accent)' : 'var(--bg)',
                  color: scope === value ? 'var(--on-accent)' : 'var(--text-secondary)',
                  borderColor: scope === value ? 'var(--accent)' : 'var(--border)',
                }}
              >
                <Icon name={value === 'global' ? 'globe' : 'school'} size={12} />
                {value === 'global' ? 'Global' : 'My campus'}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="hc-grid hc-grid--list" style={{ gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 66, borderRadius: 12 }} />
          ))}
        </div>
      ) : error ? (
        <div className="hc-empty hc-reveal">
          <div className="hc-empty-ic">
            <Icon name="trophy" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">Rankings are taking a break</p>
          <p className="hc-empty-s">{error} Try again shortly.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="hc-empty hc-reveal">
          <div className="hc-empty-ic">
            <Icon name="pencil" size={30} strokeWidth={1.6} />
          </div>
          <p className="hc-empty-t">No creators ranked yet</p>
          <p className="hc-empty-s">Be the first to share an interview experience or publish a blog.</p>
          <button
            className="hc-btn hc-btn--primary"
            type="button"
            onClick={() => router.push(user ? '/experiences' : '/auth/login?redirect=/experiences')}
          >
            <Icon name="pencil" size={13} /> Share your experience
          </button>
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length >= 3 && (
            <div
              style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 18 }}
            >
              {[1, 0, 2].map((pos) => {
                const entry = top3[pos]
                const heights = [92, 68, 50]
                const h = pos === 0 ? heights[0] : pos === 1 ? heights[1] : heights[2]
                return (
                  <div
                    key={entry.user_id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/profile/${entry.username}`)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && router.push(`/profile/${entry.username}`)}
                    style={{ flex: 1, maxWidth: 150, textAlign: 'center', cursor: 'pointer' }}
                  >
                    <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} size={pos === 0 ? 54 : 42} />
                    <p style={{ margin: '5px 0 1px', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {entry.full_name?.split(' ')[0] || 'Anonymous'}
                    </p>
                    <TierBadge tier={entry.tier} />
                    <p style={{ margin: '4px 0 4px' }}>
                      <ScorePill entry={entry} size={pos === 0 ? 18 : 14} />
                    </p>
                    <div
                      style={{
                        height: h,
                        borderRadius: '9px 9px 0 0',
                        background:
                          pos === 0
                            ? 'linear-gradient(180deg,#fde68a,#fd8f01)'
                            : pos === 1
                              ? 'linear-gradient(180deg,#e5e7eb,#9ca3af)'
                              : 'linear-gradient(180deg,#fed7aa,#f97316)',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* List */}
          <div className="hc-grid hc-grid--list" style={{ gap: 6 }} role="list" aria-label="Contributor leaderboard">
            {rest.map((entry) => {
              const isMe = user?.id === entry.user_id
              return (
                <div
                  key={entry.user_id}
                  role="listitem"
                  className="hc-card hc-card--link"
                  onClick={() => router.push(`/profile/${entry.username}`)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 13px',
                    background: isMe ? 'var(--accent-light)' : 'var(--bg)',
                    borderColor: isMe ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      textAlign: 'center',
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {entry.rank_position}
                  </span>
                  <Avatar name={entry.full_name} avatarUrl={entry.avatar_url} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {entry.full_name || 'Anonymous'}
                      {isMe && <span style={{ color: 'var(--accent)', fontSize: 10, marginLeft: 5 }}>(you)</span>}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      @{entry.username || 'anonymous'}
                      {entry.department ? ` · ${entry.department}` : ''} · {entry.experience_count} exp ·{' '}
                      {entry.blog_count} blog · {entry.review_count} reviews
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <ScorePill entry={entry} size={15} />
                    <p style={{ margin: 0, fontSize: 9.5, color: 'var(--text-muted)' }}>
                      {entry.helpful_received} helpful · {entry.blog_likes_received} likes
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {entries.length > 0 && !myEntry && user && (
            <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12 }}>
              You are not on the board yet — one published experience or blog puts you on it.
            </p>
          )}
        </>
      )}

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
        <button className="hc-btn hc-btn--primary" type="button" onClick={() => router.push('/experiences')}>
          <Icon name="pencil" size={13} /> Share an experience
        </button>
        <button
          className="hc-btn"
          type="button"
          onClick={() => router.push(user ? '/blog/new' : '/auth/login?redirect=/blog/new')}
        >
          <Icon name="notebook" size={13} /> Write a blog
        </button>
        <button className="hc-btn" type="button" onClick={() => router.push('/blog')}>
          <Icon name="message" size={13} /> Review a blog
        </button>
      </div>
    </div>
  )
}
