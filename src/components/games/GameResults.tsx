'use client'

// ═══════════════════════════════════════════════════════════════════════════
// GameResults — final podium, winner announcement, exit only
// ═══════════════════════════════════════════════════════════════════════════

import type { GamePlayer } from '@/lib/games/types'
import { medal } from '@/lib/games/utils'

export default function GameResults({
  players,
  myPlayerId,
  onExit,
}: {
  players: GamePlayer[]
  myPlayerId: string
  onExit: () => void
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correct_count - a.correct_count)
  const winner = sorted[0]
  const me = sorted.find((p) => p.player_id === myPlayerId)
  const myRank = me ? sorted.indexOf(me) : -1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Winner Announcement */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent-light), var(--bg))',
          border: '2px solid var(--accent)',
          borderRadius: 20,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 48, margin: '0 0 8px' }}>🏆</p>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent-text)',
            textTransform: 'uppercase',
            letterSpacing: 2,
            margin: '0 0 6px',
          }}
        >
          Winner
        </p>
        <p
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 4px',
          }}
        >
          {winner?.nickname || '—'}
        </p>
        <p
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--accent-text)',
            margin: 0,
          }}
        >
          ⚡ {winner?.score || 0} points
        </p>
      </div>

      {/* Podium — Top 3 */}
      {sorted.length >= 3 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 8,
            padding: '0 8px',
          }}
        >
          {[1, 0, 2].map((pos) => {
            const p = sorted[pos]
            const h = pos === 0 ? 80 : pos === 1 ? 60 : 44
            const grad =
              pos === 0
                ? 'linear-gradient(180deg, #fde68a, #f59e0b)'
                : pos === 1
                  ? 'linear-gradient(180deg, #d1d5db, #9ca3af)'
                  : 'linear-gradient(180deg, #fed7aa, #ea580c)'
            return (
              <div key={p.player_id} style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    width: pos === 0 ? 56 : 48,
                    height: pos === 0 ? 56 : 48,
                    borderRadius: '50%',
                    background: pos === 0 ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: pos === 0 ? 'var(--on-accent)' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: pos === 0 ? 22 : 18,
                    fontWeight: 800,
                    margin: '0 auto 4px',
                    border: pos === 0 ? '3px solid var(--accent)' : 'none',
                  }}
                >
                  {p.nickname.charAt(0).toUpperCase()}
                </div>
                <p style={{ fontSize: pos === 0 ? 28 : 20, margin: '2px 0' }}>{medal(pos)}</p>
                <p
                  style={{
                    fontSize: pos === 0 ? 14 : 12,
                    fontWeight: pos === 0 ? 700 : 600,
                    color: 'var(--text-primary)',
                    margin: '0 0 2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.nickname?.split(' ')[0] || 'Anon'}
                </p>
                <p
                  style={{
                    fontSize: pos === 0 ? 16 : 14,
                    fontWeight: 800,
                    color: 'var(--accent-text)',
                    margin: '2px 0 0',
                  }}
                >
                  ⚡ {p.score}
                </p>
                <div
                  style={{
                    height: h,
                    background: grad,
                    borderRadius: '8px 8px 0 0',
                    marginTop: 6,
                  }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Your Result */}
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
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
          Final Rankings
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
          {sorted.map((player, idx) => {
            const isMe = player.player_id === myPlayerId
            return (
              <div
                key={player.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: isMe ? 'var(--accent-light)' : 'var(--bg)',
                  border: isMe ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '10px 14px',
                }}
                role="listitem"
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
                    background: player.is_host ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: player.is_host ? 'var(--on-accent)' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: isMe ? 700 : 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {player.nickname}
                    {isMe && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6, fontWeight: 700 }}>
                        (you)
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-text)', margin: 0 }}>
                    ⚡ {player.score}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                    {player.correct_count}/{player.total_answered}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Exit only — no rematch */}
      <button
        onClick={onExit}
        style={{
          width: '100%',
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          border: 'none',
          borderRadius: 14,
          padding: '14px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Exit
      </button>
    </div>
  )
}
