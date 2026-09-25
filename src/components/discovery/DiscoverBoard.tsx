'use client'

/**
 * DISCOVER BOARD — the /discover deck view restyled to the Sep 26, 03:04
 * reference blueprint: a warm FEATURED banner, orange category pill row,
 * and an equal-card idea GRID with Interested/Pass actions.
 *
 * Functional source of truth is unchanged: cards come from the SAME
 * fetchDiscoveryFeed queue and every action funnels into the SAME
 * onAction(postId, 'interested'|'passed') layer the SwipeDeck uses.
 * Swipe mode stays available via the toggle — nothing is removed.
 *
 * Blueprint tokens (extracted from the mockup):
 *   bg #F8FBFE · cards #FFFFFF · warm band #FDEFD8 → #FEF6E9
 *   brand orange #FE7F00 · text ink #1A1D24
 */

import { useMemo, useState } from 'react'
import type { DiscoveryFeedCard } from '@/lib/discovery'
import { CATEGORY_LABELS } from '@/lib/discovery'
import SwipeDeck from './SwipeDeck'
import EmptyState from '@/components/EmptyState'
import { Icon } from '@/components/icons'

type BoardTab = 'startup' | 'project' | 'hackathon' | 'collab'

const CATEGORIES: { key: BoardTab; label: string; emoji: string }[] = [
  { key: 'startup', label: 'Startups', emoji: '🚀' },
  { key: 'project', label: 'Projects', emoji: '🛠' },
  { key: 'hackathon', label: 'Hackathons', emoji: '⚡' },
  { key: 'collab', label: 'Collab', emoji: '🤝' },
]

/* Category → accent chip colors (orange family leads, per blueprint) */
const CAT_STYLE: Record<BoardTab, { bg: string; fg: string }> = {
  startup: { bg: 'var(--accent-light)', fg: 'var(--accent-text)' },
  project: { bg: 'var(--blue-light)', fg: 'var(--blue-text)' },
  hackathon: { bg: 'var(--success-light)', fg: 'var(--success-text)' },
  collab: { bg: 'var(--purple-light)', fg: 'var(--purple-text)' },
}

/* Warm band behind the featured banner (light/dark aware via tokens) */
const WARM_BAND = 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent 78%)'
const WARM_CARD =
  'linear-gradient(160deg, color-mix(in srgb, var(--accent) 13%, transparent), color-mix(in srgb, var(--accent) 3%, transparent))'

const STAGE_BADGE: Record<string, string> = {
  idea: '💡 Idea',
  prototype: '🧪 Prototype',
  mvp: '🚀 MVP',
  launched: '🌐 Launched',
}

export default function DiscoverBoard({
  tab,
  onTabChange,
  cards,
  loading,
  error,
  busy,
  onAction,
  onRetry,
  signedIn,
  onCreate,
}: {
  tab: BoardTab
  onTabChange: (t: BoardTab) => void
  cards: DiscoveryFeedCard[]
  loading: boolean
  error: string | null
  busy: boolean
  onAction: (postId: string, action: 'interested' | 'passed') => void
  onRetry: () => void
  signedIn: boolean
  onCreate: () => void
}) {
  const [mode, setMode] = useState<'grid' | 'swipe'>('grid')
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const featured = useMemo(() => cards.find((c) => !!c.short_desc) || cards[0], [cards])
  const rest = useMemo(() => cards.filter((c) => c.id !== featured?.id), [cards, featured])

  const toggleSave = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div>
      {/* warm band behind the top of the board (blueprint) */}
      <div style={{ background: WARM_BAND, margin: '-14px -2px 0', padding: '16px 2px 10px' }}>
        {/* ---------- header row: pills + view toggle ---------- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {CATEGORIES.map((c) => {
            const active = tab === c.key
            return (
              <button
                key={c.key}
                onClick={() => onTabChange(c.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 34,
                  padding: '6px 14px',
                  borderRadius: 18,
                  border: active ? 'none' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--bg)',
                  color: active ? 'var(--on-accent)' : 'var(--text-secondary)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: active ? '0 2px 10px color-mix(in srgb, var(--accent) 35%, transparent)' : 'none',
                }}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.label}
              </button>
            )
          })}

          <span style={{ flex: 1 }} />

          {/* swipe/grid toggle — swipe deck stays reachable (nothing removed) */}
          <button
            onClick={() => setMode(mode === 'grid' ? 'swipe' : 'grid')}
            aria-label={mode === 'grid' ? 'Switch to swipe deck' : 'Switch to grid'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 34,
              padding: '6px 12px',
              borderRadius: 18,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon name={mode === 'grid' ? 'zap' : 'more'} size={13} />
            {mode === 'grid' ? 'Swipe deck' : 'Grid view'}
          </button>
        </div>
      </div>

      {mode === 'swipe' ? (
        <>
          <SwipeDeck cards={cards} onAction={onAction} busy={busy} />
          {cards.length === 0 && !loading && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              No ideas in this tab yet — be the first to post one.
            </p>
          )}
        </>
      ) : (
        <>
          {/* ---------------- FEATURED banner (blueprint) ---------------- */}
          {loading ? (
            <div style={{ ...cardStyle, height: 150, opacity: 0.6 }} />
          ) : featured ? (
            <div
              style={{
                borderRadius: 16,
                border: '1px solid var(--accent-border, var(--border))',
                background: WARM_CARD,
                padding: 18,
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 14,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                {CATEGORIES.find((c) => c.key === tab)?.emoji}
              </span>
              <span style={{ flex: 1, minWidth: 220 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: 'var(--accent-text)',
                    background: 'var(--accent-light)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    marginBottom: 6,
                  }}
                >
                  Featured
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 16.5,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    lineHeight: 1.25,
                  }}
                >
                  {featured.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {featured.short_desc}
                </span>
              </span>
              <button
                onClick={() => onAction(featured.id, 'interested')}
                disabled={busy || !signedIn}
                title={signedIn ? 'Show interest' : 'Sign in to show interest'}
                style={{
                  minHeight: 40,
                  padding: '9px 18px',
                  borderRadius: 11,
                  border: 'none',
                  background: busy || !signedIn ? 'var(--disabled)' : 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: busy || !signedIn ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                I&apos;m interested →
              </button>
            </div>
          ) : null}

          {/* ---------------- idea GRID (equal cards, blueprint) ---------------- */}
          {loading ? (
            <div style={{ ...gridStyle }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ ...cardStyle, height: 190, opacity: 0.5 }} />
              ))}
            </div>
          ) : error ? (
            <EmptyState icon="⚠️" title="Could not load ideas" body={error} cta="Retry" onCta={onRetry} />
          ) : rest.length === 0 && !featured ? (
            <EmptyState
              icon="🚀"
              title="Nothing here yet"
              body="No ideas in this category — post yours and appear at the top."
              cta="Post an idea"
              onCta={onCreate}
            />
          ) : (
            <div style={gridStyle}>
              {rest.map((card) => {
                const cat = (card.category as BoardTab) || tab
                const chip = CAT_STYLE[cat] || CAT_STYLE[tab]
                return (
                  <div key={card.id} style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          padding: '3px 9px',
                          borderRadius: 7,
                          background: chip.bg,
                          color: chip.fg,
                        }}
                      >
                        {CATEGORY_LABELS[cat] || card.category}
                      </span>
                      <button
                        onClick={() => toggleSave(card.id)}
                        aria-label={saved.has(card.id) ? 'Remove bookmark' : 'Bookmark idea'}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: saved.has(card.id) ? 'var(--accent)' : 'var(--text-muted)',
                          display: 'inline-flex',
                          padding: 2,
                        }}
                      >
                        <Icon name="bookmark" size={15} />
                      </button>
                    </div>

                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        margin: '10px 0 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {card.title}
                    </p>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        lineHeight: 1.5,
                        margin: '5px 0 0',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {card.short_desc}
                    </p>

                    {/* meta row: stage + author */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 10 }}>
                      {card.stage && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {STAGE_BADGE[card.stage] || card.stage}
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '48%',
                        }}
                      >
                        {card.author_name || card.author_username || 'builder'}
                      </span>
                    </div>

                    {/* actions — same action layer as the deck */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => onAction(card.id, 'interested')}
                        disabled={busy || !signedIn}
                        title={signedIn ? 'Show interest' : 'Sign in to show interest'}
                        style={{
                          flex: 2,
                          minHeight: 36,
                          borderRadius: 10,
                          border: 'none',
                          background: busy || !signedIn ? 'var(--disabled)' : 'var(--accent)',
                          color: 'var(--on-accent)',
                          fontSize: 12.5,
                          fontWeight: 800,
                          cursor: busy || !signedIn ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Interested
                      </button>
                      <button
                        onClick={() => onAction(card.id, 'passed')}
                        disabled={busy || !signedIn}
                        title={signedIn ? 'Pass' : 'Sign in first'}
                        style={{
                          flex: 1,
                          minHeight: 36,
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--bg)',
                          color: 'var(--text-secondary)',
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: busy || !signedIn ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Pass
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* shared styles */
const cardStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow-sm)',
  minWidth: 0,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 12,
}
