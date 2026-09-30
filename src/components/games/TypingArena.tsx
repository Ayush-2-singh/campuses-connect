'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TypingArena — the typing surface (spec §6/§7/§23)
//
// Desktop-first, keyboard-only interaction. The input is a single visually
// hidden text field that stays focused; the word row renders state:
//   • completed words in green (correct) or red (wrong-attempt)
//   • the active word highlighted with a caret
//   • upcoming words muted
//
// Performance rules honoured here:
//   • the parent's realtime updates do NOT rerender the word row (memoised)
//   • per-keystroke work is O(1) — TypingTracker owns all state
//   • paste is blocked at the input and rejected by the tracker
// ═══════════════════════════════════════════════════════════════════════════

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { TypingTracker } from '@/lib/games/typing'

interface Props {
  words: string[]
  startedAtMs: number
  opponent: { nickname: string; completed: number; total: number } | null
  onWordCompleted: (progress: { completed: number; correct: number; total: number }) => void
  onFinished: (result: { words: string[]; durationMs: number }) => void
  /** Render prop fallback so parents can reach the tracker if needed. */
  trackerRef?: React.MutableRefObject<TypingTracker | null>
}

function ProgressRow({
  label,
  completed,
  total,
  accent,
}: {
  label: string
  completed: number
  total: number
  accent: boolean
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11.5,
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {completed}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${label} progress`}
        style={{ height: 8, borderRadius: 6, background: 'var(--border)', overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 6,
            background: accent ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'width 0.15s ease',
          }}
        />
      </div>
    </div>
  )
}

const WordRow = memo(function WordRow({
  words,
  completed,
  current,
}: {
  words: string[]
  completed: number
  current: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px 18px',
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '18px 16px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        fontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
      }}
    >
      {words.map((w, i) => {
        const done = i < completed
        const active = i === completed
        const correct = done // completed words only advance when they matched
        return (
          <span
            key={`${w}-${i}`}
            style={{
              color: done
                ? correct
                  ? 'var(--success-text)'
                  : 'var(--danger)'
                : active
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)',
              background: active ? 'var(--accent-light)' : 'transparent',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: 4,
              padding: '0 2px',
              whiteSpace: 'nowrap',
            }}
          >
            {active ? (
              <>
                <span style={{ opacity: 0.35 }}>{w.slice(0, current.length)}</span>
                <span style={{ color: 'var(--accent)' }}>{current.slice(w.length)}</span>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: '1em',
                    background: 'var(--accent)',
                    marginLeft: 1,
                    verticalAlign: 'text-bottom',
                  }}
                />
              </>
            ) : (
              w
            )}
          </span>
        )
      })}
    </div>
  )
})

export default function TypingArena({
  words,
  startedAtMs,
  opponent,
  onWordCompleted,
  onFinished,
  trackerRef: externalTrackerRef,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const internalTrackerRef = useRef<TypingTracker | null>(null)
  const trackerRef = externalTrackerRef ?? internalTrackerRef
  const [completed, setCompleted] = useState(0)
  const [current, setCurrent] = useState('')
  const [live, setLive] = useState({ wpm: 0, accuracy: 100 })
  const [elapsed, setElapsed] = useState(0)

  if (!trackerRef.current || trackerRef.current.words !== words) {
    trackerRef.current = new TypingTracker(words, startedAtMs)
  }

  // Auto-focus when the match starts (spec §7) and refocus on any click.
  useEffect(() => {
    inputRef.current?.focus()
    const refocus = () => inputRef.current?.focus()
    window.addEventListener('pointerdown', refocus)
    return () => window.removeEventListener('pointerdown', refocus)
  }, [])

  // Keep-practical navigation guard: leaving mid-match loses the match.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!trackerRef.current?.isFinished) e.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
    // trackerRef is a stable ref; reading .current inside the guard is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One timer tick per 200ms for the clock + live WPM — NOT per keystroke.
  useEffect(() => {
    const t = setInterval(() => {
      const tr = trackerRef.current
      if (!tr) return
      setElapsed(tr.elapsedMs)
      const s = tr.stats
      setLive({ wpm: Math.round(s.wpm), accuracy: Math.round(s.accuracy) })
    }, 200)
    return () => clearInterval(t)
    // trackerRef is stable across renders — see the ref assignment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr) return

      if (e.key === 'Backspace') {
        e.preventDefault()
        tr.handleKey('Backspace')
        setCurrent(tr.currentInput)
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        const completedOne = tr.handleKey(' ')
        setCurrent(tr.currentInput)
        if (completedOne) {
          setCompleted(tr.completedWords)
          onWordCompleted(tr.progressPayload())
        }
        if (tr.isFinished) {
          onFinished({ words, durationMs: tr.elapsedMs })
        }
        return
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        tr.handleKey(e.key)
        setCurrent(tr.currentInput)
      }
    },
    // trackerRef is stable across renders — see the ref assignment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onWordCompleted, onFinished, words]
  )

  const minutes = elapsed / 60000
  const displayWpm = minutes > 0 ? live.wpm : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Progress bars — me vs opponent, realtime */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end' }}>
        <ProgressRow label="YOU" completed={completed} total={words.length} accent />
        {opponent && (
          <ProgressRow
            label={opponent.nickname.toUpperCase()}
            completed={opponent.completed}
            total={opponent.total}
            accent={false}
          />
        )}
      </div>

      {/* Live stats */}
      <div style={{ display: 'flex', gap: 18, fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent-text)', fontVariantNumeric: 'tabular-nums' }}>{displayWpm} WPM</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{live.accuracy}% Accuracy</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          Time: {(elapsed / 1000).toFixed(2)}s
        </span>
      </div>

      <WordRow words={words} completed={completed} current={current} />

      {/* The single input — visually hidden but always focused */}
      <input
        ref={inputRef}
        aria-label="Typing input"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={current}
        onPaste={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onChange={() => {
          /* controlled by keydown — mobile soft keyboards fall back here */
        }}
        onKeyDown={handleKeyDown}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          height: 1,
          width: 1,
        }}
      />

      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        Wrong words don&apos;t advance — fix and retype. Paste is disabled.
      </p>
    </div>
  )
}
