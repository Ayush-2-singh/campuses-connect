'use client'

// ═══════════════════════════════════════════════════════════════════════════
// CompeteNav — the section's one navigation surface.
//
// Every Compete route renders this row, so the seven destinations of the
// section are visible from anywhere inside it:
//
//   Rankings · Contributors · Daily Challenge · Quizzes · Games ·
//   Live Battle · Question bank
//
// Four of them are panels of /compete itself; three are their own routes. All
// seven render as real anchors, so middle-click, "open in new tab" and crawlers
// keep working. When the page can switch panels without a navigation (the
// /compete tabs), it passes `onSelect` and the matching anchors intercept the
// plain left click — same URL, no reload.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icons'
import type { Tab } from '@/app/compete/types'

export type CompeteSection = Tab | 'quizzes' | 'live' | 'bank'

type SectionItem = {
  key: CompeteSection
  label: string
  /** Shorter label for phones, where seven full labels cannot fit a row. */
  shortLabel: string
  icon: string
  href: string
  /** Panels of /compete — handled by `onSelect` when the page provides it. */
  panel: boolean
}

export const COMPETE_SECTIONS: SectionItem[] = [
  // Games leads the row: it is the section's landing panel (see /compete), so
  // the first thing a visitor sees is something to play, not a board to read.
  { key: 'games', label: 'Games', shortLabel: 'Games', icon: 'gamepad', href: '/compete?tab=games', panel: true },
  {
    key: 'contributors',
    label: 'Contributors',
    shortLabel: 'Creators',
    icon: 'pencil',
    href: '/compete?tab=contributors',
    panel: true,
  },
  {
    key: 'challenge',
    label: 'Daily Challenge',
    shortLabel: 'Daily',
    icon: 'code',
    href: '/compete?tab=daily',
    panel: true,
  },
  { key: 'quizzes', label: 'Quizzes', shortLabel: 'Quizzes', icon: 'notebook', href: '/compete/quizzes', panel: false },
  {
    key: 'rankings',
    label: 'Rankings',
    shortLabel: 'Rankings',
    icon: 'trophy',
    href: '/compete?tab=rankings',
    panel: true,
  },
  { key: 'live', label: 'Live Battle', shortLabel: 'Live', icon: 'zap', href: '/compete/live', panel: false },
  {
    key: 'bank',
    label: 'Question bank',
    shortLabel: 'Questions',
    icon: 'book',
    href: '/compete/live/questions',
    panel: false,
  },
]

export default function CompeteNav({
  active,
  onSelect,
}: {
  active: CompeteSection
  /** Provided by /compete so its own panels switch without a page load. */
  onSelect?: (tab: Tab) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)

  // On a phone the row scrolls sideways. Bring the current section into view
  // when the page opens, so the user can see where they are instead of landing
  // on "Rankings" while reading the Quizzes page.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const current = row.querySelector<HTMLElement>('[aria-current="page"]')
    if (!current) return
    const centred = current.offsetLeft - (row.clientWidth - current.clientWidth) / 2
    row.scrollLeft = Math.max(0, centred)
  }, [active])

  return (
    <nav className="compete-nav" aria-label="Compete sections">
      <div className="compete-nav-row chip-scroll" ref={rowRef}>
        {COMPETE_SECTIONS.map((section) => {
          const isActive = section.key === active
          return (
            <Link
              key={section.key}
              href={section.href}
              className="compete-nav-item"
              aria-current={isActive ? 'page' : undefined}
              title={section.label}
              onClick={(event) => {
                // Only the local panels, only a plain left click: modifier
                // clicks must still open the real URL in a new tab.
                if (!onSelect || !section.panel) return
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                onSelect(section.key as Tab)
              }}
            >
              <Icon name={section.icon} size={14} strokeWidth={2} />
              <span className="compete-nav-label">{section.label}</span>
              <span className="compete-nav-label-short">{section.shortLabel}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
