'use client'

/**
 * DiscoveryCard — the summary card for the swipe deck and lists.
 *
 * Summary data only; the long-form content lives on the detail page (STEP 5).
 * All glyphs are SVG (via the shared Icon set) so they inherit the section
 * accent, scale crisply and can flip to a solid state for interactions.
 */

import type { DiscoveryFeedCard } from '@/lib/discovery'
import { CATEGORY_LABELS, STAGE_LABELS, isDemoCardId } from '@/lib/discovery'
import { Icon } from '@/components/icons'

const CATEGORY_ICON: Record<string, string> = {
  startup: 'rocket',
  project: 'wrench',
  hackathon: 'zap',
  collab: 'users',
}

/* Category → tint, so each idea type reads at a glance. */
const CATEGORY_TINT: Record<string, { bg: string; fg: string; border: string }> = {
  startup: { bg: 'var(--accent-light)', fg: 'var(--accent-text)', border: 'var(--accent)' },
  project: { bg: 'var(--blue-light)', fg: 'var(--blue-text)', border: 'var(--blue)' },
  hackathon: { bg: 'var(--success-light)', fg: 'var(--success-text)', border: 'var(--success)' },
  collab: { bg: 'var(--purple-light)', fg: 'var(--purple-text)', border: 'var(--purple)' },
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
  const tint = CATEGORY_TINT[card.category] ?? CATEGORY_TINT.startup
  const catIcon = CATEGORY_ICON[card.category] ?? 'sparkles'
  const isDemo = isDemoCardId(card.id) || card.author_id === 'demo'

  return (
    <div
      className="discovery-card"
      style={{
        position: 'relative',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '18px 18px 16px',
        boxShadow: 'var(--shadow)',
        userSelect: draggable ? 'none' : 'auto',
        pointerEvents: draggable ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 360,
        overflow: 'hidden',
      }}
    >
      {/* Category accent hairline — gives the card an identity without noise. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${tint.border}, transparent 78%)`,
        }}
      />

      {/* Category + stage + demo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            fontWeight: 700,
            color: tint.fg,
            background: tint.bg,
            borderRadius: 8,
            padding: '4px 10px',
          }}
        >
          <Icon name={catIcon} size={13} />
          {CATEGORY_LABELS[card.category] || card.category}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: stage.bg,
            color: stage.text,
            borderRadius: 8,
            padding: '4px 9px',
          }}
        >
          {STAGE_LABELS[card.stage] || card.stage}
        </span>
        <span style={{ flex: 1 }} />
        {isDemo && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            Demo
          </span>
        )}
        <span
          style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Icon name="clock" size={12} />
          {timeAgoShort(card.created_at)}
        </span>
      </div>

      {/* Title + description */}
      <h3
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '2px 0 0',
          lineHeight: 1.28,
          letterSpacing: '-0.02em',
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
          lineHeight: 1.55,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {card.short_desc}
      </p>

      {/* Looking for — the single most actionable line on the card. */}
      {card.looking_for.length > 0 && (
        <div>
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--text-muted)',
              margin: '0 0 6px',
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
                  border: '1px solid var(--accent-border)',
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

      <div style={{ flex: 1 }} />

      {/* Footer — creator + social proof */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
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
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          @{card.author_username || card.author_name || 'student'}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 700,
            color: card.interested_count > 0 ? 'var(--accent-text)' : 'var(--text-muted)',
            background: card.interested_count > 0 ? 'var(--accent-light)' : 'transparent',
            borderRadius: 20,
            padding: card.interested_count > 0 ? '3px 10px' : 0,
            flexShrink: 0,
          }}
        >
          <Icon name="flame" size={13} filled={card.interested_count > 0} />
          {card.interested_count}
        </span>
      </div>
    </div>
  )
}
