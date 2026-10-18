'use client'

/**
 * SECTION SHELL — the shared frame for every section page.
 *
 * Gives each section:
 *   1. the wide container (1120px, same padding rhythm)
 *   2. one titled header — display-serif headline with a single italic accent
 *      phrase, a short lede under it, then the page's live counts and actions
 *      as centred chips/buttons
 *   3. optional stat chips (dynamic counts) under the header
 *
 * IMPORTANT: this is a pure visual wrapper. It renders {children} untouched,
 * so every page's existing queries, RPCs, RLS-driven reads and interactions
 * stay exactly as they are. No connectivity is added or removed.
 *
 * The chrome lives in globals.css (§ Section shell) so hover/focus states and
 * the theme are expressible — the props API is unchanged from before.
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
  accent,
  subtitle,
  stats,
  actions,
  children,
}: {
  icon: string
  /** The headline. Kept short — the accent phrase finishes the sentence. */
  title: string
  /**
   * The one italic accent phrase in the headline ("Companies that are
   * *hiring.*"). Rendered inside the h2 as `.hc-em`, so it inherits the
   * display size and sits in the line rather than beside it.
   */
  accent?: string
  subtitle: string
  stats?: SectionStat[]
  actions?: SectionAction[]
  children: React.ReactNode
}) {
  return (
    <div className="ambient ss-wrap">
      <div className="ss-head">
        <span className="ss-icon">
          <Icon name={icon} size={20} />
        </span>

        <div style={{ minWidth: 0 }}>
          <h2 className="ss-title">
            {title}
            {accent ? (
              <>
                {' '}
                <em className="hc-em">{accent}</em>
              </>
            ) : null}
          </h2>
          <p className="ss-sub">{subtitle}</p>
        </div>

        <span className="ss-spacer" />

        {stats && stats.length > 0 && (
          <div className="ss-stats">
            {stats.map((s) => (
              <span className="ss-stat" key={s.label}>
                <span className="ss-stat-v">{s.value}</span>
                <span className="ss-stat-l">{s.label}</span>
              </span>
            ))}
          </div>
        )}

        {actions && actions.length > 0 && (
          <div className="ss-actions">
            {actions.map((a) => (
              <button key={a.label} onClick={a.onClick} className={a.primary ? 'ss-btn ss-btn--primary' : 'ss-btn'}>
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
