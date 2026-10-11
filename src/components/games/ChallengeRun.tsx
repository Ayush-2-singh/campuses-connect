'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ChallengeRun — the "Beat my score" solo run behind a shared link.
//
// This is deliberately NOT a room. The invitee plays alone, locally, over the
// exact same words/questions the challenger played (the seed travels in the
// URL), then sees a comparison and a one-tap "Challenge back". No Supabase, no
// sign-in, no leaderboard — which is what keeps the whole feature cheap and
// what makes a guest's link work.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import TypingArena from './TypingArena'
import type { TypingTracker } from '@/lib/games/typing'
import { DIFFICULTY_CONFIG } from '@/lib/games/config'
import { getSavedNickname } from '@/lib/games/utils'
import {
  challengeQuestions,
  challengeScoreLabel,
  challengeWords,
  compareChallenge,
  decodeChallenge,
  mathPoints,
  shareChallenge,
  typingChallengePayload,
  typingResult,
  type ChallengeOutcome,
  type ChallengePayload,
  type ChallengeQuestion,
} from '@/lib/games/challenge'

/** Per-question clock for a math challenge round. */
const MATH_ROUND_MS = 15_000

const cardStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  boxShadow: 'var(--shadow-sm)',
  padding: '20px',
}

const primaryButton: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--on-accent)',
  border: 'none',
  borderRadius: 12,
  padding: '13px 20px',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/** A malformed/expired link must explain itself, never white-screen. */
function InvalidCard() {
  return (
    <div style={{ ...cardStyle, textAlign: 'center' }}>
      <p style={{ fontSize: 26, margin: '0 0 6px' }}>🤔</p>
      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        This challenge link looks broken
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Ask your friend to send it again — it may have been cut off by the chat app.
      </p>
      <a href="/games" style={{ ...primaryButton, display: 'inline-block', textDecoration: 'none' }}>
        Go to Games
      </a>
    </div>
  )
}

function TypingChallenge({
  words,
  onFinish,
}: {
  words: string[]
  onFinish: (score: number, accuracy: number) => void
}) {
  const startedAt = useRef<number | null>(null)
  if (startedAt.current === null) startedAt.current = Date.now()
  const trackerRef = useRef<TypingTracker | null>(null)

  return (
    <TypingArena
      words={words}
      startedAtMs={startedAt.current}
      meLabel="YOU"
      rivals={[]}
      onWordCompleted={() => {}}
      onFinished={({ correctChars, totalTyped, durationMs }) => {
        const result = typingResult(correctChars, totalTyped, durationMs)
        onFinish(result.wpm, result.accuracy)
      }}
      trackerRef={trackerRef}
    />
  )
}

function MathChallenge({
  questions,
  onFinish,
}: {
  questions: ChallengeQuestion[]
  onFinish: (points: number, correct: number) => void
}) {
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [points, setPoints] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [left, setLeft] = useState(MATH_ROUND_MS)
  const startRef = useRef(Date.now())
  const submittedRef = useRef(false)
  const question = questions[index]

  // Reset the clock for each round.
  useEffect(() => {
    submittedRef.current = false
    startRef.current = Date.now()
    setLeft(MATH_ROUND_MS)
    const timer = setInterval(() => setLeft((ms) => Math.max(0, ms - 250)), 250)
    return () => clearInterval(timer)
  }, [index])

  const submit = useCallback(
    (timedOut = false) => {
      const elapsed = Date.now() - startRef.current
      const value = Number(answer.trim())
      const isCorrect = !timedOut && answer.trim() !== '' && value === question.answer
      const nextPoints = points + mathPoints(isCorrect, elapsed)
      const nextCorrect = correct + (isCorrect ? 1 : 0)

      setPoints(nextPoints)
      setCorrect(nextCorrect)
      setAnswer('')

      if (index + 1 >= questions.length) onFinish(nextPoints, nextCorrect)
      else setIndex(index + 1)
    },
    [answer, correct, index, onFinish, points, question.answer, questions.length]
  )

  // Ran out of time → count the round as missed and move on (once).
  useEffect(() => {
    if (left === 0 && !submittedRef.current) {
      submittedRef.current = true
      submit(true)
    }
  }, [left, submit])

  const pct = Math.round((left / MATH_ROUND_MS) * 100)

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
          Question {index + 1}/{questions.length}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-text)' }}>⚡ {points}</span>
      </div>

      <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct > 40 ? 'var(--accent)' : 'var(--danger)',
            transition: 'width 0.25s linear',
          }}
        />
      </div>

      <p style={{ fontSize: 34, fontWeight: 900, color: 'var(--text-primary)', textAlign: 'center', margin: '10px 0' }}>
        {question.text}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          aria-label="Your answer"
          style={{
            flex: 1,
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 18,
            fontWeight: 700,
            outline: 'none',
            fontFamily: 'inherit',
            color: 'var(--text-primary)',
            background: 'var(--bg)',
          }}
        />
        <button type="submit" style={primaryButton} disabled={!answer.trim()}>
          Go
        </button>
      </form>
    </div>
  )
}

function ChallengePlay({ payload }: { payload: ChallengePayload }) {
  const isTyping = payload.g === 'typing'
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro')
  const [myScore, setMyScore] = useState(0)
  const [mySecondary, setMySecondary] = useState(0)
  const [copied, setCopied] = useState(false)

  const words = useMemo(() => (isTyping ? challengeWords(payload.d) : []), [isTyping, payload.d])
  const questions = useMemo(
    () => (isTyping ? [] : challengeQuestions(payload.d, payload.l)),
    [isTyping, payload.d, payload.l]
  )

  const finish = (score: number, secondary: number) => {
    setMyScore(score)
    setMySecondary(secondary)
    setPhase('done')
  }

  const shareBack = async () => {
    const nickname = getSavedNickname().trim() || 'A student'
    const back = isTyping
      ? typingChallengePayload(nickname, myScore, mySecondary, payload.d)
      : { ...payload, n: nickname, s: myScore, a: mySecondary }
    const ok = await shareChallenge(back)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2200)
  }

  if (phase === 'intro') {
    return (
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <p style={{ fontSize: 30, margin: '0 0 6px' }}>🎯</p>
        <p
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-text)',
            margin: 0,
          }}
        >
          {isTyping ? 'Typing Battle' : 'Quick Math'} challenge
        </p>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '6px 0 2px' }}>
          {payload.n} challenged you
        </p>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
          Beat <strong style={{ color: 'var(--accent-text)' }}>{challengeScoreLabel(payload.g, payload.s)}</strong>
          {typeof payload.a === 'number' && payload.a > 0
            ? isTyping
              ? ` at ${payload.a}% accuracy`
              : ` with ${payload.a} correct`
            : ''}
        </p>

        {!isTyping && payload.l && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
            {DIFFICULTY_CONFIG[payload.l].emoji} {DIFFICULTY_CONFIG[payload.l].label} ·{' '}
            {DIFFICULTY_CONFIG[payload.l].description}
          </p>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          {isTyping ? `${words.length} words` : `${questions.length} questions`} · one attempt · solo — no sign-in
          needed
        </p>

        <button onClick={() => setPhase('run')} style={{ ...primaryButton, width: '100%' }}>
          Start — beat {challengeScoreLabel(payload.g, payload.s)}
        </button>
      </div>
    )
  }

  if (phase === 'run') {
    return isTyping ? (
      <TypingChallenge words={words} onFinish={finish} />
    ) : (
      <MathChallenge questions={questions} onFinish={finish} />
    )
  }

  const outcome: ChallengeOutcome = compareChallenge(myScore, payload.s)
  const headline =
    outcome === 'beat'
      ? `🏆 You beat ${payload.n}!`
      : outcome === 'tied'
        ? `🤝 Dead heat with ${payload.n}`
        : `${payload.n} is still ahead`

  return (
    <div style={{ ...cardStyle, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p
        style={{
          fontSize: 22,
          fontWeight: 900,
          margin: 0,
          color: outcome === 'lost' ? 'var(--danger)' : 'var(--success-text)',
        }}
      >
        {headline}
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
          <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-text)', margin: 0 }}>{myScore}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {isTyping ? `${mySecondary}% acc` : `${mySecondary} correct`}
          </p>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>
            {payload.n.toUpperCase().slice(0, 12)}
          </p>
          <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>{payload.s}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {isTyping ? `${payload.a ?? 0}% acc` : `${payload.a ?? 0} correct`}
          </p>
        </div>
      </div>

      <button
        onClick={shareBack}
        style={{ ...primaryButton, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Icon name="link" size={16} strokeWidth={2.2} />
        {copied ? 'Link copied!' : 'Challenge back'}
      </button>
      <a
        href="/games"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-muted)',
          textDecoration: 'none',
        }}
      >
        Back to Games
      </a>
    </div>
  )
}

export default function ChallengeRun({ encoded }: { encoded: string }) {
  const payload = decodeChallenge(encoded)
  // Reading the clock/random at render is fine: a challenge is one-shot.
  if (!payload) return <InvalidCard />
  return <ChallengePlay key={payload.d} payload={payload} />
}
