'use client'

// ═══════════════════════════════════════════════════════════════════════════
// GameLobby — waiting room before game starts
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { GameRoom, GamePlayer } from '@/lib/games/types'
import { DIFFICULTY_CONFIG, GAME_CONFIG } from '@/lib/games/config'
import RoomCode from './RoomCode'
import PlayerCard from './PlayerCard'

export default function GameLobby({
  room,
  players,
  myPlayerId,
  onReady,
  onStart,
  onLeave,
}: {
  room: GameRoom
  players: GamePlayer[]
  myPlayerId: string
  onReady: () => void
  onStart: () => void
  onLeave: () => void
}) {
  const [starting, setStarting] = useState(false)
  const me = players.find((p) => p.player_id === myPlayerId)
  const isHost = me?.is_host ?? false
  const allReady = players.every((p) => p.is_ready)
  const canStart = isHost && players.length >= GAME_CONFIG.MIN_PLAYERS && allReady
  const diff = DIFFICULTY_CONFIG[room.difficulty]

  const handleStart = async () => {
    setStarting(true)
    try {
      await onStart()
    } finally {
      setStarting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Room Code */}
      <RoomCode code={room.room_code} playerCount={players.length} maxPlayers={room.max_players} />

      {/* Game Info */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: diff.color,
            background: diff.bg,
            padding: '4px 12px',
            borderRadius: 20,
          }}
        >
          {diff.emoji} {diff.label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            background: 'var(--bg-tertiary)',
            padding: '4px 12px',
            borderRadius: 20,
          }}
        >
          🎯 {room.total_rounds} rounds
        </span>
      </div>

      {/* Players */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Players ({players.length}/{room.max_players})
          </span>
          {allReady && players.length >= GAME_CONFIG.MIN_PLAYERS && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--success-text)',
                background: 'var(--success-light)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              ✓ Everyone ready
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {players.map((player) => (
            <PlayerCard key={player.player_id} player={player} isMe={player.player_id === myPlayerId} />
          ))}
        </div>
      </div>

      {/* Waiting message */}
      {!allReady && (
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          Waiting for all players to be ready...
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onLeave}
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
          Leave
        </button>
        {!isHost && (
          <button
            onClick={onReady}
            style={{
              flex: 2,
              background: me?.is_ready ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: me?.is_ready ? 'var(--text-secondary)' : 'var(--on-accent)',
              border: me?.is_ready ? '1px solid var(--border)' : 'none',
              borderRadius: 12,
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {me?.is_ready ? '✓ Ready — Waiting...' : 'Ready'}
          </button>
        )}
        {isHost && (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            style={{
              flex: 2,
              background: canStart && !starting ? 'var(--accent)' : 'var(--disabled)',
              color: canStart && !starting ? 'var(--on-accent)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: 12,
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              cursor: canStart && !starting ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {starting ? 'Starting...' : `Start Game (${players.length}/${GAME_CONFIG.MIN_PLAYERS}+ needed)`}
          </button>
        )}
      </div>
    </div>
  )
}
