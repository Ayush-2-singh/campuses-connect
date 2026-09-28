'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * COOKIE CONSENT — one lightweight banner, shown once.
 *
 * The app only uses cookies that are strictly necessary (the Supabase auth
 * session) plus localStorage for theme/flags, so there is no tracking to
 * opt into by default. The banner exists to (a) disclose what is stored and
 * (b) gate OPTIONAL analytics: the Analytics component waits for a
 * 'granted' choice before loading any measurement script.
 *
 * Choice persists in localStorage ('cc-cookie-consent') and is broadcast on
 * the 'cc-consent' event so other components can react without a prop drill.
 */
const KEY = 'cc-cookie-consent'
export const CONSENT_EVENT = 'cc-consent'

export function getCookieConsent(): 'granted' | 'denied' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true)
  }, [])

  const decide = (value: 'granted' | 'denied') => {
    try {
      window.localStorage.setItem(KEY, value)
    } catch {
      /* storage blocked — treat as declined, never nag */
    }
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        padding: '12px 14px',
        maxWidth: 720,
        margin: '0 auto',
      }}
    >
      <p
        style={{ flex: 1, minWidth: 200, margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}
      >
        We use essential cookies to keep you signed in, and optional analytics to improve the platform. See our{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => decide('denied')}
          style={{
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Decline
        </button>
        <button
          onClick={() => decide('granted')}
          style={{
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
            borderRadius: 10,
            padding: '9px 16px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  )
}
