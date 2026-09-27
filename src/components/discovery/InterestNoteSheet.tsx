'use client'

/**
 * InterestNoteSheet — the "why you're a fit" step for showing interest.
 *
 * When someone marks an idea interested, the author of a startup or hackathon
 * post wants to know WHO is asking. This sheet collects a short pitch that
 * travels with the interest, so the author can judge the fit and open the
 * applicant's profile before accepting.
 *
 * Dismissing the sheet (backdrop / Esc) still sends the interest WITHOUT a
 * note — the swipe already happened, so the action must never be silently lost.
 */

import { useEffect, useRef, useState } from 'react'
import { INTEREST_NOTE_MAX } from '@/lib/discovery'

export default function InterestNoteSheet({
  open,
  ideaTitle,
  busy,
  onSubmit,
}: {
  open: boolean
  ideaTitle: string
  busy: boolean
  onSubmit: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Fresh sheet per idea.
  useEffect(() => {
    if (open) {
      setNote('')
      // Focus after the sheet paints (mobile keyboards hate pre-paint focus).
      const t = window.setTimeout(() => textareaRef.current?.focus(), 60)
      return () => window.clearTimeout(t)
    }
  }, [open, ideaTitle])

  // Esc = send without a note (same as dismissing).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onSubmit(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onSubmit])

  if (!open) return null

  const trimmed = note.trim()
  const canSend = trimmed.length > 0 && !busy

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a note for the author"
      onClick={() => !busy && onSubmit(null)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 65,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          margin: '0 auto',
          background: 'var(--bg)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span aria-hidden style={{ fontSize: 18 }}>
            👋
          </span>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Tell them who you are
          </h3>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          You&apos;re interested in <strong style={{ color: 'var(--text-secondary)' }}>{ideaTitle}</strong>. Add a short
          pitch about your skills and why you fit — it helps the author decide who to build with.
        </p>

        <label htmlFor="interest-note" style={labelStyle}>
          Your pitch
        </label>
        <textarea
          id="interest-note"
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, INTEREST_NOTE_MAX))}
          rows={5}
          maxLength={INTEREST_NOTE_MAX}
          placeholder="e.g. I'm a 3rd-year CS student — built 2 React apps and placed 2nd at SIH last year. I can own the frontend and pitch deck."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <p
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            margin: '4px 0 0',
            textAlign: 'right',
          }}
        >
          {trimmed.length}/{INTEREST_NOTE_MAX}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <button
            onClick={() => canSend && onSubmit(trimmed)}
            disabled={!canSend}
            style={{
              minHeight: 48,
              borderRadius: 12,
              border: 'none',
              background: canSend ? 'var(--accent)' : 'var(--disabled)',
              color: 'var(--on-accent)',
              fontSize: 14.5,
              fontWeight: 800,
              cursor: canSend ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Sending…' : '❤️ Send interest with my pitch'}
          </button>
          <button
            onClick={() => !busy && onSubmit(null)}
            disabled={busy}
            style={{
              minHeight: 42,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Send without a note
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  color: 'var(--text-muted)',
  margin: '0 0 5px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--bg)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}
