'use client'

// ═══════════════════════════════════════════════════════════════════════════
// GamePlay — active round: question + timer + answer input + scoreboard
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GameRoom, GamePlayer, MathQuestion } from '@/lib/games/types'
import { GAME_CONFIG } from '@/lib/games/config'
import { timeRemaining, formatCountdown, formatTime } from '@/lib/games/utils'
import LiveScoreboard from './LiveScoreboard'

export default function GamePlay({
  room,
  players,
  myPlayerId,
  onSubmitAnswer,
  onRoundComplete,
}: {
  room: GameRoom
  players: GamePlayer[]
  myPlayerId: string
  onSubmitAnswer: (answer: string, timeMs: number) => Promise<{ correct: boolean; points: number }>
  onRoundComplete: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [lastResult, setLastResult] = useState<{ correct: boolean; points: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [roundAnswered, setRoundAnswered] = useState<Record<string, boolean>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const startTimeRef = useRef<number>(Date.now())
  const question = room.round_question

  // Focus input on mount and new round
  useEffect(() => {
    setAnswer('')
    setSubmitted(false)
    setLastResult(null)
    startTimeRef.current = Date.now()
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [room.current_round])

  // Timer countdown
  useEffect(() => {
    if (!room.round_started_at || !question) return
    const tick = () => {
      const remaining = timeRemaining(room.round_started_at!, question.time_limit_ms)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        // Auto-submit empty answer if not submitted
        if (!submitted) {
          handleSubmit(true)
        }
      }
    }
    tick()
    const interval = setInterval(tick, 50) // 50ms for smooth countdown
    return () => clearInterval(interval)
  }, [room.round_started_at, room.current_round, submitted, question])

  // Watch for other players answering (advance round)
  useEffect(() => {
    if (!room.round_started_at || !question) return
    const remaining = timeRemaining(room.round_started_at, question.time_limit_ms)
    if (remaining <= 0) {
      // Round over — trigger advance after delay
      const timer = setTimeout(onRoundComplete, 500)
      return () => clearTimeout(timer)
    }
  }, [room.round_started_at, room.current_round, question, onRoundComplete])

  const handleSubmit = useCallback(
    async (timedOut = false) => {
      if (submitted) return
      setSubmitted(true)
      const timeMs = Date.now() - startTimeRef.current

      try {
        const result = await onSubmitAnswer(timedOut ? '' : answer, timeMs)
        setLastResult(result)
        setRoundAnswered((prev) => ({ ...prev, [myPlayerId]: true }))
      } catch {
        setLastResult({ correct: false, points: 0 })
      }
    },
    [submitted, answer, myPlayerId, onSubmitAnswer]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitted && answer.trim()) {
      handleSubmit(false)
    }
  }

  const timerPercent = question ? Math.max(0, (timeLeft / question.time_limit_ms) * 100) : 100
  const timerColor = timerPercent > 60 ? 'var(--success)' : timerPercent > 30 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Round + Timer bar */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Round {room.current_round}/{room.total_rounds}
        </span>
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: timerColor,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: '"SF Mono", "JetBrains Mono", monospace',
          }}
        >
          {formatCountdown(timeLeft)}
        </span>
      </div>

      {/* Timer progress */}
      <div
        style={{
          height: 4,
          background: 'var(--bg-tertiary)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${timerPercent}%`,
            background: timerColor,
            borderRadius: 4,
            transition: 'width 50ms linear, background 0.3s ease',
          }}
        />
      </div>

      {/* Question */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 1,
            margin: '0 0 12px',
          }}
        >
          Calculate
        </p>
        <p
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
            lineHeight: 1.2,
          }}
        >
          {question?.text || '...'}
        </p>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            margin: '8px 0 0',
          }}
        >
          =
        </p>
      </div>

      {/* Answer Input */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'stretch',
        }}
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitted}
          placeholder="Your answer"
          autoFocus
          aria-label="Your answer"
          style={{
            flex: 1,
            background: submitted
              ? lastResult?.correct
                ? 'var(--success-light)'
                : 'var(--danger-light)'
              : 'var(--bg)',
            color: submitted ? (lastResult?.correct ? 'var(--success-text)' : 'var(--danger)') : 'var(--text-primary)',
            border: submitted
              ? lastResult?.correct
                ? '2px solid var(--success)'
                : '2px solid var(--danger)'
              : '2px solid var(--border)',
            borderRadius: 14,
            padding: '14px 18px',
            fontSize: 22,
            fontWeight: 700,
            textAlign: 'center',
            fontFamily: '"SF Mono", "JetBrains Mono", monospace',
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
          }}
        />
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitted || !answer.trim()}
          style={{
            background: submitted || !answer.trim() ? 'var(--disabled)' : 'var(--accent)',
            color: submitted || !answer.trim() ? 'var(--text-muted)' : 'var(--on-accent)',
            border: 'none',
            borderRadius: 14,
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: 700,
            cursor: submitted || !answer.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {submitted ? (lastResult?.correct ? '✓' : '✗') : '→'}
        </button>
      </div>

      {/* Result feedback */}
      {submitted && lastResult && (
        <div
          style={{
            background: lastResult.correct ? 'var(--success-light)' : 'var(--danger-light)',
            border: `1px solid ${lastResult.correct ? 'var(--success-border)' : 'var(--danger-border)'}`,
            borderRadius: 12,
            padding: '10px 16px',
            textAlign: 'center',
            animation: 'riseIn 0.2s ease',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: lastResult.correct ? 'var(--success-text)' : 'var(--danger-text)',
            }}
          >
            {lastResult.correct
              ? `✓ Correct! +${lastResult.points} points`
              : `✗ Wrong — the answer was ${room.round_question?.answer}`}
          </span>
        </div>
      )}

      {/* Live Scoreboard */}
      <LiveScoreboard
        players={players}
        currentRound={room.current_round}
        totalRounds={room.total_rounds}
        myPlayerId={myPlayerId}
      />
    </div>
  )
}
