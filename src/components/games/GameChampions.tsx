'use client'

// ═══════════════════════════════════════════════════════════════════════════
// GameChampions — winners of every game, ranked by wins (+1 per win).
// Reads game_winners via get_game_winners() and updates live via Realtime
// when a game finishes.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WinnerRow = {
  winner_id: string
  winner_nickname: string
  wins: number
  last_won_at: string
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null)

export default function GameChampions({ limit = 10 }: { limit?: number }) {
  const supabase = createClient()
  const [winners, setWinners] = useState<WinnerRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data, error } = await supabase.rpc('get_game_winners', { p_limit: limit })
    if (!error && data) setWinners(data as WinnerRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Live update: a finished game inserts a game_winners row → refresh.
    const channel = supabase
      .channel('game-champions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_winners' }, () => {
        load()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, limit])

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--accent-border)',
        borderRadius: 16,
        padding: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🏆
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Game Champions</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Winners of every game · +1 per win</p>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
          Loading champions…
        </p>
      ) : winners.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', margin: 0 }}>
          No games finished yet — play Quick Math to crown the first champion! 🏆
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {winners.map((w, idx) => (
            <div
              key={w.winner_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: idx === 0 ? 'var(--accent-light)' : 'var(--bg)',
                border: idx === 0 ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 14px',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: idx < 3 ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: idx < 3 ? 'var(--on-accent)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {medal(idx) || idx + 1}
              </div>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {(w.winner_nickname || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.winner_nickname}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
                  {w.wins} {w.wins === 1 ? 'win' : 'wins'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
