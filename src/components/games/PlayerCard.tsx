'use client'

// ═══════════════════════════════════════════════════════════════════════════
// PlayerCard — compact player display for lobby and scoreboard
// ═══════════════════════════════════════════════════════════════════════════

import type { GamePlayer } from '@/lib/games/types'

export default function PlayerCard({
  player,
  rank,
  isMe,
  showScore,
  compact,
}: {
  player: GamePlayer
  rank?: number
  isMe?: boolean
  showScore?: boolean
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 12,
        background: isMe ? 'var(--accent-light)' : 'var(--bg)',
        border: isMe ? '2px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: compact ? 10 : 12,
        padding: compact ? '8px 12px' : '10px 14px',
      }}
      role="listitem"
    >
      {/* Rank or position indicator */}
      {rank !== undefined && (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: rank < 3 ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: rank < 3 ? 'var(--on-accent)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : rank + 1}
        </div>
      )}

      {/* Avatar circle */}
      <div
        style={{
          width: compact ? 32 : 38,
          height: compact ? 32 : 38,
          borderRadius: '50%',
          background: player.is_host ? 'var(--accent)' : 'var(--bg-tertiary)',
          color: player.is_host ? 'var(--on-accent)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: compact ? 13 : 15,
          fontWeight: 700,
          flexShrink: 0,
          border: player.is_connected ? 'none' : '2px solid var(--danger)',
          opacity: player.is_connected ? 1 : 0.5,
        }}
      >
        {player.nickname.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: compact ? 12.5 : 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {player.nickname}
          </span>
          {player.is_host && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--on-accent)',
                background: 'var(--accent)',
                padding: '1px 6px',
                borderRadius: 8,
              }}
            >
              HOST
            </span>
          )}
          {isMe && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>(you)</span>}
        </div>
        {!player.is_connected && <span style={{ fontSize: 10, color: 'var(--danger)' }}>Disconnected</span>}
      </div>

      {/* Ready / Score */}
      {showScore ? (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>{player.score}</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
            {player.correct_count}/{player.total_answered}
          </p>
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: player.is_ready ? 'var(--success-text)' : 'var(--text-muted)',
            background: player.is_ready ? 'var(--success-light)' : 'var(--bg-tertiary)',
            padding: '3px 10px',
            borderRadius: 20,
            flexShrink: 0,
          }}
        >
          {player.is_ready ? '✓ Ready' : 'Waiting'}
        </div>
      )}
    </div>
  )
}
