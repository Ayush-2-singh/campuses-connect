'use client'
import React from 'react'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import CommandPalette from '@/components/CommandPalette'
import { Icon } from '@/components/icons'
import { AVATAR_COLORS, accentForPath } from '@/theme/colors'

const NAV_ITEMS = [
  { label: 'Home', href: '/feed', icon: 'home' },
  { label: 'Classroom', href: '/college', icon: 'book' },
  { label: 'Events', href: '/events', icon: 'calendar' },
  { label: 'Compete', href: '/compete', icon: 'zap' },
  { label: 'Opportunities', href: '/opportunities', icon: 'briefcase' },
  { label: 'Notes', href: '/notes', icon: 'notebook' },
  { label: 'Talent', href: '/talent', icon: 'star' },
  { label: 'Communities', href: '/communities', icon: 'users' },
]

const SECONDARY_NAV = [
  { label: 'More', href: '/more', icon: 'more' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

const MOBILE_NAV = [
  { label: 'Home', href: '/feed', icon: 'home' },
  { label: 'Classroom', href: '/college', icon: 'book' },
  { label: 'Opportunities', href: '/opportunities', icon: 'briefcase' },
  { label: 'Communities', href: '/communities', icon: 'users' },
  { label: 'Profile', href: '/profile', icon: 'user' },
]

const FAB_ACTIONS = [
  { label: 'Ask Campus Connect', desc: 'Search, shortcuts & questions', icon: 'sparkles', action: 'cmd' as const },
  { label: 'Upload Note', desc: 'Add a resource to the library', icon: 'notebook', href: '/notes' },
  { label: 'Post Opportunity', desc: 'Internships, hackathons & more', icon: 'briefcase', href: '/opportunities' },
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

export default function Layout({ children, user, profile }: { children: React.ReactNode; user?: any; profile?: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [fabOpen, setFabOpen] = React.useState(false)

  React.useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      const sb = createClient()
      const { count } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('recipient_id', user.id).eq('is_read', false)
      setUnreadCount(count || 0)
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user])

  // Global shortcut: Cmd/Ctrl + K toggles the command palette.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock body scroll while the palette is open.
  React.useEffect(() => {
    document.documentElement.style.overflow = cmdOpen ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [cmdOpen])

  const avatarColor = (name: string) => {
    return AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Contextual accent for the current section — recolors the whole shell
  // (sidebar active states, FAB, bottom nav) to match the page identity.
  const sectionAccent = accentForPath(pathname)

  return (
    <div data-accent={sectionAccent} style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        style={{ width: 240, position: 'fixed', top: 0, left: 0, bottom: 0, background: 'var(--bg)', borderRight: '1px solid var(--border)', padding: '20px 12px', display: 'flex', flexDirection: 'column', zIndex: 40 }}
        className="desktop-sidebar"
      >
        <div style={{ padding: '0 12px 18px', borderBottom: '1px solid var(--border)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', flexShrink: 0 }}>
            <Icon name="grad" size={19} />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
              Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
            </h1>
            <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>Your campus, connected.</p>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '2px 0' }} aria-label="Main navigation">
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--accent-light)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  border: 'none', fontSize: 14, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <NavIcon icon={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '12px 10px' }} />

          {SECONDARY_NAV.map(item => {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--accent-light)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                  border: 'none', fontSize: 14, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
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
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '9px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {profile?.full_name?.[0] || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || 'You'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{profile?.username}</p>
              </div>
            </div>
            {profile?.streak_days > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, padding: '0 8px' }}>
                <span style={{ fontSize: 11, background: 'var(--orange-light)', color: 'var(--orange-text)', padding: '3px 8px', borderRadius: 20, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="flame" size={12} /> {profile.streak_days}
                </span>
                <span style={{ fontSize: 11, background: 'var(--yellow-light)', color: 'var(--yellow-text)', padding: '3px 8px', borderRadius: 20, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
              style={{ width: '100%', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}
            >Join Free</button>
            <button
              onClick={() => router.push('/auth/login')}
              style={{ width: '100%', background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >Sign In</button>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, marginLeft: 240, paddingBottom: 88 }} className="main-content">

        {/* Desktop top bar */}
        <div
          className="app-topbar"
          style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setCmdOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, maxWidth: 420, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
              aria-label="Open search"
            >
              <Icon name="search" size={15} />
              <span style={{ flex: 1, textAlign: 'left' }}>Ask Campus Connect…</span>
              <kbd style={{ background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '2px 6px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'inherit' }}>⌘K</kbd>
            </button>
            <div style={{ flex: 1 }} />
            <ThemeToggle mode="plain" />
            <button
              onClick={() => router.push('/notifications')}
              aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
              style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Icon name="bell" size={17} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 10, background: 'var(--danger)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push('/profile')}
              aria-label="Profile"
              style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)', background: avatarColor(profile?.full_name || ''), color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {profile?.full_name?.[0] || '?'}
            </button>
          </div>
        </div>

        {/* Mobile top bar */}
        <div
          style={{ position: 'sticky', top: 0, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '12px 16px', zIndex: 30, display: 'none' }}
          className="mobile-topbar"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
                <Icon name="grad" size={16} />
              </div>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setCmdOpen(true)}
                aria-label="Search"
                style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Icon name="search" size={15} />
              </button>
              <ThemeToggle mode="inline" />
              {user && profile?.streak_days > 0 && (
                <span style={{ fontSize: 12, background: 'var(--orange-light)', color: 'var(--orange-text)', padding: '3px 8px', borderRadius: 20, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="flame" size={12} /> {profile.streak_days}
                </span>
              )}
              {!user ? (
                <button
                  onClick={() => router.push('/auth/login')}
                  style={{ fontSize: 13, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '5px 12px', borderRadius: 8, background: 'var(--bg)', cursor: 'pointer' }}
                >Sign in</button>
              ) : (
                <div
                  onClick={() => router.push('/profile')}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >{profile?.full_name?.[0] || '?'}</div>
              )}
            </div>
          </div>
        </div>

        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <div
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)', zIndex: 50, display: 'none' }}
        className="mobile-bottomnav"
      >
        <div style={{ display: 'flex' }}>
          {MOBILE_NAV.map(item => {
            const active = isActive(item.href)
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 0 8px', background: 'none', border: 'none', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'inherit' }}
              >
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Mobile floating action button ── */}
      <div className="fab-wrap" role="menu" aria-label="Create">
        {fabOpen && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', width: 250, padding: 6 }}>
            {FAB_ACTIONS.map(a => (
              <button
                key={a.label}
                role="menuitem"
                onClick={() => { setFabOpen(false); if ('action' in a && a.action === 'cmd') setCmdOpen(true); else router.push((a as any).href) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={a.icon} size={16} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <button
          className="fab-btn"
          onClick={() => setFabOpen(o => !o)}
          aria-label={fabOpen ? 'Close menu' : 'Create'}
          aria-expanded={fabOpen}
          aria-haspopup="menu"
        >
          <Icon name={fabOpen ? 'x' : 'plus'} size={24} />
        </button>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      <style>{`
        .app-topbar { display: none; }
        @media (min-width: 769px) {
          .app-topbar { display: block !important; }
        }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; }
          .mobile-topbar { display: block !important; }
          .mobile-bottomnav { display: block !important; }
          .app-topbar { display: none !important; }
        }
      `}</style>
    </div>
  )
}
