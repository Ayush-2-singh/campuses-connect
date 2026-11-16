'use client'

/**
 * CompeteRating — the match-derived rating for one profile.
 *
 * Reads `match_rating`, the same source the Compete leaderboard ranks, so the
 * number here is always the total on the board: one finished match is worth
 * 100 × mode × (0.6 × accuracy + 0.4 × 1/place). Profile counters (karma,
 * aura, GitHub, LeetCode) are deliberately not shown in this card.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type ModeStat = { points: number; wins: number; played: number }

export type MatchRating = {
  points: number
  wins: number
  played: number
  accuracy: number
  rank: number | null
  live: ModeStat
  typing: ModeStat
  maths: ModeStat
}

const MODES: { key: 'live' | 'typing' | 'maths'; label: string; short: string }[] = [
  { key: 'live', label: 'Live battle quiz', short: 'Live' },
  { key: 'typing', label: 'Typing battle', short: 'Typing' },
  { key: 'maths', label: 'Quick maths', short: 'Maths' },
]

export default function CompeteRating({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [rating, setRating] = useState<MatchRating | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { data } = await supabase.rpc('match_rating', { p_user_id: userId })
        if (cancelled) return
        setRating((data as MatchRating | null) ?? null)
      } catch {
        if (!cancelled) setRating(null)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  if (loading)
    return <div className="skeleton" style={{ height: 132, borderRadius: 16 }} aria-label="Loading Compete rating" />

  return (
    <section
      aria-label="Compete rating"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Compete rating</h2>
        <span style={{ flex: 1 }} />
        <Link
          href="/compete?tab=rankings"
          style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          Leaderboard →
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--accent-text)' }}>
          {(rating?.points ?? 0).toLocaleString()}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>points</span>
        {rating?.rank ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent-text)',
              background: 'var(--accent-light)',
              border: '1px solid var(--accent-border)',
              borderRadius: 20,
              padding: '2px 9px',
            }}
          >
            Rank #{rating.rank}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {rating?.played
            ? `${rating.wins}W · ${rating.played} played · ${rating.accuracy}% accuracy`
            : 'No finished matches yet'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {MODES.map((m) => {
          const stat = rating?.[m.key]
          return (
            <div
              key={m.key}
              title={m.label}
              style={{
                background: 'var(--bg-secondary, var(--bg))',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '8px 10px',
              }}
            >
              <p style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{m.short}</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-text)', margin: 0, lineHeight: 1.3 }}>
                {(stat?.points ?? 0).toLocaleString()}
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                {stat?.wins ?? 0} {stat?.wins === 1 ? 'win' : 'wins'}
              </p>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>
        Finished matches only — 100 × mode × (0.6 × accuracy + 0.4 × 1/place).
      </p>
    </section>
  )
}
