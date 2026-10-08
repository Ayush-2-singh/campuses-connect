'use client'

/**
 * CALL GAMES — the "talk and play together" surface of a live voice call.
 *
 * Rendered INSIDE the call shell (the LiveKit room never unmounts, so the
 * conversation keeps flowing while the game runs), it offers the two games
 * the app already ships — Typing Battle and Quick Math — and mounts the
 * chosen one directly in the panel. The room code the creator gets is pushed
 * back up through `onRoomReady`, and the call page broadcasts it over the
 * LiveKit data channel so every other person on the call can join the same
 * room without leaving the conversation.
 *
 * Both games are dynamic imports: nothing game-related should land in the
 * call's first paint, and `ssr: false` keeps their window/localStorage reads
 * off the server.
 */

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@/components/icons'

const TypingBattle = dynamic(() => import('@/components/games/TypingBattle'), { ssr: false })
const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })

export type CallGame = 'typing' | 'math'

/** What travels over the data channel when someone starts a game. */
export interface CallGameInvite {
  game: CallGame
  code: string
  /** Human display name of the starter (LiveKit participant name). */
  from?: string
}

export const CALL_GAME_LABELS: Record<CallGame, string> = {
  typing: 'Typing Battle',
  math: 'Quick Math',
}

const GAME_PICKS: {
  game: CallGame
  icon: string
  title: string
  blurb: string
}[] = [
  {
    game: 'typing',
    icon: 'type',
    title: 'Typing Battle',
    blurb: 'Same words, fastest fingers win.',
  },
  {
    game: 'math',
    icon: 'zap',
    title: 'Quick Math',
    blurb: 'Solve fast, beat the clock.',
  },
]

const ROUND = 'var(--border)' // same border the rest of the call uses

/** A person currently connected to the voice call (LiveKit identity + name). */
export interface CallParticipant {
  id: string
  name: string
}

/** One row of game_players as the game reports it. */
interface RosterPlayer {
  playerId: string
  nickname: string
  userId: string | null
}

/**
 * Primary key is game_players.user_id against the LiveKit identity (the call
 * token sets identity = auth user id). Guests carry no user_id, so they fall
 * back to an exact nickname === display-name match — deliberately strict:
 * a wrong tick would claim somebody is playing when they are not.
 */
function isMatchingSeat(seat: RosterPlayer, person: CallParticipant): boolean {
  if (seat.userId) return seat.userId === person.id
  return !!seat.nickname && seat.nickname === person.name
}

export default function CallGamePanel({
  game,
  roomCode,
  participantCount,
  participants,
  onPick,
  onRoomReady,
  onClose,
}: {
  /** null → the picker; a game key → that game's own lobby, running here. */
  game: CallGame | null
  /** Code handed to the game on mount so a recipient lands in the room. */
  roomCode?: string
  participantCount: number
  /** Everyone on the call — used to say who among them actually joined. */
  participants: CallParticipant[]
  onPick: (game: CallGame) => void
  /** The embedded game created a room — the call page must broadcast it. */
  onRoomReady: (game: CallGame, code: string) => void
  onClose: () => void
}) {
  // Live seat list of the room the mounted game is sitting in.
  const [roster, setRoster] = useState<RosterPlayer[]>([])

  // Identity compare keeps the child's effect from ever re-firing on renders
  // where nothing about the room actually changed.
  const handleRoster = useCallback((next: RosterPlayer[]) => {
    setRoster((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])

  /**
   * Is this person on the call actually sitting in the room?
   *
   * Primary key is game_players.user_id against the LiveKit identity (the
   * token sets identity = auth user id). Guests have no user_id, so they fall
   * back to an exact nickname === display-name match — deliberately strict:
   * a wrong tick would claim somebody is playing when they are not.
   */
  const isPlaying = (person: CallParticipant) => roster.some((seat) => isMatchingSeat(seat, person))

  const playingCount = participants.filter(isPlaying).length
  const offCallCount = roster.filter((seat) => !participants.some((person) => isMatchingSeat(seat, person))).length

  return (
    <section
      data-accent="gold"
      aria-label="Games"
      style={{
        background: 'var(--bg)',
        border: `1px solid ${ROUND}`,
        borderRadius: 16,
        padding: '14px 16px 20px',
        marginBottom: 14,
        animation: 'ccCardUp 0.15s ease',
      }}
    >
      {/* ── Panel header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="gamepad" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {game ? CALL_GAME_LABELS[game] : 'Play together'}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '1px 0 0' }}>
            Voice stays live · {participantCount} in call
            {game && roster.length > 0 ? ` · ${roster.length} in the room` : ''}
            {game && roster.length > 0 && participants.length > 0
              ? ` · ${playingCount} of them on this call playing`
              : ''}
            {game && roster.length === 0 ? ' · waiting for a room' : ''}
            {!game ? ' · pick a game, everyone on the call can join' : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close games and go back to the call"
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: '50%',
            border: `1px solid ${ROUND}`,
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={17} />
        </button>
      </div>

      {/* ── Who on the call is actually in the room ── */}
      {game && (
        <div
          aria-label="Call participants in this game"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}
        >
          {participants.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Nobody else is on the call right now.
            </span>
          )}

          {participants.map((person) => {
            const playing = isPlaying(person)
            return (
              <span
                key={person.id}
                title={
                  playing ? `${person.name} joined the room` : `${person.name} is on the call but not in the room yet`
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '6px 11px',
                  borderRadius: 999,
                  border: `1px solid ${playing ? 'var(--success, #22c55e)' : ROUND}`,
                  background: playing ? 'var(--success-light, var(--bg-secondary))' : 'var(--bg)',
                  color: playing ? 'var(--success-text, var(--text-primary))' : 'var(--text-muted)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: playing ? 'var(--success, #22c55e)' : 'var(--border-strong, var(--border))',
                    flexShrink: 0,
                  }}
                />
                {person.name}
              </span>
            )
          })}

          {/* People in the room who are not on this call (joined by code). */}
          {offCallCount > 0 && (
            <span
              title="Joined with the room code but are not on this call"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 11px',
                borderRadius: 999,
                border: `1px dashed ${ROUND}`,
                color: 'var(--text-muted)',
              }}
            >
              +{offCallCount} joined by code
            </span>
          )}
        </div>
      )}

      {/* ── Picker ── */}
      {!game && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {GAME_PICKS.map((pick) => (
            <button
              key={pick.game}
              onClick={() => onPick(pick.game)}
              style={{
                textAlign: 'left',
                background: 'var(--bg-secondary, var(--bg))',
                border: `1px solid ${ROUND}`,
                borderRadius: 14,
                padding: '16px 16px 14px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: 'var(--accent-light)',
                  color: 'var(--accent-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={pick.icon} size={19} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{pick.title}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{pick.blurb}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent-text)',
                  marginTop: 2,
                }}
              >
                Start it for the call →
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── The game itself, running inside the call ── */}
      {game && (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          {game === 'typing' ? (
            <TypingBattle
              key={`typing-${roomCode ?? 'new'}`}
              initialRoomCode={roomCode}
              onRoomReady={(code) => onRoomReady('typing', code)}
              onRoster={handleRoster}
            />
          ) : (
            <QuickMath
              key={`math-${roomCode ?? 'new'}`}
              initialRoomCode={roomCode}
              onRoomReady={(code) => onRoomReady('math', code)}
              onRoster={handleRoster}
            />
          )}
        </div>
      )}

      {/* Quiet reminder that the call is still running behind the panel. */}
      <p
        style={{
          fontSize: 11.5,
          color: 'var(--text-muted)',
          margin: '14px 0 0',
          textAlign: 'center',
        }}
      >
        Your mic is still connected — keep talking while you play.
      </p>
    </section>
  )
}
