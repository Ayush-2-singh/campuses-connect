'use client'

// ═══════════════════════════════════════════════════════════════════════════
// CodeSprintSolo — the single-player 60-second code sprint.
//
//   loading → ready → running → result
//
// Text comes from `code_sprint_text()` (server-seeded: today's code for
// everyone, or a challenge link's seed). Typing reuses the battle's
// TypingTracker, so wrong words do not advance, paste is blocked and accuracy
// is per keystroke. The clock is the only new rule: when 60 seconds are up the
// run is submitted to `submit_code_sprint()`, which re-validates every word and
// derives the WPM itself.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TypingTracker, diffInput } from '@/lib/games/typing'
import { CODE_SPRINT_MIN_MS, CODE_SPRINT_MS, consistency, sprintClock, sprintStats } from '@/lib/games/codeSprint'
import { getGuestId, getSavedNickname, saveNickname } from '@/lib/games/utils'
import { shareChallenge, typingChallengePayload } from '@/lib/games/challenge'
import SprintText from './SprintText'

type Phase = 'loading' | 'ready' | 'running' | 'result'

type TextPayload = { ok: boolean; seed: string; text: string; snippets: number }

type Result = {
  net: number
  raw: number
  accuracy: number
  consistency: number
  chars: number
  rank: number | null
  rejected?: string
}

type BoardRow = { nickname: string; net_wpm: number; accuracy: number; is_me: boolean }

export default function CodeSprintSolo() {
  const supabase = useMemo(() => createClient(), [])
  const guestId = useRef(getGuestId()).current

  const [phase, setPhase] = useState<Phase>('loading')
  const [payload, setPayload] = useState<TextPayload | null>(null)
  const [nickname, setNickname] = useState(getSavedNickname())
  const [error, setError] = useState('')

  const [completed, setCompleted] = useState(0)
  const [current, setCurrent] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState({ net: 0, accuracy: 100 })
  const [result, setResult] = useState<Result | null>(null)
  const [board, setBoard] = useState<BoardRow[]>([])
  const [shared, setShared] = useState(false)

  const trackerRef = useRef<TypingTracker | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const samplesRef = useRef<number[]>([])
  const finishingRef = useRef(false)

  const words = useMemo(() => (payload?.text ? payload.text.split(' ') : []), [payload])

  const loadText = useCallback(async () => {
    setPhase('loading')
    setError('')
    try {
      const { data, error: e } = await supabase.rpc('code_sprint_text', {})
      const p = data as TextPayload | null
      if (e || !p?.ok || !p.text) {
        setError('Could not load today’s code — try again.')
        setPhase('ready')
        return
      }
      setPayload(p)
      setPhase('ready')
    } catch {
      setError('Could not load today’s code — try again.')
      setPhase('ready')
    }
  }, [supabase])

  const loadBoard = useCallback(async () => {
    const { data } = await supabase.rpc('code_sprint_board', { p_limit: 10 })
    const rows = (data as { rows?: BoardRow[] } | null)?.rows
    if (rows) setBoard(rows)
  }, [supabase])

  useEffect(() => {
    void loadText()
    void loadBoard()
  }, [loadText, loadBoard])

  const start = () => {
    if (!payload) return
    const name = nickname.trim()
    if (!name) {
      setError('Enter a nickname first.')
      return
    }
    saveNickname(name)
    setError('')
    setResult(null)
    setCompleted(0)
    setCurrent('')
    setElapsed(0)
    setLive({ net: 0, accuracy: 100 })
    samplesRef.current = []
    finishingRef.current = false
    trackerRef.current = new TypingTracker(words, Date.now())
    setPhase('running')
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  const finish = useCallback(async () => {
    const tr = trackerRef.current
    if (!tr || finishingRef.current) return
    finishingRef.current = true

    const typedWords = tr.submission
    const stats = tr.stats
    const durationMs = Math.max(tr.elapsedMs, 1)
    const local = sprintStats(stats.correctChars, stats.totalTyped, durationMs)
    const stable = consistency(samplesRef.current)

    if (typedWords.length === 0 || durationMs < CODE_SPRINT_MIN_MS) {
      setResult({
        net: Math.round(local.net),
        raw: Math.round(local.raw),
        accuracy: Math.round(local.accuracy),
        consistency: stable,
        chars: stats.correctChars,
        rank: null,
        rejected: 'Too short to count — type at least a few words before the clock ends.',
      })
      setPhase('result')
      return
    }

    const { data, error: e } = await supabase.rpc('submit_code_sprint', {
      p_player_key: guestId,
      p_nickname: nickname.trim() || 'student',
      p_seed: payload?.seed ?? null,
      p_words: typedWords,
      p_correct_chars: stats.correctChars,
      p_typed_chars: stats.totalTyped,
      p_duration_ms: Math.round(durationMs),
    })

    if (e) {
      setResult({
        net: Math.round(local.net),
        raw: Math.round(local.raw),
        accuracy: Math.round(local.accuracy),
        consistency: stable,
        chars: stats.correctChars,
        rank: null,
        rejected: e.message.includes('impossible')
          ? 'The server rejected that run as impossible.'
          : 'Could not submit this run — it will not appear on the board.',
      })
      setPhase('result')
      return
    }

    const r = data as { net_wpm: number; raw_wpm: number; accuracy: number; correct_chars: number; rank: number }
    setResult({
      net: Math.round(Number(r.net_wpm) || local.net),
      raw: Math.round(Number(r.raw_wpm) || local.raw),
      accuracy: Math.round(Number(r.accuracy) || local.accuracy),
      consistency: stable,
      chars: Number(r.correct_chars) || stats.correctChars,
      rank: Number(r.rank) || null,
    })
    setPhase('result')
    void loadBoard()
  }, [supabase, guestId, nickname, payload?.seed, loadBoard])

  // Clock: one interval for the countdown, live stats and the per-second sample.
  useEffect(() => {
    if (phase !== 'running') return
    const tick = setInterval(() => {
      const tr = trackerRef.current
      if (!tr) return
      const ms = tr.elapsedMs
      setElapsed(ms)
      const s = tr.stats
      setLive({ net: Math.round(s.wpm), accuracy: Math.round(s.accuracy) })
      samplesRef.current.push(s.wpm)
      if (ms >= CODE_SPRINT_MS) void finish()
    }, 1000)
    return () => clearInterval(tick)
  }, [phase, finish])

  const applyKey = useCallback(
    (key: string) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished || finishingRef.current) return
      if (tr.handleKey(key)) setCompleted(tr.completedWords)
      if (tr.isFinished) void finish()
    },
    [finish]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      if (e.nativeEvent.isComposing || e.key === 'Unidentified') return
      if (e.key === 'Backspace') {
        e.preventDefault()
        applyKey('Backspace')
        setCurrent(tr.currentInput)
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        applyKey(' ')
        setCurrent(tr.currentInput)
        return
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        applyKey(e.key)
        setCurrent(tr.currentInput)
      }
    },
    [applyKey]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      const prev = tr.currentInput
      const keys = diffInput(prev, e.target.value)
      if (!keys) {
        setCurrent(prev)
        return
      }
      for (const key of keys) {
        applyKey(key)
        if (tr.isFinished) break
      }
      setCurrent(tr.currentInput)
    },
    [applyKey]
  )

  const restart = () => {
    trackerRef.current = null
    finishingRef.current = false
    setPhase('ready')
    setResult(null)
    setCompleted(0)
    setCurrent('')
    setElapsed(0)
    void loadText()
  }

  const shareMyScore = async () => {
    if (!result?.net || result.rejected) return
    const ok = await shareChallenge(typingChallengePayload(nickname.trim() || 'A student', result.net, result.accuracy))
    setShared(ok)
    if (ok) setTimeout(() => setShared(false), 2200)
  }

  const remaining = Math.max(0, CODE_SPRINT_MS - elapsed)
  const pct = Math.min(100, Math.round((elapsed / CODE_SPRINT_MS) * 100))

  if (phase === 'loading') {
    return (
      <div style={{ display: 'grid', gap: 8 }} aria-label="Loading code sprint">
        <div className="skeleton" style={{ height: 120, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 40, borderRadius: 12 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {phase === 'ready' && (
        <>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                margin: '0 0 6px',
              }}
            >
              CODE SPRINT · 60 SECONDS · SOLO
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.55 }}>
              Type as much real code as you can in one minute. Same snippets for everyone today; wrong words do not
              advance and paste is disabled. Scored on net WPM (correct characters only), with raw WPM and accuracy next
              to it.
            </p>
            <div
              style={{
                fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary, var(--bg))',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                maxHeight: 96,
                overflow: 'hidden',
              }}
            >
              {payload?.text.slice(0, 220) ?? 'No code loaded.'}…
            </div>
          </div>

          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Your nickname"
            aria-label="Your nickname"
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: 'var(--bg)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />

          <button
            onClick={start}
            disabled={!payload?.text || !nickname.trim()}
            style={{
              background: !payload?.text || !nickname.trim() ? 'var(--disabled)' : 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 12,
              padding: 13,
              fontSize: 14,
              fontWeight: 800,
              cursor: !payload?.text || !nickname.trim() ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            START 60-SECOND SPRINT
          </button>

          {error && (
            <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
              {error}
            </p>
          )}
        </>
      )}

      {phase === 'running' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ color: 'var(--accent-text)', fontVariantNumeric: 'tabular-nums' }}>{live.net} WPM</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{live.accuracy}% Accuracy</span>
            <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{sprintClock(remaining)}</span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Sprint time used"
            style={{ height: 6, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: remaining <= 10_000 ? 'var(--danger)' : 'var(--accent)',
                transition: 'width 1s linear',
              }}
            />
          </div>

          <SprintText words={words} completed={completed} current={current} />

          <input
            ref={inputRef}
            aria-label="Code sprint input"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={current}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 1, width: 1 }}
          />

          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            Wrong words don&apos;t advance — fix and retype. Paste is disabled.
          </p>
        </>
      )}

      {phase === 'result' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                margin: '0 0 4px',
              }}
            >
              SPRINT RESULT
            </p>
            <p style={{ fontSize: 34, fontWeight: 900, color: 'var(--accent)', margin: 0, lineHeight: 1.1 }}>
              {result.net} <span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 700 }}>net WPM</span>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
              {result.raw} raw WPM · {result.accuracy}% accuracy · {result.chars} correct chars · {result.consistency}%
              consistency
              {result.rank ? ` · Rank #${result.rank} today` : ''}
            </p>
            {result.rejected && (
              <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--danger)', margin: '10px 0 0' }}>
                {result.rejected}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={shareMyScore}
              disabled={!!result.rejected}
              style={{
                flex: 1,
                background: 'var(--accent-light)',
                color: 'var(--accent-text)',
                border: '1px solid var(--accent-border, var(--accent))',
                borderRadius: 12,
                padding: 12,
                fontSize: 13.5,
                fontWeight: 800,
                cursor: result.rejected ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {shared ? '✓ Link copied!' : '🎯 Beat my score'}
            </button>
            <button
              onClick={restart}
              style={{
                flex: 1,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 12,
                padding: 12,
                fontSize: 13.5,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              SPRINT AGAIN
            </button>
          </div>
        </div>
      )}

      {board.length > 0 && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            TODAY&rsquo;S CODE SPRINT
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {board.map((r, i) => (
              <div
                key={`${r.nickname}-${i}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12.5,
                  fontWeight: r.is_me ? 800 : 600,
                  color: r.is_me ? 'var(--accent-text)' : 'var(--text-primary)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {r.nickname}
                  {r.is_me ? ' (you)' : ''}
                </span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {Number(r.net_wpm)} WPM · {Number(r.accuracy)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
