'use client'

/**
 * TOP NAV — the horizontal app navigation (desktop).
 *
 * The app used to put its destinations in a 240px left sidebar: vertical,
 * always-on, and it permanently ate a sixth of the screen. This is the
 * horizontal replacement — brand at the left, the six destinations in one row
 * at the middle, account controls at the right — and its second-level links
 * live in a dropdown that opens when the pointer (or keyboard focus) enters
 * the parent item, the way the reference product's nav behaves.
 *
 * The dropdown is pure CSS (`:hover` + `:focus-within` in globals.css), so it
 * costs no state, no re-render and no JS. The parent is a real button that
 * navigates to the section, so clicking it never feels dead.
 *
 * Phones (<769px) keep the existing top bar + bottom nav; this renders only
 * on desktop — see the `.app-topbar` rules in globals.css.
 */

import React from 'react'
import { Icon } from '@/components/icons'
import Avatar from '@/components/Avatar'
import BrandName from '@/components/BrandName'
import ThemeToggle from '@/components/ThemeToggle'

type NavLeaf = { label: string; href: string; icon: string }
type NavEntry = { label: string; href: string; icon: string; items?: NavLeaf[] }

/**
 * V4 IA (campus-hiring pivot). Same destinations the sidebar carried: the two
 * pillars (Hiring, Skills) now expose their children in a dropdown instead of
 * as an indented list, and the primary destinations stay flat.
 */
const NAV: NavEntry[] = [
  {
    label: 'Hiring',
    href: '/companies',
    icon: 'briefcase',
    items: [
      { label: 'Colleges', href: '/colleges', icon: 'school' },
      { label: 'Companies', href: '/companies', icon: 'building' },
      { label: 'Applications', href: '/applications', icon: 'bookmark' },
      { label: 'Experiences', href: '/experiences', icon: 'pencil' },
    ],
  },
  { label: 'Jobs', href: '/jobs', icon: 'building' },
  { label: 'Rooms', href: '/live-voice-chat', icon: 'mic' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  {
    label: 'Skills',
    href: '/leaderboard',
    icon: 'sparkles',
    items: [
      { label: 'Leaderboard', href: '/leaderboard', icon: 'trophy' },
      { label: 'AI Coach', href: '/brain', icon: 'sparkles' },
      { label: 'Integrations', href: '/integrations', icon: 'link' },
      { label: 'Blog', href: '/blog', icon: 'pencil' },
    ],
  },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

export default function TopNav({
  pathname,
  onNavigate,
  onPrefetch,
  onOpenSearch,
  unreadCount,
  logoSrc,
  user,
  profile,
}: {
  pathname: string
  onNavigate: (href: string) => void
  onPrefetch: (href: string) => void
  onOpenSearch: () => void
  unreadCount: number
  logoSrc: string
  user?: any
  profile?: any
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const groupActive = (entry: NavEntry) =>
    entry.items ? entry.items.some((i) => isActive(i.href)) : isActive(entry.href)

  return (
    <header className="app-topbar topnav">
      <div className="topnav-inner">
        {/* Brand — the logo mark survives every width; the wordmark gives way
            on narrow desktops so the destinations never get squeezed out. */}
        <button className="topnav-brand" onClick={() => onNavigate('/')} aria-label="ConnectToCampus home">
          <img src={logoSrc} alt="" width={30} height={30} className="topnav-logo" />
          <span className="topnav-brand-name">
            <BrandName />
          </span>
        </button>

        <nav className="topnav-links" aria-label="Main navigation">
          {NAV.map((entry) => {
            const active = groupActive(entry)
            return (
              <div className="topnav-item" key={entry.label}>
                <button
                  className="topnav-link"
                  data-active={active ? '1' : undefined}
                  onClick={() => onNavigate(entry.href)}
                  onMouseEnter={() => onPrefetch(entry.href)}
                  aria-haspopup={entry.items ? 'true' : undefined}
                >
                  <Icon name={entry.icon} size={15} strokeWidth={active ? 2.3 : 2} />
                  <span className="topnav-link-t">{entry.label}</span>
                  {entry.items && <Icon name="chevron" size={12} className="topnav-caret" />}
                </button>

                {entry.items && (
                  <div className="topnav-drop">
                    <div className="topnav-panel" role="menu" aria-label={entry.label}>
                      {entry.items.map((child) => {
                        const childActive = isActive(child.href)
                        return (
                          <button
                            key={child.href}
                            role="menuitem"
                            className="topnav-sub"
                            data-active={childActive ? '1' : undefined}
                            onClick={() => onNavigate(child.href)}
                            onMouseEnter={() => onPrefetch(child.href)}
                          >
                            <span className="topnav-sub-ic">
                              <Icon name={child.icon} size={15} />
                            </span>
                            {child.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="topnav-right">
          <button className="topnav-search" onClick={onOpenSearch} aria-label="Open search" title="Search (⌘K)">
            <Icon name="search" size={15} />
            <span className="topnav-search-t">Search</span>
            <kbd className="topnav-search-k">⌘K</kbd>
          </button>

          <ThemeToggle mode="plain" />

          <button
            className="topnav-icon"
            onClick={() => onNavigate('/notifications')}
            aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
          >
            <Icon name="bell" size={17} />
            {unreadCount > 0 && <span className="topnav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {user ? (
            <Avatar
              name={profile?.full_name}
              avatarUrl={profile?.avatar_url}
              size={36}
              border
              onClick={() => onNavigate('/profile')}
            />
          ) : (
            <div className="topnav-auth">
              <button className="topnav-signin" onClick={() => onNavigate('/auth/login')}>
                Sign in
              </button>
              <button className="topnav-join" onClick={() => onNavigate('/auth/signup')}>
                Join free
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
