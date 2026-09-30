'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TypingBoards — Campus Typing Rank (spec §16) + Daily Challenge (spec §17).
// Best WPM first, extensible via the RPC's p_sort; the daily board shows
// today's deterministic challenge with the player's rank.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface BoardRow {
  player_id: string
  nickname: string
  best_wpm: number
  best_accuracy: number
  games_played: number
  wins: number
}

export default function TypingBoards({ myPlayerId }: { myPlayerId: string | null }) {
  const supabase = createClient()
  const [board, setBoard] = useState<BoardRow[]>([])
  const [daily, setDaily] = useState<{
    top: { nickname: string; wpm: number }[]
    me: { wpm: number; accuracy: number } | null
    attempts: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const [boardRes, dailyRes] = await Promise.all([
        supabase.rpc('get_typing_leaderboard', { p_limit: 10, p_sort: 'best_wpm' }),
        supabase.rpc('get_typing_daily', { p_player_id: myPlayerId }),
      ])
      if (boardRes.data) setBoard(boardRes.data as BoardRow[])
      if (dailyRes.data) {
        const d = dailyRes.data as any
        setDaily({ top: d.top ?? [], me: d.me ?? null, attempts: Number(d.attempts ?? 0) })
      }
      setLoading(false)
    })()
  }, [supabase, myPlayerId])

  if (loading) return null
  if (board.length === 0 && (daily?.attempts ?? 0) === 0) return null

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null)
  const myIndex = myPlayerId ? board.findIndex((b) => b.player_id === myPlayerId) : -1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Daily challenge board */}
      {daily && daily.attempts > 0 && (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 16,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            📅 DAILY TYPING CHALLENGE
          </p>
          {daily.me && (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Your score: <strong style={{ color: 'var(--accent-text)' }}>{Number(daily.me.wpm)} WPM</strong> ·{' '}
              {Number(daily.me.accuracy)}% accuracy
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {daily.top.slice(0, 5).map((t, i) => (
              <div
                key={`${t.nickname}-${i}`}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {medal(i) ?? `${i + 1}.`} {t.nickname}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {Number(t.wpm)} WPM
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Career typing rank */}
      {board.length > 0 && (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: 16,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            ⌨️ CAMPUS TYPING RANK
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {board.map((b, i) => (
              <div
                key={b.player_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12.5,
                  padding: b.player_id === myPlayerId ? '4px 8px' : 0,
                  background: b.player_id === myPlayerId ? 'var(--accent-light)' : 'transparent',
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {medal(i) ?? `${i + 1}.`} {b.nickname}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {Number(b.best_wpm)} WPM
                </span>
              </div>
            ))}
          </div>
          {myPlayerId && myIndex < 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
              Play a match to enter the rank.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
