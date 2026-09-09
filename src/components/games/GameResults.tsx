'use client'

// ═══════════════════════════════════════════════════════════════════════════
// GameResults — final scoreboard with winner, rankings, actions
// ═══════════════════════════════════════════════════════════════════════════

import type { GamePlayer } from '@/lib/games/types'
import { medal, formatTime } from '@/lib/games/utils'
import PlayerCard from './PlayerCard'

export default function GameResults({
  players,
  myPlayerId,
  onRematch,
  onNewGame,
  onExit,
}: {
  players: GamePlayer[]
  myPlayerId: string
  onRematch: () => void
  onNewGame: () => void
  onExit: () => void
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correct_count - a.correct_count)
  const winner = sorted[0]
  const me = sorted.find((p) => p.player_id === myPlayerId)
  const myRank = me ? sorted.indexOf(me) : -1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Winner Announcement */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
          border: '2px solid var(--accent)',
          borderRadius: 16,
          padding: '28px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 40, margin: '0 0 6px' }}>🏆</p>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent-text)',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            margin: '0 0 6px',
          }}
        >
          Winner
        </p>
        <p
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
          }}
        >
          {winner?.nickname || '—'}
        </p>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--accent-text)',
            margin: 0,
          }}
        >
          ⚡ {winner?.score || 0} points
        </p>
      </div>

      {/* Your result (if not winner) */}
      {me && myRank > 0 && (
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--accent-border)',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>{medal(myRank) || `#${myRank + 1}`}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              You placed {myRank + 1} of {sorted.length}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              ⚡ {me.score} points · {me.correct_count}/{me.total_answered} correct
            </p>
          </div>
        </div>
      )}

      {/* Full Rankings */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Final Rankings</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {sorted.map((player, idx) => (
            <PlayerCard
              key={player.player_id}
              player={player}
              rank={idx}
              isMe={player.player_id === myPlayerId}
              showScore
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onExit}
          style={{
            flex: 1,
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Exit
        </button>
        <button
          onClick={onNewGame}
          style={{
            flex: 1,
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          New Game
        </button>
        <button
          onClick={onRematch}
          style={{
            flex: 1.5,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 12,
            padding: '12px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Play Again
        </button>
      </div>
    </div>
  )
}
