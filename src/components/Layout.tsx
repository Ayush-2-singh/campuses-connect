'use client'
import React from 'react'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { label: 'Feed', href: '/feed', icon: 'feed' },
  { label: 'Opportunities', href: '/opportunities', icon: 'opp' },
  { label: 'Notes', href: '/notes', icon: 'notes' },
  { label: 'Talent', href: '/talent', icon: 'talent' },
  { label: 'Meetings', href: '/meetings', icon: 'meetings' },
  { label: 'More', href: '/more', icon: 'more' },
]

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const imageIcons: Record<string, string> = {
    feed: '/feed-icon.jpeg',
    opp: '/opportunity-icon.jpeg',
    notes: '/notes-icon.jpeg',
    talent: '/talent-icon.jpeg',
    more: '/more-icon.jpeg',
  }

  // Image-based icons
  if (imageIcons[icon]) {
    return (
      <img
        src={imageIcons[icon]}
        alt={icon}
        style={{
          width: 28, height: 28, objectFit: 'cover', borderRadius: '50%', flexShrink: 0,
          border: active ? '2px solid var(--accent)' : '2px solid #e5e7eb',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      />
    )
  }

  // Emoji / text icon for Meetings (no image file)
  if (icon === 'meetings') {
    return (
      <span style={{
        width: 28, height: 28, borderRadius: '50%', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0,
        background: active ? 'var(--accent)' : '#f1f5f9',
        border: active ? '2px solid var(--accent)' : '2px solid #e5e7eb',
        transition: 'transform 0.2s ease',
      }}>
        📅
      </span>
    )
  }

  return (
    <span style={{
      width: 28, height: 28, background: active ? 'var(--accent)' : 'var(--border)',
      borderRadius: '50%', display: 'inline-block', flexShrink: 0,
    }} />
  )
}

export default function Layout({ children, user, profile }: { children: React.ReactNode; user?: any; profile?: any }) {
  const router = useRouter()
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = React.useState(0)

  React.useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      const sb = createClient()
      const { count } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false)
      setUnreadCount(count || 0)
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [user])

  const avatarColor = (name: string) => {
    const colors = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626', '#0891b2']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  // Mobile bottom nav shows first 5 items to avoid crowding
  const mobileNavItems = NAV_ITEMS.slice(0, 5)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        style={{ width: 220, position: 'fixed', top: 0, left: 0, bottom: 0, background: 'white', borderRight: '1px solid var(--border)', padding: '20px 0', display: 'flex', flexDirection: 'column', zIndex: 20 }}
        className="desktop-sidebar"
      >
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 2px' }}>
            Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>PW IOI · Lucknow</p>
        </div>

        {user && (
          <div onClick={() => router.push('/notifications')}
            style={{ margin: '8px 10px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Notifications</span>
            </div>
            {unreadCount > 0 && (
              <span style={{ background: '#dc2626', color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20 }}>{unreadCount}</span>
            )}
          </div>
        )}
        <nav style={{ padding: '14px 10px', flex: 1, overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 10,
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none', fontSize: 14, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <NavIcon icon={item.icon} active={active} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {user && profile && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            <div
              onClick={() => router.push('/profile')}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '9px 10px', borderRadius: 10, background: 'var(--bg-secondary)' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {profile?.full_name?.[0] || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.full_name || 'You'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>@{profile?.username}</p>
              </div>
            </div>
            {profile?.streak_days > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 11, background: '#fff7ed', color: '#c2410c', padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>🔥 {profile.streak_days} streak</span>
                <span style={{ fontSize: 11, background: '#fefce8', color: '#a16207', padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>⭐ {profile.karma_points || 0}</span>
              </div>
            )}
          </div>
        )}

        {!user && (
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => router.push('/auth/signup')}
              style={{ width: '100%', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}
            >Join Free</button>
            <button
              onClick={() => router.push('/auth/login')}
              style={{ width: '100%', background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >Sign In</button>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, marginLeft: 220, paddingBottom: 80 }} className="main-content">

        {/* Mobile Topbar */}
        <div
          style={{ position: 'sticky', top: 0, background: 'white', borderBottom: '1px solid var(--border)', padding: '12px 16px', zIndex: 10, display: 'none' }}
          className="mobile-topbar"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user && profile?.streak_days > 0 && (
                <span style={{ fontSize: 12, background: '#fff7ed', color: '#c2410c', padding: '3px 8px', borderRadius: 20, fontWeight: 500 }}>🔥 {profile.streak_days}</span>
              )}
              {!user ? (
                <button
                  onClick={() => router.push('/auth/login')}
                  style={{ fontSize: 13, color: 'var(--accent)', border: '1px solid var(--accent)', padding: '5px 12px', borderRadius: 8, background: 'white', cursor: 'pointer' }}
                >Sign in</button>
              ) : (
                <div
                  onClick={() => router.push('/profile')}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(profile?.full_name || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >{profile?.full_name?.[0] || '?'}</div>
              )}
            </div>
          </div>
        </div>

        {children}
      </main>

      {/* ── Mobile Bottom Nav (first 5 items) ── */}
      <div
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid var(--border)', zIndex: 20, display: 'none' }}
        className="mobile-bottomnav"
      >
        <div style={{ display: 'flex' }}>
          {mobileNavItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0 6px', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <NavIcon icon={item.icon} active={active} />
                <span style={{ fontSize: 10, color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .main-content { margin-left: 0 !important; }
          .mobile-topbar { display: block !important; }
          .mobile-bottomnav { display: block !important; }
        }
      `}</style>
    </div>
  )
}
