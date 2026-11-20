'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isPlaced, placementRemaining, rankTier } from '@/lib/rating'
import { Icon } from '@/components/icons'

/**
 * ScoreHeader — the two competitive metrics of the Compete section.
 *
 *   ⭐ Rating → competitive skill   (per season, per skill)
 *   📈 XP     → progress            (persistent)
 *
 * Aura (daily momentum) and Karma (contribution) are deliberately not shown
 * here: neither is part of the match-based Compete score, so surfacing them
 * next to the rating read as if they moved the leaderboard. They remain on a
 * profile and on the global leaderboard.
 *
 * Everything degrades quietly: if the summary RPC is unavailable (migration not
 * applied yet) the header simply renders nothing rather than throwing.
 */

type Summary = {
  xp: number
  dsa_rating: number
  games: number
}

export default function ScoreHeader({ userId }: { userId?: string | null }) {
  const supabase = createClient()
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase.rpc('my_score_summary').then(({ data, error }) => {
      if (cancelled || error) return
      const row = Array.isArray(data) ? data[0] : data
      if (row) setSummary(row as Summary)
    })
    return () => {
      cancelled = true
    }
  }, [userId, supabase])

  if (!userId || !summary) return null

  const rating = Number(summary.dsa_rating ?? 1200)
  const tier = rankTier(rating)
  const placed = isPlaced(summary.games ?? 0)

  const tile = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 12px',
    minWidth: 0,
  } as const
  const value = { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 } as const
  const label = { fontSize: 10.5, color: 'var(--text-muted)', margin: 0 } as const

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 16,
      }}
      role="group"
      aria-label="Your rating and XP"
    >
      <div style={tile}>
        <p style={{ ...value, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', color: 'var(--yellow-text)' }} aria-hidden="true">
            <Icon name="star" size={15} strokeWidth={2.2} filled />
          </span>
          {placed ? rating : '—'}
          {placed && (
            <span style={{ display: 'inline-flex', color: 'var(--accent)', marginLeft: 2 }} title={tier.label}>
              <Icon name={tier.icon} size={14} strokeWidth={2.2} />
            </span>
          )}
        </p>
        <p style={label}>
          {placed ? `Rating · ${tier.label}` : `Placement · ${placementRemaining(summary.games ?? 0)} to go`}
        </p>
      </div>

      <div style={tile}>
        <p style={{ ...value, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', color: 'var(--success-text)' }} aria-hidden="true">
            <Icon name="trending-up" size={15} strokeWidth={2.2} />
          </span>
          {(summary.xp ?? 0).toLocaleString()}
        </p>
        <p style={label}>XP · progress</p>
      </div>
    </div>
  )
}
