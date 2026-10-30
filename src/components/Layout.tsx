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
import TopNav from '@/components/TopNav'
import { useCall } from '@/components/voice/callContext'

// PROFESSIONAL PATTERN: Lazy-load heavy components (Vercel/Linear/Notion).
// CommandPalette is only needed when user presses Cmd+K — no point loading
// its code on every page navigation.
const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false })

// NOTE: the social-plane shell widgets (LivePulseFeed, VoiceChatCard) were
// retired with the V4 pivot to campus hiring. Their components still exist on
// disk — re-mount them alongside SOCIAL_LAYER_RETIRED = false in
// src/lib/featureGates.ts.

// Desktop destinations live in <TopNav> (horizontal nav, dropdown pillars).
// This file only warms their routes so the first click is instant.

// Warmed right after mount — first click on any destination is instant.
const PREFETCH_ROUTES = ['/live-voice-chat', '/experiences', '/compete', '/messages', '/profile']

const FAB_ACTIONS = [
  { label: 'Ask ConnectToCampus', desc: 'Search, shortcuts & questions', icon: 'sparkles', action: 'cmd' as const },
  { label: 'Read experiences', desc: 'Interview rounds and companies', icon: 'pencil', href: '/experiences' },
  { label: 'Join a room', desc: 'Study live with your batch', icon: 'mic', href: '/live-voice-chat' },
]

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
  // (top-nav active states, FAB, bottom nav) to match the page identity.
  const sectionAccent = accentForPath(pathname)
  // The reading section is orange with blue primary actions. The flag lives on
  // the shell so every Experiences/blog page (and its nested routes) gets the
  // same button treatment without hardcoding colors in each component.
  const experienceTheme = pathname.startsWith('/experiences') || pathname.startsWith('/blog')

  return (
    <div
      data-accent={sectionAccent}
      data-experience={experienceTheme ? '1' : undefined}
      style={{ minHeight: 'var(--app-vh)', display: 'flex', flexDirection: 'column' }}
    >
      {/* ── Horizontal top nav (desktop) ── */}
      <TopNav
        pathname={pathname}
        onNavigate={navigate}
        onPrefetch={prefetch}
        onOpenSearch={() => setCmdOpen(true)}
        unreadCount={unreadCount}
        logoSrc={logoSrc}
        user={user}
        profile={profile}
      />

      <main style={{ flex: 1, minWidth: 0, paddingBottom: 88 }} className="main-content">
        {/* Mobile top bar */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: 'color-mix(in srgb, var(--bg-page) 86%, transparent)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
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
                  onClick={() => router.push('/profile')}
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

      {/* Social-plane widgets (live pulse, voice broadcast card) are retired
          with the V4 pivot. See src/lib/featureGates.ts. */}

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
