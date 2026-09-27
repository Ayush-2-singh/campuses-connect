'use client'

/**
 * SwipeDeck — Tinder-style card deck for Discovery (NOT a dating UI).
 *
 * One action layer (STEP 8): swipe, buttons and keyboard all call
 * onAction(postId, 'interested' | 'passed') — no separate business logic.
 *
 * Desktop: mouse drag, ← / → keys, buttons, click-to-open.
 * Mobile: touch drag with live rotation + PASS/INTERESTED stamps.
 *
 * Mechanics that make it feel real:
 *   • The committed card is OWNED by the deck for the length of the fling, so
 *     the exit animation actually plays (the parent removes the card from its
 *     queue immediately — we can't rely on it staying mounted).
 *   • Background cards carry a transition, so when the top card leaves the
 *     next two slide up into place instead of snapping.
 *   • Fling velocity (a fast flick) commits below the drag-distance threshold.
 *   • Vertical drag is damped and text selection is disabled while dragging.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DiscoveryFeedCard } from '@/lib/discovery'
import DiscoveryCard from './DiscoveryCard'

const THRESHOLD = 110 // px — commit distance
const VELOCITY_THRESHOLD = 0.55 // px/ms — flick commits too
const ROTATION_MAX = 14 // deg at threshold
const TAP_SLOP = 8 // px — below this, a release is a tap (open details)
const EXIT_MS = 320 // fling duration
const EASE_OUT = 'cubic-bezier(.22,1,.36,1)'
const EASE_FLING = 'cubic-bezier(.2,.7,.25,1)'

export interface SwipeDeckHandle {
  /** Programmatically trigger the top card's action (used by outer buttons). */
  act: (action: 'interested' | 'passed') => void
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  dx: number
  dy: number
  lastX: number
  lastT: number
  vx: number
}

interface ExitingCard {
  card: DiscoveryFeedCard
  dir: 1 | -1
  dx: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const tiltFor = (dx: number) => clamp((dx / THRESHOLD) * ROTATION_MAX, -ROTATION_MAX * 1.3, ROTATION_MAX * 1.3)

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
  const router = useRouter()

  // Only the top card is interactive; the two behind it are a visual stack.
  const visible = cards.slice(0, 3)
  const top = visible[0]

  const [drag, setDrag] = useState<DragState | null>(null)
  // A card that has been committed — stays mounted (with its own exit
  // transform) while the queue behind it already moved on.
  const [exiting, setExiting] = useState<ExitingCard | null>(null)
  const [exitingLaunched, setExitingLaunched] = useState(false)
  const [announce, setAnnounce] = useState('')

  // Refs keep the imperative handlers free of stale closures.
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const busyRef = useRef(busy)
  busyRef.current = busy
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const exitTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current)
    },
    []
  )

  const doAction = useCallback(
    (action: 'interested' | 'passed') => {
      const current = cardsRef.current[0]
      if (!current || busyRef.current) return
      const dir: 1 | -1 = action === 'interested' ? 1 : -1

      // Hand the departing card to the deck's own overlay so the fling plays
      // even though the parent drops it from the queue right now.
      setExiting({ card: current, dir, dx: dragRef.current?.dx ?? 0 })
      setExitingLaunched(false)
      // Two frames: the first paints the card at its dragged position, the
      // second flips it to the off-screen fling so the transition runs.
      requestAnimationFrame(() => requestAnimationFrame(() => setExitingLaunched(true)))
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current)
      exitTimer.current = window.setTimeout(() => {
        setExiting(null)
        setExitingLaunched(false)
      }, EXIT_MS)

      setDrag(null)
      setAnnounce(action === 'interested' ? `Interested in ${current.title}` : `Passed ${current.title}`)
      onAction(current.id, action)
    },
    [onAction]
  )

  // Keyboard: ← pass, → interested (STEP 7). Rebinds only when top id changes.
  const topId = top?.id ?? null
  useEffect(() => {
    if (!topId) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // Don't hijack arrows while the user is typing (create-idea sheet etc.).
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
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
    if (busyRef.current || exiting) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture?.(e.pointerId)
    setDrag({
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
    })
  }

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return
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
      return
    }
    const wasTap = Math.abs(drag.dx) < TAP_SLOP && Math.abs(drag.dy) < TAP_SLOP
    setDrag(null)
    // A clean tap opens the full write-up — no drag needed to inspect an idea.
    if (wasTap && top && !busyRef.current) router.push(`/discover/${top.id}`)
  }

  const progress = drag ? Math.min(1, Math.abs(drag.dx) / THRESHOLD) : 0
  const dirSign = drag ? Math.sign(drag.dx) : 0

  if (!top && !exiting) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px' }}>
        <p style={{ fontSize: 48, margin: 0, animation: 'ccCardUp 0.3s ease' }}>🎉</p>
        <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '14px 0 6px' }}>
          You&apos;re all caught up!
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          You&apos;ve swiped through every idea in this queue.
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 20px', opacity: 0.8 }}>
          New ideas land here the moment someone posts — or post your own and find builders.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {onEmpty && (
            <button
              onClick={onEmpty}
              style={{
                minHeight: 44,
                padding: '10px 22px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ↻ Refresh queue
            </button>
          )}
        </div>
      </div>
    )
  }

  const topStyle: React.CSSProperties = drag
    ? {
        transform: `translate(${drag.dx}px, ${drag.dy * 0.2}px) rotate(${tiltFor(drag.dx)}deg) scale(${
          1 - 0.015 * progress
        })`,
        transition: 'none',
      }
    : { transition: `transform 0.32s ${EASE_OUT}` }

  const exitStyle: React.CSSProperties = exiting
    ? {
        transform: exitingLaunched
          ? `translate(${exiting.dir * 130}%, 0) rotate(${exiting.dir * 22}deg)`
          : `translate(${exiting.dx}px, 0) rotate(${tiltFor(exiting.dx)}deg)`,
        opacity: exitingLaunched ? 0 : 1,
        transition: exitingLaunched ? `transform ${EXIT_MS}ms ${EASE_FLING}, opacity ${EXIT_MS}ms ease` : 'none',
      }
    : {}

  return (
    <div>
      {/* minHeight keeps the fling visible for the LAST card (no in-flow card
          left to size the container). Matches DiscoveryCard's own min-height. */}
      <div style={{ position: 'relative', minHeight: 380 }}>
        {/* Stack behind (visual only) — the transition makes the deck slide
            up smoothly when the top card leaves. */}
        {visible.slice(1).map((c, i) => (
          <div
            key={c.id}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.045})`,
              opacity: 1 - (i + 1) * 0.35,
              zIndex: 2 - i,
              pointerEvents: 'none',
              transition: `transform 0.4s ${EASE_OUT}, opacity 0.4s ${EASE_OUT}`,
            }}
          >
            <div style={{ height: '100%' }}>
              <DiscoveryCard card={c} draggable />
            </div>
          </div>
        ))}

        {/* Top card — draggable. Keyed so the entrance animation replays
            whenever a new card reaches the top slot. */}
        {top && (
          <div
            key={top.id}
            role="group"
            aria-label={`Idea: ${top.title}. Swipe left to pass, right to mark interested, tap to open.`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            style={{
              position: 'relative',
              zIndex: 3,
              cursor: drag ? 'grabbing' : 'grab',
              touchAction: 'pan-y',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              // Suppress the entrance animation mid-drag so it never fights
              // the inline drag transform.
              animation: drag ? 'none' : 'ccCardUp 0.24s ease',
              ...topStyle,
            }}
          >
            <DiscoveryCard card={top} draggable />

            {/* Directional tint — the whole card leans into the action. */}
            {drag && Math.abs(drag.dx) > 6 && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 18,
                  boxShadow: `0 0 0 2px ${dirSign > 0 ? 'var(--accent)' : 'var(--border-strong)'}`,
                  opacity: progress * 0.85,
                  pointerEvents: 'none',
                  transition: 'opacity 0.08s linear',
                }}
              />
            )}

            {/* Directional stamps while dragging */}
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
                    transform: `rotate(-14deg) scale(${0.85 + progress * 0.3})`,
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
                    transform: `rotate(14deg) scale(${0.85 + progress * 0.3})`,
                    opacity: dirSign > 0 ? Math.min(1, progress + 0.3) : 0.15,
                  }}
                >
                  INTERESTED
                </span>
              </>
            )}
          </div>
        )}

        {/* Committed card — flies off on top of the freshly-advanced deck. */}
        {exiting && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              pointerEvents: 'none',
              willChange: 'transform, opacity',
              ...exitStyle,
            }}
          >
            <DiscoveryCard card={exiting.card} draggable />
          </div>
        )}
      </div>

      {/* Action bar — same action layer as swipe/keyboard */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 18 }}>
        <button
          onClick={() => doAction('passed')}
          disabled={busy || !top}
          aria-label="Pass (left arrow)"
          style={{
            minWidth: 108,
            minHeight: 52,
            borderRadius: 26,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: busy || !top ? 'default' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'transform 0.12s ease, border-color 0.15s ease',
          }}
        >
          <span aria-hidden style={{ fontSize: 17 }}>
            ✕
          </span>
          Pass
        </button>
        <button
          onClick={() => doAction('interested')}
          disabled={busy || !top}
          aria-label="Interested (right arrow)"
          style={{
            minWidth: 132,
            minHeight: 52,
            borderRadius: 26,
            border: '1px solid var(--accent)',
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: busy || !top ? 'default' : 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            boxShadow: '0 4px 14px color-mix(in srgb, var(--accent) 22%, transparent)',
            transition: 'transform 0.12s ease, box-shadow 0.15s ease',
          }}
        >
          <span aria-hidden style={{ fontSize: 17 }}>
            ❤️
          </span>
          Interested
        </button>
      </div>

      {top && (
        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>
          Drag or use ← / → · tap the card to read the full idea
        </p>
      )}

      {/* Screen-reader feedback for the one action layer */}
      <p
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announce}
      </p>
    </div>
  )
}
