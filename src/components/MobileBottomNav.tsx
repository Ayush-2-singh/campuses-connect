'use client'

import { useEffect } from 'react'
import { Icon } from '@/components/icons'
import { MOBILE_NAV } from '@/components/mobileNav'

export default function MobileBottomNav({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate: (href: string) => void
}) {
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // Hide the fixed bars while the user types so the on-screen keyboard never
  // covers them (classic mobile-web trap). Restored shortly after blur.
  useEffect(() => {
    const isFormField = (el: Element | null) => !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    const onFocusIn = () => { if (isFormField(document.activeElement)) document.documentElement.classList.add('nav-hidden') }
    const onFocusOut = () => {
      // Only restore once the on-screen keyboard has actually closed — on iOS,
      // blur can fire while the keyboard is still visible.
      setTimeout(() => {
        const field = isFormField(document.activeElement)
        const kbOpen = window.visualViewport ? window.visualViewport.height < window.innerHeight - 60 : false
        if (!field && !kbOpen) document.documentElement.classList.remove('nav-hidden')
      }, 150)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.documentElement.classList.remove('nav-hidden')
    }
  }, [])

  return (
    <div
      className="mobile-bottomnav"
      style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)', zIndex: 50, display: 'none' }}
    >
      <div style={{ display: 'flex' }}>
        {MOBILE_NAV.map(item => {
          const active = isActive(item.href)
          return (
            <button
              key={item.href}
              onClick={() => onNavigate(item.href)}
              aria-current={active ? 'page' : undefined}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              <span
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: '7px 16px',
                  borderRadius: 16,
                  background: active ? 'var(--accent-light)' : 'transparent',
                  transition: 'background 0.18s ease, color 0.18s ease',
                }}
              >
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.4 : 2} />
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', color: active ? 'var(--accent-text)' : 'var(--text-muted)' }}>{item.label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
