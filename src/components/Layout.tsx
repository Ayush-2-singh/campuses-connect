'use client'
import React from 'react'
import dynamic from 'next/dynamic'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import LogoToggle, { getLogoSrc } from '@/components/LogoToggle'
import MobileBottomNav from '@/components/MobileBottomNav'
import MobileMenu from '@/components/MobileMenu'
import Avatar from '@/components/Avatar'
import { Icon } from '@/components/icons'
import { accentForPath } from '@/theme/colors'
import BrandName from '@/components/BrandName'
import { useCall } from '@/components/voice/callContext'

// PROFESSIONAL PATTERN: Lazy-load heavy components (Vercel/Linear/Notion).
// CommandPalette is only needed when user presses Cmd+K — no point loading
// its code on every page navigation.
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false })

// Voice broadcast card — lazy too: it only matters when a call is live, and
// its realtime subscription starts only after the chunk loads.
const VoiceChatCard = dynamic(() => import('@/components/VoiceChatCard'), { ssr: false })

// Live pulse flash card — rotating live updates (chat, voice, events, wins)
// at the top of every page. Client-only: it runs realtime subscriptions.
const LivePulseFeed = dynamic(() => import('@/components/LivePulseFeed'), { ssr: false })

// Final desktop IA: Global/Community pillars, with Community expandable
// so secondary features live under their pillar instead of crowding the
// sidebar. Mirrors the mobile bar in mobileNav.ts. (Home feed, Discovery
// and Library were removed.)
// (Global is NOT listed here: it is rendered as its own expandable group
// below so its Live Voice child sits under Global, never under Community.)
const NAV_ITEMS = [
  // Games — its own top-level pillar. It used to hide under Community as
  // "Compete, Games & Clash"; it now holds only games.
  { label: 'Games', href: '/games', icon: 'gamepad' },
]

// Community pillar children — existing systems, relinked (no rebuilds).
// Games moved out to its own pillar (/games).
const COMMUNITY_CHILDREN = [
  { label: 'Communities', href: '/communities', icon: 'users' },
  { label: 'Groups', href: '/groups', icon: 'users' },
  { label: 'Live Chat', href: '/chat', icon: 'message' },
  { label: 'Confessions', href: '/community?view=confessions', icon: 'eyeOff' },
  // Compete — rankings, daily challenge and the Campus Clash contest.
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Connect', href: '/connections', icon: 'link' },
]

// Global pillar children — Live Voice lives here (moved OUT of Community):
// voice rooms are a platform-wide surface, and /global already hosts the
// free4talk-style board that opens them.
const GLOBAL_CHILDREN = [{ label: 'Live Voice', href: '/live-voice-chat', icon: 'mic' }]

const PROFILE_NAV = [{ label: 'Profile', href: '/profile', icon: 'user' }]

// Warmed right after mount — first click on any pillar is instant.
const PREFETCH_ROUTES = ['/global', '/community', '/profile', '/groups', '/games']

const FAB_ACTIONS = [
  { label: 'Ask ConnectToCampus', desc: 'Search, shortcuts & questions', icon: 'sparkles', action: 'cmd' as const },
  { label: 'Post an Idea', desc: 'Startups, projects & collabs', icon: 'flame', href: '/communities' },
  { label: 'Explore More', desc: 'All features in one place', icon: 'more', href: '/more' },
]

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <span
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: active ? 'var(--accent-light)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-muted)',
      }}
    >
      <Icon name={icon} size={15} strokeWidth={active ? 2.4 : 2} />
    </span>
  )
}

/**
 * SidebarGroup — an expandable sidebar pillar (Global, Community). The toggle
 * navigates to the pillar's page and expands its children; children render
 * indented with their own active state.
 */
function SidebarGroup({
  label,
  icon,
  items,
  open,
  active,
  pathname,
  onToggle,
  onNavigate,
  onPrefetch,
}: {
  label: string
  icon: string
  items: { label: string; href: string; icon: string }[]
  open: boolean
  active: boolean
  pathname: string
  onToggle: () => void
  onNavigate: (href: string) => void
  onPrefetch: (href: string) => void
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '9px 12px',
          borderRadius: 'var(--radius-sm)',
          background: active ? 'linear-gradient(90deg, var(--accent-light), transparent)' : 'transparent',
          color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
          border: 'none',
          fontSize: 14,
          fontWeight: active ? 600 : 500,
          cursor: 'pointer',
          marginBottom: 2,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
        }}
        className="nav-pill"
      >
        <NavIcon icon={icon} active={active} />
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        items.map((item) => {
          const childActive = isActive(item.href)
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              onMouseEnter={() => onPrefetch(item.href)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px 7px 40px',
                borderRadius: 'var(--radius-sm)',
                background: childActive ? 'linear-gradient(90deg, var(--accent-light), transparent)' : 'transparent',
                color: childActive ? 'var(--accent-text)' : 'var(--text-muted)',
                border: 'none',
                fontSize: 13,
                fontWeight: childActive ? 600 : 500,
                cursor: 'pointer',
                marginBottom: 2,
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <NavIcon icon={item.icon} active={childActive} />
              {item.label}
            </button>
          )
        })}
    </div>
  )
}

export default function Layout({ children, user, profile }: { children: React.ReactNode; user?: any; profile?: any }) {
  const router = useRouter()
  const pathname = usePathname()
  // The live call's compact bar parks in the same corner on a phone. While a
  // call is running it owns that space — the create button would sit on top of
  // the mic / leave controls at exactly the moment they matter most.
  const { session: callSession } = useCall()
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [fabOpen, setFabOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Desktop sidebar expandable pillars (Community, Library).
  const [communityOpen, setCommunityOpen] = React.useState(false)
  const [globalOpen, setGlobalOpen] = React.useState(false)
  const [logoSrc, setLogoSrc] = React.useState('/connect-to-campus-logo-dark.png')

  // Sync logo with theme changes
  React.useEffect(() => {
    setLogoSrc(getLogoSrc())
    const sync = () => setLogoSrc(getLogoSrc())
    window.addEventListener('cc-theme-change', sync)
    return () => window.removeEventListener('cc-theme-change', sync)
  }, [])

  // Close the mobile ☰ menu whenever the route changes.
  React.useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Poll unread count — deferred 2s so the first query doesn't compete with
  // the page's own data fetch. On messages page we poll more often (10s).
  React.useEffect(() => {
    if (!user) return
    const isMessagesPage = pathname.startsWith('/messages')
    const pollMs = isMessagesPage ? 10_000 : 60_000

    const fetchUnread = async () => {
      const sb = createClient()
      const { count } = await sb
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    }
    // Defer first fetch by 2s so page content loads first
    const timer = setTimeout(fetchUnread, 2000)
    const interval = setInterval(fetchUnread, pollMs)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [user, pathname])

  // Global shortcut: Cmd/Ctrl + K toggles the command palette.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock body scroll while the palette is open.
  React.useEffect(() => {
    document.documentElement.style.overflow = cmdOpen ? 'hidden' : ''
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [cmdOpen])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const communityActive =
    COMMUNITY_CHILDREN.some((c) => isActive(c.href)) || pathname === '/community' || pathname.startsWith('/community/')
  // Landing on a Community page auto-expands its group.
  React.useEffect(() => {
    if (communityActive) setCommunityOpen(true)
  }, [communityActive])

  const globalActive =
    GLOBAL_CHILDREN.some((c) => isActive(c.href)) || pathname === '/global' || pathname.startsWith('/global/')
  // Landing on a Global page auto-expands its group.
  React.useEffect(() => {
    if (globalActive) setGlobalOpen(true)
  }, [globalActive])

  // Prefetch pages on hover for instant navigation
  const prefetch = (href: string) => {
    try {
      router.prefetch(href)
    } catch {
      /* ignore */
    }
  }

  // Navigating to the SAME path with only a ?query change does not remount
  // the page component (Next reuses it), so pages wouldn't react to e.g.
  // /community?view=confessions while already on /community. Dispatch a
  // soft-navigate event those pages listen for.
  const navigate = (href: string) => {
    const path = href.split('?')[0]
    if (path === pathname) {
      window.dispatchEvent(new CustomEvent('cc-soft-navigate', { detail: { href } }))
    }
    router.push(href)
  }

  // SPEED: prefetch the five primary destinations right after mount so the
  // first navigation to each is instant (chunks land while the user reads).
  React.useEffect(() => {
    const t = setTimeout(() => {
      PREFETCH_ROUTES.forEach((href) => prefetch(href))
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Contextual accent for the current section — recolors the whole shell
  // (sidebar active states, FAB, bottom nav) to match the page identity.
  const sectionAccent = accentForPath(pathname)

  return (
    <div data-accent={sectionAccent} style={{ minHeight: 'var(--app-vh)', display: 'flex' }}>
      {/* ── Desktop Sidebar ── */}
      <aside
        style={{
          width: 240,
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 40,
        }}
        className="desktop-sidebar"
      >
        <div
          style={{
            padding: '0 12px 18px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <img src={logoSrc} alt="CTC" width={36} height={36} style={{ flexShrink: 0, borderRadius: 11 }} />
          <div>
            <h1
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              <BrandName />
            </h1>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Your campus, connected.</p>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }} aria-label="Main navigation">
          {/* Global pillar — expandable so its Live Voice child sits here. */}
          <SidebarGroup
            label="Global"
            icon="globe"
            items={GLOBAL_CHILDREN}
            open={globalOpen}
            active={globalActive}
            pathname={pathname}
            onToggle={() => {
              setGlobalOpen((v) => !v)
              navigate('/global')
            }}
            onNavigate={navigate}
            onPrefetch={prefetch}
          />

          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'linear-gradient(90deg, var(--accent-light), transparent)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  marginBottom: 2,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                }}
                className="nav-pill"
                onMouseEnter={() => prefetch(item.href)}
              >
                <NavIcon icon={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}

          {/* Community pillar — expandable on desktop (spec: secondary nav
              exposed through the sidebar; Live Chat etc. are NOT top-level). */}
          <SidebarGroup
            label="Community"
            icon="users"
            items={COMMUNITY_CHILDREN}
            open={communityOpen}
            active={communityActive}
            pathname={pathname}
            onToggle={() => {
              setCommunityOpen((v) => !v)
              navigate('/community')
            }}
            onNavigate={navigate}
            onPrefetch={prefetch}
          />

          <div style={{ height: 1, background: 'var(--border)', margin: '12px 10px' }} />

          {PROFILE_NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                onMouseEnter={() => prefetch(item.href)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'linear-gradient(90deg, var(--accent-light), transparent)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  marginBottom: 2,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                }}
                className="nav-pill"
              >
                <NavIcon icon={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {user && profile && (
          <div style={{ padding: '10px 6px 0', borderTop: '1px solid var(--border)' }}>
            <div
              onClick={() => router.push('/profile')}
              className="nav-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '9px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profile?.full_name || 'You'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{profile?.username}</p>
              </div>
            </div>
            {profile?.streak_days > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, padding: '0 8px' }}>
                <span
                  style={{
                    fontSize: 11,
                    background: 'var(--orange-light)',
                    color: 'var(--orange-text)',
                    padding: '3px 8px',
                    borderRadius: 20,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="flame" size={12} /> {profile.streak_days}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    background: 'var(--yellow-light)',
                    color: 'var(--yellow-text)',
                    padding: '3px 8px',
                    borderRadius: 20,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon name="star" size={12} /> {profile.karma_points || 0}
                </span>
              </div>
            )}
          </div>
        )}

        {!user && (
          <div style={{ padding: '12px 6px 0', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => router.push('/auth/signup')}
              style={{
                width: '100%',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: 8,
              }}
            >
              Join Free
            </button>
            <button
              onClick={() => router.push('/auth/login')}
              style={{
                width: '100%',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Sign In
            </button>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, minWidth: 0, marginLeft: 240, paddingBottom: 88 }} className="main-content">
        {/* Desktop top bar */}
        <div
          className="app-topbar"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: '0 auto',
              padding: '10px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <button
              onClick={() => setCmdOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                flex: 1,
                maxWidth: 420,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                boxShadow: '0 0 0 0 transparent',
              }}
              className="search-pill"
              aria-label="Open search"
            >
              <Icon name="search" size={15} />
              <span style={{ flex: 1, textAlign: 'left' }}>Ask ConnectToCampus…</span>
              <kbd
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'inherit',
                }}
              >
                ⌘K
              </kbd>
            </button>
            <div style={{ flex: 1 }} />
            <LogoToggle size={36} />
            <ThemeToggle mode="plain" />
            <button
              onClick={() => router.push('/notifications')}
              aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Icon name="bell" size={17} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 10,
                    background: 'var(--danger)',
                    color: 'var(--on-accent)',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <Avatar
              name={profile?.full_name}
              avatarUrl={profile?.avatar_url}
              size={38}
              border
              onClick={() => router.push('/profile')}
            />
          </div>
        </div>

        {/* Mobile top bar */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            padding: '12px 16px',
            zIndex: 30,
            display: 'none',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
          className="mobile-topbar"
        >
          {/* ONE line, always. The brand truncates with an ellipsis instead of
              the controls dropping onto a second row — a wrapped bar read as a
              broken header on phones (and the 1.06 UI scale made it wrap on
              every 390–430px device, since the row needed ~398px).

              Going nowrap is safe now: the title carries `overflow: hidden`
              and a `min-width: 0` chain, so its automatic minimum size is 0 and
              the row's min-content is just the controls (~110px with padding) —
              it can never exceed the phone. The old ~425px min-content that
              stretched <main> and got clipped by the shell's overflow-x: clip
              is gone. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'nowrap',
              minWidth: 0,
            }}
          >
            {/* flex 1 1 auto: the brand absorbs all the shrink (ellipsis) and
                the controls keep their full touch size. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
              <img src={logoSrc} alt="CTC" width={30} height={30} style={{ borderRadius: 9, flexShrink: 0 }} />
              <h1
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                <BrandName />
              </h1>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexWrap: 'wrap',
                rowGap: 6,
                justifyContent: 'flex-end',
                minWidth: 0,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setCmdOpen(true)}
                aria-label="Search"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Icon name="search" size={17} />
              </button>
              {/* Decorative theme-synced logo badge — the mobile bar already
                  shows the brand logo on the left, so this duplicate is hidden
                  here (globals.css `.mobile-hide-logo`). It took 42px of the
                  row, which is what pushed the controls onto a second line. */}
              <span className="mobile-hide-logo">
                <LogoToggle size={36} />
              </span>
              <ThemeToggle mode="inline" />
              {!user ? (
                <button
                  onClick={() => router.push('/auth/login')}
                  style={{
                    fontSize: 13,
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    cursor: 'pointer',
                    minHeight: 38,
                  }}
                >
                  Sign in
                </button>
              ) : (
                <Avatar
                  name={profile?.full_name}
                  avatarUrl={profile?.avatar_url}
                  size={36}
                  border
                  onClick={() => router.push('/profile')}
                />
              )}
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: menuOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: menuOpen ? 'var(--accent-light)' : 'var(--bg)',
                  color: menuOpen ? 'var(--accent-text)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Icon name="menu" size={17} />
              </button>
            </div>
          </div>
        </div>

        <div key={pathname} className="page-enter">
          {/* No-campus banner */}
          {user &&
            profile &&
            !profile.campus_id &&
            profile.college_id &&
            !pathname.startsWith('/onboarding') &&
            !pathname.startsWith('/campus-change') &&
            !pathname.startsWith('/admin') && (
              <div
                style={{
                  maxWidth: 680,
                  margin: '0 auto 16px',
                  padding: '14px 18px',
                  background: 'var(--accent-light)',
                  border: '1px solid var(--accent-border, var(--accent))',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--accent)' }} aria-hidden="true">
                  <Icon name="school" size={24} strokeWidth={2} />
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: '0 0 2px' }}>
                    You don&apos;t have a campus assigned yet
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--accent-text)', margin: 0 }}>
                    Request a campus to access campus-specific content and communities.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/campus-change')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="school" size={14} strokeWidth={2.2} />
                  Request Campus
                </button>
              </div>
            )}
          {children}
        </div>
      </main>

      {/* Live pulse — one flash card of genuine platform activity. Lives
          OUTSIDE .page-enter (which animates transform on every navigation):
          a transformed ancestor makes position:fixed position against IT, so
          the bottom-right card would jump/misplace on every page change. */}
      <LivePulseFeed userId={user?.id ?? null} />

      {/* ── Global voice broadcast card — bottom-right on every page ── */}
      <VoiceChatCard />

      {/* ── Mobile bottom nav (shared 4-tab bar) ── */}
      <MobileBottomNav pathname={pathname} onNavigate={(href) => router.push(href)} />

      {/* ── Mobile ☰ menu (shared dropdown) ── */}
      <MobileMenu
        open={menuOpen}
        top={54}
        pathname={pathname}
        onClose={() => setMenuOpen(false)}
        onNavigate={(href) => router.push(href)}
      />

      {/* ── Mobile floating action button ── */}
      <div className="fab-wrap" role="menu" aria-label="Create" data-hidden={callSession ? '1' : '0'}>
        {fabOpen && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              width: 250,
              padding: 6,
            }}
          >
            {FAB_ACTIONS.map((a) => (
              <button
                key={a.label}
                role="menuitem"
                onClick={() => {
                  setFabOpen(false)
                  if ('action' in a && a.action === 'cmd') setCmdOpen(true)
                  else router.push((a as any).href)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'var(--accent-light)',
                    color: 'var(--accent-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon name={a.icon} size={16} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {a.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <button
          className="fab-btn"
          onClick={() => setFabOpen((o) => !o)}
          aria-label={fabOpen ? 'Close menu' : 'Create'}
          aria-expanded={fabOpen}
          aria-haspopup="menu"
        >
          <Icon name={fabOpen ? 'x' : 'plus'} size={24} />
        </button>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
