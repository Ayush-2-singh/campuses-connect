'use client'

/**
 * SECTION SHELL — the homepage's visual pattern, extracted for every page.
 *
 * Gives each section:
 *   1. the wide homepage container (1200px, same padding rhythm)
 *   2. a header strip styled like the homepage stats strip: orange icon
 *      tile + title + subtitle on the left, action buttons on the right
 *   3. optional stat chips (dynamic counts) under the header
 *
 * IMPORTANT: this is a pure visual wrapper. It renders {children} untouched,
 * so every page's existing queries, RPCs, RLS-driven reads and interactions
 * stay exactly as they are. No connectivity is added or removed.
 */

import React from 'react'
import { Icon } from '@/components/icons'

export interface SectionStat {
  value: string | number
  label: string
}

export interface SectionAction {
  label: string
  onClick: () => void
  primary?: boolean
  icon?: string
}

export default function SectionShell({
  icon,
  title,
  subtitle,
  stats,
  actions,
  children,
}: {
  icon: string
  title: string
  subtitle: string
  stats?: SectionStat[]
  actions?: SectionAction[]
  children: React.ReactNode
}) {
  return (
    <div className="ambient" style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px 48px' }}>
      {/* Header strip — mirrors the homepage stats strip (orange tile, same
          radius/border/typography rhythm) */}
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <span
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'var(--accent-light)',
            color: 'var(--accent-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={20} />
        </span>

        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            {title}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle}</p>
        </div>

        <span style={{ flex: 1 }} />

        {/* dynamic stat chips (from the page's own data) */}
        {stats && stats.length > 0 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {stats.map((s) => (
              <span key={s.label} style={{ textAlign: 'center' }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                    lineHeight: 1.15,
                  }}
                >
                  {s.value}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* action buttons */}
        {actions && actions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  minHeight: 38,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: a.primary ? 'none' : '1px solid var(--border)',
                  background: a.primary ? 'var(--accent)' : 'var(--bg)',
                  color: a.primary ? 'var(--on-accent)' : 'var(--text-secondary)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {a.icon && <Icon name={a.icon} size={13} />}
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* page content — untouched */}
      {children}
    </div>
  )
}
