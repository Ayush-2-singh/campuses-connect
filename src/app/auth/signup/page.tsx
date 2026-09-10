'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuthErrorMessage, getPasswordError, getSafeRedirect } from '@/lib/auth'
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

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Origin-scoped auth cookies: start the flow on www (canonical) always.
    if (redirectToCanonicalOrigin()) return
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = fullName.trim()
    if (!normalizedName || !normalizedEmail || !password) {
      setError('Please fill in all fields.')
      return
    }
    const passwordError = getPasswordError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setLoading(true)
    setError('')
    const redirectPath = getSafeRedirect(new URLSearchParams(window.location.search).get('redirect'), '/onboarding')
    const emailRedirectTo = new URL('/auth/callback', window.location.origin)
    emailRedirectTo.searchParams.set('next', redirectPath)
    const { data, error: err } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: normalizedName }, emailRedirectTo: emailRedirectTo.toString() },
    })
    if (err) {
      setError(getAuthErrorMessage(err.message))
      setLoading(false)
      return
    }
    if (data.session) {
      router.refresh()
      router.replace(redirectPath)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success)
    return (
      <div
        data-accent="gold"
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            background: 'var(--bg)',
            borderRadius: 16,
            border: '1px solid var(--border)',
            padding: 32,
            textAlign: 'center',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            Check your email
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Click the link to activate your account. You will be taken back to finish setup.
          </p>
          <Link
            href="/auth/login"
            style={{
              display: 'inline-block',
              marginTop: 16,
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to login
          </Link>
        </div>
      </div>
    )

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
            Create your account
          </h2>
          <GoogleSignInButton label="Sign up with Google" />
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
          <form onSubmit={handleSignup} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  htmlFor="signup-name"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Full name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="signup-email"
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
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  autoComplete="email"
                  required
                />
              </div>
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="8+ characters"
                autoComplete="new-password"
              />
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
              Use 8+ characters with uppercase, lowercase, and a number.
            </p>
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
                marginTop: 14,
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 16, marginBottom: 0 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
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
