'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isPlaced, placementRemaining, rankTier } from '@/lib/rating'

/**
 * ScoreHeader — the four metrics, each in its own tile, never merged.
 *
 *   🏆 Karma  → contribution            (lifetime)
 *   📈 XP     → progress                (persistent)
 *   ✨ Aura   → competitive momentum    (TODAY only)
 *   ⭐ Rating → competitive skill       (per season, per skill)
 *
 * Aura is read from `my_score_summary`, which already returns 0 when the stored
 * `aura_date` is not today — the lazy reset happens server-side, so this
 * component never needs to know about days.
 *
 * Everything degrades quietly: if the summary RPC is unavailable (migration not
 * applied yet) the header simply renders nothing rather than throwing.
 */

type Summary = {
  karma: number
  xp: number
  aura_today: number
  aura_date: string
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
      aria-label="Your scores"
    >
      <div style={tile}>
        <p style={value}>
          ⭐ {placed ? rating : '—'}
          {placed && <span style={{ fontSize: 12, marginLeft: 6 }}>{tier.icon}</span>}
        </p>
        <p style={label}>
          {placed ? `Rating · ${tier.label}` : `Placement · ${placementRemaining(summary.games ?? 0)} to go`}
        </p>
      </div>

      <div style={tile}>
        <p style={value}>✨ {summary.aura_today ?? 0}</p>
        <p style={label}>Aura · today</p>
      </div>

      <div style={tile}>
        <p style={value}>📈 {(summary.xp ?? 0).toLocaleString()}</p>
        <p style={label}>XP · progress</p>
      </div>

      <div style={tile}>
        <p style={value}>🏆 {(summary.karma ?? 0).toLocaleString()}</p>
        <p style={label}>Karma · contribution</p>
      </div>
    </div>
  )
}
