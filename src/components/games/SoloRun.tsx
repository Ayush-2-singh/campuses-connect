'use client'

// ═══════════════════════════════════════════════════════════════════════════
// SoloRun — Quick Math against a bot, with no room and no second player.
//
// The multiplayer room needs `MIN_PLAYERS: 2`, which means the game is dead to
// anyone who opens it alone. This is the missing first step: a seeded, local
// run against a bot that answers at a human pace, so the first game is always
// available and a new player learns the loop before risking a real duel.
//
// Nothing here touches Supabase — it is the same seeded generator the
// challenge link uses, so a solo score can be shared as a challenge afterwards.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DIFFICULTY_CONFIG, GAME_CONFIG } from '@/lib/games/config'
import { challengeQuestions, mathPoints, shareChallenge, mathChallengePayload } from '@/lib/games/challenge'
import { getSavedNickname } from '@/lib/games/utils'
import type { Difficulty } from '@/lib/games/types'

/**
 * How the bot plays. Accuracy is deliberately beatable-but-not-free: an
 * opponent that never misses is a wall, and one that never scores is a
 * tutorial with extra steps.
 */
const BOT: Record<Difficulty, { accuracy: number; minMs: number; maxMs: number }> = {
  easy: { accuracy: 0.5, minMs: 3600, maxMs: 7200 },
  medium: { accuracy: 0.68, minMs: 2800, maxMs: 6200 },
  hard: { accuracy: 0.8, minMs: 2200, maxMs: 5000 },
}

const REVEAL_MS = 700

const card: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  boxShadow: 'var(--shadow-sm)',
  padding: 20,
}

const primary: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--on-accent)',
  border: 'none',
  borderRadius: 12,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondary: React.CSSProperties = {
  background: 'var(--bg)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/** One bot answer: whether it lands, and how long it took. */
function botTurn(difficulty: Difficulty) {
  const cfg = BOT[difficulty]
  const ms = cfg.minMs + Math.floor(Math.random() * (cfg.maxMs - cfg.minMs))
  return { correct: Math.random() < cfg.accuracy, ms }
}

export default function SoloRun({
  difficulty,
  rounds,
  nickname,
  onExit,
}: {
  difficulty: Difficulty
  rounds: number
  nickname?: string
  onExit: () => void
}) {
  // A fresh seed per run: the same questions for the player and the bot, and a
  // run that can be replayed identically when it is shared as a challenge.
  const [seed] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
    return Math.random().toString(36).slice(2, 10)
  })

  const questions = useMemo(() => challengeQuestions(seed, difficulty, rounds), [seed, difficulty, rounds])

  const timeLimit = GAME_CONFIG.ROUND_DURATION[difficulty]

  const [index, setIndex] = useState(0)
  const [myScore, setMyScore] = useState(0)
  const [botScore, setBotScore] = useState(0)
  const [answer, setAnswer] = useState('')
  const [left, setLeft] = useState<number>(timeLimit)
  const [last, setLast] = useState<{ mine: boolean; bot: boolean } | null>(null)
  const [done, setDone] = useState(false)
  const [shared, setShared] = useState<'idle' | 'ok' | 'fail'>('idle')
  /** Correct answers this run — the score alone cannot recover it (bonus varies). */
  const [roundCorrect, setRoundCorrect] = useState(0)

  const lockedRef = useRef(false)
  const startRef = useRef(Date.now())
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const question = questions[index]

  // New round: reset the clock and the answer box.
  useEffect(() => {
    if (done) return
    lockedRef.current = false
    startRef.current = Date.now()
    setLeft(timeLimit)
    setAnswer('')
    setLast(null)

    const timer = setInterval(() => {
      const remaining = Math.max(0, timeLimit - (Date.now() - startRef.current))
      setLeft(remaining)
    }, 100)
    return () => clearInterval(timer)
  }, [index, done, timeLimit])

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current)
    },
    []
  )

  const finishRound = useCallback(
    (timedOut: boolean) => {
      if (lockedRef.current || done) return
      lockedRef.current = true

      const elapsed = Math.min(Date.now() - startRef.current, timeLimit + 2000)
      const guess = Number(answer.trim())
      const mine = !timedOut && answer.trim() !== '' && guess === question.answer

      const bot = botTurn(difficulty)
      const botMs = Math.min(bot.ms, timeLimit)

      setMyScore((s) => s + mathPoints(mine, elapsed))
      setBotScore((s) => s + (bot.correct ? mathPoints(true, botMs) : 0))
      setLast({ mine, bot: bot.correct })

      advanceRef.current = setTimeout(() => {
        if (index + 1 >= questions.length) setDone(true)
        else setIndex((i) => i + 1)
      }, REVEAL_MS)
    },
    [answer, difficulty, done, index, question.answer, questions.length, timeLimit]
  )

  // Clock ran out — count the round as missed, once.
  useEffect(() => {
    if (done || left > 0 || lockedRef.current) return
    finishRound(true)
  }, [left, done, finishRound])

  const share = async () => {
    const name = (nickname || getSavedNickname()).trim() || 'A student'
    const ok = await shareChallenge(mathChallengePayload(name, myScore, roundCorrect, difficulty, seed))
    setShared(ok ? 'ok' : 'fail')
    if (ok) setTimeout(() => setShared('idle'), 2200)
  }

  useEffect(() => {
    if (!last) return
    if (last.mine) setRoundCorrect((n) => n + 1)
  }, [last])

  if (done) {
    const won = myScore > botScore
    const tied = myScore === botScore
    return (
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
        <p style={{ fontSize: 34, margin: 0 }}>{won ? '🏆' : tied ? '🤝' : '🤖'}</p>
        <p
          style={{
            fontSize: 21,
            fontWeight: 900,
            margin: 0,
            color: won ? 'var(--success-text)' : tied ? 'var(--text-primary)' : 'var(--danger)',
          }}
        >
          {won ? 'You beat the bot' : tied ? 'Dead heat' : 'The bot edged you'}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            padding: '14px 10px',
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>YOU</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent-text)', margin: 0 }}>{myScore}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {roundCorrect}/{questions.length} correct
            </p>
          </div>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>BOT</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{botScore}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {BOT[difficulty].accuracy * 100}% shooter
            </p>
          </div>
        </div>

        <button onClick={share} style={primary}>
          {shared === 'ok' ? 'Link copied!' : shared === 'fail' ? 'Could not copy' : '🎯 Challenge a friend'}
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onExit} style={{ ...secondary, flex: 1 }}>
            Done
          </button>
          <button
            onClick={() => {
              setIndex(0)
              setMyScore(0)
              setBotScore(0)
              setRoundCorrect(0)
              setDone(false)
            }}
            style={{ ...primary, flex: 1 }}
          >
            🔄 Again
          </button>
        </div>
      </div>
    )
  }

  const pct = Math.round((left / timeLimit) * 100)
  const cfg = DIFFICULTY_CONFIG[difficulty]

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          {cfg.emoji} {cfg.label} · {index + 1}/{questions.length}
        </span>
        <span
          style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
        >
          <span style={{ color: 'var(--accent-text)' }}>⚡ {myScore}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>vs</span>
          🤖 {botScore}
        </span>
      </div>

      <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct > 40 ? 'var(--accent)' : 'var(--danger)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      <p
        style={{
          fontSize: 40,
          fontWeight: 900,
          color: 'var(--text-primary)',
          textAlign: 'center',
          margin: '12px 0',
          fontFamily: '"SF Mono", "JetBrains Mono", monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {question.text}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          finishRound(false)
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            // A number input still accepts these, and none of them is an answer.
            if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
          }}
          placeholder="Your answer"
          aria-label="Your answer"
          style={{
            flex: 1,
            minWidth: 0,
            border: '2px solid var(--border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 20,
            fontWeight: 800,
            textAlign: 'center',
            outline: 'none',
            fontFamily: '"SF Mono", "JetBrains Mono", monospace',
            color: 'var(--text-primary)',
            background: 'var(--bg)',
          }}
        />
        <button type="submit" style={primary} disabled={!answer.trim()}>
          →
        </button>
      </form>

      {last && (
        <p
          aria-live="polite"
          style={{
            fontSize: 13,
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            color: last.mine ? 'var(--success-text)' : 'var(--danger)',
          }}
        >
          {last.mine ? '✓ correct' : `✗ answer was ${question.answer}`}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · bot {last.bot ? 'got it' : 'missed'}</span>
        </p>
      )}

      <button onClick={onExit} style={{ ...secondary, fontSize: 13, padding: '9px 14px' }}>
        Quit to lobby
      </button>
    </div>
  )
}
