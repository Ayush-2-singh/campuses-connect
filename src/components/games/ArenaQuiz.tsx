'use client'

/**
 * ArenaQuiz — the ONE reusable MCQ engine for the Programming Arena (spec §10).
 * Every topic (Java, Python, DSA, C++, JS, DBMS) renders through this same
 * component with different question data. Practice-only: no DB writes, so no
 * scoring/leaderboard system is touched or faked. A future compiler phase can
 * add a code-judging variant beside this without replacing it.
 */

import { useMemo, useState } from 'react'
import { pickRound, type ArenaTopic } from '@/lib/arena/questions'

const ROUND_SIZE = 5

export default function ArenaQuiz({ topic, onExit }: { topic: ArenaTopic; onExit: () => void }) {
  const [round, setRound] = useState(0)
  const questions = useMemo(() => pickRound(topic, ROUND_SIZE), [topic, round])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)

  const q = questions[idx]

  const choose = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    if (i === q.answer) setScore((s) => s + 1)
  }

  const next = () => {
    if (idx + 1 >= questions.length) {
      setDone(true)
      return
    }
    setIdx((v) => v + 1)
    setPicked(null)
  }

  const restart = () => {
    setRound((r) => r + 1)
    setIdx(0)
    setPicked(null)
    setScore(0)
    setDone(false)
  }

  if (done) {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px' }}>
        <p style={{ fontSize: 40, margin: 0 }}>{pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</p>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 4px' }}>
          {score}/{questions.length} correct
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 18px' }}>
          {pct}% in {topic.title} — practice round complete.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={restart}
            style={{
              minHeight: 44,
              padding: '9px 20px',
              borderRadius: 11,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Play again
          </button>
          <button
            onClick={onExit}
            style={{
              minHeight: 44,
              padding: '9px 20px',
              borderRadius: 11,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Back to Arena
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          {idx + 1}/{questions.length}
        </span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${((idx + (picked !== null ? 1 : 0)) / questions.length) * 100}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>⭐ {score}</span>
      </div>

      {/* Question */}
      <p style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px', lineHeight: 1.4 }}>
        {q.q}
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer
          const isPicked = i === picked
          const reveal = picked !== null
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={reveal}
              style={{
                textAlign: 'left',
                minHeight: 48,
                padding: '10px 14px',
                borderRadius: 11,
                border:
                  reveal && isAnswer
                    ? '1px solid var(--success)'
                    : isPicked
                      ? '1px solid var(--danger)'
                      : '1px solid var(--border)',
                background:
                  reveal && isAnswer ? 'var(--success-light)' : isPicked ? 'var(--danger-light)' : 'var(--bg)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: isPicked ? 700 : 500,
                cursor: reveal ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {picked !== null && (
        <button
          onClick={next}
          style={{
            marginTop: 16,
            width: '100%',
            minHeight: 48,
            borderRadius: 12,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontSize: 14.5,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {idx + 1 >= questions.length ? 'See result' : 'Next question'}
        </button>
      )}
    </div>
  )
}
