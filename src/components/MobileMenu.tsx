'use client'

import { useEffect } from 'react'
import { Icon } from '@/components/icons'
import { MOBILE_MENU_NAV } from '@/components/mobileNav'

export default function MobileMenu({
  open,
  top = 54,
  pathname,
  onClose,
  onNavigate,
}: {
  open: boolean
  top?: number
  pathname: string
  onClose: () => void
  onNavigate: (href: string) => void
}) {
  // Close the menu with the Escape key.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 24, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        style={{ position: 'fixed', top, left: 8, right: 8, zIndex: 40, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', padding: 8, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}
        role="menu"
        aria-label="All features"
      >
        {MOBILE_MENU_NAV.map(item => {
          const active = isActive(item.href)
          return (
            <button
              key={item.href}
              role="menuitem"
              onClick={() => { onClose(); onNavigate(item.href) }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: active ? 'var(--accent-light)' : 'transparent', border: 'none', cursor: 'pointer', color: active ? 'var(--accent-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 500 }}
            >
              <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: active ? 'var(--accent-light)' : 'var(--bg-tertiary)', color: active ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                <Icon name={item.icon} size={16} />
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
