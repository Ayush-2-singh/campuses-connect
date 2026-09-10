'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getSafeRedirect } from '@/lib/auth'
import { redirectToCanonicalOrigin } from '@/lib/canonical-origin'

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 18.9 14 24 14c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.5 35.1 26.9 36 24 36c-5.2 0-9.7-3.3-11.3-7.9l-6.6 5.1C9.4 39.7 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.6l.1-.1 6.3 5.2C37.3 39.1 44 34 44 24c0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

/**
 * One click → Google → /auth/callback → session cookies → destination.
 * No intermediate pages. While the browser is navigating to Google the
 * button is disabled (double-click cannot start a second OAuth flow —
 * TEST 4), and failures show a retryable error inline.
 */
export default function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    if (loading) return // double-click guard
    setLoading(true)
    setError('')

    // OAuth + PKCE cookies are origin-scoped: if the user opened the site on
    // the apex domain (or any non-canonical origin), bounce to www first so
    // start → Google → callback all happen on ONE origin. The PKCE verifier
    // cookie would otherwise be unreachable by the callback (TEST 1/2 fix).
    if (redirectToCanonicalOrigin()) return

    try {
      const supabase = createClient()
      // Preserve the original destination (?redirect=/protected-page) through
      // the OAuth round-trip; validated again server-side in the callback.
      const next = getSafeRedirect(new URLSearchParams(window.location.search).get('redirect'), '/feed')
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      if (next !== '/feed') callbackUrl.searchParams.set('next', next)

      // PKCE flow: @supabase/ssr's browser client defaults flowType to 'pkce',
      // storing the code verifier in an origin-scoped cookie (see guard above).
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      })

      // On success the browser navigates away to Google. If we're still here,
      // the flow failed to start — show a useful, retryable error.
      if (err) throw err
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in is unavailable. Please try again.'
      setError(getAuthErrorMessage(message))
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handle}
        disabled={loading}
        aria-busy={loading}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'var(--bg)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          padding: '11px',
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          fontFamily: 'inherit',
        }}
      >
        <GoogleG />
        {loading ? 'Connecting to Google...' : label}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '8px 0 0', textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  )
}
