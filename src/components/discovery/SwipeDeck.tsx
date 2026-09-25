'use client'

/**
 * SwipeDeck — Tinder-style card deck for Discovery (NOT a dating UI).
 *
 * One action layer (STEP 8): swipe, buttons and keyboard all call
 * onAction(postId, 'interested' | 'passed') — no separate business logic.
 *
 * Desktop: mouse drag, ← / → keys, buttons.
 * Mobile: touch drag with live rotation + PASS/INTERESTED overlays.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiscoveryFeedCard } from '@/lib/discovery'
import DiscoveryCard from './DiscoveryCard'

const THRESHOLD = 110 // px — commit distance
const VELOCITY_THRESHOLD = 0.55 // px/ms — flick commits too
const ROTATION_MAX = 14 // deg at threshold

export interface SwipeDeckHandle {
  /** Programmatically trigger the top card's action (used by outer buttons). */
  act: (action: 'interested' | 'passed') => void
}

interface DragState {
  id: number
  startX: number
  startY: number
  dx: number
  dy: number
  lastX: number
  lastT: number
  vx: number
  active: boolean
}

export default function SwipeDeck({
  cards,
  onAction,
  busy,
  onEmpty,
}: {
  cards: DiscoveryFeedCard[]
  onAction: (postId: string, action: 'interested' | 'passed') => void
  busy: boolean
  onEmpty?: () => void
}) {
  // Only the top card is interactive; the two behind it are a visual stack.
  const visible = cards.slice(0, 3)
  const top = visible[0]

  const [drag, setDrag] = useState<DragState | null>(null)
  const [flyOut, setFlyOut] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const [deckHeight, setDeckHeight] = useState(460)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy

  // Stable current cards for the key handler (avoid re-binding per render).
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  // Keep the deck tall enough for the card (cards are content-sized).
  useEffect(() => {
    const el = cardRef.current
    if (el && el.scrollHeight > deckHeight) setDeckHeight(el.scrollHeight + 8)
  }, [deckHeight, top?.id])

  const doAction = useCallback(
    (action: 'interested' | 'passed') => {
      const current = cardsRef.current[0]
      if (!current || busyRef.current) return
      setFlyOut({ id: current.id, dir: action === 'interested' ? 1 : -1 })
      window.setTimeout(() => setFlyOut(null), 280)
      onAction(current.id, action)
    },
    [onAction]
  )

  // Keyboard: ← pass, → interested (STEP 7). Rebinds only when top id changes.
  const topId = top?.id ?? null
  useEffect(() => {
    if (!topId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        doAction('passed')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        doAction('interested')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [topId, doAction])

  // ---- Pointer handling (mouse + touch via Pointer Events) ----
  const startDrag = (e: React.PointerEvent) => {
    if (busyRef.current || flyOut) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
      active: true,
    })
  }

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const now = performance.now()
    const vx = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT)
    setDrag({ ...drag, dx, dy, lastX: e.clientX, lastT: now, vx })
  }

  const endDrag = () => {
    if (!drag) return
    const commit = Math.abs(drag.dx) > THRESHOLD || Math.abs(drag.vx) > VELOCITY_THRESHOLD
    if (commit) {
      doAction(drag.dx > 0 ? 'interested' : 'passed')
    }
    setDrag(null)
  }

  const progress = drag ? Math.min(1, Math.abs(drag.dx) / THRESHOLD) : 0
  const dirSign = drag ? Math.sign(drag.dx) : 0

  if (!top) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px' }}>
        <p style={{ fontSize: 40, margin: 0 }}>🎉</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '10px 0 4px' }}>
          You&apos;ve reached the end
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          There are no new ideas to discover right now.
        </p>
        {onEmpty && (
          <button
            onClick={onEmpty}
            style={{
              minHeight: 40,
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Refresh
          </button>
        )}
      </div>
    )
  }

  const topStyle: React.CSSProperties =
    flyOut?.id === top.id
      ? {
          transform: `translateX(${flyOut.dir * (Math.abs(drag?.dx || 0) + 480)}px) rotate(${flyOut.dir * 18}deg)`,
          opacity: 0,
          transition: 'transform 0.28s ease-in, opacity 0.28s ease-in',
        }
      : drag
        ? {
            transform: `translate(${drag.dx}px, ${drag.dy * 0.15}px) rotate(${(drag.dx / THRESHOLD) * ROTATION_MAX}deg)`,
            transition: 'none',
          }
        : { transition: 'transform 0.2s ease' }

  return (
    <div>
      <div style={{ position: 'relative', height: deckHeight }}>
        {/* Stack behind (visual only) */}
        {visible.slice(1).map((c, i) => (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translateY(${(i + 1) * 8}px) scale(${1 - (i + 1) * 0.03})`,
              opacity: 1 - (i + 1) * 0.35,
              zIndex: 2 - i,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          >
            <div ref={i === 0 ? cardRef : undefined} style={{ height: '100%' }}>
              <DiscoveryCard card={c} />
            </div>
            {/* content is duplicated but render cost is tiny (3 cards) */}
          </div>
        ))}

        {/* Top card — draggable */}
        <div
          ref={cardRef}
          role="group"
          aria-label={`Idea: ${top.title}. Swipe left to pass, right to mark interested.`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            cursor: drag ? 'grabbing' : 'grab',
            touchAction: 'pan-y',
            ...topStyle,
          }}
        >
          <div style={{ height: '100%', pointerEvents: 'none' }}>
            <DiscoveryCard card={top} />
          </div>

          {/* Directional overlays while dragging */}
          {drag && Math.abs(drag.dx) > 24 && (
            <>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 18,
                  left: 18,
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: 1,
                  color: 'var(--text-muted)',
                  border: '2px solid var(--text-muted)',
                  borderRadius: 8,
                  padding: '3px 10px',
                  transform: 'rotate(-14deg)',
                  opacity: dirSign < 0 ? Math.min(1, progress + 0.3) : 0.15,
                }}
              >
                PASS
              </span>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 18,
                  right: 18,
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: 1,
                  color: 'var(--accent-text)',
                  border: '2px solid var(--accent)',
                  borderRadius: 8,
                  padding: '3px 10px',
                  transform: 'rotate(14deg)',
                  opacity: dirSign > 0 ? Math.min(1, progress + 0.3) : 0.15,
                }}
              >
                INTERESTED
              </span>
            </>
          )}
        </div>
      </div>

      {/* Button fallbacks — same action layer as swipe/keyboard */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 18 }}>
        <button
          onClick={() => doAction('passed')}
          disabled={busy}
          aria-label="Pass (left arrow)"
          style={{
            minWidth: 96,
            minHeight: 52,
            borderRadius: 26,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            fontSize: 21,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
        <button
          onClick={() => doAction('interested')}
          disabled={busy}
          aria-label="Interested (right arrow)"
          style={{
            minWidth: 96,
            minHeight: 52,
            borderRadius: 26,
            border: '1px solid var(--accent)',
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            fontSize: 21,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ❤️
        </button>
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
        Drag, tap, or use ← / → keys
      </p>
    </div>
  )
}
