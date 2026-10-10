'use client'

// ═══════════════════════════════════════════════════════════════════════════
// TypingArena — the typing surface (spec §6/§7/§23)
//
// Works on desktop AND phones: hardware keyboards come in through keydown,
// while mobile soft keyboards (which only expose characters as an input-value
// change) come in through onChange and are replayed onto the tracker. The
// input is a single visually hidden text field that stays focused; the word
// row renders state:
//   • completed words in green (correct) or red (wrong-attempt)
//   • the active word highlighted with a caret
//   • upcoming words muted
//
// Performance rules honoured here:
//   • the parent's realtime updates do NOT rerender the word row (memoised)
//   • per-keystroke work is O(1) — TypingTracker owns all state
//   • paste is blocked at the input and rejected by the tracker
// ═══════════════════════════════════════════════════════════════════════════

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TypingTracker, diffInput } from '@/lib/games/typing'

/** One racing player's live progress, as pushed by the parent's realtime feed. */
export interface RivalProgress {
  playerId: string
  nickname: string
  completed: number
  total: number
}

interface Props {
  words: string[]
  startedAtMs: number
  /** Display name for the local player's row. */
  meLabel: string
  /** Every other player in the race — up to seven of them. */
  rivals: RivalProgress[]
  onWordCompleted: (progress: { completed: number; correct: number; total: number }) => void
  onFinished: (result: { words: string[]; durationMs: number; correctChars: number; totalTyped: number }) => void
  /** Render prop fallback so parents can reach the tracker if needed. */
  trackerRef?: React.MutableRefObject<TypingTracker | null>
}

/** One racer's live row: name, completed/total count and a progress bar. */
function RacerRow({
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
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 11.5,
          fontWeight: 700,
          color: accent ? 'var(--accent-text)' : 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
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

/**
 * ActiveWord — per-character feedback for the word being typed.
 *
 * Correct characters glow green, mistakes glow red (and stay visible even
 * after the player types past the word's length), the remaining target
 * characters stay muted, and a caret marks the cursor. This is the standard
 * typing-test affordance and replaces the old rendering that drew the *typed*
 * slice from the *target* word — which hid wrong characters entirely.
 */
function ActiveWord({ target, typed }: { target: string; typed: string }) {
  const caretAt = Math.min(typed.length, target.length)
  const total = Math.max(target.length, typed.length)
  const parts: React.ReactNode[] = []

  for (let i = 0; i <= total; i++) {
    if (i === caretAt) {
      parts.push(
        <span
          key="caret"
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
      )
    }
    if (i === total) break

    const expected = target[i]
    const actual = typed[i]
    const isTyped = i < typed.length
    const ok = isTyped && actual === expected
    parts.push(
      <span
        key={i}
        style={{
          color: isTyped ? (ok ? 'var(--success-text)' : 'var(--danger)') : 'var(--text-muted)',
          background: isTyped && !ok ? 'var(--danger-light, transparent)' : 'transparent',
          borderRadius: 3,
        }}
      >
        {isTyped ? actual : expected}
      </span>
    )
  }

  return <>{parts}</>
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
            {active ? <ActiveWord target={w} typed={current} /> : w}
          </span>
        )
      })}
    </div>
  )
})

export default function TypingArena({
  words,
  startedAtMs,
  meLabel,
  rivals,
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

  // Auto-focus when the match starts (spec §7) and refocus on any tap.
  //
  // MOBILE: `focus()` on an element that is ALREADY the activeElement is a
  // no-op, so a phone whose soft keyboard was dismissed (system back gesture,
  // rotating, tapping away) stayed focused-but-unusable — tapping the screen
  // could never bring the keyboard back. Blur first, then focus, inside the
  // same gesture so the keyboard is allowed to reopen.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    const refocus = () => {
      const input = inputRef.current
      if (!input) return
      // Only cycle focus when the keyboard is actually gone — otherwise every
      // tap mid-match would flicker the keyboard closed and open again.
      const kbOpen = window.visualViewport ? window.visualViewport.height < window.innerHeight - 120 : false
      if (document.activeElement === input && !kbOpen) input.blur()
      input.focus({ preventScroll: true })
    }
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

  /**
   * applyKey — feed ONE key into the tracker and publish the side effects.
   * Shared by both input paths (hardware keydown + soft-keyboard onChange) so
   * word-completion broadcast and the final submit happen exactly once.
   */
  const applyKey = useCallback(
    (key: string) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      const completedOne = tr.handleKey(key)
      if (completedOne) {
        setCompleted(tr.completedWords)
        onWordCompleted(tr.progressPayload())
      }
      if (tr.isFinished) {
        // Submit what the player actually typed (the tracker's validated
        // sequence) plus honest character counts, never the target list — the
        // server re-checks each word and clamps the counts.
        const s = tr.stats
        onFinished({
          words: tr.submission,
          durationMs: tr.elapsedMs,
          correctChars: s.correctChars,
          totalTyped: s.totalTyped,
        })
      }
    },
    // trackerRef is stable across renders — see the ref assignment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onWordCompleted, onFinished]
  )

  /**
   * handleKeyDown — hardware / physical keyboards, which give us a real
   * `e.key`. preventDefault() here means the character never reaches the DOM,
   * so onChange does NOT fire and nothing is counted twice.
   *
   * MOBILE: Android (Gboard) and iOS soft keyboards report composition
   * keystrokes as key === 'Unidentified' (keyCode 229). Those MUST fall through
   * to onChange — that is the only event that carries the actual character.
   */
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
    // trackerRef is stable across renders — see the ref assignment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyKey]
  )

  /**
   * handleChange — the MOBILE path (and any IME). Soft keyboards only expose
   * their characters through the input's value, so we diff the new value
   * against the tracker's buffer and replay the difference as tracker keys.
   * The input stays controlled by `current`, so React snaps the DOM back to
   * the tracker's buffer right after (which is also what clears the field when
   * a word is committed with the space key).
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const tr = trackerRef.current
      if (!tr || tr.isFinished) return
      const prev = tr.currentInput
      const keys = diffInput(prev, e.target.value)
      // null = paste-like jump (the field blocks paste too): restore the
      // tracker's buffer instead of trusting the field.
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
    // trackerRef is stable across renders — see the ref assignment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyKey]
  )

  const minutes = elapsed / 60000
  const displayWpm = minutes > 0 ? live.wpm : 0

  // Live race board: me pinned on top, everyone else ordered by progress so
  // the standings shift in realtime as each player finishes words.
  const board = useMemo(() => {
    const others = [...rivals].sort((a, b) => b.completed - a.completed || a.nickname.localeCompare(b.nickname))
    return [
      { playerId: '__me__', label: meLabel || 'YOU', completed, total: words.length, accent: true, me: true },
      ...others.map((r) => ({
        playerId: r.playerId,
        label: r.nickname || 'player',
        completed: r.completed,
        total: r.total || words.length,
        accent: false,
        me: false,
      })),
    ]
  }, [rivals, completed, words.length, meLabel])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Live side-by-side progress for every player in the race */}
      <div
        aria-label="Live race standings"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--bg-secondary, var(--bg))',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '10px 12px',
        }}
      >
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            margin: 0,
          }}
        >
          LIVE · {board.length} {board.length === 1 ? 'PLAYER' : 'PLAYERS'}
        </p>
        {board.map((row) => (
          <RacerRow
            key={row.playerId}
            label={row.me ? `${row.label} (you)` : row.label}
            completed={row.completed}
            total={row.total}
            accent={row.accent}
          />
        ))}
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
        onChange={handleChange}
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
