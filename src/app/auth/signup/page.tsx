'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PasswordField from '@/components/PasswordField'
import GoogleSignInButton from '@/components/GoogleSignInButton'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async () => {
    if (!fullName || !email || !password) { setError('Please fill in all fields'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      // Email confirmation is disabled — user is immediately logged in.
      // Honor ?redirect=<path> (guests coming from a protected page) so they
      // return there after signing up. replace() keeps back working.
      router.refresh()
      let target = '/onboarding'
      try {
        const r = new URLSearchParams(window.location.search).get('redirect')
        if (r && r.startsWith('/') && !r.startsWith('/auth')) target = r
      } catch { /* ignore */ }
      router.replace(target)
    } else {
      // Email confirmation is enabled — show "check your inbox" screen
      setSuccess(true)
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--border)', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
    color: 'var(--text-primary)', background: 'var(--bg)', boxSizing: 'border-box' as const
  }

  if (success) return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Check your email</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          We sent a confirmation link to <strong>{email}</strong>
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
          Click the link in the email to activate your account, then sign in.
        </p>
        <Link href="/auth/login" style={{ display: 'inline-block', marginTop: 20, color: 'var(--accent)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          Back to login →
        </Link>
      </div>
    </div>
  )

  return (
    <div data-accent="gold" style={{ minHeight: '100vh', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Campus<span style={{ color: 'var(--accent)' }}>Connect</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Your campus. Your community.</p>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, boxShadow: 'var(--shadow)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px' }}>Create your account</h2>

          <GoogleSignInButton label="Sign up with Google" />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>or with email</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {error && (
            <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
                style={inputStyle}
                autoComplete="name"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                autoComplete="email"
              />
            </div>
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              onKeyDown={e => e.key === 'Enter' && handleSignup()}
            />
          </div>

          <button
            onClick={handleSignup}
            disabled={loading}
            style={{ width: '100%', background: loading ? 'var(--disabled)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 20, fontFamily: 'inherit' }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 16, marginBottom: 0 }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
          CampusConnect is an independent student platform, not affiliated with any institution.
        </p>
      </div>
    </div>
  )
}
