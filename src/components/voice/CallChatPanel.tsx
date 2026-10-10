'use client'

/**
 * CALL CHAT — the Meet-style "in-call messages" panel.
 *
 * Rendered INSIDE the call shell, beside the tiles on a wide screen and under
 * them on a phone, so people can type without leaving the conversation. The
 * panel is only the messenger: the messages themselves come from the call
 * page's `chat` LiveKit data channel (see useCallChat), so nothing here talks
 * to a database and nothing is replayed to late joiners — the thread lives
 * exactly as long as the call does.
 *
 * Closing the panel must never touch the LiveKit room: the tiles, the mic and
 * the control bar all stay mounted behind it, and the panel is a plain sibling
 * in the layout rather than an overlay that could swallow the controls.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { CALL_CHAT_MAX_TEXT, type CallChatMessage } from '@/lib/callChat'

function clockTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

export default function CallChatPanel({
  messages,
  onSend,
  onClose,
}: {
  messages: CallChatMessage[]
  onSend: (text: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // The thread always shows its newest message (Meet pins the list down).
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  // Opening the panel IS the user gesture, so focusing the composer here still
  // lets the soft keyboard open on a phone without a second tap.
  useEffect(() => {
    composerRef.current?.focus()
  }, [])

  const trimmed = draft.trim()
  const canSend = trimmed.length > 0

  const submit = () => {
    if (!canSend) return
    onSend(trimmed)
    setDraft('')
  }

  return (
    <section
      aria-label="In-call messages"
      data-accent="gold"
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '14px 14px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'ccCardUp 0.15s ease',
      }}
    >
      {/* ── Panel header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="message" size={17} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>In-call messages</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>
            Everyone on the call can see this · not saved
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close in-call messages"
          style={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* ── Thread ── */}
      <div
        ref={listRef}
        className="lvc-chat-list"
        role="log"
        aria-live="polite"
        aria-label="Messages"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 2 }}
      >
        {messages.length === 0 && (
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              textAlign: 'center',
              margin: '20px 8px',
              lineHeight: 1.5,
            }}
          >
            No messages yet.
            <br />
            Say something — everyone in the call will see it.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                flexShrink: 0,
                background: m.mine ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: m.mine ? 'var(--on-accent)' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {initialOf(m.name)}
            </span>

            <div
              style={{
                minWidth: 0,
                flex: 1,
                background: m.mine ? 'var(--accent-light)' : 'var(--bg-secondary, var(--bg))',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '7px 10px',
              }}
            >
              <p style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '0 0 2px', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: m.mine ? 'var(--accent-text)' : 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {m.mine ? 'You' : m.name}
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{clockTime(m.at)}</span>
              </p>
              {/* Rendered as a text node — chat text is never interpreted as HTML. */}
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.45,
                }}
              >
                {m.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Composer — Enter sends, Shift+Enter makes a new line (Meet) ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={composerRef}
          className="lvc-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, CALL_CHAT_MAX_TEXT))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          maxLength={CALL_CHAT_MAX_TEXT}
          placeholder="Send a message…"
          aria-label="Message"
          style={{
            flex: 1,
            minWidth: 0,
            resize: 'none',
            background: 'var(--bg-secondary, var(--bg))',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 13.5,
            fontFamily: 'inherit',
            lineHeight: 1.4,
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          style={{
            width: 42,
            height: 42,
            flexShrink: 0,
            borderRadius: 12,
            border: 'none',
            background: canSend ? 'var(--accent)' : 'var(--disabled, var(--bg-tertiary))',
            color: canSend ? 'var(--on-accent)' : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </section>
  )
}
