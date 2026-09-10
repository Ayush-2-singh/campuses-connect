'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getSafeRedirect } from '@/lib/auth'
import { redirectToCanonicalOrigin } from '@/lib/canonical-origin'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import ThemeToggle from '@/components/ThemeToggle'

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '11px 14px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--bg)',
  boxSizing: 'border-box' as const,
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // If this page is running on a non-canonical origin (e.g. apex
    // connecttocampus.com from a cached page), move to www first — auth
    // cookies are origin-scoped and the callback runs on www.
    if (redirectToCanonicalOrigin()) return
    const params = new URLSearchParams(window.location.search)
    const callbackError = params.get('error')
    if (!callbackError) return
    const rawDetail = params.get('ed') || ''
    const messages: Record<string, string> = {
      redirect_url_mismatch:
        'Google blocked the sign-in: this site\u2019s URL is not whitelisted in the OAuth settings. Try email instead.',
      invalid_request: 'Google sign-in request was invalid (OAuth configuration issue). Try email instead.',
      access_denied: 'Google sign-in was cancelled or denied. Please try again.',
      oauth_failed: 'We could not complete Google sign-in. Please try again or use email.',
    }
    let msg = messages[callbackError] || 'We could not complete Google sign-in. Please try again or use email.'
    // Debug aid while sign-in is being stabilised: show the provider's raw
    // reason so failures are diagnosable (no secrets are in these strings).
    if (rawDetail) msg += ` — Detail: ${rawDetail}`
    setError(msg)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    if (err) {
      setError(getAuthErrorMessage(err.message))
      setLoading(false)
      return
    }
    router.refresh()
    const target = getSafeRedirect(new URLSearchParams(window.location.search).get('redirect'), '/feed')
    router.replace(target)
  }

  return (
    <div
      data-accent="gold"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Connect<span style={{ color: 'var(--accent)' }}>ToCampus</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Your campus. Your community.</p>
        </div>
        <div
          style={{
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 28,
            boxShadow: 'var(--shadow)',
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>
            Welcome back
          </h2>
          <GoogleSignInButton />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>or with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          {error && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                background: 'var(--danger-light)',
                border: '1px solid var(--danger-border)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  htmlFor="login-email"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                  <Link
                    href="/auth/forgot-password"
                    style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder="Your password"
                  autoComplete="current-password"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'var(--disabled)' : 'var(--accent)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 10,
                padding: '12px',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginTop: 20,
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 16, marginBottom: 0 }}>
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              Sign up
            </Link>
          </p>
        </div>
        <div style={{ position: 'fixed', top: 16, right: 16 }}>
          <ThemeToggle mode="floating" />
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
          ConnectToCampus is an independent student platform, not affiliated with any institution.
        </p>
      </div>
    </div>
  )
}
