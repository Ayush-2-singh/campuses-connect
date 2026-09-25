'use client'

/**
 * DiscoveryCard — the summary card for the swipe queue and lists.
 * Summary data only; the long-form content lives on the detail page (STEP 5).
 */

import type { DiscoveryFeedCard } from '@/lib/discovery'
import { CATEGORY_LABELS, STAGE_LABELS } from '@/lib/discovery'

const CATEGORY_ICON: Record<string, string> = {
  startup: '🚀',
  project: '🛠',
  hackathon: '⚡',
  collab: '🤝',
}

const STAGE_STYLE: Record<string, { bg: string; text: string }> = {
  idea: { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' },
  prototype: { bg: 'var(--accent-light)', text: 'var(--accent-text)' },
  mvp: { bg: 'var(--success-light)', text: 'var(--success-text)' },
  building: { bg: 'var(--purple-light)', text: 'var(--purple-text)' },
  launched: { bg: 'var(--orange-light)', text: 'var(--orange-text)' },
}

export function timeAgoShort(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export default function DiscoveryCard({ card, draggable = false }: { card: DiscoveryFeedCard; draggable?: boolean }) {
  const stage = STAGE_STYLE[card.stage] ?? STAGE_STYLE.idea

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '18px 18px 14px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.07)',
        userSelect: draggable ? 'none' : 'auto',
        pointerEvents: draggable ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 380,
      }}
    >
      {/* Category + stage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            padding: '3px 9px',
          }}
        >
          {CATEGORY_ICON[card.category] || '💡'} {CATEGORY_LABELS[card.category]?.slice(2) || card.category}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: stage.bg,
            color: stage.text,
            borderRadius: 8,
            padding: '3px 9px',
          }}
        >
          {STAGE_LABELS[card.stage] || card.stage}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgoShort(card.created_at)}</span>
      </div>

      {/* Title + description */}
      <h3
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '2px 0 0',
          lineHeight: 1.25,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {card.title}
      </h3>
      <p
        style={{
          fontSize: 13.5,
          color: 'var(--text-secondary)',
          margin: 0,
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {card.short_desc}
      </p>

      {/* Author */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {card.author_avatar ? (
            <img src={card.author_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (card.author_name || card.author_username || '?').charAt(0).toUpperCase()
          )}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
          @{card.author_username || card.author_name || 'student'}
        </span>
      </div>

      {/* Tags */}
      {card.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {card.tags.slice(0, 5).map((t) => (
            <span
              key={t}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: 7,
                padding: '2px 8px',
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Looking for */}
      {card.looking_for.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              color: 'var(--text-muted)',
              margin: '0 0 4px',
            }}
          >
            Looking for
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {card.looking_for.slice(0, 5).map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--accent-text)',
                  background: 'var(--accent-light)',
                  borderRadius: 7,
                  padding: '3px 9px',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Interest count */}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>🔥 {card.interested_count} interested</p>
    </div>
  )
}
