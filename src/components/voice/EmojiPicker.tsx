'use client'

/**
 * EMOJI PICKER — the WhatsApp-style sheet: recents, a tab strip of every
 * category, and one tap = pick.
 *
 * It is deliberately a controlled *panel*, not a positioned popup: it owns the
 * tabs, the grid and the dismissal, but WHERE it floats is the caller's
 * business, because the same panel opens in two places —
 *   • above the call's control bar, where a tap fires a floating reaction at
 *     everybody on the call;
 *   • above the message composer, where a tap drops the emoji into the draft.
 *
 * It stays OPEN after a pick on purpose: the request was to send emojis
 * jaldi-jaldi, and a sheet that closes on every tap makes that impossible.
 * Closing is its own explicit gesture — the ✕, Escape, or a tap outside.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { EMOJI_GROUPS, readEmojiRecents, rememberEmoji } from '@/lib/emojis'

/**
 * Tap outside / Escape closes a floating panel, while taps on any of its own
 * `surfaces` (the panel itself, and the button that opened it) do not — so the
 * trigger keeps toggling instead of firing close-then-open in one tap.
 *
 * Shared by the emoji sheet and the More menu so both dismiss identically.
 */
export function useDismiss(open: boolean, onClose: () => void, surfaces: Array<RefObject<HTMLElement | null>>) {
  // The array is rebuilt by every render; the listeners only need its latest
  // contents, so keep the reference stable instead of re-subscribing per render.
  const surfacesRef = useRef(surfaces)
  surfacesRef.current = surfaces

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const mine = surfacesRef.current.some((surface) => surface.current?.contains(target))
      if (!mine) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    // Capture phase: a drag that starts inside a panel must not be judged by
    // the time it ends somewhere else, and nothing downstream stops Escape.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])
}

export default function EmojiPicker({
  onPick,
  onClose,
  label = 'Pick an emoji',
}: {
  /** Called for every tap — the caller decides whether that sends or inserts. */
  onPick: (emoji: string) => void
  onClose: () => void
  /** Screen-reader name for the sheet; the two callers say different things. */
  label?: string
}) {
  const panelRef = useRef<HTMLElement>(null)
  const [groupKey, setGroupKey] = useState(EMOJI_GROUPS[0].key)
  const [recents, setRecents] = useState<string[]>([])

  useDismiss(true, onClose, [panelRef])

  // Recents come from localStorage, which must never run during SSR or the
  // first paint — so they land one frame late instead of causing a hydration
  // mismatch (the sheet itself only ever opens client-side).
  useLayoutEffect(() => setRecents(readEmojiRecents()), [])

  // An unknown remembered group (older storage) must not render an empty grid.
  const group = EMOJI_GROUPS.find((g) => g.key === groupKey) ?? EMOJI_GROUPS[0]
  const showRecents = recents.length > 0
  const shown = groupKey === 'recent' ? recents : group.emojis

  const pick = (emoji: string) => {
    setRecents(rememberEmoji(emoji))
    onPick(emoji)
  }

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-label={label}
      style={{
        width: 'min(92vw, 340px)',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '10px 10px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
        animation: 'ccCardUp 0.15s ease',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
          Emoji
        </p>
        <button
          onClick={onClose}
          aria-label="Close the emoji picker"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Tab strip — recents first, then every category (phone keyboard) ── */}
      <div
        role="tablist"
        aria-label="Emoji categories"
        style={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 2,
        }}
      >
        {showRecents && (
          <Tab active={groupKey === 'recent'} onClick={() => setGroupKey('recent')} title="Recently used" icon="🕘" />
        )}
        {EMOJI_GROUPS.map((g) => (
          <Tab
            key={g.key}
            active={groupKey === g.key}
            onClick={() => setGroupKey(g.key)}
            title={g.label}
            icon={g.icon}
          />
        ))}
      </div>

      {/* ── Grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 2,
          maxHeight: '42vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 2,
        }}
      >
        {shown.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => pick(emoji)}
            // "Send this emoji" is meaningless out of context — the dialog's
            // label already says what picking does.
            aria-label={emoji}
            title={emoji}
            style={{
              fontSize: 21,
              lineHeight: 1.1,
              background: 'transparent',
              border: 'none',
              borderRadius: 8,
              padding: '5px 0',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* The recents row empties as the user clears it — never a blank grid. */}
      {groupKey === 'recent' && recents.length === 0 && (
        <p style={{ margin: '4px 2px 2px', fontSize: 11.5, color: 'var(--text-muted)' }}>
          Emojis you send show up here.
        </p>
      )}
    </section>
  )
}

/** One glyph on the tab strip; the label is the tooltip and the a11y name. */
function Tab({ active, onClick, title, icon }: { active: boolean; onClick: () => void; title: string; icon: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        flex: '0 0 auto',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        padding: '4px 7px 5px',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        fontFamily: 'inherit',
        opacity: active ? 1 : 0.65,
      }}
    >
      {icon}
    </button>
  )
}
