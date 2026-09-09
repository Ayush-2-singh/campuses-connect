'use client'

// ═══════════════════════════════════════════════════════════════════════════
// LiveScoreboard — real-time leaderboard during active game
// ═══════════════════════════════════════════════════════════════════════════

import type { GamePlayer } from '@/lib/games/types'
import { medal, formatTime } from '@/lib/games/utils'

export default function LiveScoreboard({
  players,
  currentRound,
  totalRounds,
  myPlayerId,
}: {
  players: GamePlayer[]
  currentRound: number
  totalRounds: number
  myPlayerId: string
}) {
  // Sort by score descending, then by correct_count
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correct_count - a.correct_count)

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>🏆 Live Scoreboard</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent-text)',
            background: 'var(--accent-light)',
            padding: '2px 10px',
            borderRadius: 20,
          }}
        >
          Round {currentRound}/{totalRounds}
        </span>
      </div>

      {/* Players */}
      <div style={{ padding: '6px 0' }}>
        {sorted.map((player, idx) => {
          const isMe = player.player_id === myPlayerId
          return (
            <div
              key={player.player_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                background: isMe ? 'var(--accent-light)' : 'transparent',
                transition: 'background 0.2s ease',
              }}
            >
              {/* Rank */}
              <span style={{ fontSize: 14, width: 24, textAlign: 'center', flexShrink: 0 }}>
                {medal(idx) || (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</span>
                )}
              </span>

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isMe ? 700 : 500,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {player.nickname}
                </span>
                {!player.is_connected && (
                  <span style={{ fontSize: 10, color: 'var(--danger)', marginLeft: 6 }}>⚠️</span>
                )}
              </div>

              {/* Score */}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--accent-text)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                  minWidth: 40,
                  textAlign: 'right',
                }}
              >
                {player.score}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
