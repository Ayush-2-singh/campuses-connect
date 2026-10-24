'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CONSENT_EVENT, CONSENT_KEY, consentCookie, readConsent, type ConsentChoice } from '@/lib/consent'

/**
 * COOKIE CONSENT — one banner, two clear choices: "Accept all" and
 * "Reject non-essential".
 *
 * What actually runs here:
 *   • STRICTLY NECESSARY — the Supabase auth session cookie. Cannot be
 *     switched off; without it nobody can stay signed in, so the banner does
 *     not pretend to offer it as a toggle.
 *   • NON-ESSENTIAL — optional analytics, loaded only by <Analytics /> after an
 *     "Accept all". Rejecting it leaves the product fully working.
 *
 * The choice is written to BOTH a first-party cookie (so any server-side reader
 * can see it on the next request) and localStorage (so the banner can hide
 * itself synchronously on the next paint without waiting for hydration). It is
 * broadcast on the 'cc-consent' event so components react without prop drilling.
 */
// Re-exported so existing importers (Analytics) keep one import site.
export { CONSENT_EVENT }
export type { ConsentChoice }

export function getCookieConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null
  return readConsent(window.localStorage, document.cookie)
}

function persist(value: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value)
  } catch {
    /* storage blocked — the cookie below still records the choice */
  }
  document.cookie = consentCookie(value, window.location.protocol === 'https:')
}

/**
 * Re-open the banner (e.g. from a "Cookie settings" link in the footer).
 * Exported so a future settings entry point does not need its own copy of the
 * state machine.
 */
export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: 'open' }))
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!getCookieConsent()) setVisible(true)
    const reopen = (event: Event) => {
      if ((event as CustomEvent).detail === 'open') setVisible(true)
    }
    window.addEventListener(CONSENT_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_EVENT, reopen)
  }, [])

  const decide = (value: ConsentChoice) => {
    persist(value)
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
    setVisible(false)
  }

  if (!visible) return null

  const buttonBase: React.CSSProperties = {
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        background: 'var(--bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        padding: '14px 16px',
        maxWidth: 760,
        margin: '0 auto',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <p id="cookie-consent-title" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
          Cookies
        </p>
        <p
          id="cookie-consent-body"
          style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}
        >
          Essential cookies keep you signed in — they are always on. Non-essential cookies are analytics only, and
          nothing loads without your consent. Read the{' '}
          <Link href="/cookies" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>
            Cookie Policy
          </Link>
          .
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => decide('denied')}
          style={{
            ...buttonBase,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border-strong)',
          }}
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => decide('granted')}
          style={{
            ...buttonBase,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            border: 'none',
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  )
}
