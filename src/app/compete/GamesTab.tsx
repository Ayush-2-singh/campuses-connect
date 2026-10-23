'use client'

/**
 * GamesTab — the games that used to live on `/games`, played inside Compete.
 *
 * The `/games` routes are retired (archived under src/_archive) but the engines
 * were never removed: `TypingBattle` and `QuickMath` are the same components the
 * in-call games panel mounts. This tab gives them a home again without
 * resurrecting the old routes — deep links and room codes are handled by the
 * components themselves once mounted.
 *
 * Both engines accept guests (a nickname, no account), so this tab has no auth
 * gate of its own.
 */

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Icon } from '@/components/icons'

const TypingBattle = dynamic(() => import('@/components/games/TypingBattle'), { ssr: false })
const QuickMath = dynamic(() => import('@/components/games/QuickMath'), { ssr: false })

type GameKey = 'typing' | 'math'

const GAMES: {
  key: GameKey
  title: string
  desc: string
  icon: string
  chips: string[]
}[] = [
  {
    key: 'typing',
    title: 'Typing Battle',
    desc: 'Same words, fastest fingers win. Race up to 8 students, or share a room code with your batch.',
    icon: 'type',
    chips: ['Quick match', 'Room code', 'Daily challenge'],
  },
  {
    key: 'math',
    title: 'Quick Math',
    desc: 'Solve faster, beat the clock. Pick a difficulty, then duel a classmate round by round.',
    icon: 'zap',
    chips: ['Easy', 'Medium', 'Hard'],
  },
]

export default function GamesTab() {
  const [game, setGame] = useState<GameKey | null>(null)
  const [roomCode, setRoomCode] = useState('')
  // The code a game was MOUNTED with: the engines read it once, at mount, so
  // changing the input afterwards must not silently remount a live room.
  const [mountCode, setMountCode] = useState('')

  const start = (key: GameKey, code = '') => {
    setMountCode(code)
    setGame(key)
  }

  const back = () => {
    setGame(null)
    setMountCode('')
  }

  if (game) {
    const meta = GAMES.find((g) => g.key === game)!
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 2px' }}>
              {mountCode ? `Room ${mountCode}` : 'Solo / new room'}
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{meta.title}</h3>
          </div>
          <button
            onClick={back}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ← All games
          </button>
        </div>

        {game === 'typing' ? <TypingBattle initialRoomCode={mountCode} /> : <QuickMath initialRoomCode={mountCode} />}
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Play with your batch
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Two quick games, no account needed. Share a room code to play together.
        </p>
      </div>

      {/* Room code — applies to whichever game you start next. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg)',
          border: '1px dashed var(--border-strong, var(--border))',
          borderRadius: 12,
          padding: '8px 10px',
          marginBottom: 14,
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--accent-text)', flexShrink: 0 }} aria-hidden="true">
          <Icon name="link" size={16} strokeWidth={2.2} />
        </span>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Have a room code? Type 6 digits, then pick a game"
          aria-label="Game room code"
          inputMode="numeric"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
          }}
        />
        {roomCode && (
          <button
            onClick={() => setRoomCode('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {GAMES.map((g) => (
          <div
            key={g.key}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={g.icon} size={21} />
            </div>
            <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{g.title}</h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>{g.desc}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {g.chips.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '2px 9px',
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
              <button
                onClick={() => start(g.key)}
                style={{
                  flex: 1,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Play
              </button>
              <button
                onClick={() => start(g.key, roomCode)}
                disabled={roomCode.length !== 6}
                style={{
                  flex: 1,
                  background: 'var(--bg)',
                  color: roomCode.length === 6 ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '11px 14px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: roomCode.length === 6 ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                }}
              >
                Join room
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
