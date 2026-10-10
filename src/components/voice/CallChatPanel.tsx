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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { CALL_CHAT_MAX_TEXT, type CallChatMessage } from '@/lib/callChat'
import {
  defaultPanelPosition,
  movePanelByKey,
  movePanelPosition,
  readPanelPosition,
  savePanelPosition,
  type PanelPoint,
  type PanelSize,
} from '@/lib/floatingPanel'

/** Where this panel remembers being put, for this tab. */
const POSITION_KEY = 'cc-call-chat-pos'

/** The layout viewport in the SAME pixel space as pointer events.
 *
 * `documentElement.clientWidth/Height` rather than `innerWidth/Height`: the
 * app scales the root with `zoom`, and client* stays in the zoomed layout
 * space that `getBoundingClientRect()` and `clientX/Y` also use. */
function viewportSize(): PanelSize {
  const el = document.documentElement
  return {
    width: el?.clientWidth || window.innerWidth,
    height: el?.clientHeight || window.innerHeight,
  }
}

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

  // ── Position ─────────────────────────────────────────────────────────────
  // null until measured: the panel is rendered hidden for one frame so it can
  // never flash at the viewport corner before its remembered spot is applied.
  const [pos, setPos] = useState<PanelPoint | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  /** Mirror of `pos` for handlers that must not re-create on every move. */
  const posRef = useRef<PanelPoint | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: PanelPoint } | null>(null)

  const measure = useCallback((): PanelSize => {
    const rect = panelRef.current?.getBoundingClientRect()
    return { width: Math.round(rect?.width ?? 320), height: Math.round(rect?.height ?? 320) }
  }, [])

  const applyPos = useCallback((next: PanelPoint) => {
    posRef.current = next
    setPos(next)
  }, [])

  // First placement: the remembered spot, else the default dock. A remembered
  // spot from a bigger window/another device is clamped, never trusted.
  useLayoutEffect(() => {
    const size = measure()
    const viewport = viewportSize()
    let storage: Storage | null = null
    try {
      storage = window.sessionStorage
      applyPos(readPanelPosition(storage, POSITION_KEY, size, viewport))
    } catch {
      applyPos(defaultPanelPosition(size, viewport))
    }
  }, [applyPos, measure])

  // A resize (or the phone keyboard shrinking the viewport) must not strand
  // the panel outside the screen — and neither must the thread growing taller,
  // which can push the panel's bottom over the reserved control-bar strip.
  useEffect(() => {
    const reclamp = () => {
      const current = posRef.current
      if (!current) return
      const next = movePanelPosition(current, { x: 0, y: 0 }, measure(), viewportSize())
      if (next.x !== current.x || next.y !== current.y) applyPos(next)
    }
    reclamp()
    window.addEventListener('resize', reclamp)
    return () => window.removeEventListener('resize', reclamp)
  }, [applyPos, measure, messages.length])

  const remember = useCallback((point: PanelPoint) => {
    try {
      savePanelPosition(window.sessionStorage, POSITION_KEY, point)
    } catch {
      /* private browsing — the position just won't be remembered */
    }
  }, [])

  const onGripPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Never start a drag from the header's buttons — those are real controls.
    if ((e.target as HTMLElement).closest('button')) return
    const origin = posRef.current
    if (!origin) return
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    // A drag must not select the header text while the pointer is down.
    document.body.style.userSelect = 'none'
  }

  const onGripPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    applyPos(
      movePanelPosition(
        drag.origin,
        { x: e.clientX - drag.startX, y: e.clientY - drag.startY },
        measure(),
        viewportSize()
      )
    )
  }

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    document.body.style.userSelect = ''
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (posRef.current) remember(posRef.current)
  }

  /** Arrow keys move the panel, so it is placeable without a pointer. */
  const onGripKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const current = posRef.current
    if (!current) return
    const next = movePanelByKey(current, e.key, measure(), viewportSize())
    if (!next) return
    e.preventDefault()
    applyPos(next)
    remember(next)
  }

  const resetPosition = () => {
    const next = defaultPanelPosition(measure(), viewportSize())
    applyPos(next)
    remember(next)
  }

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
      ref={panelRef}
      aria-label="In-call messages"
      data-accent="gold"
      data-dragging={dragging ? '1' : '0'}
      className="lvc-chat-float"
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        // One hidden frame while the remembered spot is measured, so the panel
        // never flashes at the corner before it lands where the user left it.
        visibility: pos ? 'visible' : 'hidden',
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
      {/* ── Header — also the drag handle ── */}
      <div
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onGripKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Move the messages panel — drag or use the arrow keys"
        title="Drag to move — arrow keys work too"
        style={{ display: 'flex', alignItems: 'center', gap: 8, touchAction: 'none' }}
      >
        <span className="lvc-chat-grip" aria-hidden="true">
          <Icon name="grip" size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>In-call messages</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>
            Everyone on the call can see this · not saved
          </p>
        </div>
        <button
          onClick={resetPosition}
          aria-label="Move the panel back to its default spot"
          title="Reset position"
          style={{
            width: 34,
            height: 34,
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
          <Icon name="target" size={15} />
        </button>
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
