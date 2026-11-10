'use client'

// ═══════════════════════════════════════════════════════════════════════════
// DailyMath — today's Quick Math set, the same for every player.
//
// The room game needs a code and a second person, so it gives nobody a reason
// to open the app tomorrow. This does: ten questions derived from the UTC day,
// one attempt to beat your own best, and a board that is per campus when you
// have one and global always.
//
// The questions come from the same seeded generator the challenge link uses,
// so the set is reproducible and identical across devices — no server round
// trip to fetch it, and the server only ever sees the final score.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GAME_CONFIG } from '@/lib/games/config'
import { challengeQuestions, mathPoints, shareChallenge, mathChallengePayload } from '@/lib/games/challenge'
import { getGuestId, getSavedNickname } from '@/lib/games/utils'

/** Fixed for the daily: everyone answers the same difficulty and length. */
const DAILY_DIFFICULTY = 'medium' as const
const DAILY_ROUNDS = GAME_CONFIG.TOTAL_ROUNDS
const ROUND_MS = GAME_CONFIG.ROUND_DURATION.medium

/** UTC day — the same value the server's CURRENT_DATE uses. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

type BoardRow = {
  nickname: string
  points: number
  correct_count: number
  total_questions: number
  difficulty: string
  is_me: boolean
}

type SubmitResult = { best_points: number; rank: number; has_campus: boolean }

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
  padding: '11px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

export default function DailyMath() {
  const supabase = useMemo(() => createClient(), [])
  const day = today()
  const questions = useMemo(() => challengeQuestions(`${day}:daily`, DAILY_DIFFICULTY, DAILY_ROUNDS), [day])

  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro')
  const [index, setIndex] = useState(0)
  const [points, setPoints] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [answer, setAnswer] = useState('')
  const [left, setLeft] = useState<number>(ROUND_MS)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [scope, setScope] = useState<'campus' | 'global'>('campus')
  const [board, setBoard] = useState<BoardRow[]>([])
  const [boardScope, setBoardScope] = useState<'campus' | 'global'>('global')
  const [boardLoading, setBoardLoading] = useState(true)

  const lockedRef = useRef(false)
  const startRef = useRef(Date.now())
  const startedAtRef = useRef(Date.now())
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const question = questions[index]

  const loadBoard = useCallback(
    async (s: 'campus' | 'global') => {
      setBoardLoading(true)
      const { data, error: rpcError } = await supabase.rpc('quick_math_daily_board', { p_scope: s, p_limit: 25 })
      if (!rpcError && data) {
        const payload = data as { scope: 'campus' | 'global'; has_campus: boolean; rows: BoardRow[] }
        // A caller with no campus gets an empty campus board — show the global
        // one instead of an empty state that looks like nobody played.
        if (s === 'campus' && !payload.has_campus) {
          setScope('global')
          setBoardScope('global')
          await loadBoard('global')
          return
        }
        setBoard(payload.rows || [])
        setBoardScope(payload.scope)
      }
      setBoardLoading(false)
    },
    [supabase]
  )

  useEffect(() => {
    loadBoard('campus')
  }, [loadBoard])

  // Round clock.
  useEffect(() => {
    if (phase !== 'run') return
    lockedRef.current = false
    startRef.current = Date.now()
    setLeft(ROUND_MS)
    setAnswer('')

    const timer = setInterval(() => {
      setLeft(Math.max(0, ROUND_MS - (Date.now() - startRef.current)))
    }, 100)
    return () => clearInterval(timer)
  }, [phase, index])

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current)
    },
    []
  )

  const submitRun = useCallback(
    async (finalPoints: number, finalCorrect: number) => {
      setSaving(true)
      setError('')
      const { data, error: rpcError } = await supabase.rpc('submit_quick_math_daily', {
        p_player_key: getGuestId() || 'anon',
        p_nickname: getSavedNickname().trim() || 'Anon',
        p_points: finalPoints,
        p_correct: finalCorrect,
        p_total: DAILY_ROUNDS,
        p_duration_ms: Date.now() - startedAtRef.current,
        p_difficulty: DAILY_DIFFICULTY,
      })
      setSaving(false)
      if (rpcError) {
        setError('Score could not be saved — the board may not be updated yet.')
        return
      }
      setResult(data as SubmitResult)
      loadBoard(scope)
    },
    [loadBoard, scope, supabase]
  )

  const finishRound = useCallback(
    (timedOut: boolean) => {
      if (lockedRef.current || phase !== 'run') return
      lockedRef.current = true

      const elapsed = Math.min(Date.now() - startRef.current, ROUND_MS)
      const guess = Number(answer.trim())
      const isCorrect = !timedOut && answer.trim() !== '' && guess === question.answer

      const nextPoints = points + mathPoints(isCorrect, elapsed)
      const nextCorrect = correct + (isCorrect ? 1 : 0)

      setPoints(nextPoints)
      setCorrect(nextCorrect)

      advanceRef.current = setTimeout(() => {
        if (index + 1 >= questions.length) {
          setPhase('done')
          submitRun(nextPoints, nextCorrect)
        } else {
          setIndex((i) => i + 1)
        }
      }, 550)
    },
    [answer, correct, index, phase, points, question.answer, questions.length, submitRun]
  )

  useEffect(() => {
    if (phase !== 'run' || left > 0 || lockedRef.current) return
    finishRound(true)
  }, [left, phase, finishRound])

  // ── Intro ────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-text)', margin: '0 0 4px' }}>
            {new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            })}
          </p>
          <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Today&rsquo;s Quick Math
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
            {DAILY_ROUNDS} questions, {Math.round(ROUND_MS / 1000)} seconds each — the same set for everyone who plays
            today. Your best run of the day is the one that counts.
          </p>

          <button
            onClick={() => {
              startedAtRef.current = Date.now()
              setIndex(0)
              setPoints(0)
              setCorrect(0)
              setResult(null)
              setError('')
              setPhase('run')
            }}
            style={{ ...primary, width: '100%' }}
          >
            Start today&rsquo;s set
          </button>
        </div>

        <Board
          rows={board}
          scope={boardScope}
          loading={boardLoading}
          onScope={(s) => {
            setScope(s)
            loadBoard(s)
          }}
        />
      </div>
    )
  }

  // ── Run ──────────────────────────────────────────────────────────────────
  if (phase === 'run') {
    const pct = Math.round((left / ROUND_MS) * 100)
    return (
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  const slug = `${correct}/${DAILY_ROUNDS} correct`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px' }}>
          TODAY&rsquo;S RUN
        </p>
        <p style={{ fontSize: 34, fontWeight: 900, color: 'var(--accent-text)', margin: '0 0 2px' }}>⚡ {points}</p>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>{slug}</p>

        {saving && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Saving your run…</p>}
        {result && (
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Rank #{result.rank} today · best {result.best_points}
          </p>
        )}
        {error && <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: '6px 0 0' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => setPhase('intro')} style={{ ...secondary, flex: 1 }}>
            Board
          </button>
          <button
            onClick={async () => {
              const name = getSavedNickname().trim() || 'A student'
              await shareChallenge(mathChallengePayload(name, points, correct, DAILY_DIFFICULTY, `${day}:daily`))
            }}
            style={{ ...primary, flex: 1 }}
          >
            🎯 Challenge a friend
          </button>
        </div>
      </div>

      <Board
        rows={board}
        scope={boardScope}
        loading={boardLoading}
        onScope={(s) => {
          setScope(s)
          loadBoard(s)
        }}
      />
    </div>
  )
}

function Board({
  rows,
  scope,
  loading,
  onScope,
}: {
  rows: BoardRow[]
  scope: 'campus' | 'global'
  loading: boolean
  onScope: (s: 'campus' | 'global') => void
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {scope === 'campus' ? 'Your campus today' : 'Everyone today'}
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['campus', 'global'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScope(s)}
              style={{
                background: scope === s ? 'var(--accent-light)' : 'transparent',
                color: scope === s ? 'var(--accent-text)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 8,
                padding: '5px 9px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {s === 'campus' ? 'Campus' : 'Global'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 10 }} />
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Nobody has finished today&rsquo;s set yet — be the first name here.
        </p>
      ) : (
        <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => (
            <div
              key={`${r.nickname}-${i}`}
              role="listitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: r.is_me ? 'var(--accent-light)' : 'var(--bg-secondary)',
                border: r.is_me ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <span
                style={{
                  width: 22,
                  fontSize: 12,
                  fontWeight: 800,
                  color: i < 3 ? 'var(--accent-text)' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: r.is_me ? 800 : 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.nickname}
                {r.is_me && <span style={{ fontSize: 10, color: 'var(--accent-text)', marginLeft: 6 }}>(you)</span>}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {r.correct_count}/{r.total_questions}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: 'var(--accent-text)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 42,
                  textAlign: 'right',
                }}
              >
                {r.points}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
