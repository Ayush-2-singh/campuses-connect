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
  onSubmitAnswer: (
    answer: string,
    timeMs: number
  ) => Promise<{ correct: boolean; points: number; correctAnswer?: string | number | null }>
  onRoundComplete: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [lastResult, setLastResult] = useState<{
    correct: boolean
    points: number
    correctAnswer?: string | number | null
  } | null>(null)
  /** Consecutive correct answers — the duel's momentum. */
  const [streak, setStreak] = useState(0)
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
    const interval = setInterval(tick, 100) // 100ms — smooth enough, half the CPU
    return () => clearInterval(interval)
  }, [room.round_started_at, room.current_round, submitted, question])

  // A wrong answer used to stall the round until the server's own timer: every
  // client now asks to advance once the clock runs out. Only the host's call
  // does anything (handleRoundComplete checks), and the correct-answer path is
  // excluded because it already schedules its own advance.
  useEffect(() => {
    if (!question || !submitted || timeLeft > 0) return
    if (lastResult?.correct !== false) return
    const timer = setTimeout(onRoundComplete, 900)
    return () => clearTimeout(timer)
  }, [question, submitted, timeLeft, lastResult, onRoundComplete])

  const handleSubmit = useCallback(
    async (timedOut = false) => {
      if (submitted) return
      setSubmitted(true)
      const timeMs = Date.now() - startTimeRef.current

      try {
        const result = await onSubmitAnswer(timedOut ? '' : answer, timeMs)
        setLastResult(result)
        setStreak((n) => (result.correct ? n + 1 : 0))
        setRoundAnswered((prev) => ({ ...prev, [myPlayerId]: true }))
      } catch {
        setLastResult({ correct: false, points: 0 })
        setStreak(0)
      }
    },
    [submitted, answer, myPlayerId, onSubmitAnswer]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // A number input still accepts 'e', '+', '-' and '.' — none of which is a
    // valid answer to an arithmetic question. Swallow them before they land in
    // the box, so nobody loses a round to "2e3".
    if (['e', 'E', '+', '-', '.', ','].includes(e.key)) {
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' && !submitted && answer.trim()) {
      handleSubmit(false)
    }
  }

  const timerPercent = question ? Math.max(0, (timeLeft / question.time_limit_ms) * 100) : 100
  const timerColor = timerPercent > 60 ? 'var(--success)' : timerPercent > 30 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Round indicator */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '10px 16px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Round {room.current_round}/{room.total_rounds}
        </span>
      </div>

      {/* Clock + streak — the two things a duel is actually about. The timer
          was computed before but never rendered, so a round simply ended. */}
      {question && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12.5,
              fontWeight: 700,
              marginBottom: 5,
            }}
          >
            <span style={{ color: timerColor, fontVariantNumeric: 'tabular-nums' }}>
              {Math.max(0, Math.ceil(timeLeft / 1000))}s
            </span>
            <span
              aria-live="polite"
              style={{
                color: streak >= 2 ? 'var(--accent-text)' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {streak >= 2 ? `🔥 ${streak} in a row` : streak === 1 ? '1 in a row' : '—'}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Time left this round"
            aria-valuenow={Math.round(timerPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: 6, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}
          >
            <div
              style={{
                width: `${timerPercent}%`,
                height: '100%',
                borderRadius: 6,
                background: timerColor,
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>
      )}

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
              : lastResult.correctAnswer !== undefined && lastResult.correctAnswer !== null
                ? `✗ Wrong — answer was ${lastResult.correctAnswer}`
                : '✗ Wrong!'}
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
